import { kv } from '../_kv.js'
import { createLogger, validateId } from '../_shared.js'

export default async function handleMatchStats(req, res) {
  const log = createLogger('/api/tournaments?mode=match-stats')
  const { id: matchId } = req.query
  if (!matchId) return res.status(400).json({ error: 'id required' })
  const idV = validateId(matchId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ error: idV.error })

  const STATS_TTL = 60 * 60 * 24 * 7 // 7 days — only for parsed matches (immutable)
  const STATS_TTL_UNPARSED = 60 * 30  // 30 min — match not yet parsed by OD; retry soon
  const ITEM_MAP_TTL = 60 * 60 * 24  // 24h — item names rarely change
  // v9: added radiantWin — v8-cached entries predate the field.
  const STATS_KV_KEY = `stats:match:v9:${matchId}`
  const ITEM_MAP_KV_KEY = 'opendota:item_map_v2'

  const EMPTY = { radiantGoldAdv: [], players: [], events: [], itemNames: {}, firstBloodTime: null, roshanKills: 0, picksBans: [], radiantWin: null }

  // KV cache hit
  try {
    const cached = await kv.get(STATS_KV_KEY)
    if (cached != null) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json(cached)
    }
  } catch (err) {
    log.warn('KV read failed', { error: err?.message })
  }

  // Fetch item ID → name map (shared across all match-stats calls)
  let itemNames = {}
  try {
    const cachedItems = await kv.get(ITEM_MAP_KV_KEY)
    if (cachedItems != null) {
      itemNames = cachedItems
    } else {
      const itemRes = await fetch('https://api.opendota.com/api/constants/items')
      if (itemRes.ok) {
        const itemData = await itemRes.json()
        // itemData shape: { item_name: { id: N, dname: "Display Name", ... } }
        // Store both the CDN key and the proper display name
        for (const [name, meta] of Object.entries(itemData)) {
          if (meta?.id != null) itemNames[meta.id] = { key: name, dname: meta.dname || name.replace(/_/g, ' ') }
        }
        kv.set(ITEM_MAP_KV_KEY, itemNames, { ex: ITEM_MAP_TTL })
          .catch(err => log.warn('item-map KV write failed', { error: err?.message }))
      }
    }
  } catch (err) {
    log.warn('item map fetch failed', { error: err?.message })
  }

  // Fetch match data from OpenDota
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    let data
    try {
      const fetchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`, { signal: controller.signal })
      if (!fetchRes.ok) {
        log.warn('OpenDota error', { status: fetchRes.status, matchId })
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        return res.status(200).json(EMPTY)
      }
      data = await fetchRes.json()
    } finally {
      clearTimeout(timeout)
    }

    const isRadiantPlayer = (p) => (p.player_slot ?? 0) < 128

    // Filter raw OD teamfights to the 8 most notable by composite score (deaths + gold).
    // Returns normalized events ready to merge into the events array.
    const filterNotableTeamFights = (teamfights) => {
      const MIN_DEATHS   = 3
      const MIN_FLOOR    = 500   // |net gold| floor — filters zero-impact skirmishes
      const MAX_EVENTS   = 8
      const DEATH_WEIGHT = 0.4
      const GOLD_WEIGHT  = 0.6

      const qualifying = (teamfights || [])
        .filter(f => (f.deaths || 0) >= MIN_DEATHS)
        .map(f => {
          const radiantGold = (f.players || []).slice(0, 5).reduce((s, p) => s + (p.gold_delta || 0), 0)
          const direGold    = (f.players || []).slice(5, 10).reduce((s, p) => s + (p.gold_delta || 0), 0)
          return { ...f, _net: radiantGold - direGold }
        })
        .filter(f => Math.abs(f._net) >= MIN_FLOOR)

      if (qualifying.length === 0) return []

      const maxDeaths  = Math.max(...qualifying.map(f => f.deaths))
      const maxNetGold = Math.max(...qualifying.map(f => Math.abs(f._net)))

      return qualifying
        .map(f => ({
          ...f,
          _score: (f.deaths / maxDeaths) * DEATH_WEIGHT
                + (Math.abs(f._net) / maxNetGold) * GOLD_WEIGHT,
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, MAX_EVENTS)
        .map(f => ({
          type: 'teamfight',
          team: f._net >= 0 ? 'radiant' : 'dire',
          time: Math.round(((f.start || 0) + (f.end || f.start || 0)) / 2),
          deaths: f.deaths,
          netGoldDelta: f._net,
        }))
        .sort((a, b) => a.time - b.time)
    }

    // Extract rapier purchases and rampages (5 kills within 30s) for chart markers
    const extractMatchEvents = (players) => {
      const evts = []
      for (const p of players) {
        const team = isRadiantPlayer(p) ? 'radiant' : 'dire'
        const player = p.name || p.personaname || ''
        if (Array.isArray(p.purchase_log)) {
          for (const entry of p.purchase_log) {
            if (entry.key === 'rapier' && typeof entry.time === 'number' && entry.time >= 0) {
              evts.push({ type: 'rapier', team, player, time: entry.time })
            }
          }
        }
        // multi_kills["5"] is the game engine's authoritative rampage count.
        // kills_log is used only to locate the timestamp of each rampage.
        const rampageCount = p.multi_kills?.['5'] || p.multi_kills?.[5] || 0
        if (rampageCount > 0 && Array.isArray(p.kills_log) && p.kills_log.length >= 5) {
          const times = p.kills_log.map(k => k.time).filter(t => typeof t === 'number').sort((a, b) => a - b)
          let found = 0
          let skipUntil = -Infinity
          for (let i = 4; i < times.length && found < rampageCount; i++) {
            if (times[i - 4] <= skipUntil) continue
            let valid = true
            for (let j = 1; j <= 4; j++) {
              if (times[i - 4 + j] - times[i - 4 + j - 1] > 18) { valid = false; break }
            }
            if (valid) {
              evts.push({ type: 'rampage', team, player, time: times[i - 4] })
              skipUntil = times[i]
              found++
            }
          }
        }
      }
      return evts.sort((a, b) => a.time - b.time)
    }

    const stats = {
      radiantGoldAdv: data.radiant_gold_adv ?? [],
      radiantWin: typeof data.radiant_win === 'boolean' ? data.radiant_win : null,
      players: (data.players || []).map(p => ({
        slot: p.player_slot ?? 0,
        heroId: p.hero_id ?? 0,
        name: p.name || p.personaname || '',
        netWorth: p.net_worth ?? 0,
        items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map(v => v ?? 0),
        backpackItems: [p.backpack_0, p.backpack_1, p.backpack_2].map(v => v ?? 0),
        neutralItem: p.item_neutral ?? 0,
        permanentBuffs: (p.permanent_buffs || []).map(b => b.permanent_buff),
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        assists: p.assists ?? 0,
        isRadiant: isRadiantPlayer(p),
      })),
      events: (() => {
        const playerEvents = extractMatchEvents(data.players || [])
        const roshanEvents = (data.objectives || [])
          .filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && typeof o.time === 'number' && o.time >= 0 && (o.team === 2 || o.team === 3))
          .sort((a, b) => a.time - b.time)
          .map((o, idx) => ({ type: 'roshan', time: o.time, team: o.team === 2 ? 'radiant' : 'dire', index: idx + 1 }))
        const teamfightEvents = filterNotableTeamFights(data.teamfights)
        return [...playerEvents, ...roshanEvents, ...teamfightEvents].sort((a, b) => a.time - b.time)
      })(),
      itemNames,
      firstBloodTime: data.first_blood_time ?? null,
      roshanKills: (data.objectives || []).filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL').length,
      picksBans: (data.picks_bans || []).map(p => ({
        isPick: !!p.is_pick,
        heroId: p.hero_id ?? 0,
        team: p.team ?? 0,
        order: p.order ?? 0,
      })),
    }

    // Use short TTL when OD hasn't parsed the replay yet — radiant_gold_adv will be
    // null until parsing completes, which can take hours. Long TTL here would cache
    // the empty gold array for 7 days even after OD finishes parsing.
    const cacheTtl = data.radiant_gold_adv != null ? STATS_TTL : STATS_TTL_UNPARSED
    kv.set(STATS_KV_KEY, stats, { ex: cacheTtl })
      .catch(err => log.warn('KV write failed', { error: err?.message }))

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(stats)
  } catch (err) {
    log.warn('fetch error', { error: err?.message })
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.status(200).json(EMPTY)
  }
}

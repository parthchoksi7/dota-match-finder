import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const OPENDOTA = 'https://api.opendota.com/api'
const PANDASCORE_BASE = 'https://api.pandascore.co'
const TTL = 60 * 60 * 3
const LEAGUES_TTL = 60 * 60 * 24
const HEROES_TTL = 60 * 60 * 24

// Find the OpenDota league whose name best matches the given search string.
// Uses token overlap so "PGL Wallachia Season 7" matches "PGL Wallachia 2026 Season 7".
function findLeague(leagues, search) {
  if (!search || !leagues?.length) return null
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
  const tokens = s => s.toLowerCase().split(/[\s\-_]+/).filter(t => t.length > 1 && !STOP.has(t))
  const searchTokens = new Set(tokens(search))

  let best = null, bestScore = 0
  for (const league of leagues) {
    const lt = tokens(league.name || '')
    const overlap = lt.filter(t => searchTokens.has(t)).length
    if (overlap >= 2 && overlap > bestScore) {
      best = league
      bestScore = overlap
    }
  }
  return best
}

export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  let name = req.query.name || null

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  const KV_KEY = `dota2:tournament_heroes_v7:${id}`

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY).catch(() => {})
  } else {
    try {
      const cached = await kv.get(KV_KEY)
      if (cached) return res.status(200).json(cached)
    } catch {}
  }

  try {
    // If name wasn't passed by the frontend, look it up from PandaScore
    if (!name) {
      const token = process.env.PANDASCORE_TOKEN
      if (token) {
        const tRes = await fetch(`${PANDASCORE_BASE}/tournaments/${id}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        })
        if (tRes.ok) {
          const t = await tRes.json()
          name = t.serie?.full_name || t.serie?.name || t.league?.name || t.name || null
        }
      }
    }

    // Fetch leagues list + hero map in parallel (both long-cached in KV)
    const [leagues, heroMap] = await Promise.all([
      (async () => {
        try { const c = await kv.get('opendota:leagues_v1'); if (c) return c } catch {}
        const r = await fetch(`${OPENDOTA}/leagues`)
        if (!r.ok) return []
        const data = await r.json()
        kv.set('opendota:leagues_v1', data, { ex: LEAGUES_TTL }).catch(() => {})
        return data
      })(),
      (async () => {
        try { const c = await kv.get('opendota:hero_map_v1'); if (c) return c } catch {}
        const r = await fetch(`${OPENDOTA}/heroes`)
        if (!r.ok) return {}
        const heroes = await r.json()
        const map = {}
        for (const h of (heroes || [])) map[h.id] = h.localized_name || h.name
        kv.set('opendota:hero_map_v1', map, { ex: HEROES_TTL }).catch(() => {})
        return map
      })(),
    ])

    const league = findLeague(leagues, name)
    if (!league) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Fetch match list for the league
    const matchListRes = await fetch(`${OPENDOTA}/leagues/${league.leagueid}/matches`)
    if (!matchListRes.ok) return res.status(200).json({ heroes: [], gameCount: 0 })
    const matchList = await matchListRes.json()
    if (!Array.isArray(matchList) || !matchList.length) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Fetch full match details in batches of 10 for picks_bans
    const CONCURRENCY = 10
    const allMatches = []
    for (let i = 0; i < Math.min(matchList.length, 200); i += CONCURRENCY) {
      const batch = matchList.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async m => {
        const r = await fetch(`${OPENDOTA}/matches/${m.match_id}`)
        if (!r.ok) return null
        return r.json()
      }))
      allMatches.push(...results.filter(Boolean))
    }

    const heroStats = {}
    let gameCount = 0

    for (const match of allMatches) {
      if (!match.picks_bans?.length) continue
      gameCount++
      const radiantWin = match.radiant_win

      for (const pb of match.picks_bans) {
        const heroName = heroMap[pb.hero_id]
        if (!heroName) continue
        if (!heroStats[heroName]) heroStats[heroName] = { picks: 0, wins: 0, bans: 0 }

        if (pb.is_pick) {
          heroStats[heroName].picks++
          const won = (pb.team === 0 && radiantWin) || (pb.team === 1 && !radiantWin)
          if (won) heroStats[heroName].wins++
        } else {
          heroStats[heroName].bans++
        }
      }
    }

    const heroes = Object.entries(heroStats)
      .map(([name, s]) => ({
        name,
        picks: s.picks,
        wins: s.wins,
        bans: s.bans,
        contested: s.picks + s.bans,
      }))
      .sort((a, b) => b.contested - a.contested || b.picks - a.picks)

    const payload = { heroes, gameCount, league: league.name }
    const heroesTtl = req.query?.completed === '1' ? 60 * 60 * 24 * 30 : TTL
    kv.set(KV_KEY, payload, { ex: heroesTtl }).catch(() => {})

    return res.status(200).json(payload)
  } catch (err) {
    console.error('Tournament heroes error:', err?.message)
    return res.status(500).json({ error: 'Failed to fetch hero stats' })
  }
}

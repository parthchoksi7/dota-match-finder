import { kv } from '../_kv.js'
import { findLeague, trackError } from '../_shared.js'

export default async function handleTournamentPlayers(req, res) {
  const { id: tournamentId } = req.query
  if (!tournamentId) return res.status(400).json({ error: 'id required' })

  const PLAYERS_TTL = 60 * 60 * 3           // 3h — same as tournament heroes
  const PLAYERS_TTL_COMPLETED = 60 * 60 * 24 * 30  // 30d for completed events
  const LEAGUES_CACHE_TTL = 60 * 60 * 4     // 4h — short enough to pick up new tournaments
  const OPENDOTA_API = 'https://api.opendota.com/api'
  const KV_PLAYERS_KEY = `dota2:tournament_players_v3:${tournamentId}`
  const KV_LEAGUES_KEY = 'opendota:leagues_v2'

  const emptyStats = { kills: [], deaths: [], assists: [], netWorth: [], gpm: [] }

  if (req.query?.bust === '1') {
    await kv.del(KV_PLAYERS_KEY).catch(() => {})
  } else {
    try {
      const cached = await kv.get(KV_PLAYERS_KEY)
      if (cached) {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
        return res.status(200).json(cached)
      }
    } catch {}
  }

  const fetchFreshLeagues = async () => {
    try {
      const r = await fetch(`${OPENDOTA_API}/leagues`)
      if (!r?.ok) return []
      const data = await r.json()
      kv.set(KV_LEAGUES_KEY, data, { ex: LEAGUES_CACHE_TTL }).catch(() => {})
      return data
    } catch { return [] }
  }

  // Unix timestamp lower bound — only include OD matches on/after this date
  let beginAtUnix = null
  if (req.query.begin_at) {
    const t = Math.floor(new Date(req.query.begin_at).getTime() / 1000)
    if (!isNaN(t) && t > 0) beginAtUnix = t
  }

  try {
    let name = req.query.name || null

    // Resolve tournament name and begin_at from PandaScore when either is missing
    if (!name || !beginAtUnix) {
      const token = process.env.PANDASCORE_TOKEN
      if (token) {
        const tRes = await fetch(`https://api.pandascore.co/tournaments/${tournamentId}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        })
        if (tRes.ok) {
          const t = await tRes.json()
          if (!name) name = t.serie?.full_name || t.serie?.name || t.league?.name || t.name || null
          if (!beginAtUnix && t.begin_at) {
            const ts = Math.floor(new Date(t.begin_at).getTime() / 1000)
            if (!isNaN(ts) && ts > 0) beginAtUnix = ts
          }
        }
      }
    }

    // Fetch OD leagues list (cached in KV; bust and retry if findLeague returns null
    // to catch cases where a new tournament was added to OD after the cache was warmed)
    let leagues = await (async () => {
      try { const c = await kv.get(KV_LEAGUES_KEY); if (c) return c } catch {}
      return fetchFreshLeagues()
    })()

    let league = findLeague(leagues, name)
    if (!league && leagues.length > 0) {
      // Cache may be stale — bust it and retry once with fresh OD data
      await kv.del(KV_LEAGUES_KEY).catch(() => {})
      leagues = await fetchFreshLeagues()
      league = findLeague(leagues, name)
    }
    if (!league) {
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json({ stats: emptyStats, gameCount: 0 })
    }

    // Fetch match list for the league
    const matchListRes = await fetch(`${OPENDOTA_API}/leagues/${league.leagueid}/matches`)
    if (!matchListRes.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json({ stats: emptyStats, gameCount: 0 })
    }
    const rawMatchList = await matchListRes.json()
    if (!Array.isArray(rawMatchList) || !rawMatchList.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json({ stats: emptyStats, gameCount: 0 })
    }

    // Pre-filter by tournament start date — the OD league may span multiple seasons
    // (e.g. "BLAST SLAM I" covers S1+). Exclude matches before begin_at.
    // Matches with no start_time are included defensively.
    const matchList = beginAtUnix
      ? rawMatchList.filter(m => !m.start_time || m.start_time >= beginAtUnix)
      : rawMatchList

    if (!matchList.length) {
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json({ stats: emptyStats, gameCount: 0 })
    }

    // Batch-fetch full match data: 10 concurrent, max 60 games, 7s time budget
    const CONCURRENCY = 10
    const MAX_GAMES = 60
    const TIME_BUDGET_MS = 7000
    const fetchStart = Date.now()
    const allMatches = []
    for (let i = 0; i < Math.min(matchList.length, MAX_GAMES); i += CONCURRENCY) {
      if (Date.now() - fetchStart > TIME_BUDGET_MS) break
      const batch = matchList.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async m => {
        const r = await fetch(`${OPENDOTA_API}/matches/${m.match_id}`)
        if (!r.ok) return null
        return r.json()
      }))
      allMatches.push(...results.filter(Boolean))
    }

    // Build leaderboard entries — one per player per game
    const gamesMap = {}   // accountId → total games played in tournament
    const allEntries = []

    for (const match of allMatches) {
      if (!Array.isArray(match.players) || !match.players.length) continue
      const isRadiantPlayer = p => (p.player_slot ?? 0) < 128
      for (const p of match.players) {
        const accountId = p.account_id
        if (!accountId) continue
        gamesMap[accountId] = (gamesMap[accountId] || 0) + 1
        allEntries.push({
          accountId,
          playerName: p.name || p.personaname || '',
          heroId:     p.hero_id ?? 0,
          teamName:   isRadiantPlayer(p) ? (match.radiant_name || '') : (match.dire_name || ''),
          matchId:    match.match_id,
          radiantName: match.radiant_name || '',
          direName:   match.dire_name || '',
          kills:      p.kills ?? 0,
          deaths:     p.deaths ?? 0,
          assists:    p.assists ?? 0,
          netWorth:   p.net_worth ?? 0,
          gpm:        p.gold_per_min ?? 0,
        })
      }
    }

    const top5 = (statKey) =>
      [...allEntries]
        .sort((a, b) => b[statKey] - a[statKey])
        .slice(0, 5)
        .map((e, i) => ({ ...e, value: e[statKey], rank: i + 1, gamesPlayed: gamesMap[e.accountId] || 1 }))

    const stats = {
      kills:    top5('kills'),
      deaths:   top5('deaths'),
      assists:  top5('assists'),
      netWorth: top5('netWorth'),
      gpm:      top5('gpm'),
    }

    const payload = { stats, gameCount: allMatches.length, league: league.name }
    const ttl = req.query?.completed === '1' ? PLAYERS_TTL_COMPLETED : PLAYERS_TTL
    kv.set(KV_PLAYERS_KEY, payload, { ex: ttl }).catch(() => {})

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(payload)
  } catch (err) {
    console.error('tournament-players error:', err?.message)
    await trackError('/api/tournaments?mode=tournament-players', 500, err?.message)
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.status(200).json({ stats: emptyStats, gameCount: 0 })
  }
}

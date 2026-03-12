import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const OPENDOTA = 'https://api.opendota.com/api'
const TTL = 60 * 5           // 5 min for hero stats
const LEAGUES_TTL = 60 * 60 * 24  // 24 h for league list (rarely changes)
const HEROES_TTL = 60 * 60 * 24   // 24 h for hero name map

// Find the OpenDota league whose name best matches the given search string.
// Uses token overlap so "PGL Wallachia Season 7" matches "PGL Wallachia S7 2026".
function findLeague(leagues, search) {
  if (!search || !leagues?.length) return null
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
  const tokens = s => s.toLowerCase().split(/[\s\-_]+/).filter(t => t.length > 1 && !STOP.has(t))
  const searchTokens = new Set(tokens(search))

  let best = null, bestScore = 0
  for (const league of leagues) {
    const lt = tokens(league.name || '')
    const overlap = lt.filter(t => searchTokens.has(t)).length
    // require at least 2 matching tokens and prefer higher overlap
    if (overlap >= 2 && overlap > bestScore) {
      best = league
      bestScore = overlap
    }
  }
  return best
}

export default async function handler(req, res) {
  const { id, name } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

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

  const isDebug = req.query?.debug === '1'

  try {
    // Fetch leagues list + hero map from KV cache or OpenDota
    const [leagues, heroMap] = await Promise.all([
      (async () => {
        try {
          const c = await kv.get('opendota:leagues_v1')
          if (c) return c
        } catch {}
        const r = await fetch(`${OPENDOTA}/leagues`)
        if (!r.ok) return []
        const data = await r.json()
        kv.set('opendota:leagues_v1', data, { ex: LEAGUES_TTL }).catch(() => {})
        return data
      })(),
      (async () => {
        try {
          const c = await kv.get('opendota:hero_map_v1')
          if (c) return c
        } catch {}
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
    if (isDebug && !league) {
      // Show top candidates sorted by token overlap to help diagnose matching failures
      const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
      const tokens = s => s.toLowerCase().split(/[\s\-_]+/).filter(t => t.length > 1 && !STOP.has(t))
      const searchTokens = new Set(tokens(name || ''))
      const scored = (leagues || [])
        .map(l => ({ name: l.name, id: l.leagueid, score: tokens(l.name || '').filter(t => searchTokens.has(t)).length }))
        .filter(l => l.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
      return res.status(200).json({ debug: true, step: 'league', searchedName: name, searchTokens: [...searchTokens], leagueCount: leagues?.length, topCandidates: scored })
    }
    if (!league) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Fetch all matches for this league (returns [{match_id, radiant_win, ...}])
    const matchListRes = await fetch(`${OPENDOTA}/leagues/${league.leagueid}/matches`)
    if (!matchListRes.ok) return res.status(200).json({ heroes: [], gameCount: 0 })
    const matchList = await matchListRes.json()
    if (!Array.isArray(matchList) || !matchList.length) return res.status(200).json({ heroes: [], gameCount: 0 })

    if (isDebug) {
      return res.status(200).json({ debug: true, step: 'matches', league, matchCount: matchList.length, sampleMatch: matchList[0] })
    }

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
      .slice(0, 25)

    const payload = { heroes, gameCount, league: league.name }
    kv.set(KV_KEY, payload, { ex: TTL }).catch(() => {})

    return res.status(200).json(payload)
  } catch (err) {
    console.error('Tournament heroes error:', err?.message)
    return res.status(500).json({ error: 'Failed to fetch hero stats' })
  }
}

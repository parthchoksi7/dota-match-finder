import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const BASE = 'https://api.pandascore.co'
const TTL = 60 * 5 // 5 minutes

export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  const KV_KEY = `dota2:tournament_heroes_v6:${id}`

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY).catch(() => {})
  } else {
    try {
      const cached = await kv.get(KV_KEY)
      if (cached) return res.status(200).json(cached)
    } catch {}
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const isDebug = req.query?.debug === '1'

  try {
    // /tournaments/{id}/brackets returns match objects that already include an
    // embedded `games` array. Sub-endpoints like /dota2/matches/{id}/games are
    // behind a higher-tier plan (403). Use the embedded games directly.
    const bracketsRes = await fetch(`${BASE}/tournaments/${id}/brackets`, { headers })
    if (!bracketsRes.ok) {
      if (isDebug) return res.status(200).json({ debug: true, step: 'brackets', status: bracketsRes.status })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }

    const bracketMatches = await bracketsRes.json()
    if (!Array.isArray(bracketMatches) || !bracketMatches.length) {
      if (isDebug) return res.status(200).json({ debug: true, step: 'brackets', matchCount: 0 })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }

    const finished = bracketMatches.filter(m => m.status === 'finished')
    const allGames = finished.flatMap(m => m.games || [])

    if (isDebug) {
      const withPicksBans = allGames.filter(g => g.picks_bans?.length)
      return res.status(200).json({
        debug: true,
        step: 'done',
        totalMatches: bracketMatches.length,
        finishedMatches: finished.length,
        totalGames: allGames.length,
        gamesWithPicksBans: withPicksBans.length,
        sampleGameKeys: allGames[0] ? Object.keys(allGames[0]) : [],
        samplePicksBans: withPicksBans[0]?.picks_bans?.slice(0, 2) ?? null,
      })
    }

    const heroStats = {}
    let gameCount = 0

    for (const game of allGames) {
      const picksBans = game.picks_bans
      if (!picksBans?.length) continue
      gameCount++

      const winnerTeamId = game.winner?.id

      for (const pb of picksBans) {
        const heroName = pb.hero?.localized_name || pb.hero?.name
        if (!heroName) continue

        if (!heroStats[heroName]) heroStats[heroName] = { picks: 0, wins: 0, bans: 0 }

        if (pb.is_pick) {
          heroStats[heroName].picks++
          if (winnerTeamId && pb.team?.id === winnerTeamId) {
            heroStats[heroName].wins++
          }
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

    const payload = { heroes, gameCount }
    kv.set(KV_KEY, payload, { ex: TTL }).catch(() => {})

    return res.status(200).json(payload)
  } catch (err) {
    console.error('Tournament heroes error:', err?.message)
    return res.status(500).json({ error: 'Failed to fetch hero stats' })
  }
}

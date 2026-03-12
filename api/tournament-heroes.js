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

  const KV_KEY = `dota2:tournament_heroes_v5:${id}`

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
    // Use /tournaments/{id}/brackets — the same endpoint that powers the Schedule tab.
    // This works for both elimination and group stage (Swiss) formats.
    // No dedicated /matches sub-endpoint exists on PandaScore for tournaments.
    const bracketsRes = await fetch(`${BASE}/tournaments/${id}/brackets`, { headers })
    if (!bracketsRes.ok) {
      if (isDebug) return res.status(200).json({ debug: true, step: 'brackets', status: bracketsRes.status })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }

    const bracketMatches = await bracketsRes.json()
    if (!Array.isArray(bracketMatches) || !bracketMatches.length) {
      if (isDebug) return res.status(200).json({ debug: true, step: 'brackets', matchCount: 0, raw: bracketMatches })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }

    // Finished matches only
    const finished = bracketMatches.filter(m => m.status === 'finished')
    if (!finished.length) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Fetch games per match — /dota2/matches/{id}/games includes picks_bans.
    // /dota2/games list endpoint does not exist on PandaScore.
    const matchIds = finished.map(m => m.id)
    const CONCURRENCY = 10
    const allGames = []
    for (let i = 0; i < matchIds.length; i += CONCURRENCY) {
      const batch = matchIds.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async mid => {
        const r = await fetch(`${BASE}/dota2/matches/${mid}/games`, { headers })
        if (!r.ok) return []
        const g = await r.json()
        return Array.isArray(g) ? g : []
      }))
      allGames.push(...results.flat())
    }

    if (isDebug) {
      return res.status(200).json({
        debug: true,
        step: 'games',
        finishedMatches: finished.length,
        gamesFetched: allGames.length,
        gamesWithPicksBans: allGames.filter(g => g.picks_bans?.length).length,
        sampleGame: allGames[0] ?? null,
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

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

  const KV_KEY = `dota2:tournament_heroes_v4:${id}`

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
    // Step 1: fetch the tournament to get its slug (needed for nested endpoints)
    const tRes = await fetch(`${BASE}/tournaments/${id}`, { headers })
    if (!tRes.ok) {
      if (isDebug) return res.status(200).json({ debug: true, step: 'tournament', id, status: tRes.status })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }
    const tournament = await tRes.json()
    const slug = tournament.slug
    if (isDebug && !slug) return res.status(200).json({ debug: true, step: 'tournament', noSlug: true, keys: Object.keys(tournament) })

    // Step 2: fetch finished matches via slug-based endpoint
    const matchesRes = await fetch(
      `${BASE}/dota2/tournaments/${slug}/matches?filter[status]=finished&per_page=100&sort=-begin_at`,
      { headers }
    )
    if (!matchesRes.ok) {
      const text = await matchesRes.text()
      if (isDebug) return res.status(200).json({ debug: true, step: 'matches', slug, status: matchesRes.status, body: text })
      return res.status(200).json({ heroes: [], gameCount: 0 })
    }

    const matches = await matchesRes.json()
    if (isDebug && (!Array.isArray(matches) || !matches.length)) {
      return res.status(200).json({ debug: true, step: 'matches', slug, matchCount: Array.isArray(matches) ? 0 : -1, raw: matches })
    }
    if (!Array.isArray(matches) || !matches.length) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Step 3: collect game IDs embedded in the match objects, then fetch the
    // full game records. The embedded games inside /matches omit picks_bans,
    // but fetching the game directly via filter[id] includes the full data.
    const gameIds = matches.flatMap(m => (m.games || []).map(g => g.id)).filter(Boolean)
    if (isDebug && !gameIds.length) {
      return res.status(200).json({ debug: true, step: 'gameIds', matchCount: matches.length, sampleMatch: matches[0] })
    }
    if (!gameIds.length) return res.status(200).json({ heroes: [], gameCount: 0 })

    // Batch into groups of 50 to avoid overly long URLs
    const BATCH = 50
    const allGames = []
    for (let i = 0; i < gameIds.length; i += BATCH) {
      const batch = gameIds.slice(i, i + BATCH)
      const gamesRes = await fetch(
        `${BASE}/dota2/games?filter[id]=${batch.join(',')}&per_page=50`,
        { headers }
      )
      if (!gamesRes.ok) continue
      const games = await gamesRes.json()
      if (Array.isArray(games)) allGames.push(...games)
    }

    if (isDebug) {
      return res.status(200).json({
        debug: true,
        step: 'games',
        matchCount: matches.length,
        gameIdCount: gameIds.length,
        gamesFetched: allGames.length,
        gamesWithPicksBans: allGames.filter(g => g.picks_bans?.length).length,
        sampleGame: allGames[0] ?? null,
      })
    }

    const heroStats = {} // { heroName: { picks, wins, bans } }
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

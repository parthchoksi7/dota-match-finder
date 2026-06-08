import { kv } from '../_kv.js'
import { trackError } from '../_shared.js'

export default async function handleHeroMatches(req, res) {
  const heroId = parseInt(req.query?.hero_id, 10)
  if (!heroId || isNaN(heroId)) {
    return res.status(400).json({ error: 'hero_id required' })
  }

  const cursorParam = req.query?.cursor ? parseInt(req.query.cursor, 10) : null
  const cursor = cursorParam || Math.floor(Date.now() / 1000)

  const cursorBucket = Math.floor(cursor / 86400)
  const cacheKey = `hero:matches:v1:${heroId}:${cursorBucket}`

  if (req.query?.bust !== '1') {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800')
        return res.status(200).json({ ...cached, cached: true })
      }
    } catch (e) {
      console.warn('[hero-matches] KV read failed:', e?.message)
    }
  }

  // Build ILIKE conditions from the same keywords used across the codebase for tier-1 filtering.
  // hero_id and cursor are parseInt-validated integers — no user strings in SQL.
  const EXPLORER_TIER1_KEYWORDS = ['dreamleague', 'pgl', 'esl one', 'blast', 'weplay', 'the international', 'riyadh']
  const likeConditions = EXPLORER_TIER1_KEYWORDS
    .map(k => `LOWER(leagues.name) LIKE '%${k}%'`)
    .join(' OR ')

  const sql = `SELECT matches.match_id, matches.start_time, matches.radiant_win, leagues.name AS league_name, rt.name AS radiant_name, dt.name AS dire_name FROM matches JOIN picks_bans ON matches.match_id = picks_bans.match_id JOIN leagues ON matches.leagueid = leagues.leagueid JOIN teams rt ON matches.radiant_team_id = rt.team_id JOIN teams dt ON matches.dire_team_id = dt.team_id WHERE picks_bans.hero_id = ${heroId} AND picks_bans.is_pick = true AND matches.start_time < ${cursor} AND (${likeConditions}) ORDER BY matches.start_time DESC LIMIT 100`

  try {
    const explorerRes = await fetch(`https://api.opendota.com/api/explorer?sql=${encodeURIComponent(sql)}`)
    if (!explorerRes.ok) throw new Error(`Explorer HTTP ${explorerRes.status}`)
    const data = await explorerRes.json()
    if (data.err) throw new Error(`Explorer error: ${data.err}`)

    const rows = (data.rows || []).map(r => ({
      match_id: String(r.match_id),
      start_time: Number(r.start_time),
      radiant_win: Boolean(r.radiant_win),
      league_name: r.league_name || '',
      radiant_name: r.radiant_name || 'Radiant',
      dire_name: r.dire_name || 'Dire',
    }))

    const exhausted = rows.length < 100
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].start_time : null
    const result = { rows, exhausted, cursor: nextCursor }

    kv.set(cacheKey, result, { ex: 900 }).catch(e => console.warn('[hero-matches] KV write failed:', e?.message))

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800')
    return res.status(200).json(result)
  } catch (err) {
    console.error('[hero-matches] Explorer error:', err?.message)
    await trackError('/api/tournaments?mode=hero-matches', 500, err?.message)
    return res.status(500).json({ error: 'Hero match lookup failed', message: err?.message })
  }
}

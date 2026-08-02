import { kv } from '../_kv.js'
import { createLogger, validateId } from '../_shared.js'
import { fetchStratzMatchEnrichment, stratzPositionNumber, stratzPositionLabel, stratzAwardLabel } from '../_stratz.js'

// Deliberately a separate endpoint from ?mode=match-stats: STRATZ is a second,
// independently-rate-limited data source (150/min, one request per match — no batch
// endpoint, see .claude/specs/stratz-api-audit.md), fetched in parallel by the client so a
// cold-cache STRATZ round trip never adds latency to the already-working OD stats path.
const STRATZ_TTL_FOUND = 60 * 60 * 24 * 7 // 7 days — immutable once STRATZ has indexed the match
const STRATZ_TTL_MISS = 60 * 30           // 30 min — not indexed yet / rate-limited; retry soon
const STRATZ_KV_PREFIX = 'stratz:match:v1:'
const STRATZ_MISS_MARKER = 'MISS'

export default async function handleMatchStratz(req, res) {
  const log = createLogger('/api/tournaments?mode=match-stratz')
  const { id: matchId } = req.query
  if (!matchId) return res.status(400).json({ error: 'id required' })
  const idV = validateId(matchId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ error: idV.error })

  const key = `${STRATZ_KV_PREFIX}${matchId}`

  // Cache read and the live fetch are deliberately separate try/catch blocks (same
  // pattern as matchStats.js) — a KV read failure must still fall through to a live
  // STRATZ fetch, not silently return empty players for the whole 8s timeout budget.
  let cached = null
  try {
    cached = await kv.get(key)
  } catch (err) {
    log.warn('STRATZ KV read failed', { error: err?.message })
  }

  let rawPlayers
  if (cached != null) {
    rawPlayers = cached === STRATZ_MISS_MARKER ? null : cached
  } else {
    rawPlayers = await fetchStratzMatchEnrichment(matchId)
    if (!rawPlayers) log.warn('STRATZ enrichment unavailable', { matchId })
    // STRATZ can return a match record (heroIds resolved) before it has finished
    // post-game processing — position/role/imp/award all come back null in that case.
    // Treat that the same as a true miss (short retry TTL) rather than caching an
    // empty-looking result for 7 days, or the badges would never appear once STRATZ
    // does finish processing.
    const isUnprocessed = rawPlayers != null && rawPlayers.every(
      p => p && p.position == null && p.role == null && p.imp == null && p.award == null
    )
    const isMiss = !rawPlayers || isUnprocessed
    if (isUnprocessed) log.warn('STRATZ match not yet processed', { matchId })
    kv.set(key, isMiss ? STRATZ_MISS_MARKER : rawPlayers, { ex: isMiss ? STRATZ_TTL_MISS : STRATZ_TTL_FOUND })
      .catch(err => log.warn('STRATZ KV write failed', { error: err?.message }))
    if (isUnprocessed) rawPlayers = null
  }

  // Merge key on the client is heroId — a hero can only be picked once per match, so
  // it's a reliable join even when a player's Steam profile is private. Wrapped in its
  // own try/catch: a malformed element (e.g. STRATZ returning a null player) must not
  // throw uncaught, especially since a bad response is already written to KV with the
  // 7-day TTL by the time this runs — an uncaught throw here would keep 500ing on that
  // same cached response for the full week instead of degrading to empty players.
  let players = []
  try {
    players = (rawPlayers || []).map(p => ({
      heroId: p.heroId,
      position: stratzPositionNumber(p.position),
      positionLabel: stratzPositionLabel(p.position, p.role),
      imp: typeof p.imp === 'number' ? p.imp : null,
      award: stratzAwardLabel(p.award),
    }))
  } catch (err) {
    log.warn('STRATZ response shaping failed', { error: err?.message })
    players = []
  }

  // Short cache when there's nothing to show yet — matches the 30-min KV retry budget
  // above (STRATZ_TTL_MISS), so a CDN edge can't hold an empty response longer than the
  // point at which a real result might already be available.
  res.setHeader('Cache-Control', players.length > 0
    ? 'public, s-maxage=3600, stale-while-revalidate=86400'
    : 'public, s-maxage=60')
  return res.status(200).json({ players })
}

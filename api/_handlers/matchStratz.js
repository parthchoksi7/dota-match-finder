import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
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

  if (req.query?.bust === '1') {
    try { await kv.del(key) } catch (err) { log.warn('STRATZ KV bust failed', { error: err?.message }) }
  }

  // Cache read and the live fetch are deliberately separate try/catch blocks (same
  // pattern as matchStats.js) — a KV read failure must still fall through to a live
  // STRATZ fetch, not silently return empty players for the whole 8s timeout budget.
  let cached = null
  try {
    cached = req.query?.bust === '1' ? null : await kv.get(key)
  } catch (err) {
    log.warn('STRATZ KV read failed', { error: err?.message })
  }

  let rawPlayers
  if (cached != null) {
    rawPlayers = cached === STRATZ_MISS_MARKER ? null : cached
  } else {
    // Durable fallback beneath the KV cache: STRATZ's token is IP-locked (confirmed
    // live — some requests 403 depending on which Vercel egress IP serves them), so a
    // live fetch succeeding is a coin flip even for a fully-processed match. Once a
    // fetch DOES succeed, the result is permanent (match data never changes), so check
    // Supabase before spending another live attempt against the IP lock.
    let fromDb = null
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('stratz_match_enrichment')
        .select('players')
        .eq('od_match_id', Number(matchId))
        .maybeSingle()
      if (error) log.warn('Supabase STRATZ read failed', { error: error.message, matchId })
      else if (data) fromDb = data.players
    } catch (err) {
      log.warn('Supabase STRATZ read failed', { error: err?.message, matchId })
    }

    if (fromDb) {
      rawPlayers = fromDb
      kv.set(key, rawPlayers, { ex: STRATZ_TTL_FOUND })
        .catch(err => log.warn('STRATZ KV write failed', { error: err?.message }))
    } else {
      rawPlayers = await fetchStratzMatchEnrichment(matchId)
      if (!rawPlayers) log.warn('STRATZ enrichment unavailable', { matchId })
      // STRATZ can return a match record before it has finished post-game processing.
      // Observed live (2026-08-13, match 8942262723): position/role can resolve on their
      // own pass BEFORE imp does, so position != null is not proof of a complete result —
      // only imp (a real number for every player once STRATZ is done) is. Gate on imp
      // alone, not "all four fields null": award legitimately stays null for most players
      // in a fully-processed match (only one player gets MVP), so it can't be part of the
      // gate either. ANY player missing imp marks the whole response unprocessed, not just
      // "all players missing imp" — a partial result (e.g. 9/10 resolved) is exactly as
      // unsafe to permanently cache as a fully-null one, since the Supabase-hit path never
      // re-checks a stored result. Treat an unprocessed result the same as a true miss
      // (short retry TTL, never written to the permanent Supabase store) rather than
      // caching a half-finished result for 7 days — or, worse, forever.
      const isUnprocessed = rawPlayers != null && rawPlayers.some(p => !p || p.imp == null)
      const isMiss = !rawPlayers || isUnprocessed
      if (isUnprocessed) log.warn('STRATZ match not yet processed', { matchId })
      kv.set(key, isMiss ? STRATZ_MISS_MARKER : rawPlayers, { ex: isMiss ? STRATZ_TTL_MISS : STRATZ_TTL_FOUND })
        .catch(err => log.warn('STRATZ KV write failed', { error: err?.message }))
      // Only a real result is worth persisting forever — a miss/unprocessed result
      // isn't a fact about the match, it's "STRATZ didn't answer this time." Awaited
      // (unlike the KV write above, which is deliberately fire-and-forget for latency):
      // losing this write defeats the entire point of the permanent cache, whereas losing
      // a duplicate KV write is harmless since the next request just repeats it. try/catch
      // (not just checking `.error`) because getSupabaseAdmin()'s lazy client construction
      // can itself throw — that must not lose an already-fetched, already-good result.
      if (!isMiss) {
        try {
          const { error: dbErr } = await getSupabaseAdmin()
            .from('stratz_match_enrichment')
            .upsert({ od_match_id: Number(matchId), players: rawPlayers }, { onConflict: 'od_match_id' })
          if (dbErr) log.warn('Supabase STRATZ write failed', { error: dbErr.message, matchId })
        } catch (err) {
          log.warn('Supabase STRATZ write failed', { error: err?.message, matchId })
        }
      }
      if (isUnprocessed) rawPlayers = null
    }
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

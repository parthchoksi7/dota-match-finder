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

/**
 * Is this a FULLY processed STRATZ result — i.e. safe to cache forever?
 *
 * Gated on `imp` alone, for every player. Observed live (2026-08-13, match 8942262723):
 * STRATZ resolves position/role on an earlier pass than imp, so `position != null` is not
 * proof of a finished result. `award` can't be part of the gate either — it legitimately
 * stays null for 9 of 10 players in a complete match. ANY player missing imp means the
 * result is still settling, so it must not reach the permanent store (which is never
 * re-checked once written).
 *
 * This answers ONLY "may this be persisted forever?" — deliberately NOT "may this be
 * shown?". Conflating the two is what broke the feature outright (see the header comment
 * on the partial-result branch below): a single null imp among ten players was blanking
 * position labels and MVP badges for the whole match.
 *
 * `length > 0` guard: `[].every()` is vacuously true, and an empty array must never be
 * mistaken for a complete result and written to Supabase permanently.
 */
function isCompleteEnrichment(rawPlayers) {
  return Array.isArray(rawPlayers)
    && rawPlayers.length > 0
    && rawPlayers.every(p => p && p.imp != null)
}

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

    // Non-empty check, not just truthiness: `[]` is truthy, and because this branch skips
    // the live fetch entirely, an empty stored row would shadow STRATZ forever. Nothing
    // writes `[]` today (isCompleteEnrichment requires length > 0), so this only guards
    // against a row left by an older build or inserted by hand.
    if (Array.isArray(fromDb) && fromDb.length > 0) {
      rawPlayers = fromDb
      // Only complete results are ever written to Supabase, so this is the 7-day TTL in
      // practice. Still derived rather than assumed, so a row written by an older build
      // (or by hand) can't get promoted to the long TTL without meeting the bar.
      kv.set(key, rawPlayers, { ex: isCompleteEnrichment(rawPlayers) ? STRATZ_TTL_FOUND : STRATZ_TTL_MISS })
        .catch(err => log.warn('STRATZ KV write failed', { error: err?.message }))
    } else {
      rawPlayers = await fetchStratzMatchEnrichment(matchId)
      if (!rawPlayers) log.warn('STRATZ enrichment unavailable', { matchId })
      // An incomplete result is still a SHOWABLE result. This is the distinction that was
      // missing before (fixed 2026-08-14): a partial response used to be nulled out
      // wholesale, so one player's unresolved imp erased the position labels, MVP badge and
      // the other nine impact scores — and, because the permanent-store write is gated on
      // the same flag, nothing was ever persisted either. Every TI2026 match sat in that
      // state, which is why the table stayed empty and no match ever showed enrichment.
      //
      // The two decisions are now independent:
      //   - show it        → always, whatever STRATZ actually returned
      //   - keep it 7 days → only when complete; otherwise the 30-min retry TTL
      //   - keep it FOREVER→ only when complete (permanent store is never re-checked)
      //
      // Partial results go into KV as themselves rather than as the MISS marker, so the
      // next request inside the retry window still renders what we have instead of a blank
      // match. The client tolerates every field being null (PlayerStatsSection guards
      // `imp != null`, PositionBadge returns null without a label), so an all-null result
      // is visually identical to no result — never a broken-looking one.
      const complete = isCompleteEnrichment(rawPlayers)
      // withImp/total are load-bearing diagnostics, not decoration. The open question this
      // fix could NOT answer offline (the IP lock blocks local STRATZ calls) is whether
      // STRATZ computes `imp` for TI2026 matches at all. withImp:0 holding at 0 on matches
      // that are hours old means it never lands for these leagues — in which case the
      // permanent store will stay empty even now, and the persistence gate (not the display
      // path) is what needs revisiting. A climbing withImp means it's just slow to settle.
      if (rawPlayers && !complete) {
        log.warn('STRATZ enrichment incomplete — serving partial, will retry', {
          matchId,
          withImp: rawPlayers.filter(p => p && p.imp != null).length,
          total: rawPlayers.length,
        })
      }
      kv.set(key, rawPlayers ?? STRATZ_MISS_MARKER, { ex: complete ? STRATZ_TTL_FOUND : STRATZ_TTL_MISS })
        .catch(err => log.warn('STRATZ KV write failed', { error: err?.message }))
      // Only a real result is worth persisting forever — a miss/unprocessed result
      // isn't a fact about the match, it's "STRATZ didn't answer this time." Awaited
      // (unlike the KV write above, which is deliberately fire-and-forget for latency):
      // losing this write defeats the entire point of the permanent cache, whereas losing
      // a duplicate KV write is harmless since the next request just repeats it. try/catch
      // (not just checking `.error`) because getSupabaseAdmin()'s lazy client construction
      // can itself throw — that must not lose an already-fetched, already-good result.
      if (complete) {
        try {
          const { error: dbErr } = await getSupabaseAdmin()
            .from('stratz_match_enrichment')
            .upsert({ od_match_id: Number(matchId), players: rawPlayers }, { onConflict: 'od_match_id' })
          if (dbErr) log.warn('Supabase STRATZ write failed', { error: dbErr.message, matchId })
        } catch (err) {
          log.warn('Supabase STRATZ write failed', { error: err?.message, matchId })
        }
      }
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
    // filter(Boolean) before map: a null element used to throw the whole shaping step into
    // the catch below and degrade the entire match to empty players. Dropping just the bad
    // element keeps the other nine. Note this runs AFTER isCompleteEnrichment(), which
    // counts a null element as incomplete — so a response with holes is served but never
    // permanently stored.
    players = (rawPlayers || []).filter(Boolean).map(p => ({
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

  // Keyed on completeness, not on players.length: now that partial results are served
  // rather than blanked, a non-empty response is no longer proof of a finished one. Caching
  // a partial result for an hour (+24h stale-while-revalidate) would park it at the edge
  // long past the 30-min KV retry that exists to replace it.
  //
  // ?bust=1 must bypass the shared cache entirely. Vercel's CDN keys on the full URL,
  // bust=1 included, so the bust response was itself being cached — a second bust inside
  // the window returned the edge copy and never reached the origin, making manual
  // invalidation silently do nothing (observed while debugging this: repeated bust calls
  // logged cache=HIT with no serverless invocation at all).
  if (req.query?.bust === '1') {
    res.setHeader('Cache-Control', 'no-store')
  } else {
    res.setHeader('Cache-Control', isCompleteEnrichment(rawPlayers)
      ? 'public, s-maxage=3600, stale-while-revalidate=86400'
      : 'public, s-maxage=60')
  }
  return res.status(200).json({ players })
}

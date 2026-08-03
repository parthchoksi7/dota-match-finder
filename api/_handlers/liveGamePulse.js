import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
import { createLogger, validateId, findOdMatchByTime, OD_MATCH_TIME_WINDOW_S } from '../_shared.js'
import { fetchPsMatchDetail, beginAtToUnix, shapeLiveGameMapRows } from './liveSeriesGames.js'
import { decodeBuildingState } from '../_buildingState.js'
import { resolveRadiantSide } from '../../src/teamMatching.js'
import { captureOdLiveOnce } from './liveOdCapture.js'

// Phase 2 — live pulse. Given a PandaScore series match id, resolves the CURRENTLY RUNNING
// game to its OpenDota telemetry (gold lead, kill score, live draft) via live_game_map — the
// same fuzzy team+time correlation the finished-game resolver uses, applied to the running
// game instead. Never authoritative, never written anywhere: this is a read-only pulse for
// display, not an id resolution that feeds the locked KV.

// Concurrency cache for the WHOLE resolved payload (correlation + both Supabase reads), same
// purpose and TTL as fetchPsMatchDetail's PS_MATCH_DETAIL_CACHE_TTL_S: many viewers can have the
// same live series open, each self-polling every 20s — without this, a popular series fans out to
// one full resolve (PS fetch + 1-2 Supabase queries) per viewer per poll. 15s < the 20s poll
// interval, so a single returning client always forces a fresh resolve; only genuinely concurrent
// callers within the same window get collapsed. The {pulse: null} "nothing live" result is cached
// too, for the same reason — a series with no running game shouldn't hammer the resolver either.
const PULSE_CACHE_TTL_S = 15
// Live Story Phase B: caps the live gold-graph history returned per request. At the capture's
// effective ~60s cadence (LOCK_TTL_S in liveOdCapture.js) even a long 2-hour game is ~120 points;
// 150 leaves headroom above that without risking an unbounded response for a pathological
// long-running/stuck game. Re-check this constant if the capture cadence changes again — it's
// derived from that value, not independent of it. Exported so its own test derives expectations
// from the real value instead of a duplicated magic number that can silently drift from it (as
// happened here once already, when the capture cadence changed but this constant didn't).
export const GOLD_HISTORY_MAX_POINTS = 150

// Live Story Phase B: shapes live_game_gold rows into the live gold-graph's timeseries payload.
// Dedups by game_time keeping the latest captured_at (the (od_match_id, game_time) unique
// constraint already guarantees this at write time via insert-ignore, but staying defensive here
// costs nothing and doesn't assume that invariant holds forever). Drops draft-phase points
// (game_time < 0, no net worth to plot yet) and any point that never got a lead reading. Caps to
// the most RECENT GOLD_HISTORY_MAX_POINTS after sorting, not an arbitrary slice, so a graph never
// silently drops its tail on an unusually long game. Exported for unit testing.
export function shapeGoldHistory(rows) {
  if (!Array.isArray(rows)) return []
  const byTime = new Map()
  for (const r of rows) {
    if (!r || r.game_time == null || r.game_time < 0 || r.radiant_lead == null) continue
    const existing = byTime.get(r.game_time)
    if (!existing || (r.captured_at || '') > (existing.captured_at || '')) byTime.set(r.game_time, r)
  }
  return [...byTime.values()]
    .sort((a, b) => a.game_time - b.game_time)
    .slice(-GOLD_HISTORY_MAX_POINTS)
    .map(r => ({ t: r.game_time, lead: r.radiant_lead, rk: r.radiant_score, dk: r.dire_score }))
}

// Resolves the pulse (+ owner-gated history) without touching the response object — split out
// from the handler so every exit path funnels through one cache-write site instead of duplicating
// it at each early return. Exported for unit testing the owner gate itself (the property that
// `history` never reaches a non-owner result).
export async function resolvePulse(pandaId, isOwner, log) {
  try {
    const detail = await fetchPsMatchDetail(pandaId, log)
    if (!detail) return { pulse: null }

    const opponents = detail.opponents || []
    const running = (detail.games || []).find(g => g.status === 'running')
    if (!running) return { pulse: null }

    const beginAtUnix = beginAtToUnix(running.begin_at)
    if (!beginAtUnix) return { pulse: null }

    // Same disambiguation guard as the finished-game resolver: without both team names,
    // a live_game_map hit would degrade to pure nearest-time and could bind an unrelated game.
    const names = opponents.map(o => o?.opponent?.name).filter(Boolean)
    if (names.length < 2) return { pulse: null }

    const { data, error } = await getSupabaseAdmin()
      .from('live_game_map')
      .select('od_match_id, start_time, radiant_name, dire_name, radiant_lead, radiant_score, dire_score, game_time, radiant_hero_ids, dire_hero_ids, radiant_player_names, dire_player_names, captured_at, building_state')
      .gte('start_time', beginAtUnix - OD_MATCH_TIME_WINDOW_S)
      .lte('start_time', beginAtUnix + OD_MATCH_TIME_WINDOW_S)
    if (error || !data || data.length === 0) return { pulse: null }

    const hit = findOdMatchByTime(shapeLiveGameMapRows(data), beginAtUnix, opponents)
    if (!hit) return { pulse: null }
    const row = data.find(r => Number(r.od_match_id) === hit.match_id)
    if (!row) return { pulse: null }

    // Never render raw OpenDota team names here — resolve which already-trusted PandaScore
    // opponent name was Radiant for this specific game (same pattern as resolveWinnerName /
    // SeriesGameWinnerName.jsx) so the live pulse always shows the PS name, not OD's. Falls back
    // to the raw OD names only in the rare case the pairing can't be cleanly resolved (missing
    // name or an ambiguous double-match) — a name is better than a blank live-pulse header.
    const psNameA = opponents[0]?.opponent?.name
    const psNameB = opponents[1]?.opponent?.name
    const side = resolveRadiantSide(psNameA, psNameB, row.radiant_name, row.dire_name)
    const radiantName = side === 'A' ? psNameA : side === 'B' ? psNameB : row.radiant_name
    const direName = side === 'A' ? psNameB : side === 'B' ? psNameA : row.dire_name

    const pulse = {
      matchId: String(row.od_match_id),
      radiantName,
      direName,
      radiantLead: row.radiant_lead,
      radiantScore: row.radiant_score,
      direScore: row.dire_score,
      gameTime: row.game_time,
      radiantHeroIds: row.radiant_hero_ids || [],
      direHeroIds: row.dire_hero_ids || [],
      // Index-aligned with the hero-id arrays above (2026-07-19 migration, scripts/create-live-game-map.sql).
      // Rows captured before the migration (or before their next capture cycle) simply read back null here —
      // same degrade-safe pattern as radiant_hero_ids/dire_hero_ids when those were first added.
      radiantPlayerNames: row.radiant_player_names || [],
      direPlayerNames: row.dire_player_names || [],
      capturedAt: row.captured_at,
    }

    // Live Story Phase B, owner-only during the pre-launch window (same non-cryptographic
    // client-flag gate as every other owner-only feature in this codebase — Draft X/Reddit posts,
    // the companion's own build window — not a security boundary, a staged-rollout flag). A
    // failure here must never invalidate the pulse itself, which is already fully resolved and
    // more important than the graph enrichment. Own try/catch (not the outer one shared with the
    // primary resolve above): supabase-js doesn't throw by default today, but that's a library
    // default, not something this function should structurally depend on — a future
    // `.throwOnError()` (here or anywhere upstream) must not turn a working pulse into
    // `{ pulse: null }` just because the unlaunched history enrichment hiccuped.
    if (isOwner) {
      try {
        const { data: goldRows, error: goldErr } = await getSupabaseAdmin()
          .from('live_game_gold')
          .select('game_time, radiant_lead, radiant_score, dire_score, captured_at')
          .eq('od_match_id', row.od_match_id)
        if (goldErr) {
          log.warn('live_game_gold history read failed', { error: goldErr.message })
        } else {
          pulse.history = shapeGoldHistory(goldRows)
        }
      } catch (err) {
        log.warn('live_game_gold history read threw', { error: err?.message })
      }

      // Live Story R4 (Phase C), same owner-payload gate and rationale as `history` above —
      // decode is server-side and confidence-gated (api/_buildingState.js), so `objectives` is
      // attached only when both isOwner AND the decode is 'high' confidence; a 'low' decode
      // (missing/implausible building_state) omits the field entirely rather than shipping a
      // guessed count. No extra I/O here: building_state already rode the main select above.
      // building_state is a bigint column (same class as od_match_id, coerced the same way
      // elsewhere in this file/liveSeriesGames.js) -- PostgREST can hand bigint back as a
      // string, and decodeBuildingState's Number.isFinite gate does not coerce.
      const decoded = decodeBuildingState(Number(row.building_state))
      if (decoded.confidence === 'high') {
        // Per-lane [top, mid, bot] standing-tower counts (0-3 each) — deliberately no
        // barracks/tier-4/Ancient fields; those are not derivable from this data source (see
        // api/_buildingState.js). Never add them here even as null placeholders — the frontend
        // map (DotaMinimap.jsx) treats their absence as "draw nothing," not "draw destroyed."
        pulse.objectives = { radiant: decoded.radiant, dire: decoded.dire }
      }
    }

    return { pulse }
  } catch (err) {
    log.warn('pulse resolve failed', { error: err?.message })
    return { pulse: null }
  }
}

export default async function handleLiveGamePulse(req, res) {
  const log = createLogger('/api/tournaments?mode=live-game-pulse')
  res.setHeader('Cache-Control', 'private, no-store')
  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ pulse: null })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ pulse: null })

  const isOwner = req.query?.owner === '1'
  // Owner status is baked into the cache key itself so a public request can never be served a
  // cached response that was resolved (and cached) for an owner request carrying `history`.
  const cacheKey = `live:pulse:v1:${pandaId}${isOwner ? ':owner' : ''}`

  try {
    const cached = await kv.get(cacheKey)
    if (cached) return res.status(200).json(cached)
  } catch (err) {
    log.warn('pulse cache read failed', { pandaId, error: err?.message })
  }

  // Nudge the OD /live capture before resolving, same as SeriesLivePulse.jsx's 20s poll used to
  // do via its own separate `?mode=od-live-capture` fetch (removed 2026-08-02) — folded in here so
  // that hot path costs one serverless invocation per tick instead of two. Only runs on a pulse-
  // cache miss: the capture itself is independently throttled to ~1/60s by its own KV lock
  // (LOCK_TTL_S in liveOdCapture.js) regardless of caller count, so skipping the attempt on a
  // cache hit (another viewer of the same series resolved within the last PULSE_CACHE_TTL_S)
  // never changes the actual OD-fetch cadence, only avoids a redundant lock-check round trip. Own
  // logger (not this handler's `log`) so capture log lines stay attributed to the capture endpoint,
  // matching what they read as when triggered by the standalone `?mode=od-live-capture` caller.
  // captureOdLiveOnce never throws (fully fail-open internally) — the .catch() here is defensive
  // only, matching this file's existing "own try/catch, never let a side-effect block the pulse"
  // convention (see the live_game_gold history read below).
  await captureOdLiveOnce(createLogger('/api/tournaments?mode=od-live-capture')).catch(() => {})

  const result = await resolvePulse(pandaId, isOwner, log)

  // Own try/catch (not just the .catch() on the promise): a synchronous throw from kv.set()
  // itself must never prevent the already-resolved result from reaching the client.
  try {
    kv.set(cacheKey, result, { ex: PULSE_CACHE_TTL_S })
      .catch(err => log.warn('pulse cache write failed', { pandaId, error: err?.message }))
  } catch (err) {
    log.warn('pulse cache write failed', { pandaId, error: err?.message })
  }

  return res.status(200).json(result)
}

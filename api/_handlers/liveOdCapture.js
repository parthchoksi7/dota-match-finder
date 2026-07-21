import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
import { createLogger } from '../_shared.js'

// Phase 0a — OpenDota /live capture.
//
// Snapshots currently-live professional-league games from OpenDota's /api/live into the
// `live_game_map` table so the resolver can recover a finished game's OpenDota
// match_id mid-series — DURING the running window, before /promatches indexes the
// game (30–90 min lag) and after PandaScore clears external_identifier at game end.
//
// This is a SECOND, independent capture source from PandaScore's external_identifier:
// it reads OpenDota only and writes only `live_game_map`. It NEVER touches the LOCKED
// VOD stream cache (live-matches.js `cacheRunningStreams`, `live:game:` KV, or
// `stream:match:`). Correlation to a PandaScore game happens later, at resolve time,
// via findOdMatchByTime() — not here.
//
// Trigger: the live-sheet pulse (SeriesLivePulse) fires this every 20s while a live series is
// open, and App.jsx's ambient 2-min live poll fires it too (both 0 QStash cost); a */15 QStash
// backstop covers no-user windows. The KV lock below is the real cadence control and doubles as
// abuse protection: however many callers hit this, at most one OpenDota /live fetch runs per
// LOCK_TTL_S. So the EFFECTIVE cadence is ~LOCK_TTL_S while any live sheet is open (the 20s pulse
// out-paces the lock), and ~2 min when only the ambient poll triggers it (that poll's own rate is
// then the floor, below the lock). The endpoint is intentionally unauthenticated
// (idempotent, throttled, no user input, no sensitive data) — like promatches-proxy.
//
// Phase 2 addition: also captures each side's live hero picks (players[].hero_id, split by
// players[].team) so the resolver can serve a "live pulse" (gold lead/score/draft) for the
// CURRENTLY RUNNING game, not just recover ids for finished ones. 2026-07-19: also captures each
// side's live player names (players[].name) alongside the hero ids, index-aligned, so the pulse
// can show hero + pro name per pick instead of hero-only (requires scripts/create-live-game-map.sql's
// 2026-07-19 migration to have been run — new columns read as null until then, same degrade-safe
// pattern as every other additive column in this table).
//
// R4 addition (2026-07-19): also captures the raw building_state (bitmask of standing buildings)
// and spectators count for a future objective/map-state readout ("how close is this to ending"),
// stored UNDECODED — the bit layout is decoded at read time only after the R4.0 verification spike
// confirms it, never here. Same additive-column, null-until-recaptured pattern as the fields above.

const OD_LIVE_URL = 'https://api.opendota.com/api/live'
const LOCK_KEY = 'capture:od-live:lock'
const LOCK_TTL_S = 60 // throttle ceiling, never released — the TTL IS the cadence whenever a caller polls faster than it (the live-sheet pulse fires every 20s); the trigger's own rate floors it otherwise.

// Splits a /live `players` array into each side's hero_id picks AND player names by `team`
// (0=Radiant, 1=Dire — confirmed empirically 2026-07-16: every live league game splits players
// 5/5 across exactly these two values, consistent with isRadiant derivation used everywhere else
// in this codebase). Missing/malformed players -> empty arrays. hero_id 0 (still picking) is kept
// as-is; the frontend already renders a placeholder tile for hero 0/unknown, same as the
// finished-game draft strip. names[i] stays index-aligned with heroIds[i] (same player, same
// position) so the frontend can zip hero + player together per pick; a missing/blank live IGN
// (verified present on all 10 players of a real live game 2026-07-19, but not guaranteed — e.g.
// OD hasn't resolved the pro identity yet) is kept as null, never an empty string, so the frontend
// can tell "no data yet" apart from an actually-empty name.
function splitLivePicks(players) {
  const list = Array.isArray(players) ? players : []
  const radiant = { heroIds: [], names: [] }
  const dire = { heroIds: [], names: [] }
  for (const p of list) {
    if (!p) continue
    const bucket = p.team === 0 ? radiant : p.team === 1 ? dire : null
    if (!bucket) continue
    bucket.heroIds.push(p.hero_id)
    bucket.names.push(p.name || null)
  }
  return { radiant, dire }
}

// Keep only league games with a real OpenDota match id and both team names — the only rows
// the resolver can team-match. Pubs report league_id 0. We deliberately do NOT narrow to
// tier-1: /live exposes league_id but not the league NAME, so the app's tier-1-by-name rule
// can't be applied here, and OD's premium-id set would drop legit tier-1-by-name events.
// Extra non-tier-1 rows are inert — the resolver only correlates against tier-1 PandaScore
// series, and fuzzy hits are never written back to the KV. Exported for unit testing.
export function mapLiveGamesToRows(games, capturedAt) {
  if (!Array.isArray(games)) return []
  return games
    .filter(g =>
      g &&
      Number(g.league_id) > 0 &&
      g.match_id && String(g.match_id) !== '0' &&
      g.team_name_radiant && g.team_name_dire
    )
    .map(g => {
      const { radiant, dire } = splitLivePicks(g.players)
      return {
        od_match_id: Number(g.match_id),
        od_series_id: g.series_id ? Number(g.series_id) : null,
        radiant_name: g.team_name_radiant,
        dire_name: g.team_name_dire,
        start_time: Number(g.activate_time) || null, // findOdMatchByTime compares this
        league_id: Number(g.league_id),
        radiant_lead: Number.isFinite(g.radiant_lead) ? g.radiant_lead : null,
        radiant_score: Number.isFinite(g.radiant_score) ? g.radiant_score : null,
        dire_score: Number.isFinite(g.dire_score) ? g.dire_score : null,
        server_steam_id: g.server_steam_id ? String(g.server_steam_id) : null, // TEXT: exceeds bigint
        game_time: Number.isFinite(g.game_time) ? g.game_time : null,
        // Live Story R4 (objective/map state): raw OD /live objective signals, stored undecoded.
        // building_state is a bitmask of standing buildings (bit layout decoded at read time, only
        // after the R4.0 verification spike — never decoded here); spectators is a live viewer count
        // used as a discovery/hype signal. Both nullable, same store-raw-filter-at-read convention as
        // the telemetry above. See .claude/specs/live-story-r4-*.md.
        building_state: Number.isFinite(g.building_state) ? g.building_state : null,
        spectators: Number.isFinite(g.spectators) ? g.spectators : null,
        radiant_hero_ids: radiant.heroIds,
        dire_hero_ids: dire.heroIds,
        radiant_player_names: radiant.names,
        dire_player_names: dire.names,
        captured_at: capturedAt,
      }
    })
}

// Live Story (Phase A): reduce mapLiveGamesToRows() output to append-only net-worth timeseries
// points for the live gold graph — one point per game per capture, read back and plotted by
// game_time via ?mode=live-game-pulse. Keeps only rows with a real game_time (the graph x-axis and
// half of the (od_match_id, game_time) unique key); radiant_lead may be null here and is filtered
// at read, not capture ("store raw, filter at read", same as live_game_map). Exported for unit
// testing. Independent of live_game_map and of the LOCKED VOD stream cache.
export function toGoldRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .filter(r => r && r.game_time != null)
    .map(r => ({
      od_match_id: r.od_match_id,
      game_time: r.game_time,
      radiant_lead: r.radiant_lead,
      radiant_score: r.radiant_score,
      dire_score: r.dire_score,
      // R4 (2026-07-21): the raw building_state bitmask rides the same per-capture snapshot. The
      // live_game_map copy is upserted (latest only), so this append-only table is the ONLY place a
      // per-game building_state TIMESERIES accumulates — which is exactly what decoding the bitmask
      // needs (correlating bit changes against post-game building_kill events). Nothing reads it
      // yet; stored raw, never decoded here. Requires the 2026-07-21 migration in
      // scripts/create-live-game-gold.sql (until then this whole gold insert warns and skips —
      // its own try/catch keeps that off the live_game_map upsert).
      building_state: r.building_state,
    }))
}

export default async function handleLiveOdCapture(req, res) {
  const log = createLogger('/api/tournaments?mode=od-live-capture')
  res.setHeader('Cache-Control', 'private, no-store')

  try {
    // Global throttle: the first caller in the LOCK_TTL_S window runs the fetch; concurrent
    // tabs and the */15 backstop early-exit on a single KV GET. Deliberately never
    // released — the TTL expiring is what permits the next run.
    const gotLock = await kv.set(LOCK_KEY, Date.now(), { nx: true, ex: LOCK_TTL_S })
    if (!gotLock) return res.status(200).json({ ok: true, skipped: 'throttled' })

    const odRes = await fetch(OD_LIVE_URL)
    if (!odRes.ok) {
      log.warn('OD /live fetch failed', { status: odRes.status })
      return res.status(200).json({ ok: false, error: 'od_live_fetch_failed' })
    }
    const games = await odRes.json()
    if (!Array.isArray(games)) return res.status(200).json({ ok: true, captured: 0 })

    const rows = mapLiveGamesToRows(games, new Date().toISOString())
    if (rows.length === 0) return res.status(200).json({ ok: true, captured: 0 })

    // Upsert on od_match_id: refresh the transient telemetry + captured_at each run while
    // the identity/team/time mapping stays stable. first_seen_at is omitted from the
    // payload, so its insert-time default is preserved across updates.
    const { error } = await getSupabaseAdmin()
      .from('live_game_map')
      .upsert(rows, { onConflict: 'od_match_id' })

    if (error) {
      log.warn('live_game_map upsert failed', { error: error.message })
      return res.status(200).json({ ok: false, error: 'upsert_failed' })
    }

    log.info('captured', { count: rows.length })

    // Live Story (Phase A): append a net-worth timeseries point per game to live_game_gold so the
    // running game's gold trajectory can be graphed live. Best-effort and fully independent of the
    // live_game_map upsert above — a failure here must NEVER affect the resolver's capture. Own
    // try/catch (not just checking the returned `error`): a thrown fetch-level failure (e.g. a
    // network blip) from postgrest-js's non-retryable POST path would otherwise escape to the
    // outer catch and misreport this already-successful capture as `ok: false`. Insert-ignore on
    // (od_match_id, game_time) dedups under a lock blip and makes a pause (frozen game_time) a
    // no-op. Requires scripts/create-live-game-gold.sql to have been run INCLUDING its grants —
    // otherwise this warns with the silent-42501 permission error, same trap as live_game_map.
    try {
      const goldRows = toGoldRows(rows)
      if (goldRows.length > 0) {
        const { error: goldErr } = await getSupabaseAdmin()
          .from('live_game_gold')
          .upsert(goldRows, { onConflict: 'od_match_id,game_time', ignoreDuplicates: true })
        if (goldErr) log.warn('live_game_gold append failed', { error: goldErr.message })
      }
    } catch (goldErr) {
      log.warn('live_game_gold append threw', { error: goldErr?.message })
    }

    return res.status(200).json({ ok: true, captured: rows.length })
  } catch (err) {
    // Fail open — this is a best-effort background capture; never surface a 500 to the
    // client poll that triggers it.
    log.warn('handler failed', { error: err?.message })
    return res.status(200).json({ ok: false, error: err?.message })
  }
}

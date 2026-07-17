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
// Trigger: the client fires this on its existing 2-min live poll (0 QStash cost), plus
// a */15 QStash backstop for no-user coverage. The KV lock below is the real cadence
// control and doubles as abuse protection: however many callers hit this, at most one
// OpenDota /live fetch runs per LOCK_TTL_S. The endpoint is intentionally unauthenticated
// (idempotent, throttled, no user input, no sensitive data) — like promatches-proxy.
//
// Phase 2 addition: also captures each side's live hero picks (players[].hero_id, split by
// players[].team) so the resolver can serve a "live pulse" (gold lead/score/draft) for the
// CURRENTLY RUNNING game, not just recover ids for finished ones.

const OD_LIVE_URL = 'https://api.opendota.com/api/live'
const LOCK_KEY = 'capture:od-live:lock'
const LOCK_TTL_S = 110 // ~2-min throttle. NOT released — the TTL IS the cadence.

// Splits a /live `players` array into each side's hero_id picks by `team` (0=Radiant,
// 1=Dire — confirmed empirically 2026-07-16: every live league game splits players 5/5 across
// exactly these two values, consistent with isRadiant derivation used everywhere else in this
// codebase). Missing/malformed players -> []. hero_id 0 (still picking) is kept as-is; the
// frontend already renders a placeholder tile for hero 0/unknown, same as the finished-game
// draft strip.
function splitHeroPicks(players) {
  const list = Array.isArray(players) ? players : []
  const radiant = list.filter(p => p && p.team === 0).map(p => p.hero_id)
  const dire = list.filter(p => p && p.team === 1).map(p => p.hero_id)
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
      const { radiant, dire } = splitHeroPicks(g.players)
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
        radiant_hero_ids: radiant,
        dire_hero_ids: dire,
        captured_at: capturedAt,
      }
    })
}

export default async function handleLiveOdCapture(req, res) {
  const log = createLogger('/api/tournaments?mode=od-live-capture')
  res.setHeader('Cache-Control', 'private, no-store')

  try {
    // Global throttle: the first caller in the ~2-min window runs the fetch; concurrent
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
    return res.status(200).json({ ok: true, captured: rows.length })
  } catch (err) {
    // Fail open — this is a best-effort background capture; never surface a 500 to the
    // client poll that triggers it.
    log.warn('handler failed', { error: err?.message })
    return res.status(200).json({ ok: false, error: err?.message })
  }
}

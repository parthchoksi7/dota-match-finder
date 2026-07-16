import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
import { PANDASCORE_BASE, STREAM_TTL, createLogger, validateId, findOdMatchByTime } from '../_shared.js'

// Resolves the OpenDota match_id for each finished game of a live/just-ended PandaScore
// series. Resolution chain, most-authoritative first:
//   1. PandaScore external_identifier (per-match endpoint — still set on freshly finished games)
//   2. KV live:game:{psId}:{pos}  (usually external_identifier from the running window; note the
//                                  recent-completed mode can also write a fuzzy findOdMatchByTime
//                                  result here, so a KV hit is "best available", not a guarantee)
//   3. match_stream_history        (exact (ps_match_id, game_position) key — od_match_id is a
//                                    captured external_identifier, so authoritative & exact)
//   4. live_game_map               (OD /live capture — INDEPENDENT source with a different failure
//                                    mode than 1/2; correlated here by team-name + time, so FUZZY)
//
// We only ever WRITE (backfill) a resolution that came from source 1 or 3 (both true
// external_identifier lineage — a KV hit is never re-written). A fuzzy live_game_map match is
// never written to live:game — the LOCKED live-matches.js enrichment reads those keys, and a
// wrong correlation must not leak into the VOD system. Fuzzy hits are returned to the caller only.
//
// Note: OpenDota /promatches is NOT queried here — once OD indexes a finished game it also flows
// into the client's existing `allMatches`, which covers that (slow) path without a heavy fetch.

const LGM_WINDOW_S = 900 // matches findOdMatchByTime's ±900s window — querying wider is wasted work
const PS_FETCH_TIMEOUT_MS = 4000

// PandaScore game.begin_at is an ISO 8601 string; findOdMatchByTime needs unix seconds.
export function beginAtToUnix(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

// Shape live_game_map rows as OD-match objects so the canonical findOdMatchByTime() consumes them.
export function shapeLiveGameMapRows(data) {
  return (data || []).map(r => ({
    match_id: Number(r.od_match_id),
    start_time: Number(r.start_time),
    radiant_name: r.radiant_name,
    dire_name: r.dire_name,
  }))
}

// Pick the winning OD match id for a finished game, most-authoritative first. A live_game_map
// hit is FUZZY (resolve-time team+time correlation), so it is flagged non-authoritative and must
// never be backfilled to the shared live:game: KV the LOCKED live-matches.js enrichment reads.
export function pickFinishedGameId({ externalId, kvId, streamHistoryId, liveGameMapId }) {
  const authoritativeId = externalId || kvId || streamHistoryId || null
  if (authoritativeId) return { matchId: String(authoritativeId), authoritative: true }
  if (liveGameMapId) return { matchId: String(liveGameMapId), authoritative: false }
  return { matchId: null, authoritative: false }
}

async function resolveFromStreamHistory(psId, position, log) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('match_stream_history')
      .select('od_match_id')
      .eq('ps_match_id', Number(psId))
      .eq('game_position', position)
      .order('started_at', { ascending: false }) // (ps_match_id, position) isn't unique; prefer latest (remake-safe)
      .limit(1)
    if (error || !data || data.length === 0) return null
    return data[0].od_match_id ? String(data[0].od_match_id) : null
  } catch (err) {
    log.warn('match_stream_history lookup failed', { error: err?.message })
    return null
  }
}

async function resolveFromLiveGameMap(beginAtUnix, opponents, log) {
  if (!beginAtUnix) return null
  // Require both team names. live_game_map spans every concurrent pro game, so without two
  // names to disambiguate, findOdMatchByTime would degrade to pure nearest-time and could bind
  // an unrelated game. Better to leave it unresolved (companion shows "stats indexing").
  const names = (opponents || []).map(o => o?.opponent?.name).filter(Boolean)
  if (names.length < 2) return null
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('live_game_map')
      .select('od_match_id, start_time, radiant_name, dire_name')
      .gte('start_time', beginAtUnix - LGM_WINDOW_S)
      .lte('start_time', beginAtUnix + LGM_WINDOW_S)
    if (error || !data || data.length === 0) return null
    const hit = findOdMatchByTime(shapeLiveGameMapRows(data), beginAtUnix, opponents)
    return hit ? String(hit.match_id) : null
  } catch (err) {
    log.warn('live_game_map lookup failed', { error: err?.message })
    return null
  }
}

export default async function handleLiveSeriesGames(req, res) {
  const log = createLogger('/api/tournaments?mode=live-series-games')
  const token = process.env.PANDASCORE_TOKEN
  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ games: [], gameIds: [] })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ games: [], gameIds: [] })

  try {
    // The per-match PandaScore endpoint is the authority on which games are finished and
    // their begin_at/opponents, and still exposes external_identifier on freshly finished
    // games (the bulk running feed does not). If PS is unavailable, degrade to KV-only.
    let finished = null
    let opponents = []
    if (token) {
      // A network-level failure (DNS/timeout/reset — the usual way PS is "unavailable") must
      // leave `finished` null so we degrade to the KV-only branch below, NOT fall through to the
      // outer catch and return empty. Own try/catch + AbortController guarantee that.
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), PS_FETCH_TIMEOUT_MS)
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        let psRes
        try {
          psRes = await fetch(`${PANDASCORE_BASE}/matches/${pandaId}`, { headers, signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }
        if (psRes.ok) {
          const detail = await psRes.json()
          opponents = detail.opponents || []
          finished = (detail.games || [])
            .filter(g => g.status === 'finished')
            .sort((a, b) => a.position - b.position)
            .map(g => ({
              position: g.position,
              externalId: g.external_identifier ? String(g.external_identifier) : null,
              beginAtUnix: beginAtToUnix(g.begin_at),
            }))
        } else {
          log.warn('PS match fetch failed', { pandaId, status: psRes.status })
        }
      } catch (err) {
        log.warn('PS match fetch error', { pandaId, error: err?.message })
      }
    }

    // KV read for the relevant positions (all finished positions, or 1..5 when PS is down).
    const positions = finished ? finished.map(f => f.position) : [1, 2, 3, 4, 5]
    const kvVals = positions.length
      ? await kv.mget(...positions.map(p => `live:game:${pandaId}:${p}`))
      : []
    const kvByPos = {}
    positions.forEach((p, i) => { if (kvVals[i]) kvByPos[p] = String(kvVals[i]) })

    // PS unavailable → return whatever KV had (legacy behavior, now position-shaped).
    if (!finished) {
      const games = positions
        .filter(p => kvByPos[p])
        .map(p => ({ position: p, matchId: kvByPos[p] }))
        .sort((a, b) => a.position - b.position)
      return res.status(200).json({ games, gameIds: games.map(g => g.matchId) })
    }

    const backfills = []
    const games = []
    for (const f of finished) {
      const externalId = f.externalId
      const kvId = kvByPos[f.position] || null
      // Short-circuit the async fallbacks: only query each when still unresolved.
      let streamHistoryId = null
      let liveGameMapId = null
      if (!externalId && !kvId) {
        streamHistoryId = await resolveFromStreamHistory(pandaId, f.position, log)
      }
      if (!externalId && !kvId && !streamHistoryId) {
        liveGameMapId = await resolveFromLiveGameMap(f.beginAtUnix, opponents, log)
      }
      const { matchId, authoritative } = pickFinishedGameId({ externalId, kvId, streamHistoryId, liveGameMapId })
      if (!matchId) continue
      games.push({ position: f.position, matchId })
      // Backfill KV only for authoritative resolutions — a fuzzy live_game_map hit must never
      // leak into the live:game: keys the LOCKED live-matches.js enrichment reads.
      if (authoritative && !kvId) {
        backfills.push(kv.set(`live:game:${pandaId}:${f.position}`, matchId, { ex: STREAM_TTL }))
      }
    }

    if (backfills.length) {
      Promise.all(backfills).catch(err => log.warn('KV backfill failed', { error: err?.message }))
    }

    games.sort((a, b) => a.position - b.position)
    log.info('resolved', { pandaId, count: games.length })
    return res.status(200).json({ games, gameIds: games.map(g => g.matchId) })
  } catch (err) {
    log.warn('handler failed', { error: err?.message })
    return res.status(200).json({ games: [], gameIds: [] })
  }
}

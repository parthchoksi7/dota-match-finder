import { createHmac } from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'
import { getSupabaseAdmin } from './_supabase.js'
// Same series-completion logic the homepage feed uses (never reimplement this). Safe to
// import server-side: seriesLogic.js has zero dependencies, unlike src/utils.js which pulls
// in @vercel/analytics (browser-oriented; do not import utils.js itself from here).
import { isSeriesComplete } from '../src/seriesLogic.js'
// Same zero-browser-dependency rule as seriesLogic.js above. Owns the live-score copy shared
// with the client's tab title, so the two can never drift.
import { formatScoreHeadline, formatScoreDetail, scoreSignature, shouldSendScorePing } from '../src/utils/liveScore.js'
// Live "worth watching" feed-row signal (.claude/specs/live-worth-watching-signal-spec.md).
// Same zero-browser-dependency rule — liveSignal.js only imports momentum.js, itself zero-import.
import { nextSignalState, STALE_MAX_S } from '../src/utils/liveSignal.js'

const KV_KEY = 'dota2:live_matches_v5' // v5: matches may now carry `.signal` (live worth-watching badge)
// DELIBERATELY UNCHANGED at 120s. A 2026-08-15 draft halved this to 60s to pay for a higher edge
// s-maxage and was rejected in review before shipping, for two reasons worth keeping written down:
//   1. It doubles the REGEN rate (the expensive path: 100-match PandaScore parse +
//      enrichMultiStreamMatches fan-out + resolveLiveSignals + cacheRunningStreams) while removing
//      only cheap KV-hit invocations. Whether that is a net Active CPU win depends on the
//      regen/KV-hit cost ratio, which is not measurable on the free plan — it could plausibly be
//      net NEGATIVE.
//   2. This constant is the observation cadence for `ONE_SIDED_DWELL` (src/utils/liveSignal.js),
//      calibrated as "2 consecutive observations, ~4 min". Halving it silently halves R3's "be slow
//      to tell a fan a game is finished" guarantee. Same class of bug as the LOCK_TTL_S 60->45
//      revert documented in api/_handlers/liveOdCapture.js.
// 2026-08-16 — RETRACTION of the sentence that stood here, which claimed the staleness budget was
// taken from `stale-while-revalidate` because swr "costs nothing". Both halves were wrong: swr was
// measured to be the thing that collapses this endpoint's per-expiry request herd (see the
// Cache-Control note below), and at swr=30 it costs exactly 30s of budget. Point 1 above stands as
// written. Point 2 needs one correction now that swr is back: because `s-maxage` (150) EXCEEDS this
// TTL, the effective regen cadence — and therefore ONE_SIDED_DWELL's real unit — is ~150s, not 120s,
// making the dwell worth ~300s of wall clock rather than ~240s. That errs in R3's intended direction
// (slower to tell a fan a game is finished), but do not read the "~4 min" calibration as exact while
// that inequality holds.
const TTL = 60 * 2 // 2 minutes
const REPLAY_DEDUP_TTL = 7 * 24 * 3600 // 7 days — a series binds once; guards partial-bind re-runs.

// Headroom above the 10s default: the cron=1 capture path fetches up to 100 running
// matches, enriches multi-stream ones, and walks the push-subscriber loop. Hobby allows
// up to 60s. See pending-refactors for batching the per-subscriber KV reads (mget).
export const config = { maxDuration: 30 }

import { isTier1, isTier1ByName, getTwitchStreams, normalizeAllStreams, CHANNEL_LABELS, PANDASCORE_BASE, STREAM_TTL, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES, TIER1_LEAGUE_KEYWORDS, buildTournamentName, trackError, parseBracketRound, getSeriesLabel, setCorsHeaders, createLogger, rateLimitByIp, resolveFollowedTeamName, sendGa4Event, findOdMatchByTime, OD_MATCH_TIME_WINDOW_S, isFeatureEnabled, recordPsQuota } from './_shared.js'
import { shapeLiveGameMapRows, beginAtToUnix } from './_handlers/liveSeriesGames.js'

// web-push is dynamic-imported and configured lazily, only from ensureWebpush() below — not
// eagerly at module scope. Same rationale as _shared.js's lazy Sentry init (2026-08-03, Fluid
// Active CPU budget): this is the 2nd-highest-hit endpoint in the api surface, and the vast
// majority of its requests are plain cached reads (the homepage's 2-min ambient poll) that never
// reach dispatchPush()/webpush.sendNotification() at all — that only fires from the cron/
// warm-streams paths below and the push-test mode. Importing `web-push` eagerly meant every cold
// start paid its import+setVapidDetails cost even on requests that never send a notification.
let _webpushPromise = null
function ensureWebpush() {
  if (!_webpushPromise) {
    _webpushPromise = import('web-push').then(({ default: webpush }) => {
      if (process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@spectateesports.live',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        )
      }
      return webpush
    })
  }
  return _webpushPromise
}



export function winsRequired(matchType, numberOfGames) {
  if (matchType === 'best_of_1') return 1
  if (matchType === 'best_of_2') return 2
  if (matchType === 'best_of_3') return 2
  if (matchType === 'best_of_5') return 3
  if (matchType === 'best_of' && numberOfGames) return Math.ceil(numberOfGames / 2)
  return Infinity
}

function getSeriesScore(m) {
  const opponents = m.opponents || []
  const results = m.results || []
  if (!results.length || opponents.length < 2) return null

  const teamAId = opponents[0]?.opponent?.id
  const teamBId = opponents[1]?.opponent?.id
  const scoreA = results.find(r => r.team_id === teamAId)?.score ?? 0
  const scoreB = results.find(r => r.team_id === teamBId)?.score ?? 0
  const max = winsRequired(m.match_type, m.number_of_games)
  return `${Math.min(scoreA, max)}-${Math.min(scoreB, max)}`
}

function getCurrentGame(m) {
  const games = m.games || []
  const running = games.find(g => g.status === 'running')
  return running ? running.position : null
}

function mapGames(m) {
  const opponents = m.opponents || []
  const games = m.games || []
  return games
    .filter(g => g.position != null)
    .sort((a, b) => a.position - b.position)
    .map(g => {
      const winnerId = g.winner?.id
      const winnerOpponent = winnerId
        ? opponents.find(o => o.opponent?.id === winnerId)
        : null
      return {
        position: g.position,
        status: g.status,
        winnerName: winnerOpponent?.opponent?.name || null,
        matchId: g.external_identifier || null,
        beginAt: g.begin_at || null,
        length: g.length || null,
      }
    })
}

function getYoutubeStream(streamsList) {
  const s = (streamsList || []).find(s => s.language === 'en' && s.raw_url?.includes('youtube.com'))
  return s?.raw_url || null
}

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  return {
    id: m.id,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    bracketRound: parseBracketRound(m.name),
    seriesScore: getSeriesScore(m),
    currentGame: getCurrentGame(m),
    games: mapGames(m),
    streams: getTwitchStreams(m.streams_list),
    youtubeStream: getYoutubeStream(m.streams_list),
    // All languages/co-streams (official + unofficial), for the Live Series Companion's
    // multi-language watch picker. Purely additive read of the same streams_list already
    // fetched for this response — no cache key, write, or lookup-order change.
    allStreams: normalizeAllStreams(m.streams_list),
  }
}

/**
 * For matches that have multiple official English streams in the bulk response,
 * fetch individual match data — the per-match endpoint sets main:true on exactly
 * the sub-channel assigned to that match, which the bulk endpoint does not.
 */
async function enrichMultiStreamMatches(matches, headers) {
  const multi = matches.filter(m => {
    const official = (m.streams_list || []).filter(s => s.official && s.language === 'en' && s.raw_url)
    return official.length > 1
  })
  if (multi.length === 0) return
  await Promise.all(multi.map(async m => {
    try {
      const r = await fetch(`https://api.pandascore.co/matches/${m.id}`, { headers })
      if (!r.ok) {
        console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id} fetch failed`, status: r.status, ts: Date.now() }))
        return
      }
      const detail = await r.json()
      const en = (detail.streams_list || []).filter(s => s.official && s.language === 'en')
      console.log(JSON.stringify({ level: 'info', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id}`, streams: en.map(s => `${s.raw_url}(main=${s.main})`), ts: Date.now() }))
      if (detail.streams_list) m.streams_list = detail.streams_list
    } catch (err) {
      console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id} exception`, error: err?.message, ts: Date.now() }))
    }
  }))
}

/**
 * Writes stream:match and stream:ts KV entries for all running games.
 * Called by both the normal handler (client poll) and the cron mode.
 * nx=true on stream:match so the first recorded channel is never overwritten.
 */
const FORMAT_MATCH_TTL = 14 * 24 * 3600 // 14 days

async function cacheRunningStreams(rawMatches) {
  const streamWrites = []
  const tsBuckets = {} // roundedTs → Set<channel>
  const supabaseRows = []

  for (const m of rawMatches) {
    const format = m.match_type // 'best_of_2', 'best_of_3', etc.
    const streams = getTwitchStreams(m.streams_list)
    // All stream URLs (every language/source, official + unofficial) for permanent storage.
    const allStreams = normalizeAllStreams(m.streams_list)
    // Primary twitch channel for the row's `channel` column; null for youtube-only series.
    const primaryChannel = streams[0]?.url.replace('https://www.twitch.tv/', '') || null

    for (const game of m.games || []) {
      // Always record in the ts-bucket for running single-stream games, even when
      // external_identifier is null (personal/qualifier streams where PS hasn't linked
      // to OD yet). This ensures the ts fallback in match-streams.js can find the
      // channel after the game ends, even if stream:match was never written.
      if (streams.length === 1 && game.begin_at && game.status === 'running') {
        const tsChannel = streams[0].url.replace('https://www.twitch.tv/', '')
        const gameTs = Math.floor(new Date(game.begin_at).getTime() / 1000)
        const roundedTs = Math.floor(gameTs / 300) * 300
        if (!tsBuckets[roundedTs]) tsBuckets[roundedTs] = new Set()
        tsBuckets[roundedTs].add(tsChannel)
      }

      const matchId = game.external_identifier || null
      if (!matchId) continue

      // Cache PandaScore format and bracket round keyed by OpenDota match ID so the
      // completed-match feed can correct series_type and show grand final styling.
      if (format) {
        streamWrites.push(kv.set(`format:match:${matchId}`, format, { ex: FORMAT_MATCH_TTL }))
      }
      const bracketRound = parseBracketRound(m.name)
      if (bracketRound) {
        streamWrites.push(kv.set(`bracket:match:${matchId}`, bracketRound, { ex: FORMAT_MATCH_TTL }))
      }

      // Record which OpenDota game ID belongs to which position in this PandaScore match.
      // Written when the game is running (the only time external_identifier is reliable);
      // persists across cron runs so G1/G2 IDs remain available while G3 is live.
      if (game.status === 'running') {
        streamWrites.push(kv.set(`live:game:${m.id}:${game.position}`, String(matchId), { ex: STREAM_TTL }))
      }

      // Permanent record of every stream URL for this game/series. Independent of the
      // single-channel KV fast-path below so multi-channel and YouTube-only series are
      // captured too. Runs while the game is running (when streams_list is populated).
      // ignoreDuplicates on upsert keeps first-write-wins, so re-runs are idempotent.
      if (game.begin_at && game.status === 'running' && allStreams.length > 0) {
        supabaseRows.push({
          od_match_id: Number(matchId),
          ps_match_id: m.id,
          channel: primaryChannel,
          started_at: game.begin_at,
          team_a: m.opponents?.[0]?.opponent?.name || null,
          team_b: m.opponents?.[1]?.opponent?.name || null,
          tournament: buildTournamentName(m),
          match_type: m.match_type || null,
          game_position: game.position || null,
          bracket_round: parseBracketRound(m.name) || null,
          streams_json: allStreams,
        })
      }

      // --- LOCKED VOD Replay System: single-channel KV fast-path (unchanged) ---
      if (streams.length !== 1 || !game.begin_at || game.status !== 'running') continue
      const channel = streams[0].url.replace('https://www.twitch.tv/', '')
      // nx: true — write-once. First recorded channel is never overwritten.
      streamWrites.push(kv.set(`stream:match:${matchId}`, channel, { ex: STREAM_TTL, nx: true }))
    }
  }

  // Write each ts bucket as a JSON array of all channels active in that window.
  // This replaces the old single-value write that caused last-write-wins collisions.
  for (const [roundedTs, channels] of Object.entries(tsBuckets)) {
    streamWrites.push(kv.set(`stream:ts:${roundedTs}`, [...channels], { ex: STREAM_TTL }))
  }

  if (streamWrites.length > 0) {
    await Promise.all(streamWrites).catch(err => console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'stream mapping write failed', error: err?.message, ts: Date.now() })))
  }

  // Permanent write-through to Supabase. ignoreDuplicates replicates nx:true — first channel wins.
  // Wrapped in try-catch: createClient() throws synchronously when SUPABASE_URL is missing.
  if (supabaseRows.length > 0) {
    try {
      getSupabaseAdmin()
        .from('match_stream_history')
        .upsert(supabaseRows, { onConflict: 'od_match_id', ignoreDuplicates: true })
        .then(({ error }) => { if (error) console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'match_stream_history upsert failed', error: error.message, ts: Date.now() })) })
        .catch(err => console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'match_stream_history upsert failed', error: err?.message, ts: Date.now() })))
    } catch (err) {
      console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'match_stream_history upsert failed', error: err?.message, ts: Date.now() }))
    }
  }

  return streamWrites.length
}

/**
 * Builds the notification payload for a given type. Pure + exported for unit tests.
 * SPOILER-SAFE: never include a series score or winner in the title/body — the outcome
 * must live behind the tap. `match` is a mapMatch() result.
 *   - soon/live → homepage feed with ?m=<seriesId> highlight (no dedicated live-match page)
 *   - replay    → the completed-match page (?spoilers=off). The warm-streams hook sets
 *                 match.id to the series' anchor OpenDota match id (min game id), so the
 *                 URL resolves to a real completed match; opts.matchId can override it.
 *   - score     → the ONE deliberate exception to the spoiler rule above, and the only type
 *                 that defaults OFF (see normalizePrefs): a fan only ever receives it after
 *                 explicitly enabling an alert whose label says it carries the live score.
 *                 Lands on ?live=<seriesId>, which opens the live companion sheet directly.
 */
export function buildPushPayload(type, match, opts = {}) {
  const teams = `${match.teamA} vs ${match.teamB}`
  const stakes = match.bracketRound || match.tournament || 'Pro match'
  // from=push&pt=<type> is the open-attribution signal: the client tracks push_opened on
  // load and strips the params. This is how CTR is measured — a SW has no window.gtag.
  switch (type) {
    case 'score': {
      // A constant tag per series (not per send) is what makes a stream of these read as one
      // updating widget rather than a stack of six notifications; `silent` keeps an ambient
      // score update from interrupting like a kickoff alert does.
      const detail = formatScoreDetail(opts.pulse, {
        seriesLabel: match.seriesLabel,
        seriesScore: match.seriesScore,
        gamePosition: opts.gamePosition,
      })
      return {
        title: formatScoreHeadline(opts.pulse) || teams,
        body: detail || stakes,
        url: `/?live=${match.id}&from=push&pt=score`,
        tag: `score-${match.id}`,
        silent: true,
      }
    }
    case 'soon':
      return { title: `${teams} starts soon`, body: `${stakes} • catch the draft`, url: `/?m=${match.id}&from=push&pt=soon`, tag: `soon-${match.id}` }
    case 'live':
      return { title: `${teams} is live`, body: `${stakes} • watch now`, url: `/?m=${match.id}&from=push&pt=live`, tag: `live-${match.id}` }
    case 'replay':
      return { title: `${teams} · replay ready`, body: `${stakes} • watch the full series`, url: `/match/${opts.matchId ?? match.id}?spoilers=off&from=push&pt=replay`, tag: `replay-${match.id}` }
    default:
      return { title: teams, body: stakes, url: '/', tag: `push-${match.id}` }
  }
}

/**
 * Normalizes a stored (or incoming) prefs object into a canonical shape.
 * Defaults are permissive: all notification types ON, no quiet hours — so existing
 * subscribers (who predate the prefs key) and tz-less clients keep receiving alerts.
 *
 * `score` inverts that default and requires an explicit true. It is the only type whose copy
 * contains a live result, so opting IN has to be a deliberate act — a permissive default would
 * retroactively start pushing scores to every existing subscriber, including spoiler-free ones.
 */
export function normalizePrefs(raw) {
  let p = raw
  if (typeof raw === 'string') { try { p = JSON.parse(raw) } catch { p = null } }
  p = p && typeof p === 'object' ? p : {}
  const t = p.types && typeof p.types === 'object' ? p.types : {}
  return {
    tz: typeof p.tz === 'string' ? p.tz : null,
    types: { soon: t.soon !== false, live: t.live !== false, replay: t.replay !== false, score: t.score === true },
    quietStart: Number.isInteger(p.quietStart) ? p.quietStart : null,
    quietEnd: Number.isInteger(p.quietEnd) ? p.quietEnd : null,
  }
}

/** Local hour (0–23) at `nowMs` in the given IANA tz, or null if the tz is unusable. */
function getHourInTz(nowMs, tz) {
  try {
    const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(nowMs), 10)
    return Number.isFinite(h) ? (h % 24) : null
  } catch { return null }
}

/** True when `nowMs` falls inside the user's quiet-hours window (wraps midnight). */
export function inQuietHours(prefs, nowMs) {
  const { quietStart: s, quietEnd: e, tz } = prefs
  if (s == null || e == null || s === e || !tz) return false
  const hour = getHourInTz(nowMs, tz)
  if (hour == null) return false
  return s < e ? (hour >= s && hour < e) : (hour >= s || hour < e)
}

/**
 * Sends `type` notifications for one match to every subscriber of either team, honoring
 * per-user prefs (type toggle + quiet hours) and per-(type,series,user) dedup. Subscriber lookup
 * is one Supabase query (`overlaps` on push_subscriptions.teams — pending-refactors #16, replaces
 * the old KV push:team:{name} reverse index + push:sub/push:prefs mget pair). Dedup (`push:sent:*`)
 * stays in KV — short-TTL delivery bookkeeping, not subscription state, and keyed by the same
 * userId (HMAC of the endpoint) before and after the migration, so it survived the cutover
 * unaffected. Returns count sent.
 */
async function dispatchPush(match, { type, dedupPrefix, dedupTtl, payloadOpts }) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0
  const teams = [match.teamA, match.teamB].filter(t => t && t !== 'TBD')
  if (teams.length === 0) return 0

  // Fired now (not awaited yet) so the web-push import overlaps the Supabase query below instead
  // of adding sequential latency — resolved just before it's actually needed, at the forEach loop.
  const webpushPromise = ensureWebpush()

  const { data: subs, error } = await getSupabaseAdmin()
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, prefs')
    .overlaps('teams', teams.map(t => t.toLowerCase()))
  // Distinct from "no subscribers" (the common case, silent by design): a query failure here
  // means dispatchPush silently sends nothing for this match, with no other signal anywhere in
  // the request trace — worth a log line since this is a new dependency this path didn't have
  // before the KV→Supabase migration (pending-refactors #16).
  if (error) {
    console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'push_subscriptions read failed', error: error.message, ts: Date.now() }))
    return 0
  }
  if (!subs?.length) return 0

  const ids = subs.map(s => s.user_id)
  const sentVals = await kv.mget(...ids.map(id => `${dedupPrefix}:${match.id}:${id}`)).catch(() => [])

  const webpush = await webpushPromise
  const payload = JSON.stringify(buildPushPayload(type, match, payloadOpts))
  const now = Date.now()
  const ops = []
  subs.forEach((row, i) => {
    // For one-shot types this is "already notified for this series"; for the recurring score
    // ping the same key is a per-user cooldown whose TTL is the minimum gap between sends.
    if (sentVals[i]) return
    const prefs = normalizePrefs(row.prefs)
    if (prefs.types[type] === false) return       // user disabled this type
    if (inQuietHours(prefs, now)) return          // suppressed during quiet hours
    const userId = row.user_id
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
    const sentKey = `${dedupPrefix}:${match.id}:${userId}`
    ops.push(
      webpush.sendNotification(sub, payload)
        .then(() => kv.set(sentKey, '1', { ex: dedupTtl }))
        .catch(err => {
          // 410 Gone / 404 Not Found → subscription is dead; prune it. Unlike the old KV keys
          // (90d TTL), a Supabase row never expires on its own — this delete is now the only
          // way a dead subscription is ever removed.
          if (err.statusCode === 410 || err.statusCode === 404) {
            getSupabaseAdmin().from('push_subscriptions').delete().eq('user_id', userId)
              .then(({ error }) => { if (error) console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'push_subscriptions prune failed', error: error.message, ts: Date.now() })) })
              .catch(err2 => console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'push_subscriptions prune failed', error: err2?.message, ts: Date.now() })))
          }
        })
    )
  })
  if (ops.length > 0) {
    await Promise.all(ops)
    // Server-side "sent" counterpart to the client-side push_opened (click) event; both
    // carry `type` so GA4/BigQuery can compute per-type CTR (opens ÷ sends). Aggregated
    // per dispatch (count = sends) rather than one event per recipient to bound MP volume.
    await sendGa4Event('push_sent', { type, count: ops.length }, `push-${type}`)
  }
  return ops.length
}

/** Fan `dispatchPush` across a list of matches; returns total notifications sent. */
async function sendPushForMatches(matches, opts) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0
  let sent = 0
  for (const match of matches) sent += await dispatchPush(match, opts).catch(() => 0)
  return sent
}

// ── Live-score ping (glanceable live score, 2026-07-27) ──────────────────────────────────────
// Cooldown sits just under the 15-min cron cadence so an ordinary tick is never skipped by clock
// drift, while still bounding a subscriber to ~4 score alerts/hour on one series. The per-series
// signature only has to outlive a single game, not the whole series.
const SCORE_COOLDOWN_S = 14 * 60
const SCORE_SIGNATURE_TTL_S = 4 * 3600

/**
 * The currently-running game of each PandaScore series, in the shape the OD correlation needs.
 * Pure; exported for unit testing.
 */
export function collectRunningGames(rawMatches) {
  const out = []
  for (const m of rawMatches || []) {
    const running = (m.games || []).find(g => g.status === 'running')
    if (!running) continue
    const startedAt = beginAtToUnix(running.begin_at)
    if (!startedAt) continue
    // Both names are required for the same reason the pulse resolver requires them: without a
    // pair to disambiguate on, a same-window live_game_map hit degrades to pure nearest-time and
    // could bind an unrelated game — which here would mean pushing the wrong team's score.
    const names = (m.opponents || []).map(o => o?.opponent?.name).filter(Boolean)
    if (names.length < 2) continue
    out.push({ seriesId: m.id, startedAt, position: running.position, opponents: m.opponents })
  }
  return out
}

/**
 * Correlates each running game to its live_game_map row, reusing the canonical
 * findOdMatchByTime() rather than reimplementing PS↔OD matching. Returns a Map of
 * PandaScore series id → { pulse, gamePosition }. A game that doesn't correlate is simply
 * absent — an unresolved game stays unresolved rather than risking a wrong score in a push.
 * Pure; exported for unit testing.
 */
export function correlateLiveScores(runningGames, rows) {
  const shaped = shapeLiveGameMapRows(rows)
  const byId = new Map((rows || []).map(r => [Number(r.od_match_id), r]))
  const out = new Map()
  for (const g of runningGames) {
    const hit = findOdMatchByTime(shaped, g.startedAt, g.opponents)
    if (!hit) continue
    const row = byId.get(Number(hit.match_id))
    if (!row) continue
    out.set(g.seriesId, {
      gamePosition: g.position,
      pulse: {
        radiantName: row.radiant_name,
        direName: row.dire_name,
        radiantScore: row.radiant_score,
        direScore: row.dire_score,
        radiantLead: row.radiant_lead,
        gameTime: row.game_time,
        capturedAt: row.captured_at,
      },
    })
  }
  return out
}

/**
 * The currently-running game of each PS series, correlated to its live_game_map row, via ONE
 * batched Supabase range query for the whole tick — not one query per series. Shared by
 * sendScorePings() and the live-signal enrichment below (`.claude/specs/
 * live-worth-watching-signal-spec.md`'s explicit instruction: "reuse it, do not rebuild it" —
 * this used to be inlined in sendScorePings alone; extracted so a second consumer doesn't mean a
 * second PS↔OD matcher or a second query). Pure aside from the one query; exported for tests.
 */
export async function resolveRunningPulses(rawMatches, log) {
  const runningGames = collectRunningGames(rawMatches)
  if (runningGames.length === 0) return new Map()

  const minStart = Math.min(...runningGames.map(g => g.startedAt)) - OD_MATCH_TIME_WINDOW_S
  const maxStart = Math.max(...runningGames.map(g => g.startedAt)) + OD_MATCH_TIME_WINDOW_S
  const { data, error } = await getSupabaseAdmin()
    .from('live_game_map')
    .select('od_match_id, start_time, radiant_name, dire_name, radiant_lead, radiant_score, dire_score, game_time, captured_at')
    .gte('start_time', minStart)
    .lte('start_time', maxStart)
  if (error) { log.warn('live_game_map read failed', { error: error.message }); return new Map() }
  if (!data?.length) return new Map()

  return correlateLiveScores(runningGames, data)
}

/**
 * Sends the opt-in live-score ping for every running series a subscriber follows. Runs on the
 * existing cron=1 tick — no new endpoint, no new schedule, no extra PandaScore call: `rawMatches`
 * is the array that path already fetched, and the pulse read is one batched Supabase query.
 *
 * Additive read + send only. Touches no stream-cache key, no VOD path, and nothing the
 * locked replay system depends on.
 */
async function sendScorePings(rawMatches, mapped, log) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0
  const scores = await resolveRunningPulses(rawMatches, log)
  if (scores.size === 0) return 0

  const byId = new Map(mapped.map(m => [m.id, m]))
  let sent = 0
  for (const [seriesId, { pulse, gamePosition }] of scores) {
    const match = byId.get(seriesId)
    if (!match) continue
    // "Has anything worth re-notifying about changed" is a fact about the GAME, not about any
    // one subscriber, so it costs one KV round trip per series instead of one per subscriber.
    const sigKey = `push:score:sig:${seriesId}`
    const prevSig = await kv.get(sigKey).catch(() => null)
    if (!shouldSendScorePing(pulse, prevSig)) continue
    sent += await dispatchPush(match, {
      type: 'score',
      dedupPrefix: 'push:sent:score',
      dedupTtl: SCORE_COOLDOWN_S,
      payloadOpts: { pulse, gamePosition },
    }).catch(err => { log.warn('score ping failed', { seriesId, error: err?.message }); return 0 })
    // Written even when 0 subscribers matched: the signature tracks the game's state, not
    // delivery, and rewriting it keeps the next tick's comparison meaningful.
    await kv.set(sigKey, scoreSignature(pulse), { ex: SCORE_SIGNATURE_TTL_S }).catch(() => {})
  }
  return sent
}

// ── Live "worth watching" feed-row signal ────────────────────────────────────────────────────
// `.claude/specs/live-worth-watching-signal-spec.md`. Computed on the response path (inside this
// same KV cache regeneration), never in the cron — the dwell design means sub-2-minute freshness
// buys nothing, so there is no case for a separate poll or a cron-side precompute.
const LIVE_SIGNAL_KV_TTL_S = 4 * 3600 // one game's worth; matches SCORE_SIGNATURE_TTL_S's rationale

/**
 * Resolves the live "worth watching" state for every currently-running tier-1 game, persisting
 * hysteresis/peak state in KV across the ~2-min cache regenerations (the handler itself is
 * stateless — payload is rebuilt from scratch on each cache miss). Returns a Map<seriesId,
 * 'SWINGING'|'CLOSE'|'ONE_SIDED'> containing ONLY series with a renderable state — a NEUTRAL or
 * gated-out read is simply absent, so the caller can attach-if-present rather than attach-then-filter.
 *
 * Entirely isolated: any failure here must never affect the primary matches payload (see the
 * caller's try/catch). Two KV round trips total (one pipelined mget, one pipelined set) per
 * regeneration — not per request, not per series.
 */
export async function resolveLiveSignals(rawMatches, log) {
  const pulses = await resolveRunningPulses(rawMatches, log)
  if (pulses.size === 0) return new Map()

  const nowSec = Math.floor(Date.now() / 1000)
  const entries = [...pulses.entries()].filter(([, { pulse }]) => {
    // Fail-closed on a stale read (Edge Cases: capture gap / OD outage) — a frozen game (paused,
    // routine in tier-1) is fine and intentionally NOT filtered here; staleness is judged by
    // `capturedAt` (wall-clock), never by `gameTime` (in-game clock), which a genuine pause
    // freezes on purpose.
    if (!pulse.capturedAt) return true // no capture timestamp on this row shape — don't gate on data we don't have
    const capturedAtSec = Math.floor(new Date(pulse.capturedAt).getTime() / 1000)
    return Number.isFinite(capturedAtSec) && (nowSec - capturedAtSec) <= STALE_MAX_S
  })
  if (entries.length === 0) return new Map()

  const stateKey = (seriesId) => `live:signal:${seriesId}`
  const keys = entries.map(([seriesId]) => stateKey(seriesId))
  const priors = await kv.mget(...keys).catch(() => keys.map(() => null))

  const out = new Map()
  const writes = []
  entries.forEach(([seriesId, { pulse }], i) => {
    const prior = priors[i] || null
    const next = nextSignalState(prior, { radiantLead: pulse.radiantLead, gameTime: pulse.gameTime })
    writes.push(kv.set(stateKey(seriesId), next, { ex: LIVE_SIGNAL_KV_TTL_S }).catch(() => {}))
    if (next.state) out.set(seriesId, next.state)
  })
  await Promise.all(writes)
  return out
}

// warm-streams cron tuning. Lookback covers OpenDota's 30–90 min indexing lag plus
// a full day of completed series; the cap and delay bound PandaScore/self-call load.
const WARM_LOOKBACK_S = 24 * 3600
const WARM_MAX_SERIES = 40
const WARM_MAX_PAGES = 6 // ~600 promatches — enough to span 24h even on busy multi-region days
const WARM_DELAY_MS = 150

/**
 * Selects completed tier-1 series from an OpenDota /promatches payload that are
 * worth fuzzy-binding to a Twitch channel. Groups games by series_id (falling back
 * to match_id for ungrouped games) and returns one entry per series with the sibling
 * OpenDota match IDs, the earliest game start (best proxy for the PandaScore series
 * begin_at the fuzzy match filters on), and both team names.
 *
 * `isSeriesComplete` reflects only the games VISIBLE in this run's odMatches window — a
 * BO3 with just Game 1 played (or Game 1 alone in-window with Game 2 not yet fetched)
 * reports false, since the win threshold isn't met yet. Callers that gate a "series is
 * over" action (e.g. the replay-ready push) MUST check this flag; channel-binding itself
 * is legitimately per-game and does not need to wait for series completion.
 *
 * Pure and side-effect free so it can be unit-tested without network or KV.
 *
 * @param {Array} odMatches - raw OpenDota promatches array
 * @param {{ tier1Names: string[], nowSec: number, lookbackSec: number, maxSeries?: number }} opts
 * @returns {Array<{ ids: string[], ts: number, radiantTeam: string, direTeam: string, tournament: string, seriesType: number|undefined, isSeriesComplete: boolean }>}
 */
export function selectSeriesToWarm(odMatches, { tier1Names, nowSec, lookbackSec, maxSeries = WARM_MAX_SERIES }) {
  if (!Array.isArray(odMatches) || !Array.isArray(tier1Names) || tier1Names.length === 0) return []
  const minStart = nowSec - lookbackSec
  const seriesMap = new Map()

  for (const m of odMatches) {
    const matchId = m?.match_id
    const startTime = m?.start_time
    if (!matchId || !startTime || startTime < minStart) continue

    const league = (m.league_name || '').toLowerCase()
    if (!league || !tier1Names.some(n => n.length >= 3 && league.includes(n))) continue

    const radiantTeam = m.radiant_name
    const direTeam = m.dire_name
    if (!radiantTeam || !direTeam) continue // teamsMatch() needs both names to disambiguate

    const key = (m.series_id && m.series_id !== 0) ? `s:${m.series_id}` : `m:${matchId}`
    let entry = seriesMap.get(key)
    if (!entry) {
      // seriesType (OD enum: 0=BO1, 1=BO3, 2=BO5) is attached to every game of a series
      // identically, so the first game seen fixes it for the group.
      entry = { ids: new Set(), ts: startTime, radiantTeam, direTeam, tournament: m.league_name, seriesType: m.series_type, games: [] }
      seriesMap.set(key, entry)
    }
    entry.ids.add(String(matchId))
    if (startTime < entry.ts) entry.ts = startTime
    // Per-game result in the exact shape isSeriesComplete() expects (radiantTeam/direTeam/
    // radiantWin) — the SAME completion logic the homepage feed uses (src/seriesLogic.js),
    // not a reimplementation. Only recorded when radiant_win is a real boolean; an unknown
    // result is never guessed at (isSeriesComplete already treats a missing game as
    // "not this team's win" via undefined !== true, so omitting is equally safe, but being
    // explicit keeps the games array free of games we have no result for).
    if (typeof m.radiant_win === 'boolean') {
      entry.games.push({ radiantTeam, direTeam, radiantWin: m.radiant_win })
    }
  }

  return [...seriesMap.values()]
    .map(e => ({
      ids: [...e.ids],
      ts: e.ts,
      radiantTeam: e.radiantTeam,
      direTeam: e.direTeam,
      tournament: e.tournament,
      seriesType: e.seriesType,
      isSeriesComplete: isSeriesComplete({ seriesType: e.seriesType, games: e.games }),
    }))
    .slice(0, maxSeries)
}

export default async function handler(req, res) {
  const log = createLogger('/api/live-matches')
  if (setCorsHeaders(req, res, { allowAll: true })) return

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  // Push subscription: upsert endpoint + team list + prefs into Supabase (push_subscriptions,
  // pending-refactors #16 — replaces the KV push:sub/push:teams/push:prefs/push:team:{name} keys).
  if (req.method === 'POST' && req.query?.mode === 'push-subscribe') {
    try {
      const { subscription, teamNames } = req.body || {}
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription endpoint' })
      if (!process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Push not configured' })
      const userId = createHmac('sha256', process.env.VAPID_PRIVATE_KEY)
        .update(subscription.endpoint)
        .digest('hex')
        .slice(0, 32)
      // Lowercased at write time: push_subscriptions.teams is matched in dispatchPush via
      // Postgres `overlaps` against [teamA.toLowerCase(), teamB.toLowerCase()] — there is no
      // reverse-index key anymore to case-fold at query time, so it has to happen here instead.
      const teams = (Array.isArray(teamNames) ? teamNames : []).map(t => String(t).toLowerCase())

      // Merge incoming prefs over stored prefs. The auto re-subscribe on follow-change
      // (App.jsx) sends only { tz }, so a naive overwrite would wipe the user's type
      // toggles / quiet hours set in Settings — merge preserves them.
      const { data: existingRow } = await getSupabaseAdmin()
        .from('push_subscriptions')
        .select('prefs')
        .eq('user_id', userId)
        .maybeSingle()
      const prevPrefs = normalizePrefs(existingRow?.prefs)
      const incoming = (req.body?.prefs && typeof req.body.prefs === 'object') ? req.body.prefs : {}
      const inTypes = (incoming.types && typeof incoming.types === 'object') ? incoming.types : {}
      const storedPrefs = normalizePrefs({
        tz: typeof incoming.tz === 'string' ? incoming.tz : prevPrefs.tz,
        types: {
          soon: inTypes.soon ?? prevPrefs.types.soon,
          live: inTypes.live ?? prevPrefs.types.live,
          replay: inTypes.replay ?? prevPrefs.types.replay,
          score: inTypes.score ?? prevPrefs.types.score,
        },
        quietStart: incoming.quietStart !== undefined ? incoming.quietStart : prevPrefs.quietStart,
        quietEnd: incoming.quietEnd !== undefined ? incoming.quietEnd : prevPrefs.quietEnd,
      })

      // Full overwrite of `teams` on every call — no reverse index to diff/maintain, unlike the
      // old KV push:team:{name} keys. A relational `overlaps` query at send time replaces it.
      const { error } = await getSupabaseAdmin()
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh || null,
          auth: subscription.keys?.auth || null,
          teams,
          prefs: storedPrefs,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      if (error) throw error

      return res.status(200).json({ ok: true })
    } catch (err) {
      log.error('push-subscribe error', { error: err?.message })
      return res.status(500).json({ error: 'Failed to store subscription' })
    }
  }

  // Test notification: sends one push to the requesting device so a user can verify
  // the full pipeline (server -> APNs/FCM -> device) right after enabling alerts.
  // Delivery targets only the posted subscription, which only that browser holds, so
  // no auth needed beyond an IP rate limit against send spam.
  if (req.method === 'POST' && req.query?.mode === 'push-test') {
    if (!process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Push not configured' })
    const { subscription } = req.body || {}
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription endpoint' })
    const allowed = await rateLimitByIp(req, kv, 'push-test', 3)
    if (!allowed) return res.status(429).json({ error: 'Too many test notifications. Try again in a minute.' })
    try {
      const webpush = await ensureWebpush()
      await webpush.sendNotification(subscription, JSON.stringify({
        title: 'Notifications are on',
        body: "You'll get an alert before your teams play",
        url: '/',
        tag: 'push-test',
      }))
      return res.status(200).json({ ok: true })
    } catch (err) {
      log.warn('push-test send failed', { status: err?.statusCode, error: err?.message })
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        return res.status(410).json({ error: 'Subscription expired. Re-enable alerts and try again.' })
      }
      return res.status(502).json({ error: 'Push service rejected the send' })
    }
  }

  // Cron mode: cache stream channels and send push notifications for live matches.
  // Bypasses the KV read cache so it always fetches fresh data from PandaScore.
  // Uses nx:true writes so the first recorded channel is never overwritten.
  if (req.query?.cron === '1') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end()
    }
    try {
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      const response = await fetch(`${PANDASCORE_BASE}/matches/running?sort=begin_at&page[size]=100`, { headers })
      // Before the throw: a 429 still carries the quota header. Awaited only on the failure path
      // so the KV write isn't lost to lambda freeze. See recordPsQuota in _shared.js.
      const quota = recordPsQuota(response, 'live-matches:cron-capture')
      if (!response.ok) {
        await quota
        throw new Error(`PandaScore error: ${response.status}`)
      }
      const [data, tier1NamesCron] = await Promise.all([
        response.json(),
        kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
      ])
      const hardcoded = PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
      const namesCron = [...new Set([
        ...(Array.isArray(tier1NamesCron) ? tier1NamesCron.map(n => n.toLowerCase()) : []),
        ...hardcoded,
      ])]
      const tier1 = (data || []).filter(m => (isTier1(m) || isTier1ByName(m, namesCron)) && m.opponents?.length === 2)
      await enrichMultiStreamMatches(tier1, headers)
      const written = await cacheRunningStreams(tier1)
      const mappedForPush = tier1.map(mapMatch)
      // Now-live stays on this 15-min capture cron (decision D3). Same series-level dedup
      // key as before (push:sent:{id}); buildPushPayload now deep-links to /?m=<id>.
      await sendPushForMatches(mappedForPush, { type: 'live', dedupPrefix: 'push:sent', dedupTtl: 24 * 3600 })
        .catch(err => log.warn('push error', { error: err?.message }))
      // Opt-in live-score ping. Runs after the stream capture and the now-live send, and its
      // failure must never fail either of them.
      const scoresSent = await sendScorePings(tier1, mappedForPush, log)
        .catch(err => { log.warn('score ping error', { error: err?.message }); return 0 })
      log.info('cron complete', { written, scoresSent })
      return res.status(200).json({ written, scoresSent })
    } catch (err) {
      await trackError('/api/live-matches', 500, err?.message)
      log.error('cron error', { error: err?.message })
      return res.status(500).json({ error: err?.message })
    }
  }

  // push-scan cron: the reliable QStash trigger (*/3) for the "starting soon" alert.
  // Decoupled from the stream-capture cron so timing tracks match kickoff, not stream
  // sampling. Fetches ONLY upcoming matches (now-live stays on cron=1 per decision D3) and
  // fires ~5 min before start (T-5). Does not touch any stream-cache write path.
  if (req.query?.cron === 'push-scan') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end()
    }
    if (!process.env.VAPID_PRIVATE_KEY) return res.status(200).json({ sent: 0, reason: 'push not configured' })
    try {
      const now = Date.now()
      const LEAD_MS = 5 * 60 * 1000   // fire when a match starts within the next 5 min (T-5)
      const GRACE_MS = 5 * 60 * 1000  // tolerate slightly-late feed entries; dedup prevents repeats
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      // Narrow window: matches scheduled from GRACE_MS ago to ~15 min out (covers */3 jitter).
      // The lower bound must reach into the past so the GRACE_MS fire condition below can
      // catch a match whose start time just slipped but hasn't gone live yet.
      const from = new Date(now - GRACE_MS).toISOString()
      const to = new Date(now + 15 * 60 * 1000).toISOString()
      const [response, tier1NamesRaw] = await Promise.all([
        fetch(`${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=50&range[scheduled_at]=${from},${to}`, { headers }),
        kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
      ])
      const quota = recordPsQuota(response, 'live-matches:cron-push-scan')
      if (!response.ok) {
        await quota
        throw new Error(`PandaScore error: ${response.status}`)
      }
      const names = [...new Set([
        ...(Array.isArray(tier1NamesRaw) ? tier1NamesRaw.map(n => n.toLowerCase()) : []),
        ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
      ])]
      const data = await response.json()
      const soon = (data || [])
        .filter(m => (isTier1(m) || isTier1ByName(m, names)) && m.opponents?.length === 2)
        .filter(m => {
          const t = Date.parse(m.scheduled_at || m.begin_at || '')
          return Number.isFinite(t) && t <= now + LEAD_MS && t >= now - GRACE_MS
        })
        .map(mapMatch)
      const sent = await sendPushForMatches(soon, { type: 'soon', dedupPrefix: 'push:sent:soon', dedupTtl: 24 * 3600 })
      log.info('push-scan complete', { candidates: soon.length, sent })
      return res.status(200).json({ candidates: soon.length, sent })
    } catch (err) {
      await trackError('/api/live-matches', 500, err?.message)
      log.error('push-scan error', { error: err?.message })
      return res.status(500).json({ error: err?.message })
    }
  }

  // warm-streams cron: autonomously fuzzy-bind completed tier-1 series to a Twitch
  // channel without waiting for a browser to open the drawer. cacheRunningStreams()
  // can only write stream:match when external_identifier is set (null on qualifiers),
  // so unopened series would otherwise never get a record. This drives the existing
  // /api/match-streams resolver (KV → PS fuzzy → ts-bucket) per series, which writes
  // KV + Supabase. It does NOT modify any locked stream-cache write path.
  if (req.query?.cron === 'warm-streams') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end()
    }
    try {
      const nowSec = Math.floor(Date.now() / 1000)
      const minStart = nowSec - WARM_LOOKBACK_S

      // /promatches returns only ~100 matches per page (all of pro Dota), which on a busy
      // multi-region day covers just a few hours — far short of the 24h lookback. Page back
      // with less_than_match_id until the oldest match predates the window (or the page cap).
      const odMatches = []
      let cursor = null
      for (let page = 0; page < WARM_MAX_PAGES; page++) {
        const url = cursor
          ? `https://api.opendota.com/api/promatches?less_than_match_id=${cursor}`
          : 'https://api.opendota.com/api/promatches'
        const odRes = await fetch(url)
        if (!odRes.ok) {
          if (page === 0) {
            log.warn('warm-streams: OpenDota fetch failed', { status: odRes.status })
            return res.status(502).json({ error: 'OpenDota fetch failed' })
          }
          break // partial coverage is fine; bind what we have
        }
        const pageData = await odRes.json()
        if (!Array.isArray(pageData) || pageData.length === 0) break
        odMatches.push(...pageData)
        const oldest = pageData[pageData.length - 1]
        cursor = oldest?.match_id
        if (!cursor || (oldest.start_time && oldest.start_time < minStart)) break
        await new Promise(resolve => setTimeout(resolve, WARM_DELAY_MS))
      }

      const kvNames = await kv.get(KV_TIER1_NAMES_KEY).catch(() => null)
      const tier1Names = [...new Set([
        ...(Array.isArray(kvNames) ? kvNames : []),
        ...PERMANENT_TIER1_NAMES,
        ...TIER1_LEAGUE_KEYWORDS,
      ].map(n => n.toLowerCase()))]

      const series = selectSeriesToWarm(odMatches, { tier1Names, nowSec, lookbackSec: WARM_LOOKBACK_S })

      // Fixed production origin — never the request Host header (untrusted, spoofable).
      // The self-call always targets prod, which shares the same KV + Supabase, so this
      // is correct even when invoked from a preview deployment.
      const base = 'https://spectateesports.live'
      // Per-game start times so each sibling row gets its OWN started_at in Supabase
      // rather than inheriting the series-minimum ts. Built once from the already-fetched
      // odMatches array; the lookup is O(1) per game via Map.
      const odStartById = new Map(odMatches.map(m => [String(m.match_id), m.start_time]))
      let attempted = 0, bound = 0, skipped = 0
      for (const s of series) {
        // Skip series already fully bound in KV so we don't re-run the PS fuzzy match.
        const keys = s.ids.map(id => `stream:match:${id}`)
        const existing = await kv.mget(...keys).catch(() => [])
        if (existing.length === s.ids.length && existing.every(Boolean)) { skipped++; continue }

        attempted++
        const startPairs = s.ids
          .map(id => { const t = odStartById.get(id); return t ? `${id}:${t}` : null })
          .filter(Boolean)
        const params = new URLSearchParams({
          ids: s.ids.join(','),
          ts: String(s.ts),
          radiantTeam: s.radiantTeam,
          direTeam: s.direTeam,
          ...(startPairs.length > 0 ? { starts: startPairs.join(',') } : {}),
        })
        try {
          const r = await fetch(`${base}/api/match-streams?${params.toString()}`)
          if (r.ok) {
            const body = await r.json()
            if (s.ids.some(id => body?.[id])) {
              bound++
              // WS3 replay-ready: fire only once the SERIES (not just a game within it) is
              // won — s.isSeriesComplete checks the win threshold for s.seriesType against
              // games visible in this run's window. Without this gate, a channel binding
              // for Game 1 of an in-progress BO3 would fire "replay is up" for a series
              // that's still 1-0 (regression: EWC 2026 Liquid vs Xtreme, 2026-07-14 — see
              // pending-refactors for the KV cleanup this required). Channel binding itself
              // stays unconditional above; only the notification is gated. Fire once per
              // series (7d dedup) to followers of either team. Additive read of the bind
              // result — touches no locked stream-cache write path. Awaited so sends
              // complete before the function freezes (cf. commit 88d9b26). OD names are
              // resolved to the canonical followable org so the follower index is hit even
              // when OpenDota diverges (e.g. "BoomBoys" -> "BetBoom Team").
              if (s.isSeriesComplete) {
                const numericIds = s.ids.map(Number).filter(Number.isFinite)
                const anchorId = numericIds.length ? Math.min(...numericIds) : s.ids[0]
                const replayMatch = {
                  teamA: resolveFollowedTeamName(s.radiantTeam),
                  teamB: resolveFollowedTeamName(s.direTeam),
                  tournament: s.tournament,
                  id: anchorId,
                }
                await dispatchPush(replayMatch, { type: 'replay', dedupPrefix: 'push:sent:replay', dedupTtl: REPLAY_DEDUP_TTL })
                  .catch(err => log.warn('warm-streams: replay push failed', { error: err?.message }))
              }
            }
          }
        } catch (err) {
          log.warn('warm-streams: self-call failed', { error: err?.message })
        }
        await new Promise(resolve => setTimeout(resolve, WARM_DELAY_MS))
      }

      const summary = {
        scanned: Array.isArray(odMatches) ? odMatches.length : 0,
        series: series.length,
        attempted,
        bound,
        skipped,
        ran_at: new Date().toISOString(),
      }
      await kv.set('warm:stream-history:latest', summary, { ex: 8 * 24 * 3600 }).catch(() => {})
      log.info('warm-streams complete', summary)
      return res.status(200).json(summary)
    } catch (err) {
      await trackError('/api/live-matches', 500, err?.message)
      log.error('warm-streams error', { error: err?.message })
      return res.status(500).json({ error: err?.message })
    }
  }

  // CACHE POLICY — measured, not modeled. Read this whole block before changing any number here.
  //
  // 2026-08-16: `stale-while-revalidate` RESTORED at 30. `s-maxage` stays 150 and `TTL` stays 120 —
  // this change adds ONE token and touches nothing else. It reverses the 08-15 decision to drop swr,
  // which shipped with its own falsification test attached: "re-run the same query ~1h after shipping
  // and compare against the 666/hr baseline. If it has not moved materially, this change is not
  // working — revert rather than tuning blind." It moved, in the wrong direction.
  //
  // WHAT WAS MEASURED (2026-08-16, `source=serverless` + `group_by=requestPath`, the same query shape
  // as the 666/hr baseline; log retention is ~1h, so these ARE hourly rates and not day totals):
  //     /api/live-matches      s-maxage=150, no swr  -> 1,097 invocations/hr  (was 666 at s-maxage=30)
  //     /api/upcoming-matches  s-maxage=300, swr=300 ->    15 invocations/hr
  // Both are fetched in the SAME `Promise.all` in src/App.jsx (`fetchLiveData`, polled at 120s by
  // useVisiblePolling). That is now VERIFIED rather than assumed: the only other client caller,
  // src/components/UpcomingMatches.jsx, is DEAD CODE — nothing imports it. So client request counts
  // really are 1:1 and traffic volume cancels out of the comparison entirely.
  //
  // Normalising per edge expiry makes the mechanism unambiguous:
  //     live-matches:     (1097 - ~28 cron) / (3600/150) = ~44.5 origin hits per expiry
  //     upcoming-matches:  15 / (3600/300)               =  ~1.25 origin hits per expiry
  // swr is what collapses 44.5 -> 1.25. The 08-15 note argued swr "does not reduce origin invocations
  // IN STEADY STATE", hedging that it only absorbs requests arriving WHILE a revalidation is in
  // flight. That hedge is the entire effect: at 120s client polling every expiry releases a herd of
  // near-simultaneous requests, and foreground revalidation does not coalesce them — each one is a
  // separate invocation that ALSO misses KV (see below) and pays a full regen. swr coalesces them.
  //
  // WHY swr=30 AND NOT 240. swr only has to outlast a single revalidation for the herd to collapse;
  // it does NOT need to cover the gap to the next poll. A TYPICAL regen here takes ~1-5s, so 30s
  // clears the median by 6-30x, and every second beyond that is pure worst-case staleness for no
  // further saving. This is the correction to the 08-15 reasoning that matters: swr's COST is
  // proportional to its length, but its BENEFIT saturates almost immediately. Dropping it entirely
  // threw away a large benefit to avoid a cost only a large value would have incurred.
  // Honest about the tail, though: `maxDuration` is 30 (see config below), so a worst-case regen —
  // cold start, slow PandaScore, a wide enrichMultiStreamMatches fan-out — can consume the whole swr
  // window before being killed. In that tail the edge stops serving stale mid-revalidation and part
  // of the herd returns, i.e. it degrades to exactly today's behaviour rather than to something
  // worse, and `stale-if-error=120` covers the failure case. Raising swr to chase that tail would
  // spend budget on the rare case; leave it at 30.
  //
  // WHY `s-maxage` IS NOT LOWERED. A draft of this change also cut s-maxage 150 -> 60, on the theory
  // that `s-maxage` > `TTL` is a defect: the edge entry outlives the KV entry, so every revalidation
  // finds KV expired and pays a full regen instead of the cheap `serving from KV cache` path. That
  // observation is TRUE but the fix is backwards, and the pinned-s-maxage test caught it. Once swr
  // collapses the herd, origin invocations ARE revalidations, ~3600/s-maxage of them, and every one
  // is a regen either way — so a LOWER s-maxage strictly costs more:
  //     s-maxage=150 + swr: 24 invocations/hr, all regen           -> 24 regens/hr
  //     s-maxage=60  + swr: 60 invocations/hr, ~half hit warm KV   -> 30 regens/hr + 30 cheap
  // The `s-maxage` > `TTL` inversion only bites while the herd inflates invocations far above the
  // TTL-imposed regen ceiling. With the herd gone it is moot, and 150 also keeps the margin over
  // App.jsx's 120s poll interval that the contract test pins. Leave it at 150.
  //
  // EXPECTED RESULT: ~1,069 public invocations/hr -> ~24/hr, essentially the 44.5x herd factor. The
  // ~28/hr of QStash cron modes below carry their own query params, bypass the edge cache entirely,
  // and are unaffected — after this change they are the MAJORITY of what this endpoint still costs,
  // and `?cron=push-scan` at */3 is the single biggest remaining item.
  //
  // Fluid bills ACTIVE CPU, not wall time, so the regen path's many awaited fetches are largely
  // unbilled; the real cost is JSON.parse of the ~100-match PandaScore response plus the map/filter/
  // stringify passes. That is why cutting the REGEN COUNT matters far more than cutting fetch count.
  //
  // FRESHNESS: worst-case served age becomes s-maxage 150 + swr 30 + KV 120 = 300s, against the 270s
  // budget the 08-15 pass agreed. That +30s (+11%) is the entire price of this change and it is a
  // deliberate, owner-approved widening of the budget — the contract test asserting 270 was updated
  // in the same commit, not worked around. The swr tail is also only reachable when traffic is too
  // sparse for a background revalidation to have completed, i.e. when nobody is watching; under load
  // the entry refreshes continuously and typical served age is unchanged at ~150s. `stale-if-error`
  // is kept at 120 exactly as the 08-15 pass left it.
  //
  // VOD SYSTEM INTERACTION — checked deliberately, because cacheRunningStreams() below is part of the
  // LOCKED VOD replay chain and runs ONLY on the regen path (a KV hit returns before reaching it).
  // Be precise about what the `stream:ts:{roundedTs}` key IS: `roundedTs` derives from the game's own
  // `begin_at`, NOT from wall clock (see the write itself, ~line 201), so a running game maps to
  // exactly ONE bucket for its entire life. There is no stream of wall-clock buckets to keep covered
  // and no per-bucket sample rate to protect — an earlier draft of this note asserted both and was
  // wrong. THE REAL INVARIANT is the `game.status === 'running'` guard beside it: at least one regen
  // must land while a given game is running. That window is tens of minutes against a regen every
  // ~150s, i.e. enormous slack, and still more frequent than the dedicated `?cron=1` stream-capture
  // schedule (*/15) that exists as the backstop for precisely this write.
  //
  // The sampling CADENCE is not really changing either. The ~44.5 requests per expiry all arrived
  // inside one ~1-5s revalidation window, so they were 44.5 SIMULTANEOUS regens, not 44.5 separate
  // observation moments — distinct origin-contact times were ~one per 150s before and after. What is
  // removed is redundancy: the same bucket rewritten ~89 times over (`stream:match` is nx:true, so
  // nearly all of that was already a no-op). Coverage is unchanged.
  //
  // NO single-flight lock was added around the KV miss, deliberately. It would gate cacheRunningStreams
  // and therefore needs explicit owner approval under the VOD lock — and swr makes it near-redundant
  // anyway, since it removes the herd that made concurrent regens possible in the first place.
  //
  // `?bust=1` is a distinct edge cache key, so it must opt out explicitly or the busted response would
  // itself be cached and defeat the next bust. This does NOT purge the normal key's cached response;
  // that drains over `s-maxage` + `swr`, ~180s.
  if (req.query?.bust === '1') {
    res.setHeader('Cache-Control', 'no-store')
    await kv.del(KV_KEY)
    log.info('cache cleared')
  } else {
    res.setHeader('Cache-Control', 's-maxage=150, stale-while-revalidate=30, stale-if-error=120')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      log.info('serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    log.warn('KV cache read failed', { error: err?.message })
  }

  try {
    log.info('fetching from PandaScore')
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    const [response, tier1Names] = await Promise.all([
      fetch(`${PANDASCORE_BASE}/matches/running?sort=begin_at&page[size]=100`, { headers }),
      kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
    ])
    const quota = recordPsQuota(response, 'live-matches:public')
    if (!response.ok) {
      await quota
      throw new Error(`PandaScore error: ${response.status}`)
    }

    const names = [...new Set([
      ...(Array.isArray(tier1Names) ? tier1Names.map(n => n.toLowerCase()) : []),
      ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
    ])]
    const data = await response.json()
    const tier1Raw = (data || [])
      .filter(m => isTier1(m) || isTier1ByName(m, names))
      .filter(m => m.opponents?.length === 2)
    await enrichMultiStreamMatches(tier1Raw, headers)
    const matches = tier1Raw.map(mapMatch)

    // Enrich finished games with OD match IDs from KV (live:game:{psId}:{position}).
    // external_identifier is only populated while a game is running; once it finishes
    // we rely on the KV entry written by cacheRunningStreams() during that window.
    const finishedGames = [] // { matchIdx, gameIdx, psMatchId, position }
    matches.forEach((match, mi) => {
      match.games.forEach((game, gi) => {
        if (game.status === 'finished' && !game.matchId) {
          finishedGames.push({ matchIdx: mi, gameIdx: gi, psMatchId: match.id, position: game.position })
        }
      })
    })
    if (finishedGames.length > 0) {
      try {
        const kvKeys = finishedGames.map(({ psMatchId, position }) => `live:game:${psMatchId}:${position}`)
        const kvValues = await kv.mget(...kvKeys)
        finishedGames.forEach(({ matchIdx, gameIdx }, i) => {
          if (kvValues[i]) matches[matchIdx].games[gameIdx].matchId = String(kvValues[i])
        })
      } catch (err) {
        log.warn('live:game KV enrichment failed', { error: err?.message })
      }
    }

    // Live "worth watching" signal — computed unconditionally into the CACHED payload (cheap: one
    // batched query + one pipelined KV mget/set per ~2-min regen, reusing resolveRunningPulses).
    // Entire enrichment sits in one try/catch: any failure here (Supabase, KV, the pure helpers)
    // must never affect the primary matches payload, which is the product's highest-traffic surface.
    try {
      if (await isFeatureEnabled('live-signal', kv)) {
        const signals = await resolveLiveSignals(tier1Raw, log)
        matches.forEach(m => {
          const state = signals.get(m.id)
          if (state) m.signal = state
        })
      }
    } catch (err) {
      log.warn('live-signal enrichment failed', { error: err?.message })
    }

    // In-game clock (elapsed minutes) for the homepage row — same batched pulse read as the
    // signal block above (reusing resolveRunningPulses, not a second PS↔OD matcher), isolated in
    // its own try/catch so a failure here never affects the primary matches payload.
    try {
      const pulses = await resolveRunningPulses(tier1Raw, log)
      matches.forEach(m => {
        const hit = pulses.get(m.id)
        if (hit && Number.isFinite(hit.pulse.gameTime)) m.gameTime = hit.pulse.gameTime
      })
    } catch (err) {
      log.warn('game-time enrichment failed', { error: err?.message })
    }

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      log.warn('KV cache write failed', { error: err?.message })
    }

    // Store game start timestamp → channel for single-stream matches.
    // Keyed by begin_at rounded to 5 min so OpenDota's start_time (close but not identical) can look it up.
    await cacheRunningStreams(tier1Raw)

    return res.status(200).json(payload)

  } catch (err) {
    await trackError('/api/live-matches', 500, err?.message)
    log.error('fetch failed', { error: err?.message })
    return res.status(500).json({ error: 'Failed to fetch live matches', message: err?.message })
  }
}

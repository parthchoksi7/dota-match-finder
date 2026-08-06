import { kv } from '../_kv.js'
import { diffSnapshots, indexGamesById, resolveMarqueeItemIds } from '../_liveStoryDiff.js'
import { teamPairMatch } from '../../src/teamMatching.js'

// Live Story — Valve `GetLiveLeagueGames` capture + event derivation.
//
// ONE global HTTP call returns every currently-live league game with a full per-player
// scoreboard, so unlike the OpenDota capture this does no per-match work at all: fetch, diff
// against the previous snapshot, append the derived events. Cost is independent of how many
// games are live (~9% of the 100k/day Steam ToU cap even at a continuous 10s poll).
//
// TRIGGER — no dedicated QStash schedule. Two callers of captureLiveStoryOnce:
// (1) AdminLiveStoryPage.jsx's 15s client poll while the admin page is open — the KV lock (below)
//     floors the real cadence to ~30s in this case.
// (2) api/tournaments.js's `?mode=od-live-capture` branch, piggybacking every ~15 min onto the
//     EXISTING QStash schedule of that name (scripts/setup-qstash-schedules.mjs) rather than
//     adding a new one — zero new messages/schedules, same reliable-at-declared-cadence QStash
//     behavior every other cron on this project already depends on. This is what covers
//     unattended windows; before it was wired in (confirmed live 2026-08-06) capture only ran
//     while a human had the admin page open, and a match's first ~10-12 minutes went uncaptured
//     because nobody was polling yet.
//
// SNAPSHOT_TTL_S is set well above the ~15-min backstop interval (not equal to it) specifically
// to survive real QStash jitter — a TTL sitting exactly on the trigger interval risks the
// previous snapshot expiring moments before the next tick reads it, permanently stranding the
// differ in a baseline-less "reseed and derive nothing" loop every single tick.
//
// STORAGE — KV only, deliberately. Supabase free tier is 500 MB shared with live_game_map,
// live_game_gold, match_stream_history and push_subscriptions, and the real remaining headroom
// has never been measured. Writing events to Postgres before that number is known risks filling
// the tier mid-tournament. KV rings with TTLs cost nothing and are sufficient for the admin
// verification window; the Supabase schema in the investigation doc is deferred until after TI.
//
// FAIL-OPEN throughout: every failure path returns a shaped result and logs. Nothing here may
// break a request that also serves live scores.

const GLLG_URL = 'https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/'

// Faster than liveOdCapture's 60s: that one is throttling an OpenDota call whose data only
// refreshes ~1/min anyway, whereas this is a single cheap call against a 100k/day budget, and
// event RESOLUTION is bounded by poll interval — at 60s a teamfight and scattered farm kills
// become indistinguishable. 30s is the useful floor given the 40s client poll above it.
const LOCK_KEY = 'capture:live-story:lock'
const LOCK_TTL_S = 30

// The trimmed previous snapshot the differ compares against. TTL (20 min) is deliberately wider
// than the ~15-min backstop interval — see the jitter-margin note above.
const SNAPSHOT_KEY = 'live-story:snap:v1'
const SNAPSHOT_TTL_S = 1200

// Per-match event ring. TTL comfortably outlives a long game plus a between-games gap.
const EVENTS_KEY = (matchId) => `live-story:events:v1:${matchId}`
const EVENTS_TTL_S = 21600 // 6h
const EVENTS_MAX = 250

// The exact pair the differ last saw, kept for the admin snapshot inspector. This is the
// root-cause tool that substitutes for Vercel Log Drains (unavailable on the free plan) — without
// it, a wrong event during TI could only be debugged by redeploying with ad-hoc logging.
const LAST_PAIR_KEY = 'live-story:pair:v1'
const LAST_PAIR_TTL_S = 3600

// The tier-1 match ids currently being captured. Upstash's REST client charges per command, and a
// KEYS scan over an event-ring key pattern is both slow and a needless cost at this scale — a
// handful of tier-1 games at once. Written every successful tick regardless of whether a diff was
// possible, so the admin page can enumerate live matches even on the very first tick after a cold
// start (no baseline yet, but the match IS being tracked).
const TRACKED_KEY = 'live-story:tracked:v1'
const TRACKED_TTL_S = SNAPSHOT_TTL_S

// Rolling run summary for the in-app monitor.
const HEALTH_KEY = 'live-story:health:v1'
const HEALTH_TTL_S = 86400

// Item id -> { key, dname } map. SAME key as api/_handlers/matchStats.js's ITEM_MAP_KV_KEY —
// deliberately, so this never pays for a second independent OpenDota constants fetch/cache when
// matchStats.js has already warmed it. Must stay byte-identical to that key if it ever changes.
const ITEM_MAP_KV_KEY = 'opendota:item_map_v2'
const ITEM_MAP_TTL_S = 60 * 60 * 24 // matches matchStats.js's 24h TTL — item names rarely change

// The tier-1-filtered live PandaScore payload api/live-matches.js already caches. Read-only —
// this capture never writes it, and a miss simply means nothing is correlated this tick.
const PS_LIVE_KEY = 'dota2:live_matches_v5'

// Strips the response down to the fields the differ and the live display actually read, before
// it goes into KV. The raw response is ~245 KB per poll; storing that every 30s is pure waste,
// and Upstash bills on bandwidth. Dropped: position_x/y, abilities[], ultimate_state/cooldown,
// respawn_timer, picks/bans (players[].hero_id already carries the draft), team_logo.
// Everything retained is either differ input or something the single-source live surface renders.
// Which live Valve games correspond to a tier-1 PandaScore series. Correlation uses the shared
// `teamPairMatch` (src/teamMatching.js) — the SAME alias/nickname table every other PS-adjacent
// matcher in this codebase uses. Never hand-roll a second name matcher here.
//
// This is a bandwidth control as much as a product rule. Measured: the full trimmed snapshot of
// 43 live league games is ~143 KB, and a read+write every 30s is ~800 MB/day of Upstash traffic —
// far past the free tier. Tier-1 is typically 1-8 games, i.e. ~3-27 KB, which lands in the tens
// of MB/day. It is also exactly what the product wants: the site only ever shows tier-1.
//
// `psMatches` is the already-cached `/api/live-matches` payload (KV `dota2:live_matches_v5`),
// which is tier-1-filtered upstream, so no tier rule is re-implemented here either.
//
// IMPORTANT: only PS series with a game actually `running` are eligible. PandaScore keeps
// reporting a series as live through between-game gaps (verified 2026-08-05: Team Liquid vs 1win
// showed currentGame=null with G1 finished and G2 not started), and Valve correctly lists no game
// then. Correlating on series status instead would strand those series in a permanent
// "no events" state and look like a matcher bug.
export function selectTier1MatchIds(response, psMatches) {
  const keep = new Set()
  // dota2:live_matches_v5 is NEVER a bare array — api/live-matches.js writes and reads
  // { matches: [...], fetchedAt } (see its `payload` at the KV write site). Accepting a bare
  // array too costs nothing and matches how this same payload is consumed elsewhere ad hoc.
  const live = Array.isArray(psMatches) ? psMatches : Array.isArray(psMatches?.matches) ? psMatches.matches : []
  const running = live.filter(m => (m?.games || []).some(g => g?.status === 'running'))
  if (running.length === 0) return keep
  for (const g of indexGamesById(response).values()) {
    const r = g.radiant_team?.team_name
    const d = g.dire_team?.team_name
    if (!r || !d) continue
    for (const m of running) {
      if (teamPairMatch(m.teamA, m.teamB, r, d)) {
        keep.add(String(g.match_id))
        break
      }
    }
  }
  return keep
}

// `keepIds` — optional Set of match_ids to retain. Omitted keeps every game, which is what the
// fixtures and the admin inspector want; the live capture always passes a tier-1 set.
export function trimSnapshot(response, keepIds = null) {
  const games = []
  for (const g of indexGamesById(response).values()) {
    if (keepIds && !keepIds.has(String(g.match_id))) continue
    const sb = g.scoreboard
    games.push({
      match_id: g.match_id,
      league_id: g.league_id,
      stream_delay_s: g.stream_delay_s,
      spectators: g.spectators,
      series_type: g.series_type,
      radiant_series_wins: g.radiant_series_wins,
      dire_series_wins: g.dire_series_wins,
      radiant_team: g.radiant_team ? { team_name: g.radiant_team.team_name, team_id: g.radiant_team.team_id } : null,
      dire_team: g.dire_team ? { team_name: g.dire_team.team_name, team_id: g.dire_team.team_id } : null,
      // Top-level players[] is the ONLY place live IGNs appear (scoreboard players carry no
      // name). Broadcasters (team 2) are dropped here rather than downstream.
      players: (g.players || [])
        .filter(p => p && (p.team === 0 || p.team === 1))
        .map(p => ({ account_id: p.account_id, name: p.name, hero_id: p.hero_id, team: p.team })),
      scoreboard: sb ? {
        duration: sb.duration,
        roshan_respawn_timer: sb.roshan_respawn_timer,
        radiant: trimSide(sb.radiant),
        dire: trimSide(sb.dire),
      } : null,
    })
  }
  return { result: { games } }
}

function trimSide(side) {
  if (!side) return null
  return {
    score: side.score,
    tower_state: side.tower_state,
    barracks_state: side.barracks_state,
    players: (side.players || []).map(p => ({
      player_slot: p.player_slot,
      account_id: p.account_id,
      hero_id: p.hero_id,
      level: p.level,
      kills: p.kills,
      death: p.death,
      assists: p.assists,
      last_hits: p.last_hits,
      denies: p.denies,
      gold: p.gold,
      gold_per_min: p.gold_per_min,
      xp_per_min: p.xp_per_min,
      net_worth: p.net_worth,
      item0: p.item0, item1: p.item1, item2: p.item2,
      item3: p.item3, item4: p.item4, item5: p.item5,
    })),
  }
}

// Loads the shared item map, tolerating every failure by returning an empty Set — which makes
// ItemPurchased silently absent rather than making the whole capture fail or, worse, emitting
// every boot and clarity as a "marquee" purchase.
async function loadMarqueeIds(log) {
  try {
    let itemNames = await kv.get(ITEM_MAP_KV_KEY)
    if (!itemNames) {
      const res = await fetch('https://api.opendota.com/api/constants/items')
      if (!res.ok) return new Set()
      const data = await res.json()
      itemNames = {}
      for (const [name, meta] of Object.entries(data)) {
        if (meta?.id != null) itemNames[meta.id] = { key: name, dname: meta.dname || name.replace(/_/g, ' ') }
      }
      kv.set(ITEM_MAP_KV_KEY, itemNames, { ex: ITEM_MAP_TTL_S })
        .catch(err => log.warn('item-map KV write failed', { error: err?.message }))
    }
    return resolveMarqueeItemIds(itemNames)
  } catch (err) {
    log.warn('item map load failed', { error: err?.message })
    return new Set()
  }
}

// Appends events to each match's ring, newest last, capped at EVENTS_MAX. Read-modify-write is
// safe here because the KV lock guarantees a single writer per window. A per-match failure is
// logged and skipped rather than aborting the whole run — one bad match must not cost the others
// their events.
async function appendEvents(events, log) {
  const byMatch = new Map()
  for (const e of events) {
    if (!byMatch.has(e.odMatchId)) byMatch.set(e.odMatchId, [])
    byMatch.get(e.odMatchId).push(e)
  }
  let written = 0
  for (const [matchId, list] of byMatch) {
    try {
      const key = EVENTS_KEY(matchId)
      const existing = (await kv.get(key)) || []
      const merged = [...(Array.isArray(existing) ? existing : []), ...list].slice(-EVENTS_MAX)
      await kv.set(key, merged, { ex: EVENTS_TTL_S })
      written += list.length
    } catch (err) {
      log.warn('event ring write failed', { matchId, error: err?.message })
    }
  }
  return written
}

// One capture tick. Exported so a read path can nudge it the same way liveGamePulse.js nudges
// captureOdLiveOnce — that nudge is what makes a viewer's presence the high-frequency trigger and
// keeps QStash out of the fast path entirely.
export async function captureLiveStoryOnce(log) {
  const startedAt = Date.now()
  try {
    if (!process.env.STEAM_API_KEY) {
      // Logged (unlike the throttled/no-lock skip below, which is routine): a missing key is a
      // real misconfiguration, and this endpoint is now the primary unattended trigger — silently
      // returning ok:true here would let a broken deploy report "healthy" indefinitely with zero
      // events captured and no visibility, since there is no Log Drain to catch it any other way.
      log.warn('STEAM_API_KEY not set — live story capture is disabled')
      await writeHealth({ ok: false, error: 'no_api_key' }, log)
      return { ok: true, skipped: 'no_api_key' }
    }

    // Never released — the TTL expiring is what permits the next run. Same shape as
    // liveOdCapture's lock, and it doubles as abuse protection on an unauthenticated path.
    const gotLock = await kv.set(LOCK_KEY, startedAt, { nx: true, ex: LOCK_TTL_S })
    if (!gotLock) return { ok: true, skipped: 'throttled' }

    const res = await fetch(`${GLLG_URL}?key=${process.env.STEAM_API_KEY}`)
    if (!res.ok) {
      log.warn('GetLiveLeagueGames fetch failed', { status: res.status })
      await writeHealth({ ok: false, error: `http_${res.status}` }, log)
      return { ok: false, error: 'gllg_fetch_failed' }
    }

    const raw = await res.json()

    // Tier-1 only, correlated against the already-cached PandaScore live payload — no extra
    // PandaScore call, no second tier rule, and it is what keeps KV traffic inside the free tier
    // (see selectTier1MatchIds). A cold/empty PS cache yields an empty set, which correctly
    // captures nothing rather than falling back to storing all ~43 live league games.
    const psMatches = await kv.get(PS_LIVE_KEY).catch(() => null)
    const keepIds = selectTier1MatchIds(raw, psMatches)
    const totalLive = indexGamesById(raw).size
    if (keepIds.size === 0) {
      await writeHealth({ ok: true, games: 0, totalLive, events: 0, note: 'no_tier1_correlated' }, log)
      return { ok: true, captured: 0, games: 0, totalLive }
    }

    const next = trimSnapshot(raw, keepIds)
    const gameCount = next.result.games.length

    // Written every tick regardless of what follows, so the admin page can enumerate tracked
    // matches even on the very first tick after a cold start (no diff baseline yet, but the
    // match IS being captured).
    kv.set(TRACKED_KEY, next.result.games.map(g => String(g.match_id)), { ex: TRACKED_TTL_S })
      .catch(err => log.warn('tracked-list write failed', { error: err?.message }))

    const prev = await kv.get(SNAPSHOT_KEY).catch(() => null)

    // Store the new snapshot regardless of whether a diff was possible — the first run after a
    // cold start has no baseline, and that is not an error, it just means the next run will.
    await kv.set(SNAPSHOT_KEY, next, { ex: SNAPSHOT_TTL_S })
      .catch(err => log.warn('snapshot write failed', { error: err?.message }))

    if (!prev) {
      await writeHealth({ ok: true, games: gameCount, events: 0, note: 'no_baseline' }, log)
      return { ok: true, captured: 0, games: gameCount }
    }

    const marqueeItemIds = await loadMarqueeIds(log)
    const events = diffSnapshots(prev, next, { marqueeItemIds })
    const written = events.length ? await appendEvents(events, log) : 0

    // The exact pair AND the events derived from it, for the admin inspector — this is the
    // root-cause tool that substitutes for Vercel Log Drains (unavailable on the free plan).
    // Best-effort: losing it costs debuggability, never correctness.
    kv.set(LAST_PAIR_KEY, { prev, next, events, at: new Date().toISOString() }, { ex: LAST_PAIR_TTL_S })
      .catch(err => log.warn('pair write failed', { error: err?.message }))

    const byType = {}
    for (const e of events) byType[e.eventType] = (byType[e.eventType] || 0) + 1

    await writeHealth({
      ok: true,
      games: gameCount,
      withScoreboard: next.result.games.filter(g => g.scoreboard).length,
      events: written,
      byType,
      ms: Date.now() - startedAt,
    }, log)

    log.info('live story captured', { games: gameCount, events: written })
    return { ok: true, captured: written, games: gameCount, byType }
  } catch (err) {
    log.warn('live story capture threw', { error: err?.message })
    await writeHealth({ ok: false, error: err?.message }, log).catch(() => {})
    return { ok: false, error: 'capture_threw' }
  }
}

// In-app monitoring only — Vercel Log Drains are unavailable on the free plan, so the last-run
// summary has to be readable from a KV key the admin page and ?mode=monitor can both read.
async function writeHealth(summary, log) {
  try {
    await kv.set(HEALTH_KEY, { ...summary, at: new Date().toISOString() }, { ex: HEALTH_TTL_S })
  } catch (err) {
    log?.warn?.('health write failed', { error: err?.message })
  }
}

export const LIVE_STORY_KEYS = {
  SNAPSHOT_KEY, LAST_PAIR_KEY, HEALTH_KEY, EVENTS_KEY, LOCK_KEY, TRACKED_KEY,
}

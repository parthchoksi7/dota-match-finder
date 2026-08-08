import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
import { createLogger, validateId } from '../_shared.js'
import { fetchPsMatchDetail } from './liveSeriesGames.js'
import { captureLiveStoryOnce, LIVE_STORY_KEYS, ITEM_MAP_KV_KEY } from './liveStoryCapture.js'
import { indexGamesById } from '../_liveStoryDiff.js'
import { shapeValvePulse, collectItemIds, collectEventItemIds, shapeLiveEvents, shapeValveGoldHistory, groupTimelineEvents } from '../_liveValveState.js'
import { teamPairMatch, resolveRadiantSide } from '../../src/teamMatching.js'

// Valve-sourced live pulse. Given a PandaScore series match id, resolves the CURRENTLY RUNNING
// game to Valve's own `GetLiveLeagueGames` telemetry — score, net worth, per-player stats, items,
// ultimates, towers, barracks, Roshan, draft order and bans.
//
// WHY THIS EXISTS ALONGSIDE `liveGamePulse.js`
// -------------------------------------------
// `?mode=live-game-pulse` serves the same surface from OpenDota's `/api/live`. That feed carries
// only team-level score, a net-worth lead, hero ids and player names — no per-player KDA, no
// items, no last hits, no GPM/XPM, no barracks and no Roshan timer. Everything this endpoint adds
// is structurally unavailable there, which is why this is a second source rather than a refactor
// of the first. The two are deliberately NOT merged while the Valve path is still behind its
// staged-rollout flag: a regression here must not be able to take down the shipped OD pulse.
//
// DATA PROVENANCE (the 2026-08-06 product constraint)
// ---------------------------------------------------
// Valve owns everything INSIDE the game. PandaScore owns the match FRAMING, because Valve's feed
// genuinely has no equivalent for any of it:
//   - stream/watch links     -> absent from GetLiveLeagueGames entirely
//   - bracket round / stakes -> absent (`league_node_id` was 0 on 44/44 games observed)
//   - tournament NAME        -> Valve carries only a numeric `league_id`
//   - series format & score  -> `series_type`'s meaning is explicitly unverified, and the audit
//                               names PandaScore the trusted source for series score
// PandaScore is therefore used here for exactly two things: resolving WHICH Valve game corresponds
// to the series the viewer opened, and supplying the two display names. No in-game number on this
// payload comes from PandaScore or OpenDota.
//
// TEAM NAMES: resolved to the PandaScore opponent names, never Valve's own `radiant_team.team_name`
// — that block is absent on ~50% of live league games, so trusting it would make the header flicker
// between a real name and a blank as coverage changes mid-series.

// Shorter than the OD pulse's 15s because the underlying Valve capture is cheaper (one global
// call covering every live game, against a 100k/day budget) and its own KV lock — not this cache —
// is the real cadence control. Still long enough that concurrent viewers of one popular series
// collapse onto a single resolve.
const PULSE_CACHE_TTL_S = 10

/**
 * Finds the Valve game in a captured snapshot that corresponds to a PandaScore series' two
 * opponents, and reports which Valve side is which PandaScore team.
 *
 * Correlation is name-based via the shared `teamPairMatch` — the SAME alias/nickname table every
 * other PandaScore-adjacent matcher in this codebase uses. Never hand-roll a second name matcher.
 *
 * Returns null rather than guessing when: the snapshot is empty, no game's team pair matches, or
 * MORE THAN ONE does. That last case matters — two games of the same series can be live-adjacent
 * in the feed around a game transition, and binding the wrong one would silently show a viewer the
 * previous game's final state as if it were current.
 *
 * Exported for unit testing.
 */
export function correlateValveGame(snapshot, psNameA, psNameB) {
  if (!psNameA || !psNameB) return null
  const games = [...indexGamesById(snapshot).values()]
  const hits = []
  for (const g of games) {
    const r = g?.radiant_team?.team_name
    const d = g?.dire_team?.team_name
    if (!r || !d) continue
    if (teamPairMatch(psNameA, psNameB, r, d)) hits.push(g)
  }
  if (hits.length !== 1) return null

  const game = hits[0]
  // Which PandaScore name is on Valve's Radiant side. Same helper and same "never guess on an
  // ambiguous double-match" contract the OD pulse uses.
  const side = resolveRadiantSide(psNameA, psNameB, game.radiant_team.team_name, game.dire_team.team_name)
  if (!side) return null
  return {
    game,
    radiantName: side === 'A' ? psNameA : psNameB,
    direName: side === 'A' ? psNameB : psNameA,
  }
}

/**
 * Resolves the Valve pulse for a PandaScore match id. Split from the handler so every exit path
 * funnels through one cache-write site. Exported for unit testing.
 */
export async function resolveValvePulse(pandaId, log) {
  try {
    const detail = await fetchPsMatchDetail(pandaId, log)
    if (!detail) return { pulse: null }

    // Only serve a pulse while a game is actually running. Without this a finished series would
    // keep rendering whatever stale game still sat in the snapshot ring.
    const running = (detail.games || []).find(g => g.status === 'running')
    if (!running) return { pulse: null }

    const opponents = detail.opponents || []
    const psNameA = opponents[0]?.opponent?.name
    const psNameB = opponents[1]?.opponent?.name
    // Without both names there is nothing to correlate against — Valve's feed has no PandaScore
    // id to join on, so names are the only key. Bail rather than fall back to nearest-time, which
    // could bind an unrelated concurrent game.
    if (!psNameA || !psNameB) return { pulse: null }

    // Keep the snapshot warm while a viewer has the sheet open. This is the same piggyback pattern
    // the OD pulse uses (`captureOdLiveOnce`): the capture's own KV lock throttles it to at most
    // one Valve call per LOCK_TTL_S no matter how many viewers poll, so this cannot fan out.
    // Failure is non-fatal — a stale-but-present snapshot still renders.
    try {
      await captureLiveStoryOnce(log)
    } catch (err) {
      log.warn('valve capture piggyback failed', { error: err?.message })
    }

    const snapshot = await kv.get(LIVE_STORY_KEYS.SNAPSHOT_KEY).catch(() => null)
    if (!snapshot) return { pulse: null }

    const hit = correlateValveGame(snapshot, psNameA, psNameB)
    if (!hit) return { pulse: null }

    const pulse = shapeValvePulse(hit.game, { radiantName: hit.radiantName, direName: hit.direName })
    if (!pulse) return { pulse: null }
    // Response-build-time stamp (there's no single DB row to inherit one from, unlike the OD
    // pulse's `row.captured_at`) — consumed by the client's retain-last-known-good bound
    // (nextPulseState/STALE_AFTER_MS in SeriesLivePulse.jsx) so a transient correlation miss
    // doesn't blank the whole Valve-sourced UI on one bad poll.
    pulse.capturedAt = new Date().toISOString()

    // Live event feed — reads the SAME event ring the differ already writes on every capture tick
    // (`live-story:events:v1:{matchId}`), keyed by Valve's own match_id, which is the identical id
    // space as `pulse.matchId` here (confirmed in the audit doc: "Same ID space as OpenDota's
    // match_id"). No new capture path, no new storage — this is read-only reuse of data that was
    // already being derived for the admin verification console, now surfaced publicly for the
    // first time. `shapeLiveEvents` enforces its own whitelist (kills/Roshan/marquee items only,
    // never tower/barracks events — see that function's comment) independent of anything here.
    // Resolved BEFORE the item-name scoping below, on purpose — an ItemPurchased event can
    // reference an item a player has since sold or displaced out of their visible 6 slots (the
    // differ diffs item SETS, precisely because they move), so the scoped map needs the union of
    // "currently equipped" and "referenced by a feed event," not just the former.
    try {
      const events = await kv.get(LIVE_STORY_KEYS.EVENTS_KEY(pulse.matchId))
      pulse.events = shapeLiveEvents(events)
    } catch (err) {
      log.warn('event feed read failed', { error: err?.message })
      pulse.events = []
    }

    // Scoped item-name map for exactly the items on the board PLUS anything a feed event names
    // (~60 ids max either way), so the client's `ItemSlot` and the event feed's item-purchase text
    // can both resolve CDN keys/display names without shipping the full ~1,500-entry constants
    // blob on every poll. Reuses the SAME KV key the capture and matchStats already populate —
    // never re-fetches the constants here. Absent map degrades to unresolved item slots and a
    // generic "buys a marquee item" line, which is strictly better than failing the whole pulse.
    try {
      const itemMap = await kv.get(ITEM_MAP_KV_KEY)
      if (itemMap) {
        const scoped = {}
        for (const id of [...collectItemIds(pulse), ...collectEventItemIds(pulse.events)]) {
          if (itemMap[id]) scoped[id] = itemMap[id]
        }
        pulse.itemNames = scoped
      }
    } catch (err) {
      log.warn('item map read failed', { error: err?.message })
    }

    // Net-worth history — a BRAND-NEW, isolated Supabase table (live_valve_gold,
    // scripts/create-live-valve-gold.sql), never `live_game_gold`. This is genuinely new work
    // (Valve's feed gives only a point-in-time reading per poll), not a swap of an existing
    // pipeline: nothing here reads or writes live_game_gold, so the shipped OD-sourced graph
    // cannot regress no matter what happens in this block. Both steps are best-effort — a
    // Supabase hiccup degrades to "no history yet" (LiveGoldGraph's own empty state), never a
    // failed pulse. Requires scripts/create-live-valve-gold.sql to have been run; a missing-table
    // error is caught and logged the same as any other failure here.
    if (Number.isFinite(pulse.gameTime) && pulse.gameTime >= 0) {
      try {
        const { error: insertErr } = await getSupabaseAdmin()
          .from('live_valve_gold')
          .upsert(
            {
              valve_match_id: pulse.matchId,
              game_time: pulse.gameTime,
              radiant_lead: pulse.radiantLead,
              radiant_score: pulse.radiantScore,
              dire_score: pulse.direScore,
            },
            { onConflict: 'valve_match_id,game_time', ignoreDuplicates: true },
          )
        if (insertErr) log.warn('live_valve_gold insert failed', { error: insertErr.message })
      } catch (err) {
        log.warn('live_valve_gold insert threw', { error: err?.message })
      }
    }
    try {
      const { data: goldRows, error: goldErr } = await getSupabaseAdmin()
        .from('live_valve_gold')
        .select('game_time, radiant_lead, radiant_score, dire_score, captured_at')
        .eq('valve_match_id', pulse.matchId)
      if (goldErr) log.warn('live_valve_gold history read failed', { error: goldErr.message })
      else pulse.history = shapeValveGoldHistory(goldRows)
    } catch (err) {
      log.warn('live_valve_gold history read threw', { error: err?.message })
    }

    // Timeline grouping runs LAST, after history — fight net-worth swings are read off
    // `pulse.history`, so grouping before it would silently produce a swing-less timeline whenever
    // the history read succeeded. Pure and in-memory; no extra I/O. An absent/failed history simply
    // yields fights with `swing: null`, which the client renders without a swing line.
    pulse.timeline = groupTimelineEvents(pulse.events, pulse.history || [])

    return { pulse }
  } catch (err) {
    log.warn('valve pulse resolve failed', { error: err?.message })
    return { pulse: null }
  }
}

export default async function handleLiveValvePulse(req, res) {
  const log = createLogger('/api/tournaments?mode=live-valve-pulse')
  res.setHeader('Cache-Control', 'private, no-store')

  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ pulse: null })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ pulse: null })

  // Staged-rollout gate, FAIL-CLOSED — deliberately not `isFeatureEnabled`, which fails OPEN.
  //
  // CONTEXT.md holds an explicit written bar for this data path reaching the public live surfaces:
  // the E12 lane-naming cross-check plus 3+ independently-validated tier-1 matches with zero false
  // positives (currently 2 of 3, with `laneVerified` still false in code). An unvalidated data
  // path must not switch itself on because KV hiccupped, so absence of an explicit "on" keeps it
  // off. Set `feature:live-valve-pulse:enabled` = "on" to enable; delete the key to kill it
  // instantly with no deploy.
  const flag = await kv.get('feature:live-valve-pulse:enabled').catch(() => null)
  if (flag !== 'on') return res.status(200).json({ pulse: null, disabled: true })

  const cacheKey = `valve-pulse:v1:${pandaId}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return res.status(200).json(cached)
  } catch (err) {
    log.warn('valve pulse cache read failed', { pandaId, error: err?.message })
  }

  const result = await resolveValvePulse(pandaId, log)
  kv.set(cacheKey, result, { ex: PULSE_CACHE_TTL_S })
    .catch(err => log.warn('valve pulse cache write failed', { pandaId, error: err?.message }))

  return res.status(200).json(result)
}

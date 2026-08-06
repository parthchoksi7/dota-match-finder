import { kv } from '../_kv.js'
import { createLogger, validateId } from '../_shared.js'
import { fetchPsMatchDetail } from './liveSeriesGames.js'
import { captureLiveStoryOnce, LIVE_STORY_KEYS, ITEM_MAP_KV_KEY } from './liveStoryCapture.js'
import { indexGamesById } from '../_liveStoryDiff.js'
import { shapeValvePulse, collectItemIds } from '../_liveValveState.js'
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

    // Scoped item-name map for exactly the items on the board (~60 ids max), so the client's
    // existing `ItemSlot` can resolve CDN keys without shipping the full ~1,500-entry constants
    // blob on every poll. Reuses the SAME KV key the capture and matchStats already populate —
    // never re-fetches the constants here. Absent map degrades to empty-looking item slots, which
    // is strictly better than failing the whole pulse.
    try {
      const itemMap = await kv.get(ITEM_MAP_KV_KEY)
      if (itemMap) {
        const scoped = {}
        for (const id of collectItemIds(pulse)) {
          if (itemMap[id]) scoped[id] = itemMap[id]
        }
        pulse.itemNames = scoped
      }
    } catch (err) {
      log.warn('item map read failed', { error: err?.message })
    }

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

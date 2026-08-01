// Live feed "worth watching" signal — pure state machine.
// `.claude/specs/live-worth-watching-signal-spec.md`, requirements R0–R7.
//
// Zero React, zero browser-only imports — api/live-matches.js imports this directly, same
// cross-boundary rule already established by src/utils/liveScore.js, src/seriesLogic.js, and
// src/teamMatching.js.
//
// OWNER-ONLY as of this build (2026-08-01). The spec's own MVP timeline treats an owner-gated
// verification window as a real milestone before any public flip (same pattern as the tower map:
// live-story-shipped.md, R4 Phase D) — the signal's predictive value is explicitly unvalidated
// (Finding 5) and its base rate is only 4.1%, so it must be watched against real games before it
// makes any public claim. Gating itself lives at the API response boundary
// (api/live-matches.js), not here — this module has no notion of who's asking.
//
// Pre-implementation critique (2026-08-01, /dota_data_scientist + /dota_analyst + /dota_pm):
// three logic gaps were found and fixed here before this shipped, and two product-level
// mitigations were pushed to the caller (api/live-matches.js) since they need data (tournament
// context, followed teams) this pure module deliberately doesn't take:
//   1. Peak-reset-on-sign-flip (`advancePeak`) — a lead that fully reverses sides used to leave
//      `retracement` computed against the OLD leader's peak, which can exceed 1.0 and never
//      resolves into a clean exit. The peak now resets the moment the lead crosses zero, so
//      retracement always describes the CURRENT leader's own drawdown, never a stale side's.
//   2. Time-scaled peak floor (`peakFloor`) — a flat 5k floor is a real edge at minute 15 but
//      statistical noise relative to the net worth totals in play by minute 70+, where single
//      teamfights swing that much routinely. The floor now scales with `evenThreshold`, the same
//      way the CLOSE/ONE_SIDED boundaries already do.
//   3. Threshold/data pipeline mismatch — the calibration corpus used post-game `radiant_gold_adv`
//      (smoother, per-minute) as a stand-in for the noisier live `radiant_lead` field. This module
//      cannot fix a calibration problem, so it doesn't pretend to; see the spec's own
//      "re-validate against live_game_gold before any public flip" requirement, unchanged.
// Product-level mitigations pushed to the caller: never render ONE_SIDED on a Grand Final / BO5
// decider (a lopsided score there is still appointment viewing), and never render ONE_SIDED on a
// row for a team the viewer follows (the badge doesn't know about followedTeams, and shouldn't —
// that's a per-viewer rendering decision, not a fact about the game).

import { evenThreshold, farAheadThreshold } from './momentum.js'

export const MIN_GAME_TIME_S = 480 // R2 — before this, laning-phase noise has no discriminating power (Finding 2)
export const CLOSE_EXIT_FACTOR = 1.6
export const ONE_SIDED_EXIT_FACTOR = 0.8
export const ONE_SIDED_DWELL = 2 // consecutive raw observations, ~4 min at the 2-min cache-regen cadence (R3)
export const STALE_MAX_S = 600 // 5x the worst normal live_game_map capture cadence
export const RETRACEMENT_ENTER = 0.40
export const RETRACEMENT_EXIT = 0.25
export const PEAK_FLOOR_MIN = 5000

// See critique note (2) above: the peak a lead must retrace FROM has to be a real edge relative
// to the game-time-appropriate CLOSE boundary, not a fixed dollar amount that means less as the
// game (and both teams' net worth) grows.
export function peakFloor(gameTime) {
  return Math.max(PEAK_FLOOR_MIN, evenThreshold(gameTime) * 2)
}

// Advances the running peak |lead| for whichever side is CURRENTLY ahead. Resets to the current
// reading the moment the lead crosses zero to the other side — see critique note (1) above. A
// zero lead (exactly tied) keeps whatever side was previously tracked rather than picking one
// arbitrarily; the next non-zero reading resolves it.
export function advancePeak(prior, radiantLead) {
  const side = radiantLead > 0 ? 'radiant' : radiantLead < 0 ? 'dire' : (prior?.peakSide ?? null)
  const flipped = !!prior?.peakSide && !!side && side !== prior.peakSide
  if (flipped || !prior?.peakSide) {
    return { peak: Math.abs(radiantLead), peakSide: side }
  }
  return { peak: Math.max(prior.peak, Math.abs(radiantLead)), peakSide: side }
}

// How far the CURRENT lead has fallen back from the peak, expressed on the peak's own side.
// Gated by peakFloor so a sub-threshold wobble (e.g. a 400→200 dip) never qualifies, and by the
// peak-reset in advancePeak so this is never computed across a sign flip (peakSide always matches
// the side radiantLead is currently on once a flip has occurred, since advancePeak already reset).
export function computeRetracement({ radiantLead, gameTime, peak, peakSide }) {
  if (!peakSide || !Number.isFinite(peak) || peak < peakFloor(gameTime)) return 0
  const currentOnPeakSide = peakSide === 'radiant' ? radiantLead : -radiantLead
  return 1 - currentOnPeakSide / peak
}

// The three raw (pre-hysteresis) conditions, independent of any prior state. `radiantLead === 0`
// or a very small gap can satisfy CLOSE; a large gap can satisfy ONE_SIDED; both are mutually
// exclusive by construction (evenThreshold is always well below farAheadThreshold for any
// gameTime the badge is active — R2's floor keeps this true even at gameTime = MIN_GAME_TIME_S).
function rawConditions({ radiantLead, gameTime }) {
  const abs = Math.abs(radiantLead)
  return {
    closeRaw: abs <= evenThreshold(gameTime),
    oneSidedRaw: abs > farAheadThreshold(gameTime),
  }
}

// One full observation. `prior` is the last persisted state (or null/undefined on cold start —
// see api/live-matches.js's KV read): { state, peak, peakSide, oneSidedStreak }. Returns the same
// shape, to be persisted verbatim by the caller. Never throws on a null/invalid prior.
//
// Priority when multiple raw conditions could apply: SWINGING > CLOSE > ONE_SIDED > none (R1 —
// "SWINGING outranks CLOSE when both fire"; SWINGING and ONE_SIDED cannot both be raw-true at once
// since a retracement large enough to enter SWINGING necessarily first passed through a smaller
// gap than farAheadThreshold, but SWINGING can still override an ONE_SIDED state that hasn't yet
// exited via its own hysteresis).
export function nextSignalState(prior, { radiantLead, gameTime }) {
  const priorState = prior?.state ?? null
  const priorPeak = Number.isFinite(prior?.peak) ? prior.peak : 0
  const priorPeakSide = prior?.peakSide ?? null
  const priorOneSidedStreak = prior?.oneSidedStreak ?? 0

  const invalid = !Number.isFinite(radiantLead) || !Number.isFinite(gameTime) || gameTime < MIN_GAME_TIME_S
  if (invalid) {
    // A single missing/invalid/pre-minute-8 reading clears the rendered badge but preserves
    // accumulated peak history — a transient capture miss shouldn't cost an in-progress comeback
    // its reference point (Edge Cases: "radiant_lead is null ... No badge", not "reset tracking").
    return { state: null, peak: priorPeak, peakSide: priorPeakSide, oneSidedStreak: 0 }
  }

  const { peak, peakSide } = advancePeak({ peak: priorPeak, peakSide: priorPeakSide }, radiantLead)
  const retracement = computeRetracement({ radiantLead, gameTime, peak, peakSide })
  const { closeRaw, oneSidedRaw } = rawConditions({ radiantLead, gameTime })
  const swingingRaw = retracement >= RETRACEMENT_ENTER
  const oneSidedStreak = oneSidedRaw ? priorOneSidedStreak + 1 : 0

  // R3: CLOSE and SWINGING render on their first qualifying observation; ONE_SIDED needs
  // ONE_SIDED_DWELL consecutive raw hits first ("be slow to tell a fan a game is finished").
  function deriveEntry() {
    if (swingingRaw) return 'SWINGING'
    if (closeRaw) return 'CLOSE'
    if (oneSidedRaw && oneSidedStreak >= ONE_SIDED_DWELL) return 'ONE_SIDED'
    return null
  }

  const even = evenThreshold(gameTime)
  const decided = farAheadThreshold(gameTime)
  const abs = Math.abs(radiantLead)

  let state
  if (priorState === 'SWINGING') {
    // Exit at retracement < 0.25. A fully "peak re-taken" leader also satisfies this on its own:
    // once the leading side's advantage matches or exceeds the old peak, `peak` (via advancePeak's
    // Math.max) has already been bumped to that new high, making currentOnPeakSide/peak ≈ 1 and
    // retracement ≈ 0 — no separate "re-taken" check is needed, it falls out of the same formula.
    state = retracement < RETRACEMENT_EXIT ? deriveEntry() : 'SWINGING'
  } else if (priorState === 'CLOSE') {
    state = swingingRaw ? 'SWINGING' : abs > even * CLOSE_EXIT_FACTOR ? deriveEntry() : 'CLOSE'
  } else if (priorState === 'ONE_SIDED') {
    // The 6% mega-comeback case (Finding 4): the exit factor alone clears this within one
    // observation once the gap genuinely narrows, without waiting for a fresh dwell period.
    state = swingingRaw ? 'SWINGING' : abs < decided * ONE_SIDED_EXIT_FACTOR ? deriveEntry() : 'ONE_SIDED'
  } else {
    state = deriveEntry()
  }

  return { state, peak, peakSide, oneSidedStreak }
}

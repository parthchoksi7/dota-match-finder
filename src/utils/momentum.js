// Live Story: pure, unit-tested reads of "how's it going" and "does this game matter" for the
// currently running game of a live series. Both take data already resolved elsewhere (the live
// pulse, the series match object) — neither fetches anything.

// A lead's significance depends on WHEN it happens, not just its size: the same net-worth gap is
// a likely stomp at 15:00 but a coin-flip at 45:00 (buyback/Aegis/Rapier/mega creeps make late
// leads structurally reversible in Dota). So both boundaries widen with game time. Vocabulary is
// deliberately "state, not fate": EVEN / AHEAD / FAR_AHEAD, never a predictive label like
// "commanding" or "comeback brewing" — this must never imply a decided game before it is one.
//
// R0 fix (2026-08-01, `.claude/specs/live-worth-watching-signal-spec.md`): the original flat
// EVEN_THRESHOLD (1000) made EVEN nearly extinct after minute 25 (5–11% of live observations),
// and the old FAR_AHEAD ramp (6,000→15,000, flat past 40 min) stopped widening well before a
// typical pro game's total net worth does. Both replaced with ramps validated against 3,230
// post-game matches. Both exported so `src/utils/liveSignal.js` (the live feed "worth watching"
// badge) IMPORTS these, not a copy — a badge and the momentum band reading the same lead
// differently on the same screen would be a same-page contradiction.
const EVEN_BASE = 500
const EVEN_PER_MIN = 60
const EVEN_RAMP_END_MIN = 65 // threshold is fully ramped by here: 500 → 4,400
const DECIDED_BASE = 5000
const DECIDED_PER_MIN = 400
const DECIDED_RAMP_START_MIN = 10 // flat at DECIDED_BASE before this — nothing is "decided" in the first 10 min
const DECIDED_RAMP_END_MIN = 60 // threshold is fully ramped by here: 5,000 → 25,000

export function evenThreshold(gameTime) {
  const minutes = Math.max(0, gameTime) / 60
  return EVEN_BASE + EVEN_PER_MIN * Math.min(minutes, EVEN_RAMP_END_MIN)
}

export function farAheadThreshold(gameTime) {
  const minutes = Math.max(0, gameTime) / 60
  const clamped = Math.min(Math.max(minutes, DECIDED_RAMP_START_MIN), DECIDED_RAMP_END_MIN)
  return DECIDED_BASE + DECIDED_PER_MIN * (clamped - DECIDED_RAMP_START_MIN)
}

// radiantLead/gameTime come from the live pulse (radiant-positive net worth diff, in-game
// seconds). radiantName/direName must be the RESOLVED running game's names, not the series
// header's team order — sides swap game to game within a series.
export function computeMomentum({ radiantLead, gameTime, radiantName, direName }) {
  if (!Number.isFinite(radiantLead) || !Number.isFinite(gameTime) || gameTime < 0) return null
  const abs = Math.abs(radiantLead)
  const radiantAhead = radiantLead > 0
  const isEven = abs <= evenThreshold(gameTime)
  // OD's live feed is well-known in this codebase to come back with a null/empty team name
  // (api/_handlers/liveOdCapture.js) — fall back the same way every other consumer of
  // radiantName/direName in this file family already does (SeriesLivePulse's own score-row
  // render: `pulse.radiantName || 'Radiant'`), so a missing name reads as "Radiant Ahead" rather
  // than the literal string "null Ahead".
  const leaderName = isEven ? null : radiantAhead ? (radiantName || 'Radiant') : (direName || 'Dire')
  const leadColor = isEven ? null : radiantAhead ? 'rgb(34,197,94)' : 'rgb(239,68,68)'
  const band = isEven ? 'EVEN' : abs > farAheadThreshold(gameTime) ? 'FAR_AHEAD' : 'AHEAD'
  return { band, leaderName, leadColor }
}

// Series stakes — free from data already on the live-matches series object, no new fetch.
// Scoped to BO3/BO5 only: a BO1 has no "decider" framing worth adding (every game already is the
// decider), and a BO2 can legitimately end in a draw (see CONTEXT.md), which makes "match point"
// framing potentially misleading — both return no stakes.
const WINS_REQUIRED = { BO3: 2, BO5: 3 }

export function computeStakes({ seriesLabel, seriesScore, teamA, teamB }) {
  const winsRequired = WINS_REQUIRED[seriesLabel]
  if (!winsRequired || !seriesScore) return { kind: null, leaderName: null }
  const [scoreA, scoreB] = seriesScore.split('-').map(Number)
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return { kind: null, leaderName: null }
  if (scoreA === winsRequired - 1 && scoreB === winsRequired - 1) return { kind: 'DECIDER', leaderName: null }
  if (scoreA === winsRequired - 1 && scoreB < scoreA) return { kind: 'MATCH_POINT', leaderName: teamA }
  if (scoreB === winsRequired - 1 && scoreA < scoreB) return { kind: 'MATCH_POINT', leaderName: teamB }
  return { kind: null, leaderName: null }
}

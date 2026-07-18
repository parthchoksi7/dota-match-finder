// Live Story: pure, unit-tested reads of "how's it going" and "does this game matter" for the
// currently running game of a live series. Both take data already resolved elsewhere (the live
// pulse, the series match object) — neither fetches anything.

// A lead's significance depends on WHEN it happens, not just its size: the same net-worth gap is
// a likely stomp at 15:00 but a coin-flip at 45:00 (buyback/Aegis/Rapier/mega creeps make late
// leads structurally reversible in Dota). So the bar for "far ahead" rises with game time — v1
// ramps linearly from FAR_AHEAD_EARLY at kickoff to FAR_AHEAD_LATE by RAMP_END_S, then holds flat.
// Vocabulary is deliberately "state, not fate": EVEN / AHEAD / FAR_AHEAD, never a predictive label
// like "commanding" or "comeback brewing" — this must never imply a decided game before it is one.
const EVEN_THRESHOLD = 1000 // below this magnitude, always reads as even regardless of game time
const FAR_AHEAD_EARLY = 6000
const FAR_AHEAD_LATE = 15000
const RAMP_END_S = 2400 // 40 minutes — threshold is fully ramped by here

function farAheadThreshold(gameTime) {
  const t = Math.max(0, Math.min(gameTime, RAMP_END_S))
  return FAR_AHEAD_EARLY + (FAR_AHEAD_LATE - FAR_AHEAD_EARLY) * (t / RAMP_END_S)
}

// radiantLead/gameTime come from the live pulse (radiant-positive net worth diff, in-game
// seconds). radiantName/direName must be the RESOLVED running game's names, not the series
// header's team order — sides swap game to game within a series.
export function computeMomentum({ radiantLead, gameTime, radiantName, direName }) {
  if (!Number.isFinite(radiantLead) || !Number.isFinite(gameTime) || gameTime < 0) return null
  const abs = Math.abs(radiantLead)
  const radiantAhead = radiantLead > 0
  const isEven = abs <= EVEN_THRESHOLD
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

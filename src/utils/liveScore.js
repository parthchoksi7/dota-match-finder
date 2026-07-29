// Glanceable live score — the shared, pure formatting + gating layer behind the three
// surfaces that show a running game's state outside the companion sheet: the browser tab
// title, the PWA icon badge, and the opt-in live-score push.
//
// Zero React, zero browser-only imports on purpose: api/live-matches.js imports this file
// directly for the push copy, the same cross-boundary pattern as src/seriesLogic.js and
// src/teamMatching.js. Do not add an import here without checking it is Node-safe.
//
// Every input is a `pulse` — the live_game_map row shape returned by
// api/_handlers/liveGamePulse.js ({ radiantName, direName, radiantScore, direScore,
// radiantLead, gameTime }). radiant/dire, never teamA/teamB: sides swap between games of a
// series, so the header's team order has no fixed relationship to the score's.

import { isTeamFollowed } from '../teamMatching.js'

// Org boilerplate carries no information at a tab-title or notification-title character
// budget — a fan reads "Tundra", never "Tundra Esports". Stripped conservatively: only
// well-known wrappers, only when something is left over ("Team" alone stays "Team").
const TRAILING_ORG_WORDS = /\s+(e-?sports(\s+club)?|gaming|team|club)$/i
const LEADING_ORG_WORDS = /^team\s+/i

export function shortTeamName(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  const stripped = trimmed.replace(TRAILING_ORG_WORDS, '').replace(LEADING_ORG_WORDS, '').trim()
  return stripped || trimmed
}

// Absolute gold-lead magnitude with a leading "+", e.g. 2540 -> "+2.5k", -300 -> "+300". The
// sign is NOT encoded here: every caller attributes the lead by pairing this with the leading
// team's name, so it always reads as a positive "ahead by" amount tied to a named team — never
// a bare "+500" a viewer can't attribute. (Lived in SeriesLivePulse.jsx until 2026-07-27; moved
// here so the server-side push copy and the client surfaces share one implementation. That file
// re-exports it, so existing imports and tests are unaffected.)
export function formatGoldMagnitude(lead) {
  if (!Number.isFinite(lead) || lead === 0) return null
  const abs = Math.abs(lead)
  return '+' + (abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : String(abs))
}

function sides(pulse) {
  return {
    a: shortTeamName(pulse?.radiantName) || 'Radiant',
    b: shortTeamName(pulse?.direName) || 'Dire',
  }
}

function hasKills(pulse) {
  return Number.isFinite(pulse?.radiantScore) && Number.isFinite(pulse?.direScore)
}

// Attributes the gold lead to a named side: "Tundra +2.4k". Null when there is no lead to
// report (dead even, or no reading yet) — callers drop the clause rather than printing "+0".
function leadClause(pulse) {
  const mag = formatGoldMagnitude(pulse?.radiantLead)
  if (!mag) return null
  const { a, b } = sides(pulse)
  return `${pulse.radiantLead > 0 ? a : b} ${mag}`
}

// Browser tab title, e.g. "24(+2.4k)-19 Tundra v BetBoom".
//
// SCORE FIRST, deliberately: a browser tab shows ~12-18 characters, so the ordering here is a
// truncation strategy. "24(+2.4k)-1…" still answers the question; "Tundra vs Bet…" does not.
//
// The gold lead is FUSED into the score itself, as a parenthetical on the leading side's own
// digit, rather than a separate trailing clause. An earlier version appended it at the end
// ("24-19 Tundra v BetBoom · Tundra +2.4k") — exactly the part a tab cuts first, so the gold
// lead was routinely invisible even though the format was "designed" to survive truncation.
// Moving it next to the score keeps the two genuinely glanceable numbers (kills, gold) inside
// the part of the title that actually survives; the team names, now last, are the least
// essential part once you already know which series you opened.
//
// Attribution is positional, same as the kill score itself: the parenthetical sits on
// whichever digit belongs to the side that's ahead, so it never has to repeat a team name to
// stay unambiguous.
//
// Returns null when there is no kill score yet — the caller then leaves the title untouched
// rather than showing a fabricated "0-0" (same rule as SeriesGameScore).
export function formatLiveScoreTitle(pulse) {
  if (!hasKills(pulse)) return null
  const { a, b } = sides(pulse)
  const mag = formatGoldMagnitude(pulse?.radiantLead)
  const radiantAhead = Number.isFinite(pulse?.radiantLead) && pulse.radiantLead > 0
  const radiantSuffix = mag && radiantAhead ? `(${mag})` : ''
  const direSuffix = mag && !radiantAhead ? `(${mag})` : ''
  return `${pulse.radiantScore}${radiantSuffix}-${pulse.direScore}${direSuffix} ${a} v ${b}`
}

// Notification title, e.g. "Tundra 24-19 BetBoom". Name-first, unlike the tab title above:
// a notification title has ~35 characters of room and no truncation pressure, so it can use
// the natural reading order instead of the truncation-first one.
export function formatScoreHeadline(pulse) {
  if (!hasKills(pulse)) return null
  const { a, b } = sides(pulse)
  return `${a} ${pulse.radiantScore}-${pulse.direScore} ${b}`
}

// Notification body, e.g. "Game 2 · BO3 1-0 · Tundra +2.4k · 32 min". Every clause is optional
// and dropped when its source is missing, so a sparse pulse degrades to a shorter honest line
// instead of printing placeholders.
export function formatScoreDetail(pulse, { seriesLabel, seriesScore, gamePosition } = {}) {
  const parts = []
  if (Number.isFinite(gamePosition)) parts.push(`Game ${gamePosition}`)
  if (seriesLabel && seriesScore) parts.push(`${seriesLabel} ${seriesScore}`)
  else if (seriesScore) parts.push(seriesScore)
  const lead = leadClause(pulse)
  if (lead) parts.push(lead)
  if (Number.isFinite(pulse?.gameTime) && pulse.gameTime >= 60) parts.push(`${Math.floor(pulse.gameTime / 60)} min`)
  return parts.join(' · ')
}

// Number of live series involving a followed team — the PWA icon badge's count. A badge means
// "something of yours is happening"; with zero follows there is nothing of yours, so no badge.
export function countFollowedLive(liveMatches, followedTeams) {
  if (!Array.isArray(liveMatches) || !Array.isArray(followedTeams) || followedTeams.length === 0) return 0
  return liveMatches.filter(m => isTeamFollowed(followedTeams, m?.teamA, m?.teamB)).length
}

// A game must have run this long before it earns a score ping: the existing `live` alert
// already fired at kickoff, and a ping showing "0-0" a minute later is the same notification
// twice. Five minutes in, there is a real score to report.
export const SCORE_PING_MIN_GAME_TIME_S = 300

// A gold lead has to move at least this much to be worth a notification on its own. Deliberately
// a DELTA against the previous raw value rather than a bucketed band: bucketing would fire on a
// 20-gold move that happens to straddle a boundary and stay silent on a 900-gold move inside one.
export const SCORE_PING_LEAD_DELTA = 1000

// Collapses a pulse into the string stored between cron ticks — kill score plus the raw gold
// lead. Null when there is no kill score, so an unscored pulse can never become a ping.
export function scoreSignature(pulse) {
  if (!hasKills(pulse)) return null
  const lead = Number.isFinite(pulse.radiantLead) ? pulse.radiantLead : ''
  return `${pulse.radiantScore}-${pulse.direScore}|${lead}`
}

// The ping gate. Stored per SERIES rather than per subscriber: whether the game state moved is a
// fact about the game, so one KV read/write per series per cron tick answers it for everyone.
// The per-user cooldown key is a separate, additional guard.
//
// Sends when the kill score changed, or the gold lead moved by SCORE_PING_LEAD_DELTA. A game
// that produced neither over a whole cron interval is paused or stalled, and re-sending the
// same numbers is the fastest way to make a fan turn these off.
export function shouldSendScorePing(pulse, prevSignature) {
  const sig = scoreSignature(pulse)
  if (!sig) return false
  if (!Number.isFinite(pulse?.gameTime) || pulse.gameTime < SCORE_PING_MIN_GAME_TIME_S) return false
  if (typeof prevSignature !== 'string' || !prevSignature) return true
  if (sig === prevSignature) return false

  const [prevKills, prevLeadRaw] = prevSignature.split('|')
  if (prevKills !== `${pulse.radiantScore}-${pulse.direScore}`) return true
  // Either side missing a lead reading makes the delta unknowable; treat the change as real
  // rather than silently swallowing it.
  const prevLead = prevLeadRaw === '' || prevLeadRaw === undefined ? null : Number(prevLeadRaw)
  if (!Number.isFinite(prevLead) || !Number.isFinite(pulse.radiantLead)) return true
  return Math.abs(pulse.radiantLead - prevLead) >= SCORE_PING_LEAD_DELTA
}

import { resolveRadiantSide } from '../teamMatching'

// Fallback winner-name resolution for a finished game inside a live series, for the gap between
// "gameMatchId has resolved" and "PandaScore's live-feed g.winner.id has caught up" (confirmed
// laggy — see LiveSeriesSheet.jsx's game.winnerName usage). Deliberately never renders a raw
// OpenDota team name: resolves which of the series' own already-trusted PandaScore names
// (teamA/teamB) was Radiant via resolveRadiantSide(), then displays that name. Returns null
// (never a guessed/OD-sourced string) when the pairing doesn't cleanly resolve.
//
// Resolution is lifted into LiveSeriesSheet.jsx (a single per-series effect resolving every
// finished game that needs it, not a per-row component) so the same resolved name reaches both
// the game switcher's tab sublabel and the selected game's body content — a fan parked on a live
// game must see a finished sibling's winner on its tab chip too, not just after tapping into it.
export function resolveWinnerName(stats, teamA, teamB) {
  if (typeof stats?.radiantWin !== 'boolean') return null
  const side = resolveRadiantSide(teamA, teamB, stats.radiantName, stats.direName)
  if (!side) return null
  const radiantIsA = side === 'A'
  const radiantWon = stats.radiantWin
  if (radiantWon) return radiantIsA ? teamA : teamB
  return radiantIsA ? teamB : teamA
}

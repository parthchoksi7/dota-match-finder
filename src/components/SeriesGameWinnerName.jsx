import { useEffect, useState } from 'react'
import { fetchMatchStats } from '../api'
import { resolveRadiantSide } from '../teamMatching'

// Fallback winner-name resolution for a finished game inside a live series, for the gap between
// "gameMatchId has resolved" and "PandaScore's live-feed g.winner.id has caught up" (confirmed
// laggy — see LiveSeriesSheet.jsx's game.winnerName usage). Deliberately never renders a raw
// OpenDota team name: resolves which of the series' own already-trusted PandaScore names
// (teamA/teamB) was Radiant via resolveRadiantSide(), then displays that name. Returns null
// (never a guessed/OD-sourced string) when the pairing doesn't cleanly resolve.
export function resolveWinnerName(stats, teamA, teamB) {
  if (typeof stats?.radiantWin !== 'boolean') return null
  const side = resolveRadiantSide(teamA, teamB, stats.radiantName, stats.direName)
  if (!side) return null
  const radiantIsA = side === 'A'
  const radiantWon = stats.radiantWin
  if (radiantWon) return radiantIsA ? teamA : teamB
  return radiantIsA ? teamB : teamA
}

// `fallback` renders (as the same neutral style LiveSeriesSheet used before this component
// existed) until a name resolves or the fetch comes back unresolved — this is a drop-in
// replacement for that inline ternary, not just an additive name.
export default function SeriesGameWinnerName({ matchId, teamA, teamB, fallback }) {
  const [name, setName] = useState(null)

  useEffect(() => {
    setName(null)
    if (!matchId) return
    let cancelled = false
    fetchMatchStats(matchId)
      .then(stats => { if (!cancelled) setName(resolveWinnerName(stats, teamA, teamB)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [matchId, teamA, teamB])

  if (!name) return fallback ?? null
  return (
    <p className="font-display font-black text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate min-w-0">
      {name}
    </p>
  )
}

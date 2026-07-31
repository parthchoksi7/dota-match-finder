import { useEffect, useState } from 'react'
import { fetchMatchStats } from '../api'

// Finished-game kill score for the live-series companion, in the established sitewide
// winner/loser score convention (DESIGN_GUIDELINES.md "Match cards -- winner/loser state"),
// scaled down for this card's density. Attribution goes through OpenDota's radiantWin (a
// boolean) purely to route the two kill scores into winner/loser -- this component never displays
// a team name itself (the card's header line above already shows the winner's PandaScore-sourced
// name), so there's no OD-vs-PS naming-mismatch risk here. Renders nothing until OpenDota has
// parsed the match (radiantWin/radiantScore/direScore are null until then) -- no fabricated "0-0".
// Reads OpenDota's own precomputed radiantScore/direScore (same field MatchDrawer.jsx's score
// digits read) and routes them onto winner/loser via radiantWin -- kept as one shared source of
// truth instead of independently re-summing player kills, so the two surfaces can never diverge.
export function computeGameScore(stats) {
  if (typeof stats?.radiantWin !== 'boolean' || stats.radiantScore == null || stats.direScore == null) return null
  return {
    winnerScore: stats.radiantWin ? stats.radiantScore : stats.direScore,
    loserScore: stats.radiantWin ? stats.direScore : stats.radiantScore,
  }
}

export default function SeriesGameScore({ matchId }) {
  const [score, setScore] = useState(null) // { winnerScore, loserScore } | null

  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    fetchMatchStats(matchId)
      .then(stats => { if (!cancelled) setScore(computeGameScore(stats)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [matchId])

  if (!score) return null
  return (
    <span className="font-display font-black text-xs tabular-nums whitespace-nowrap">
      <span className="text-gray-900 dark:text-white">{score.winnerScore}</span>
      <span className="text-gray-300 dark:text-gray-700 mx-1 font-medium">—</span>
      <span className="text-gray-400 dark:text-gray-500">{score.loserScore}</span>
    </span>
  )
}

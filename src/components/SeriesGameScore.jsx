import { useEffect, useState } from 'react'
import { fetchMatchStats } from '../api'

// Finished-game kill score for the live-series companion, in the established sitewide
// winner/loser score convention (DESIGN_GUIDELINES.md "Match cards -- winner/loser state"),
// scaled down for this card's density. Attribution goes through OpenDota's radiantWin (a
// boolean) purely to route the two kill sums into winner/loser -- this component never displays
// a team name itself (the card's header line above already shows the winner's PandaScore-sourced
// name), so there's no OD-vs-PS naming-mismatch risk here. Renders nothing until OpenDota has
// parsed the match (radiantWin is null until then) -- no fabricated "0-0".
// Sums each side's kills and routes them onto winner/loser via radiantWin. Returns null when the
// match isn't parsed yet (radiantWin not boolean) or has no player data.
export function computeGameScore(stats) {
  const players = stats?.players
  if (!players || players.length === 0 || typeof stats?.radiantWin !== 'boolean') return null
  let radiantKills = 0
  let direKills = 0
  for (const p of players) {
    if (p.isRadiant) radiantKills += p.kills || 0
    else direKills += p.kills || 0
  }
  return {
    winnerScore: stats.radiantWin ? radiantKills : direKills,
    loserScore: stats.radiantWin ? direKills : radiantKills,
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

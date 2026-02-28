import MatchCard from "./MatchCard"

function groupIntoSeries(matches) {
  const seriesMap = {}
  for (const match of matches) {
    const teams = [match.radiantTeam, match.direTeam].sort().join("|")
    const key = teams + "__" + match.tournament + "__" + match.date
    if (!seriesMap[key]) {
      seriesMap[key] = {
        id: key,
        tournament: match.tournament,
        date: match.date,
        seriesType: match.seriesType,
        startTime: match.startTime,
        games: [],
      }
    }
    seriesMap[key].games.push(match)
    if (match.startTime > seriesMap[key].startTime) {
      seriesMap[key].startTime = match.startTime
    }
  }

  let series = Object.values(seriesMap)
  series.forEach(s => s.games.sort((a, b) => a.startTime - b.startTime))
  series.sort((a, b) => b.startTime - a.startTime)

  function winsRequired(s) {
    if (s.seriesType === 0) return 1
    if (s.seriesType === 2) return 3
    return 2
  }

  function isComplete(s) {
    const teamWins = {}
    for (const g of s.games) {
      const winner = g.radiantWin ? g.radiantTeam : g.direTeam
      teamWins[winner] = (teamWins[winner] || 0) + 1
    }
    const maxWins = Math.max(...Object.values(teamWins))
    return maxWins >= winsRequired(s)
  }

  const reversed = [...series].reverse()
  const oldestIncompleteIndex = reversed.findIndex(s => !isComplete(s))
  if (oldestIncompleteIndex !== -1) {
    series.splice(series.length - 1 - oldestIncompleteIndex, 1)
  }

  return series
}

function MatchList({ matches, onSelect, loading }) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-sm uppercase tracking-widest animate-pulse">
          Searching...
        </div>
      </div>
    )
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-12 border border-gray-800">
        <div className="text-gray-500 text-sm uppercase tracking-widest">
          No matches found
        </div>
        <p className="text-gray-700 text-xs mt-2">Try a different team or tournament name</p>
      </div>
    )
  }

  const series = groupIntoSeries(matches)

  return (
    <div className="w-full flex flex-col gap-3">
      <p className="text-xs text-gray-600 uppercase tracking-widest">
        {series.length} series
      </p>
      {series.map((s) => (
        <MatchCard key={s.id} series={s} onSelectGame={onSelect} />
      ))}
    </div>
  )
}

export default MatchList

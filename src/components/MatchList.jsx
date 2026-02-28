import MatchCard from "./MatchCard"

function groupIntoSeries(matches) {
  const seriesMap = {}
  for (const match of matches) {
    const key = match.seriesId || match.id
    if (!seriesMap[key]) {
      seriesMap[key] = {
        id: key,
        tournament: match.tournament,
        date: match.date,
        games: [],
      }
    }
    seriesMap[key].games.push(match)
  }
  return Object.values(seriesMap)
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
        {series.length} series — {matches.length} games
      </p>
      {series.map((s) => (
        <MatchCard key={s.id} series={s} onSelectGame={onSelect} />
      ))}
    </div>
  )
}

export default MatchList
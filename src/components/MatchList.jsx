import MatchCard from "./MatchCard"

function MatchList({ matches, onSelect, loading }) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-lg animate-pulse">Searching matches...</div>
      </div>
    )
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">No matches found. Try a different search.</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
      <p className="text-gray-400 text-sm">{matches.length} matches found</p>
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default MatchList
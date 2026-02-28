function MatchCard({ match, onSelect }) {
  return (
    <div
      onClick={() => onSelect(match)}
      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-500 rounded-lg p-4 cursor-pointer transition-all"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          {match.tournament}
        </span>
        <span className="text-xs text-gray-500">{match.date}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-right">
          <span className={`font-bold text-lg ${match.radiantWin ? "text-green-400" : "text-gray-300"}`}>
            {match.radiantTeam}
          </span>
        </div>
        <div className="px-4 text-center">
          <span className="text-gray-400 text-sm font-mono">
            {match.radiantScore} - {match.direScore}
          </span>
          <div className="text-xs text-gray-600 mt-1">{match.duration}</div>
        </div>
        <div className="flex-1 text-left">
          <span className={`font-bold text-lg ${!match.radiantWin ? "text-green-400" : "text-gray-300"}`}>
            {match.direTeam}
          </span>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <span className="text-xs text-red-400 hover:text-red-300">
          View match + VOD →
        </span>
      </div>
    </div>
  )
}

export default MatchCard
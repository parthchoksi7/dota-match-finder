function MatchCard({ series, onSelectGame }) {
    const radiantTeam = series.games[0].radiantTeam
const direTeam = series.games[0].direTeam
const radiantWins = series.games.filter(g => 
  (g.radiantWin && g.radiantTeam === radiantTeam) || 
  (!g.radiantWin && g.direTeam === radiantTeam)
).length
const direWins = series.games.filter(g => 
  (g.radiantWin && g.radiantTeam === direTeam) || 
  (!g.radiantWin && g.direTeam === direTeam)
).length

  return (
    <div className="border border-gray-800 hover:border-gray-600 transition-all bg-gray-950">
      {/* Series Header */}
      <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
        <span className="text-xs uppercase tracking-widest text-gray-500 font-semibold">
          {series.tournament}
        </span>
        <span className="text-xs text-gray-600">{series.date}</span>
      </div>

      {/* Score Row */}
      <div className="px-4 py-4 flex items-center justify-between">
        <span className={`font-display text-lg font-bold tracking-wide uppercase ${radiantWins > direWins ? "text-white" : "text-gray-500"}`}>
          {radiantTeam}
        </span>
        <div className="flex items-center gap-3">
          <span className={`font-display text-3xl font-black ${radiantWins > direWins ? "text-white" : "text-gray-500"}`}>
            {radiantWins}
          </span>
          <span className="text-gray-700 text-lg font-bold">—</span>
          <span className={`font-display text-3xl font-black ${direWins > radiantWins ? "text-white" : "text-gray-500"}`}>
            {direWins}
          </span>
        </div>
        <span className={`font-display text-lg font-bold tracking-wide uppercase text-right ${direWins > radiantWins ? "text-white" : "text-gray-500"}`}>
          {direTeam}
        </span>
      </div>

      {/* Individual Games */}
      <div className="border-t border-gray-800">
        {series.games.map((game, i) => (
          <div
            key={game.id}
            onClick={() => onSelectGame(game)}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-900 cursor-pointer group border-b border-gray-800 last:border-b-0 transition-colors"
          >
            <span className="text-xs text-gray-500 uppercase tracking-wider w-12">Game {i + 1}</span>
            <span className="text-xs text-gray-400">{game.duration}</span>
            <span className={`text-xs font-semibold ${game.radiantWin ? "text-green-400" : "text-red-400"}`}>
              {game.radiantWin ? game.radiantTeam : game.direTeam} WIN
            </span>
            <span className="text-xs text-gray-600 group-hover:text-purple-400 transition-colors uppercase tracking-wider">
              Watch VOD →
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MatchCard
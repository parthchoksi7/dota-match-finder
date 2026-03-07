import { useState } from "react"
import { formatDuration, getSeriesLabel } from "../utils"
import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

function MatchCard({ series, onSelectGame, defaultExpanded = false, spoilerFree = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const radiantWins = series.games.filter(
    (g) =>
      (g.radiantWin && g.radiantTeam === radiantTeam) ||
      (!g.radiantWin && g.direTeam === radiantTeam)
  ).length
  const direWins = series.games.filter(
    (g) =>
      (g.radiantWin && g.radiantTeam === direTeam) ||
      (!g.radiantWin && g.direTeam === direTeam)
  ).length
  const seriesLabel = getSeriesLabel(series.seriesType)

  return (
    <div className="border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 transition-all bg-white dark:bg-gray-950 rounded">
      {/* Series Header + Score */}
      <button
        type="button"
        onClick={() => {
          if (!expanded) trackEvent('series_expand', { tournament: series.tournament, radiantTeam, direTeam })
          setExpanded((e) => !e)
        }}
        className="focus-ring w-full text-left"
        aria-expanded={expanded}
        aria-controls={`series-games-${series.id}`}
      >
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center flex-wrap gap-1">
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold flex items-center gap-2">
            {series.tournament}
            {seriesLabel && (
              <span className="text-gray-400 dark:text-gray-600 font-normal">({seriesLabel})</span>
            )}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-600 flex items-center gap-2">
            {series.date}
            <span className="inline-block transition-transform" aria-hidden>
              {expanded ? "▼" : "▶"}
            </span>
          </span>
        </div>

        <div className="px-4 py-4 flex items-center justify-between gap-2">
          {/* Radiant team — no winner highlight in spoiler-free mode */}
          <span className={`font-display text-sm sm:text-lg font-bold tracking-wide uppercase min-w-0 ${
            !spoilerFree && radiantWins > direWins
              ? "text-gray-900 dark:text-white"
              : spoilerFree
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-500"
          }`}>
            {radiantTeam}
          </span>

          {/* Score or spoiler blur */}
          <div className="flex items-center gap-2 shrink-0 px-1">
            {spoilerFree ? (
              <span className="font-display text-2xl sm:text-3xl font-black text-gray-300 dark:text-gray-700 select-none whitespace-nowrap">
                ? — ?
              </span>
            ) : (
              <>
                <span className={`font-display text-2xl sm:text-3xl font-black ${
                  radiantWins > direWins ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
                }`}>
                  {radiantWins}
                </span>
                <span className="text-gray-400 dark:text-gray-700 text-lg font-bold">—</span>
                <span className={`font-display text-2xl sm:text-3xl font-black ${
                  direWins > radiantWins ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
                }`}>
                  {direWins}
                </span>
              </>
            )}
          </div>

          {/* Dire team */}
          <span className={`font-display text-sm sm:text-lg font-bold tracking-wide uppercase text-right min-w-0 ${
            !spoilerFree && direWins > radiantWins
              ? "text-gray-900 dark:text-white"
              : spoilerFree
              ? "text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-500"
          }`}>
            {direTeam}
          </span>
        </div>

        {!expanded && (
          <div className="px-4 pb-3 pt-0">
            <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              {series.games.length} game{series.games.length !== 1 ? "s" : ""} — click to expand
            </span>
          </div>
        )}
      </button>

      {/* Individual Games (expanded) */}
      {expanded && (
        <div
          id={`series-games-${series.id}`}
          className="border-t border-gray-200 dark:border-gray-800"
        >
          {series.games.map((game, i) => (
            <button
              key={game.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                trackEvent('game_click', { matchId: game.id, radiantTeam: game.radiantTeam, direTeam: game.direTeam, tournament: series.tournament })
                trackEvent('team_click', { team: game.radiantTeam, tournament: series.tournament })
                trackEvent('team_click', { team: game.direTeam, tournament: series.tournament })
                onSelectGame(game)
              }}
              className="focus-ring w-full flex items-center justify-between px-4 py-3 min-h-[44px] hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer group border-b border-gray-200 dark:border-gray-800 last:border-b-0 transition-colors text-left"
            >
              <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap w-14 shrink-0">
                Game {i + 1}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDuration(game.duration)}
              </span>

              {/* Winner — hidden in spoiler-free mode */}
              {spoilerFree ? (
                <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wider">
                  Hidden
                </span>
              ) : (
                <span className={`text-xs font-semibold ${
                  game.radiantWin ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {game.radiantWin ? game.radiantTeam : game.direTeam} WIN
                </span>
              )}

              <span className="text-xs text-gray-500 dark:text-gray-600 group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors uppercase tracking-wider inline-flex items-center gap-1">
                <span aria-hidden>▶</span> Watch VOD
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default MatchCard

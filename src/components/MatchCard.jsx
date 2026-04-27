import { useState, useEffect } from "react"
import { formatDuration, getSeriesLabel, trackEvent, getSeriesWins } from "../utils"

// Star icon: filled when followed, outlined when not
function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden="true">
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? "0" : "1.5"}
      />
    </svg>
  )
}

function MatchCard({
  series,
  onSelectGame,
  onDraftPosts,
  onDraftRedditPosts,
  defaultExpanded = false,
  spoilerFree = false,
  followedTeams,
  onToggleFollow,
  expandedSeriesId = null,
  selectedGameId = null,
  isGrandFinal = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    if (series.id === expandedSeriesId) setExpanded(true)
  }, [series.id, expandedSeriesId])

  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const { radiantWins, direWins } = getSeriesWins(series)
  const seriesLabel = getSeriesLabel(series.seriesType)

  const isRadiantFollowed = !!followedTeams?.includes(radiantTeam)
  const isDireFollowed = !!followedTeams?.includes(direTeam)

  function handleExpand() {
    if (!expanded) trackEvent("series_expand", { tournament: series.tournament, radiantTeam, direTeam })
    setExpanded((e) => !e)
  }

  // Only expand when the keypress originates from this element, not a child button
  function handleExpandKeyDown(e) {
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleExpand()
    }
  }

  function maxGamesForSeries(seriesType) {
    if (seriesType === 0) return 1
    if (seriesType === 2) return 5
    return 3
  }

  const maxGames = maxGamesForSeries(series.seriesType)
  // Build fixed-length slot array: actual game or null for unplayed
  const gameSlots = Array.from({ length: maxGames }, (_, i) => series.games[i] ?? null)

  return (
    <div
      data-series-id={series.id}
      className={
        "transition-all rounded border " +
        (series.id === expandedSeriesId
          ? "bg-white dark:bg-gray-950 border-blue-500 dark:border-blue-500 ring-1 ring-blue-500/30"
          : isGrandFinal
          ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/70 dark:border-amber-500/60 hover:border-amber-500 dark:hover:border-amber-400"
          : "bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600")
      }
    >

      {/* Card header -- uses div[role="button"] so nested follow <button> elements are valid HTML */}
      <div
        role="button"
        tabIndex="0"
        onClick={handleExpand}
        onKeyDown={handleExpandKeyDown}
        aria-expanded={expanded}
        aria-controls={`series-games-${series.id}`}
        className="focus-ring w-full text-left cursor-pointer"
      >
        {/* Tournament + date row */}
        <div className={`px-4 py-2 border-b flex justify-between items-center flex-wrap gap-2 ${isGrandFinal ? "border-amber-200 dark:border-amber-800/50" : "border-gray-200 dark:border-gray-800"}`}>
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold flex items-center gap-2 min-w-0">
            <span className="truncate">{series.tournament}</span>
            {seriesLabel && !spoilerFree && (
              <span className="text-gray-400 dark:text-gray-600 font-normal shrink-0">({seriesLabel})</span>
            )}
          </span>
          {isGrandFinal && (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <span aria-hidden>🏆</span> Grand Final
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-600 flex items-center gap-2">
              {series.date}
              <span className="inline-block transition-transform" aria-hidden>
                {expanded ? "▼" : "▶"}
              </span>
            </span>
          </div>
        </div>

        {/* Teams + score row */}
        <div className="px-4 py-4 flex items-center justify-between gap-2">
          {/* Radiant team */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className={`font-display text-base sm:text-xl tracking-wide uppercase truncate ${
              !spoilerFree && radiantWins > direWins
                ? "font-black text-gray-900 dark:text-white"
                : spoilerFree
                ? "font-black text-gray-900 dark:text-white"
                : "font-bold text-gray-400 dark:text-gray-500"
            }`}>
              {radiantTeam}
            </span>
            {onToggleFollow && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  trackEvent(isRadiantFollowed ? "unfollow_team" : "follow_team", { team_name: radiantTeam })
                  onToggleFollow(radiantTeam)
                }}
                className={`focus-ring flex-shrink-0 p-0.5 rounded transition-colors ${
                  isRadiantFollowed
                    ? "text-yellow-400"
                    : "text-gray-300 dark:text-gray-700 hover:text-yellow-400 dark:hover:text-yellow-400"
                }`}
                aria-label={isRadiantFollowed ? `Unfollow ${radiantTeam}` : `Follow ${radiantTeam}`}
                title={isRadiantFollowed ? `Unfollow ${radiantTeam}` : `Follow ${radiantTeam}`}
              >
                <StarIcon filled={isRadiantFollowed} />
              </button>
            )}
          </div>

          {/* Score */}
          <div className="flex items-center gap-2 shrink-0 px-1">
            {spoilerFree ? (
              <span className="font-display text-2xl sm:text-3xl font-black text-gray-300 dark:text-gray-700 select-none whitespace-nowrap">
                ? - ?
              </span>
            ) : (
              <>
                <span className={`font-display text-2xl sm:text-3xl font-black ${
                  radiantWins > direWins ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
                }`}>
                  {radiantWins}
                </span>
                <span className="text-gray-300 dark:text-gray-700 text-base font-medium">-</span>
                <span className={`font-display text-2xl sm:text-3xl font-black ${
                  direWins > radiantWins ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-500"
                }`}>
                  {direWins}
                </span>
              </>
            )}
          </div>

          {/* Dire team */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
            {onToggleFollow && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  trackEvent(isDireFollowed ? "unfollow_team" : "follow_team", { team_name: direTeam })
                  onToggleFollow(direTeam)
                }}
                className={`focus-ring flex-shrink-0 p-0.5 rounded transition-colors ${
                  isDireFollowed
                    ? "text-yellow-400"
                    : "text-gray-300 dark:text-gray-700 hover:text-yellow-400 dark:hover:text-yellow-400"
                }`}
                aria-label={isDireFollowed ? `Unfollow ${direTeam}` : `Follow ${direTeam}`}
                title={isDireFollowed ? `Unfollow ${direTeam}` : `Follow ${direTeam}`}
              >
                <StarIcon filled={isDireFollowed} />
              </button>
            )}
            <span className={`font-display text-base sm:text-xl tracking-wide uppercase truncate text-right ${
              !spoilerFree && direWins > radiantWins
                ? "font-black text-gray-900 dark:text-white"
                : spoilerFree
                ? "font-black text-gray-900 dark:text-white"
                : "font-bold text-gray-400 dark:text-gray-500"
            }`}>
              {direTeam}
            </span>
          </div>
        </div>

        {!expanded && (
          <div className="px-4 pb-3 pt-0 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider">
              {spoilerFree ? "Click to expand" : `${series.games.length} game${series.games.length !== 1 ? "s" : ""} - click to expand`}
            </span>
            {series.games[0] && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  trackEvent("watch_replay_click", { matchId: series.games[0].id, tournament: series.tournament, radiantTeam, direTeam })
                  onSelectGame(series.games[0])
                }}
                className="focus-ring flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                  <path d="M3 2.5a.5.5 0 0 1 .765-.424l10 5.5a.5.5 0 0 1 0 .848l-10 5.5A.5.5 0 0 1 3 13.5v-11z"/>
                </svg>
                Watch Replay
              </button>
            )}
          </div>
        )}
      </div>

      {/* Individual Games (expanded) */}
      {expanded && (
        <div
          id={`series-games-${series.id}`}
          className={`border-t ${isGrandFinal ? "border-amber-200 dark:border-amber-800/50" : "border-gray-200 dark:border-gray-800"}`}
        >
          {/* Game switcher — only when series has multiple games */}
          {gameSlots.filter(Boolean).length > 1 && (
            <div className={`px-4 py-2 flex items-center gap-2 border-b ${isGrandFinal ? "border-amber-200 dark:border-amber-800/50" : "border-gray-200 dark:border-gray-800"}`}>
              <div className="inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
                {gameSlots.map((game, i) => {
                  if (!game && !spoilerFree) return null
                  const isActive = game?.id === selectedGameId
                  return (
                    <button
                      key={game ? game.id : `switcher-empty-${i}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (game) {
                          trackEvent("game_switcher_click", { gameNumber: i + 1, matchId: game.id, tournament: series.tournament })
                          onSelectGame(game)
                        } else {
                          onSelectGame({ unplayed: true, gameNumber: i + 1, radiantTeam, direTeam, tournament: series.tournament })
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                        isActive
                          ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      G{i + 1}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {gameSlots.map((game, i) => {
            // In non-spoiler mode, unplayed slots are hidden
            if (!game && !spoilerFree) return null

            // All slots in spoiler-free mode + played slots in normal mode are clickable buttons
            function handleSlotClick(e) {
              e.stopPropagation()
              if (game) {
                trackEvent("game_click", { matchId: game.id, radiantTeam: game.radiantTeam, direTeam: game.direTeam, tournament: series.tournament })
                trackEvent("team_click", { team: game.radiantTeam, tournament: series.tournament })
                trackEvent("team_click", { team: game.direTeam, tournament: series.tournament })
                trackEvent("card_vod_click", { matchId: game.id, gameNumber: i + 1, radiantTeam: game.radiantTeam, direTeam: game.direTeam, tournament: series.tournament })
                onSelectGame(game)
              } else {
                // Unplayed slot clicked in spoiler-free mode
                onSelectGame({ unplayed: true, gameNumber: i + 1, radiantTeam, direTeam, tournament: series.tournament })
              }
            }

            return (
              <button
                key={game ? game.id : `empty-sf-${i}`}
                type="button"
                onClick={handleSlotClick}
                className="focus-ring w-full flex items-center justify-between px-4 py-3 min-h-[44px] hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer group border-b border-gray-200 dark:border-gray-800 last:border-b-0 transition-colors text-left"
              >
                <span className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap w-14 shrink-0">
                  Game {i + 1}
                </span>

                {/* Duration: shown only in non-spoiler mode for played games */}
                {!spoilerFree && game ? (
                  <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                    {formatDuration(game.duration)}
                  </span>
                ) : (
                  <span className="w-16" aria-hidden="true" />
                )}

                {/* Winner / spoiler-free placeholder */}
                {!spoilerFree && game ? (
                  <span className={`text-xs font-semibold ${
                    game.radiantWin ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {game.radiantWin ? game.radiantTeam : game.direTeam} WIN
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wider">
                    Hidden
                  </span>
                )}

                <span className="text-xs text-gray-600 dark:text-gray-600 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors uppercase tracking-wider inline-flex items-center gap-1">
                  <span aria-hidden>▶</span> Match Details
                </span>
              </button>
            )
          })}

          {/* Owner action buttons -- only when series is complete and not in spoiler-free mode */}
          {!spoilerFree && (onDraftPosts || onDraftRedditPosts) && (() => {
            const winsNeeded = series.seriesType === 0 ? 1 : series.seriesType === 2 ? 3 : 2
            const isComplete = radiantWins >= winsNeeded || direWins >= winsNeeded
            return isComplete ? (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                {onDraftPosts && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      trackEvent("draft_x_posts", { tournament: series.tournament, radiantTeam, direTeam, games: series.games.length })
                      onDraftPosts(series)
                    }}
                    className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Draft X posts
                  </button>
                )}
                {onDraftRedditPosts && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      trackEvent("draft_reddit_posts", { tournament: series.tournament, radiantTeam, direTeam, games: series.games.length })
                      onDraftRedditPosts(series)
                    }}
                    className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                      <circle cx="10" cy="10" r="10" fill="currentColor" className="text-orange-500" />
                      <path fill="white" d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.08 2.13.45a1 1 0 1 0 .24-.97l-2.38-.5a.25.25 0 0 0-.3.19l-.73 3.44a7.14 7.14 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 0 0 0-.44 1.46 1.46 0 0 0 .46-1.92zM7.27 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.58 2.71a3.58 3.58 0 0 1-2.85.86 3.58 3.58 0 0 1-2.85-.86.25.25 0 0 1 .35-.35 3.08 3.08 0 0 0 2.5.71 3.08 3.08 0 0 0 2.5-.71.25.25 0 0 1 .35.35zm-.13-1.71a1 1 0 1 1 1-1 1 1 0 0 1-1 1z"/>
                    </svg>
                    Draft Reddit
                  </button>
                )}
              </div>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}

export default MatchCard

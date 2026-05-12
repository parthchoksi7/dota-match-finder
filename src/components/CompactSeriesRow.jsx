import { getSeriesWins, getSeriesLabel, trackEvent } from '../utils'

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden="true">
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? '0' : '1.5'}
      />
    </svg>
  )
}

function CompactSeriesRow({ series, onSelectGame, onSelectSeries, spoilerFree = false, followedTeams, onToggleFollow, isGrandFinal = false, isFollowedMatch = false }) {
  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const { radiantWins, direWins } = getSeriesWins(series)
  const seriesLabel = getSeriesLabel(series.seriesType)

  const isRadiantFollowed = !!followedTeams?.includes(radiantTeam)
  const isDireFollowed = !!followedTeams?.includes(direTeam)

  // Open on the last played game (most likely the decider or most recent action)
  const lastGame = series.games[series.games.length - 1]

  function handleRowClick() {
    trackEvent('compact_row_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame(lastGame)
  }

  function handleReplayClick(e) {
    e.stopPropagation()
    trackEvent('compact_replay_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame({ ...series.games[0], _skipExpand: true })
  }

  const radiantWinner = !spoilerFree && radiantWins > direWins
  const direWinner = !spoilerFree && direWins > radiantWins

  return (
    <div
      role="row"
      onClick={handleRowClick}
      className={`grid items-center gap-2 px-4 py-2.5 min-h-[48px] border-b border-gray-100 dark:border-gray-900 last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        (isGrandFinal || isFollowedMatch) ? 'border-l-2 border-l-amber-500/70 bg-amber-50/30 dark:bg-amber-950/10' : ''
      }`}
      style={{ gridTemplateColumns: '1fr 76px 1fr auto' }}
      aria-label={`${radiantTeam} vs ${direTeam}`}
    >
      {/* Radiant team (left-aligned) */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`font-display text-sm tracking-wide uppercase truncate ${
          radiantWinner ? 'font-black text-gray-900 dark:text-white'
          : spoilerFree ? 'font-black text-gray-900 dark:text-white'
          : 'font-bold text-gray-400 dark:text-gray-500'
        }`}>
          {radiantTeam}
        </span>
        {onToggleFollow && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              trackEvent(isRadiantFollowed ? 'unfollow_team' : 'follow_team', { team_name: radiantTeam })
              onToggleFollow(radiantTeam)
            }}
            className={`focus-ring flex-shrink-0 p-0.5 rounded transition-colors ${
              isRadiantFollowed
                ? 'text-yellow-400'
                : 'text-gray-300 dark:text-gray-700 hover:text-yellow-400 dark:hover:text-yellow-400'
            }`}
            aria-label={isRadiantFollowed ? `Unfollow ${radiantTeam}` : `Follow ${radiantTeam}`}
            title={isRadiantFollowed ? `Unfollow ${radiantTeam}` : `Follow ${radiantTeam}`}
          >
            <StarIcon filled={isRadiantFollowed} />
          </button>
        )}
      </div>

      {/* Score block (center) */}
      <div className="flex flex-col items-center gap-0.5">
        {spoilerFree ? (
          <span className="font-display font-black text-xl text-gray-300 dark:text-gray-700 tabular-nums select-none">
            ? - ?
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <span className={`font-display font-black text-xl tabular-nums ${radiantWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
              {radiantWins}
            </span>
            <span className="text-sm font-medium text-gray-300 dark:text-gray-700">-</span>
            <span className={`font-display font-black text-xl tabular-nums ${direWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
              {direWins}
            </span>
          </div>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
          FT{seriesLabel ? ` · ${seriesLabel}` : ''}
        </span>
      </div>

      {/* Dire team (right-aligned) */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        <span className={`font-display text-sm tracking-wide uppercase truncate text-right ${
          direWinner ? 'font-black text-gray-900 dark:text-white'
          : spoilerFree ? 'font-black text-gray-900 dark:text-white'
          : 'font-bold text-gray-400 dark:text-gray-500'
        }`}>
          {direTeam}
        </span>
        {onToggleFollow && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              trackEvent(isDireFollowed ? 'unfollow_team' : 'follow_team', { team_name: direTeam })
              onToggleFollow(direTeam)
            }}
            className={`focus-ring flex-shrink-0 p-0.5 rounded transition-colors ${
              isDireFollowed
                ? 'text-yellow-400'
                : 'text-gray-300 dark:text-gray-700 hover:text-yellow-400 dark:hover:text-yellow-400'
            }`}
            aria-label={isDireFollowed ? `Unfollow ${direTeam}` : `Follow ${direTeam}`}
            title={isDireFollowed ? `Unfollow ${direTeam}` : `Follow ${direTeam}`}
          >
            <StarIcon filled={isDireFollowed} />
          </button>
        )}
      </div>

      {/* Replay button (hidden on mobile, visible sm+) */}
      <button
        type="button"
        onClick={handleReplayClick}
        className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
        aria-label={`Watch ${radiantTeam} vs ${direTeam} replay`}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 flex-shrink-0" aria-hidden="true">
          <path d="M3 2.5a.5.5 0 0 1 .765-.424l10 5.5a.5.5 0 0 1 0 .848l-10 5.5A.5.5 0 0 1 3 13.5v-11z"/>
        </svg>
        Replay
      </button>
    </div>
  )
}

export default CompactSeriesRow

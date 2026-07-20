import { useEffect, useRef } from 'react'
import { trackEvent } from '../utils'
import { TwitchIcon, YouTubeIcon } from './PlatformIcons'

function LiveMatchRow({ match, onSelectMatchId, onSelectLiveMatch, spoilerFree, isFollowedMatch, isHighlighted = false }) {
  const hasScore = match.seriesScore && match.seriesScore !== '0-0'
  const [scoreA, scoreB] = hasScore ? match.seriesScore.split('-').map(Number) : [0, 0]

  // Push-notification landing: scroll the targeted row into view. The ring below fades
  // out via transition-shadow when App clears the highlight after a few seconds.
  const rootRef = useRef(null)
  useEffect(() => {
    if (isHighlighted && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  const watchUrl = match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  const amberStyle = 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10'
  const redStyle = 'border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/10'

  // hasScore is no longer required to open the row: the companion's live pulse (draft/score/
  // Live Story) renders fine before any game has been decided, so a fresh 0-0 series is openable
  // too — hasScore-only was a leftover from before the companion had anything worth showing then.
  const isClickable = !!onSelectLiveMatch

  const hasSubRow = match.currentGame || match.bracketRound || watchUrl || match.youtubeStream

  return (
    <div
      ref={rootRef}
      onClick={() => { if (isClickable) onSelectLiveMatch(match.id) }}
      className={`border-b border-gray-100 dark:border-gray-900 last:border-b-0 transition-shadow duration-700 ${
        isFollowedMatch ? amberStyle : redStyle
      } ${isHighlighted ? 'ring-2 ring-inset ring-amber-400 dark:ring-amber-500' : ''} ${isClickable ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : ''}`}
    >
      {/* Main row: Team A · Score · Team B */}
      <div
        className="grid items-center gap-2 px-4 pt-2.5 pb-1 min-h-[40px]"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >
        {/* Team A (left) */}
        <div className="flex items-center min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate font-black ${
            !spoilerFree && hasScore && scoreA < scoreB
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}>
            {match.teamA}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1 shrink-0">
          {hasScore && !spoilerFree ? (
            <>
              <span className={`font-display font-black text-xl tabular-nums ${scoreA > scoreB ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {scoreA}
              </span>
              <span className="text-sm font-medium text-gray-300 dark:text-gray-700">-</span>
              <span className={`font-display font-black text-xl tabular-nums ${scoreB > scoreA ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {scoreB}
              </span>
            </>
          ) : hasScore && spoilerFree ? (
            <span className="font-display font-black text-xl text-gray-300 dark:text-gray-700 tabular-nums select-none">?·?</span>
          ) : (
            <span className="font-display font-black text-base text-gray-400 dark:text-gray-600 select-none">vs</span>
          )}
        </div>

        {/* Team B (right) */}
        <div className="flex items-center justify-end min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate text-right font-black ${
            !spoilerFree && hasScore && scoreB < scoreA
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {match.teamB}
          </span>
        </div>
      </div>

      {/* Sub-row: G{n} · bracket stage (centered) + watch button (right) */}
      {hasSubRow && (
        <div className="relative flex items-center px-4 pb-2.5 min-h-[28px]">
          {(match.currentGame || match.bracketRound) && (
            <span className="absolute left-1/2 -translate-x-1/2 max-w-[calc(100%-3.5rem)] flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap overflow-hidden">
              {match.currentGame && (
                <>
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="font-bold text-red-500">G{match.currentGame}</span>
                </>
              )}
              {match.currentGame && match.bracketRound && (
                <span className="text-gray-300 dark:text-gray-700">·</span>
              )}
              {match.bracketRound && (
                <span className="text-gray-500 dark:text-gray-500">{match.bracketRound}</span>
              )}
            </span>
          )}

          {/* Watch buttons */}
          {watchUrl || match.youtubeStream ? (
            <div className="flex items-center gap-1 ml-auto">
              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch', { channel: watchLabel, teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="sm:hidden focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on Twitch`}
                >
                  <TwitchIcon />
                </a>
              )}
              {match.youtubeStream && (
                <a
                  href={match.youtubeStream}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch_youtube', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="sm:hidden focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on YouTube`}
                >
                  <YouTubeIcon />
                </a>
              )}
              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch', { channel: watchLabel, teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on Twitch`}
                >
                  <TwitchIcon />
                  Watch{watchLabel ? ` · ${watchLabel}` : ''}
                </a>
              )}
              {match.youtubeStream && (
                <a
                  href={match.youtubeStream}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch_youtube', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on YouTube`}
                >
                  <YouTubeIcon />
                </a>
              )}
            </div>
          ) : (
            <div className="ml-auto w-7 h-7" aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  )
}

export default LiveMatchRow

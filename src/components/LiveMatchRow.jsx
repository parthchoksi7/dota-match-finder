import { trackEvent } from '../utils'

function TwitchIcon() {
  return (
    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

function LiveMatchRow({ match, onSelectMatchId, onSelectLiveMatch, spoilerFree, isFollowedMatch }) {
  const hasScore = match.seriesScore && match.seriesScore !== '0-0'
  const [scoreA, scoreB] = hasScore ? match.seriesScore.split('-').map(Number) : [0, 0]

  const watchUrl = match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  const amberStyle = 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10'
  const redStyle = 'border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/10'

  const isClickable = hasScore && !!onSelectLiveMatch

  const hasSubRow = match.currentGame || match.bracketRound || watchUrl || match.youtubeStream

  return (
    <div
      onClick={() => { if (isClickable) onSelectLiveMatch(match.id) }}
      className={`border-b border-gray-100 dark:border-gray-900 last:border-b-0 ${
        isFollowedMatch ? amberStyle : redStyle
      } ${isClickable ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : ''}`}
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

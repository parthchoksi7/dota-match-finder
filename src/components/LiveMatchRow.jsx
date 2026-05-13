import { trackEvent } from '../utils'

function TwitchIcon() {
  return (
    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  )
}

function LiveMatchRow({ match, onSelectMatchId, onSelectLiveMatch, spoilerFree, isFollowedMatch }) {
  const hasScore = match.seriesScore && match.seriesScore !== '0-0'
  const [scoreA, scoreB] = hasScore ? match.seriesScore.split('-').map(Number) : [0, 0]

  const watchUrl = match.streams?.[0]?.rawUrl || match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  const amberStyle = 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10'
  const redStyle = 'border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/10'

  // Clickable when score shows completed games exist (1-0, 0-1, 1-1, etc.)
  const isClickable = hasScore && !!onSelectLiveMatch

  return (
    <div
      onClick={() => { if (isClickable) onSelectLiveMatch(match.id) }}
      className={`grid items-center gap-2 px-4 py-2.5 min-h-[48px] border-b border-gray-100 dark:border-gray-900 last:border-b-0 ${
        isFollowedMatch ? amberStyle : redStyle
      } ${isClickable ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : ''}`}
      style={{ gridTemplateColumns: '1fr 80px 1fr auto' }}
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

      {/* Score center */}
      <div className="flex flex-col items-center gap-0.5">
        {hasScore && !spoilerFree ? (
          <div className="flex items-center gap-1">
            <span className={`font-display font-black text-xl tabular-nums ${scoreA > scoreB ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
              {scoreA}
            </span>
            <span className="text-sm font-medium text-gray-300 dark:text-gray-700">-</span>
            <span className={`font-display font-black text-xl tabular-nums ${scoreB > scoreA ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
              {scoreB}
            </span>
          </div>
        ) : (
          <span className="font-display font-black text-base text-gray-400 dark:text-gray-600 select-none">vs</span>
        )}
        {match.currentGame && (
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-red-500">G{match.currentGame}</span>
          </div>
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

      {/* Watch button */}
      {watchUrl ? (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => {
            e.stopPropagation()
            trackEvent('live_match_watch', {
              channel: watchLabel,
              teamA: match.teamA,
              teamB: match.teamB,
              tournament: match.tournament,
            })
          }}
          className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
          aria-label={`Watch ${match.teamA} vs ${match.teamB} live`}
        >
          <TwitchIcon />
          Watch{watchLabel ? ` · ${watchLabel}` : ''}
        </a>
      ) : (
        <div className="hidden sm:block w-[68px]" aria-hidden="true" />
      )}
    </div>
  )
}

export default LiveMatchRow

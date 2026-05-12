import { formatMatchTime, trackEvent } from '../utils'

function UpcomingMatchRow({ match, isFollowedMatch, spoilerFree }) {
  const timeStr = formatMatchTime(match.scheduledAt)
  const watchUrl = match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  const amberStyle = 'border-l-2 border-l-amber-500/60 bg-amber-50/30 dark:bg-amber-950/10'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-900 last:border-b-0 ${isFollowedMatch ? amberStyle : ''}`}>
      {/* Teams + time stacked */}
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm font-black tracking-wide uppercase text-gray-900 dark:text-white truncate leading-tight">
          {match.teamA}
          <span className="font-normal text-gray-400 dark:text-gray-600 text-xs mx-1.5">vs</span>
          {match.teamB}
        </p>
        {timeStr && (
          <p className="text-[11px] font-semibold tabular-nums text-blue-500 dark:text-blue-400 mt-0.5 leading-tight">
            {timeStr}
          </p>
        )}
      </div>

      {/* Stream pill — desktop only */}
      {watchUrl && (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('upcoming_stream_click', {
            channel: watchLabel,
            teamA: match.teamA,
            teamB: match.teamB,
          })}
          className="flex-shrink-0 hidden sm:block text-[10px] px-2 py-1 rounded-full bg-purple-800/30 hover:bg-purple-700/50 text-purple-400 transition-colors whitespace-nowrap"
        >
          {watchLabel || 'Watch'}
        </a>
      )}
    </div>
  )
}

export default UpcomingMatchRow

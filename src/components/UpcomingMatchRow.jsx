import { formatMatchTime, trackEvent } from '../utils'

function UpcomingMatchRow({ match }) {
  const timeStr = formatMatchTime(match.scheduledAt)
  const watchUrl = match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 min-h-[48px] border-b border-gray-100 dark:border-gray-900 last:border-b-0"
    >
      {/* Teams */}
      <div className="flex-1 min-w-0 truncate">
        <span className="font-display text-sm font-black tracking-wide uppercase text-gray-900 dark:text-white">
          {match.teamA}
        </span>
        <span className="mx-1.5 text-gray-400 dark:text-gray-600 text-xs font-medium">vs</span>
        <span className="font-display text-sm font-black tracking-wide uppercase text-gray-900 dark:text-white">
          {match.teamB}
        </span>
      </div>

      {/* Time */}
      {timeStr && (
        <span className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-blue-500 dark:text-blue-400 whitespace-nowrap">
          {timeStr}
        </span>
      )}

      {/* Stream pill */}
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

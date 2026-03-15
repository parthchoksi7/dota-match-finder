import { track } from '@vercel/analytics'

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, props)
  }
}

function formatDateRange(beginAt, endAt) {
  if (!beginAt) return null
  const opts = { month: 'short', day: 'numeric' }
  const start = new Date(beginAt).toLocaleDateString('en-US', opts)
  if (!endAt) return start
  const end = new Date(endAt).toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${start} - ${end}`
}

function formatCountdown(beginAt) {
  if (!beginAt) return null
  const diff = new Date(beginAt) - new Date()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 30) return null
  if (days > 0) return `Starts in ${days} day${days === 1 ? '' : 's'}`
  if (hours > 0) return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`
  return 'Starting soon'
}

function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Live
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
        Upcoming
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
      Completed
    </span>
  )
}

export default function TournamentCard({ tournament }) {
  const dateRange = formatDateRange(tournament.beginAt, tournament.endAt)
  const countdown = tournament.status === 'upcoming' ? formatCountdown(tournament.beginAt) : null
  const isCompleted = tournament.status === 'completed'

  return (
    <a
      href={`/tournament/${tournament.id}`}
      className={[
        'block border rounded p-4 transition-colors',
        isCompleted
          ? 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 opacity-70 hover:opacity-100'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600',
      ].join(' ')}
      onClick={() => trackEvent('tournament_card_click', {
        tournament_name: tournament.name,
        tournament_status: tournament.status,
      })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {tournament.leagueName && (
            <p className="text-xs uppercase tracking-[4px] text-red-500 mb-1 truncate">
              {tournament.leagueName}
            </p>
          )}
          <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wide text-gray-900 dark:text-white leading-tight truncate">
            {tournament.name}
          </h3>
        </div>
        <StatusBadge status={tournament.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {dateRange && (
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 tabular-nums">
            {dateRange}
          </span>
        )}
        {tournament.prizePool && (
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">
            {tournament.prizePool}
          </span>
        )}
        {tournament.tournamentCount > 0 && (
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">
            {tournament.tournamentCount} stage{tournament.tournamentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isCompleted && tournament.winner?.name && (
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
          Champion: {tournament.winner.name}
        </p>
      )}

      {countdown && (
        <p className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
          {countdown}
        </p>
      )}

      {tournament.tournaments?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tournament.tournaments.slice(0, 4).map(t => (
            <span
              key={t.id}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500"
            >
              {t.name}
            </span>
          ))}
          {tournament.tournaments.length > 4 && (
            <span className="text-xs px-2 py-0.5 text-gray-400 dark:text-gray-600">
              +{tournament.tournaments.length - 4} more
            </span>
          )}
        </div>
      )}
    </a>
  )
}

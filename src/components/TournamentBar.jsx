import { useState, useEffect } from 'react'
import { toTitleCase, trackEvent } from '../utils'

function formatCountdown(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `in ${days}d`
  if (hours > 0) return `in ${hours}h`
  return 'soon'
}

export default function TournamentBar() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveExpanded, setLiveExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/tournaments?mode=series')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data) return null

  const allLive = data.live || []
  const upcoming = (data.upcoming || []).slice(0, 1)
  const hasCollapsedLive = allLive.length > 1

  if (allLive.length === 0 && upcoming.length === 0) return null

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 flex-shrink-0">
        Tournaments
      </span>

      {hasCollapsedLive ? (
        <>
          <button
            type="button"
            onClick={() => {
              const next = !liveExpanded
              setLiveExpanded(next)
              trackEvent('tournament_bar_live_toggle', { action: next ? 'expand' : 'collapse', count: allLive.length })
            }}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors flex-shrink-0"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
              {allLive.length} live
            </span>
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0 ${liveExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {liveExpanded && allLive.map(t => (
            <a
              key={t.id}
              href={`/tournament/${t.id}`}
              className="flex items-center gap-1.5 group"
              onClick={() => trackEvent('tournament_bar_click', { tournament_name: t.name })}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors truncate max-w-[160px]">
                {toTitleCase(t.name)}
              </span>
            </a>
          ))}
        </>
      ) : (
        allLive.map(t => (
          <a
            key={t.id}
            href={`/tournament/${t.id}`}
            className="flex items-center gap-1.5 group"
            onClick={() => trackEvent('tournament_bar_click', { tournament_name: t.name })}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors truncate max-w-[160px]">
              {toTitleCase(t.name)}
            </span>
          </a>
        ))
      )}

      {upcoming.map(t => {
        const countdown = formatCountdown(t.beginAt)
        return (
          <a
            key={t.id}
            href={`/tournament/${t.id}`}
            className="flex items-center gap-1.5 group"
            onClick={() => trackEvent('tournament_bar_click', { tournament_name: t.name })}
          >
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors truncate max-w-[160px]">
              {toTitleCase(t.name)}
            </span>
            {countdown && (
              <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums flex-shrink-0">
                {countdown}
              </span>
            )}
          </a>
        )
      })}

      <a
        href="/tournaments"
        className="ml-auto text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex-shrink-0"
      >
        All
      </a>
    </div>
  )
}

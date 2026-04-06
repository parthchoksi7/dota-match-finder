import { useState, useEffect } from 'react'
import { track } from '@vercel/analytics'
import { toTitleCase } from '../utils'

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, props)
  }
}

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

  const live = (data.live || []).slice(0, 2)
  const upcoming = (data.upcoming || []).slice(0, 1)
  const items = [...live, ...upcoming].slice(0, 3)

  if (items.length === 0) return null

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 flex-shrink-0">
        Tournaments
      </span>
      {items.map(t => {
        const isLive = t.status === 'live'
        const countdown = !isLive ? formatCountdown(t.beginAt) : null
        return (
          <a
            key={t.id}
            href={`/tournament/${t.id}`}
            className="flex items-center gap-1.5 group"
            onClick={() => trackEvent('tournament_bar_click', { tournament_name: t.name })}
          >
            {isLive && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            )}
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

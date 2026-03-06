import { useState, useEffect } from "react"

const INITIAL_SHOW = 8
const POLL_INTERVAL = 2 * 60 * 1000 // re-fetch live matches every 2 minutes

function formatMatchTime(scheduledAt) {
  if (!scheduledAt) return null
  const date = new Date(scheduledAt)
  const now = new Date()
  const diffMs = date - now
  const diffHours = diffMs / (1000 * 60 * 60)

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzShort = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone })
    .formatToParts(date)
    .find(p => p.type === "timeZoneName")?.value || ""

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })

  if (diffHours < 0) return "Starting soon"
  if (diffHours < 1) {
    const mins = Math.round(diffMs / 60000)
    return `In ${mins}m`
  }
  if (diffHours < 24) {
    const hrs = Math.floor(diffHours)
    const mins = Math.round((diffHours - hrs) * 60)
    const countdown = mins > 0 ? `In ${hrs}h ${mins}m` : `In ${hrs}h`
    return `${countdown} · ${timeStr} ${tzShort}`
  }
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })
  return `${dateStr} · ${timeStr} ${tzShort}`
}

function StreamButtons({ streams }) {
  if (!streams || streams.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {streams.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-2 py-0.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold uppercase tracking-wider rounded transition-colors"
        >
          {s.label}
        </a>
      ))}
    </div>
  )
}

function UpcomingMatches() {
  const [liveMatches, setLiveMatches] = useState([])
  const [upcomingMatches, setUpcomingMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  async function fetchLive() {
    try {
      const r = await fetch("/api/live-matches")
      const data = await r.json()
      setLiveMatches(data.matches || [])
    } catch {
      // silently fail
    }
  }

  async function fetchUpcoming() {
    try {
      const r = await fetch("/api/upcoming-matches")
      const data = await r.json()
      setUpcomingMatches(data.matches || [])
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    Promise.all([fetchLive(), fetchUpcoming()]).finally(() => setLoading(false))

    // Poll live matches every 2 minutes
    const interval = setInterval(fetchLive, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <section className="border border-gray-200 dark:border-gray-800 rounded p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-900/30">
      <div className="h-3 w-40 bg-gray-200 dark:bg-gray-800 rounded mb-4 animate-pulse" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-800 last:border-0">
          <div className="h-3 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      ))}
    </section>
  )

  if (!liveMatches.length && !upcomingMatches.length) return null

  const visibleUpcoming = showAll ? upcomingMatches : upcomingMatches.slice(0, INITIAL_SHOW)

  return (
    <section
      className="border border-gray-200 dark:border-gray-800 rounded bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden"
      aria-labelledby="matches-schedule-heading"
    >
      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <>
          <div className="px-4 sm:px-5 pt-4 pb-2">
            <h2
              id="matches-schedule-heading"
              className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold flex items-center gap-2"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live Now
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {liveMatches.map(match => (
              <div key={match.id} className="px-4 sm:px-5 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 truncate mb-0.5">
                  {match.tournament}
                  {match.seriesLabel && (
                    <span className="ml-1.5 text-gray-400 dark:text-gray-700">({match.seriesLabel})</span>
                  )}
                </p>
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {match.teamA}
                  <span className="text-gray-400 dark:text-gray-600 font-normal mx-2">vs</span>
                  {match.teamB}
                </p>
                <StreamButtons streams={match.streams} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upcoming Matches */}
      {upcomingMatches.length > 0 && (
        <>
          <div className={`px-4 sm:px-5 pt-4 pb-2 ${liveMatches.length > 0 ? 'border-t border-gray-200 dark:border-gray-800' : ''}`}>
            <h2
              id={liveMatches.length === 0 ? "matches-schedule-heading" : undefined}
              className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold"
            >
              Upcoming Matches
              <span className="ml-2 text-gray-400 dark:text-gray-600 font-normal">Next 72 hours</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {visibleUpcoming.map(match => (
              <div key={match.id} className="px-4 sm:px-5 py-2.5">
  <div className="flex items-center justify-between mb-0.5">
    <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 truncate">
      {match.tournament}
      {match.seriesLabel && (
        <span className="ml-1.5 text-gray-400 dark:text-gray-700">({match.seriesLabel})</span>
      )}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-500 tabular-nums whitespace-nowrap shrink-0 ml-3">
      {formatMatchTime(match.scheduledAt)}
    </p>
  </div>
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
      {match.teamA}
      <span className="text-gray-400 dark:text-gray-600 font-normal mx-2">vs</span>
      {match.teamB}
    </p>
    <StreamButtons streams={match.streams} />
  </div>
</div>
            ))}
          </div>
          {upcomingMatches.length > INITIAL_SHOW && (
            <div className="border-t border-gray-200 dark:border-gray-800 px-4 sm:px-5 py-3">
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white uppercase tracking-widest transition-colors"
              >
                {showAll ? "Show less" : `Show ${upcomingMatches.length - INITIAL_SHOW} more matches`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default UpcomingMatches

import { useState, useEffect } from "react"

const INITIAL_SHOW = 8
const POLL_INTERVAL = 2 * 60 * 1000

function trackEvent(name, props) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

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

function matchesQuery(match, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    match.teamA?.toLowerCase().includes(q) ||
    match.teamB?.toLowerCase().includes(q) ||
    match.tournament?.toLowerCase().includes(q)
  )
}

function StreamButtons({ streams, matchLabel }) {
  if (!streams || streams.length === 0) return null
  return (
    <div className="flex gap-1.5 flex-shrink-0">
      {streams.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("stream_click", { channel: s.label, match: matchLabel })}
          className="inline-flex items-center px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap"
        >
          {s.label}
        </a>
      ))}
    </div>
  )
}

function SectionHeader({ id, children }) {
  return (
    <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
      <h2
        id={id}
        className="text-sm uppercase tracking-widest text-gray-700 dark:text-gray-300 font-bold"
      >
        {children}
      </h2>
    </div>
  )
}

function UpcomingMatches({ searchQuery = "", onSelectMatchId, spoilerFree = false }) {
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
    const interval = setInterval(fetchLive, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  // Reset show-all when search query changes
  useEffect(() => {
    setShowAll(false)
  }, [searchQuery])

  if (loading) return (
    <section className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
        <div className="h-3.5 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="px-4 sm:px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 last:border-0 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="h-2 w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          </div>
          <div className="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      ))}
    </section>
  )

  const filteredLive = liveMatches.filter(m => matchesQuery(m, searchQuery))
  const filteredUpcoming = upcomingMatches.filter(m => matchesQuery(m, searchQuery))
  const isSearching = searchQuery.length > 0
  const visibleUpcoming = isSearching || showAll
    ? filteredUpcoming
    : filteredUpcoming.slice(0, INITIAL_SHOW)

  if (!filteredLive.length && !filteredUpcoming.length) return null

  return (
    <div className="flex flex-col gap-4" aria-labelledby="matches-schedule-heading">
      {filteredLive.length > 0 && (
        <section className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
          <SectionHeader id="matches-schedule-heading">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live Now
            </span>
          </SectionHeader>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {filteredLive.map(match => {
              const label = `${match.teamA} vs ${match.teamB}`
              const hasScore = match.seriesScore && match.seriesScore !== "0-0"
              const completedGames = (match.games || []).filter(g => g.status === "finished")
              return (
                <div key={match.id} className="px-4 sm:px-5 py-4 flex flex-col gap-2">
                  {/* Row 1: Tournament + series badge + stream button */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-medium truncate">
                        {match.tournament}
                      </p>
                      {match.seriesLabel && (
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500">
                          {match.seriesLabel}
                        </span>
                      )}
                    </div>
                    <StreamButtons streams={match.streams} matchLabel={label} />
                  </div>

                  {/* Row 2: Scoreboard — TeamA [score] TeamB */}
                  {(() => {
                    const scoreA = hasScore ? Number(match.seriesScore.split("-")[0]) : 0
                    const scoreB = hasScore ? Number(match.seriesScore.split("-")[1]) : 0
                    const dimA = !spoilerFree && hasScore && scoreA < scoreB
                    const dimB = !spoilerFree && hasScore && scoreB < scoreA
                    return (
                      <div className="flex items-center gap-2">
                        <p className={`flex-1 text-sm font-bold text-right truncate ${dimA ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                          {match.teamA}
                        </p>
                        <div className="shrink-0 flex flex-col items-center w-16">
                          {hasScore && !spoilerFree ? (
                            <span className="text-base font-black tabular-nums text-gray-900 dark:text-white leading-none">
                              {scoreA}
                              <span className="text-gray-300 dark:text-gray-700 font-light mx-1">—</span>
                              {scoreB}
                            </span>
                          ) : (
                            <span className="text-xs font-normal text-gray-400 dark:text-gray-600">vs</span>
                          )}
                          {match.currentGame && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-red-500 dark:text-red-400">
                              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                              G{match.currentGame}
                            </span>
                          )}
                        </div>
                        <p className={`flex-1 text-sm font-bold truncate ${dimB ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                          {match.teamB}
                        </p>
                      </div>
                    )
                  })()}

                  {/* Row 3: Completed game chips */}
                  {completedGames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {completedGames.map(g => (
                        g.matchId ? (
                          <button
                            key={g.position}
                            type="button"
                            onClick={() => {
                              onSelectMatchId?.(g.matchId)
                              trackEvent("live_game_details_click", { matchId: g.matchId, game: g.position })
                            }}
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            <span className="text-gray-400 dark:text-gray-700">G{g.position}</span>
                            {g.winnerName && !spoilerFree && <span className="font-semibold">{g.winnerName}</span>}
                            <span className="text-gray-300 dark:text-gray-700">›</span>
                          </button>
                        ) : (
                          <span
                            key={g.position}
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600"
                          >
                            <span>G{g.position}</span>
                            {g.winnerName && !spoilerFree && <span>{g.winnerName}</span>}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {filteredUpcoming.length > 0 && (
        <section className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
          <SectionHeader id={filteredLive.length === 0 ? "matches-schedule-heading" : undefined}>
            <span className="inline-flex items-center gap-2">
              Upcoming Matches
              <span className="text-gray-400 dark:text-gray-600 font-normal normal-case tracking-normal text-xs">
                {isSearching ? `${filteredUpcoming.length} found` : "Next 72 hours"}
              </span>
            </span>
          </SectionHeader>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {visibleUpcoming.map(match => {
              const label = `${match.teamA} vs ${match.teamB}`
              const timeStr = formatMatchTime(match.scheduledAt)
              return (
                <div key={match.id} className="px-4 sm:px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-medium truncate">
                      {match.tournament}
                      {match.seriesLabel && (
                        <span className="ml-1.5 text-gray-400 dark:text-gray-700 normal-case tracking-normal font-normal">
                          ({match.seriesLabel})
                        </span>
                      )}
                    </p>
                    {timeStr && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                        {timeStr}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-white min-w-0">
                      <span>{match.teamA}</span>
                      <span className="text-gray-400 dark:text-gray-600 font-normal mx-1.5">vs</span>
                      <span>{match.teamB}</span>
                    </p>
                    <StreamButtons streams={match.streams} matchLabel={label} />
                  </div>
                </div>
              )
            })}
          </div>
          {!isSearching && filteredUpcoming.length > INITIAL_SHOW && (
            <div className="border-t border-gray-200 dark:border-gray-800 px-4 sm:px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setShowAll(v => !v)
                  trackEvent("upcoming_show_more", { action: showAll ? "collapse" : "expand" })
                }}
                className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white uppercase tracking-widest transition-colors"
              >
                {showAll ? "Show less" : `Show ${filteredUpcoming.length - INITIAL_SHOW} more`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default UpcomingMatches

import { useState, useMemo } from "react"
import { groupIntoSeries, isSeriesComplete, getLeagueLabel, trackEvent } from "../utils"
import DateStrip from "./DateStrip"
import CompactSeriesRow from "./CompactSeriesRow"

// Returns "Today", "Yesterday", or "Mar 7" for a unix timestamp (seconds)
function getDateLabel(unixSeconds) {
  if (!unixSeconds) return null
  const now = new Date()
  const d = new Date(unixSeconds * 1000)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Returns a stable day-bucket key (not the display label) so one day = one pill
function getDayKey(unixSeconds) {
  if (!unixSeconds) return 'unknown'
  return new Date(unixSeconds * 1000).toDateString()
}

// Groups series into { tournament, org, series[] } buckets, preserving newest-first order
function groupByTournament(seriesList) {
  const order = []
  const map = {}
  for (const s of seriesList) {
    const name = s.tournament
    if (!map[name]) {
      map[name] = { tournament: name, org: getLeagueLabel(name), series: [] }
      order.push(name)
    }
    map[name].series.push(s)
  }
  return order.map(name => map[name])
}

function ChevronIcon({ rotated }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-150 flex-shrink-0 ${rotated ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LatestMatches({
  matches,
  onSelectMatch,
  onSelectSeries,
  onDraftPosts,
  onDraftRedditPosts,
  spoilerFree = false,
  followedTeams,
  onToggleFollow,
  error = null,
  onRetry,
}) {
  const allSeries = useMemo(() => groupIntoSeries(matches || []), [matches])
  const completeSeries = useMemo(() => allSeries.filter(isSeriesComplete), [allSeries])

  // Build ordered unique date pills from the series data
  const availableDates = useMemo(() => {
    const seen = new Set()
    const dates = []
    for (const s of completeSeries) {
      const key = getDayKey(s.startTime)
      if (!seen.has(key)) {
        seen.add(key)
        dates.push({ key, label: getDateLabel(s.startTime) })
      }
    }
    return dates
  }, [completeSeries])

  const [activeDate, setActiveDate] = useState(null)
  const [collapsedTournaments, setCollapsedTournaments] = useState(new Set())

  // Resolve active date: default to the first (most recent) available date
  const resolvedDate = activeDate ?? availableDates[0]?.key ?? null

  // Filter to the selected date then group by tournament
  const todaySeries = useMemo(
    () => completeSeries.filter(s => getDayKey(s.startTime) === resolvedDate),
    [completeSeries, resolvedDate]
  )
  const tournamentGroups = useMemo(() => groupByTournament(todaySeries), [todaySeries])

  function toggleCollapse(tournamentName) {
    setCollapsedTournaments(prev => {
      const next = new Set(prev)
      if (next.has(tournamentName)) next.delete(tournamentName)
      else next.add(tournamentName)
      return next
    })
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="w-full">
        <div className="flex items-center mb-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
            Latest results
          </h2>
        </div>
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded"
          role="alert"
        >
          <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
            Could not load past matches - OpenDota may be temporarily down
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (completeSeries.length === 0) return null

  return (
    <div className="w-full">
      {/* Section label */}
      <div className="flex items-center mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
          Latest results
        </h2>
      </div>

      {/* Date strip + tournament groups card */}
      <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-950 overflow-hidden">
        <DateStrip
          dates={availableDates}
          activeDate={resolvedDate}
          onChange={key => {
            setActiveDate(key)
            setCollapsedTournaments(new Set())
          }}
        />

        {tournamentGroups.length === 0 ? (
          <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            No results
          </p>
        ) : (
          tournamentGroups.map(group => {
            const isCollapsed = collapsedTournaments.has(group.tournament)
            return (
              <div key={group.tournament} className="border-b border-gray-100 dark:border-gray-900 last:border-b-0">
                {/* Tournament header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
                  onClick={() => toggleCollapse(group.tournament)}
                >
                  {/* Left zone: name links to /tournaments */}
                  <a
                    href="/tournaments"
                    onClick={e => {
                      e.stopPropagation()
                      trackEvent('tournament_header_click', { tournament: group.tournament })
                    }}
                    className="flex flex-col gap-0.5 min-w-0 flex-1 group/link"
                  >
                    {group.org && (
                      <span className="text-[10px] font-bold uppercase tracking-[4px] text-red-500">
                        {group.org}
                      </span>
                    )}
                    <span className="font-display font-bold text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate group-hover/link:text-gray-600 dark:group-hover/link:text-gray-300 transition-colors">
                      {group.tournament}
                    </span>
                  </a>

                  {/* Match count */}
                  <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600 flex-shrink-0">
                    {group.series.length}
                  </span>

                  {/* Collapse chevron (separate touch target) */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      toggleCollapse(group.tournament)
                    }}
                    aria-label={isCollapsed ? `Expand ${group.tournament}` : `Collapse ${group.tournament}`}
                    aria-expanded={!isCollapsed}
                    className="focus-ring flex-shrink-0 p-1 rounded text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    <ChevronIcon rotated={!isCollapsed} />
                  </button>
                </div>

                {/* Match rows */}
                {!isCollapsed && (
                  <div role="rowgroup">
                    {group.series.map(s => (
                      <CompactSeriesRow
                        key={s.id}
                        series={s}
                        onSelectGame={onSelectMatch}
                        onSelectSeries={onSelectSeries}
                        spoilerFree={spoilerFree}
                        followedTeams={followedTeams}
                        onToggleFollow={onToggleFollow}
                        isGrandFinal={s.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))}
                        bracketRound={s.games[0]?.bracketRound}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default LatestMatches

import { useState, useMemo } from 'react'
import { groupIntoSeries, isSeriesComplete, getLeagueLabel, trackEvent } from '../utils'
import DateStrip from './DateStrip'
import CompactSeriesRow from './CompactSeriesRow'
import LiveMatchRow from './LiveMatchRow'
import UpcomingMatchRow from './UpcomingMatchRow'
import TournamentHub from './TournamentHub'

function getDayKey(unixSeconds) {
  if (!unixSeconds) return 'unknown'
  return new Date(unixSeconds * 1000).toDateString()
}

function getDateLabel(unixSeconds) {
  if (!unixSeconds) return null
  const now = new Date()
  const d = new Date(unixSeconds * 1000)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

function HomeFeed({
  liveMatches = [],
  upcomingMatches = [],
  allMatches = [],
  onSelectMatch,
  onSelectSeries,
  spoilerFree = false,
  followedTeams = [],
  onToggleFollow,
  grandFinalMatchIds = new Set(),
  error = null,
  onRetry,
  onSelectMatchId,
  tournamentIdMap,
}) {
  const todayKey = useMemo(() => new Date().toDateString(), [])
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86400000).toDateString(), [])

  const completeSeries = useMemo(
    () => groupIntoSeries(allMatches || []).filter(isSeriesComplete),
    [allMatches]
  )

  const [activeDate, setActiveDate] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [collapsedTournaments, setCollapsedTournaments] = useState(new Set())
  const [expandedTournamentName, setExpandedTournamentName] = useState(null)

  // Build chronological date list: past days → today → tomorrow
  const availableDates = useMemo(() => {
    const dayTimestamps = {}
    for (const s of completeSeries) {
      const key = getDayKey(s.startTime)
      if (!dayTimestamps[key]) dayTimestamps[key] = s.startTime
    }

    const pastKeys = Object.keys(dayTimestamps)
      .filter(k => k !== todayKey && k !== tomorrowKey)
      .sort((a, b) => new Date(a) - new Date(b))

    const dates = pastKeys.map(k => ({ key: k, label: getDateLabel(dayTimestamps[k]) }))

    const hasToday = liveMatches.length > 0
      || upcomingMatches.some(m => new Date(m.scheduledAt).toDateString() === todayKey)
      || Object.prototype.hasOwnProperty.call(dayTimestamps, todayKey)

    if (hasToday) {
      dates.push({ key: todayKey, label: 'Today' })
    }

    const hasTomorrow = upcomingMatches.some(m => new Date(m.scheduledAt).toDateString() === tomorrowKey)
    if (hasTomorrow) {
      dates.push({ key: tomorrowKey, label: 'Tomorrow' })
    }

    return dates
  }, [completeSeries, liveMatches, upcomingMatches, todayKey, tomorrowKey])

  // Default to most recent date with data; prefer today if today has data.
  const defaultDateKey = availableDates.some(d => d.key === todayKey)
    ? todayKey
    : (availableDates[availableDates.length - 1]?.key ?? todayKey)
  const resolvedDate = activeDate ?? defaultDateKey

  const isToday = resolvedDate === todayKey

  const activeLiveMatches = isToday ? liveMatches : []

  const activeUpcomingMatches = useMemo(
    () => upcomingMatches.filter(m => new Date(m.scheduledAt).toDateString() === resolvedDate),
    [upcomingMatches, resolvedDate]
  )

  const activeCompletedSeries = useMemo(
    () => completeSeries.filter(s => getDayKey(s.startTime) === resolvedDate),
    [completeSeries, resolvedDate]
  )

  // Build tournament cards sorted: live → upcoming → followed-team → completed
  const tournamentCards = useMemo(() => {
    const isFollowedSeries = s =>
      !!followedTeams?.length &&
      (followedTeams.includes(s.games?.[0]?.radiantTeam) || followedTeams.includes(s.games?.[0]?.direTeam))
    const isFollowedLive = m =>
      !!followedTeams?.length &&
      (followedTeams.includes(m.teamA) || followedTeams.includes(m.teamB))

    const allNames = new Set([
      ...activeLiveMatches.map(m => m.tournament || 'Other'),
      ...activeUpcomingMatches.map(m => m.tournament || 'Other'),
      ...activeCompletedSeries.map(s => s.tournament || 'Other'),
    ])

    const cards = []
    for (const t of allNames) {
      const live = activeLiveMatches.filter(m => (m.tournament || 'Other') === t)
      const upcoming = activeUpcomingMatches.filter(m => (m.tournament || 'Other') === t)
      const completed = activeCompletedSeries.filter(s => (s.tournament || 'Other') === t)

      if (activeFilter === 'live' && live.length === 0) continue
      if (activeFilter === 'upcoming' && upcoming.length === 0) continue
      if (activeFilter === 'completed' && completed.length === 0) continue

      // Followed-team rows float to the top within each card
      const liveSorted = [...live].sort((a, b) => (isFollowedLive(a) ? 0 : 1) - (isFollowedLive(b) ? 0 : 1))
      const completedSorted = [...completed].sort((a, b) => (isFollowedSeries(a) ? 0 : 1) - (isFollowedSeries(b) ? 0 : 1))

      const hasFollowed =
        liveSorted.some(isFollowedLive) ||
        upcoming.some(isFollowedLive) ||
        completedSorted.some(isFollowedSeries)

      const latestTime = Math.max(
        ...live.map(() => Date.now() / 1000),
        ...upcoming.map(m => new Date(m.scheduledAt).getTime() / 1000),
        ...completed.map(s => s.startTime || 0),
        0
      )

      cards.push({
        tournament: t,
        org: getLeagueLabel(t),
        liveMatches: liveSorted,
        upcomingMatches: upcoming,
        completedSeries: completedSorted,
        hasLive: live.length > 0,
        hasUpcoming: upcoming.length > 0,
        hasFollowed,
        latestTime,
      })
    }

    cards.sort((a, b) => {
      if (a.hasLive !== b.hasLive) return a.hasLive ? -1 : 1
      if (a.hasUpcoming !== b.hasUpcoming) return a.hasUpcoming ? -1 : 1
      if (a.hasFollowed !== b.hasFollowed) return a.hasFollowed ? -1 : 1
      return b.latestTime - a.latestTime
    })

    return cards
  }, [activeLiveMatches, activeUpcomingMatches, activeCompletedSeries, activeFilter, followedTeams])

  function toggleCollapse(tournamentName) {
    setCollapsedTournaments(prev => {
      const next = new Set(prev)
      if (next.has(tournamentName)) next.delete(tournamentName)
      else next.add(tournamentName)
      return next
    })
  }

  if (error) {
    return (
      <div
        className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded"
        role="alert"
      >
        <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
          Could not load matches - OpenDota may be temporarily down
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
    )
  }

  const liveCount = activeLiveMatches.length
  const upcomingCount = activeUpcomingMatches.length
  const completedCount = activeCompletedSeries.length
  const totalCount = liveCount + upcomingCount + completedCount

  const filterTabs = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'live', label: 'Live', count: liveCount },
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
  ]

  return (
    <div className="w-full">
      {/* Date strip + filter bar */}
      <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-950 overflow-hidden mb-3">
        <DateStrip
          dates={availableDates}
          activeDate={resolvedDate}
          onChange={key => {
            setActiveDate(key)
            setCollapsedTournaments(new Set())
            setActiveFilter('all')
            setExpandedTournamentName(null)
          }}
        />

        {/* Filter bar */}
        <div
          className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          role="tablist"
          aria-label="Filter matches by type"
        >
          {filterTabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeFilter === key}
              onClick={() => {
                trackEvent('feed_filter', { filter: key, date: resolvedDate })
                setActiveFilter(key)
              }}
              className={`flex-shrink-0 px-3 min-h-[38px] flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors duration-150 ${
                activeFilter === key
                  ? 'text-gray-900 dark:text-white border-red-500'
                  : 'text-gray-500 dark:text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
                  activeFilter === key
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament cards */}
      {tournamentCards.length === 0 ? (
        <div className="border border-gray-200 dark:border-gray-800 rounded py-10 text-center bg-white dark:bg-gray-950">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            No matches
          </p>
        </div>
      ) : (
        tournamentCards.map(card => {
          const isCollapsed = collapsedTournaments.has(card.tournament)
          const isHubExpanded = expandedTournamentName === card.tournament
          const hubId = tournamentIdMap?.get(card.tournament)
          const rowCount = card.liveMatches.length + card.upcomingMatches.length + card.completedSeries.length

          return (
            <div
              key={card.tournament}
              className="border border-gray-200 dark:border-gray-800 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950 last:mb-0"
            >
              {/* Tournament header */}
              <div
                className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 cursor-pointer"
                onClick={() => {
                  trackEvent('tournament_card_collapse', { tournament: card.tournament, collapsed: !isCollapsed })
                  toggleCollapse(card.tournament)
                }}
              >
                {/* Tournament name - expands TournamentHub inline if available */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    if (hubId) {
                      trackEvent('tournament_hub_expand', { tournament: card.tournament, expanded: !isHubExpanded })
                      setExpandedTournamentName(isHubExpanded ? null : card.tournament)
                    } else {
                      trackEvent('tournament_header_click', { tournament: card.tournament })
                      window.location.href = '/tournaments'
                    }
                  }}
                  className="flex flex-col gap-0.5 min-w-0 flex-1 text-left"
                >
                  {card.org && (
                    <span className="text-[10px] font-bold uppercase tracking-[4px] text-red-500">
                      {card.org}
                    </span>
                  )}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-display font-bold text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      {card.tournament}
                    </span>
                    {hubId && (
                      <svg
                        className={`w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-600 transition-transform duration-150 ${isHubExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </div>
                </button>

                {card.hasLive && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
                  </div>
                )}

                <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600 flex-shrink-0">
                  {rowCount}
                </span>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('tournament_card_collapse', { tournament: card.tournament, collapsed: !isCollapsed })
                    toggleCollapse(card.tournament)
                  }}
                  aria-label={isCollapsed ? `Expand ${card.tournament}` : `Collapse ${card.tournament}`}
                  aria-expanded={!isCollapsed}
                  className="focus-ring flex-shrink-0 p-1 rounded text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <ChevronIcon rotated={!isCollapsed} />
                </button>
              </div>

              {/* Match rows */}
              {!isCollapsed && (
                <div role="rowgroup">
                  {card.liveMatches.map(m => (
                    <LiveMatchRow
                      key={m.id}
                      match={m}
                      onSelectMatchId={onSelectMatchId}
                      spoilerFree={spoilerFree}
                      isFollowedMatch={!!(followedTeams?.includes(m.teamA) || followedTeams?.includes(m.teamB))}
                    />
                  ))}
                  {card.upcomingMatches.map(m => (
                    <UpcomingMatchRow
                      key={m.id}
                      match={m}
                    />
                  ))}
                  {card.completedSeries.map(s => {
                    const isFollowedMatch = !!(
                      followedTeams?.includes(s.games[0]?.radiantTeam) ||
                      followedTeams?.includes(s.games[0]?.direTeam)
                    )
                    return (
                      <CompactSeriesRow
                        key={s.id}
                        series={s}
                        onSelectGame={onSelectMatch}
                        onSelectSeries={onSelectSeries}
                        spoilerFree={spoilerFree}
                        followedTeams={followedTeams}
                        onToggleFollow={onToggleFollow}
                        isGrandFinal={s.games.some(g => grandFinalMatchIds.has(g.id))}
                        isFollowedMatch={isFollowedMatch}
                      />
                    )
                  })}
                </div>
              )}

              {/* Inline TournamentHub — expands when tournament name is clicked */}
              {isHubExpanded && hubId && (
                <div className="border-t border-gray-200 dark:border-gray-800">
                  <TournamentHub
                    key={hubId}
                    tournamentId={hubId}
                    spoilerFree={spoilerFree}
                    onClose={() => setExpandedTournamentName(null)}
                  />
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

export default HomeFeed

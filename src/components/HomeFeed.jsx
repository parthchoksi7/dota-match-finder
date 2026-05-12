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

// Fuzzy match: all significant words in the feed name must appear in the PandaScore key.
// Handles cases like "1Win Essence I" matching "1win Essence Season 1 2026 - Decider Stage".
function findTournamentId(name, idMap) {
  if (!idMap || !name) return null
  if (idMap.has(name)) return idMap.get(name)
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const feedWords = normalize(name).split(' ').filter(w => w.length > 2)
  if (!feedWords.length) return null
  for (const [k, v] of idMap) {
    const kn = normalize(k)
    if (feedWords.every(w => kn.includes(w))) return v
  }
  return null
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
  onLoadMore,
  loadingMore,
  hasMore,
  onManageTeams,
}) {
  const todayKey = useMemo(() => new Date().toDateString(), [])
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86400000).toDateString(), [])

  const completeSeries = useMemo(
    () => groupIntoSeries(allMatches || []).filter(isSeriesComplete),
    [allMatches]
  )

  const [activeDate, setActiveDate] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedTournamentName, setExpandedTournamentName] = useState(null)
  const [calNudgeDismissed, setCalNudgeDismissed] = useState(
    () => !!localStorage.getItem('spectate-cal-nudge-dismissed')
  )

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
            setActiveFilter('all')
            setExpandedTournamentName(null)
          }}
          onLoadEarlier={hasMore ? onLoadMore : null}
          loadingEarlier={loadingMore}
        />

        {/* Filter bar */}
        <div className="flex items-center">
          <div
            className="flex flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
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
      </div>

      {/* Dismissible calendar nudge */}
      {!calNudgeDismissed && (
        <div className="flex items-center gap-3 px-3 py-2.5 mb-3 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-600" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">Add matches to your calendar</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 leading-snug">Subscribe to live, upcoming, and team schedules</p>
          </div>
          <a
            href="/calendar"
            onClick={() => trackEvent('calendar_nudge_click', { source: 'feed_nudge' })}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors whitespace-nowrap"
          >
            Add
          </a>
          <button
            type="button"
            onClick={() => {
              setCalNudgeDismissed(true)
              localStorage.setItem('spectate-cal-nudge-dismissed', '1')
              trackEvent('calendar_nudge_dismiss', { source: 'feed_nudge' })
            }}
            aria-label="Dismiss calendar nudge"
            className="flex-shrink-0 text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* My Teams card — shown when followed teams have matches on the active date */}
      {followedTeams?.length > 0 && (() => {
        const myLive = activeLiveMatches.filter(m => followedTeams.includes(m.teamA) || followedTeams.includes(m.teamB))
        const myUpcoming = activeUpcomingMatches.filter(m => followedTeams.includes(m.teamA) || followedTeams.includes(m.teamB))
        const myCompleted = activeCompletedSeries.filter(s => followedTeams.includes(s.games?.[0]?.radiantTeam) || followedTeams.includes(s.games?.[0]?.direTeam))
        if (myLive.length + myUpcoming.length + myCompleted.length === 0) return null
        return (
          <div className="border border-amber-400/40 dark:border-amber-600/30 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950">
            {/* My Teams header */}
            <div className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-800/30">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="flex-1 text-xs font-bold uppercase tracking-[4px] text-amber-600 dark:text-amber-500">My Teams</span>
              {onManageTeams && (
                <button
                  type="button"
                  onClick={onManageTeams}
                  className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/70 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                  Manage
                </button>
              )}
            </div>
            {/* My Teams match rows */}
            <div role="rowgroup">
              {myLive.map(m => (
                <LiveMatchRow key={m.id} match={m} onSelectMatchId={onSelectMatchId} spoilerFree={spoilerFree} isFollowedMatch />
              ))}
              {myUpcoming.map(m => (
                <UpcomingMatchRow key={m.id} match={m} isFollowedMatch spoilerFree={spoilerFree} />
              ))}
              {myCompleted.map(s => (
                <CompactSeriesRow
                  key={s.id}
                  series={s}
                  onSelectGame={onSelectMatch}
                  onSelectSeries={onSelectSeries}
                  spoilerFree={spoilerFree}
                  followedTeams={followedTeams}
                  onToggleFollow={onToggleFollow}
                  isGrandFinal={s.games.some(g => grandFinalMatchIds.has(g.id))}
                  isFollowedMatch
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Tournament cards */}
      {tournamentCards.length === 0 ? (
        <div className="border border-gray-200 dark:border-gray-800 rounded py-10 text-center bg-white dark:bg-gray-950">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
            No matches
          </p>
        </div>
      ) : (
        tournamentCards.map(card => {
          const isHubExpanded = expandedTournamentName === card.tournament
          const hubId = findTournamentId(card.tournament, tournamentIdMap)
          const rowCount = card.liveMatches.length + card.upcomingMatches.length + card.completedSeries.length

          function toggleHub() {
            if (hubId) {
              trackEvent('tournament_hub_expand', { tournament: card.tournament, expanded: !isHubExpanded })
              setExpandedTournamentName(isHubExpanded ? null : card.tournament)
            } else {
              trackEvent('tournament_header_click', { tournament: card.tournament })
              window.location.href = '/tournaments'
            }
          }

          return (
            <div
              key={card.tournament}
              className="border border-gray-200 dark:border-gray-800 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950 last:mb-0"
            >
              {/* Tournament header — full row is clickable to expand hub */}
              <button
                type="button"
                onClick={toggleHub}
                aria-expanded={isHubExpanded}
                aria-label={isHubExpanded ? `Collapse ${card.tournament} details` : `Expand ${card.tournament} details`}
                className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 text-left"
              >
                {/* Org + tournament name */}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  {card.org && (
                    <span className="text-[10px] font-bold uppercase tracking-[4px] text-red-500">
                      {card.org}
                    </span>
                  )}
                  <span className="font-display font-bold text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate">
                    {card.tournament}
                  </span>
                </div>

                {card.hasLive && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
                  </div>
                )}

                <span className="text-xs tabular-nums text-gray-400 dark:text-gray-600 flex-shrink-0">
                  {rowCount}
                </span>

                <ChevronIcon rotated={isHubExpanded} />
              </button>

              {/* Inline TournamentHub — above match rows */}
              {isHubExpanded && hubId && (
                <div className="border-b border-gray-200 dark:border-gray-800">
                  <TournamentHub
                    key={hubId}
                    tournamentId={hubId}
                    spoilerFree={spoilerFree}
                    hideStatusLabel
                  />
                </div>
              )}

              {/* Match rows */}
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
                    isFollowedMatch={!!(followedTeams?.includes(m.teamA) || followedTeams?.includes(m.teamB))}
                    spoilerFree={spoilerFree}
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
            </div>
          )
        })
      )}
    </div>
  )
}

export default HomeFeed

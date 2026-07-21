import { useState, useMemo, useEffect, useRef } from 'react'
import { groupIntoSeries, isSeriesComplete, getLeagueLabel, trackEvent, buildTournamentCards, normalizeTournamentKey, tournamentStageLabel, formatMatchTime, isTeamFollowed } from '../utils'
import DateStrip from './DateStrip'
import CompactSeriesRow from './CompactSeriesRow'
import LiveMatchRow from './LiveMatchRow'
import UpcomingMatchRow from './UpcomingMatchRow'
import TournamentHub from './TournamentHub'
import EditorialCard from './EditorialCard'

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

// Match feed tournament name to a PandaScore tournament ID.
// Uses normalizeTournamentKey so Roman numerals (VII) and shorthand (S7) resolve to
// the same canonical form ("season 7"), then checks if any map key starts with the
// normalized feed name. Falls back to the original word-subset approach for edge cases.
function findTournamentId(name, idMap) {
  if (!idMap || !name) return null
  if (idMap.has(name)) return idMap.get(name)
  const normalizedFeed = normalizeTournamentKey(name)
  for (const [k, v] of idMap) {
    const nk = normalizeTournamentKey(k)
    if (nk === normalizedFeed || nk.startsWith(normalizedFeed + ' ')) return v
  }
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

// DOM id of the feed's load-error message. The search form (SearchBar, rendered in App's search
// overlay) points its aria-describedby at this id while the error is up, so a screen-reader user
// who opens search over a failed feed hears WHY searching will come back empty — the error text
// itself is visually behind the overlay. role="alert" only announces the error once, at the moment
// it appears; aria-describedby is what makes it re-readable from the control it affects.
// Exported so the producer of the id and its only consumer can't drift apart.
export const FEED_ERROR_ID = 'feed-load-error'

function HomeFeed({
  liveMatches = [],
  upcomingMatches = [],
  allMatches = [],
  justEndedSeries = [],
  onSelectMatch,
  onSelectSeries,
  spoilerFree = false,
  followedTeams = [],
  onToggleFollow,
  error = null,
  onRetry,
  onSelectMatchId,
  onSelectLiveMatch,
  tournamentIdMap,
  onLoadMore,
  loadingMore,
  hasMore,
  onManageTeams,
  highlightMatchId = null,
}) {
  const todayKey = useMemo(() => new Date().toDateString(), [])
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86400000).toDateString(), [])

  const completeSeries = useMemo(
    () => groupIntoSeries(allMatches || []).filter(isSeriesComplete),
    [allMatches]
  )

  const [activeDate, setActiveDate] = useState(null)
  const [expandedTournamentName, setExpandedTournamentName] = useState(null)
  const [calNudgeDismissed, setCalNudgeDismissed] = useState(
    () => !!localStorage.getItem('spectate-cal-nudge-dismissed')
  )
  const [followCardDismissed, setFollowCardDismissed] = useState(
    () => !!localStorage.getItem('spectate-follow-card-dismissed')
  )

  // Build chronological date list: past days → today → tomorrow → future days
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

    dates.push({ key: todayKey, label: 'Today' })

    const hasTomorrow = upcomingMatches.some(m => new Date(m.scheduledAt).toDateString() === tomorrowKey)
    if (hasTomorrow) {
      dates.push({ key: tomorrowKey, label: 'Tomorrow' })
    }

    // Collect any future dates beyond tomorrow from upcoming matches
    const futureDayMap = {}
    for (const m of upcomingMatches) {
      const d = new Date(m.scheduledAt)
      const key = d.toDateString()
      if (key !== todayKey && key !== tomorrowKey) {
        const ts = Math.floor(d.getTime() / 1000)
        if (!futureDayMap[key] || ts < futureDayMap[key]) futureDayMap[key] = ts
      }
    }
    const futureKeys = Object.keys(futureDayMap)
      .filter(k => new Date(k) > new Date(tomorrowKey))
      .sort((a, b) => new Date(a) - new Date(b))
    for (const k of futureKeys) {
      dates.push({ key: k, label: getDateLabel(futureDayMap[k]) })
    }

    return dates
  }, [completeSeries, liveMatches, upcomingMatches, todayKey, tomorrowKey])

  // Smart default: today (if it has data) → first future date → most recent past date
  const defaultDateKey = useMemo(() => {
    const todayHasData = liveMatches.length > 0
      || upcomingMatches.some(m => new Date(m.scheduledAt).toDateString() === todayKey)
      || completeSeries.some(s => getDayKey(s.startTime) === todayKey)
    if (todayHasData) return todayKey

    const todayIdx = availableDates.findIndex(d => d.key === todayKey)
    const futureDate = availableDates[todayIdx + 1]
    if (futureDate) return futureDate.key

    if (todayIdx > 0) return availableDates[todayIdx - 1].key
    return todayKey
  }, [availableDates, liveMatches, upcomingMatches, completeSeries, todayKey])

  const resolvedDate = activeDate ?? defaultDateKey

  // Windowed date strip: show only 1 previous date + selected + all future dates.
  // New data from background fetches only surfaces one pill at a time as the user navigates back.
  const visibleDates = useMemo(() => {
    const selectedIdx = availableDates.findIndex(d => d.key === resolvedDate)
    if (selectedIdx <= 0) return availableDates
    return availableDates.slice(selectedIdx - 1)
  }, [availableDates, resolvedDate])

  // Auto-fetch guarantee: if selected date is the leftmost available, keep loading until a previous date exists.
  useEffect(() => {
    if (!resolvedDate || !hasMore || loadingMore || !onLoadMore) return
    const selectedIdx = availableDates.findIndex(d => d.key === resolvedDate)
    if (selectedIdx === 0) onLoadMore()
  }, [availableDates, resolvedDate, hasMore, loadingMore, onLoadMore])

  const isToday = resolvedDate === todayKey

  // Horizontal swipe → change day, mirroring a tap on the adjacent date pill.
  // Matches the calendar-app convention (iOS/Google Calendar, Sofascore): drag
  // left→right (swipe right) goes to the PREVIOUS day (Yesterday); drag right→left
  // (swipe left) goes to the NEXT day (Tomorrow). availableDates is chronological
  // ascending, so previous = index-1, next = index+1.
  const swipeStartRef = useRef(null)

  function goToAdjacentDate(step) {
    const idx = availableDates.findIndex(d => d.key === resolvedDate)
    if (idx === -1) return
    const target = availableDates[idx + step]
    if (target) {
      trackEvent('date_swipe', { direction: step < 0 ? 'prev' : 'next', date: target.label })
      setActiveDate(target.key)
      setExpandedTournamentName(null)
    } else if (step < 0 && hasMore && !loadingMore && onLoadMore) {
      // At the earliest loaded day and no previous pill yet — fetch earlier data
      // so a Yesterday becomes reachable on the next swipe.
      trackEvent('date_swipe_load_more', {})
      onLoadMore()
    }
  }

  function handleTouchStart(e) {
    const t = e.touches[0]
    // Ignore gestures that begin inside a horizontal scroller (date strip, stage
    // tabs, standings/bracket tables) — those own the horizontal axis.
    if (e.target.closest?.('.overflow-x-auto')) {
      swipeStartRef.current = null
      return
    }
    swipeStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e) {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 55) return                 // too short to be a deliberate swipe
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return // predominantly vertical — let the page scroll
    goToAdjacentDate(dx < 0 ? 1 : -1)             // drag right→left → next; drag left→right → prev (yesterday)
  }

  const activeLiveMatches = isToday ? liveMatches : []

  const activeUpcomingMatches = useMemo(
    () => upcomingMatches.filter(m => new Date(m.scheduledAt).toDateString() === resolvedDate),
    [upcomingMatches, resolvedDate]
  )

  const activeCompletedSeries = useMemo(
    () => completeSeries.filter(s => getDayKey(s.startTime) === resolvedDate),
    [completeSeries, resolvedDate]
  )

  const activeJustEndedByTournament = useMemo(() => {
    if (!isToday) return {}
    const map = {}
    for (const s of justEndedSeries) {
      const key = normalizeTournamentKey(s.tournament)
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [justEndedSeries, isToday])

  // Build tournament cards sorted: live → upcoming → followed-team → completed
  const tournamentCards = useMemo(
    () => buildTournamentCards(activeLiveMatches, activeUpcomingMatches, activeCompletedSeries, followedTeams),
    [activeLiveMatches, activeUpcomingMatches, activeCompletedSeries, followedTeams]
  )

  if (error) {
    return (
      <div
        className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded"
        role="alert"
      >
        <span id={FEED_ERROR_ID} className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
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

  return (
    <div className="w-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Date nav */}
      <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-950 overflow-hidden mb-3">
        <DateStrip
          dates={visibleDates}
          activeDate={resolvedDate}
          onChange={key => {
            setActiveDate(key)
            setExpandedTournamentName(null)
          }}
          onLoadEarlier={null}
          loadingEarlier={loadingMore}
        />
      </div>

      {/* Editorial story card — shown on today and upcoming match days */}
      {(isToday || activeUpcomingMatches.length > 0) && <EditorialCard />}

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

      {/* Follow prompt — the only entry point to Manage Teams for a 0-team user.
          Without it the modal is unreachable until a followed team happens to play. */}
      {followedTeams?.length === 0 && !followCardDismissed && onManageTeams && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">Follow your teams</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 leading-snug">Personalized feed, match alerts, calendar</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => { trackEvent('manage_teams_open', { source: 'follow_callout' }); onManageTeams() }}
              className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap transition-colors"
            >
              Choose teams
            </button>
            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem('spectate-follow-card-dismissed', '1') } catch {}
                setFollowCardDismissed(true)
                trackEvent('follow_card_dismissed')
              }}
              aria-label="Dismiss"
              className="text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 p-1 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* My Teams card — persists for followers even with no matches on the active date,
          showing the next scheduled followed-team match so the feature never vanishes */}
      {followedTeams?.length > 0 && (() => {
        const myLive = activeLiveMatches.filter(m => isTeamFollowed(followedTeams, m.teamA, m.teamB))
        const myUpcoming = activeUpcomingMatches.filter(m => isTeamFollowed(followedTeams, m.teamA, m.teamB))
        const myCompleted = activeCompletedSeries.filter(s => isTeamFollowed(followedTeams, s.games?.[0]?.radiantTeam, s.games?.[0]?.direTeam))
        if (myLive.length + myUpcoming.length + myCompleted.length === 0) {
          // upcomingMatches spans the next 72h across all dates (unfiltered by activeDate)
          const next = upcomingMatches
            .filter(m => isTeamFollowed(followedTeams, m.teamA, m.teamB))
            .sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0))[0]
          return (
            <div className="border border-amber-400/60 dark:border-amber-500/40 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950">
              <div className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-amber-50/80 dark:bg-amber-400/10 border-b border-amber-200 dark:border-amber-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="flex-1 text-xs font-bold uppercase tracking-[4px] text-amber-600 dark:text-amber-500">My Teams</span>
                {onManageTeams && (
                  <button
                    type="button"
                    onClick={() => { trackEvent('manage_teams_open', { source: 'my_teams_card' }); onManageTeams() }}
                    className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/70 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                  >
                    Manage
                  </button>
                )}
              </div>
              <div className="px-4 py-3">
                {next ? (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 leading-tight">Next match</p>
                    <p className="font-display text-sm font-black tracking-wide uppercase text-gray-900 dark:text-white truncate leading-tight mt-1">
                      {next.teamA}
                      <span className="font-normal text-gray-400 dark:text-gray-600 text-xs mx-1.5">vs</span>
                      {next.teamB}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-blue-500 dark:text-blue-400 mt-0.5 leading-tight">
                      {formatMatchTime(next.scheduledAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                    No matches in the next 3 days
                  </p>
                )}
              </div>
            </div>
          )
        }
        return (
          <div className="border border-amber-400/60 dark:border-amber-500/40 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950">
            {/* My Teams header */}
            <div className="flex items-center gap-2 px-3 py-2 min-h-[44px] bg-amber-50/80 dark:bg-amber-400/10 border-b border-amber-200 dark:border-amber-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="flex-1 text-xs font-bold uppercase tracking-[4px] text-amber-600 dark:text-amber-500">My Teams</span>
              {onManageTeams && (
                <button
                  type="button"
                  onClick={() => { trackEvent('manage_teams_open', { source: 'my_teams_card' }); onManageTeams() }}
                  className="text-[10px] font-semibold uppercase tracking-widest text-amber-600/70 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                  Manage
                </button>
              )}
            </div>
            {/* My Teams match rows */}
            <div role="rowgroup">
              {/* isHighlighted only here (not the tournament-card copies of these rows):
                  push targets are always followed teams, so the My Teams card is the
                  canonical landing — one scroll target, no double-pulse. */}
              {myLive.map(m => (
                <LiveMatchRow key={m.id} match={m} onSelectMatchId={onSelectMatchId} onSelectLiveMatch={onSelectLiveMatch} spoilerFree={spoilerFree} isFollowedMatch isHighlighted={String(m.id) === highlightMatchId} />
              ))}
              {myUpcoming.map(m => (
                <UpcomingMatchRow key={m.id} match={m} isFollowedMatch spoilerFree={spoilerFree} isHighlighted={String(m.id) === highlightMatchId} />
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
                  isGrandFinal={s.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))}
                  bracketRound={s.games[0]?.bracketRound}
                  isFollowedMatch
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Tournament cards */}
      {(() => {
        if (tournamentCards.length === 0) {
          return (
            <div className="border border-gray-200 dark:border-gray-800 rounded py-10 text-center bg-white dark:bg-gray-950">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                No matches
              </p>
            </div>
          )
        }

        function renderCard(card) {
          const isHubExpanded = expandedTournamentName === card.tournament
          const hubId = findTournamentId(card.tournament, tournamentIdMap)
          const justEnded = activeJustEndedByTournament[normalizeTournamentKey(card.tournament)] || []
          const rowCount = card.liveMatches.length + card.upcomingMatches.length + card.completedSeries.length + justEnded.length

          function toggleHub() {
            if (hubId) {
              trackEvent('tournament_hub_expand', { tournament: card.tournament, expanded: !isHubExpanded })
              setExpandedTournamentName(isHubExpanded ? null : card.tournament)
            } else {
              trackEvent('tournament_header_click', { tournament: card.tournament })
            }
          }

          return (
            <div
              key={card.tournament}
              className="border border-gray-200 dark:border-gray-800 rounded mb-3 overflow-hidden bg-white dark:bg-gray-950 last:mb-0"
            >
              <button
                type="button"
                onClick={toggleHub}
                aria-expanded={isHubExpanded}
                aria-label={isHubExpanded ? `Collapse ${card.tournament} details` : `Expand ${card.tournament} details`}
                className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 text-left"
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  {card.org && (
                    <span className="text-[10px] font-bold uppercase tracking-[4px] text-red-500">
                      {card.org}
                    </span>
                  )}
                  <span className="font-display font-bold text-sm uppercase tracking-wide text-gray-900 dark:text-white line-clamp-2 leading-snug">
                    {tournamentStageLabel(card.tournament, card.org)}
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

              <div role="rowgroup">
                {card.liveMatches.length > 0 && (card.upcomingMatches.length > 0 || card.completedSeries.length > 0 || justEnded.length > 0) && (
                  <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live</span>
                  </div>
                )}
                {card.liveMatches.map(m => (
                  <LiveMatchRow
                    key={m.id}
                    match={m}
                    onSelectMatchId={onSelectMatchId}
                    onSelectLiveMatch={onSelectLiveMatch}
                    spoilerFree={spoilerFree}
                    isFollowedMatch={isTeamFollowed(followedTeams, m.teamA, m.teamB)}
                  />
                ))}
                {justEnded.length > 0 && (
                  <>
                    {(card.liveMatches.length > 0 || card.upcomingMatches.length > 0 || card.completedSeries.length > 0) && (
                      <div className="px-3 py-1 border-t border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">Just Ended</span>
                      </div>
                    )}
                    {justEnded.map(s => {
                      const allTemp = s.games.every(g => g._tempId)
                      return (
                        <CompactSeriesRow
                          key={s.id}
                          series={s}
                          onSelectGame={allTemp ? null : onSelectMatch}
                          onSelectSeries={allTemp ? null : onSelectSeries}
                          spoilerFree={spoilerFree}
                          followedTeams={followedTeams}
                          onToggleFollow={onToggleFollow}
                          isGrandFinal={s.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))}
                          bracketRound={s.games[0]?.bracketRound}
                          isFollowedMatch={isTeamFollowed(followedTeams, s.games[0]?.radiantTeam, s.games[0]?.direTeam)}
                        />
                      )
                    })}
                  </>
                )}
                {card.upcomingMatches.length > 0 && (card.liveMatches.length > 0 || card.completedSeries.length > 0 || justEnded.length > 0) && (
                  <div className="px-3 py-1 border-t border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 dark:text-blue-500">Upcoming</span>
                  </div>
                )}
                {card.upcomingMatches.map(m => (
                  <UpcomingMatchRow
                    key={m.id}
                    match={m}
                    isFollowedMatch={isTeamFollowed(followedTeams, m.teamA, m.teamB)}
                    spoilerFree={spoilerFree}
                  />
                ))}
                {card.completedSeries.length > 0 && (card.liveMatches.length > 0 || card.upcomingMatches.length > 0 || justEnded.length > 0) && (
                  <div className="px-3 py-1 border-t border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">Results</span>
                  </div>
                )}
                {card.completedSeries.map(s => {
                  const isFollowedMatch = isTeamFollowed(followedTeams, s.games[0]?.radiantTeam, s.games[0]?.direTeam)
                  return (
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
                      isFollowedMatch={isFollowedMatch}
                    />
                  )
                })}
              </div>
            </div>
          )
        }

        const existingTournaments = new Set(tournamentCards.map(c => normalizeTournamentKey(c.tournament)))
        const standaloneJustEnded = Object.keys(activeJustEndedByTournament)
          .filter(tn => !existingTournaments.has(tn))
          .map(tn => ({
            tournament: tn,
            org: null,
            hasLive: false,
            liveMatches: [],
            upcomingMatches: [],
            completedSeries: [],
          }))

        return [
          ...tournamentCards.map(renderCard),
          ...standaloneJustEnded.map(renderCard),
        ]
      })()}
    </div>
  )
}

export default HomeFeed

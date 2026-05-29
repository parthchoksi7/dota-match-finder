import { useState, useEffect, useRef } from "react"
import { HorizontalBracket, BracketFlatView, formatScheduledTime } from './BracketView'
import { trackEvent, toTitleCase, getLeagueLabel, buildTournamentName, getTournamentFormatKey, getStageFormatConfig, getAdvancementType } from '../utils'
import CalendarSubscribeModal from './CalendarSubscribeModal'
import HighlightsTab from './HighlightsTab'
import { fetchTournamentPlayers, fetchHeroes } from '../api'

const ALL_TOURNAMENTS_URL = 'https://spectateesports.live/api/tournaments?mode=calendar-all'

const FORMAT_DESCRIPTIONS = {
  'Swiss': {
    short: 'Swiss',
    desc: 'Each team plays a set number of rounds. After each round, teams with similar records are matched against each other. No team is eliminated early — everyone plays all rounds, and final standings determine who advances.',
  },
  'Double Elimination': {
    short: 'Double Elimination',
    desc: 'Two brackets: Upper and Lower. Losing in the Upper Bracket drops you to the Lower Bracket. A second loss anywhere eliminates you. The Lower Bracket winner faces the Upper Bracket winner in the Grand Final.',
  },
  'Single Elimination': {
    short: 'Single Elimination',
    desc: 'Straightforward knockout format. One loss and you\'re out. Faster, but less forgiving — a bad day ends your run.',
  },
  'Group Stage': {
    short: 'Group Stage',
    desc: 'Teams are divided into groups and play matches within their group. Top teams from each group advance to the next stage.',
  },
  'Bracket': {
    short: 'Bracket',
    desc: 'A bracket-style elimination format where teams play head-to-head matches, with losers being eliminated.',
  },
}

function FormatTooltip({ format }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const tooltipRef = useRef(null)
  const info = FORMAT_DESCRIPTIONS[format]
  if (!info) return null

  function open(e) {
    e.stopPropagation()
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
  }

  useEffect(() => {
    if (!pos) return
    function handler(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target)
      ) setPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pos])

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        aria-label={`What is ${format}?`}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-600 hover:border-gray-600 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors leading-none font-bold"
        style={{ fontSize: '9px' }}
      >
        i
      </button>
      {pos && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-xl p-3"
          style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - 272) }}
        >
          <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{info.short}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{info.desc}</p>
        </div>
      )}
    </span>
  )
}

function cleanTournamentName(name) {
  return toTitleCase(
    name
      .replace(/\s*—\s*.+$/, '')
      .replace(/\s+\d{4}$/, '')
      .trim()
  )
}


function extractRegion(name) {
  const n = name.toLowerCase()
  if (n.includes('western europe')) return 'WEU'
  if (n.includes('eastern europe')) return 'EEU'
  if (n.includes('southeast asia')) return 'SEA'
  if (n.includes('north america')) return 'NA'
  if (n.includes('south america')) return 'SA'
  if (n.includes('china')) return 'CN'
  if (n.includes('europe')) return 'EU'
  if (n.includes('asia')) return 'Asia'
  return null
}

function getTabLabel(tournament, allOngoing) {
  const leagueLabel = getLeagueLabel(tournament.name)
  const region = extractRegion(tournament.name)
  const allSameLeague = allOngoing.every(t => getLeagueLabel(t.name) === leagueLabel)

  if (allSameLeague) {
    return region || leagueLabel || cleanTournamentName(tournament.name).split(' ').slice(0, 2).join(' ')
  }
  if (leagueLabel && region) return `${leagueLabel} ${region}`
  return leagueLabel || region || cleanTournamentName(tournament.name).split(' ').slice(0, 2).join(' ')
}

function StandingsTable({ standings, advancement }) {
  if (!standings || standings.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No standings yet
    </p>
  )

  const midpoint = Math.ceil(standings.length / 2)
  const showZones = standings.length >= 4

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="text-left py-2 px-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold w-8">#</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold">Team</th>
            <th className="text-center py-2 px-2 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold w-10">W</th>
            <th className="text-center py-2 px-2 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold w-10">L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
          {standings.map((s, i) => {
            const rank = s.rank ?? i + 1
            const advType = getAdvancementType(advancement, rank)
            const isEliminated = advType
              ? advType === 'out'
              : (showZones && i >= midpoint && s.losses > s.wins)
            const barColor = advType === 'up' ? 'bg-green-500/60'
              : advType === 'conditional' ? 'bg-amber-500/60'
              : advType === 'out' ? 'bg-red-500/60'
              : isEliminated ? 'bg-red-500/60' : 'bg-green-500/60'
            return (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <td className="py-2.5 px-3 tabular-nums text-gray-500 dark:text-gray-600 text-xs">{rank}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {showZones && (
                      <span className={`w-1 h-4 rounded-full flex-shrink-0 ${barColor}`} />
                    )}
                    <span className={`font-semibold ${isEliminated ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                      {s.team}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-2 text-center tabular-nums font-bold text-green-600 dark:text-green-400">{s.wins}</td>
                <td className="py-2.5 px-2 text-center tabular-nums font-bold text-red-500 dark:text-red-400">{s.losses}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Overview match row (lightweight, no round headers) ─────────────────────

function OverviewMatchRow({ match }) {
  const isLive = match.status === 'running'
  const isDone = match.status === 'finished'
  const scoreA = match.scoreA ?? null
  const scoreB = match.scoreB ?? null
  const hasScore = scoreA !== null && scoreB !== null
  const isTbd = match.teamA === 'TBD' && match.teamB === 'TBD'
  const dimA = isDone && hasScore && scoreA < scoreB
  const dimB = isDone && hasScore && scoreB < scoreA

  return (
    <div className="flex items-center gap-2 text-sm">
      {isLive
        ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        : <span className="w-1.5 h-1.5 flex-shrink-0" />
      }
      <span className={`flex-1 text-right truncate font-semibold ${
        isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
        dimA ? 'text-gray-400 dark:text-gray-600' :
        'text-gray-900 dark:text-white'
      }`}>{match.teamA}</span>
      <div className="w-16 flex-shrink-0 text-center">
        {hasScore ? (
          <span className="font-black tabular-nums text-gray-900 dark:text-white">
            <span className={dimA ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreA}</span>
            <span className="text-gray-300 dark:text-gray-700 font-light mx-1">–</span>
            <span className={dimB ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreB}</span>
          </span>
        ) : match.scheduledAt ? (
          <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
            {formatScheduledTime(match.scheduledAt)}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">vs</span>
        )}
      </div>
      <span className={`flex-1 truncate font-semibold ${
        isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
        dimB ? 'text-gray-400 dark:text-gray-600' :
        'text-gray-900 dark:text-white'
      }`}>{match.teamB}</span>
    </div>
  )
}


const TABS = ['Stage', 'Highlights', 'Stats']
const PLAYOFF_FORMATS = new Set(['Double Elimination', 'Single Elimination', 'Bracket'])

// Extract the short stage label, e.g. "DreamLeague S25 — Playoffs" → "Playoffs"
function stageShortName(name) {
  const m = (name || '').match(/[—–]\s*(.+)$/)
  return m ? m[1].trim() : name
}

// Derive the champion from the Grand Final bracket match when PandaScore's
// winner field hasn't been populated yet (can lag by hours after a tournament ends).
function deriveChampionFromBracket(bracket) {
  if (!bracket?.length) return null
  const finishedRounds = bracket.filter(r => r.matches.some(m => m.status === 'finished'))
  if (!finishedRounds.length) return null
  const lastRound = finishedRounds[finishedRounds.length - 1]
  const grandFinal = lastRound.matches.find(m => m.status === 'finished')
  if (!grandFinal) return null
  const { teamA, teamB, scoreA, scoreB } = grandFinal
  if (!teamA || !teamB || scoreA == null || scoreB == null || scoreA === scoreB) return null
  return scoreA > scoreB ? teamA : teamB
}

function TournamentHub({ spoilerFree, tournamentId, onClose, hideStatusLabel, onSelectMatchId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Stage')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // Stage switching: each stage in the same event has its own detail
  const [stageCache, setStageCache] = useState({})   // { [stageId]: detail }
  const [activeStageId, setActiveStageId] = useState(null)
  const [stageLoading, setStageLoading] = useState(false)
  const [selectedOngoingId, setSelectedOngoingId] = useState(null)
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const [calendarModalUrl, setCalendarModalUrl] = useState(null)
  const [calendarModalLabel, setCalendarModalLabel] = useState(null)

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(json => setData(json))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ongoing = data?.ongoing || []
  const upcoming = data?.upcoming || []
  const completed = data?.completed || []
  const allTournaments = [...ongoing, ...upcoming, ...completed]
  const activeTournamentId = selectedOngoingId || ongoing[0]?.id
  const tournament = tournamentId
    ? (allTournaments.find(t => t.id === tournamentId) || null)
    : (ongoing.find(t => t.id === activeTournamentId) || upcoming[0] || completed[0] || null)
  const isOngoing = tournament ? ongoing.some(t => t.id === tournament.id) : false
  const isCompleted = tournament ? (!isOngoing && !upcoming.some(t => t.id === tournament.id)) : false

  // Fetch detail for the main tournament (also seeds the stage cache)
  useEffect(() => {
    if (!tournament) return
    if (detail?.tournamentId === tournament.id) return
    setDetailLoading(true)
    fetch(`/api/tournament-detail?id=${tournament.id}`)
      .then(r => r.json())
      .then(d => {
        const enriched = { ...d, tournamentId: tournament.id }
        setDetail(enriched)
        setStageCache(prev => ({ ...prev, [tournament.id]: enriched }))
      })
      .catch(() => setDetail({ standings: [], bracket: [], tournamentId: tournament.id }))
      .finally(() => setDetailLoading(false))
  }, [tournament?.id])

  // When eventStages load, auto-select the active stage (running → first upcoming → latest finished)
  useEffect(() => {
    if (!detail?.eventStages?.length || activeStageId !== null) return
    const stages = detail.eventStages
    const running = stages.find(s => s.status === 'running')
    const firstUpcoming = stages.find(s => s.status === 'upcoming')
    const def = running || firstUpcoming || stages[stages.length - 1]
    setActiveStageId(def?.id ?? null)
  }, [detail?.eventStages])

  // Fetch a stage's detail on demand when it's not yet cached
  useEffect(() => {
    if (!activeStageId || stageCache[activeStageId]) return
    setStageLoading(true)
    fetch(`/api/tournament-detail?id=${activeStageId}`)
      .then(r => r.json())
      .then(d => setStageCache(prev => ({ ...prev, [activeStageId]: { ...d, tournamentId: activeStageId } })))
      .catch(() => setStageCache(prev => ({ ...prev, [activeStageId]: { standings: [], bracket: [], tournamentId: activeStageId } })))
      .finally(() => setStageLoading(false))
  }, [activeStageId])


  // Stats tab — sub-toggle ('heroes' | 'players') + hero pick/ban stats + player leaderboard
  const [statsView, setStatsView] = useState('heroes')
  const [heroStats, setHeroStats] = useState(null)
  const [heroStatsLoading, setHeroStatsLoading] = useState(false)
  const [showAllHeroes, setShowAllHeroes] = useState(false)
  const [playerStats, setPlayerStats] = useState(null)
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false)
  const [activeStat, setActiveStat] = useState('kills')
  const [heroMap, setHeroMap] = useState(null)

  useEffect(() => {
    if (activeTab !== 'Stats' || !tournament) return
    if (heroStats?.fetchedForId === tournament.id) return
    setHeroStatsLoading(true)
    const serieName = encodeURIComponent(buildTournamentName(tournament.league || '', tournament.serie || ''))
    const beginAt = tournament.startdate ? `&begin_at=${encodeURIComponent(tournament.startdate)}` : ''
    fetch(`/api/tournament-heroes?id=${tournament.id}&name=${serieName}${beginAt}`)
      .then(r => r.json())
      .then(d => setHeroStats({ ...d, fetchedForId: tournament.id }))
      .catch(() => setHeroStats({ heroes: [], gameCount: 0, fetchedForId: tournament.id }))
      .finally(() => setHeroStatsLoading(false))
  }, [activeTab, tournament?.id])

  useEffect(() => {
    if (activeTab !== 'Stats' || statsView !== 'players' || !tournament) return
    if (playerStats?.fetchedForId === tournament.id) return
    setPlayerStatsLoading(true)
    const serieName = buildTournamentName(tournament.league || '', tournament.serie || '')
    fetchTournamentPlayers(tournament.id, serieName, false, tournament.startdate || null)
      .then(d => setPlayerStats({ ...(d || { stats: null, gameCount: 0 }), fetchedForId: tournament.id }))
      .catch(() => setPlayerStats({ stats: null, gameCount: 0, fetchedForId: tournament.id }))
      .finally(() => setPlayerStatsLoading(false))
  }, [activeTab, statsView, tournament?.id])

  useEffect(() => {
    if (activeTab !== 'Stats' || statsView !== 'players' || heroMap) return
    fetchHeroes().then(setHeroMap).catch(() => {})
  }, [activeTab, statsView])


  // The detail used for Standings + Schedule (active stage, falling back to main)
  const effectiveDetail = (activeStageId && stageCache[activeStageId]) || detail
  const isStageLoading = detailLoading || (!!activeStageId && !stageCache[activeStageId] && stageLoading)

  const isPlayoffStage = !!effectiveDetail?.format && PLAYOFF_FORMATS.has(effectiveDetail.format)

  if (loading) return (
    <section className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden animate-pulse">
      <div className="px-3 sm:px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
        <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
        <div className="h-5 w-56 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
    </section>
  )

  if (!tournament) return null

  const startDate = tournament.startdate
    ? new Date(tournament.startdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const endDate = tournament.enddate
    ? new Date(tournament.enddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : endDate || startDate || null

  // Derived data for the Overview tab
  const allBracketMatches = (effectiveDetail?.bracket || []).flatMap(r => r.matches)
  const liveMatches = allBracketMatches.filter(m => m.status === 'running')
  const upcomingMatches = allBracketMatches
    .filter(m => m.status === 'not_started' && !(m.teamA === 'TBD' && m.teamB === 'TBD'))
    .sort((a, b) => {
      if (!a.scheduledAt && !b.scheduledAt) return 0
      if (!a.scheduledAt) return 1
      if (!b.scheduledAt) return -1
      return new Date(a.scheduledAt) - new Date(b.scheduledAt)
    })
    .slice(0, 3)
  const currentRound = (() => {
    if (!effectiveDetail?.bracket?.length) return null
    const active = effectiveDetail.bracket.filter(r =>
      r.matches.some(m => m.status === 'running' || m.status === 'finished')
    )
    return active.length ? Math.max(...active.map(r => r.round)) : null
  })()

  return (
    <div className={hideStatusLabel ? 'p-3 sm:p-4' : ''}>
      {!hideStatusLabel && (
        <div className="flex items-center justify-between mb-2">
          <h2
            id="tournament-hub-heading"
            className={`text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 ${isOngoing ? "border-red-500" : isCompleted ? "border-emerald-500" : "border-blue-500"}`}
          >
            {isOngoing ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {ongoing.length > 1 ? 'Live Tournaments' : 'Live Tournament'}
                {ongoing.length > 1 && (
                  <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500">
                    {ongoing.length}
                  </span>
                )}
              </span>
            ) : isCompleted ? "Recently Completed" : null}
          </h2>
          <button
            type="button"
            onClick={() => {
              trackEvent('calendar_subscribe_modal_open', { source: 'tournament_hub_header' })
              setCalendarModalUrl(ALL_TOURNAMENTS_URL)
              setCalendarModalLabel('All Dota 2 Tournaments')
              setCalendarModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Add to Calendar
          </button>
        </div>
      )}
      {/* Chip bar — only when multiple live tournaments */}
      {ongoing.length > 1 && !tournamentId && (() => {
        const sharedLeague = (() => {
          const first = getLeagueLabel(ongoing[0]?.name)
          return first && ongoing.every(t => getLeagueLabel(t.name) === first) ? first : null
        })()
        return (
          <div className="flex items-center gap-2 mb-2">
            {sharedLeague && (
              <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {sharedLeague}
              </span>
            )}
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {ongoing.map(t => {
                const label = getTabLabel(t, ongoing)
                const isActive = (selectedOngoingId || ongoing[0]?.id) === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedOngoingId(t.id)
                      setActiveStageId(null)
                      trackEvent('tournament_hub_region_select', { label, tournament_name: t.name })
                    }}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 shadow-sm'
                        : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    <span className="inline-block w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}
      <section
      className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden bg-white dark:bg-gray-950"
      aria-labelledby="tournament-hub-heading"
      >

      {/* Tournament name */}
      <div className="px-3 sm:px-4 pt-4 pb-3 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-0 right-3 w-7 h-7 flex items-center justify-center rounded text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
        {getLeagueLabel(tournament.name) && (
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-1">
            {getLeagueLabel(tournament.name)}
          </p>
        )}
        <p className="font-display text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
          {cleanTournamentName(tournament.name)}
        </p>
        {dateRange && (
          <p className="text-xs text-gray-400 dark:text-gray-600 tabular-nums mt-0.5">{dateRange}</p>
        )}
        {isCompleted && !spoilerFree && (() => {
          const champion = tournament.winner?.name || deriveChampionFromBracket(detail?.bracket)
          return champion ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-sm">🏆</span>
              <span className="text-sm font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
                {champion}
              </span>
            </div>
          ) : null
        })()}
      </div>

      {/* Tab bar — segmented control */}
      <div className="px-2 sm:px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex w-full rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); trackEvent('tournament_tab_click', { tab }) }}
              className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-normal rounded transition-colors text-center whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Stage picker — shown when the event has multiple stages (Group Stage, Playoffs, etc.) */}
      {detail?.eventStages?.length > 1 && activeTab === 'Stage' && (
        <div className="flex items-center gap-1 px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-900">
          <span className="text-xs text-gray-400 dark:text-gray-600 mr-1 uppercase tracking-widest">Stage</span>
          {detail.eventStages.map(stage => {
            const isActive = stage.id === activeStageId
            const isCurrent = stage.status === 'running'
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {stageShortName(stage.name)}
                {isCurrent && !isActive && (
                  <span className="ml-1 inline-block w-1 h-1 rounded-full bg-red-500 align-middle" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'Stage' && (() => {
        const activeStageName = stageShortName(
          detail?.eventStages?.find(s => s.id === activeStageId)?.name || ''
        )
        const hubFormatKey = getTournamentFormatKey(getLeagueLabel(tournament.name) || '', tournament.name || '')
        const hubStageConfig = getStageFormatConfig(hubFormatKey, activeStageName)
        const advancement = hubStageConfig?.advancement ?? null

        return (
        <div>
          {!isStageLoading && hubStageConfig && (() => {
            const parts = [hubStageConfig.format, hubStageConfig.matchFormat]
            if (hubStageConfig.grandFinalFormat) parts.push(`${hubStageConfig.grandFinalFormat} GF`)
            if (hubStageConfig.teamCount) parts.push(`${hubStageConfig.teamCount} teams`)
            return (
              <div className="px-3 sm:px-4 pt-2.5 pb-2 border-b border-gray-100 dark:border-gray-900">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                  {parts.join(' · ')}
                </p>
                {hubStageConfig.advancement?.length > 0 && (
                  <ul role="list" aria-label="Advancement rules" className="flex flex-col gap-0.5">
                    {hubStageConfig.advancement.map((rule, i) => {
                      const isUp = rule.type === 'up'
                      const isOut = rule.type === 'out'
                      const arrow = isUp ? '↑' : isOut ? '✕' : '→'
                      const arrowColor = isUp
                        ? 'text-emerald-600 dark:text-emerald-500'
                        : isOut ? 'text-red-500 dark:text-red-400'
                        : 'text-amber-500 dark:text-amber-400'
                      return (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold w-3 flex-shrink-0 ${arrowColor}`}>{arrow}</span>
                          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-500 min-w-[52px]">{rule.label}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-600">{rule.dest}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })()}
          {isStageLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="py-2 px-3 w-8"><div className="h-2 w-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" /></th>
                    <th className="py-2 px-3"><div className="h-2 w-10 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" /></th>
                    <th className="py-2 px-2 w-10"><div className="h-2 w-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></th>
                    <th className="py-2 px-2 w-10"><div className="h-2 w-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                  {[42, 58, 50, 66, 38, 54].map((w, i) => (
                    <tr key={i}>
                      <td className="py-2.5 px-3"><div className="h-2 w-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" /></td>
                      <td className="py-2.5 px-3"><div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${w}%` }} /></td>
                      <td className="py-2.5 px-2"><div className="h-2.5 w-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                      <td className="py-2.5 px-2"><div className="h-2.5 w-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isPlayoffStage ? (
            <HorizontalBracket bracket={effectiveDetail?.bracket} />
          ) : (
            <>
              <StandingsTable standings={effectiveDetail?.standings} advancement={advancement} />
              {effectiveDetail?.bracket?.length > 0 && (
                <>
                  <div className="px-3 sm:px-4 pt-3 pb-1 border-t border-gray-100 dark:border-gray-900">
                    <p className="text-[10px] font-semibold uppercase tracking-[4px] text-gray-400 dark:text-gray-600">Matches</p>
                  </div>
                  <BracketFlatView bracket={effectiveDetail?.bracket} />
                </>
              )}
            </>
          )}
        </div>
        )
      })()}

      {activeTab === 'Highlights' && (
        <div className="px-3 sm:px-4 py-4">
          <HighlightsTab
            tournamentName={tournament.name}
            spoilerFree={spoilerFree}
            beginAt={tournament.startdate || null}
            endAt={tournament.enddate || null}
            limit={6}
          />
        </div>
      )}

      {activeTab === 'Stats' && (
        <div className="px-3 sm:px-4 py-4">
          {/* Sub-toggle: Heroes | Players */}
          <div className="flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5 mb-4 w-fit">
            {['heroes', 'players'].map(view => (
              <button
                key={view}
                type="button"
                onClick={() => { setStatsView(view); trackEvent('stats_view_toggle', { view }) }}
                className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors ${
                  statsView === view
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {view === 'heroes' ? 'Heroes' : 'Players'}
              </button>
            ))}
          </div>

          {/* ── Heroes view ── */}
          {statsView === 'heroes' && (
            heroStatsLoading ? (
              <div>
                <div className="h-2 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-3" />
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-6" />
                    <col />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      {[null, 28, 20, 20, 20, 20].map((w, i) => (
                        <th key={i} className="py-2 text-left">
                          {w && <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" style={{ width: w }} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                    {[70, 55, 80, 60, 45, 75, 50, 65].map((w, i) => (
                      <tr key={i}>
                        <td className="py-2"><div className="h-4 w-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" /></td>
                        <td className="py-2"><div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${w}%` }} /></td>
                        <td className="py-2"><div className="h-2 w-5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                        <td className="py-2"><div className="h-2 w-7 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                        <td className="py-2"><div className="h-2 w-5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                        <td className="py-2"><div className="h-2 w-5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mx-auto" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !heroStats?.heroes?.length ? (
              <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                No picks yet
              </p>
            ) : (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-600 mb-3 uppercase tracking-widest">
                  {heroStats.gameCount} game{heroStats.gameCount !== 1 ? 's' : ''} · sorted by picks + bans
                </p>
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-6" />
                    <col />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                    <col className="w-10" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left py-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">#</th>
                      <th className="text-left py-2 pr-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">Hero</th>
                      <th className="text-center py-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">Picks</th>
                      <th className="text-center py-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">Win%</th>
                      <th className="text-center py-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">Bans</th>
                      <th className="text-center py-2 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">P+B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllHeroes ? heroStats.heroes : heroStats.heroes.slice(0, 25)).map((hero, i) => {
                      const winPct = hero.picks > 0 ? Math.round((hero.wins / hero.picks) * 100) : null
                      const isHighWin = winPct !== null && winPct >= 60
                      const isLowWin = winPct !== null && winPct <= 40
                      return (
                        <tr key={hero.name} className="border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/40">
                          <td className="py-2 text-gray-400 dark:text-gray-600 tabular-nums">{i + 1}</td>
                          <td className="py-2 pr-2 font-semibold text-gray-900 dark:text-white truncate max-w-0">{hero.name}</td>
                          <td className="py-2 text-center tabular-nums text-gray-700 dark:text-gray-300">{hero.picks}</td>
                          <td className={`py-2 text-center tabular-nums font-semibold ${
                            isHighWin ? 'text-green-600 dark:text-green-500'
                            : isLowWin ? 'text-red-500 dark:text-red-400'
                            : 'text-gray-500 dark:text-gray-500'
                          }`}>
                            {winPct !== null ? `${winPct}%` : '-'}
                          </td>
                          <td className="py-2 text-center tabular-nums text-gray-500 dark:text-gray-500">{hero.bans}</td>
                          <td className="py-2 text-center tabular-nums font-semibold text-gray-700 dark:text-gray-300">{hero.contested}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {heroStats.heroes.length > 25 && (
                  <button
                    type="button"
                    onClick={() => { const next = !showAllHeroes; setShowAllHeroes(next); trackEvent('heroes_show_more', { expanded: next }) }}
                    className="mt-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {showAllHeroes ? 'Show less' : `Show all ${heroStats.heroes.length} heroes`}
                  </button>
                )}
              </div>
            )
          )}

          {/* ── Players view ── */}
          {statsView === 'players' && (() => {
            const STAT_CHIPS = [
              { key: 'kills',    label: 'Kills' },
              { key: 'deaths',   label: 'Deaths' },
              { key: 'assists',  label: 'Assists' },
              { key: 'netWorth', label: 'Net Worth' },
              { key: 'gpm',      label: 'GPM' },
            ]

            const formatValue = (key, val) => {
              if (key === 'netWorth') return `${(val / 1000).toFixed(1)}k`
              return val
            }

            const entries = playerStats?.stats?.[activeStat] || []
            const hasData = entries.length > 0

            return (
              <div>
                {/* Stat chip picker */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
                  {STAT_CHIPS.map(chip => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => { setActiveStat(chip.key); trackEvent('tournament_players_stat_select', { stat: chip.key, tournamentId: tournament?.id }) }}
                      className={`flex-shrink-0 px-3 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                        activeStat === chip.key
                          ? 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm text-gray-900 dark:text-white'
                          : 'border border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Loading skeleton */}
                {playerStatsLoading && (
                  <div className="flex flex-col gap-2">
                    {[85, 70, 90, 60, 75].map((w, i) => (
                      <div key={i} className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-900">
                        <div className="w-5 h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex-shrink-0" />
                        <div className="w-5 h-5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex-shrink-0" />
                        <div className="flex-1 flex flex-col gap-1">
                          <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${w}%` }} />
                          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" style={{ width: `${w - 20}%` }} />
                        </div>
                        <div className="w-8 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {!playerStatsLoading && !hasData && (
                  <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                    Stats appear once games are indexed
                  </p>
                )}

                {/* Leaderboard rows */}
                {!playerStatsLoading && hasData && (
                  <div>
                    {entries.map(entry => {
                      const heroKey = heroMap?.[entry.heroId]?.key
                      const heroIconUrl = heroKey
                        ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${heroKey}.png`
                        : null
                      const matchContext = entry.radiantName && entry.direName
                        ? `${entry.radiantName} vs ${entry.direName}`
                        : null

                      return (
                        <button
                          key={`${entry.matchId}-${entry.accountId}`}
                          type="button"
                          onClick={() => {
                            if (entry.matchId) {
                              trackEvent('tournament_players_row_click', { stat: activeStat, rank: entry.rank, playerName: entry.playerName, matchId: entry.matchId })
                              onSelectMatchId?.(entry.matchId)
                            }
                          }}
                          className="w-full flex items-center gap-2 py-2.5 border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors text-left"
                        >
                          {/* Rank */}
                          <span className="w-5 flex-shrink-0 text-xs font-bold tabular-nums text-gray-400 dark:text-gray-600 text-center">
                            {entry.rank}
                          </span>

                          {/* Hero icon */}
                          {heroIconUrl ? (
                            <img
                              src={heroIconUrl}
                              alt=""
                              className="w-5 h-5 rounded-sm flex-shrink-0 object-cover"
                              onError={e => { e.currentTarget.style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-sm flex-shrink-0 bg-gray-200 dark:bg-gray-800" />
                          )}

                          {/* Player + team + match context */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1 min-w-0">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {entry.playerName || '—'}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
                                · {entry.teamName} · {entry.gamesPlayed}g
                              </span>
                            </div>
                            {matchContext && (
                              <div className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-600 truncate mt-0.5">
                                {matchContext}
                              </div>
                            )}
                          </div>

                          {/* Stat value */}
                          <span className="flex-shrink-0 font-display font-black text-base tabular-nums text-gray-900 dark:text-white">
                            {formatValue(activeStat, entry.value)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      <div className="px-3 sm:px-4 py-3 border-t border-gray-100 dark:border-gray-900 flex justify-end">
        <a
          href="/tournaments"
          className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          onClick={() => trackEvent('tournament_hub_view_all_click', {})}
        >
          View all tournaments →
        </a>
      </div>
    </section>
    <CalendarSubscribeModal
      isOpen={calendarModalOpen}
      onClose={() => { setCalendarModalOpen(false); setCalendarModalUrl(null); setCalendarModalLabel(null) }}
      url={calendarModalUrl || ''}
      feedType="tournament"
      source="tournament_hub"
      label={calendarModalLabel}
    />
    </div>
  )
}

export default TournamentHub

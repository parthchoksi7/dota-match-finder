import { useState, useEffect, useRef } from "react"
import { track } from '@vercel/analytics'
import { HorizontalBracket, BracketFlatView, formatScheduledTime } from './BracketView'

function logEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

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
  return name
    .replace(/\s*—\s*.+$/, '')
    .replace(/\s+\d{4}$/, '')
    .trim()
}

function getLeagueLabel(name) {
  if (/dreamleague/i.test(name)) return 'DreamLeague'
  if (/\besl\b/i.test(name)) return 'ESL'
  if (/\bpgl\b/i.test(name)) return 'PGL'
  if (/blast/i.test(name)) return 'BLAST'
  if (/weplay/i.test(name)) return 'WePlay'
  if (/riyadh/i.test(name)) return 'Riyadh Masters'
  if (/the international/i.test(name)) return 'The International'
  if (/beyond the summit|bts/i.test(name)) return 'Beyond The Summit'
  return null
}

function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No standings yet.
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
              const isEliminated = showZones && i >= midpoint && s.losses > s.wins
            return (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <td className="py-2.5 px-3 tabular-nums text-gray-500 dark:text-gray-600 text-xs">{s.rank}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {showZones && (
                      <span className={`w-1 h-4 rounded-full flex-shrink-0 ${isEliminated ? 'bg-red-500/60' : 'bg-green-500/60'}`} />
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


const TABS = ['Overview', 'Standings', 'Schedule', 'Heroes']
const PLAYOFF_FORMATS = new Set(['Double Elimination', 'Single Elimination', 'Bracket'])

// Extract the short stage label, e.g. "DreamLeague S25 — Playoffs" → "Playoffs"
function stageShortName(name) {
  const m = (name || '').match(/[—–]\s*(.+)$/)
  return m ? m[1].trim() : name
}

function TournamentHub() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Overview')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTournamentIdx, setActiveTournamentIdx] = useState(0)

  // Stage switching: each stage in the same event has its own detail
  const [stageCache, setStageCache] = useState({})   // { [stageId]: detail }
  const [activeStageId, setActiveStageId] = useState(null)
  const [stageLoading, setStageLoading] = useState(false)

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then(json => setData(json))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ongoing = data?.ongoing || []
  const upcoming = data?.upcoming || []
  const tournament = ongoing[activeTournamentIdx] || ongoing[0] || upcoming[0] || null
  const isOngoing = ongoing.length > 0

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

  // When eventStages load, auto-select the active stage (running → latest finished)
  useEffect(() => {
    if (!detail?.eventStages?.length || activeStageId !== null) return
    const stages = detail.eventStages
    const running = stages.find(s => s.status === 'running')
    const def = running || stages[stages.length - 1]
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


  // Hero pick/ban stats (via OpenDota)
  const [heroStats, setHeroStats] = useState(null)
  const [heroStatsLoading, setHeroStatsLoading] = useState(false)
  const [showAllHeroes, setShowAllHeroes] = useState(false)

  useEffect(() => {
    if (activeTab !== 'Heroes' || !tournament) return
    if (heroStats?.fetchedForId === tournament.id) return
    setHeroStatsLoading(true)
    const serieName = encodeURIComponent(tournament.serie || tournament.league || '')
    fetch(`/api/tournament-heroes?id=${tournament.id}&name=${serieName}`)
      .then(r => r.json())
      .then(d => setHeroStats({ ...d, fetchedForId: tournament.id }))
      .catch(() => setHeroStats({ heroes: [], gameCount: 0, fetchedForId: tournament.id }))
      .finally(() => setHeroStatsLoading(false))
  }, [activeTab, tournament?.id])

  // Reset everything when switching between concurrent tournaments
  function switchTournament(idx) {
    setActiveTournamentIdx(idx)
    setActiveTab('Overview')
    setDetail(null)
    setStageCache({})
    setActiveStageId(null)
    setHeroStats(null)
    setShowAllHeroes(false)
  }

  // The detail used for Standings + Schedule (active stage, falling back to main)
  const effectiveDetail = (activeStageId && stageCache[activeStageId]) || detail
  const isStageLoading = detailLoading || (!!activeStageId && !stageCache[activeStageId] && stageLoading)

  const isPlayoffStage = !!effectiveDetail?.format && PLAYOFF_FORMATS.has(effectiveDetail.format)

  if (loading) return (
    <section className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden animate-pulse">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60">
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
    <div>
      <div className="flex items-center mb-2">
        <h2
          id="tournament-hub-heading"
          className={`text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 ${isOngoing ? "border-red-500" : "border-blue-500"}`}
        >
          {isOngoing ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live Tournament
            </span>
          ) : "Upcoming Tournament"}
        </h2>
      </div>
      <section
      className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden"
      aria-labelledby="tournament-hub-heading"
      >

      {/* Tournament switcher (if multiple ongoing stages) */}
      {ongoing.length > 1 && (
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {ongoing.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTournament(i)}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTournamentIdx === i
                  ? 'border-b-2 border-red-500 text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white border-b-2 border-transparent'
              }`}
            >
              {t.name.replace(/.*—\s*/, '') || cleanTournamentName(t.name)}
            </button>
          ))}
        </div>
      )}

      {/* Tournament name */}
      <div className="px-4 sm:px-5 pt-4 pb-3">
        {getLeagueLabel(tournament.name) && (
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-1">
            {getLeagueLabel(tournament.name)}
          </p>
        )}
        <p className="font-display text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
          {cleanTournamentName(tournament.name)}
        </p>
      </div>

      {/* Tab bar — segmented control */}
      <div className="px-4 sm:px-5 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex w-full rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); logEvent('tournament_tab_click', { tab }) }}
              className={`flex-1 py-1 text-xs font-semibold uppercase tracking-wide rounded transition-colors text-center whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Stage picker — shown when the event has multiple stages (Group Stage, Playoffs, etc.) */}
      {detail?.eventStages?.length > 1 && activeTab !== 'Overview' && activeTab !== 'Heroes' && (
        <div className="flex items-center gap-1 px-4 sm:px-5 py-2 border-b border-gray-100 dark:border-gray-900">
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
      {activeTab === 'Overview' && (
        <div className="px-4 sm:px-5 py-4">
          {detail?.eventStages?.length > 0 && (
            <div className="flex flex-col gap-2">
              {detail.eventStages.map(stage => {
                const start = stage.beginAt ? new Date(stage.beginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
                const end = stage.endAt ? new Date(stage.endAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
                const dateStr = start && end ? `${start} – ${end}` : start || end || null
                return (
                  <div key={stage.id} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">{stageShortName(stage.name)}</span>
                    <span className="flex-1 border-b border-dashed border-gray-200 dark:border-gray-700" />
                    {dateStr && <span className="text-gray-400 dark:text-gray-600 tabular-nums whitespace-nowrap">{dateStr}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Standings' && (
        <div>
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
            <div className="px-4 sm:px-5 py-8 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">No standings for bracket stages.</p>
              {detail?.eventStages?.some(s => !PLAYOFF_FORMATS.has(s.format) && s.id !== activeStageId) && (
                <button
                  type="button"
                  onClick={() => {
                    const groupStage = detail.eventStages.find(s => !PLAYOFF_FORMATS.has(s.format))
                    if (groupStage) setActiveStageId(groupStage.id)
                  }}
                  className="mt-4 px-3 py-1.5 text-xs font-semibold rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 uppercase tracking-wide"
                >
                  View group stage
                </button>
              )}
            </div>
          ) : (
            <StandingsTable standings={effectiveDetail?.standings} />
          )}
        </div>
      )}

      {activeTab === 'Schedule' && (
        <div>
          {isStageLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-900">
              {[48, 64, 40, 56, 52].map((w, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="h-2 w-14 bg-gray-200 dark:bg-gray-800 rounded animate-pulse shrink-0" />
                  <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse flex-1 max-w-xs" style={{ width: `${w}%` }} />
                  <div className="h-5 w-14 bg-gray-200 dark:bg-gray-800 rounded animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          ) : (['Double Elimination', 'Single Elimination', 'Bracket'].includes(effectiveDetail?.format))
            ? <HorizontalBracket bracket={effectiveDetail?.bracket} />
            : <BracketFlatView bracket={effectiveDetail?.bracket} />
          }
        </div>
      )}

      {activeTab === 'Heroes' && (
        <div className="px-4 sm:px-5 py-4">
          {heroStatsLoading ? (
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
              No picks yet.
            </p>
          ) : (
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-3 uppercase tracking-widest">
                {heroStats.gameCount} game{heroStats.gameCount !== 1 ? 's' : ''} · sorted by picks + bans
              </p>
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col className="w-6" />
                  <col />{/* hero name — takes remaining space */}
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
                  onClick={() => { const next = !showAllHeroes; setShowAllHeroes(next); logEvent('heroes_show_more', { expanded: next }) }}
                  className="mt-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showAllHeroes ? 'Show less' : `Show all ${heroStats.heroes.length} heroes`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-900 flex justify-end">
        <a
          href="/tournaments"
          className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          onClick={() => logEvent('tournament_hub_view_all_click', {})}
        >
          View all tournaments →
        </a>
      </div>
    </section>
    </div>
  )
}

export default TournamentHub

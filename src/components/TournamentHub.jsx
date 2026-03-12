import { useState, useEffect, useRef } from "react"
import { track } from '@vercel/analytics'

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

function formatScheduledTime(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = d - now
  const diffH = diffMs / 3600000
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzShort = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: tz })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || ''
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })

  if (diffH < 0) return 'Soon'
  if (diffH < 1) return `In ${Math.round(diffMs / 60000)}m`
  if (diffH < 24) return `${timeStr} ${tzShort}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }) + ` · ${timeStr} ${tzShort}`
}

function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return (
    <p className="text-xs text-gray-500 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No standings data yet
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

// Flat round list — used for Swiss / Group Stage formats
function BracketView({ bracket }) {
  if (!bracket || bracket.length === 0) return (
    <p className="text-xs text-gray-500 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No bracket data yet
    </p>
  )

  const relevantRounds = bracket.filter(r =>
    r.matches.some(m => m.teamA !== 'TBD' || m.teamB !== 'TBD')
  )
  const rounds = relevantRounds.length > 0 ? relevantRounds : bracket.slice(0, 1)

  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-900">
      {rounds.map(({ round, label, matches }) => (
        <div key={round} className="py-3 px-4 sm:px-5">
          <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
            {label || `Round ${round}`}
          </p>
          <div className="flex flex-col gap-1.5">
            {matches.map((m, i) => {
              const isLive = m.status === 'running'
              const isDone = m.status === 'finished'
              const isTbd = m.teamA === 'TBD' && m.teamB === 'TBD'
              const scoreA = m.scoreA ?? null
              const scoreB = m.scoreB ?? null
              const hasScore = scoreA !== null && scoreB !== null
              const dimA = isDone && hasScore && scoreA < scoreB
              const dimB = isDone && hasScore && scoreB < scoreA

              return (
                <div key={m.id || i} className="flex items-center gap-2 text-sm">
                  {isLive
                    ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    : <span className="w-1.5 h-1.5 flex-shrink-0" />
                  }
                  <span className={`flex-1 text-right truncate font-semibold ${
                    isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
                    dimA ? 'text-gray-400 dark:text-gray-600' :
                    'text-gray-900 dark:text-white'
                  }`}>{m.teamA}</span>
                  <div className="w-16 flex-shrink-0 text-center">
                    {hasScore ? (
                      <span className="font-black tabular-nums text-gray-900 dark:text-white">
                        <span className={dimA ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreA}</span>
                        <span className="text-gray-300 dark:text-gray-700 font-light mx-1">–</span>
                        <span className={dimB ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreB}</span>
                      </span>
                    ) : m.status === 'not_started' && m.scheduledAt ? (
                      <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                        {formatScheduledTime(m.scheduledAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-600">vs</span>
                    )}
                  </div>
                  <span className={`flex-1 truncate font-semibold ${
                    isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
                    dimB ? 'text-gray-400 dark:text-gray-600' :
                    'text-gray-900 dark:text-white'
                  }`}>{m.teamB}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
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

// ── Horizontal bracket tree ────────────────────────────────────────────────

const CARD_H = 66    // px — height of each match card (two team rows)
const CARD_W = 164   // px — width of each match card
const H_GAP  = 28    // px — horizontal gap between round columns
const V_GAP  = 10    // px — vertical gap between cards in the same round
const LABEL_H = 20   // px — height of round label row above bracket

function MatchCard({ match }) {
  const isLive = match.status === 'running'
  const isDone = match.status === 'finished'
  const isTbd  = match.teamA === 'TBD' && match.teamB === 'TBD'
  const hasScore = match.scoreA !== null && match.scoreB !== null
  const winA = isDone && hasScore && match.scoreA > match.scoreB
  const winB = isDone && hasScore && match.scoreB > match.scoreA

  const rows = [
    { name: match.teamA, score: match.scoreA, win: winA, dim: isDone && hasScore && !winA && match.teamA !== 'TBD' },
    { name: match.teamB, score: match.scoreB, win: winB, dim: isDone && hasScore && !winB && match.teamB !== 'TBD' },
  ]

  return (
    <div className={`w-full h-full rounded border flex flex-col overflow-hidden ${
      isLive  ? 'border-red-500/50 bg-red-500/5' :
      isTbd   ? 'border-gray-200 dark:border-gray-800 opacity-60' :
                'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950'
    }`}>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex-1 flex items-center justify-between px-2 gap-1 min-w-0 ${
            i === 0 ? 'border-b border-gray-100 dark:border-gray-800' : ''
          } ${row.dim ? 'opacity-40' : ''}`}
        >
          {isLive && i === 0 && (
            <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0 mr-0.5" />
          )}
          <span className="flex-1 truncate text-xs font-semibold leading-tight text-gray-900 dark:text-white">
            {row.name === 'TBD' ? '' : row.name}
          </span>
          {hasScore && (
            <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-1 ${
              row.win ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
            }`}>
              {row.score}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function BracketSection({ label, rounds }) {
  if (!rounds || rounds.length === 0) return null

  const maxMatches = Math.max(...rounds.map(r => r.matches.length))
  if (maxMatches === 0) return null

  // Each "slot" in the round with most matches = CARD_H + V_GAP
  // Rounds with fewer matches get proportionally taller slots so cards align
  const baseSlot = CARD_H + V_GAP
  const totalH   = maxMatches * baseSlot
  const totalW   = rounds.length * (CARD_W + H_GAP) - H_GAP

  return (
    <div>
      {label && (
        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
          {label}
        </p>
      )}
      <div className="relative" style={{ width: totalW, height: totalH + LABEL_H + 4 }}>

        {/* Round column labels */}
        {rounds.map((round, rIdx) => (
          <div
            key={rIdx}
            className="absolute text-center overflow-hidden"
            style={{ left: rIdx * (CARD_W + H_GAP), top: 0, width: CARD_W, height: LABEL_H }}
          >
            <span className="text-xs text-gray-400 dark:text-gray-600 truncate block px-1">
              {round.label}
            </span>
          </div>
        ))}

        {/* SVG connector lines */}
        <svg
          className="absolute pointer-events-none"
          style={{ left: 0, top: LABEL_H + 4 }}
          width={totalW}
          height={totalH}
        >
          {rounds.slice(0, -1).map((round, rIdx) => {
            const nextRound = rounds[rIdx + 1]
            const curSlotH  = totalH / round.matches.length
            const nextSlotH = totalH / nextRound.matches.length
            const x1   = rIdx * (CARD_W + H_GAP) + CARD_W
            const x2   = (rIdx + 1) * (CARD_W + H_GAP)
            const xMid = (x1 + x2) / 2

            return round.matches.map((_, mIdx) => {
              const y1          = mIdx * curSlotH + curSlotH / 2
              const nextMIdx    = Math.floor(mIdx / 2)
              const y2          = nextMIdx * nextSlotH + nextSlotH / 2
              return (
                <path
                  key={`${rIdx}-${mIdx}`}
                  d={`M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-gray-200 dark:text-gray-800"
                />
              )
            })
          })}
        </svg>

        {/* Match cards */}
        {rounds.map((round, rIdx) => {
          const slotH = totalH / round.matches.length
          const x     = rIdx * (CARD_W + H_GAP)
          return round.matches.map((match, mIdx) => {
            const y = mIdx * slotH + (slotH - CARD_H) / 2
            return (
              <div
                key={match.id || `${rIdx}-${mIdx}`}
                className="absolute"
                style={{ left: x, top: LABEL_H + 4 + y, width: CARD_W, height: CARD_H }}
              >
                <MatchCard match={match} />
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

function HorizontalBracket({ bracket }) {
  if (!bracket || bracket.length === 0) return (
    <p className="text-xs text-gray-500 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No bracket data yet
    </p>
  )

  const sorted = (arr) => arr.slice().sort((a, b) => a.round - b.round)
  const upper      = sorted(bracket.filter(r => r.section === 'upper'))
  const lower      = sorted(bracket.filter(r => r.section === 'lower'))
  const main       = sorted(bracket.filter(r => r.section === 'main'))
  const grandFinal = bracket.filter(r => r.section === 'grand_final')

  const notEmpty = (rounds) => rounds.filter(r => r.matches.length > 0)

  const isDE = upper.length > 0 && lower.length > 0

  if (isDE) {
    return (
      <div className="px-4 sm:px-5 py-4 overflow-x-auto">
        <div className="min-w-max flex flex-col gap-8">
          <BracketSection label="Upper Bracket" rounds={notEmpty(upper)} />
          <BracketSection label="Lower Bracket" rounds={notEmpty(lower)} />
          {grandFinal.length > 0 && (
            <BracketSection label="Grand Final" rounds={notEmpty(grandFinal)} />
          )}
        </div>
      </div>
    )
  }

  const allRounds = notEmpty([...main, ...upper, ...lower, ...grandFinal])
  return (
    <div className="px-4 sm:px-5 py-4 overflow-x-auto">
      <div className="min-w-max">
        <BracketSection rounds={allRounds} />
      </div>
    </div>
  )
}

const TABS = ['Overview', 'Standings', 'Schedule', 'Heroes']

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
    <section
      className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden"
      aria-labelledby="tournament-hub-heading"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-800">
        <h2
          id="tournament-hub-heading"
          className="text-sm uppercase tracking-widest text-gray-700 dark:text-gray-300 font-bold"
        >
          {isOngoing ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live Tournament
            </span>
          ) : 'Upcoming Tournament'}
        </h2>
      </div>

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
        <p className="font-display text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
          {cleanTournamentName(tournament.name)}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => { setActiveTab(tab); logEvent('tournament_tab_click', { tab }) }}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-red-500 text-gray-900 dark:text-white'
                : 'border-b-2 border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Stage picker — shown when the event has multiple stages (Group Stage, Playoffs, etc.) */}
      {detail?.eventStages?.length > 1 && (
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
        <div className="px-4 sm:px-5 py-4 flex flex-col gap-4">
          {isOngoing && (
            <>
              {/* Format badge + date range + round/team count */}
              <div className="flex flex-wrap items-center gap-2">
                {effectiveDetail?.format && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500">
                    {effectiveDetail.format}
                    {effectiveDetail.totalRounds > 0 && !['Double Elimination', 'Single Elimination', 'Bracket'].includes(effectiveDetail.format) && ` · ${effectiveDetail.totalRounds}R`}
                    <FormatTooltip format={effectiveDetail.format} />
                  </span>
                )}
                {dateRange && (
                  <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">{dateRange}</span>
                )}
                {['Swiss', 'Group Stage'].includes(effectiveDetail?.format) && currentRound && effectiveDetail?.totalRounds > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">Round {currentRound} of {effectiveDetail.totalRounds}</span>
                )}
                {effectiveDetail?.teamCount > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">{effectiveDetail.teamCount} teams</span>
                )}
              </div>

              {/* Live Now */}
              {liveMatches.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Live Now
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {liveMatches.map((m, i) => <OverviewMatchRow key={m.id || i} match={m} />)}
                  </div>
                </div>
              )}

              {/* Up Next */}
              {upcomingMatches.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
                    Up Next
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {upcomingMatches.map((m, i) => <OverviewMatchRow key={m.id || i} match={m} />)}
                  </div>
                </div>
              )}

              {/* No matches state */}
              {liveMatches.length === 0 && upcomingMatches.length === 0 && effectiveDetail && (
                <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest py-1">
                  No matches currently scheduled
                </p>
              )}

              {/* Standings Snapshot — top 6 teams */}
              {effectiveDetail?.standings?.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
                    Standings
                  </p>
                  <div>
                    {effectiveDetail.standings.slice(0, 6).map((s, i) => {
                      const showZones = effectiveDetail.standings.length >= 4
                      const midpoint = Math.ceil(effectiveDetail.standings.length / 2)
                      const isEliminated = showZones && i >= midpoint && s.losses > s.wins
                      return (
                        <div key={i} className="flex items-center gap-2 py-1.5 text-xs border-b border-gray-100 dark:border-gray-900 last:border-0">
                          <span className="w-5 tabular-nums text-gray-400 dark:text-gray-600 text-right flex-shrink-0">{s.rank}</span>
                          {showZones && (
                            <span className={`w-1 h-4 rounded-full flex-shrink-0 ${isEliminated ? 'bg-red-500/60' : 'bg-green-500/60'}`} />
                          )}
                          <span className={`flex-1 font-semibold truncate ${isEliminated ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                            {s.team}
                          </span>
                          <span className="font-bold tabular-nums text-green-600 dark:text-green-400 w-6 text-center">{s.wins}</span>
                          <span className="font-bold tabular-nums text-red-500 dark:text-red-400 w-6 text-center">{s.losses}</span>
                        </div>
                      )
                    })}
                  </div>
                  {effectiveDetail.standings.length > 6 && (
                    <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5 uppercase tracking-widest">
                      +{effectiveDetail.standings.length - 6} more - see Standings tab
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {!isOngoing && upcoming.length > 1 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
                Also coming up
              </p>
              <div className="flex flex-col gap-1.5">
                {upcoming.slice(1, 4).map((t, i) => {
                  const tStart = t.startdate
                    ? new Date(t.startdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : null
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400"
                    >
                      <span className="truncate">{cleanTournamentName(t.name)}</span>
                      {tStart && (
                        <span className="text-gray-400 dark:text-gray-600 shrink-0 ml-3 tabular-nums">{tStart}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Standings' && (
        <div>
          {isStageLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : (
            <StandingsTable standings={effectiveDetail?.standings} />
          )}
        </div>
      )}

      {activeTab === 'Schedule' && (
        <div>
          {isStageLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : (['Double Elimination', 'Single Elimination', 'Bracket'].includes(effectiveDetail?.format))
            ? <HorizontalBracket bracket={effectiveDetail?.bracket} />
            : <BracketView bracket={effectiveDetail?.bracket} />
          }
        </div>
      )}

      {activeTab === 'Heroes' && (
        <div className="px-4 sm:px-5 py-4">
          {heroStatsLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : !heroStats?.heroes?.length ? (
            <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
              No draft data yet
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
                    <th className="text-left py-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">#</th>
                    <th className="text-left py-2 pr-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">Hero</th>
                    <th className="text-center py-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">Picks</th>
                    <th className="text-center py-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">Win%</th>
                    <th className="text-center py-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">Bans</th>
                    <th className="text-center py-2 font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">P+B</th>
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
                  onClick={() => setShowAllHeroes(v => !v)}
                  className="mt-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showAllHeroes ? 'Show less' : `Show all ${heroStats.heroes.length} heroes`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

    </section>
  )
}

export default TournamentHub

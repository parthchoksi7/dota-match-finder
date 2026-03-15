import { useState, useEffect, useRef } from 'react'
import SiteHeader from '../components/SiteHeader'
import StageTimeline from '../components/StageTimeline'
import TeamRoster from '../components/TeamRoster'
import RegionBreakdown from '../components/RegionBreakdown'
import { HorizontalBracket } from '../components/BracketView'
import { track } from '@vercel/analytics'

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, props)
  }
}

function getSeriesIdFromPath() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/tournament\/(\d+)/)
  return match ? match[1] : null
}

function formatDateRange(beginAt, endAt) {
  if (!beginAt) return null
  const opts = { month: 'short', day: 'numeric' }
  const start = new Date(beginAt).toLocaleDateString('en-US', opts)
  if (!endAt) return start
  const end = new Date(endAt).toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${start} - ${end}`
}

function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Live
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
        Upcoming
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
      Completed
    </span>
  )
}

function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <th className="text-left py-2 pr-4 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 font-medium w-8">#</th>
            <th className="text-left py-2 pr-4 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 font-medium">Team</th>
            <th className="text-center py-2 px-2 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 font-medium">W</th>
            <th className="text-center py-2 px-2 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 font-medium">L</th>
            {standings[0]?.points != null && (
              <th className="text-center py-2 px-2 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 font-medium">Pts</th>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
              <td className="py-1.5 pr-4 text-xs text-gray-400 dark:text-gray-600 tabular-nums">{row.rank ?? i + 1}</td>
              <td className="py-1.5 pr-4 text-sm font-semibold text-gray-900 dark:text-white">{row.teamName}</td>
              <td className="py-1.5 px-2 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                {row.wins ?? '-'}
              </td>
              <td className="py-1.5 px-2 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                {row.losses ?? '-'}
              </td>
              {standings[0]?.points != null && (
                <td className="py-1.5 px-2 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                  {row.points ?? '-'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AISummary({ seriesData }) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleOpen() {
    setOpen(true)
    trackEvent('tournament_summary_view', { tournament_name: seriesData.name })

    if (summary || loading) return
    setLoading(true)

    fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'tournament',
        seriesId: seriesData.id,
        name: seriesData.name,
        leagueName: seriesData.leagueName,
        status: seriesData.status,
        beginAt: seriesData.beginAt,
        endAt: seriesData.endAt,
        prizePool: seriesData.prizePool,
        teams: seriesData.teams,
        stages: seriesData.stages,
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setSummary(d.summary)
        setLoading(false)
      })
      .catch(() => {
        setError('Summary unavailable.')
        setLoading(false)
      })
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left min-h-[44px]"
        onClick={open ? () => setOpen(false) : handleOpen}
        aria-expanded={open}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
          AI Summary
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4 bg-gray-50 dark:bg-gray-800/30">
          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
            </div>
          )}
          {error && (
            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">{error}</p>
          )}
          {summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
          )}
        </div>
      )}
    </div>
  )
}

function getStageDescription(stageName, hasBracket) {
  const lower = (stageName || '').toLowerCase()
  if (lower.includes('play-in') || lower.includes('play in') || lower.includes('playin')) {
    return 'Qualifying rounds where lower-seeded or newly qualified teams compete for spots in the main playoffs. Round 1 winners advance to join direct-qualified teams in Round 2; Round 2 winners enter the main bracket. Note: bracket connector lines show the approximate match flow — PandaScore doesn\'t expose exact feed links between rounds.'
  }
  if (lower.includes('qualifier') || lower.includes('qual')) {
    return 'Regional qualifying stage. Teams compete here to earn spots in the main event.'
  }
  if (lower.includes('grand final')) {
    return 'The championship match between the two finalists. Winner takes the title and top prize.'
  }
  if (lower.includes('playoff') || lower.includes('main event')) {
    return 'Main elimination bracket. Teams from the group stage and play-in compete in a double or single elimination format for the championship. Winners of the play-in typically enter as lower seeds.'
  }
  if (lower.includes('group')) {
    return 'Group stage using Swiss or round-robin format. All teams play the same number of rounds; final standings determine who advances to the playoffs bracket.'
  }
  if (lower.includes('swiss')) {
    return 'Swiss format: each round pairs teams with similar records. All teams play all rounds; standings decide who advances.'
  }
  if (hasBracket) {
    return 'Bracket stage. Teams play head-to-head; losers may be eliminated or drop to the lower bracket depending on the format.'
  }
  return 'Tournament stage where teams compete for advancement.'
}

function StageInfoTooltip({ stageName, hasBracket }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const tooltipRef = useRef(null)

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
        aria-label={`About ${stageName}`}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-600 hover:border-gray-600 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors leading-none font-bold flex-shrink-0"
        style={{ fontSize: '9px' }}
      >
        i
      </button>
      {pos && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-xl p-3"
          style={{ top: pos.top, left: Math.min(pos.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 288) }}
        >
          <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{stageName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {getStageDescription(stageName, hasBracket)}
          </p>
        </div>
      )}
    </span>
  )
}

function HeroStatsSection({ stageId, seriesName, isCompleted }) {
  const [open, setOpen] = useState(false)
  const [heroes, setHeroes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  function handleOpen() {
    setOpen(true)
    if (heroes || loading || !stageId) return
    setLoading(true)
    const params = new URLSearchParams({ id: stageId, name: seriesName })
    if (isCompleted) params.set('completed', '1')
    fetch(`/api/tournament-heroes?${params}`)
      .then(r => r.json())
      .then(d => { setHeroes(d); setLoading(false) })
      .catch(() => { setHeroes({ heroes: [], gameCount: 0 }); setLoading(false) })
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left min-h-[44px]"
        onClick={open ? () => setOpen(false) : handleOpen}
        aria-expanded={open}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
          Hero Stats
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4 bg-gray-50 dark:bg-gray-800/30">
          {loading && (
            <div className="space-y-2 animate-pulse">
              {[70, 55, 80, 60, 45, 75].map((w, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-2 w-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded flex-1" style={{ width: `${w}%` }} />
                  <div className="h-2 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-2 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-2 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          )}
          {!loading && !heroes?.heroes?.length && (
            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest py-2 text-center">
              No hero data available.
            </p>
          )}
          {!loading && heroes?.heroes?.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-3 uppercase tracking-widest">
                {heroes.gameCount} game{heroes.gameCount !== 1 ? 's' : ''} · sorted by picks + bans
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
                  {(showAll ? heroes.heroes : heroes.heroes.slice(0, 25)).map((hero, i) => {
                    const winPct = hero.picks > 0 ? Math.round((hero.wins / hero.picks) * 100) : null
                    const isHighWin = winPct !== null && winPct >= 60
                    const isLowWin = winPct !== null && winPct <= 40
                    return (
                      <tr key={hero.name} className="border-b border-gray-100 dark:border-gray-900 hover:bg-white dark:hover:bg-gray-900/40">
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
              {heroes.heroes.length > 25 && (
                <button
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                  className="mt-3 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showAll ? 'Show less' : `Show all ${heroes.heroes.length} heroes`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TournamentDetail() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [teamsExpanded, setTeamsExpanded] = useState(true)
  const [stagesExpanded, setStagesExpanded] = useState(true)

  const seriesId = getSeriesIdFromPath()

  useEffect(() => {
    if (!seriesId) {
      setError('Invalid tournament URL.')
      setLoading(false)
      return
    }

    fetch(`/api/tournament-detail?id=${seriesId}&series=1`)
      .then(async r => {
        if (r.status === 404) throw new Error('not_found')
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(`HTTP ${r.status}: ${body.message || body.error || ''}`)
        }
        return r.json()
      })
      .then(d => {
        setData(d)
        setLoading(false)
        trackEvent('tournament_detail_view', {
          tournament_name: d.name,
          series_id: String(seriesId),
        })
      })
      .catch(err => {
        if (err.message === 'not_found') {
          setError('Tournament not found.')
        } else {
          setError('Tournament data is temporarily unavailable. Check back shortly.')
        }
        setLoading(false)
        console.error('TournamentDetail fetch error:', err)
      })
  }, [seriesId])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full">
        <div>
          <a
            href="/tournaments"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-4"
            onClick={() => trackEvent('tournament_back_click', {})}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Tournaments
          </a>
        </div>

        {error && (
          <div className="border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded px-4 py-6 text-center">
            <p className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest mb-4">{error}</p>
            <a
              href="/tournaments"
              className="text-xs font-semibold uppercase tracking-widest border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
            >
              Back to Tournaments
            </a>
          </div>
        )}

        {loading && !error && (
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-2/3" />
            </div>
            <div className="flex gap-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-20" />
            </div>
            <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        )}

        {data && !error && (
          <>
            {/* Header */}
            <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 p-4 sm:p-5">
              {data.leagueName && (
                <p className="text-xs uppercase tracking-[4px] text-red-500 mb-1">
                  {data.leagueName}
                </p>
              )}
              <div className="flex items-start justify-between gap-3 mb-3">
                <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
                  {data.name}
                </h1>
                <StatusBadge status={data.status} />
              </div>

              {data.status === 'completed' && data.winner?.name && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">🏆</span>
                  <span className="text-sm font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
                    {data.winner.name}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
                {data.beginAt && data.endAt && (
                  <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 tabular-nums">
                    {formatDateRange(data.beginAt, data.endAt)}
                  </span>
                )}
                {data.prizePool && (
                  <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">
                    {data.prizePool}
                  </span>
                )}
                {data.teams?.length > 0 && (
                  <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">
                    {data.teams.length} teams
                  </span>
                )}
              </div>

              {/* Stage timeline */}
              {data.stages?.length > 0 && (
                <div className="mb-4">
                  <StageTimeline stages={data.stages} />
                </div>
              )}

              {/* Action links */}
              <div className="flex flex-wrap gap-2">
                {data.streamUrl && data.status === 'live' && (
                  <a
                    href={data.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold rounded transition-colors"
                    onClick={() => trackEvent('tournament_stream_click', { tournament_name: data.name })}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                    Watch Live
                  </a>
                )}
                <a
                  href={data.liquipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 rounded transition-colors"
                  onClick={() => trackEvent('tournament_liquipedia_click', { tournament_name: data.name })}
                >
                  Liquipedia
                </a>
                <a
                  href={`/?q=${encodeURIComponent(data.leagueName || data.name)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 rounded transition-colors"
                  onClick={() => trackEvent('tournament_find_vods_click', { tournament_name: data.name })}
                >
                  Find VODs
                </a>
              </div>
            </div>

            {/* AI Summary */}
            <AISummary seriesData={data} />

            {/* Teams section */}
            {data.teams?.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
                    Teams ({data.teams.length})
                  </h2>
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    onClick={() => { setTeamsExpanded(v => !v); trackEvent('tournament_teams_toggle', { tournament_name: data.name }) }}
                  >
                    {teamsExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                {teamsExpanded && (
                  <>
                    {/* Region breakdown */}
                    <div className="mb-3">
                      <RegionBreakdown teams={data.teams} />
                    </div>

                    <div className="flex flex-col gap-2">
                      {data.teams.map(team => (
                        <TeamRoster
                          key={team.id}
                          team={team}
                          tournamentName={data.name}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Stages section */}
            {data.stages?.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
                    Stages
                  </h2>
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    onClick={() => { setStagesExpanded(v => !v); trackEvent('tournament_stages_toggle', { tournament_name: data.name }) }}
                  >
                    {stagesExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                {stagesExpanded && (
                  <div className="flex flex-col gap-3">
                    {data.stages.map(stage => {
                      const now = new Date()
                      const stageBegin = stage.beginAt ? new Date(stage.beginAt) : null
                      const stageEnd = stage.endAt ? new Date(stage.endAt) : null
                      const isLive = stageBegin && stageEnd && stageBegin <= now && now <= stageEnd
                      const hasStandingsData = stage.standings?.some(s => s.wins != null || s.losses != null)

                      return (
                        <div
                          key={stage.id}
                          className={`border rounded bg-white dark:bg-gray-900 overflow-hidden ${isLive ? 'border-red-500/50' : 'border-gray-200 dark:border-gray-800'}`}
                          onClick={() => trackEvent('tournament_stage_click', {
                            stage_name: stage.name,
                            tournament_name: data.name,
                          })}
                        >
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                {isLive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                                )}
                                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                                  {stage.name}
                                </h3>
                                <StageInfoTooltip stageName={stage.name} hasBracket={stage.hasBracket} />
                              </div>
                              <div className="flex items-center gap-2">
                                {stage.tier && (
                                  <span className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600">
                                    Tier {stage.tier.toUpperCase ? stage.tier.toUpperCase() : stage.tier}
                                  </span>
                                )}
                                {stage.prizePool && (
                                  <span className="text-xs text-gray-400 dark:text-gray-600">
                                    {stage.prizePool}
                                  </span>
                                )}
                              </div>
                            </div>

                            {(stage.beginAt || stage.endAt) && (
                              <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 tabular-nums">
                                {formatDateRange(stage.beginAt, stage.endAt)}
                              </p>
                            )}
                          </div>

                          {/* Bracket stages: show the bracket */}
                          {stage.hasBracket && stage.bracket?.length > 0 && (
                            <div className="border-t border-gray-100 dark:border-gray-800">
                              <HorizontalBracket bracket={stage.bracket} />
                            </div>
                          )}

                          {/* Non-bracket stages: show standings only if they have real W/L data */}
                          {!stage.hasBracket && hasStandingsData && (
                            <div className="border-t border-gray-100 dark:border-gray-800 p-4 pt-3">
                              <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2">
                                Standings
                              </p>
                              <StandingsTable standings={stage.standings} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Hero Stats — completed tournaments only */}
            {data.stages?.length > 0 && (
              <HeroStatsSection
                stageId={data.stages[0]?.id}
                seriesName={data.name}
                isCompleted={data.status === 'completed'}
              />
            )}

            {/* VOD section */}
            <section className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
                Watch VODs
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Search for a team from this tournament on the homepage to find timestamped Twitch VODs.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {data.teams?.slice(0, 6).map(team => (
                  <a
                    key={team.id}
                    href={`/?q=${encodeURIComponent(team.name)}`}
                    className="px-2 py-1 text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400 rounded transition-colors"
                  >
                    {team.name}
                  </a>
                ))}
                {data.teams?.length > 6 && (
                  <a
                    href="/"
                    className="px-2 py-1 text-xs font-semibold text-gray-400 dark:text-gray-600"
                  >
                    +{data.teams.length - 6} more
                  </a>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/80 px-4 sm:px-6 py-4 text-center">
        <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest flex flex-col sm:flex-row sm:justify-center sm:gap-1 items-center">
          <span>Spectate Esports</span>
          <span className="hidden sm:inline"> · </span>
          <a href="/tournaments" className="hover:text-gray-300 transition-colors">Tournaments</a>
          <span className="hidden sm:inline"> · </span>
          <a href="/" className="hover:text-gray-300 transition-colors">Home</a>
        </p>
      </footer>
    </div>
  )
}

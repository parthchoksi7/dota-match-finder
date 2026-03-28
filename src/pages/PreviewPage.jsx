import { useState, useEffect, useCallback, useRef } from "react"
import MatchDrawer from "../components/MatchDrawer"
import TournamentHub from "../components/TournamentHub"
import {
  fetchProMatches,
  findTwitchVod,
  fetchMatchStreams,
  fetchMatchSummary,
  fetchGrandFinalMatchIds,
} from "../api"
import {
  groupIntoSeries,
  isSeriesComplete,
  getSeriesWins,
  getSeriesLabel,
  getFollowedTeams,
  setFollowedTeams as persistFollowedTeams,
  trackEvent,
  formatDuration,
} from "../utils"

// ── Summary cache ────────────────────────────────────────────────────────────
const SUMMARY_CACHE_KEY = "dota-match-finder-summaries"
function getSummaryFromCache(matchId) {
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)[matchId] ?? null
  } catch { return null }
}
function setSummaryInCache(matchId, text) {
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY) || "{}"
    const map = JSON.parse(raw)
    map[matchId] = text
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(map))
  } catch {}
}

// ── URL helpers ──────────────────────────────────────────────────────────────
function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-")
}
function getMatchSlug(match) {
  return [slugify(match.radiantTeam), "vs", slugify(match.direTeam), slugify(match.tournament), match.id].filter(Boolean).join("-")
}
function getShareUrl(match) {
  return window.location.origin + "/match/" + getMatchSlug(match)
}

// ── Display helpers ──────────────────────────────────────────────────────────
function abbrevTournament(name) {
  if (!name) return ""
  const lower = name.toLowerCase()
  if (lower.includes("dreamleague")) return "DreamLeague"
  if (lower.includes("esl")) return "ESL"
  if (lower.includes("pgl")) return "PGL"
  if (lower.includes("blast")) return "BLAST"
  if (lower.includes("weplay")) return "WePlay"
  if (lower.includes("beyond the summit") || lower.includes("bts")) return "BTS"
  if (lower.includes("the international")) return "TI"
  return name.split(" ").slice(0, 2).join(" ")
}

function getDateLabel(unixSeconds) {
  if (!unixSeconds) return null
  const now = new Date()
  const d = new Date(unixSeconds * 1000)
  if (d.toDateString() === now.toDateString()) return "Today"
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getDateStr(unixSeconds) {
  if (!unixSeconds) return null
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getDayKey(unixSeconds) {
  if (!unixSeconds) return "unknown"
  return new Date(unixSeconds * 1000).toDateString()
}

function formatMatchTime(scheduledAt) {
  if (!scheduledAt) return null
  const date = new Date(scheduledAt)
  const now = new Date()
  const diffMs = date - now
  const diffHours = diffMs / (1000 * 60 * 60)
  const tzShort = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(date).find(p => p.type === "timeZoneName")?.value || ""
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (diffHours < 0) return "Starting soon"
  if (diffHours < 1) return `In ${Math.round(diffMs / 60000)}m`
  if (diffHours < 24) {
    const hrs = Math.floor(diffHours)
    const mins = Math.round((diffHours - hrs) * 60)
    return mins > 0 ? `In ${hrs}h ${mins}m · ${timeStr} ${tzShort}` : `In ${hrs}h · ${timeStr} ${tzShort}`
  }
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${dateStr} · ${timeStr} ${tzShort}`
}

// ── Play icon ────────────────────────────────────────────────────────────────
function PlayIcon() {
  return (
    <svg className="w-2 h-2 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

// ── Result card (B+ style) — flat list row, matches prototype ────────────────
function ResultCard({ series, onSelectGame, spoilerFree, followedTeams, isGrandFinal }) {
  const game1 = series.games[0]
  const radiantTeam = game1.radiantTeam
  const direTeam = game1.direTeam
  const { radiantWins, direWins } = getSeriesWins(series)
  const seriesWinner = radiantWins > direWins ? radiantTeam : radiantWins < direWins ? direTeam : null
  const isFollowed = followedTeams?.includes(radiantTeam) || followedTeams?.includes(direTeam)
  const seriesLabel = getSeriesLabel(series.seriesType)
  const tournamentShort = abbrevTournament(series.tournament)
  const maxGames = series.seriesType === 0 ? 1 : series.seriesType === 2 ? 5 : 3
  const gameSlots = Array.from({ length: maxGames }, (_, i) => series.games[i] ?? null)
  const radiantDim = !spoilerFree && seriesWinner && seriesWinner !== radiantTeam
  const direDim = !spoilerFree && seriesWinner && seriesWinner !== direTeam

  return (
    <article
      data-series-id={series.id}
      onClick={() => onSelectGame(series.games[0])}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectGame(series.games[0]) } }}
      tabIndex={0}
      className={[
        "py-5 border-b border-gray-800 group cursor-pointer hover:bg-gray-900/30",
        "-mx-4 px-4 sm:-mx-6 sm:px-6 transition-colors outline-none",
        isFollowed ? "border-l-4 border-l-amber-500/60" : "",
      ].join(" ")}
    >
      {/* Meta row */}
      <div className="text-xs uppercase tracking-widest text-gray-600 mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span>{tournamentShort}</span>
          {seriesLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-gray-800 text-gray-600">{seriesLabel}</span>
          )}
          {isGrandFinal && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-amber-800/40 text-amber-500/80">Grand Final</span>
          )}
        </div>
        <span className="text-gray-700 tabular-nums">{formatDuration(game1.duration)}</span>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center gap-4 sm:gap-8">
        <div className="flex items-center flex-1 justify-end min-w-0">
          <p className={[
            "font-display font-black text-3xl sm:text-4xl uppercase leading-none truncate",
            radiantDim ? "text-gray-500" : "text-white"
          ].join(" ")}>
            {radiantTeam}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {!spoilerFree ? (
            <>
              <span className={["font-display font-black text-4xl sm:text-5xl tabular-nums leading-none", radiantDim ? "text-gray-500" : "text-white"].join(" ")}>{radiantWins}</span>
              <span className="text-gray-700 text-xl font-medium">–</span>
              <span className={["font-display font-black text-4xl sm:text-5xl tabular-nums leading-none", direDim ? "text-gray-500" : "text-white"].join(" ")}>{direWins}</span>
            </>
          ) : (
            <span className="text-gray-600 text-sm">vs</span>
          )}
        </div>
        <div className="flex items-center flex-1 min-w-0">
          <p className={[
            "font-display font-black text-3xl sm:text-4xl uppercase leading-none truncate",
            direDim ? "text-gray-500" : "text-gray-400"
          ].join(" ")}>
            {direTeam}
          </p>
        </div>
      </div>

      {/* Game chips */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {gameSlots.map((game, i) => {
          if (!game) {
            return (
              <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-800 text-gray-600">
                G{i + 1}
              </span>
            )
          }
          const gameWinner = game.radiantWin ? game.radiantTeam : game.direTeam
          const showWinner = !spoilerFree && gameWinner
          return (
            <button
              key={game.id}
              type="button"
              onClick={e => { e.stopPropagation(); onSelectGame(game) }}
              className={[
                "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-800",
                "hover:bg-purple-900/40 hover:text-purple-300 transition-colors",
                showWinner ? "text-green-400" : "text-gray-500"
              ].join(" ")}
            >
              <PlayIcon />
              <span>G{i + 1}</span>
              {showWinner && (
                <>
                  <span className="truncate max-w-[72px]">{gameWinner}</span>
                  <span>✓</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </article>
  )
}

// ── Live match card ──────────────────────────────────────────────────────────
function LiveCard({ match, onSelectMatchId, spoilerFree }) {
  const hasScore = match.seriesScore && match.seriesScore !== "0-0"
  const scoreA = hasScore ? Number(match.seriesScore.split("-")[0]) : 0
  const scoreB = hasScore ? Number(match.seriesScore.split("-")[1]) : 0
  const dimA = !spoilerFree && hasScore && scoreA < scoreB
  const dimB = !spoilerFree && hasScore && scoreB < scoreA
  const completedGames = (match.games || []).filter(g => g.status === "finished")

  return (
    <div className="py-5 border-b border-gray-800 last:border-0 border-l-4 border-l-red-500 pl-4 pr-4">
      {/* Row 1: Tournament + series badge */}
      <div className="text-xs uppercase tracking-widest text-gray-600 mb-2 flex items-center gap-2 flex-wrap">
        <span>{match.tournament}</span>
        {match.seriesLabel && (
          <span className="text-xs px-1.5 py-0.5 rounded border border-gray-800 text-gray-600">{match.seriesLabel}</span>
        )}
        {match.bestOf && <span>· BO{match.bestOf}</span>}
      </div>

      {/* Row 2: Teams + score */}
      <div className="flex items-center gap-4 sm:gap-8">
        <div className="flex items-center flex-1 justify-end min-w-0">
          <p className={[
            "font-display font-black text-3xl sm:text-4xl uppercase leading-none truncate",
            dimA ? "text-gray-500" : "text-white"
          ].join(" ")}>
            {match.teamA}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-center">
          {hasScore && !spoilerFree ? (
            <div className="flex items-center gap-1.5">
              <span className={["font-display font-black text-4xl sm:text-5xl tabular-nums leading-none", dimA ? "text-gray-500" : "text-white"].join(" ")}>{scoreA}</span>
              <span className="text-gray-700 text-xl font-medium">–</span>
              <span className={["font-display font-black text-4xl sm:text-5xl tabular-nums leading-none", dimB ? "text-gray-500" : "text-white"].join(" ")}>{scoreB}</span>
            </div>
          ) : (
            <span className="text-gray-600 text-sm">vs</span>
          )}
          {match.currentGame && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs">G{match.currentGame} in progress</span>
            </div>
          )}
        </div>
        <div className="flex items-center flex-1 min-w-0">
          <p className={[
            "font-display font-black text-3xl sm:text-4xl uppercase leading-none truncate",
            dimB ? "text-gray-500" : "text-gray-400"
          ].join(" ")}>
            {match.teamB}
          </p>
        </div>
      </div>

      {/* Row 3: Watch button(s) + completed game chips */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {match.streams?.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("stream_click", { channel: s.label, match: `${match.teamA} vs ${match.teamB}` })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43z" /></svg>
            Watch · {s.label}
          </a>
        ))}
        {completedGames.map(g => (
          g.matchId ? (
            <button
              key={g.position}
              type="button"
              onClick={() => { onSelectMatchId?.(g.matchId); trackEvent("live_game_details_click", { matchId: g.matchId, game: g.position }) }}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-800 text-gray-500 hover:bg-purple-900/40 hover:text-purple-300 transition-colors"
            >
              <PlayIcon />
              G{g.position}
              {g.winnerName && !spoilerFree && <span className="text-green-400">{g.winnerName}</span>}
            </button>
          ) : (
            <span key={g.position} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-800 text-gray-600">
              G{g.position}
            </span>
          )
        ))}
      </div>
    </div>
  )
}

// ── Upcoming match row ───────────────────────────────────────────────────────
function UpcomingRow({ match }) {
  const timeStr = formatMatchTime(match.scheduledAt)
  return (
    <div className="px-4 py-3 border-b border-gray-800/60 last:border-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs uppercase tracking-widest text-gray-500 font-medium truncate">
          {match.tournament}
          {match.seriesLabel && (
            <span className="ml-1.5 text-gray-600 normal-case tracking-normal font-normal">
              ({match.seriesLabel})
            </span>
          )}
        </span>
        {timeStr && (
          <span className="shrink-0 text-xs text-gray-500 tabular-nums">{timeStr}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg font-black uppercase tracking-wide text-white truncate">
          <span>{match.teamA}</span>
          <span className="text-gray-600 font-light mx-2 normal-case tracking-normal">vs</span>
          <span>{match.teamB}</span>
        </p>
        {match.streams?.length > 0 && (
          <div className="flex gap-1.5 shrink-0">
            {match.streams.slice(0, 1).map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 bg-purple-800/50 hover:bg-purple-700 text-purple-300 rounded-full transition-colors whitespace-nowrap"
              >
                {s.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Date section header ──────────────────────────────────────────────────────
// Matches prototype: big faded watermark on left, horizontal line, small date on right
function DateHeader({ label, dateStr }) {
  const showDateStr = dateStr && dateStr !== label
  return (
    <div className="flex items-center gap-4 pt-3 pb-1 overflow-hidden">
      <span className="font-display font-black text-5xl text-white/[0.06] leading-none flex-shrink-0 select-none pointer-events-none uppercase">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-800" />
      {showDateStr && (
        <span className="text-xs text-gray-700 font-semibold uppercase tracking-widest flex-shrink-0">
          {dateStr}
        </span>
      )}
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────────────────
// live: red text + pulsing dot, no border-t (first section)
// others: gray text + border-t above
function SectionLabel({ children, color = "gray", count }) {
  if (color === "red") {
    return (
      <div className="flex items-center gap-2 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        <span className="text-xs font-bold uppercase tracking-[4px] text-red-500">{children}</span>
        {count != null && <span className="text-xs font-semibold text-red-500/50 tabular-nums">· {count}</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 pt-5 pb-3 border-t border-gray-800/50">
      <span className="text-xs font-bold uppercase tracking-[4px] text-gray-600">{children}</span>
    </div>
  )
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/40 px-4 py-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-2 w-16 bg-gray-800 rounded" />
        <div className="h-2 w-8 bg-gray-800 rounded" />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-5 bg-gray-800 rounded" />
        <div className="w-12 h-6 bg-gray-800 rounded" />
        <div className="flex-1 h-5 bg-gray-800 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-gray-800 rounded-full" />
        <div className="h-6 w-20 bg-gray-800 rounded-full" />
      </div>
    </div>
  )
}

// ── Main PreviewPage ─────────────────────────────────────────────────────────
function PreviewPage() {
  const [allMatches, setAllMatches] = useState([])
  const [nextMatchId, setNextMatchId] = useState(null)
  const [grandFinalMatchIds, setGrandFinalMatchIds] = useState(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)

  const [liveMatches, setLiveMatches] = useState([])
  const [upcomingMatches, setUpcomingMatches] = useState([])
  const [liveLoading, setLiveLoading] = useState(true)

  const [selectedMatch, setSelectedMatch] = useState(null)
  const [expandedSeriesId, setExpandedSeriesId] = useState(null)

  const [summary, setSummary] = useState(null)
  const [summaryMatchId, setSummaryMatchId] = useState(null)
  const [summaryError, setSummaryError] = useState(null)
  const [summaryErrorMatchId, setSummaryErrorMatchId] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [cachedSummaryForSelected, setCachedSummaryForSelected] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState(null)

  const [spoilerFree, setSpoilerFree] = useState(() => {
    try { return localStorage.getItem("spoilerFree") === "true" } catch { return false }
  })
  const [followedTeams, setFollowedTeamsState] = useState(() => getFollowedTeams())
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"))
  const [tournamentPills, setTournamentPills] = useState(null)
  const [expandedTournamentId, setExpandedTournamentId] = useState(null)

  const searchInputRef = useRef(null)

  // ── Data fetching ───────────────────────────────────────────────────────────
  const loadMatches = useCallback(() => {
    setError(null)
    setInitialLoading(true)
    fetchProMatches()
      .then(({ matches, nextMatchId }) => {
        setAllMatches(matches)
        setNextMatchId(nextMatchId)
        setInitialLoading(false)
      })
      .catch(() => {
        setError("Failed to load matches.")
        setInitialLoading(false)
      })
  }, [])

  async function fetchLiveData() {
    try {
      const [liveRes, upcomingRes] = await Promise.all([
        fetch("/api/live-matches").then(r => r.json()),
        fetch("/api/upcoming-matches").then(r => r.json()),
      ])
      setLiveMatches(liveRes.matches || [])
      setUpcomingMatches(upcomingRes.matches || [])
    } catch {}
    setLiveLoading(false)
  }

  useEffect(() => {
    loadMatches()
    fetchGrandFinalMatchIds().then(ids => setGrandFinalMatchIds(new Set(ids)))
    fetchLiveData()
    const interval = setInterval(fetchLiveData, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadMatches])

  useEffect(() => {
    fetch("/api/tournaments")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const pills = [
          ...(d.ongoing || []).map(t => ({ ...t, status: "live" })),
          ...(d.upcoming || []).map(t => ({ ...t, status: "upcoming" })),
        ].slice(0, 3)
        setTournamentPills(pills)
      })
      .catch(() => {})
  }, [])

  // ── Series + game number map ────────────────────────────────────────────────
  const seriesMatchMap = {}
  allMatches.forEach(m => {
    if (!seriesMatchMap[m.seriesId]) seriesMatchMap[m.seriesId] = []
    seriesMatchMap[m.seriesId].push(m.id)
  })

  const matchGameNumbers = {}
  Object.entries(seriesMatchMap).forEach(([, ids]) => {
    ids.slice().reverse().forEach((id, i) => { matchGameNumbers[id] = i + 1 })
  })

  // ── Match selection + VOD fetch ─────────────────────────────────────────────
  async function handleSelectMatch(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(false)

    if (match.unplayed) {
      setSelectedMatch(match)
      return
    }

    window.history.replaceState(null, "", "/match/" + getMatchSlug(match))
    trackEvent("match_click", {
      matchId: match.id,
      radiantTeam: match.radiantTeam,
      direTeam: match.direTeam,
      tournament: match.tournament,
    })

    if (match.seriesId) setExpandedSeriesId(String(match.seriesId))
    setSelectedMatch({ ...match, loadingVod: true })

    const siblingIds = match.seriesId
      ? allMatches.filter(m => String(m.seriesId) === String(match.seriesId) && !m.unplayed).map(m => m.id)
      : [match.id]
    const idsToFetch = siblingIds.length > 0 ? siblingIds : [match.id]
    const streamMap = await fetchMatchStreams(idsToFetch, match.startTime, match.radiantTeam, match.direTeam)

    const resolvedChannels = idsToFetch.map(id => streamMap[id]).filter(Boolean)
    const uniqueChannels = [...new Set(resolvedChannels)]
    const candidateChannels = streamMap._candidates || null
    const preferredChannel = uniqueChannels.length === 1 ? uniqueChannels[0] : null

    const vod = await findTwitchVod(match.startTime, match.tournament, preferredChannel, candidateChannels)
    setSelectedMatch({
      ...match,
      loadingVod: false,
      url: vod?.url || null,
      channel: vod?.channel || null,
      allVods: vod?.allVods || [],
    })
  }

  async function handleSelectMatchId(matchId) {
    try {
      const data = await fetch(`https://api.opendota.com/api/matches/${matchId}`).then(r => r.json())
      if (!data || !data.match_id) return
      const match = {
        id: String(data.match_id),
        tournament: data.league?.name || "Match " + data.match_id,
        date: new Date(data.start_time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        radiantTeam: data.radiant_name || "Radiant",
        direTeam: data.dire_name || "Dire",
        radiantScore: data.radiant_score,
        direScore: data.dire_score,
        radiantWin: data.radiant_win,
        duration: new Date((data.duration || 0) * 1000).toISOString().slice(11, 16),
        startTime: data.start_time,
        seriesId: data.series_id,
        seriesType: data.series_type,
      }
      handleSelectMatch(match)
    } catch {}
  }

  async function handleSummarize(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(true)
    trackEvent("summary_click", { matchId: match.id, radiantTeam: match.radiantTeam, direTeam: match.direTeam })
    try {
      const result = await fetchMatchSummary(match.id)
      setSummaryMatchId(match.id)
      setSummary(result)
      setSummaryInCache(match.id, result)
      if (selectedMatch?.id === match.id) setCachedSummaryForSelected(result)
    } catch (err) {
      setSummaryErrorMatchId(match.id)
      setSummaryError(err?.message || "Failed to generate summary")
    } finally {
      setSummaryLoading(false)
    }
  }

  function dismissPanel() {
    const scrollY = window.scrollY
    const targetSeriesId = expandedSeriesId
    setSelectedMatch(null)
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setCachedSummaryForSelected(null)
    setCopyFeedback(null)
    window.history.replaceState(null, "", "/preview")
    setTimeout(() => {
      if (targetSeriesId) {
        const el = document.querySelector(`[data-series-id="${targetSeriesId}"]`)
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); return }
      }
      window.scrollTo(0, scrollY)
    }, 0)
  }

  useEffect(() => {
    if (selectedMatch?.id) setCachedSummaryForSelected(getSummaryFromCache(selectedMatch.id))
    else setCachedSummaryForSelected(null)
  }, [selectedMatch?.id])

  // ── Results: group into series, filter complete, group by day ───────────────
  const completeSeries = groupIntoSeries(allMatches).filter(isSeriesComplete)
  const dayGroups = []
  completeSeries.forEach(s => {
    const key = getDayKey(s.startTime)
    const last = dayGroups[dayGroups.length - 1]
    if (!last || last.key !== key) {
      dayGroups.push({ key, label: getDateLabel(s.startTime), dateStr: getDateStr(s.startTime), series: [s] })
    } else {
      last.series.push(s)
    }
  })

  async function handleLoadMore() {
    if (loadingMore || !nextMatchId) return
    setLoadingMore(true)
    trackEvent("load_more", { page: "preview" })
    try {
      const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(nextMatchId)
      setAllMatches(prev => [...prev, ...newMatches])
      setNextMatchId(newNextId)
    } catch {}
    setLoadingMore(false)
  }

  function handleSpoilerToggle() {
    const next = !spoilerFree
    setSpoilerFree(next)
    try { localStorage.setItem("spoilerFree", String(next)) } catch {}
    trackEvent("spoiler_free_toggle", { enabled: next, page: "preview" })
  }

  function handleThemeToggle() {
    const root = document.documentElement
    const next = !root.classList.contains("dark")
    root.classList.toggle("dark", next)
    try { localStorage.setItem("theme", next ? "dark" : "light") } catch {}
    setIsDark(next)
  }

  const twitchSearchHref = "https://www.twitch.tv/search?term=dota%202"

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header — full width ── */}
      <header className="border-b border-gray-800 sticky top-0 z-40 bg-gray-950">
        <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <img src="/favicon.png" alt="Spectate Esports" className="h-8 w-8" />
            <div className="hidden sm:block">
              <p className="font-display font-black text-lg uppercase tracking-widest leading-none">
                Spectate <span className="text-red-500">Esports</span>
              </p>
            </div>
          </a>

          <div className="flex-1" />

          <nav className="flex items-center gap-2 sm:gap-3">
            <a href="/tournaments" className="hidden sm:block text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Tournaments</a>
            <a href="/calendar" className="hidden sm:block text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Calendar</a>

            <button
              type="button"
              onClick={handleSpoilerToggle}
              id="spoiler-btn"
              title={spoilerFree ? "Spoiler-free mode on" : "Enable spoiler-free mode"}
              className={[
                "hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold uppercase tracking-widest transition-colors",
                spoilerFree
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-gray-800 text-gray-500 hover:text-white hover:border-gray-600"
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {spoilerFree
                  ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} x1="1" y1="1" x2="23" y2="23"/></>
                  : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>
                }
              </svg>
              <span>Spoilers</span>
            </button>

            <button
              type="button"
              onClick={handleThemeToggle}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors"
            >
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* ── Live banner (sticky below header) ── */}
      {!liveLoading && liveMatches.length > 0 && (() => {
        const first = liveMatches[0]
        const more = liveMatches.length - 1
        const teamA = first.teamA || "Team A"
        const teamB = first.teamB || "Team B"
        const seriesParts = first.seriesScore?.split("-")
        const scoreA = seriesParts?.[0] ?? ""
        const scoreB = seriesParts?.[1] ?? ""
        const watchUrl = first.streams?.[0]?.rawUrl || null
        return (
          <div className="sticky top-[57px] z-30 border-b border-red-500/40 bg-gray-950/95 backdrop-blur-sm">
            <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold uppercase tracking-widest flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {liveMatches.length} Live
                </span>
                <span className="font-display font-black text-white text-base sm:text-lg uppercase truncate">
                  {spoilerFree ? `${teamA} vs ${teamB}` : `${teamA} ${scoreA}–${scoreB} ${teamB}`}
                </span>
                {more > 0 && (
                  <a
                    href="#live-section"
                    onClick={e => { e.preventDefault(); document.getElementById("live-section")?.scrollIntoView({ behavior: "smooth" }) }}
                    className="text-gray-600 hover:text-gray-400 text-xs font-semibold tabular-nums flex-shrink-0 transition-colors"
                  >
                    +{more} more ↓
                  </a>
                )}
              </div>
              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent("preview_live_banner_watch", { url: watchUrl })}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
                  </svg>
                  Watch
                </a>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Main content ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-5 pb-24 sm:pb-6 flex flex-col gap-4">

        {/* Search */}
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search teams or tournaments..."
          className="w-full bg-gray-800/60 border border-gray-700/50 rounded-full px-5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:bg-gray-800"
          onKeyDown={e => {
            if (e.key === "Enter" && e.target.value.trim()) {
              window.location.href = "/?q=" + encodeURIComponent(e.target.value.trim())
            }
          }}
        />

        {/* Tournament pills + inline hub */}
        {tournamentPills && tournamentPills.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-[4px] text-gray-600 flex-shrink-0">Tournaments</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {tournamentPills.map(t => {
                  const isLive = t.status === "live"
                  const isExpanded = expandedTournamentId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        trackEvent("preview_tournament_pill_click", { tournament_id: t.id, tournament_name: t.name })
                        setExpandedTournamentId(isExpanded ? null : t.id)
                      }}
                      className={
                        "flex items-center gap-1.5 px-3 py-1.5 border rounded text-sm font-semibold transition-colors " +
                        (isLive
                          ? "border-red-500/50 bg-red-500/5 text-white hover:bg-red-500/10"
                          : "border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300")
                      }
                    >
                      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                      {t.name}
                      <span className={isExpanded ? "text-gray-400 text-xs" : "text-gray-700 text-xs"}>▾</span>
                    </button>
                  )
                })}
              </div>
            </div>
            {expandedTournamentId && (
              <TournamentHub
                key={expandedTournamentId}
                tournamentId={expandedTournamentId}
                spoilerFree={spoilerFree}
                onClose={() => setExpandedTournamentId(null)}
              />
            )}
          </div>
        )}

        {/* ── Today at a Glance strip ── */}
        {!initialLoading && !liveLoading && (dayGroups[0]?.key === new Date().toDateString() || liveMatches.length > 0) && (
          <div className="flex items-center overflow-x-auto gap-3 border border-gray-800 rounded bg-gray-900 px-4 py-3 [scrollbar-width:none] [-webkit-scrollbar:none]">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-shrink-0 mr-1">Today</span>
            {liveMatches.length > 0 && (
              <div className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-red-400 whitespace-nowrap">{liveMatches.length} {liveMatches.length === 1 ? "match" : "matches"} live</span>
              </div>
            )}
            {(dayGroups[0]?.key === new Date().toDateString() ? dayGroups[0].series : []).map(s => {
              const { radiantWins, direWins } = getSeriesWins(s)
              return (
                <div key={s.id} className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-gray-800 rounded px-2.5 py-1.5 cursor-pointer hover:bg-gray-700 transition-colors" onClick={() => handleSelectMatch(s.games[0])}>
                  <span className="text-white whitespace-nowrap">{s.games[0].radiantTeam}</span>
                  {!spoilerFree && (
                    <>
                      <span className="font-display font-black text-sm text-white tabular-nums">{radiantWins}</span>
                      <span className="text-gray-700 font-normal mx-0.5">–</span>
                      <span className="font-display font-black text-sm text-gray-500 tabular-nums">{direWins}</span>
                    </>
                  )}
                  <span className="text-gray-500 whitespace-nowrap">{s.games[0].direTeam}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Live Now ── */}
        {!liveLoading && liveMatches.length > 0 && (
          <div id="live-section">
            <SectionLabel color="red" count={liveMatches.length}>Live Now</SectionLabel>
            <div>
              {liveMatches.map(match => (
                <LiveCard
                  key={match.id}
                  match={match}
                  onSelectMatchId={handleSelectMatchId}
                  spoilerFree={spoilerFree}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Coming Up ── */}
        {!liveLoading && upcomingMatches.length > 0 && (
          <div>
            <SectionLabel>Coming Up</SectionLabel>
            <div>
              {upcomingMatches.slice(0, 5).map(match => (
                <UpcomingRow key={match.id} match={match} />
              ))}
            </div>
          </div>
        )}

        {/* ── Live/upcoming loading skeleton ── */}
        {liveLoading && (
          <div>
            <div className="flex items-center gap-2 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-800 animate-pulse" />
              <div className="h-2.5 w-20 bg-gray-800 rounded animate-pulse" />
            </div>
            {[...Array(2)].map((_, i) => (
              <div key={i} className="py-5 border-b border-gray-800 border-l-4 border-l-gray-800 pl-4 animate-pulse">
                <div className="h-2 w-32 bg-gray-800 rounded mb-3" />
                <div className="flex items-center gap-8">
                  <div className="flex-1 h-8 bg-gray-800 rounded" />
                  <div className="w-16 h-10 bg-gray-800 rounded" />
                  <div className="flex-1 h-8 bg-gray-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Results skeleton ── */}
        {initialLoading && (
          <div>
            <SectionLabel>Results</SectionLabel>
            <DateHeader label="Today" dateStr={getDateStr(Date.now() / 1000)} />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="py-5 border-b border-gray-800 -mx-4 px-4 sm:-mx-6 sm:px-6 animate-pulse">
                <div className="h-2 w-24 bg-gray-800 rounded mb-3" />
                <div className="flex items-center gap-8">
                  <div className="flex-1 h-8 bg-gray-800 rounded" />
                  <div className="w-16 h-10 bg-gray-800 rounded" />
                  <div className="flex-1 h-8 bg-gray-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center justify-center gap-3 py-6 border border-red-900/50 bg-red-950/20 rounded-xl px-4">
            <span className="text-red-400 text-xs uppercase tracking-widest">{error}</span>
            <button type="button" onClick={loadMatches} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* ── Results by day ── flat rows, no card wrappers ── */}
        {!initialLoading && !error && dayGroups.length > 0 && (
          <div>
            <SectionLabel>Results</SectionLabel>
            {dayGroups.map(group => (
              <div key={group.key}>
                <DateHeader label={group.label} dateStr={group.dateStr} />
                {group.series.map(s => (
                  <ResultCard
                    key={s.id}
                    series={s}
                    onSelectGame={handleSelectMatch}
                    spoilerFree={spoilerFree}
                    followedTeams={followedTeams}
                    isGrandFinal={s.games.some(g => grandFinalMatchIds.has(g.id))}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Load more ── */}
        {nextMatchId && !initialLoading && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="py-3 text-sm font-semibold uppercase tracking-widest text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-600 rounded transition-colors disabled:opacity-40"
          >
            {loadingMore ? "Loading..." : "Load more results"}
          </button>
        )}

        {!initialLoading && !error && (
          <p className="text-xs text-gray-700 text-center pb-2">
            Data updates every few minutes · Powered by OpenDota + Twitch
          </p>
        )}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-950/95 backdrop-blur border-t border-gray-800/80 flex">
        <a
          href="/tournaments"
          className="flex-1 flex flex-col items-center gap-1 py-3 text-gray-500 hover:text-gray-300 transition-colors text-xs font-semibold uppercase tracking-widest"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Tournaments
        </a>
        <a
          href="/calendar"
          className="flex-1 flex flex-col items-center gap-1 py-3 text-gray-500 hover:text-gray-300 transition-colors text-xs font-semibold uppercase tracking-widest"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Calendar
        </a>
        <button
          type="button"
          onClick={handleSpoilerToggle}
          className={[
            "flex-1 flex flex-col items-center gap-1 py-3 transition-colors text-xs font-semibold uppercase tracking-widest",
            spoilerFree ? "text-amber-400" : "text-gray-500 hover:text-gray-300"
          ].join(" ")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {spoilerFree
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            }
          </svg>
          {spoilerFree ? "Spoilers off" : "Spoilers"}
        </button>
      </nav>

      {/* ── Match Drawer ── */}
      {selectedMatch && !initialLoading && (
        <MatchDrawer
          match={selectedMatch}
          onDismiss={dismissPanel}
          summary={summaryMatchId === selectedMatch?.id ? summary : null}
          summaryLoading={summaryLoading}
          summaryError={summaryErrorMatchId === selectedMatch?.id ? summaryError : null}
          cachedSummary={cachedSummaryForSelected}
          onSummarize={handleSummarize}
          copyFeedback={copyFeedback}
          twitchSearchHref={twitchSearchHref}
          gameNumber={matchGameNumbers[selectedMatch?.id]}
          seriesMatches={seriesMatchMap[selectedMatch?.seriesId]?.length}
          shareUrl={getShareUrl(selectedMatch)}
          spoilerFree={spoilerFree}
          onCopyVod={() => {
            navigator.clipboard?.writeText(selectedMatch.url)
            trackEvent("copy_vod", { matchId: selectedMatch.id })
            setCopyFeedback("vod")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
          onCopyLink={() => {
            const url = getShareUrl(selectedMatch)
            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "/match/" + getMatchSlug(selectedMatch))
            trackEvent("share_match", { matchId: selectedMatch.id })
            setCopyFeedback("link")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
        />
      )}
    </div>
  )
}

export default PreviewPage

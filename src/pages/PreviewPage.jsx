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

// ── Result card (B+ style) ───────────────────────────────────────────────────
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
    <div
      data-series-id={series.id}
      className={[
        "rounded-xl border bg-gray-900/60 transition-all",
        isFollowed
          ? "border-l-4 border-amber-500/50 pl-0"
          : isGrandFinal
          ? "border-amber-500/50"
          : "border-gray-800/80",
      ].join(" ")}
    >
      {/* Top meta row */}
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-[3px] text-gray-500 truncate">
            {tournamentShort}
          </span>
          {seriesLabel && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 font-bold">
              {seriesLabel}
            </span>
          )}
          {isGrandFinal && (
            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold uppercase tracking-wide">
              Grand Final
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-600 tabular-nums">
          {formatDuration(game1.duration)}
        </span>
      </div>

      {/* Teams + Score — clickable to open drawer for game 1 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectGame(series.games[0])}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectGame(series.games[0]) } }}
        className="px-4 pb-2.5 flex items-center gap-2 cursor-pointer hover:bg-white/[0.03] -mx-0 rounded-lg transition-colors"
      >
        <p className={[
          "flex-1 text-right font-display text-2xl sm:text-3xl font-black uppercase tracking-wide leading-none truncate",
          radiantDim ? "text-gray-600" : "text-white"
        ].join(" ")}>
          {radiantTeam}
        </p>
        {!spoilerFree ? (
          <div className="shrink-0 flex items-center px-1">
            <span className="font-black tabular-nums text-3xl sm:text-4xl text-white leading-none">
              <span className={radiantDim ? "text-gray-600" : ""}>{radiantWins}</span>
              <span className="text-gray-700 font-light mx-1.5">–</span>
              <span className={direDim ? "text-gray-600" : ""}>{direWins}</span>
            </span>
          </div>
        ) : (
          <div className="shrink-0 w-8 text-center">
            <span className="text-gray-600 text-sm font-normal">vs</span>
          </div>
        )}
        <p className={[
          "flex-1 font-display text-2xl sm:text-3xl font-black uppercase tracking-wide leading-none truncate",
          direDim ? "text-gray-600" : "text-white"
        ].join(" ")}>
          {direTeam}
        </p>
      </div>

      {/* Game chips */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {gameSlots.map((game, i) => {
          if (!game) {
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-800 text-gray-700"
              >
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
              onClick={() => onSelectGame(game)}
              className={[
                "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
                "hover:border-purple-500 hover:text-purple-300 hover:bg-purple-900/20",
                showWinner
                  ? "border-emerald-800/50 text-emerald-400/70"
                  : "border-gray-700 text-gray-400"
              ].join(" ")}
            >
              <PlayIcon />
              <span>G{i + 1}</span>
              {showWinner && (
                <>
                  <span className="font-semibold truncate max-w-[72px]">{gameWinner}</span>
                  <span className="opacity-50">✓</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
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
    <div className="pl-4 pr-4 py-4 border-b border-gray-800/60 last:border-0 border-l-4 border-l-red-500">
      {/* Row 1: Tournament + series badge + stream */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs uppercase tracking-widest text-gray-500 font-medium truncate">
            {match.tournament}
          </span>
          {match.seriesLabel && (
            <span className="shrink-0 text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-gray-700 text-gray-500">
              {match.seriesLabel}
            </span>
          )}
        </div>
        {match.streams?.length > 0 && (
          <div className="flex gap-1.5 shrink-0">
            {match.streams.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("stream_click", { channel: s.label, match: `${match.teamA} vs ${match.teamB}` })}
                className="inline-flex items-center px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap"
              >
                ▶ {s.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Row 2: Teams + score */}
      <div className="flex items-center gap-2 mb-2">
        <p className={[
          "flex-1 text-right font-display text-2xl sm:text-3xl font-black uppercase tracking-wide leading-none truncate",
          dimA ? "text-gray-600" : "text-white"
        ].join(" ")}>
          {match.teamA}
        </p>
        <div className="shrink-0 flex flex-col items-center w-24">
          {hasScore && !spoilerFree ? (
            <span className="font-black tabular-nums text-3xl sm:text-4xl text-white leading-none">
              <span className={dimA ? "text-gray-600" : ""}>{scoreA}</span>
              <span className="text-gray-700 font-light mx-1">–</span>
              <span className={dimB ? "text-gray-600" : ""}>{scoreB}</span>
            </span>
          ) : (
            <span className="text-gray-600 text-sm">vs</span>
          )}
          {match.currentGame && (
            <span className="flex items-center gap-1 mt-0.5 text-xs text-red-400">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              G{match.currentGame}
            </span>
          )}
        </div>
        <p className={[
          "flex-1 font-display text-2xl sm:text-3xl font-black uppercase tracking-wide leading-none truncate",
          dimB ? "text-gray-600" : "text-white"
        ].join(" ")}>
          {match.teamB}
        </p>
      </div>

      {/* Row 3: Completed game chips */}
      {completedGames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {completedGames.map(g => (
            g.matchId ? (
              <button
                key={g.position}
                type="button"
                onClick={() => {
                  onSelectMatchId?.(g.matchId)
                  trackEvent("live_game_details_click", { matchId: g.matchId, game: g.position })
                }}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-400 hover:border-purple-500 hover:text-purple-300 hover:bg-purple-900/20 transition-colors"
              >
                <PlayIcon />
                <span>G{g.position}</span>
                {g.winnerName && !spoilerFree && <span className="font-semibold">{g.winnerName}</span>}
              </button>
            ) : (
              <span key={g.position} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-gray-800 text-gray-600">
                G{g.position}
                {g.winnerName && !spoilerFree && <span>{g.winnerName}</span>}
              </span>
            )
          ))}
        </div>
      )}
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
function DateHeader({ label }) {
  return (
    <div className="relative flex items-center py-3 px-1">
      <span className="absolute left-0 text-6xl font-black uppercase select-none pointer-events-none text-white/[0.04] tracking-wider leading-none">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-800/60" />
      <span className="text-xs uppercase tracking-widest text-gray-600 font-bold shrink-0 px-3">{label}</span>
      <div className="flex-1 h-px bg-gray-800/60" />
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children, color = "gray", dot = false }) {
  const borderColors = {
    red: "border-red-500",
    blue: "border-blue-500",
    gray: "border-gray-600",
    green: "border-emerald-500",
  }
  return (
    <div className="flex items-center mb-2">
      <h2 className={`text-xs font-bold uppercase tracking-widest text-gray-500 pl-2 border-l-2 ${borderColors[color]}`}>
        {dot && (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${color === "red" ? "bg-red-500 animate-pulse" : "bg-blue-500"}`} />
            {children}
          </span>
        )}
        {!dot && children}
      </h2>
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
      dayGroups.push({ key, label: getDateLabel(s.startTime), series: [s] })
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

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/favicon.png" alt="Spectate Esports" className="h-8 w-8" />
            <span className="font-display text-base font-black uppercase tracking-wide text-white leading-none hidden sm:block">
              Spectate
            </span>
          </a>

          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search teams, tournaments..."
              className="w-full bg-gray-800/60 border border-gray-700/50 rounded-full px-4 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:bg-gray-800"
              onKeyDown={e => {
                if (e.key === "Enter" && e.target.value.trim()) {
                  window.location.href = "/?q=" + encodeURIComponent(e.target.value.trim())
                }
              }}
            />
          </div>

          {/* Desktop nav links */}
          <nav className="hidden sm:flex items-center gap-4 shrink-0">
            <a href="/tournaments" className="text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 transition-colors">
              Tournaments
            </a>
            <a href="/calendar" className="text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300 transition-colors">
              Calendar
            </a>
          </nav>

          <button
            type="button"
            onClick={handleSpoilerToggle}
            className={[
              "shrink-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors",
              spoilerFree
                ? "bg-amber-500/15 border-amber-500/50 text-amber-400"
                : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            ].join(" ")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {spoilerFree
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              }
            </svg>
            <span className="hidden sm:inline">Spoilers</span>
          </button>

          <button
            type="button"
            onClick={handleThemeToggle}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 p-1.5 rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6 flex-1 w-full pb-24 sm:pb-6">

        {/* Tournament Hub */}
        <TournamentHub spoilerFree={spoilerFree} />

        {/* ── Live Now ── */}
        {!liveLoading && liveMatches.length > 0 && (
          <div>
            <SectionLabel color="red" dot>Live Now</SectionLabel>
            <div className="rounded-xl border border-red-900/40 bg-gray-900/60 overflow-hidden">
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
            <SectionLabel color="blue" dot>Coming Up</SectionLabel>
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden divide-y divide-gray-800/60">
              {upcomingMatches.slice(0, 5).map(match => (
                <UpcomingRow key={match.id} match={match} />
              ))}
            </div>
          </div>
        )}

        {/* ── Live loading skeleton ── */}
        {liveLoading && (
          <div className="flex flex-col gap-2">
            <div className="h-2.5 w-24 bg-gray-800 rounded animate-pulse" />
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-4 py-4 border-b border-gray-800 last:border-0 animate-pulse">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-2 w-24 bg-gray-800 rounded" />
                    <div className="h-6 w-16 bg-gray-800 rounded" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-5 bg-gray-800 rounded" />
                    <div className="w-12 h-6 bg-gray-800 rounded" />
                    <div className="flex-1 h-5 bg-gray-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Results skeleton ── */}
        {initialLoading && (
          <div className="flex flex-col gap-3">
            <DateHeader label="Today" />
            {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
            <DateHeader label="Yesterday" />
            {[...Array(2)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center justify-center gap-3 py-6 border border-red-900/50 bg-red-950/20 rounded-xl px-4">
            <span className="text-red-400 text-xs uppercase tracking-widest">{error}</span>
            <button
              type="button"
              onClick={loadMatches}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Results by day ── */}
        {!initialLoading && !error && dayGroups.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel color="gray">Results</SectionLabel>
            {dayGroups.map((group, gi) => (
              <div key={group.key} className="flex flex-col gap-3">
                <DateHeader label={group.label} />
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
            className="py-3 text-sm font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-600 rounded-xl transition-colors disabled:opacity-40"
          >
            {loadingMore ? "Loading..." : "Load more results"}
          </button>
        )}

        {!initialLoading && !error && (
          <p className="text-xs text-gray-700 text-center">
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

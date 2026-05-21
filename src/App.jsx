import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import HomeFeed from "./components/HomeFeed"
import MatchDrawer from "./components/MatchDrawer"
import LiveSeriesSheet from "./components/LiveSeriesSheet"
import XPostsModal from "./components/XPostsModal"
import RedditPostsModal from "./components/RedditPostsModal"
import SearchSuggestions, { addRecentSearch } from "./components/SearchSuggestions"
import ManageTeamsModal from "./components/ManageTeamsModal"
import { fetchProMatches, findTwitchVod, fetchMatchStreams, fetchMatchSummary, fetchGrandFinalMatchIds } from "./api"
import SiteHeader from "./components/SiteHeader"
import BottomTabBar from "./components/BottomTabBar"
import SiteFooter from "./components/SiteFooter"
import { formatDuration, getFollowedTeams, setFollowedTeams, trackEvent, getSeriesWins, getSummaryFromCache, setSummaryInCache } from "./utils"
import { getPushPermission, subscribeToPush } from "./utils/push"

const CALENDAR_NUDGE_DISMISSED_KEY = "calendar-nudge-dismissed"

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function getMatchSlug(match) {
  return [
    slugify(match.radiantTeam),
    "vs",
    slugify(match.direTeam),
    slugify(match.tournament),
    match.id,
  ].filter(Boolean).join("-")
}

// Extract match ID from /match/<slug-ending-in-matchId> or legacy #match-:id hash
function getMatchIdFromUrl() {
  if (typeof window === "undefined") return null
  const pathMatch = window.location.pathname.match(/^\/match\/.*?(\d+)\/?$/)
  if (pathMatch) return pathMatch[1]
  const hash = window.location.hash
  const hashMatch = hash?.match(/^#match-(\d+)/)
  if (hashMatch) return hashMatch[1]
  return null
}

function usePullToRefresh(onRefresh) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const pullingRef = useRef(0)
  const isRefreshing = useRef(false)
  const THRESHOLD = 72

  const isStandalone = useMemo(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true),
  [])

  useEffect(() => {
    if (!isStandalone) return

    function onTouchStart(e) {
      // Don't initiate PTR when a modal/drawer is open — touches inside the dialog
      // would otherwise race with initialLoading and blank the drawer
      if (e.target.closest('[role="dialog"]')) return
      if (window.scrollY === 0) startY.current = e.touches[0].clientY
    }

    function onTouchMove(e) {
      if (startY.current === null || window.scrollY > 0) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0) {
        pullingRef.current = Math.min(delta, THRESHOLD * 1.5)
        setPullDistance(pullingRef.current)
      }
    }

    function onTouchEnd() {
      if (pullingRef.current >= THRESHOLD && !isRefreshing.current) {
        isRefreshing.current = true
        setRefreshing(true)
        setPullDistance(0)
        pullingRef.current = 0
        Promise.resolve(onRefresh()).finally(() => {
          isRefreshing.current = false
          setRefreshing(false)
        })
      } else {
        pullingRef.current = 0
        setPullDistance(0)
      }
      startY.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [isStandalone, onRefresh])

  return { pullDistance, refreshing, THRESHOLD }
}

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [nextMatchId, setNextMatchId] = useState(null)
  const [grandFinalMatchIds, setGrandFinalMatchIds] = useState(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryMatchId, setSummaryMatchId] = useState(null)
  const [summaryError, setSummaryError] = useState(null)
  const [summaryErrorMatchId, setSummaryErrorMatchId] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [cachedSummaryForSelected, setCachedSummaryForSelected] = useState(null)
  const [seriesFilter, setSeriesFilter] = useState("all")
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [expandedSeriesId, setExpandedSeriesId] = useState(null)
  const isOwner = typeof window !== "undefined" && localStorage.getItem("spectate-owner") === "true"

  // Live + upcoming data
  const [liveMatches, setLiveMatches] = useState([])
  const [upcomingMatches, setUpcomingMatches] = useState([])
  const [liveLoading, setLiveLoading] = useState(true)

  // Mid-series side sheet (PS data while series is running)
  const [selectedLiveSeries, setSelectedLiveSeries] = useState(null)

  // Tournament name → PandaScore ID map (for inline TournamentHub expand)
  const [tournamentIdMap, setTournamentIdMap] = useState(new Map())

  // Search overlay
  const [searchOpen, setSearchOpen] = useState(false)

  const [xPostsOpen, setXPostsOpen] = useState(false)
  const [xPostsSeries, setXPostsSeries] = useState(null)
  const [xPosts, setXPosts] = useState(null)
  const [xPostsSummaryPost, setXPostsSummaryPost] = useState(null)
  const [xPostsSeriesImageUrl, setXPostsSeriesImageUrl] = useState(null)
  const [xPostsLoading, setXPostsLoading] = useState(false)
  const [xPostsError, setXPostsError] = useState(null)

  const [redditPostsOpen, setRedditPostsOpen] = useState(false)
  const [redditPostsSeries, setRedditPostsSeries] = useState(null)
  const [redditMatchPost, setRedditMatchPost] = useState(null)
  const [redditDayComment, setRedditDayComment] = useState(null)
  const [redditPostsLoading, setRedditPostsLoading] = useState(false)
  const [redditPostsError, setRedditPostsError] = useState(null)

  const [spoilerFree, setSpoilerFree] = useState(() => {
    if (typeof window === "undefined") return false
    const params = new URLSearchParams(window.location.search)
    if (params.get('spoilers') === 'off') {
      try { localStorage.setItem('spoilerFree', 'true') } catch {}
      return true
    }
    return localStorage.getItem("spoilerFree") === "true"
  })

  const [followedTeams, setFollowedTeamsState] = useState(() => getFollowedTeams())
  const [manageTeamsOpen, setManageTeamsOpen] = useState(false)
  const [showCalendarNudge, setShowCalendarNudge] = useState(false)

  function handleToggleFollow(teamName) {
    setFollowedTeamsState(prev => {
      const isFollowed = prev.includes(teamName)
      const next = isFollowed ? prev.filter(t => t !== teamName) : [...prev, teamName]
      setFollowedTeams(next)
      if (!isFollowed && (next.length === 1 || next.length === 2)) {
        try {
          if (!localStorage.getItem(CALENDAR_NUDGE_DISMISSED_KEY)) {
            setShowCalendarNudge(true)
          }
        } catch {}
      }
      if (getPushPermission() === 'granted') {
        try {
          if (localStorage.getItem('spectate-push-disabled') !== '1') {
            subscribeToPush(next).catch(() => {})
          }
        } catch {
          // localStorage unavailable; skip push update to avoid re-enabling when disabled
        }
      }
      return next
    })
  }

  function dismissCalendarNudge() {
    setShowCalendarNudge(false)
    try { localStorage.setItem(CALENDAR_NUDGE_DISMISSED_KEY, '1') } catch {}
  }
  const searchInputRef = useRef(null)

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
        setError("Could not load matches - OpenDota may be temporarily down. Try again in a moment.")
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

  const { pullDistance, refreshing, THRESHOLD } = usePullToRefresh(loadMatches)

  // Read ?q= param from URL so "Find VODs" links from tournament detail pages work
  const initialSearchQuery = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("q") || ""
    : ""

  useEffect(() => {
    loadMatches()
    fetchGrandFinalMatchIds().then(ids => setGrandFinalMatchIds(new Set(ids)))
    fetchLiveData()
    const liveInterval = setInterval(fetchLiveData, 2 * 60 * 1000)
    return () => clearInterval(liveInterval)
  }, [loadMatches])

  // Build tournament name → ID map for inline TournamentHub expand.
  // Store both the raw PandaScore name AND the display-transformed name so that
  // upcoming-matches.js's buildTournamentName output ("DreamLeague S29") matches
  // the raw PandaScore key ("DreamLeague Season 29").
  useEffect(() => {
    fetch("/api/tournaments")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const transformName = name => name
          .replace(/\bseason\s+(\d+)\b/gi, 'S$1')
          .replace(/\s+\d{4}$/, '')
          .trim()
        const map = new Map()
        ;[...(d.ongoing || []), ...(d.upcoming || []), ...(d.completed || [])].forEach(t => {
          if (t.name && t.id) {
            map.set(t.name, t.id)
            map.set(transformName(t.name), t.id)
          }
        })
        setTournamentIdMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!initialLoading && initialSearchQuery) {
      setSearchOpen(true)
      handleSearch(initialSearchQuery)
    }
    // Only run once after initial load completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading])

  // Handle share URL on load — supports both /match/:id and legacy #match-:id
  useEffect(() => {
    if (initialLoading) return
    const matchId = getMatchIdFromUrl()
    if (!matchId) return

    trackEvent("shared_match_open", { matchId, source: window.location.pathname.startsWith("/match/") ? "path" : "hash" })

    const found = allMatches.find(m => m.id === matchId)
    if (found) {
      handleSelectMatch(found)
      return
    }

    fetch(`https://api.opendota.com/api/matches/${matchId}`)
      .then(r => r.json())
      .then(data => {
        if (!data || !data.match_id) return
        const match = {
          id: String(data.match_id),
          tournament: "Match " + data.match_id,
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
      })
      .catch(() => {})
  }, [initialLoading])

  async function handleLoadMore() {
    if (loadingMore || !nextMatchId) return
    setLoadingMore(true)
    trackEvent("load_more", { searchQuery: searchQuery || "homepage" })
    try {
      const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(nextMatchId)
      setAllMatches(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const dedupedNew = newMatches.filter(m => !existingIds.has(m.id))
          return [...prev, ...dedupedNew]
        })
      setNextMatchId(newNextId)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  function handleSearch(query) {
    setLoading(true)
    setSelectedMatch(null)
    const trimmed = query.trim()
    const q = trimmed.toLowerCase()
    addRecentSearch(trimmed)
    setSearchQuery(q)
    trackEvent("search", { query: q })
    setTimeout(() => {
      setLoading(false)
      setSearched(true)
    }, 300)
  }

  function handleSuggestionSelect(query) {
    searchInputRef.current?.setValue(query)
    handleSearch(query)
  }

  function handleClearSearch() {
    setSearched(false)
    setSearchQuery("")
    setSelectedMatch(null)
    setError(null)
    setTimeout(() => { if (window.matchMedia('(hover: hover)').matches) searchInputRef.current?.focus() }, 0)
  }

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

    if (match.seriesId && !match._skipExpand) setExpandedSeriesId(String(match.seriesId))
    setSelectedMatch({ ...match, loadingVod: true })

    const siblingIds = match.seriesId
      ? allMatches.filter(m => String(m.seriesId) === String(match.seriesId) && !m.unplayed).map(m => m.id)
      : [match.id]
    const idsToFetch = siblingIds.length > 0 ? siblingIds : [match.id]
    const streamMap = await fetchMatchStreams(idsToFetch, match.startTime, match.radiantTeam, match.direTeam)

    const resolvedChannels = idsToFetch.map(id => streamMap[id]).filter(Boolean)
    const uniqueChannels = [...new Set(resolvedChannels)]
    const preferredChannel = uniqueChannels.length === 1 ? uniqueChannels[0] : null

    const vod = await findTwitchVod(match.startTime, match.tournament, preferredChannel)
    setSelectedMatch({
      ...match,
      loadingVod: false,
      url: vod?.url || null,
      channel: vod?.channel || null,
      allVods: vod?.allVods || [],
    })
  }

  function handleOpenSeries(series) {
    handleSelectMatch(series.games[0])
  }

  async function handleSummarize(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(true)
    trackEvent("summary_click", {
      matchId: match.id,
      radiantTeam: match.radiantTeam,
      direTeam: match.direTeam,
      tournament: match.tournament,
    })
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
    } catch {
      // silently fail
    }
  }

  function handleSelectLiveMatch(pandaScoreMatchId) {
    const match = liveMatches.find(m => m.id === pandaScoreMatchId)
    if (!match) return
    const hasFinishedGame = (match.games || []).some(g => g.status === 'finished')
    if (!hasFinishedGame) return
    trackEvent('live_series_sheet_open', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
    setSelectedLiveSeries(match)
  }

  async function handleLiveSeriesReplay(odMatchId) {
    trackEvent('live_series_replay', { odMatchId })
    setSelectedLiveSeries(null)
    await handleSelectMatchId(odMatchId)
  }

  async function handleDraftPosts(series) {
    setXPostsSeries(series)
    setXPosts(null)
    setXPostsSummaryPost(null)
    setXPostsSeriesImageUrl(null)
    setXPostsError(null)
    setXPostsLoading(true)
    setXPostsOpen(true)

    try {
      const gameIds = series.games.map(g => g.id)
      const streamMap = await fetchMatchStreams(gameIds)

      const vodResults = await Promise.all(
        series.games.map(game =>
          findTwitchVod(game.startTime, game.tournament, streamMap[game.id] || null).catch(() => null)
        )
      )

      const radiantTeam = series.games[0].radiantTeam
      const direTeam = series.games[0].direTeam
      const { radiantWins, direWins } = getSeriesWins(series)
      const seriesWinner = radiantWins >= direWins ? radiantTeam : direTeam

      const games = series.games.map((game, i) => ({
        gameNumber: i + 1,
        winner: game.radiantWin ? game.radiantTeam : game.direTeam,
        loser: game.radiantWin ? game.direTeam : game.radiantTeam,
        duration: formatDuration(game.duration),
        spectateUrl: window.location.origin + "/match/" + getMatchSlug(game) +
          `?utm_source=twitter&utm_medium=social&utm_campaign=game-recap&utm_content=game-${i + 1}`,
      }))

      const seriesLink = window.location.origin + "/match/" + getMatchSlug(series.games[0]) +
        "?utm_source=twitter&utm_medium=social&utm_campaign=series-recap"

      const seriesImageUrl = "/api/og?mode=series&" + new URLSearchParams({
        team1: radiantTeam,
        team2: direTeam,
        winner: seriesWinner,
        score: `${Math.max(radiantWins, direWins)}-${Math.min(radiantWins, direWins)}`,
        tournament: series.tournament || '',
        seriesType: String(series.seriesType),
      })

      const res = await fetch('/api/draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team1: radiantTeam,
          team2: direTeam,
          tournament: series.tournament,
          seriesType: series.seriesType,
          seriesScore: `${radiantWins}-${direWins}`,
          seriesWinner,
          games,
          seriesLink,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to generate posts')
      }

      const data = await res.json()
      setXPosts(data.posts)
      setXPostsSummaryPost(data.summaryPost || null)
      setXPostsSeriesImageUrl(seriesImageUrl)
    } catch (err) {
      setXPostsError(err?.message || 'Failed to generate posts')
    } finally {
      setXPostsLoading(false)
    }
  }

  async function handleDraftRedditPosts(series) {
    setRedditPostsSeries(series)
    setRedditMatchPost(null)
    setRedditDayComment(null)
    setRedditPostsError(null)
    setRedditPostsLoading(true)
    setRedditPostsOpen(true)

    try {
      const radiantTeam = series.games[0].radiantTeam
      const direTeam = series.games[0].direTeam
      const { radiantWins, direWins } = getSeriesWins(series)
      const seriesWinner = radiantWins >= direWins ? radiantTeam : direTeam

      const games = [{
        gameNumber: 1,
        spectateUrl: window.location.origin + "/match/" + getMatchSlug(series.games[0]) + "?spoilers=off",
      }]

      const seriesLink = window.location.origin + "/match/" + getMatchSlug(series.games[0]) + "?spoilers=off"

      const date = series.games[0]?.startTime
        ? new Date(series.games[0].startTime * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined

      const res = await fetch('/api/draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reddit',
          team1: radiantTeam,
          team2: direTeam,
          tournament: series.tournament,
          seriesType: series.seriesType,
          seriesScore: `${radiantWins}-${direWins}`,
          seriesWinner,
          games,
          seriesLink,
          date,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to generate posts')
      }

      const data = await res.json()
      setRedditMatchPost(data.matchPost || null)
      setRedditDayComment(data.dayComment || null)
    } catch (err) {
      setRedditPostsError(err?.message || 'Failed to generate posts')
    } finally {
      setRedditPostsLoading(false)
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
    window.history.replaceState(null, "", "/")
    setTimeout(() => {
      if (targetSeriesId) {
        const el = document.querySelector(`[data-series-id="${targetSeriesId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
      }
      window.scrollTo(0, scrollY)
    }, 0)
  }

  useEffect(() => {
    if (selectedMatch?.id) {
      setCachedSummaryForSelected(getSummaryFromCache(selectedMatch.id))
    } else {
      setCachedSummaryForSelected(null)
    }
  }, [selectedMatch?.id])

  const searchResults =
    searched && searchQuery
      ? allMatches.filter(
          m =>
            m.radiantTeam.toLowerCase().includes(searchQuery) ||
            m.direTeam.toLowerCase().includes(searchQuery) ||
            m.tournament.toLowerCase().includes(searchQuery)
        )
      : allMatches

  const filteredMatches =
    seriesFilter === "all"
      ? searchResults
      : searchResults.filter(m => String(m.seriesType) === seriesFilter)

  const matchGameNumbers = {}
  const seriesMatchMap = {}
  allMatches.forEach(m => {
    if (!seriesMatchMap[m.seriesId]) seriesMatchMap[m.seriesId] = []
    seriesMatchMap[m.seriesId].push(m.id)
  })
  Object.entries(seriesMatchMap).forEach(([seriesId, ids]) => {
    ids
      .slice()
      .reverse()
      .forEach((id, i) => {
        matchGameNumbers[id] = i + 1
      })
  })

  const twitchSearchHref = "https://www.twitch.tv/search?term=dota%202"

  const seriesGames = selectedMatch?.seriesId
    ? (seriesMatchMap[selectedMatch.seriesId] || []).slice().reverse().map(id => allMatches.find(m => m.id === id)).filter(Boolean)
    : []

  const gameSwitcher = seriesGames.length > 1 ? (
    <div className="inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
      {seriesGames.map((game, idx) => {
        const winner = !spoilerFree
          ? (game.radiantWin ? game.radiantTeam : game.direTeam)
          : null
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => handleSelectMatch(game)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded transition-colors ${
              game.id === selectedMatch?.id
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            G{idx + 1}
            {winner && (
              <span className="font-normal text-gray-500 dark:text-gray-500 min-w-0 max-w-[80px] truncate">
                {winner}
              </span>
            )}
          </button>
        )
      })}
    </div>
  ) : null

  function getShareUrl(match) {
    if (typeof window === "undefined") return ""
    return window.location.origin + "/match/" + getMatchSlug(match)
  }

  // Live banner data

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col overflow-x-hidden">
      {(pullDistance > 0 || refreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
          style={{ transform: `translateY(${refreshing ? 56 : Math.min(pullDistance * 0.6, 56)}px)` }}
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full p-2 shadow-md">
            <svg
              className={`w-5 h-5 text-gray-500 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`}
              style={!refreshing ? { transform: `rotate(${(pullDistance / THRESHOLD) * 360}deg)` } : undefined}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
        </div>
      )}

      <SiteHeader
        onSearchOpen={() => setSearchOpen(true)}
        spoilerFree={spoilerFree}
        onSpoilerToggle={() => {
          const next = !spoilerFree
          setSpoilerFree(next)
          if (typeof window !== "undefined" && window.localStorage) {
            localStorage.setItem("spoilerFree", String(next))
          }
          trackEvent("spoiler_free_toggle", { enabled: next })
        }}
      />


      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full pb-20 md:pb-8">
        {initialLoading && (
          <div
            className="border border-gray-200 dark:border-gray-800 px-6 py-12 text-center rounded"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-red-500 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest mt-4">
              Loading matches...
            </p>
          </div>
        )}

        {!initialLoading && (
          <div className="flex flex-col gap-6">
            {/* Calendar nudge */}
            {showCalendarNudge && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      Add your teams to your calendar
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      Get match schedules for {followedTeams.join(', ')} in Google Calendar, Apple Calendar, or Outlook — auto-updates as new matches are scheduled.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent('calendar_nudge_click', { followed_count: followedTeams.length })
                        dismissCalendarNudge()
                        window.location.href = '/calendar'
                      }}
                      className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Set up calendar sync →
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissCalendarNudge}
                  aria-label="Dismiss"
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Main unified feed */}
            <HomeFeed
              liveMatches={liveMatches}
              upcomingMatches={upcomingMatches}
              allMatches={allMatches}
              onSelectMatch={handleSelectMatch}
              onSelectSeries={handleOpenSeries}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={handleToggleFollow}
              grandFinalMatchIds={grandFinalMatchIds}
              error={error}
              onRetry={loadMatches}
              onSelectMatchId={handleSelectMatchId}
              onSelectLiveMatch={handleSelectLiveMatch}
              tournamentIdMap={tournamentIdMap}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              hasMore={!!nextMatchId}
              onManageTeams={() => setManageTeamsOpen(true)}
            />
          </div>
        )}

      </main>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-950 flex flex-col overflow-hidden">

          {/* Compact search bar — single row, no big button */}
          <div className="flex-shrink-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 h-12">
              {/* Search icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 w-4 h-4 text-gray-400 dark:text-gray-600" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {/* Compact input (Enter to search, × to clear) */}
              <SearchBar
                ref={searchInputRef}
                onSearch={handleSearch}
                loading={loading}
                initialLoadComplete={true}
                onClearSearch={handleClearSearch}
                initialQuery=""
                compact
              />
              {/* Cancel */}
              <button
                type="button"
                onClick={() => { handleClearSearch(); setSearchOpen(false) }}
                className="flex-shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Suggestions — pinned directly below search bar */}
          {!searched && (
            <div className="flex-shrink-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
              <div className="max-w-3xl mx-auto px-3 py-2.5">
                <SearchSuggestions allMatches={allMatches} onSearch={handleSuggestionSelect} />
              </div>
            </div>
          )}

          {/* Results — scrollable */}
          {searched && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-3 pt-3 pb-20 flex flex-col gap-3 w-full">
                {filteredMatches.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-widest">
                      Filter:
                    </span>
                    {["all", "0", "1", "2"].map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setSeriesFilter(value)
                          trackEvent("series_filter", { filter: value })
                        }}
                        className={
                          "focus-ring px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors " +
                          (seriesFilter === value
                            ? "bg-red-600 border-red-600 text-white"
                            : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500")
                        }
                      >
                        {value === "all" ? "All" : value === "0" ? "BO1" : value === "1" ? "BO3" : "BO5"}
                      </button>
                    ))}
                  </div>
                )}
                <MatchList
                  matches={filteredMatches}
                  onSelect={match => { handleSelectMatch(match); setSearchOpen(false) }}
                  onDraftPosts={isOwner ? handleDraftPosts : undefined}
                  onDraftRedditPosts={isOwner ? handleDraftRedditPosts : undefined}
                  loading={loading}
                  onClearSearch={handleClearSearch}
                  spoilerFree={spoilerFree}
                  followedTeams={followedTeams}
                  onToggleFollow={handleToggleFollow}
                  expandedSeriesId={expandedSeriesId}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <SiteFooter />
      <BottomTabBar />

      <ManageTeamsModal
        open={manageTeamsOpen}
        followedTeams={followedTeams}
        onToggleFollow={handleToggleFollow}
        onClose={() => setManageTeamsOpen(false)}
      />

      <XPostsModal
        open={xPostsOpen}
        onClose={() => setXPostsOpen(false)}
        series={xPostsSeries}
        posts={xPosts}
        summaryPost={xPostsSummaryPost}
        seriesImageUrl={xPostsSeriesImageUrl}
        loading={xPostsLoading}
        error={xPostsError}
      />

      <RedditPostsModal
        open={redditPostsOpen}
        onClose={() => setRedditPostsOpen(false)}
        series={redditPostsSeries}
        matchPost={redditMatchPost}
        dayComment={redditDayComment}
        loading={redditPostsLoading}
        error={redditPostsError}
      />

      {selectedLiveSeries && !selectedMatch && (
        <LiveSeriesSheet
          match={selectedLiveSeries}
          onDismiss={() => setSelectedLiveSeries(null)}
          onReplay={handleLiveSeriesReplay}
          spoilerFree={spoilerFree}
        />
      )}

      {selectedMatch && (
        <MatchDrawer
          match={selectedMatch}
          onDismiss={dismissPanel}
          followedTeams={followedTeams}
          onToggleFollow={handleToggleFollow}
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
          gameSwitcher={gameSwitcher}
          onCopyVod={() => {
            navigator.clipboard?.writeText(selectedMatch.url)
            trackEvent("copy_vod", {
              matchId: selectedMatch.id,
              radiantTeam: selectedMatch.radiantTeam,
              direTeam: selectedMatch.direTeam,
            })
            setCopyFeedback("vod")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
          onCopyLink={() => {
            const url = getShareUrl(selectedMatch)
            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "/match/" + getMatchSlug(selectedMatch))
            trackEvent("share_match", {
              matchId: selectedMatch.id,
              radiantTeam: selectedMatch.radiantTeam,
              direTeam: selectedMatch.direTeam,
              tournament: selectedMatch.tournament,
            })
            setCopyFeedback("link")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
        />
      )}
    </div>
  )
}

export default App

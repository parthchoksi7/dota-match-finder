import { useState, useEffect, useCallback, useRef } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import LatestMatches from "./components/LatestMatches"
import UpcomingMatches from "./components/UpcomingMatches"
import MatchDrawer from "./components/MatchDrawer"
import XPostsModal from "./components/XPostsModal"
import RedditPostsModal from "./components/RedditPostsModal"
import TournamentHub from "./components/TournamentHub"
import SearchSuggestions, { addRecentSearch } from "./components/SearchSuggestions"
import MyTeamsSection from "./components/MyTeamsSection"
import ManageTeamsModal from "./components/ManageTeamsModal"
import { fetchProMatches, findTwitchVod, fetchMatchStreams, fetchMatchSummary, fetchGrandFinalMatchIds, VOD_CHANNEL_LABELS } from "./api"
import SiteHeader from "./components/SiteHeader"
import { formatDuration, getFollowedTeams, setFollowedTeams, trackEvent, getSeriesWins } from "./utils"

const SUMMARY_CACHE_KEY = "dota-match-finder-summaries"

function getSummaryFromCache(matchId) {
  if (typeof window === "undefined" || !matchId) return null
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY)
    if (!raw) return null
    const map = JSON.parse(raw)
    return map[matchId] ?? null
  } catch {
    return null
  }
}

function setSummaryInCache(matchId, text) {
  if (typeof window === "undefined" || !matchId || typeof text !== "string") return
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY) || "{}"
    const map = JSON.parse(raw)
    map[matchId] = text
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(map))
  } catch (_) {}
}

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

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [nextMatchId, setNextMatchId] = useState(null)
  const [grandFinalMatchIds, setGrandFinalMatchIds] = useState(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [matches, setMatches] = useState([])
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

  function handleToggleFollow(teamName) {
    setFollowedTeamsState(prev => {
      const isFollowed = prev.includes(teamName)
      const next = isFollowed ? prev.filter(t => t !== teamName) : [...prev, teamName]
      setFollowedTeams(next)
      return next
    })
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

  // Read ?q= param from URL so "Find VODs" links from tournament detail pages work
  const initialSearchQuery = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("q") || ""
    : ""

  useEffect(() => {
    loadMatches()
    fetchGrandFinalMatchIds().then(ids => setGrandFinalMatchIds(new Set(ids)))
  }, [loadMatches])

  useEffect(() => {
    if (!initialLoading && initialSearchQuery) {
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

    // Track when someone lands via a shared match link
    trackEvent("shared_match_open", { matchId, source: window.location.pathname.startsWith("/match/") ? "path" : "hash" })

    // Try to find in loaded matches first
    const found = allMatches.find(m => m.id === matchId)
    if (found) {
      handleSelectMatch(found)
      return
    }

    // Fallback: fetch directly from OpenDota
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
      setAllMatches(prev => [...prev, ...newMatches])
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
    setMatches([])
    setSelectedMatch(null)
    setError(null)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  async function handleSelectMatch(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(false)

    // Unplayed game slot — show empty state drawer without URL update or VOD fetch
    if (match.unplayed) {
      setSelectedMatch(match)
      return
    }

    // Update URL to shareable slug URL for SEO
    window.history.replaceState(null, "", "/match/" + getMatchSlug(match))

    trackEvent("match_click", {
      matchId: match.id,
      radiantTeam: match.radiantTeam,
      direTeam: match.direTeam,
      tournament: match.tournament,
    })

    if (match.seriesId && !match._skipExpand) setExpandedSeriesId(String(match.seriesId))
    setSelectedMatch({ ...match, loadingVod: true })

    // Fetch streams for all games in the series so we can check consistency.
    // If all games agree on the same channel, trust it. If they disagree, fall back
    // to group search which shows all channels that were online at that time.
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
    // Return to homepage cleanly
    window.history.replaceState(null, "", "/")
    setTimeout(() => {
      if (targetSeriesId) {
        const el = document.querySelector(`[data-series-id="${targetSeriesId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
      }
      searchInputRef.current?.focus({ preventScroll: true })
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

  // Compute search results live from allMatches so load more updates results automatically
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

  // Compute game number within series for each match
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

  // Build the shareable slug URL for SEO and sharing
  function getShareUrl(match) {
    if (typeof window === "undefined") return ""
    return window.location.origin + "/match/" + getMatchSlug(match)
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col overflow-x-hidden">
      <SiteHeader
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

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full">
        <SearchBar
          ref={searchInputRef}
          onSearch={handleSearch}
          loading={loading}
          initialLoadComplete={!initialLoading}
          onClearSearch={handleClearSearch}
          disabled={initialLoading}
          errorId={error ? "app-error" : undefined}
          initialQuery={initialSearchQuery}
        />

        {!initialLoading && !searched && (
          <SearchSuggestions allMatches={allMatches} onSearch={handleSuggestionSelect} />
        )}

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

        {error && (
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 py-6 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded px-4"
            role="alert"
            id="app-error"
          >
            <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
              {error}
            </span>
            <button
              type="button"
              onClick={loadMatches}
              className="focus-ring px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!initialLoading && searched && (
          <>
            <UpcomingMatches searchQuery={searchQuery} onSelectMatchId={handleSelectMatchId} spoilerFree={spoilerFree} />
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
              onSelect={handleSelectMatch}
              onDraftPosts={isOwner ? handleDraftPosts : undefined}
              onDraftRedditPosts={isOwner ? handleDraftRedditPosts : undefined}
              loading={loading}
              onClearSearch={handleClearSearch}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={handleToggleFollow}
              expandedSeriesId={expandedSeriesId}
            />
          </>
        )}

        {!initialLoading && !searched && !error && (
          <div className="flex flex-col gap-6">
            <TournamentHub spoilerFree={spoilerFree} />
            <UpcomingMatches searchQuery={searchQuery} onSelectMatchId={handleSelectMatchId} spoilerFree={spoilerFree} />
            <MyTeamsSection
              matches={allMatches}
              followedTeams={followedTeams}
              onSelectMatch={handleSelectMatch}
              onDraftPosts={isOwner ? handleDraftPosts : undefined}
              onDraftRedditPosts={isOwner ? handleDraftRedditPosts : undefined}
              onManageTeams={() => setManageTeamsOpen(true)}
              onToggleFollow={handleToggleFollow}
              spoilerFree={spoilerFree}
              expandedSeriesId={expandedSeriesId}
              grandFinalMatchIds={grandFinalMatchIds}
            />
            <LatestMatches
              matches={allMatches}
              onSelectMatch={handleSelectMatch}
              onDraftPosts={isOwner ? handleDraftPosts : undefined}
              onDraftRedditPosts={isOwner ? handleDraftRedditPosts : undefined}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={handleToggleFollow}
              expandedSeriesId={expandedSeriesId}
              grandFinalMatchIds={grandFinalMatchIds}
            />
          </div>
        )}

        {nextMatchId && !initialLoading && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="focus-ring py-3 text-sm font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-800 rounded transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more matches"}
          </button>
        )}

        {!initialLoading && !error && (
          <p className="text-xs text-gray-500 dark:text-gray-600 text-center">
            Search above to find more matches by team or tournament
          </p>
        )}
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/80 px-4 sm:px-6 py-4 text-center">
        <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest flex flex-col sm:flex-row sm:justify-center sm:gap-1 items-center">
          <span>Spectate Esports</span>
          <span className="hidden sm:inline"> · </span>
          <span>Powered by OpenDota + Twitch</span>
          <span className="hidden sm:inline"> · </span>
          <span>Data updates every few minutes</span>
          <span className="hidden sm:inline"> · </span>
          <a href="/about" className="hover:text-gray-300 transition-colors">
            About
          </a>
          <span className="hidden sm:inline"> · </span>
          <a href="/release-notes" className="hover:text-gray-300 transition-colors">
            What's New
          </a>
        </p>
      </footer>

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

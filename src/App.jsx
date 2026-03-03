import { useState, useEffect, useCallback, useRef } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import LatestMatches from "./components/LatestMatches"
import MatchDrawer from "./components/MatchDrawer"
import { fetchProMatches, findTwitchVod, fetchMatchSummary, VOD_CHANNEL_LABELS } from "./api"
import { track } from '@vercel/analytics'


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

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [nextMatchId, setNextMatchId] = useState(null)
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
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem("theme")
      if (stored === "light" || stored === "dark") return stored
    }
    return "dark"
  })
  const [seriesFilter, setSeriesFilter] = useState("all")
  const [copyFeedback, setCopyFeedback] = useState(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem("theme", theme)
    }
  }, [theme])

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

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  // Handle share URL hash on load
  useEffect(() => {
    if (initialLoading) return
    const hash = window.location.hash
    const matchId = hash?.replace("#match-", "")
    if (!matchId || matchId === window.location.hash) return

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
    const q = query.trim().toLowerCase()
    setSearchQuery(q)
    setTimeout(() => {
      setLoading(false)
      setSearched(true)
    }, 300)
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
  // Update URL for tracking
  window.history.replaceState(null, "", "#match-" + match.id)
  
  // Track the click
  track('match_click', {
    matchId: match.id,
    radiantTeam: match.radiantTeam,
    direTeam: match.direTeam,
    tournament: match.tournament
  })

  setSummary(null)
  setSummaryMatchId(null)
  setSummaryError(null)
  setSummaryErrorMatchId(null)
  setSummaryLoading(false)
  setSelectedMatch({ ...match, loadingVod: true })
  const vod = await findTwitchVod(match.startTime)
  setSelectedMatch({
    ...match,
    loadingVod: false,
    url: vod?.url || null,
    channel: vod?.channel || null,
    allVods: vod?.allVods || []
  })
}

  async function handleSummarize(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(true)
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
    setSelectedMatch(null)
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setCachedSummaryForSelected(null)
    setCopyFeedback(null)
    window.history.replaceState(null, "", window.location.pathname)
    setTimeout(() => {
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
  const searchResults = searched && searchQuery
    ? allMatches.filter(m =>
        m.radiantTeam.toLowerCase().includes(searchQuery) ||
        m.direTeam.toLowerCase().includes(searchQuery) ||
        m.tournament.toLowerCase().includes(searchQuery)
      )
    : allMatches

  const filteredMatches = seriesFilter === "all"
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
    ids.slice().reverse().forEach((id, i) => {
      matchGameNumbers[id] = i + 1
    })
  })

  const strafeHref = "https://www.strafe.com/calendar/dota2/"
  const liquipediaHref = "https://liquipedia.net/dota2/Liquipedia:Upcoming_and_ongoing_matches"
  const twitchSearchHref = "https://www.twitch.tv/search?term=dota%202"

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white truncate">
            Spectate <span className="text-red-500">Esports</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest mt-0.5">
            Pro esports — direct VOD links
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-700 uppercase tracking-widest hidden md:block">
            Powered by OpenDota + Twitch
          </div>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="focus-ring px-3 py-2 rounded border border-gray-300 dark:border-gray-700 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full">
        <SearchBar
          ref={searchInputRef}
          onSearch={handleSearch}
          loading={loading}
          initialLoadComplete={!initialLoading}
          onClearSearch={handleClearSearch}
          disabled={initialLoading}
          errorId={error ? "app-error" : undefined}
        />

        {initialLoading && (
          <div className="border border-gray-200 dark:border-gray-800 px-6 py-12 text-center rounded" aria-live="polite" aria-busy="true">
            <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-red-500 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest mt-4">Loading matches...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-6 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded px-4" role="alert" id="app-error">
            <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">{error}</span>
            <button type="button" onClick={loadMatches} className="focus-ring px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors">
              Retry
            </button>
          </div>
        )}

        {!initialLoading && searched && (
          <>
            {filteredMatches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-widest">Filter:</span>
                {["all", "0", "1", "2"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSeriesFilter(value)}
                    className={"focus-ring px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors " + (
                      seriesFilter === value
                        ? "bg-red-600 border-red-600 text-white"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
                    )}
                  >
                    {value === "all" ? "All" : value === "0" ? "BO1" : value === "1" ? "BO3" : "BO5"}
                  </button>
                ))}
              </div>
            )}
            <MatchList
              matches={filteredMatches}
              onSelect={handleSelectMatch}
              loading={loading}
              onClearSearch={handleClearSearch}
            />
          </>
        )}

        {!initialLoading && !searched && !error && (
          <div className="flex flex-col gap-6">
            <section className="border border-gray-200 dark:border-gray-800 rounded p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-900/30" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-2">
                Upcoming matches
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Schedules and countdowns for pro Dota 2 matches.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href={strafeHref} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
                  Strafe calendar
                </a>
                <a href={liquipediaHref} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
                  Liquipedia
                </a>
              </div>
            </section>

            <LatestMatches
              matches={allMatches}
              onSelectMatch={handleSelectMatch}
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
        <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest flex flex-col sm:flex-row sm:justify-center sm:gap-1">
          <a href="/about.html" className="hover:text-gray-400 dark:hover:text-gray-400 transition-colors">
  About
</a>
          <span>Spectate Esports</span>
          <span className="hidden sm:inline"> · </span>
          <span>Powered by OpenDota + Twitch</span>
          <span className="hidden sm:inline"> · </span>
          <span>Data updates every few minutes</span>
        </p>
      </footer>

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
          onCopyVod={() => {
            navigator.clipboard?.writeText(selectedMatch.url)
            setCopyFeedback("vod")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
          onCopyLink={() => {
            const url = window.location.origin + window.location.pathname + "#match-" + selectedMatch.id
            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "#match-" + selectedMatch.id)
            setCopyFeedback("link")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
        />
      )}
    </div>
  )
}

export default App

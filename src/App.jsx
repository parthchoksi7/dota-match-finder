import { useState, useEffect, useCallback, useRef } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import LatestMatches from "./components/LatestMatches"
import { fetchProMatches, findTwitchVod, fetchMatchSummary } from "./api"

const CHANNELS = ["esl_dota2", "dota2ti", "beyond_the_summit", "pgldota2"]
const CHANNEL_LABELS = { esl_dota2: "ESL", dota2ti: "TI", beyond_the_summit: "BTS", pgldota2: "PGL" }

function WatchButton({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 transition-colors rounded min-h-[44px] items-center"
    >
      Watch on Twitch
    </a>
  )
}

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [matches, setMatches] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [vodChannel, setVodChannel] = useState(null)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem("theme")
      if (stored === "light" || stored === "dark") return stored
    }
    return "dark"
  })
  const [seriesFilter, setSeriesFilter] = useState("all")
  const searchInputRef = useRef(null)
  const panelRef = useRef(null)

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
      .then((data) => {
        setAllMatches(data)
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

  function handleSearch(query) {
    setLoading(true)
    setSelectedMatch(null)
    const q = query.trim().toLowerCase()
    setTimeout(() => {
      const filtered = allMatches.filter(
        (m) =>
          m.radiantTeam.toLowerCase().includes(q) ||
          m.direTeam.toLowerCase().includes(q) ||
          m.tournament.toLowerCase().includes(q)
      )
      setMatches(filtered)
      setLoading(false)
      setSearched(true)
    }, 300)
  }

  function handleClearSearch() {
    setSearched(false)
    setMatches([])
    setSelectedMatch(null)
    setError(null)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  async function handleSelectMatch(match) {
    setSelectedMatch({ ...match, loadingVod: true })
    setVodChannel(null)
    let vod = null
    for (const channel of CHANNELS) {
      setVodChannel(channel)
      vod = await findTwitchVod(channel, match.startTime)
      if (vod) break
    }
    setSelectedMatch({ ...match, loadingVod: false, ...vod })
    setVodChannel(null)
  }

  async function handleSummarize(match) {
    setSummary(null)
    setSummaryLoading(true)
    try {
      const result = await fetchMatchSummary(match.id)
      setSummary(result)
    } finally {
      setSummaryLoading(false)
    }
  }

  function dismissPanel() {
    setSelectedMatch(null)
    setSummary(null)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (!selectedMatch) return
    function onKeyDown(e) {
      if (e.key === "Escape") dismissPanel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedMatch])

  const filteredMatches =
    seriesFilter === "all"
      ? matches
      : matches.filter((m) => String(m.seriesType) === seriesFilter)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white truncate">
            Dota <span className="text-red-500">Match</span> Finder
          </h1>
          <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest mt-0.5">
            Pro matches — direct VOD links
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
          <div
            className="border border-gray-200 dark:border-gray-800 px-6 py-12 text-center rounded"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-red-500 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest mt-4">
              Loading matches…
            </p>
          </div>
        )}

        {error && (
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 py-6 border border-red-900/50 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded px-4"
            role="alert"
            aria-live="assertive"
            id="app-error"
          >
            <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">{error}</span>
            <button
              type="button"
              onClick={loadMatches}
              className="focus-ring px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {selectedMatch && !initialLoading && (
          <div
            ref={panelRef}
            className="sticky top-0 z-10 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg dark:shadow-none rounded"
            role="region"
            aria-label="Selected match"
          >
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold">
                Now Watching
              </span>
              <button
                type="button"
                onClick={dismissPanel}
                className="focus-ring text-xs text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400 uppercase tracking-wider py-2 px-1"
                aria-label="Dismiss panel"
              >
                Dismiss ×
              </button>
            </div>
            <div className="px-4 py-4">
              <p className="font-display text-lg font-bold uppercase tracking-wide">
                {selectedMatch.radiantTeam}
                <span className="text-gray-500 dark:text-gray-600 mx-2">vs</span>
                {selectedMatch.direTeam}
              </p>
              <p className="text-gray-500 dark:text-gray-500 text-xs uppercase tracking-widest mt-1">
                {selectedMatch.tournament} · {selectedMatch.date} · {selectedMatch.duration}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {selectedMatch.loadingVod && (
                  <span className="text-xs text-amber-600 dark:text-yellow-500 uppercase tracking-widest animate-pulse" aria-live="polite">
                    {vodChannel ? `Checking ${CHANNEL_LABELS[vodChannel] || vodChannel}…` : "Finding VOD…"}
                  </span>
                )}
                {!selectedMatch.loadingVod && selectedMatch.url && (
                  <>
                    <WatchButton url={selectedMatch.url} />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedMatch.url)
                      }}
                      className="focus-ring px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded"
                    >
                      Copy VOD link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}${window.location.pathname}#match-${selectedMatch.id}`
                        navigator.clipboard?.writeText(url)
                      }}
                      className="focus-ring px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded"
                    >
                      Share match link
                    </button>
                  </>
                )}
                {!selectedMatch.loadingVod && !selectedMatch.url && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 dark:text-gray-500 uppercase tracking-widest">
                      No VOD found
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-600 max-w-md">
                      VOD may not be published yet or wasn’t streamed on supported channels (ESL, BTS, PGL, etc.). Check back later or search on Twitch.
                    </p>
                    <a
                      href="https://www.twitch.tv/search?term=dota%202"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring inline-block mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider"
                    >
                      Search Twitch →
                    </a>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => handleSummarize(selectedMatch)}
                  disabled={summaryLoading}
                  className="focus-ring px-4 py-2 min-h-[44px] bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-gray-200 dark:disabled:hover:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest transition-colors border border-gray-300 dark:border-gray-700 rounded"
                >
                  {summaryLoading ? "Generating summary…" : "AI Match Summary"}
                </button>
                {summaryLoading && (
                  <div className="mt-4 h-20 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" aria-hidden="true" />
                )}
                {summary && (
                  <div className="mt-4 text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {summary}
                  </div>
                )}
              </div>
            </div>
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
                    className={`focus-ring px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors ${
                      seriesFilter === value
                        ? "bg-red-600 border-red-600 text-white"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
                    }`}
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
            <section
              className="border border-gray-200 dark:border-gray-800 rounded p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-900/30"
              aria-labelledby="upcoming-heading"
            >
              <h2 id="upcoming-heading" className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-2">
                Upcoming matches
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Schedules and countdowns for pro Dota 2 matches.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://www.strafe.com/calendar/dota2/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  Strafe calendar →
                </a>
                <a
                  href="https://liquipedia.net/dota2/Liquipedia:Upcoming_and_ongoing_matches"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  Liquipedia →
                </a>
              </div>
            </section>

            <LatestMatches
              matches={allMatches.slice(0, 10)}
              onSelectMatch={handleSelectMatch}
            />

            <p className="text-xs text-gray-500 dark:text-gray-600 text-center">
              Search above to find more matches by team or tournament
            </p>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/80 px-4 sm:px-6 py-4 text-center">
        <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest flex flex-col sm:flex-row sm:justify-center sm:gap-1">
          <span>Built by Parth</span>
          <span className="hidden sm:inline"> · </span>
          <span>Powered by OpenDota + Twitch</span>
          <span className="hidden sm:inline"> · </span>
          <span>Data updates every few minutes</span>
        </p>
      </footer>
    </div>
  )
}

export default App

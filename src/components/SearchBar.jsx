import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react"

const POPULAR = [
  { label: "Team Liquid", type: "team" },
  { label: "OG", type: "team" },
  { label: "Tundra", type: "team" },
  { label: "DreamLeague", type: "tournament" },
  { label: "ESL", type: "tournament" },
]
const RECENT_KEY = "dota-match-finder-recent"
const MAX_RECENT = 5

function SearchBar(
  { onSearch, loading, initialLoadComplete, onClearSearch, disabled, errorId },
  ref
) {
  const [query, setQuery] = useState("")
  const [searchType, setSearchType] = useState("team")
  const [recent, setRecent] = useState([])
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem(RECENT_KEY)
        if (raw) setRecent(JSON.parse(raw))
      } catch (_) {}
    }
  }, [])

  useEffect(() => {
    if (initialLoadComplete) {
      inputRef.current?.focus()
    }
  }, [initialLoadComplete])

  function saveRecent(term, type) {
    const entry = { term: term.trim(), type }
    setRecent((prev) => {
      const next = [entry, ...prev.filter((r) => !(r.term === entry.term && r.type === entry.type))].slice(0, MAX_RECENT)
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(next))
        } catch (_) {}
      }
      return next
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) {
      saveRecent(q, searchType)
      onSearch(q, searchType)
    }
  }

  function handlePopularClick(item) {
    setQuery(item.label)
    setSearchType(item.type)
    saveRecent(item.label, item.type)
    onSearch(item.label, item.type)
    inputRef.current?.focus()
  }

  function handleRecentClick(item) {
    setQuery(item.term)
    setSearchType(item.type)
    onSearch(item.term, item.type)
    inputRef.current?.focus()
  }

  function handleClear() {
    setQuery("")
    onClearSearch?.()
    inputRef.current?.focus()
  }

  return (
    <div className="w-full">
      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => setSearchType("team")}
          className={`focus-ring px-4 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs font-semibold uppercase tracking-widest border transition-all rounded ${
            searchType === "team"
              ? "bg-red-600 border-red-600 text-white"
              : "bg-transparent border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500"
          }`}
        >
          Team / Player
        </button>
        <button
          type="button"
          onClick={() => setSearchType("tournament")}
          className={`focus-ring px-4 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs font-semibold uppercase tracking-widest border transition-all rounded ${
            searchType === "tournament"
              ? "bg-red-600 border-red-600 text-white"
              : "bg-transparent border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500"
          }`}
        >
          Tournament
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2" aria-describedby={errorId || undefined}>
        <label htmlFor="search-input" className="sr-only">
          Search by team or tournament
        </label>
        <div className="flex-1 relative">
          <input
            id="search-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchType === "team" ? "e.g. Team Liquid, Tundra…" : "e.g. DreamLeague, ESL…"}
            disabled={disabled}
            className="focus-ring w-full px-4 py-3 min-h-[44px] bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-500 dark:placeholder-gray-600 rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-invalid={undefined}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded"
              aria-label="Clear search"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || disabled || !query.trim()}
          className="focus-ring px-6 py-3 min-h-[44px] bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-red-900/50 dark:disabled:bg-red-950 text-white text-sm font-semibold uppercase tracking-wider transition-colors rounded"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {(recent.length > 0 || POPULAR.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {recent.length > 0 && (
            <>
              <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-wider">Recent:</span>
              {recent.slice(0, 3).map((item, i) => (
                <button
                  key={`${item.term}-${item.type}-${i}`}
                  type="button"
                  onClick={() => handleRecentClick(item)}
                  className="focus-ring px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  {item.term}
                </button>
              ))}
              <span className="text-gray-400 dark:text-gray-600">·</span>
            </>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-wider">Popular:</span>
          {POPULAR.map((item) => (
            <button
              key={`${item.label}-${item.type}`}
              type="button"
              onClick={() => handlePopularClick(item)}
              className="focus-ring px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default forwardRef(SearchBar)

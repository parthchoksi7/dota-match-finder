import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import { trackEvent } from "../utils"

function SearchBar(
  { onSearch, loading, initialLoadComplete, onClearSearch, disabled, errorId, initialQuery },
  ref
) {
  const [query, setQuery] = useState(initialQuery || "")
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => {
    if (initialLoadComplete) {
      inputRef.current?.focus()
    }
  }, [initialLoadComplete])

  function handleSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) {
      trackEvent("search", { query: q })
      onSearch(q)
    }
  }

  function handleClear() {
    setQuery("")
    trackEvent("search_clear", {})
    onClearSearch?.()
    inputRef.current?.focus()
  }

  return (
    <div className="w-full">
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
            placeholder="Search teams or tournaments…"
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
    </div>
  )
}

export default forwardRef(SearchBar)

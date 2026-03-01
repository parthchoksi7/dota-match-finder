import MatchCard from "./MatchCard"
import { useState } from "react"
import { groupIntoSeries } from "../utils"

const INITIAL_SHOW = 10

function MatchList({ matches, onSelect, loading, onClearSearch }) {
  const [showCount, setShowCount] = useState(INITIAL_SHOW)

  if (loading) {
    return (
      <div className="text-center py-12" aria-live="polite" aria-busy="true">
        <div className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest animate-pulse">
          Searching…
        </div>
      </div>
    )
  }

  if (!matches || matches.length === 0) {
    return (
      <div
        className="text-center py-12 border border-gray-200 dark:border-gray-800 rounded"
        role="status"
        aria-live="polite"
      >
        <p className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest">
          No matches found
        </p>
        <p className="text-gray-500 dark:text-gray-600 text-xs mt-2">Try a different team or tournament name.</p>
        {onClearSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="focus-ring mt-4 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            Clear and try again
          </button>
        )}
      </div>
    )
  }

  const series = groupIntoSeries(matches)
  const totalGames = series.reduce((acc, s) => acc + s.games.length, 0)
  const visibleSeries = series.slice(0, showCount)
  const hasMore = series.length > showCount

  return (
    <div className="w-full flex flex-col gap-3">
      <p className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-widest" aria-live="polite">
        {series.length} series ({totalGames} games)
      </p>
      {visibleSeries.map((s) => (
        <MatchCard key={s.id} series={s} onSelectGame={onSelect} defaultExpanded={false} />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowCount((n) => n + INITIAL_SHOW)}
          className="focus-ring py-3 text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-800 rounded transition-colors"
        >
          Load more ({series.length - showCount} more)
        </button>
      )}
    </div>
  )
}

export default MatchList

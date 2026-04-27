import MatchCard from "./MatchCard"
import { groupIntoSeries } from "../utils"

function MatchList({ matches, onSelect, onDraftPosts, onDraftRedditPosts, loading, onClearSearch, spoilerFree = false, followedTeams, onToggleFollow, expandedSeriesId, selectedGameId }) {

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
      <div role="status" aria-live="polite" className="py-8 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
          Nothing matched.
        </p>
        {onClearSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="focus-ring mt-4 px-4 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider hover:border-gray-400 dark:hover:border-gray-600 rounded transition-colors"
          >
            Clear search
          </button>
        )}
      </div>
    )
  }

  const series = groupIntoSeries(matches)
  const totalGames = series.reduce((acc, s) => acc + s.games.length, 0)

  return (
    <div className="w-full flex flex-col gap-3">
      <p className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-widest" aria-live="polite">
        {series.length} series ({totalGames} games)
      </p>
      {series.map((s) => (
        <MatchCard key={s.id} series={s} onSelectGame={onSelect} onDraftPosts={onDraftPosts} onDraftRedditPosts={onDraftRedditPosts} defaultExpanded={false} spoilerFree={spoilerFree} followedTeams={followedTeams} onToggleFollow={onToggleFollow} expandedSeriesId={expandedSeriesId} selectedGameId={selectedGameId} />
      ))}
    </div>
  )
}

export default MatchList

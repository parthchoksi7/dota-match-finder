import { Fragment } from "react"
import { groupIntoSeries, isSeriesComplete } from "../utils"
import MatchCard from "./MatchCard"

function getDateLabel(unixSeconds) {
  if (!unixSeconds) return null
  const now = new Date()
  const d = new Date(unixSeconds * 1000)
  const todayStr = now.toDateString()
  const yestStr = new Date(now - 86400000).toDateString()
  if (d.toDateString() === todayStr) return "Today"
  if (d.toDateString() === yestStr) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getDayKey(unixSeconds) {
  if (!unixSeconds) return "unknown"
  const d = new Date(unixSeconds * 1000)
  return d.toDateString()
}

function LatestMatches({ matches, onSelectMatch, onDraftPosts, onDraftRedditPosts, spoilerFree = false, followedTeams, onToggleFollow, expandedSeriesId, grandFinalMatchIds = new Set(), error = null, onRetry }) {
  const allSeries = groupIntoSeries(matches || [])
  const completeSeries = allSeries.filter(isSeriesComplete)

  if (error) {
    return (
      <div className="w-full">
        <div className="flex items-center mb-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
            Latest results
          </h2>
        </div>
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded"
          role="alert"
        >
          <span className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
            Could not load past matches — OpenDota may be temporarily down
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (completeSeries.length === 0) return null

  return (
    <div className="w-full">
      <div className="flex items-center mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
          Latest results
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {completeSeries.map((s, i) => {
          const dateChanged = i === 0 || getDayKey(s.startTime) !== getDayKey(completeSeries[i - 1].startTime)
          return (
            <Fragment key={s.id}>
              {dateChanged && (
                <div className="flex items-center gap-3 px-1 pt-2 pb-1">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold shrink-0">
                    {getDateLabel(s.startTime)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                </div>
              )}
              <MatchCard
                series={s}
                onSelectGame={onSelectMatch}
                onDraftPosts={onDraftPosts}
                onDraftRedditPosts={onDraftRedditPosts}
                defaultExpanded={false}
                spoilerFree={spoilerFree}
                followedTeams={followedTeams}
                onToggleFollow={onToggleFollow}
                expandedSeriesId={expandedSeriesId}
                isGrandFinal={s.games.some(g => grandFinalMatchIds.has(g.id))}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )

}

export default LatestMatches

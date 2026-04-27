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

function LatestMatches({ matches, onSelectMatch, onDraftPosts, onDraftRedditPosts, spoilerFree = false, followedTeams, onToggleFollow, expandedSeriesId, selectedGameId, grandFinalMatchIds = new Set() }) {
  if (!matches || matches.length === 0) return null

  const allSeries = groupIntoSeries(matches)
  const completeSeries = allSeries.filter(isSeriesComplete)
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
                selectedGameId={selectedGameId}
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

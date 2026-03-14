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

function LatestMatches({ matches, onSelectMatch, onDraftPosts, spoilerFree = false, followedTeams, onToggleFollow }) {
  if (!matches || matches.length === 0) return null

  const allSeries = groupIntoSeries(matches)
  const completeSeries = allSeries.filter(isSeriesComplete)
  if (completeSeries.length === 0) return null

  return (
    <div className="w-full">
      <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden mb-3">
        <div className="px-4 sm:px-5 py-3.5 bg-gray-50 dark:bg-gray-900/60">
          <h2 className="text-sm uppercase tracking-widest text-gray-700 dark:text-gray-300 font-bold">
            Latest results
          </h2>
        </div>
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
                defaultExpanded={false}
                spoilerFree={spoilerFree}
                followedTeams={followedTeams}
                onToggleFollow={onToggleFollow}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )

}

export default LatestMatches

import { Fragment } from "react"
import { groupIntoSeries, isSeriesComplete } from "../utils"
import MatchCard from "./MatchCard"

function LatestMatches({ matches, onSelectMatch, spoilerFree = false }) {
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
          const tournamentChanged = i > 0 && s.tournament !== completeSeries[i - 1].tournament
          return (
            <Fragment key={s.id}>
              {tournamentChanged && (
                <div className="flex items-center gap-3 px-1 pt-2 pb-1">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                  <span className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold shrink-0">
                    {s.tournament}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                </div>
              )}
              <MatchCard
                series={s}
                onSelectGame={onSelectMatch}
                defaultExpanded={false}
                spoilerFree={spoilerFree}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )

}

export default LatestMatches

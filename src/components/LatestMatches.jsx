import { groupIntoSeries, isSeriesComplete } from "../utils"
import MatchCard from "./MatchCard"

function LatestMatches({ matches, onSelectMatch, spoilerFree = false }) {
  if (!matches || matches.length === 0) return null

  const allSeries = groupIntoSeries(matches)
  const completeSeries = allSeries.filter(isSeriesComplete)
  if (completeSeries.length === 0) return null

  return (
    <div className="w-full">
      <h2 className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-3">
        Latest results
      </h2>
      <div className="flex flex-col gap-3">
        {completeSeries.map((s) => (
          <MatchCard
            key={s.id}
            series={s}
            onSelectGame={onSelectMatch}
            defaultExpanded={false}
            spoilerFree={spoilerFree}
          />
        ))}
      </div>
    </div>
  )
}

export default LatestMatches

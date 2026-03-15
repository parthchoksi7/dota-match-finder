import { getRegionSummary, getRegionColor } from '../utils/regions'

export default function RegionBreakdown({ teams }) {
  const summary = getRegionSummary(teams)
  if (summary.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {summary.map(({ region, count }) => (
        <span
          key={region}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${getRegionColor(region)}`}
        >
          {region}
          <span className="opacity-70">{count}</span>
        </span>
      ))}
    </div>
  )
}

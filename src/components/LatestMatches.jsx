import { formatDuration, formatRelativeTime } from "../utils"

function LatestMatches({ matches, onSelectMatch }) {
  if (!matches || matches.length === 0) return null

  return (
    <div className="w-full">
      <h2 className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-3">
        Latest results
      </h2>
      <ul className="border border-gray-200 dark:border-gray-800 rounded divide-y divide-gray-200 dark:divide-gray-800">
        {matches.map((match) => (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => onSelectMatch(match)}
              className="focus-ring w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-left group"
            >
              <span className="font-display text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-white">
                {match.radiantTeam}
                <span className="text-gray-400 dark:text-gray-500 mx-1.5">vs</span>
                {match.direTeam}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {match.tournament}
                {match.startTime != null && formatRelativeTime(match.startTime) ? (
                  <> · <span title={match.date}>{formatRelativeTime(match.startTime)}</span></>
                ) : (
                  <> · {match.date}</>
                )}
                {" · "}{formatDuration(match.duration)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-600 group-hover:text-purple-500 dark:group-hover:text-purple-400 uppercase tracking-wider inline-flex items-center gap-1 w-full sm:w-auto justify-end">
                <span aria-hidden>▶</span> Watch VOD
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default LatestMatches

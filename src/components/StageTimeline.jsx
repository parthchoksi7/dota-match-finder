function formatShortDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isActive(stage) {
  if (!stage.beginAt || !stage.endAt) return false
  const now = new Date()
  return new Date(stage.beginAt) <= now && now <= new Date(stage.endAt)
}

function isUpcoming(stage) {
  if (!stage.beginAt) return false
  return new Date(stage.beginAt) > new Date()
}

export default function StageTimeline({ stages }) {
  if (!stages || stages.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-max pb-1">
        {stages.map((stage, i) => {
          const active = isActive(stage)
          const upcoming = isUpcoming(stage)
          const startDate = formatShortDate(stage.beginAt)
          const endDate = formatShortDate(stage.endAt)

          return (
            <div key={stage.id} className="flex items-center gap-2">
              {i > 0 && (
                <div className="w-4 h-px bg-gray-300 dark:bg-gray-700 flex-shrink-0" />
              )}
              <div
                className={[
                  'px-3 py-2 rounded border text-center min-w-[100px]',
                  active
                    ? 'border-red-500 bg-red-500/5'
                    : upcoming
                    ? 'border-blue-400/50 dark:border-blue-600/50 bg-blue-500/5'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
                ].join(' ')}
              >
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block flex-shrink-0" />
                  )}
                  <p className={[
                    'text-xs font-bold uppercase tracking-wide',
                    active ? 'text-red-500' : 'text-gray-700 dark:text-gray-300',
                  ].join(' ')}>
                    {stage.name}
                  </p>
                </div>
                {(startDate || endDate) && (
                  <p className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                    {startDate && endDate ? `${startDate} - ${endDate}` : startDate || endDate}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

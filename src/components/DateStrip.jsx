import { trackEvent } from '../utils'

function DateStrip({ dates, activeDate, onChange, onLoadEarlier, loadingEarlier }) {
  if (!dates || dates.length === 0) return null

  const currentIndex = dates.findIndex(d => d.key === activeDate)
  const currentLabel = dates[currentIndex]?.label ?? activeDate
  const hasPrev = currentIndex > 0 || !!onLoadEarlier
  const hasNext = currentIndex < dates.length - 1

  function handlePrev() {
    if (currentIndex > 0) {
      const prev = dates[currentIndex - 1]
      trackEvent('date_nav_prev', { date: prev.label })
      onChange(prev.key)
    } else if (onLoadEarlier) {
      trackEvent('load_earlier_click', {})
      onLoadEarlier()
    }
  }

  function handleNext() {
    if (!hasNext) return
    const next = dates[currentIndex + 1]
    trackEvent('date_nav_next', { date: next.label })
    onChange(next.key)
  }

  return (
    <div className="flex items-center justify-between px-3 min-h-[44px] border-b border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasPrev || loadingEarlier}
        aria-label="Previous day"
        className="p-1.5 -ml-1 text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {loadingEarlier ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        )}
      </button>

      <span className="text-xs font-bold uppercase tracking-widest text-gray-900 dark:text-white select-none">
        {currentLabel}
      </span>

      <button
        type="button"
        onClick={handleNext}
        disabled={!hasNext}
        aria-label="Next day"
        className="p-1.5 -mr-1 text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

export default DateStrip

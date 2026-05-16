import { useEffect, useRef } from 'react'
import { trackEvent } from '../utils'

function DateStrip({ dates, activeDate, onChange, onLoadEarlier, loadingEarlier }) {
  if (!dates || dates.length === 0) return null

  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    }
  }, [])

  return (
    <div
      className="flex items-stretch bg-gray-100 dark:bg-gray-900"
      role="tablist"
      aria-label="Browse matches by date"
    >
      {/* Load earlier — fixed outside the scrollable pill track so new pills never shift this button */}
      {onLoadEarlier && (
        <button
          type="button"
          disabled={loadingEarlier}
          onClick={() => {
            trackEvent('load_earlier_click', {})
            onLoadEarlier()
          }}
          aria-label="Load earlier dates"
          className="flex-shrink-0 flex items-center justify-center w-8 border-r border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 disabled:opacity-30 transition-colors duration-150"
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="w-3.5 h-3.5" aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Scrollable pill track */}
      <div
        className="flex flex-1 overflow-x-auto gap-1 p-1.5 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {dates.map(({ key, label }) => (
          <button
            key={key}
            ref={activeDate === key ? activeRef : null}
            type="button"
            role="tab"
            aria-selected={activeDate === key}
            onClick={() => {
              trackEvent('date_strip_click', { date: label })
              onChange(key)
            }}
            className={`flex-shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap rounded-full transition-all duration-150 ${
              activeDate === key
                ? 'bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default DateStrip

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
      className="flex overflow-x-auto gap-1 p-1.5 bg-gray-100 dark:bg-gray-900 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
      role="tablist"
      aria-label="Browse matches by date"
    >
      {onLoadEarlier && (
        <button
          type="button"
          disabled={loadingEarlier}
          onClick={() => {
            trackEvent('load_earlier_click', {})
            onLoadEarlier()
          }}
          className="flex-shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 disabled:opacity-40 transition-colors rounded-full"
        >
          {loadingEarlier ? '...' : '← More'}
        </button>
      )}

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
  )
}

export default DateStrip

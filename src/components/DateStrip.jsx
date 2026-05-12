import { useEffect, useRef } from 'react'
import { trackEvent } from '../utils'

function DateStrip({ dates, activeDate, onChange, onLoadEarlier, loadingEarlier }) {
  if (!dates || dates.length <= 1) return null

  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    }
  }, []) // Auto-scroll active pill into view on mount only

  return (
    <div
      className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-800 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
      role="tablist"
      aria-label="Browse results by date"
    >
      {/* Load earlier — leftmost pill */}
      {onLoadEarlier && (
        <button
          type="button"
          disabled={loadingEarlier}
          onClick={() => {
            trackEvent('load_earlier_click', {})
            onLoadEarlier()
          }}
          className="flex-shrink-0 px-4 min-h-[44px] text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 border-transparent text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
        >
          {loadingEarlier ? '...' : '← Earlier'}
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
          className={`flex-shrink-0 px-4 min-h-[44px] text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors duration-150 ${
            activeDate === key
              ? 'text-gray-900 dark:text-white border-red-500'
              : 'text-gray-500 dark:text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default DateStrip

import { useState, useRef, useCallback } from 'react'

const SIZE_CLASSES = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
}

function wikiUrl(displayName) {
  if (!displayName) return null
  return `https://dota2.fandom.com/wiki/${encodeURIComponent(displayName)}`
}

export default function ItemSlot({ itemId, itemNames, size = 'md', variant, edgePin = 'center' }) {
  const [imgError, setImgError] = useState(false)
  const [visible, setVisible] = useState(false)
  const showTimer = useRef(null)
  const hideTimer = useRef(null)

  const scheduleShow = useCallback(() => {
    clearTimeout(hideTimer.current)
    showTimer.current = setTimeout(() => setVisible(true), 120)
  }, [])

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 80)
  }, [])

  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md
  const item = itemId ? itemNames?.[itemId] : null
  const cdnKey = item?.key ?? null
  const displayName = item?.dname ?? null
  const isNeutral = variant === 'neutral'

  // Tooltip horizontal pin based on position in row
  const tooltipAlign =
    edgePin === 'left'  ? 'left-0'  :
    edgePin === 'right' ? 'right-0' :
    'left-1/2 -translate-x-1/2'

  if (!cdnKey || itemId === 0 || imgError) {
    return (
      <div
        className={`${sizeClass} rounded-sm flex-shrink-0 ${isNeutral ? 'bg-gray-800 ring-1 ring-amber-500/30' : 'bg-gray-200 dark:bg-gray-800'}`}
        aria-hidden="true"
      />
    )
  }

  const url = wikiUrl(displayName)

  return (
    <div
      className={`${sizeClass} relative flex-shrink-0`}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      <img
        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/${cdnKey}_lg.png`}
        alt={displayName ?? cdnKey}
        loading="lazy"
        className={`w-full h-full object-cover rounded-sm ${isNeutral ? 'ring-1 ring-amber-500/60' : ''}`}
        onError={() => setImgError(true)}
        tabIndex={0}
      />

      {/* Invisible hover bridge: prevents tooltip from closing as mouse travels from icon to tooltip */}
      {visible && (
        <div
          className="absolute bottom-full left-0 right-0 h-2"
          aria-hidden="true"
          onMouseEnter={scheduleShow}
          onMouseLeave={scheduleHide}
        />
      )}

      {visible && displayName && (
        <div
          role="tooltip"
          className={`absolute bottom-full mb-2 z-[9999] ${tooltipAlign}`}
          onMouseEnter={scheduleShow}
          onMouseLeave={scheduleHide}
        >
          <div className="bg-gray-900 border border-gray-700/60 rounded-md shadow-xl p-2 min-w-[120px] max-w-[180px]">
            <p className="text-xs font-semibold text-white whitespace-nowrap leading-tight">
              {displayName}
            </p>
            {isNeutral && (
              <p className="text-[10px] uppercase tracking-wide text-amber-500/80 font-medium mt-0.5">
                Neutral item
              </p>
            )}
            {url && (
              <>
                <div className="border-t border-gray-700/50 my-1.5" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${displayName} on Dota 2 Wiki (opens in new tab)`}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors leading-tight"
                >
                  <span>Dota 2 Wiki</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

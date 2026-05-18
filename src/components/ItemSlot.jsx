import { useState } from 'react'

const SIZE_CLASSES = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
}

export default function ItemSlot({ itemId, itemNames, size = 'md' }) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md
  const name = itemId ? itemNames?.[itemId] : null
  const displayName = name ? name.replace(/_/g, ' ') : null

  if (!displayName || itemId === 0 || imgError) {
    return (
      <div
        className={`${sizeClass} rounded-sm bg-gray-200 dark:bg-gray-800 flex-shrink-0`}
        aria-hidden="true"
      />
    )
  }

  return (
    // relative + group enables the CSS tooltip; no overflow-hidden so tooltip isn't clipped
    <div className={`${sizeClass} relative flex-shrink-0 group`}>
      <img
        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/${name}_lg.png`}
        alt={displayName}
        loading="lazy"
        className="w-full h-full object-cover rounded-sm"
        onError={() => setImgError(true)}
      />
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
        <span className="block bg-gray-900 dark:bg-gray-950 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
          {displayName}
        </span>
      </div>
    </div>
  )
}

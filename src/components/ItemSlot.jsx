import { useState } from 'react'
import { HoverCard, HoverCardTitle, WikiLink } from './FloatingTooltip'

const SIZE_CLASSES = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
}

export default function ItemSlot({ itemId, itemNames, size = 'md', variant, edgePin = 'center' }) {
  const [imgError, setImgError] = useState(false)

  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md
  const item = itemId ? itemNames?.[itemId] : null
  const cdnKey = item?.key ?? null
  const displayName = item?.dname ?? null
  const isNeutral = variant === 'neutral'

  if (!cdnKey || itemId === 0 || imgError) {
    return (
      <div
        className={`${sizeClass} rounded-sm flex-shrink-0 ${isNeutral ? 'bg-gray-800 ring-1 ring-amber-500/30' : 'bg-gray-200 dark:bg-gray-800'}`}
        aria-hidden="true"
      />
    )
  }

  return (
    <HoverCard
      align={edgePin}
      className={`${sizeClass} flex-shrink-0`}
      content={displayName && (
        <>
          <HoverCardTitle>{displayName}</HoverCardTitle>
          {isNeutral && (
            <p className="text-[10px] uppercase tracking-wide text-amber-500/80 font-medium mt-0.5">
              Neutral item
            </p>
          )}
          <WikiLink name={displayName} />
        </>
      )}
    >
      <img
        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/${cdnKey}_lg.png`}
        alt={displayName ?? cdnKey}
        loading="lazy"
        className={`w-full h-full object-cover rounded-sm ${isNeutral ? 'ring-1 ring-amber-500/60' : ''}`}
        onError={() => setImgError(true)}
        tabIndex={0}
      />
    </HoverCard>
  )
}

import { useState } from 'react'

const SIZE_CLASSES = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
}

export default function ItemSlot({ itemId, itemNames, size = 'md' }) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md
  const name = itemId ? itemNames?.[itemId] : null

  if (!name || itemId === 0 || imgError) {
    return (
      <div
        className={`${sizeClass} rounded-sm bg-gray-200 dark:bg-gray-800 flex-shrink-0`}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className={`${sizeClass} rounded-sm overflow-hidden flex-shrink-0`} title={name.replace(/_/g, ' ')}>
      <img
        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/${name}_lg.png`}
        alt={name.replace(/_/g, ' ')}
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setImgError(true)}
      />
    </div>
  )
}

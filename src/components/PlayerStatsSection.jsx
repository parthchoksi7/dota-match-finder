import { useEffect, useState } from 'react'
import { fetchHeroes } from '../api'
import ItemSlot from './ItemSlot'

function formatNetWorth(val) {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`
  return `${val}`
}

const AGHANIM_UPGRADES = [
  { buffId: 2,  key: 'ultimate_scepter', label: "Aghanim's Scepter" },
  { buffId: 12, key: 'aghanims_shard',   label: "Aghanim's Shard"   },
]

function ConsumedUpgrade({ itemKey, label }) {
  const [imgError, setImgError] = useState(false)
  if (imgError) return null
  return (
    <div className="w-6 h-6 relative flex-shrink-0 group">
      <img
        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/${itemKey}_lg.png`}
        alt={label}
        loading="lazy"
        className="w-full h-full object-cover rounded-sm opacity-90"
        onError={() => setImgError(true)}
      />
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
        <span className="block bg-gray-900 dark:bg-gray-950 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
          {label} (consumed)
        </span>
      </div>
    </div>
  )
}

function PlayerRow({ player, heroKey, heroName, itemNames, maxNetWorth, isRadiant }) {
  const barColor = isRadiant ? 'bg-green-500' : 'bg-red-500'
  const barWidth = maxNetWorth > 0 ? Math.round((player.netWorth / maxNetWorth) * 100) : 0
  const backpack = player.backpackItems || []
  const buffs = player.permanentBuffs || []
  const consumedUpgrades = AGHANIM_UPGRADES.filter(u => buffs.includes(u.buffId))
  const neutralItemId = player.neutralItem ?? 0
  const hasNeutral = neutralItemId !== 0

  return (
    <div className="space-y-1.5">
      {/* Hero icon (with CSS tooltip) + player name + networth */}
      <div className="flex items-center gap-2 min-w-0">
        {heroKey ? (
          <div className="relative flex-shrink-0 group">
            <img
              src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${heroKey}.png`}
              alt={heroName || heroKey}
              className="w-6 h-6 rounded-sm object-cover"
              loading="lazy"
            />
            {heroName && (
              <div className="pointer-events-none absolute bottom-full left-0 mb-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                <span className="block bg-gray-900 dark:bg-gray-950 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-lg max-w-[160px] truncate">
                  {heroName}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-sm flex-shrink-0 bg-gray-200 dark:bg-gray-800" aria-hidden="true" />
        )}
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1 min-w-0">
          {player.name || 'Unknown'}
        </span>
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0 ml-1">
          {formatNetWorth(player.netWorth)}
        </span>
      </div>

      {/* Main items | backpack | consumed upgrades · neutral */}
      <div className="flex items-center gap-0.5 ml-8">
        {player.items.map((itemId, i) => (
          <ItemSlot key={i} itemId={itemId} itemNames={itemNames} size="md" edgePin={i < 2 ? 'left' : 'center'} />
        ))}
        {backpack.length > 0 && (
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5 flex-shrink-0" aria-hidden="true" />
        )}
        {backpack.map((itemId, i) => (
          <ItemSlot key={`bp-${i}`} itemId={itemId} itemNames={itemNames} size="md" />
        ))}
        {consumedUpgrades.length > 0 && (
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5 flex-shrink-0" aria-hidden="true" />
        )}
        {consumedUpgrades.map(u => (
          <ConsumedUpgrade key={u.buffId} itemKey={u.key} label={u.label} />
        ))}
        {hasNeutral && (
          <>
            <span className="text-gray-600 dark:text-gray-600 mx-1 flex-shrink-0 text-xs select-none" aria-hidden="true">·</span>
            <ItemSlot
              itemId={neutralItemId}
              itemNames={itemNames}
              size="md"
              variant="neutral"
              edgePin="right"
            />
          </>
        )}
      </div>

      {/* Networth proportion bar */}
      <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-800 ml-8 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-300`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="space-y-1.5 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-sm bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
        <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 flex-1" />
        <div className="h-3 w-10 rounded bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-0.5 ml-8">
        {Array.from({ length: 6 }, (_, j) => (
          <div key={j} className="w-6 h-6 rounded-sm bg-gray-200 dark:bg-gray-800" />
        ))}
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-0.5" />
        {Array.from({ length: 3 }, (_, j) => (
          <div key={`bp-${j}`} className="w-6 h-6 rounded-sm bg-gray-200 dark:bg-gray-800" />
        ))}
      </div>
      <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-800 ml-8" />
    </div>
  )
}

function TeamGroup({ label, players, heroMap, itemNames, maxNetWorth, isRadiant, loading }) {
  const headerColor = isRadiant
    ? 'text-green-600 dark:text-green-500'
    : 'text-red-600 dark:text-red-500'

  return (
    <div className="space-y-3">
      <p className={`text-[10px] font-bold uppercase tracking-widest ${headerColor}`}>
        {label}
      </p>
      {loading
        ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
        : players.map((p, i) => (
            <PlayerRow
              key={i}
              player={p}
              heroKey={heroMap?.[p.heroId]?.key ?? null}
              heroName={heroMap?.[p.heroId]?.name ?? null}
              itemNames={itemNames}
              maxNetWorth={maxNetWorth}
              isRadiant={isRadiant}
            />
          ))}
    </div>
  )
}

export default function PlayerStatsSection({ players, itemNames, radiantName, direName, loading }) {
  const [heroMap, setHeroMap] = useState(null)

  useEffect(() => {
    fetchHeroes().then(setHeroMap).catch(() => {})
  }, [])

  const allPlayers = players || []
  const radiant = [...allPlayers.filter(p => p.isRadiant)].sort((a, b) => b.netWorth - a.netWorth)
  const dire = [...allPlayers.filter(p => !p.isRadiant)].sort((a, b) => b.netWorth - a.netWorth)
  const maxNetWorth = Math.max(...allPlayers.map(p => p.netWorth), 1)

  return (
    <div className="space-y-4">
      <TeamGroup
        label={radiantName || 'Radiant'}
        players={radiant}
        heroMap={heroMap}
        itemNames={itemNames || {}}
        maxNetWorth={maxNetWorth}
        isRadiant={true}
        loading={loading}
      />
      <div className="border-t border-gray-100 dark:border-gray-900 pt-4">
        <TeamGroup
          label={direName || 'Dire'}
          players={dire}
          heroMap={heroMap}
          itemNames={itemNames || {}}
          maxNetWorth={maxNetWorth}
          isRadiant={false}
          loading={loading}
        />
      </div>
    </div>
  )
}

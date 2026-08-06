import HeroIcon from './HeroIcon'
import ItemSlot from './ItemSlot'
import { RoshanSvg } from './GameIndicators'
import { HoverCard } from './FloatingTooltip'

// Valve-sourced live surfaces for a running game: Roshan status, a per-player telemetry board, the
// ban list, and a chronological event feed.
//
// SCOPE — why these and nothing else. Each renders a data point that had NO existing home in the
// shipped UI when this file was created. Everything a completed-match component already covers is
// deliberately left to that component rather than restyled here:
//   - the pick list -> SeriesLivePulse's DraftPickRow grid
// Team names, kill score, net-worth lead, clock, the net-worth graph, and standing towers/barracks
// (via DotaMinimap's richer *TowerState/*BarracksState props) also run through Valve now, but stay
// rendered by their existing components in `SeriesLivePulse.jsx` — this file adds only what those
// components genuinely couldn't show before. Field-level provenance:
// `.claude/specs/live-story-valve-data-audit.md`.
//
// Everything below is sourced from Valve's GetLiveLeagueGames. The only OpenDota-derived value in
// the whole component is the item id -> CDN key map (`itemNames`), which is patch-static reference
// data rather than match telemetry.

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const m = Math.floor(seconds / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function formatNetWorth(val) {
  if (!Number.isFinite(val)) return '—'
  return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val)
}

// ── Roshan ──────────────────────────────────────────────────────────────────
// `roshan_respawn_timer` is a direct field, not aegis-inferred. 0 means Roshan is UP right now.
// Valve does not report which team killed him, so no attribution is shown — an invented "Radiant
// took Roshan" would be a fabrication, and the absence is the honest state.
export function RoshanStatus({ respawnTimer }) {
  if (!Number.isFinite(respawnTimer)) return null
  const alive = respawnTimer <= 0
  const clock = formatClock(respawnTimer)

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded border border-amber-500/30 bg-amber-500/5">
      <span className="flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-3z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-900 dark:text-white">
          {alive ? 'Roshan is up' : 'Roshan respawning'}
        </p>
        <p className="text-[10px] text-gray-500 dark:text-gray-500 leading-snug">
          Killing team not reported by this feed
        </p>
      </div>
      {!alive && (
        <span className="flex-shrink-0 text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {clock}
        </span>
      )}
    </div>
  )
}

// ── Player board ────────────────────────────────────────────────────────────
// The ultimate ring is the cheapest genuinely-new signal in the whole audit: `ultimate_state` is
// an undocumented bitmask decoded empirically at 99.5% reliability, and nothing on the site
// currently exposes it from either pipeline.
function UltimateRing({ ultimate }) {
  if (!ultimate?.unlocked) return null
  const ready = ultimate.ready
  return (
    <span
      className={`pointer-events-none absolute -inset-0.5 rounded border-2 ${
        ready ? 'border-green-500' : 'border-dashed border-gray-400 dark:border-gray-600'
      }`}
      aria-hidden="true"
      title={ready ? 'Ultimate ready' : `Ultimate on cooldown${ultimate.cooldown ? ` — ${ultimate.cooldown}s` : ''}`}
    />
  )
}

function PlayerRow({ player, heroes, itemNames, maxNetWorth, side }) {
  const hero = heroes?.[player.heroId] || null
  const barPct = maxNetWorth > 0 && Number.isFinite(player.netWorth)
    ? Math.round((player.netWorth / maxNetWorth) * 100)
    : 0
  const kda = [player.kills, player.deaths, player.assists]
  const hasKda = kda.every(v => Number.isFinite(v))

  return (
    <div className="py-2 border-t border-gray-100 dark:border-gray-900 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="relative flex-shrink-0">
          <HeroIcon
            heroKey={hero?.key ?? null}
            name={hero?.name ?? null}
            sizeClassName="w-7 h-7"
          />
          <UltimateRing ultimate={player.ultimate} />
          {/* A bare digit here is the exact ambiguity PlayerStatsSection's PositionBadge already
              solves for a different bare digit (1-5 role number) — same fix, same component: wrap
              in HoverCard rather than grow the badge to fit "Lv 6" at 13px. Absolute placement
              lives on this OUTER span, not HoverCard's own className — HoverCard's wrapper always
              applies `relative`, and merging `absolute` into it would race that same-specificity
              utility on cascade order instead of resolving predictably. */}
          {Number.isFinite(player.level) && (
            <span className="absolute -bottom-1 -right-1">
              <HoverCard
                align="right"
                content={<span className="text-[11px] font-medium">Level {player.level}</span>}
              >
                <span
                  tabIndex={0}
                  aria-label={`Level ${player.level}`}
                  className="block min-w-[13px] h-[13px] px-0.5 rounded-sm bg-gray-800 dark:bg-gray-700 text-white text-[8px] font-bold leading-[13px] text-center tabular-nums"
                >
                  {player.level}
                </span>
              </HoverCard>
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* A live IGN can legitimately be absent (Valve hasn't resolved the identity yet).
                Fall back to the hero name rather than rendering a blank row. */}
            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
              {player.name || hero?.name || 'Unknown'}
            </span>
            {player.isDead && (
              <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide text-red-500 tabular-nums">
                Dead {formatClock(player.respawnTimer)}
              </span>
            )}
          </div>
          {player.name && hero?.name && (
            <p className="text-[10px] text-gray-500 dark:text-gray-500 truncate">{hero.name}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-right">
            <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-white">
              {hasKda ? kda.join('/') : '—'}
            </span>
            <span className="block text-[8px] uppercase tracking-wide text-gray-500 dark:text-gray-500">KDA</span>
          </span>
          {/* Four stat columns do not fit beside a name at 375px. LH/DN is the one to drop: it is
              the most specialist read of the four, and unlike KDA/GPM/Net it does not change how a
              viewer reads the game state at a glance. `sm:` — this project defines no `xs:`
              breakpoint, so an `xs:` class here would hide the column on every viewport. */}
          <span className="text-right hidden sm:block">
            <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-white">
              {Number.isFinite(player.lastHits) ? player.lastHits : '—'}
              <span className="text-gray-400 dark:text-gray-600">/{Number.isFinite(player.denies) ? player.denies : '—'}</span>
            </span>
            <span className="block text-[8px] uppercase tracking-wide text-gray-500 dark:text-gray-500">LH/DN</span>
          </span>
          <span className="text-right">
            <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-white">
              {Number.isFinite(player.gpm) ? player.gpm : '—'}
            </span>
            <span className="block text-[8px] uppercase tracking-wide text-gray-500 dark:text-gray-500">GPM</span>
          </span>
          <span className="text-right">
            <span className="block text-xs font-bold tabular-nums text-gray-900 dark:text-white">
              {formatNetWorth(player.netWorth)}
            </span>
            <span className="block text-[8px] uppercase tracking-wide text-gray-500 dark:text-gray-500">Net</span>
          </span>
        </div>
      </div>

      {/* 6 slots only — confirmed empirically, not assumed: no backpack or neutral-item field
          exists anywhere in Valve's 99-field live schema. Deliberately narrower than the
          completed-match PlayerStatsSection row, which shows both. */}
      <div className="flex items-center gap-1 mt-1.5 ml-9">
        {player.items.map((itemId, i) => (
          <ItemSlot
            key={i}
            itemId={itemId}
            itemNames={itemNames}
            size="sm"
            edgePin={i < 2 ? 'left' : 'center'}
          />
        ))}
      </div>

      <div className="h-0.5 rounded-full bg-gray-200 dark:bg-gray-800 mt-1.5 ml-9 overflow-hidden">
        <div
          className={`h-full rounded-full ${side === 'radiant' ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  )
}

export function LivePlayerBoard({ players, heroes, itemNames, radiantName, direName }) {
  const all = [...(players?.radiant || []), ...(players?.dire || [])]
  if (all.length === 0) return null
  const maxNetWorth = Math.max(...all.map(p => (Number.isFinite(p.netWorth) ? p.netWorth : 0)), 0)

  return (
    <div className="space-y-4">
      {[
        { key: 'radiant', label: radiantName, list: players.radiant, cls: 'text-green-600 dark:text-green-500' },
        { key: 'dire', label: direName, list: players.dire, cls: 'text-red-600 dark:text-red-500' },
      ].map(({ key, label, list, cls }) => (list || []).length > 0 && (
        <div key={key}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 truncate ${cls}`}>
            {label || (key === 'radiant' ? 'Radiant' : 'Dire')}
          </p>
          {/* Sorted by net worth descending, matching PlayerStatsSection's completed-match ordering
              so the same team reads the same way live and post-game. */}
          {[...list]
            .sort((a, b) => (b.netWorth ?? 0) - (a.netWorth ?? 0))
            .map((p, i) => (
              <PlayerRow
                key={p.playerSlot ?? p.accountId ?? i}
                player={p}
                heroes={heroes}
                itemNames={itemNames}
                maxNetWorth={maxNetWorth}
                side={key}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

// ── Bans ────────────────────────────────────────────────────────────────────
// `bans[]` has no equivalent anywhere else in the feed and nothing on the site shows a live ban
// list today. Reuses DraftDisplay's completed-match ban treatment (strikethrough ghost chip)
// rather than inventing a second one.
export function LiveBanList({ draft, heroes }) {
  const bans = [...(draft?.radiantBans || []), ...(draft?.direBans || [])]
  if (bans.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {bans.map((heroId, i) => {
        const hero = heroes?.[heroId] || null
        return (
          <span
            key={`${heroId}-${i}`}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500"
          >
            <HeroIcon
              heroKey={hero?.key ?? null}
              name={hero?.name ?? null}
              sizeClassName="w-3.5 h-3.5"
              collapseOnError
            />
            <span className="line-through">{hero?.name || `Hero ${heroId}`}</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Live event feed ─────────────────────────────────────────────────────────
// Reuses the differ's already-derived events (`live-story:events:v1:{matchId}` — read, never
// re-derived here) rather than inventing new detection logic. Only three event types ever reach
// this component: kills, Roshan kills, and marquee item purchases — `shapeLiveEvents`
// (`api/_liveValveState.js`) whitelists those and DROPS tower/barracks-destroyed events
// unconditionally, because those still carry `confidence: 'uncertain'` at the source (lane naming
// isn't at the CONTEXT.md graduation bar yet). That filtering already happened server-side; this
// component trusts it rather than re-checking, since re-deriving a safety rule client-side is how
// the two copies drift.
function heroDisplayName(heroId, heroes) {
  if (!heroId) return null
  return heroes?.[heroId]?.name || null
}

// Items that can NEVER be bought from the shop — they only ever enter an inventory as a Roshan or
// Tormentor drop. The differ's underlying event (`_liveStoryDiff.js`'s `ItemPurchased`, name
// inherited from its original shop-purchase-only design) fires on ANY marquee item's first
// appearance regardless of source, so "buys" is flatly wrong for these two — confirmed live
// (`aegis` showing as "buys Aegis of the Immortal"). `aghanims_shard`/`aghanims_blessing` are
// deliberately NOT in this set even though both CAN also drop from Roshan/Tormentor in some
// patches: they're bought from the shop far more often, and mislabeling a real purchase as a
// pickup would trade one wrong verb for another just-as-likely one. `cheese` isn't in the
// differ's own MARQUEE_ITEM_KEYS list today, but is guarded here anyway in case it's ever added —
// same reasoning as `aegis`, unambiguous in every patch.
const PICKUP_ONLY_ITEM_KEYS = new Set(['aegis', 'cheese'])

function EventMarker({ side, children }) {
  const cls =
    side === 'radiant'
      ? 'border-green-500 text-green-600 dark:text-green-500'
      : side === 'dire'
        ? 'border-red-500 text-red-600 dark:text-red-500'
        : 'border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600'
  return (
    <span className={`relative z-[1] flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white dark:bg-gray-950 ${cls}`}>
      {children}
    </span>
  )
}

function EventRow({ event, heroes, itemNames }) {
  let icon, text, sub

  if (event.type === 'HeroKilled') {
    const victim = event.victimName || heroDisplayName(event.victimHeroId, heroes) || 'A hero'
    icon = (
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="6" r="3" />
        <path d="M4 14c0-2.5 1.8-4 4-4s4 1.5 4 4" />
      </svg>
    )
    if (event.ambiguous || !event.killerName) {
      // No sub-line explaining WHY the killer is unnamed — "poll cadence" is internal jargon a
      // viewer has no use for, and the bare fact ("X dies") is already honest on its own; it
      // doesn't claim a killer that isn't there.
      text = `${victim} dies`
      sub = null
    } else {
      const killer = event.killerName || heroDisplayName(event.killerHeroId, heroes) || 'Unknown'
      text = `${killer} kills ${victim}`
      sub = null
    }
  } else if (event.type === 'RoshanKilled') {
    icon = <RoshanSvg className="w-3 h-3" />
    text = 'Roshan killed'
    sub = 'Killing team not reported by this feed'
  } else if (event.type === 'ItemPurchased') {
    const player = event.playerName || heroDisplayName(event.heroId, heroes) || 'A player'
    // itemNames is the SAME scoped {id: {key, dname}} map ItemSlot already reads — the server
    // unions it with every event's itemId (see collectEventItemIds in _liveValveState.js) so an
    // item bought and since sold/displaced still resolves here even though it's no longer in
    // anyone's visible 6 slots. A miss (map not loaded yet, or a genuinely unresolved id) degrades
    // to the generic phrasing rather than blank/undefined text.
    const itemName = itemNames?.[event.itemId]?.dname
    const isPickup = PICKUP_ONLY_ITEM_KEYS.has(itemNames?.[event.itemId]?.key)
    const verb = isPickup ? 'picks up' : 'buys'
    icon = (
      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 1l1.8 4.6L14.5 6l-3.6 3 1 4.9L8 11.5 3.9 13.9l1-4.9L1.5 6l4.7-.4z" />
      </svg>
    )
    // Neutral verb when the name itself didn't resolve — "buys" would be a real guess in that
    // case (the item could just as easily be an unresolved pickup), and there's nothing to lose
    // by staying accurate here since the item name is missing either way.
    text = itemName ? `${player} ${verb} ${itemName}` : `${player} gets a marquee item`
    sub = null
  } else {
    return null
  }

  return (
    <div className="relative flex items-start gap-2.5 py-1.5">
      <EventMarker side={event.side}>{icon}</EventMarker>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 tabular-nums flex-shrink-0">
            {formatClock(event.time)}
          </span>
          <span className="text-xs font-semibold text-gray-900 dark:text-white">{text}</span>
        </div>
        {sub && <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export function LiveEventFeed({ events, heroes, itemNames }) {
  if (!events || events.length === 0) return null

  return (
    <div className="relative">
      {/* Timeline rail — spans behind the markers, same left offset as EventMarker's 24px circle
          centered under a 2.5px gap. */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-800" aria-hidden="true" />
      <div className="space-y-0">
        {events.map((e, i) => (
          <EventRow key={`${e.type}-${e.time}-${i}`} event={e} heroes={heroes} itemNames={itemNames} />
        ))}
      </div>
      <div className="flex items-center gap-2.5 pt-1.5">
        <span className="relative z-[1] flex-shrink-0 w-6 h-6 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
          Live — feed continues
        </span>
      </div>
    </div>
  )
}

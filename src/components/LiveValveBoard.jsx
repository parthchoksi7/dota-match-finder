import HeroIcon from './HeroIcon'
import ItemSlot from './ItemSlot'

// Valve-sourced live surfaces for a running game: Roshan status, a per-player telemetry board,
// barracks state, and the ban list.
//
// SCOPE — why these four and nothing else. Each renders a data point that has NO existing home in
// the shipped UI. Everything a completed-match component already covers is deliberately left to
// that component rather than restyled here:
//   - team names / kill score / net-worth lead / clock -> SeriesLivePulse's own names+score section
//   - net worth over time                              -> LiveGoldGraph
//   - standing towers                                  -> DotaMinimap
//   - the pick list                                    -> SeriesLivePulse's DraftPickRow grid
// This file adds only what those cannot show, so the two never drift into two treatments of one
// data point. Field-level provenance: `.claude/specs/live-story-valve-data-audit.md`.
//
// Everything below is sourced from Valve's GetLiveLeagueGames. The only OpenDota-derived value in
// the whole component is the item id -> CDN key map (`itemNames`), which is patch-static reference
// data rather than match telemetry.

const LANES = ['top', 'mid', 'bot']

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

// ── Barracks ────────────────────────────────────────────────────────────────
// Genuinely new to the live surface. The shipped DotaMinimap is fed by OpenDota's `building_state`,
// from which barracks are provably NOT derivable — Valve's dedicated `barracks_state` has no such
// ambiguity, which is why this can exist at all.
function BarracksLane({ lane, state, side }) {
  const upColor = side === 'radiant' ? 'bg-green-500' : 'bg-red-500'
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-800">
      <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-500">
        {lane}
      </span>
      <div className="flex gap-2">
        {['melee', 'ranged'].map(kind => {
          const standing = state?.[kind]
          return (
            <span key={kind} className="inline-flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-sm flex-shrink-0 ${
                  standing ? upColor : 'border border-dashed border-gray-400 dark:border-gray-600'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[9px] font-semibold ${
                  standing
                    ? 'text-gray-600 dark:text-gray-400'
                    : 'text-gray-400 dark:text-gray-600 line-through'
                }`}
              >
                {kind === 'melee' ? 'Melee' : 'Ranged'}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function BarracksPanel({ barracks, radiantName, direName }) {
  if (!barracks?.radiant && !barracks?.dire) return null

  return (
    <div className="space-y-3">
      {[
        { key: 'radiant', label: radiantName, state: barracks.radiant, cls: 'text-green-600 dark:text-green-500' },
        { key: 'dire', label: direName, state: barracks.dire, cls: 'text-red-600 dark:text-red-500' },
      ].map(({ key, label, state, cls }) => state && (
        <div key={key}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 truncate ${cls}`}>
            {label || (key === 'radiant' ? 'Radiant' : 'Dire')}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {LANES.map(lane => (
              <BarracksLane key={lane} lane={lane} state={state.lanes?.[lane]} side={key} />
            ))}
          </div>
        </div>
      ))}
      {/* Lane NAMING is still advisory: the bit STRUCTURE is proven (0 violations across 1,314
          constraints), but which triple is genuinely "top" vs "bot" rests on 2 of the 3
          independently-validated matches the graduation bar requires. This caption is what stops a
          viewer reading an unverified lane label as settled fact — do not remove it while
          `laneVerified` is false. */}
      {barracks.radiant?.laneVerified === false && (
        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-snug">
          Lane labels are provisional — melee/ranged and standing/destroyed are confirmed, which
          lane each belongs to is still being validated
        </p>
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
          {Number.isFinite(player.level) && (
            <span className="absolute -bottom-1 -right-1 min-w-[13px] h-[13px] px-0.5 rounded-sm bg-gray-800 dark:bg-gray-700 text-white text-[8px] font-bold leading-[13px] text-center tabular-nums">
              {player.level}
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

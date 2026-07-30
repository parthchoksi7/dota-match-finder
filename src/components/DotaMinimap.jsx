// Live Story R4 Phase D — tower map over the real minimap texture (owner-only during verification).
//
// Background is the actual Dota 2 minimap art (public/dota-minimap-7.40.webp, 512x512, self-hosted),
// pulled from https://github.com/timkurvers/redota. That repo's own code is MIT-licensed, but its
// README is explicit the map art itself is Valve IP, community-redrawn (7.40's image credited to a
// specific Reddit contributor) — used here under the same fan-content norm every Dota stats site
// already relies on for hero/item icons (this site already hotlinks those from Valve's own CDN).
// Self-hosting (rather than hotlinking a wiki/community-hosted copy) avoids the "fragile,
// patch-version-fragile" problem noted when this was first scoped — see .claude/specs/
// live-story-roadmap.md and 2026-07-28 conversation history for the full sourcing/licensing
// discussion before this shipped. One patch behind current (7.40 vs 7.41d) — accepted risk, since
// 7.41 was a hero/item overhaul, not a map-terrain rework (those are rare); swap the asset and
// MAP_TEXTURE_SRC together if a future patch does change the map.
//
// Replaces two earlier passes that didn't read as "Dota" to the owner: a text row (2026-07-25)
// and an abstract axis-aligned SVG schematic (2026-07-26, restyled 2026-07-27, still "so bad").
// Root cause diagnosed 2026-07-27: no amount of surface polish fixes a shape that doesn't match
// the real map's geometry/orientation. A real texture sidesteps that entirely.
//
// SCOPE, still load-bearing: only towers are ever drawn. `decodeBuildingState`
// (api/_buildingState.js) cannot determine barracks, tier-4 ("base") tower, or Ancient state —
// confirmed by direct disproof, not just an unresolved signal (see CONTEXT.md, "R4.0 decode
// spike"). This component must never draw a marker, icon, or implied state for any of those —
// doing so would show the owner information we don't actually have. The caption below the map
// is not decorative; it is the thing preventing that misread, so it must never be removed or
// visually de-emphasized below legibility.

export const MAP_TEXTURE_SRC = '/dota-minimap-7.40.webp'
export const MAP_VIEWBOX_SIZE = 512

// Marker positions (2026-07-29, final pass) were placed directly by the owner against a
// coordinate-gridded render of this exact texture (16-unit grid, labeled every line, in this
// same 0-512 space) — not estimated from a separate reference image and remapped, which is how
// the two prior passes this same day both ended up wrong. Each point was plotted back onto the
// grid and shown to the owner for confirmation before being committed here. Ordered
// [T1, T2, T3] = [outermost, middle, innermost/base-adjacent] per lane per side — same
// convention, and same "index 0 is farthest from that SIDE'S OWN base" rule, as every prior
// version of this map. Getting the direction right per side is easy to flip by accident (it
// happened once already, 2026-07-27) — the regression test asserts this property directly
// against these coordinates, not a hand-copied duplicate.
export const TOWER_POSITIONS = {
  top: {
    radiant: [[80, 210], [80, 264], [80, 344]],
    dire: [[136, 96], [232, 88], [344, 96]],
  },
  mid: {
    radiant: [[224, 280], [184, 316], [136, 364]],
    dire: [[264, 248], [312, 208], [368, 160]],
  },
  bot: {
    radiant: [[384, 424], [264, 424], [152, 424]],
    dire: [[424, 304], [424, 256], [424, 184]],
  },
}
const LANE_KEYS = ['top', 'mid', 'bot']
const LANE_LABELS = { top: 'top', mid: 'mid', bot: 'bot' }
export const BASE_POSITIONS = { radiant: [40, 468], dire: [468, 40] }

// Which of the 3 [T1,T2,T3]-ordered positions are destroyed, given a standing count (0-3).
// standing=2 -> the single OUTERMOST tower (index 0) is destroyed, the 2 innermost stand.
function destroyedFlags(standing) {
  const destroyedCount = 3 - standing
  return [0, 1, 2].map(i => i < destroyedCount)
}

// Pure so it's unit-testable without rendering. Summarizes exactly what's known — and states
// outright what isn't — so a screen-reader user gets the same "towers only" caveat a sighted
// user reads below the map, not just a bare tower count.
export function buildMinimapAriaLabel(radiant, dire, radiantName, direName) {
  const laneSummary = counts => LANE_KEYS.map(k => `${LANE_LABELS[k]} ${counts[LANE_KEYS.indexOf(k)]} of 3`).join(', ')
  const rName = radiantName || 'Radiant'
  const dName = direName || 'Dire'
  return `Tower map. ${rName}: ${laneSummary(radiant)} standing. ${dName}: ${laneSummary(dire)} standing. ` +
    `Barracks, base towers, and Ancient status are not known and are not shown.`
}

// Diamond marker (rotated square), white-stroked so it pops against the real texture's varied
// terrain colors (a flat single background color no longer exists to design contrast against —
// this is why standing towers are no longer just "team color," they need a border that works on
// green grass AND dark rock alike). Destroyed markers are dashed and mostly transparent — visible
// against any terrain without being mistaken for a standing tower, and the dash pattern itself
// (not just opacity) gives a colorblind-safe second distinguishing cue.
//
// A dark halo rect sits behind the white-stroked marker (same outline-behind-fill trick as the
// RAD/DIRE base labels below) — a plain white stroke alone still washed out against light terrain
// (grass, sand), so towers were hard to spot at a glance. Size bumped 13->16 for the same reason.
function TowerMarker({ x, y, destroyed, side }) {
  const size = 16
  const fill = destroyed ? 'rgba(255,255,255,0.10)' : side === 'radiant' ? '#22c55e' : '#ef4444'
  const stroke = destroyed ? 'rgba(255,255,255,0.85)' : '#ffffff'
  return (
    <g transform={`rotate(45 ${x} ${y})`}>
      <rect
        x={x - size / 2 - 1.5}
        y={y - size / 2 - 1.5}
        width={size + 3}
        height={size + 3}
        rx={2.5}
        fill="none"
        stroke="rgba(0,0,0,0.6)"
        strokeWidth={destroyed ? 2 : 2.5}
        strokeDasharray={destroyed ? '2,2' : undefined}
      />
      <rect
        data-tower-marker="true"
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        rx={2}
        fill={fill}
        stroke={stroke}
        strokeWidth={destroyed ? 1.5 : 2}
        strokeDasharray={destroyed ? '2,2' : undefined}
      />
    </g>
  )
}

// Legend swatches sit on the card's own flat background (bg-gray-50/bg-gray-950), not the
// texture, so they keep the original theme-neutral gray rather than TowerMarker's white —
// white-on-near-white would be unreadable in light mode here. Shape still matches TowerMarker's
// (rotated square, same dash-for-destroyed treatment) so the legend illustrates what's really
// drawn on the map.
function LegendSwatch({ destroyed, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
        <rect
          x={1.5} y={1.5} width={9} height={9} rx={1.5}
          fill={destroyed ? 'transparent' : '#9ca3af'}
          stroke="#6b7280"
          strokeWidth={destroyed ? 1.25 : 1.5}
          strokeDasharray={destroyed ? '2,2' : undefined}
          transform="rotate(45 6 6)"
        />
      </svg>
      <span className="text-[9px] text-gray-400 dark:text-gray-600">{label}</span>
    </span>
  )
}

// radiant/dire: [top, mid, bot] standing-tower counts (0-3 each), from pulse.objectives.
// Renders null on missing data — same "absent means don't render" rule as the rest of the
// owner-only R4 surfaces (never a skeleton/placeholder map).
export default function DotaMinimap({ radiant, dire, radiantName, direName }) {
  if (!radiant || !dire) return null

  const ariaLabel = buildMinimapAriaLabel(radiant, dire, radiantName, direName)

  return (
    <div className="mb-1.5 border border-gray-200 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-950 p-2.5">
      <div className="flex items-center justify-center gap-3 mb-1.5">
        <LegendSwatch destroyed={false} label="Standing" />
        <LegendSwatch destroyed label="Destroyed" />
      </div>

      <svg
        viewBox={`0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full max-w-[240px] mx-auto block rounded overflow-hidden"
      >
        <image href={MAP_TEXTURE_SRC} x={0} y={0} width={MAP_VIEWBOX_SIZE} height={MAP_VIEWBOX_SIZE} preserveAspectRatio="xMidYMid slice" />

        {/* Base labels — outlined text (paintOrder flips stroke behind fill) so they stay legible
            against the texture underneath without a flat backing shape covering real map art. */}
        <text x={BASE_POSITIONS.radiant[0]} y={BASE_POSITIONS.radiant[1] + 24} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#22c55e" stroke="#0a1f0f" strokeWidth={3} paintOrder="stroke">RAD</text>
        <text x={BASE_POSITIONS.dire[0]} y={BASE_POSITIONS.dire[1] - 12} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#ef4444" stroke="#2a0a0a" strokeWidth={3} paintOrder="stroke">DIRE</text>

        {LANE_KEYS.map(lane => {
          const rFlags = destroyedFlags(radiant[LANE_KEYS.indexOf(lane)])
          const dFlags = destroyedFlags(dire[LANE_KEYS.indexOf(lane)])
          return (
            <g key={lane}>
              {TOWER_POSITIONS[lane].radiant.map(([x, y], i) => (
                <TowerMarker key={`r-${lane}-${i}`} x={x} y={y} destroyed={rFlags[i]} side="radiant" />
              ))}
              {TOWER_POSITIONS[lane].dire.map(([x, y], i) => (
                <TowerMarker key={`d-${lane}-${i}`} x={x} y={y} destroyed={dFlags[i]} side="dire" />
              ))}
            </g>
          )
        })}
      </svg>

      <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 mt-1.5">
        Towers only — barracks, base towers &amp; Ancient status unknown
      </p>
    </div>
  )
}

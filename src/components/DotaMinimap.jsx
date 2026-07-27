// Live Story R4 Phase D — schematic tower map (owner-only during verification).
//
// This is a SCHEMATIC, not a licensed reproduction of Valve's in-game minimap texture — see
// .claude/specs/live-story-roadmap.md for why (no confirmed CDN source for the real texture,
// and hotlinking a wiki-hosted image is fragile/patch-version-fragile). Lane geometry below is
// a hand-placed approximation good enough to convey "which lane, which tier," not a
// geographically accurate map.
//
// SCOPE, and this is load-bearing: only towers are ever drawn. `decodeBuildingState`
// (api/_buildingState.js) cannot determine barracks, tier-4 ("base") tower, or Ancient state —
// confirmed by direct disproof, not just an unresolved signal (see CONTEXT.md, "R4.0 decode
// spike"). This component must never draw a marker, icon, or implied state for any of those —
// doing so would show the owner information we don't actually have. The caption below the map
// is not decorative; it is the thing preventing that misread, so it must never be removed or
// visually de-emphasized below legibility.

// Hand-placed marker positions on a 0-300 viewBox, ordered [T1, T2, T3] = [outermost, middle,
// innermost/base-adjacent] per lane per side. Radiant base sits bottom-left, Dire top-right —
// top lane runs up Radiant's left flank then along the top edge; bot lane runs along the
// bottom then up Dire's right flank; mid is the direct diagonal. Getting the DIRECTION right
// per side is easy to flip by accident (caught in review 2026-07-27: Dire's top/bot lanes had
// T1/T3 swapped, drawing its towers in mirror-reversed order from Radiant's) — the rule is
// always "index 0 is farthest from that SIDE'S OWN base," not "farthest from the map center."
// Destruction is assumed to proceed T1 -> T2 -> T3 (true in the vast majority of games; a rare
// backdoor-style exception isn't modeled), so "N standing" always means the N INNERMOST
// entries in this array are up and the rest are down.
// Exported so the regression test can validate the geometry directly against the data the
// component actually renders, not a hand-copied duplicate that could silently drift out of sync.
export const TOWER_POSITIONS = {
  top: {
    radiant: [[35, 95], [35, 155], [35, 215]],
    dire: [[95, 35], [155, 35], [215, 35]],
  },
  mid: {
    // Wider gap between the two sides' outermost (T1) towers than a naive midpoint split —
    // otherwise the two closest markers visually collide right where the river crosses.
    radiant: [[135, 165], [105, 195], [75, 225]],
    dire: [[165, 135], [195, 105], [225, 75]],
  },
  bot: {
    radiant: [[215, 265], [155, 265], [95, 265]],
    dire: [[265, 215], [265, 155], [265, 95]],
  },
}
const LANE_KEYS = ['top', 'mid', 'bot']
const LANE_LABELS = { top: 'top', mid: 'mid', bot: 'bot' }
export const BASE_POSITIONS = { radiant: [30, 270], dire: [270, 30] }

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

// Diamond marker (rotated square) — reads as a distinct "structure" glyph rather than a plain
// data-viz dot, closer to the icon language real map overlays use for buildings.
function TowerMarker({ x, y, destroyed, side }) {
  const size = 9
  const fill = destroyed ? 'transparent' : side === 'radiant' ? '#22c55e' : '#ef4444'
  const stroke = destroyed ? '#57534e' : side === 'radiant' ? '#16a34a' : '#dc2626'
  return (
    <rect
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      rx={1.5}
      fill={fill}
      stroke={stroke}
      strokeWidth={destroyed ? 1 : 1.5}
      opacity={destroyed ? 0.55 : 1}
      transform={`rotate(45 ${x} ${y})`}
    />
  )
}

// Matches TowerMarker's actual shape (rotated square) so the legend illustrates what's really
// drawn on the map, not a plain square standing in for a diamond.
function LegendSwatch({ destroyed, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true">
        <rect
          x={1} y={1} width={8} height={8} rx={1}
          fill={destroyed ? 'transparent' : '#9ca3af'}
          stroke="#6b7280"
          strokeWidth={1}
          opacity={destroyed ? 0.55 : 1}
          transform="rotate(45 5 5)"
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

      <svg viewBox="0 0 300 300" role="img" aria-label={ariaLabel} className="w-full max-w-[240px] mx-auto block">
        {/* River — flat two-tone stroke (no gradient) crossing near the map's center, distinct
            from the tan lane roads below both in color and in curve (real Dota's river runs
            roughly perpendicular to mid lane, not parallel to it). Decorative/orientation only. */}
        <path d="M -5 112 C 95 148, 205 148, 305 188" fill="none" stroke="#1e3a5f" strokeOpacity={0.55} strokeWidth={9} strokeLinecap="round" />
        <path d="M -5 112 C 95 148, 205 148, 305 188" fill="none" stroke="#3b6493" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />

        {/* Lane roads — thicker, warm-toned strokes so they read as paths, not debug lines */}
        <polyline points="30,270 35,155 35,32 155,32 270,30" fill="none" stroke="#8a7a63" strokeOpacity={0.4} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="30,270 105,195 195,105 270,30" fill="none" stroke="#8a7a63" strokeOpacity={0.4} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="30,270 155,265 268,265 268,155 270,30" fill="none" stroke="#8a7a63" strokeOpacity={0.4} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Base markers — layered rings instead of a flat dot, still flat colors (no gradient) */}
        <circle cx={30} cy={270} r={16} fill="#22c55e" opacity={0.12} />
        <circle cx={30} cy={270} r={10} fill="#22c55e" opacity={0.3} stroke="#16a34a" strokeWidth={1.5} />
        <circle cx={270} cy={30} r={16} fill="#ef4444" opacity={0.12} />
        <circle cx={270} cy={30} r={10} fill="#ef4444" opacity={0.3} stroke="#dc2626" strokeWidth={1.5} />
        <text x={30} y={291} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#22c55e">RAD</text>
        <text x={270} y={17} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#ef4444">DIRE</text>

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

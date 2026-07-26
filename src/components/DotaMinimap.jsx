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
// bottom then up Dire's right flank; mid is the direct diagonal. This ordering matters: tower
// destruction is assumed to proceed T1 -> T2 -> T3 (true in the vast majority of games; a rare
// backdoor-style exception isn't modeled), so "N standing" always means the N INNERMOST
// entries in this array are up and the rest are down.
const TOWER_POSITIONS = {
  top: {
    radiant: [[35, 100], [35, 160], [35, 220]],
    dire: [[220, 35], [160, 35], [100, 35]],
  },
  mid: {
    radiant: [[145, 155], [115, 185], [85, 215]],
    dire: [[155, 145], [185, 115], [215, 85]],
  },
  bot: {
    radiant: [[220, 265], [160, 265], [100, 265]],
    dire: [[265, 100], [265, 160], [265, 220]],
  },
}
const LANE_KEYS = ['top', 'mid', 'bot']
const LANE_LABELS = { top: 'top', mid: 'mid', bot: 'bot' }

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

function TowerMarker({ x, y, destroyed, side }) {
  const size = 10
  const fill = destroyed
    ? 'transparent'
    : side === 'radiant' ? '#22c55e' : '#ef4444'
  const stroke = destroyed
    ? (side === 'radiant' ? '#4b5563' : '#4b5563')
    : side === 'radiant' ? '#16a34a' : '#dc2626'
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
      opacity={destroyed ? 0.5 : 1}
    />
  )
}

// radiant/dire: [top, mid, bot] standing-tower counts (0-3 each), from pulse.objectives.
// Renders null on missing data — same "absent means don't render" rule as the rest of the
// owner-only R4 surfaces (never a skeleton/placeholder map).
export default function DotaMinimap({ radiant, dire, radiantName, direName }) {
  if (!radiant || !dire) return null

  const ariaLabel = buildMinimapAriaLabel(radiant, dire, radiantName, direName)

  return (
    <div className="mb-1.5">
      <svg viewBox="0 0 300 300" role="img" aria-label={ariaLabel} className="w-full max-w-[240px] mx-auto block">
        {/* Base corners */}
        <circle cx={30} cy={270} r={12} fill="#22c55e" opacity={0.25} />
        <circle cx={270} cy={30} r={12} fill="#ef4444" opacity={0.25} />
        <text x={30} y={288} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#22c55e">RAD</text>
        <text x={270} y={20} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#ef4444">DIRE</text>

        {/* Lane guide lines, faint — orientation only, not data */}
        <polyline points="30,270 35,160 35,35 160,35 270,30" fill="none" stroke="#374151" strokeOpacity={0.3} strokeWidth={1} />
        <line x1={30} y1={270} x2={270} y2={30} stroke="#374151" strokeOpacity={0.3} strokeWidth={1} />
        <polyline points="30,270 160,265 265,265 265,160 270,30" fill="none" stroke="#374151" strokeOpacity={0.3} strokeWidth={1} />

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
      <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 mt-1">
        Towers only — barracks, base towers &amp; Ancient status unknown
      </p>
    </div>
  )
}

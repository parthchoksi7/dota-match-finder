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

// ---------------------------------------------------------------------------------------------
// Tier-4 (Ancient guardian) + barracks marker positions — 2026-08-06, re-placed 2026-08-07 against
// the real texture (previous pass used blind linear interpolation with no image reference at all
// and was visibly wrong — confirmed live).
//
// RADIANT positions below were read directly off the texture: cropping+upscaling
// public/dota-minimap-7.40.webp's bottom-left (0,330)-(200,512) region shows the base's walled
// compound clearly, with two visible gate openings in the fence — one facing the river/top-lane
// side, one facing the bottom-lane side. Cross-checked against the already owner-verified
// TOWER_POSITIONS: both gates sit almost exactly where top.radiant[2] (80,344) and
// bot.radiant[2] (152,424) already are (T3 towers stand right at the base entrance in the real
// game too), which corroborates the read rather than contradicting it.
//
// DIRE positions are DERIVED, not independently read off the texture — by point-reflection
// through the center implied by the two (owner-verified) BASE_POSITIONS, (254,254). Verified as a
// sound approximation first: reflecting mid.radiant's three owner-verified points through that
// center lands within ~20-40px of the corresponding real mid.dire points (not exact — the art
// isn't perfectly symmetric — but close enough to derive from confidently). Reflection requires a
// LANE SWAP, not a straight per-lane mirror: reflecting top.radiant(80,210) lands next to
// bot.dire(424,304), not top.dire — i.e. radiant's "top" and dire's "bot" occupy the same physical
// corridor from opposite ends. Confirmed against dire_base.png crop, which shows the same wall
// shape mirrored. Both sides visually spot-checked, not pixel-grid-verified the way TOWER_POSITIONS
// was (that took two wrong passes + an owner grid-check before landing) — flag anything still off.
function reflectThroughBaseCenter([x, y]) {
  const cx = (BASE_POSITIONS.radiant[0] + BASE_POSITIONS.dire[0]) / 2
  const cy = (BASE_POSITIONS.radiant[1] + BASE_POSITIONS.dire[1]) / 2
  return [2 * cx - x, 2 * cy - y]
}

const TIER4_RADIANT = [[75, 335], [160, 455]] // [river/top-side gate, safelane/bot-side gate]

export const TIER4_POSITIONS = {
  radiant: TIER4_RADIANT,
  // Order carries no meaning (decodeTowerState's tier4 pair is unordered — Valve's own combat log
  // doesn't distinguish which of the two fell either, per the audit doc), so a straight reflection
  // needs no lane-swap here unlike barracks below.
  dire: TIER4_RADIANT.map(reflectThroughBaseCenter),
}

const BARRACKS_RADIANT = {
  top: { melee: [88, 352], ranged: [78, 358] },
  mid: { melee: [148, 392], ranged: [140, 400] },
  bot: { melee: [110, 431], ranged: [116, 448] },
}

export const BARRACKS_POSITIONS = {
  radiant: BARRACKS_RADIANT,
  dire: {
    // Lane swap on reflection — see the header comment above (top.radiant <-> bot.dire).
    top: {
      melee: reflectThroughBaseCenter(BARRACKS_RADIANT.bot.melee),
      ranged: reflectThroughBaseCenter(BARRACKS_RADIANT.bot.ranged),
    },
    // Mid is NOT reflected like top/bot above — reflecting radiant's mid barracks landed at
    // (360,116), closer to dire's own TOP T3 (344,96) than to its own MID T3 (368,160). Mid
    // lane's reflection symmetry is looser than top/bot's (confirmed separately: reflecting the
    // three owner-verified TOWER_POSITIONS.mid.radiant points lands 20-40px off their real
    // TOWER_POSITIONS.mid.dire counterparts, vs. a much tighter match on top/bot). Computed
    // directly off dire's own verified mid T3 instead, same interpolation shape used for radiant.
    mid: { melee: [405, 130], ranged: [391, 118] },
    bot: {
      melee: reflectThroughBaseCenter(BARRACKS_RADIANT.top.melee),
      ranged: reflectThroughBaseCenter(BARRACKS_RADIANT.top.ranged),
    },
  },
}

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

// Small square marker for a barracks — deliberately NOT the diamond shape TowerMarker uses, so
// the two building types are distinguishable by silhouette alone, not just position. Same
// halo-behind-fill treatment for the same reason (legibility against varied real terrain).
function BarracksMarker({ x, y, destroyed, side }) {
  const size = 10
  const fill = destroyed ? 'rgba(255,255,255,0.10)' : side === 'radiant' ? '#22c55e' : '#ef4444'
  const stroke = destroyed ? 'rgba(255,255,255,0.85)' : '#ffffff'
  return (
    <g>
      <rect
        x={x - size / 2 - 1.5} y={y - size / 2 - 1.5} width={size + 3} height={size + 3} rx={2}
        fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={destroyed ? 1.5 : 2}
        strokeDasharray={destroyed ? '2,2' : undefined}
      />
      <rect
        data-barracks-marker="true"
        x={x - size / 2} y={y - size / 2} width={size} height={size} rx={1.5}
        fill={fill} stroke={stroke} strokeWidth={destroyed ? 1.25 : 1.5}
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
//
// OPTIONAL richer props (2026-08-06, Valve-sourced live surface):
//   radiantTowerState / direTowerState   — decodeTowerState()'s shape, EXACT per-tower booleans,
//                                           used in place of the count-based reconstruction above
//                                           when present (more precise: a count alone can't say
//                                           WHICH tower fell if the destruction order was unusual).
//   radiantBarracksState / direBarracksState — decodeBarracksState()'s shape. Adds 12 new markers
//                                           and the caption below reads differently, since barracks
//                                           genuinely ARE known now (Valve's dedicated
//                                           barracks_state field, unlike OD's building_state — see
//                                           _buildingState.js's disproof).
// Absent -> the component behaves EXACTLY as it did before this change (verified by the existing
// count-only test suite, none of which pass these new props).
export default function DotaMinimap({
  radiant, dire, radiantName, direName,
  radiantTowerState, direTowerState, radiantBarracksState, direBarracksState,
}) {
  if (!radiant || !dire) return null

  const hasRichTowers = !!(radiantTowerState && direTowerState)
  const hasBarracks = !!(radiantBarracksState && direBarracksState)
  const ariaLabel = buildMinimapAriaLabel(radiant, dire, radiantName, direName) +
    (hasBarracks ? ' Barracks status is also known and shown.' : '')

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
          const rFlags = hasRichTowers
            ? radiantTowerState.lanes[lane].map(standing => !standing)
            : destroyedFlags(radiant[LANE_KEYS.indexOf(lane)])
          const dFlags = hasRichTowers
            ? direTowerState.lanes[lane].map(standing => !standing)
            : destroyedFlags(dire[LANE_KEYS.indexOf(lane)])
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

        {hasRichTowers && (
          <g>
            {TIER4_POSITIONS.radiant.map(([x, y], i) => (
              <TowerMarker key={`r-t4-${i}`} x={x} y={y} destroyed={!radiantTowerState.tier4[i]} side="radiant" />
            ))}
            {TIER4_POSITIONS.dire.map(([x, y], i) => (
              <TowerMarker key={`d-t4-${i}`} x={x} y={y} destroyed={!direTowerState.tier4[i]} side="dire" />
            ))}
          </g>
        )}

        {hasBarracks && (
          <g>
            {LANE_KEYS.map(lane => (
              <g key={`rax-${lane}`}>
                <BarracksMarker
                  x={BARRACKS_POSITIONS.radiant[lane].melee[0]} y={BARRACKS_POSITIONS.radiant[lane].melee[1]}
                  destroyed={!radiantBarracksState.lanes[lane].melee} side="radiant"
                />
                <BarracksMarker
                  x={BARRACKS_POSITIONS.radiant[lane].ranged[0]} y={BARRACKS_POSITIONS.radiant[lane].ranged[1]}
                  destroyed={!radiantBarracksState.lanes[lane].ranged} side="radiant"
                />
                <BarracksMarker
                  x={BARRACKS_POSITIONS.dire[lane].melee[0]} y={BARRACKS_POSITIONS.dire[lane].melee[1]}
                  destroyed={!direBarracksState.lanes[lane].melee} side="dire"
                />
                <BarracksMarker
                  x={BARRACKS_POSITIONS.dire[lane].ranged[0]} y={BARRACKS_POSITIONS.dire[lane].ranged[1]}
                  destroyed={!direBarracksState.lanes[lane].ranged} side="dire"
                />
              </g>
            ))}
          </g>
        )}
      </svg>

      <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 mt-1.5">
        {hasBarracks
          ? 'Towers & barracks — Ancient HP still unknown'
          : 'Towers only — barracks, base towers & Ancient status unknown'}
      </p>
      {hasRichTowers && radiantTowerState.laneVerified === false && (
        <p className="text-center text-[9px] text-gray-400 dark:text-gray-600 mt-0.5">
          Lane labels (which side is "top" vs "bot") are provisional pending validation
        </p>
      )}
    </div>
  )
}

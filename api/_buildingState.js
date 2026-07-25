// Live Story R4 — pure decoder for OpenDota /live's `building_state` bitmask.
//
// Bit layout verified empirically 2026-07-24 against 47 games / 885 timeseries points
// captured in live_game_gold, cross-checked against OpenDota's post-game `building_kill`
// objectives (exact building + exact time). Full writeup: CONTEXT.md, search "R4.0 decode
// spike". Docs never described this layout (OpenDota ships no documentation for it, and
// Valve's own proto defines the field with zero bit-level comments) — do not "fix" this file
// from docs, only from further empirical verification, the same rule that governed R4.0.
//
// Layout: two 9-bit blocks, one per side, gap at bits 11-15. Each block is three independent
// 3-bit binary counters (top/mid/bot lane). Bits 9-10 (side A) and 25-26 (side B) are an
// unidentified "extra" field per side — confirmed not to correlate with ancient/tier-4 kill
// events, asymmetric between sides (side B's copy never left 0 across the whole corpus), and
// deliberately left undecoded since it doesn't overlap the lane bits and isn't needed for a
// tower-count readout.
//
// Barracks are confirmed NOT decodable from this field — not absence of evidence, a direct
// disproof (the same raw ceiling value occurred with 0 barracks destroyed in one lane and 2
// destroyed in another lane of the same game). Do not attempt to derive rax state here.

// building_state's real bits reach into the mid-20s (side B's mirror block starts at bit 16),
// so bit tests use division, not `<<`/`&` (which coerce to 32-bit signed and silently wrap —
// the exact bug that produced a wrong figure during the R4.0 spike's first pass).
function bit(n, i) {
  return Math.floor(n / 2 ** i) % 2
}

function laneField(n, start) {
  return bit(n, start) + bit(n, start + 1) * 2 + bit(n, start + 2) * 4
}

// A lane's raw 3-bit counter climbs past "3 towers destroyed" (up to 7) for reasons that
// don't affect this formula's correctness (see CONTEXT.md) — every raw value from 4 through 7
// uniformly means "0 standing," so no special-casing is needed.
function laneStanding(raw) {
  return Math.max(0, Math.min(3, 4 - raw))
}

const RADIANT_LANE_STARTS = [0, 3, 6]
const DIRE_LANE_STARTS = [16, 19, 22]

// Highest bit building_state is confirmed to ever legitimately use (side B's mirror block
// ends at bit 24; its unresolved "extra" field could reach bit 26). Anything beyond this is
// either garbage or a patch that moved the layout — the confidence gate's safety net: a value
// that overflows the known-valid range fails safe to "low" rather than decoding to nonsense.
const MAX_VALID_BIT = 26
const MAX_VALID_MASK = 2 ** (MAX_VALID_BIT + 1) - 1

// decodeBuildingState(mask) -> { rt, dt, confidence }
// rt/dt: total standing towers (0-9) for Radiant/Dire, or null when confidence is 'low'.
// confidence: 'high' | 'low' — caller must omit the objectives readout entirely on 'low',
// never render a partial/guessed count (the R4 spec's "silence beats a wrong count" rule).
export function decodeBuildingState(mask) {
  if (!Number.isFinite(mask) || mask <= 0 || mask > MAX_VALID_MASK) {
    return { rt: null, dt: null, confidence: 'low' }
  }

  const rt = RADIANT_LANE_STARTS.reduce((sum, start) => sum + laneStanding(laneField(mask, start)), 0)
  const dt = DIRE_LANE_STARTS.reduce((sum, start) => sum + laneStanding(laneField(mask, start)), 0)

  return { rt, dt, confidence: 'high' }
}

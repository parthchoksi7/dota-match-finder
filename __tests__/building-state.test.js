/**
 * Tests for decodeBuildingState (api/_buildingState.js, Live Story R4 Phase C).
 *
 * The four "real" fixtures below are actual captured building_state values from
 * scripts/building-state-samples.jsonl (od_match_id 8905490238, --watch session
 * 2026-07-20) — a real live game's tower state read at four consecutive polls, not
 * synthetic. Expected per-lane arrays were derived by hand-tracing the verified bit layout
 * against each value (see CONTEXT.md, "R4.0 decode spike", for the layout itself).
 * Everything else below is a constructed mask targeting one specific rule.
 *
 * Return shape is per-lane ([top, mid, bot] standing counts, 0-3 each), not an aggregate sum —
 * the map UI (DotaMinimap.jsx) needs to know WHICH lane/tier, not just a total. There is no
 * barracks/tier-4/Ancient field anywhere in this return shape, deliberately — see the "Barracks
 * are confirmed NOT decodable" note in api/_buildingState.js. A test asserting `.rax` or
 * `.ancient` exists here would be asserting something this decoder must never provide.
 */

import { describe, it, expect } from 'vitest'
import { decodeBuildingState } from '../api/_buildingState.js'

describe('decodeBuildingState — real captured samples', () => {
  it('4784201 (game_time 264s, pre-first-tower): full board both sides', () => {
    expect(decodeBuildingState(4784201)).toEqual({ radiant: [3, 3, 3], dire: [3, 3, 3], confidence: 'high' })
  })

  it('8978505 (game_time 624s): Dire has lost its first tower (bot lane), Radiant untouched', () => {
    expect(decodeBuildingState(8978505)).toEqual({ radiant: [3, 3, 3], dire: [3, 3, 2], confidence: 'high' })
  })

  it('8978506 (game_time 684s): Radiant now down one too (top lane)', () => {
    expect(decodeBuildingState(8978506)).toEqual({ radiant: [2, 3, 3], dire: [3, 3, 2], confidence: 'high' })
  })

  it('8978570 (game_time 804s): Radiant down a second tower (bot lane), Dire unchanged from the prior poll', () => {
    expect(decodeBuildingState(8978570)).toEqual({ radiant: [2, 3, 2], dire: [3, 3, 2], confidence: 'high' })
  })
})

describe('decodeBuildingState — confidence gate', () => {
  it.each([null, undefined, NaN, Infinity, -Infinity, 0, -5, 'not a number'])(
    'treats %p as low confidence with null lane arrays',
    (mask) => {
      expect(decodeBuildingState(mask)).toEqual({ radiant: null, dire: null, confidence: 'low' })
    }
  )

  it('accepts the maximum valid mask (2^27 - 1) as high confidence', () => {
    const result = decodeBuildingState(2 ** 27 - 1)
    expect(result.confidence).toBe('high')
  })

  it('a mask one bit beyond the verified range fails safe to low confidence (the patch-safety net)', () => {
    expect(decodeBuildingState(2 ** 27)).toEqual({ radiant: null, dire: null, confidence: 'low' })
  })

  it('a wildly implausible mask (e.g. a future layout shift) is low confidence, not a garbage count', () => {
    expect(decodeBuildingState(10 ** 12).confidence).toBe('low')
  })
})

// Composes three 3-bit lane values (top/mid/bot) into Radiant's block (bits 0-8). A lane left
// at its default 0 decodes as "3 standing" (laneStanding(0) === 3) — an uncaptured lane must
// never be misread as destroyed, so tests that isolate one lane use this default deliberately.
function radiantMask(topRaw, midRaw, botRaw) {
  return topRaw + midRaw * 8 + botRaw * 64
}

describe('decodeBuildingState — lane saturation past "fully cleared"', () => {
  it('all three lanes saturated at 7 (max) reads as 0 standing in every lane, not a negative/garbage count', () => {
    expect(decodeBuildingState(radiantMask(7, 7, 7)).radiant).toEqual([0, 0, 0])
  })

  it('raw values 4 through 7 for a single lane all uniformly mean that lane reads 0 standing (no special-casing)', () => {
    for (const raw of [4, 5, 6, 7]) {
      // Other two lanes left at their default (0 -> 3 standing each).
      expect(decodeBuildingState(radiantMask(raw, 0, 0)).radiant).toEqual([0, 3, 3])
    }
  })
})

describe('decodeBuildingState — sides and lanes are decoded independently', () => {
  it('a change confined to Dire bits never moves the Radiant lane array', () => {
    const before = decodeBuildingState(4784201)
    const after = decodeBuildingState(8978505) // Dire bot lane changed, Radiant bits untouched
    expect(after.radiant).toEqual(before.radiant)
    expect(after.dire).not.toEqual(before.dire)
  })

  it('a change confined to one lane never moves the other two lanes on the same side', () => {
    const before = decodeBuildingState(8978505) // radiant [3,3,3]
    const after = decodeBuildingState(8978506) // radiant top lane falls -> [2,3,3]
    expect(after.radiant[0]).not.toBe(before.radiant[0])
    expect(after.radiant[1]).toBe(before.radiant[1])
    expect(after.radiant[2]).toBe(before.radiant[2])
  })
})

/**
 * Tests for decodeBuildingState (api/_buildingState.js, Live Story R4 Phase C).
 *
 * The four "real" fixtures below are actual captured building_state values from
 * scripts/building-state-samples.jsonl (od_match_id 8905490238, --watch session
 * 2026-07-20) — a real live game's tower state read at four consecutive polls, not
 * synthetic. Expected rt/dt were derived by hand-tracing the verified bit layout
 * against each value (see CONTEXT.md, "R4.0 decode spike", for the layout itself).
 * Everything else below is a constructed mask targeting one specific rule.
 */

import { describe, it, expect } from 'vitest'
import { decodeBuildingState } from '../api/_buildingState.js'

describe('decodeBuildingState — real captured samples', () => {
  it('4784201 (game_time 264s, pre-first-tower): full board both sides', () => {
    expect(decodeBuildingState(4784201)).toEqual({ rt: 9, dt: 9, confidence: 'high' })
  })

  it('8978505 (game_time 624s): Dire has lost its first tower, Radiant untouched', () => {
    expect(decodeBuildingState(8978505)).toEqual({ rt: 9, dt: 8, confidence: 'high' })
  })

  it('8978506 (game_time 684s): Radiant now down one too', () => {
    expect(decodeBuildingState(8978506)).toEqual({ rt: 8, dt: 8, confidence: 'high' })
  })

  it('8978570 (game_time 804s): Radiant down a second tower, Dire unchanged from the prior poll', () => {
    expect(decodeBuildingState(8978570)).toEqual({ rt: 7, dt: 8, confidence: 'high' })
  })
})

describe('decodeBuildingState — confidence gate', () => {
  it.each([null, undefined, NaN, Infinity, -Infinity, 0, -5, 'not a number'])(
    'treats %p as low confidence with null counts',
    (mask) => {
      expect(decodeBuildingState(mask)).toEqual({ rt: null, dt: null, confidence: 'low' })
    }
  )

  it('accepts the maximum valid mask (2^27 - 1) as high confidence', () => {
    const result = decodeBuildingState(2 ** 27 - 1)
    expect(result.confidence).toBe('high')
  })

  it('a mask one bit beyond the verified range fails safe to low confidence (the patch-safety net)', () => {
    expect(decodeBuildingState(2 ** 27)).toEqual({ rt: null, dt: null, confidence: 'low' })
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
  it('all three lanes saturated at 7 (max) reads as 0 total standing, not a negative/garbage count', () => {
    expect(decodeBuildingState(radiantMask(7, 7, 7)).rt).toBe(0)
  })

  it('raw values 4 through 7 for a single lane all uniformly mean that lane contributes 0 (no special-casing)', () => {
    for (const raw of [4, 5, 6, 7]) {
      // Other two lanes left at their default (0 -> 3 standing each) so the isolated lane's
      // contribution is directly readable off the total: rt - 6 === this lane's standing.
      expect(decodeBuildingState(radiantMask(raw, 0, 0)).rt).toBe(6)
    }
  })
})

describe('decodeBuildingState — sides are decoded independently', () => {
  it('a change confined to Dire bits never moves the Radiant count', () => {
    const before = decodeBuildingState(4784201)
    const after = decodeBuildingState(8978505) // Dire top lane changed, Radiant bits untouched
    expect(after.rt).toBe(before.rt)
    expect(after.dt).not.toBe(before.dt)
  })
})

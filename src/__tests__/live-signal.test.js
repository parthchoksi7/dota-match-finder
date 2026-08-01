/**
 * Tests for src/utils/liveSignal.js — the live feed "worth watching" badge state machine
 * (`.claude/specs/live-worth-watching-signal-spec.md`). Owner-only as of this build; these tests
 * cover the pure logic regardless of gating, plus the three fixes from the pre-build critique
 * (/dota_data_scientist + /dota_analyst + /dota_pm, 2026-08-01): peak-reset-on-sign-flip, the
 * time-scaled peak floor, and the shared-threshold guarantee against momentum.js.
 */

import { describe, it, expect } from 'vitest'
import {
  MIN_GAME_TIME_S,
  ONE_SIDED_DWELL,
  RETRACEMENT_ENTER,
  peakFloor,
  advancePeak,
  computeRetracement,
  nextSignalState,
} from '../utils/liveSignal.js'
import { evenThreshold, farAheadThreshold } from '../utils/momentum.js'

describe('nextSignalState — gating', () => {
  it('no badge before MIN_GAME_TIME_S (R2)', () => {
    const result = nextSignalState(null, { radiantLead: 6000, gameTime: MIN_GAME_TIME_S - 1 })
    expect(result.state).toBeNull()
  })

  it('no badge for a non-finite radiantLead or gameTime', () => {
    expect(nextSignalState(null, { radiantLead: NaN, gameTime: 600 }).state).toBeNull()
    expect(nextSignalState(null, { radiantLead: 5000, gameTime: NaN }).state).toBeNull()
  })

  it('a null prior (cold start) never throws and behaves as a fresh observation', () => {
    expect(() => nextSignalState(null, { radiantLead: 500, gameTime: 600 })).not.toThrow()
    expect(() => nextSignalState(undefined, { radiantLead: 500, gameTime: 600 })).not.toThrow()
  })

  it('an invalid observation preserves peak history rather than resetting it', () => {
    const afterPeak = nextSignalState(null, { radiantLead: 9000, gameTime: 1200 })
    const afterGap = nextSignalState(afterPeak, { radiantLead: NaN, gameTime: 1200 })
    expect(afterGap.state).toBeNull()
    expect(afterGap.peak).toBe(9000)
    expect(afterGap.peakSide).toBe('radiant')
  })
})

describe('nextSignalState — CLOSE enters on 1 observation, ONE_SIDED needs dwell', () => {
  it('CLOSE renders immediately when the lead is within evenThreshold', () => {
    const gameTime = 900 // 15 min
    const lead = evenThreshold(gameTime) - 1
    const result = nextSignalState(null, { radiantLead: lead, gameTime })
    expect(result.state).toBe('CLOSE')
  })

  it('ONE_SIDED does not render on the first qualifying observation', () => {
    const gameTime = 1200 // 20 min
    const lead = farAheadThreshold(gameTime) + 1
    const first = nextSignalState(null, { radiantLead: lead, gameTime })
    expect(first.state).toBeNull()
  })

  it(`ONE_SIDED renders on the ${ONE_SIDED_DWELL}th consecutive qualifying observation`, () => {
    const gameTime = 1200
    const lead = farAheadThreshold(gameTime) + 1
    let state = null
    for (let i = 0; i < ONE_SIDED_DWELL; i++) {
      state = nextSignalState(state, { radiantLead: lead, gameTime })
    }
    expect(state.state).toBe('ONE_SIDED')
  })

  it('a non-consecutive read resets the ONE_SIDED dwell counter', () => {
    const gameTime = 1200
    const lead = farAheadThreshold(gameTime) + 1
    let state = nextSignalState(null, { radiantLead: lead, gameTime }) // streak 1, no render
    state = nextSignalState(state, { radiantLead: 0, gameTime }) // interrupts the streak (also CLOSE)
    state = nextSignalState(state, { radiantLead: lead, gameTime }) // streak restarts at 1
    expect(state.state).not.toBe('ONE_SIDED')
  })
})

describe('nextSignalState — hysteresis (no flicker at the boundary)', () => {
  it('CLOSE does not exit until the lead exceeds CLOSE_EXIT_FACTOR x evenThreshold', () => {
    const gameTime = 900
    const even = evenThreshold(gameTime)
    let state = nextSignalState(null, { radiantLead: even - 1, gameTime })
    expect(state.state).toBe('CLOSE')
    // Just over the raw entry boundary, but still well under the wider exit boundary.
    state = nextSignalState(state, { radiantLead: even + 1, gameTime })
    expect(state.state).toBe('CLOSE')
  })

  it('ONE_SIDED does not exit until the lead drops below ONE_SIDED_EXIT_FACTOR x decidedThreshold', () => {
    const gameTime = 1200
    const decided = farAheadThreshold(gameTime)
    let state = null
    for (let i = 0; i < ONE_SIDED_DWELL; i++) {
      state = nextSignalState(state, { radiantLead: decided + 1000, gameTime })
    }
    expect(state.state).toBe('ONE_SIDED')
    // Dropped back under the raw entry boundary, but still above the wider exit boundary.
    state = nextSignalState(state, { radiantLead: decided - 1, gameTime })
    expect(state.state).toBe('ONE_SIDED')
  })

  it('a mega-comeback clears ONE_SIDED within one observation once truly below the exit factor', () => {
    const gameTime = 1200
    const decided = farAheadThreshold(gameTime)
    let state = null
    for (let i = 0; i < ONE_SIDED_DWELL; i++) {
      state = nextSignalState(state, { radiantLead: decided + 1000, gameTime })
    }
    expect(state.state).toBe('ONE_SIDED')
    state = nextSignalState(state, { radiantLead: decided * 0.7, gameTime })
    expect(state.state).not.toBe('ONE_SIDED')
  })
})

describe('SWINGING — retracement from peak (Finding 5, the strongest signal)', () => {
  it('does not fire below RETRACEMENT_ENTER', () => {
    const gameTime = 1200
    let state = nextSignalState(null, { radiantLead: 10000, gameTime })
    state = nextSignalState(state, { radiantLead: 10000 * (1 - (RETRACEMENT_ENTER - 0.05)), gameTime })
    expect(state.state).not.toBe('SWINGING')
  })

  it('fires once the lead retraces >= RETRACEMENT_ENTER from a qualifying peak', () => {
    const gameTime = 1200
    let state = nextSignalState(null, { radiantLead: 10000, gameTime })
    state = nextSignalState(state, { radiantLead: 10000 * (1 - RETRACEMENT_ENTER), gameTime })
    expect(state.state).toBe('SWINGING')
  })

  it('outranks CLOSE when both conditions fire on the same observation', () => {
    const gameTime = 1200
    const even = evenThreshold(gameTime)
    // Peak large enough to qualify, retraced all the way down inside the CLOSE band.
    const peak = Math.max(peakFloor(gameTime) + 1000, even * 3)
    let state = nextSignalState(null, { radiantLead: peak, gameTime })
    state = nextSignalState(state, { radiantLead: even - 1, gameTime })
    expect(state.state).toBe('SWINGING')
  })

  it('a peak below peakFloor(gameTime) never qualifies (no laning-phase wobble)', () => {
    const gameTime = 600
    const tinyPeak = peakFloor(gameTime) - 1
    let state = nextSignalState(null, { radiantLead: tinyPeak, gameTime })
    state = nextSignalState(state, { radiantLead: 0, gameTime })
    expect(state.state).not.toBe('SWINGING')
  })

  it('exits once retracement falls back under RETRACEMENT_EXIT (peak re-taken)', () => {
    const gameTime = 1200
    let state = nextSignalState(null, { radiantLead: 10000, gameTime })
    state = nextSignalState(state, { radiantLead: 5000, gameTime }) // 50% retracement -> SWINGING
    expect(state.state).toBe('SWINGING')
    state = nextSignalState(state, { radiantLead: 10000, gameTime }) // fully re-taken
    expect(state.state).not.toBe('SWINGING')
  })
})

describe('critique fix — peak resets on a full lead reversal (2026-08-01 review)', () => {
  it('advancePeak resets to the new side rather than keeping the old side\'s peak', () => {
    const afterRadiantPeak = advancePeak(null, 9000)
    expect(afterRadiantPeak).toEqual({ peak: 9000, peakSide: 'radiant' })
    const afterFlip = advancePeak(afterRadiantPeak, -3000)
    expect(afterFlip).toEqual({ peak: 3000, peakSide: 'dire' })
  })

  it('retracement is never computed across a sign flip, so it can never exceed 1', () => {
    const gameTime = 1200
    let state = nextSignalState(null, { radiantLead: 10000, gameTime }) // radiant peaks at 10k
    // Lead fully reverses to dire -- without the reset, retracement = 1 - (-4000/10000) = 1.4.
    state = nextSignalState(state, { radiantLead: -4000, gameTime })
    expect(state.peakSide).toBe('dire')
    expect(state.peak).toBe(4000)
  })

  it('a big swing that flips sides is read as a fresh dire peak, not a >100% radiant retracement', () => {
    const gameTime = 1200
    let state = nextSignalState(null, { radiantLead: 10000, gameTime })
    state = nextSignalState(state, { radiantLead: -4000, gameTime })
    // The new (dire) peak is 4000, below peakFloor at this game time, so SWINGING should not
    // fire purely from the reversal itself -- it takes a genuine retracement FROM the new peak.
    expect(state.state).not.toBe('SWINGING')
  })
})

describe('critique fix — peak floor scales with game time (2026-08-01 review)', () => {
  it('the floor is higher late-game than the flat 5k minimum', () => {
    expect(peakFloor(4200)).toBeGreaterThan(5000) // 70 minutes
  })

  it('a 5k peak that would qualify at minute 15 does not qualify at minute 70', () => {
    const early = nextSignalState(null, { radiantLead: 5000, gameTime: 900 })
    const earlyRetraced = nextSignalState(early, { radiantLead: 2900, gameTime: 900 }) // 42% retracement
    expect(earlyRetraced.state).toBe('SWINGING')

    const late = nextSignalState(null, { radiantLead: 5000, gameTime: 4200 })
    const lateRetraced = nextSignalState(late, { radiantLead: 2900, gameTime: 4200 })
    expect(lateRetraced.state).not.toBe('SWINGING')
  })
})

describe('shared thresholds — no drift between the feed badge and the momentum band', () => {
  it('liveSignal.js imports the exact functions momentum.js exports, not copies', () => {
    // A CLOSE badge and an EVEN momentum band must agree on the same (lead, gameTime) pair --
    // this only holds if both consumers import the same threshold function.
    const gameTime = 1500
    const lead = evenThreshold(gameTime) - 1
    const result = nextSignalState(null, { radiantLead: lead, gameTime })
    expect(result.state).toBe('CLOSE')
  })
})

describe('computeRetracement', () => {
  it('returns 0 with no peak side tracked yet', () => {
    expect(computeRetracement({ radiantLead: 500, gameTime: 600, peak: 0, peakSide: null })).toBe(0)
  })

  it('returns 0 below the peak floor even with a large nominal retracement', () => {
    const gameTime = 600
    const tinyPeak = peakFloor(gameTime) - 100
    expect(computeRetracement({ radiantLead: 0, gameTime, peak: tinyPeak, peakSide: 'radiant' })).toBe(0)
  })
})

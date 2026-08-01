/**
 * Tests for src/utils/momentum.js — the Live Story "how's it going" (computeMomentum) and
 * "does this game matter" (computeStakes) pure helpers, both fed by data already resolved
 * elsewhere (the live pulse, the series match object).
 */

import { describe, it, expect } from 'vitest'
import { computeMomentum, computeStakes } from '../utils/momentum.js'

describe('computeMomentum — null/invalid input', () => {
  it('returns null for a non-finite radiantLead', () => {
    expect(computeMomentum({ radiantLead: NaN, gameTime: 600 })).toBeNull()
    expect(computeMomentum({ radiantLead: undefined, gameTime: 600 })).toBeNull()
  })

  it('returns null for a non-finite gameTime', () => {
    expect(computeMomentum({ radiantLead: 5000, gameTime: NaN })).toBeNull()
  })

  it('returns null during draft phase (negative gameTime)', () => {
    expect(computeMomentum({ radiantLead: 5000, gameTime: -79 })).toBeNull()
  })
})

describe('computeMomentum — EVEN band', () => {
  it('reads EVEN for a lead within the even threshold, regardless of game time', () => {
    const early = computeMomentum({ radiantLead: 500, gameTime: 60, radiantName: 'TS', direName: 'GG' })
    const late = computeMomentum({ radiantLead: -900, gameTime: 3000, radiantName: 'TS', direName: 'GG' })
    expect(early.band).toBe('EVEN')
    expect(late.band).toBe('EVEN')
  })

  it('EVEN has no leaderName or leadColor', () => {
    const result = computeMomentum({ radiantLead: 200, gameTime: 600, radiantName: 'TS', direName: 'GG' })
    expect(result.leaderName).toBeNull()
    expect(result.leadColor).toBeNull()
  })

  it('a zero lead is EVEN', () => {
    expect(computeMomentum({ radiantLead: 0, gameTime: 600, radiantName: 'TS', direName: 'GG' }).band).toBe('EVEN')
  })
})

describe('computeMomentum — threshold widens with game time (the core domain rule)', () => {
  it('the SAME lead magnitude is FAR_AHEAD early but only AHEAD late', () => {
    const lead = 7000
    const early = computeMomentum({ radiantLead: lead, gameTime: 60, radiantName: 'TS', direName: 'GG' })
    const late = computeMomentum({ radiantLead: lead, gameTime: 3000, radiantName: 'TS', direName: 'GG' })
    expect(early.band).toBe('FAR_AHEAD')
    expect(late.band).toBe('AHEAD')
  })

  it('a very large lead is FAR_AHEAD even late in the game', () => {
    // R0's ramp caps at 25,000 (minute 60), up from the old 15,000 (minute 40) — this lead must
    // clear the NEW cap, not just the old one.
    const result = computeMomentum({ radiantLead: 26000, gameTime: 3600, radiantName: 'TS', direName: 'GG' })
    expect(result.band).toBe('FAR_AHEAD')
  })

  it('threshold ramp holds flat past DECIDED_RAMP_END_MIN (60 min), not indefinitely rising', () => {
    // 30000 is chosen to discriminate a clamped ramp from an unclamped one: at t=5400 (90 min) an
    // unclamped linear ramp would put the threshold at 37,000 (this lead reads AHEAD), while the
    // correct clamped threshold holds at 25,000 from t=3600 (60 min) onward (this lead reads
    // FAR_AHEAD). A lead of exactly the cap (25000) can never expose a missing clamp, since it can
    // never exceed ANY threshold at or above 25000 whether or not the ramp is capped.
    const at60 = computeMomentum({ radiantLead: 30000, gameTime: 3600, radiantName: 'TS', direName: 'GG' })
    const at90 = computeMomentum({ radiantLead: 30000, gameTime: 5400, radiantName: 'TS', direName: 'GG' })
    expect(at60.band).toBe('FAR_AHEAD')
    expect(at90.band).toBe('FAR_AHEAD')
  })
})

describe('computeMomentum — attribution and color', () => {
  it('attributes the lead to radiantName when radiant is ahead', () => {
    const result = computeMomentum({ radiantLead: 8000, gameTime: 600, radiantName: 'Team Spirit', direName: 'Gaimin Gladiators' })
    expect(result.leaderName).toBe('Team Spirit')
    expect(result.leadColor).toBe('rgb(34,197,94)')
  })

  it('attributes the lead to direName when dire is ahead (negative radiantLead)', () => {
    const result = computeMomentum({ radiantLead: -8000, gameTime: 600, radiantName: 'Team Spirit', direName: 'Gaimin Gladiators' })
    expect(result.leaderName).toBe('Gaimin Gladiators')
    expect(result.leadColor).toBe('rgb(239,68,68)')
  })

  it('never attributes by series-header team order — only by the resolved game names passed in', () => {
    // Same lead sign, different game's side names (as would happen game 2 vs game 3 of a BO3
    // where sides swap) — attribution must follow the passed-in names, not any fixed order.
    const gameA = computeMomentum({ radiantLead: 5000, gameTime: 600, radiantName: 'Team Spirit', direName: 'Gaimin Gladiators' })
    const gameB = computeMomentum({ radiantLead: 5000, gameTime: 600, radiantName: 'Gaimin Gladiators', direName: 'Team Spirit' })
    expect(gameA.leaderName).toBe('Team Spirit')
    expect(gameB.leaderName).toBe('Gaimin Gladiators')
  })

  it('falls back to Radiant/Dire when the resolved game is missing a team name (a known OD /live gap)', () => {
    const radiantSide = computeMomentum({ radiantLead: 8000, gameTime: 600, radiantName: null, direName: 'Gaimin Gladiators' })
    expect(radiantSide.leaderName).toBe('Radiant')
    const direSide = computeMomentum({ radiantLead: -8000, gameTime: 600, radiantName: 'Team Spirit', direName: undefined })
    expect(direSide.leaderName).toBe('Dire')
  })
})

describe('computeStakes — scope (BO3/BO5 only)', () => {
  it('returns no stakes for BO1', () => {
    expect(computeStakes({ seriesLabel: 'BO1', seriesScore: '0-0', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })

  it('returns no stakes for BO2 (can end in a draw — see CONTEXT.md)', () => {
    expect(computeStakes({ seriesLabel: 'BO2', seriesScore: '1-0', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })

  it('returns no stakes for an unknown/missing seriesLabel', () => {
    expect(computeStakes({ seriesLabel: undefined, seriesScore: '1-0', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })
})

describe('computeStakes — BO3', () => {
  it('DECIDER at 1-1', () => {
    const result = computeStakes({ seriesLabel: 'BO3', seriesScore: '1-1', teamA: 'A', teamB: 'B' })
    expect(result.kind).toBe('DECIDER')
    expect(result.leaderName).toBeNull()
  })

  it('MATCH_POINT for team A leading 1-0', () => {
    const result = computeStakes({ seriesLabel: 'BO3', seriesScore: '1-0', teamA: 'A', teamB: 'B' })
    expect(result.kind).toBe('MATCH_POINT')
    expect(result.leaderName).toBe('A')
  })

  it('MATCH_POINT for team B leading 0-1', () => {
    const result = computeStakes({ seriesLabel: 'BO3', seriesScore: '0-1', teamA: 'A', teamB: 'B' })
    expect(result.kind).toBe('MATCH_POINT')
    expect(result.leaderName).toBe('B')
  })

  it('no stakes at 0-0 (series just started)', () => {
    expect(computeStakes({ seriesLabel: 'BO3', seriesScore: '0-0', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })
})

describe('computeStakes — BO5', () => {
  it('DECIDER at 2-2', () => {
    expect(computeStakes({ seriesLabel: 'BO5', seriesScore: '2-2', teamA: 'A', teamB: 'B' }).kind).toBe('DECIDER')
  })

  it('MATCH_POINT for team A leading 2-1 (not yet a decider)', () => {
    const result = computeStakes({ seriesLabel: 'BO5', seriesScore: '2-1', teamA: 'A', teamB: 'B' })
    expect(result.kind).toBe('MATCH_POINT')
    expect(result.leaderName).toBe('A')
  })

  it('no stakes at 1-0 (too early for match point in a BO5)', () => {
    expect(computeStakes({ seriesLabel: 'BO5', seriesScore: '1-0', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })
})

describe('computeStakes — malformed input', () => {
  it('returns no stakes when seriesScore is missing', () => {
    expect(computeStakes({ seriesLabel: 'BO3', seriesScore: undefined, teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })

  it('returns no stakes when seriesScore is not parseable', () => {
    expect(computeStakes({ seriesLabel: 'BO3', seriesScore: 'garbage', teamA: 'A', teamB: 'B' }).kind).toBeNull()
  })
})

/**
 * Tests for computeGameScore — the finished-game kill-score attribution used by the live-series
 * companion's SeriesGameScore. Reads OpenDota's own precomputed radiantScore/direScore (the same
 * field MatchDrawer.jsx's score digits read) and routes them onto winner/loser via radiantWin, a
 * boolean OpenDota already provides — kept as one shared source of truth instead of independently
 * re-summing player kills, so the two surfaces can never diverge. The component itself never
 * displays an OpenDota-sourced team name — only these two numbers — so there's no PS/OD naming
 * mismatch risk; this test focuses purely on the attribution arithmetic.
 */

import { describe, it, expect } from 'vitest'
import { computeGameScore } from '../src/components/SeriesGameScore.jsx'

describe('computeGameScore', () => {
  it('attributes radiant score to the winner when radiantWin is true', () => {
    const stats = { radiantWin: true, radiantScore: 18, direScore: 8 }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 18, loserScore: 8 })
  })

  it('attributes dire score to the winner when radiantWin is false', () => {
    const stats = { radiantWin: false, radiantScore: 18, direScore: 8 }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 8, loserScore: 18 })
  })

  it('returns null when radiantWin is not a boolean (unparsed match)', () => {
    expect(computeGameScore({ radiantWin: null, radiantScore: 18, direScore: 8 })).toBeNull()
    expect(computeGameScore({ radiantScore: 18, direScore: 8 })).toBeNull()
  })

  it('returns null when radiantScore/direScore are missing (not yet parsed)', () => {
    expect(computeGameScore({ radiantWin: true, radiantScore: null, direScore: null })).toBeNull()
    expect(computeGameScore({ radiantWin: true })).toBeNull()
    expect(computeGameScore({ radiantWin: true, radiantScore: 18 })).toBeNull()
  })

  it('returns null for null/undefined stats', () => {
    expect(computeGameScore(null)).toBeNull()
    expect(computeGameScore(undefined)).toBeNull()
  })

  it('handles a 0-0 scoreline without returning null (0 is a valid parsed score)', () => {
    const stats = { radiantWin: true, radiantScore: 0, direScore: 0 }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 0, loserScore: 0 })
  })
})

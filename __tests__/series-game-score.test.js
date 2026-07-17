/**
 * Tests for computeGameScore — the finished-game kill-score attribution used by the live-series
 * companion's SeriesGameScore. Sums each side's kills from match-stats' players[] and routes them
 * onto winner/loser via radiantWin, a boolean OpenDota already provides. The component itself never
 * displays an OpenDota-sourced team name — only these two numbers — so there's no PS/OD naming
 * mismatch risk; this test focuses purely on the attribution arithmetic.
 */

import { describe, it, expect } from 'vitest'
import { computeGameScore } from '../src/components/SeriesGameScore.jsx'

function player(isRadiant, kills) {
  return { isRadiant, kills }
}

describe('computeGameScore', () => {
  it('attributes radiant kills to the winner when radiantWin is true', () => {
    const stats = {
      radiantWin: true,
      players: [player(true, 10), player(true, 8), player(false, 5), player(false, 3)],
    }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 18, loserScore: 8 })
  })

  it('attributes dire kills to the winner when radiantWin is false', () => {
    const stats = {
      radiantWin: false,
      players: [player(true, 10), player(true, 8), player(false, 5), player(false, 3)],
    }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 8, loserScore: 18 })
  })

  it('returns null when radiantWin is not a boolean (unparsed match)', () => {
    expect(computeGameScore({ radiantWin: null, players: [player(true, 1)] })).toBeNull()
    expect(computeGameScore({ players: [player(true, 1)] })).toBeNull()
  })

  it('returns null when players is missing or empty', () => {
    expect(computeGameScore({ radiantWin: true, players: [] })).toBeNull()
    expect(computeGameScore({ radiantWin: true })).toBeNull()
  })

  it('returns null for null/undefined stats', () => {
    expect(computeGameScore(null)).toBeNull()
    expect(computeGameScore(undefined)).toBeNull()
  })

  it('treats a missing kills field as 0 rather than NaN', () => {
    const stats = { radiantWin: true, players: [{ isRadiant: true }, { isRadiant: false, kills: 5 }] }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 0, loserScore: 5 })
  })

  it('handles a 0-0 scoreline without returning null (0 is a valid parsed score)', () => {
    const stats = { radiantWin: true, players: [player(true, 0), player(false, 0)] }
    expect(computeGameScore(stats)).toEqual({ winnerScore: 0, loserScore: 0 })
  })
})

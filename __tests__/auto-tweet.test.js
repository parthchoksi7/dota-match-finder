/**
 * Unit tests for the auto-tweet (cron) utility functions exported from
 * api/draft-posts.js: isTier1, winsNeeded, seriesComplete, seriesResult.
 *
 * These are pure functions with no external dependencies, so no mocking needed.
 */

import { describe, it, expect } from 'vitest'
import { isTier1, winsNeeded, seriesComplete, seriesResult } from '../api/draft-posts.js'

// Helper to build a minimal OpenDota match record
function makeGame({ radiant_win = true, radiant_name = 'Team A', dire_name = 'Team B' } = {}) {
  return { radiant_win, radiant_name, dire_name }
}

// ── isTier1 ──────────────────────────────────────────────────────────────────

describe('isTier1', () => {
  it('returns true for known tier 1 league names', () => {
    expect(isTier1('DreamLeague Season 25')).toBe(true)
    expect(isTier1('ESL One Birmingham')).toBe(true)
    expect(isTier1('PGL Wallachia Season 3')).toBe(true)
    expect(isTier1('The International 2025')).toBe(true)
    expect(isTier1('BLAST Slam')).toBe(true)
    expect(isTier1('WePlay Esports')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isTier1('dreamleague season 25')).toBe(true)
    expect(isTier1('DREAMLEAGUE SEASON 25')).toBe(true)
  })

  it('returns false for non-tier-1 leagues', () => {
    expect(isTier1('Some Random League')).toBe(false)
    expect(isTier1('BetBoom Dacha')).toBe(false)
  })

  it('returns false for null or empty input', () => {
    expect(isTier1(null)).toBe(false)
    expect(isTier1('')).toBe(false)
    expect(isTier1(undefined)).toBe(false)
  })
})

// ── winsNeeded ───────────────────────────────────────────────────────────────

describe('winsNeeded', () => {
  it('returns 1 for BO1 (seriesType 0)', () => {
    expect(winsNeeded(0)).toBe(1)
  })

  it('returns 2 for BO3 (seriesType 1)', () => {
    expect(winsNeeded(1)).toBe(2)
  })

  it('returns 3 for BO5 (seriesType 2)', () => {
    expect(winsNeeded(2)).toBe(3)
  })

  it('returns 2 for BO2 (seriesType 3)', () => {
    expect(winsNeeded(3)).toBe(2)
  })

  it('defaults to 2 for unknown series types', () => {
    expect(winsNeeded(99)).toBe(2)
    expect(winsNeeded(undefined)).toBe(2)
  })
})

// ── seriesComplete ────────────────────────────────────────────────────────────

describe('seriesComplete', () => {
  it('is complete for a BO1 after 1 game', () => {
    expect(seriesComplete([makeGame()], 0)).toBe(true)
  })

  it('is complete for a BO3 when one team wins 2 games', () => {
    const games = [makeGame({ radiant_win: true }), makeGame({ radiant_win: true })]
    expect(seriesComplete(games, 1)).toBe(true)
  })

  it('is not complete for a BO3 after only 1 game', () => {
    expect(seriesComplete([makeGame()], 1)).toBe(false)
  })

  it('is complete for a BO3 after a 2-1 result', () => {
    const games = [
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
      makeGame({ radiant_win: true }),
    ]
    expect(seriesComplete(games, 1)).toBe(true)
  })

  it('is complete for a BO5 when one team wins 3 games', () => {
    const games = [
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
      makeGame({ radiant_win: true }),
    ]
    expect(seriesComplete(games, 2)).toBe(true)
  })

  it('is not complete for a BO5 after 2-2', () => {
    const games = [
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
    ]
    expect(seriesComplete(games, 2)).toBe(false)
  })

  it('handles fallback names when radiant_name or dire_name is missing', () => {
    const game = { radiant_win: true, radiant_name: null, dire_name: null }
    // Falls back to 'Radiant' and 'Dire' - should still complete a BO1
    expect(seriesComplete([game], 0)).toBe(true)
  })

  it('is complete for a BO2 draw (seriesType 3, 1-1 after 2 games)', () => {
    const games = [
      makeGame({ radiant_win: true,  radiant_name: 'Team A', dire_name: 'Team B' }),
      makeGame({ radiant_win: false, radiant_name: 'Team A', dire_name: 'Team B' }),
    ]
    expect(seriesComplete(games, 3)).toBe(true)
  })

  it('is complete for a BO2 draw (seriesType 1 fallback, 1-1 after 2 games)', () => {
    const games = [
      makeGame({ radiant_win: true,  radiant_name: 'Team A', dire_name: 'Team B' }),
      makeGame({ radiant_win: false, radiant_name: 'Team A', dire_name: 'Team B' }),
    ]
    expect(seriesComplete(games, 1)).toBe(true)
  })

  it('is not complete for a BO2 after only 1 game', () => {
    expect(seriesComplete([makeGame()], 3)).toBe(false)
  })
})

// ── seriesResult ─────────────────────────────────────────────────────────────

describe('seriesResult', () => {
  it('returns the correct winner and score for a 2-0 sweep', () => {
    const games = [
      makeGame({ radiant_win: true, radiant_name: 'Liquid', dire_name: 'OG' }),
      makeGame({ radiant_win: true, radiant_name: 'Liquid', dire_name: 'OG' }),
    ]
    expect(seriesResult(games)).toEqual({ winner: 'Liquid', score: '2-0' })
  })

  it('returns the correct winner and score for a 2-1 result', () => {
    const games = [
      makeGame({ radiant_win: true,  radiant_name: 'Liquid', dire_name: 'OG' }),
      makeGame({ radiant_win: false, radiant_name: 'Liquid', dire_name: 'OG' }),
      makeGame({ radiant_win: true,  radiant_name: 'Liquid', dire_name: 'OG' }),
    ]
    expect(seriesResult(games)).toEqual({ winner: 'Liquid', score: '2-1' })
  })

  it('returns the correct winner when dire wins the series', () => {
    const games = [
      makeGame({ radiant_win: false, radiant_name: 'Liquid', dire_name: 'OG' }),
      makeGame({ radiant_win: false, radiant_name: 'Liquid', dire_name: 'OG' }),
    ]
    expect(seriesResult(games)).toEqual({ winner: 'OG', score: '2-0' })
  })

  it('returns 1-1 score for a BO2 draw', () => {
    const games = [
      makeGame({ radiant_win: true,  radiant_name: 'Liquid', dire_name: 'OG' }),
      makeGame({ radiant_win: false, radiant_name: 'Liquid', dire_name: 'OG' }),
    ]
    const result = seriesResult(games)
    expect(result.score).toBe('1-1')
  })

  it('handles a full BO5 won 3-2', () => {
    const games = [
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
      makeGame({ radiant_win: true }),
      makeGame({ radiant_win: false }),
      makeGame({ radiant_win: true }),
    ]
    const result = seriesResult(games)
    expect(result.winner).toBe('Team A')
    expect(result.score).toBe('3-2')
  })
})

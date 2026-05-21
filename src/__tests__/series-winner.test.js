/**
 * Tests for seriesHasWinner — the pure helper in src/api.js that determines
 * whether the last series on a pagination page is complete.
 *
 * The root bug (fixed May 2026): the old code tracked wins by radiant/dire SIDE
 * rather than by team name, so a 2-0 sweep where the winner played once as radiant
 * and once as dire looked like a 1-1 tie — causing the series to be silently dropped.
 *
 * Regression case: PARIVISION vs Nigma Galaxy (DreamLeague S29, May 16 2026).
 * PARIVISION won game 1 as dire and game 2 as radiant → appeared as a 1-1 BO3.
 */

import { describe, it, expect } from 'vitest'
import { seriesHasWinner, normalizeRawNullSeriesIds } from '../api.js'

function makeGame(radiantName, direName, radiantWins, seriesType = 1) {
  return {
    radiant_name: radiantName,
    dire_name: direName,
    radiant_win: radiantWins,
    series_type: seriesType,
  }
}

describe('seriesHasWinner', () => {
  describe('regression: team winning games as both sides (the Parivision bug)', () => {
    it('returns true when one team wins 2-0, once as dire once as radiant (BO3)', () => {
      const games = [
        makeGame('Nigma Galaxy', 'PARIVISION', false), // PARIVISION wins as dire
        makeGame('PARIVISION', 'Nigma Galaxy', true),  // PARIVISION wins as radiant
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })

    it('returns false when series is genuinely 1-1 (different winners each game)', () => {
      const games = [
        makeGame('Team A', 'Team B', true),  // Team A wins
        makeGame('Team B', 'Team A', true),  // Team B wins
      ]
      expect(seriesHasWinner(games)).toBe(false)
    })
  })

  describe('BO1 (series_type=0)', () => {
    it('returns true after 1 game', () => {
      expect(seriesHasWinner([makeGame('A', 'B', true, 0)])).toBe(true)
    })
  })

  describe('BO3 (series_type=1)', () => {
    it('returns true on a 2-0 sweep (same side)', () => {
      const games = [
        makeGame('Team A', 'Team B', true),
        makeGame('Team A', 'Team B', true),
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })

    it('returns false after only 1 game', () => {
      expect(seriesHasWinner([makeGame('A', 'B', true, 1)])).toBe(false)
    })

    it('returns false after a 1-1 split (game 3 still to play)', () => {
      const games = [
        makeGame('Team A', 'Team B', true),
        makeGame('Team A', 'Team B', false),
      ]
      expect(seriesHasWinner(games)).toBe(false)
    })

    it('returns true after game 3 when one team reaches 2 wins', () => {
      const games = [
        makeGame('Team A', 'Team B', true),
        makeGame('Team A', 'Team B', false),
        makeGame('Team A', 'Team B', true),
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })
  })

  describe('BO5 (series_type=2)', () => {
    it('returns true when one team reaches 3 wins', () => {
      const games = [
        makeGame('A', 'B', true, 2),
        makeGame('A', 'B', true, 2),
        makeGame('A', 'B', false, 2),
        makeGame('A', 'B', true, 2),
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })

    it('returns false at 2-2 (game 5 still to play)', () => {
      const games = [
        makeGame('A', 'B', true, 2),
        makeGame('A', 'B', false, 2),
        makeGame('A', 'B', true, 2),
        makeGame('A', 'B', false, 2),
      ]
      expect(seriesHasWinner(games)).toBe(false)
    })
  })

  describe('BO2 (series_type=3)', () => {
    it('returns true when one team wins both games', () => {
      const games = [
        makeGame('A', 'B', true, 3),
        makeGame('A', 'B', true, 3),
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })

    it('returns false at 1-1 draw (BO2 ends but no outright winner)', () => {
      const games = [
        makeGame('A', 'B', true, 3),
        makeGame('A', 'B', false, 3),
      ]
      expect(seriesHasWinner(games)).toBe(false)
    })
  })

  describe('null / missing team names', () => {
    it('handles null radiant_name by falling back to "radiant" key', () => {
      const games = [
        { radiant_name: null, dire_name: 'Team B', radiant_win: true, series_type: 1 },
        { radiant_name: null, dire_name: 'Team B', radiant_win: true, series_type: 1 },
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })

    it('handles null dire_name by falling back to "dire" key', () => {
      const games = [
        { radiant_name: 'Team A', dire_name: null, radiant_win: false, series_type: 1 },
        { radiant_name: 'Team A', dire_name: null, radiant_win: false, series_type: 1 },
      ]
      expect(seriesHasWinner(games)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns false for empty array', () => {
      expect(seriesHasWinner([])).toBe(false)
    })

    it('returns false for null', () => {
      expect(seriesHasWinner(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(seriesHasWinner(undefined)).toBe(false)
    })
  })
})

// ── normalizeRawNullSeriesIds ─────────────────────────────────────────────────
//
// Regression: Tundra vs VP, DreamLeague S29, May 20 2026.
// G3 had series_id=null. The boundary guard only sees G1+G2 (both 1 win) →
// thinks it's an incomplete BO3 → drops G1+G2. With pre-normalization G3 is
// included in the win count → Tundra has 2 wins → series correctly kept.

describe('normalizeRawNullSeriesIds', () => {
  function rawGame(matchId, radiantName, direName, radiantWin, seriesId, startTime, leagueName = 'DreamLeague Season 29', seriesType = 1) {
    return { match_id: matchId, radiant_name: radiantName, dire_name: direName, radiant_win: radiantWin, series_id: seriesId, start_time: startTime, league_name: leagueName, series_type: seriesType }
  }

  it('assigns series_id to a null-series_id game that matches by teams + league + time', () => {
    const G1 = rawGame(1, 'Tundra Esports', 'Virtus.pro', false, 1099664, 10000)
    const G2 = rawGame(2, 'Virtus.pro', 'Tundra Esports', false, 1099664, 14000)
    const G3 = rawGame(3, 'Virtus.pro', 'Tundra Esports', false, null, 18000)
    normalizeRawNullSeriesIds([G1, G2, G3])
    expect(G3.series_id).toBe(1099664)
  })

  it('copies series_type from the representative onto the null-id game', () => {
    const G1 = rawGame(1, 'Team A', 'Team B', true, 9001, 10000, 'ESL One', 1)
    const G3 = rawGame(3, 'Team A', 'Team B', true, null, 12000, 'ESL One', null)
    normalizeRawNullSeriesIds([G1, G3])
    expect(G3.series_type).toBe(1)
  })

  it('does not assign series_id when league differs', () => {
    const G1 = rawGame(1, 'Team A', 'Team B', true, 9001, 10000, 'DreamLeague')
    const G3 = rawGame(3, 'Team A', 'Team B', true, null, 12000, 'ESL One')
    normalizeRawNullSeriesIds([G1, G3])
    expect(G3.series_id).toBeNull()
  })

  it('does not assign series_id when teams differ', () => {
    const G1 = rawGame(1, 'Team A', 'Team B', true, 9001, 10000)
    const G3 = rawGame(3, 'Team A', 'Team C', true, null, 12000)
    normalizeRawNullSeriesIds([G1, G3])
    expect(G3.series_id).toBeNull()
  })

  it('does not assign series_id when time gap exceeds 12h', () => {
    const G1 = rawGame(1, 'Team A', 'Team B', true, 9001, 0)
    const G3 = rawGame(3, 'Team A', 'Team B', true, null, 12 * 3600 + 1)
    normalizeRawNullSeriesIds([G1, G3])
    expect(G3.series_id).toBeNull()
  })

  it('handles an empty array without throwing', () => {
    expect(() => normalizeRawNullSeriesIds([])).not.toThrow()
  })

  it('combined: boundary guard correctly keeps a BO3 where G3 has null series_id', () => {
    // Regression: Tundra vs VP. G1: VP wins, G2: Tundra wins, G3: Tundra wins (null id).
    // Without pre-normalization, guard sees G1+G2 as 1-1 incomplete → drops them.
    // With pre-normalization, G3 gets series_id assigned → Tundra has 2 wins → kept.
    const G1 = rawGame(100, 'Tundra Esports', 'Virtus.pro', false, 1099664, 10000)
    const G2 = rawGame(101, 'Virtus.pro', 'Tundra Esports', false, 1099664, 14000)
    const G3 = rawGame(102, 'Virtus.pro', 'Tundra Esports', false, null,    18000)
    const allMatches = [G3, G2, G1] // newest-first
    normalizeRawNullSeriesIds(allMatches)
    expect(G3.series_id).toBe(1099664)
    const seriesGames = allMatches.filter(m => m.series_id === 1099664)
    expect(seriesHasWinner(seriesGames)).toBe(true)
  })
})

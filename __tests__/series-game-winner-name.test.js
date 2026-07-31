/**
 * Tests for resolveWinnerName — the finished-game winner-name fallback used by the live-series
 * companion when PandaScore's live-feed winner.id hasn't caught up yet but the game's OpenDota
 * match id has already resolved. Deliberately never returns a raw OpenDota team name: it resolves
 * which of the series' own trusted PandaScore names (teamA/teamB) was Radiant via
 * resolveRadiantSide(), then returns that name — or null when the pairing doesn't cleanly
 * resolve, so the caller's neutral "Game N" fallback stays in place instead of a guess.
 */

import { describe, it, expect } from 'vitest'
import { resolveWinnerName } from '../src/components/SeriesGameWinnerName.jsx'

describe('resolveWinnerName', () => {
  it('resolves the PS teamA name when radiant won and teamA was Radiant', () => {
    const stats = { radiantWin: true, radiantName: 'Team Falcons', direName: 'Xtreme Gaming' }
    expect(resolveWinnerName(stats, 'Team Falcons', 'Xtreme Gaming')).toBe('Team Falcons')
  })

  it('resolves the PS teamB name when dire won and teamB was Dire', () => {
    const stats = { radiantWin: false, radiantName: 'Team Falcons', direName: 'Xtreme Gaming' }
    expect(resolveWinnerName(stats, 'Team Falcons', 'Xtreme Gaming')).toBe('Xtreme Gaming')
  })

  it('resolves correctly even when sides are swapped relative to teamA/teamB order', () => {
    const stats = { radiantWin: true, radiantName: 'Xtreme Gaming', direName: 'Team Falcons' }
    expect(resolveWinnerName(stats, 'Team Falcons', 'Xtreme Gaming')).toBe('Xtreme Gaming')
  })

  it('resolves via a known alias divergence (1win / Tundra Esports)', () => {
    const stats = { radiantWin: true, radiantName: 'Tundra Esports', direName: 'Vici Gaming' }
    expect(resolveWinnerName(stats, '1win', 'Vici Gaming')).toBe('1win')
  })

  it('returns null when radiantWin is not a boolean (unparsed match)', () => {
    expect(resolveWinnerName({ radiantWin: null, radiantName: 'A', direName: 'B' }, 'A', 'B')).toBeNull()
    expect(resolveWinnerName({ radiantName: 'A', direName: 'B' }, 'A', 'B')).toBeNull()
  })

  it('returns null when the OD names do not resolve to either PS team (never guesses)', () => {
    const stats = { radiantWin: true, radiantName: 'OG', direName: 'Liquid' }
    expect(resolveWinnerName(stats, 'Team Spirit', 'Tundra')).toBeNull()
  })

  it('returns null for null/undefined stats', () => {
    expect(resolveWinnerName(null, 'A', 'B')).toBeNull()
    expect(resolveWinnerName(undefined, 'A', 'B')).toBeNull()
  })
})

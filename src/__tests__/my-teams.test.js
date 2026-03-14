/**
 * Tests for the My Teams follow system.
 *
 * Covers the pure logic used by getFollowedTeams/setFollowedTeams (utils.js)
 * and the match-filtering logic used by MyTeamsSection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getFollowedTeams, setFollowedTeams, groupIntoSeries, isSeriesComplete } from '../utils'

// ── localStorage helpers ───────────────────────────────────────────────────

describe('getFollowedTeams', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty array when nothing is stored', () => {
    expect(getFollowedTeams()).toEqual([])
  })

  it('returns parsed array from localStorage', () => {
    localStorage.setItem('followedTeams', JSON.stringify(['Team Spirit', 'OG']))
    expect(getFollowedTeams()).toEqual(['Team Spirit', 'OG'])
  })

  it('returns empty array when stored value is malformed JSON', () => {
    localStorage.setItem('followedTeams', 'not-json}}}')
    expect(getFollowedTeams()).toEqual([])
  })

  it('returns empty array when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(getFollowedTeams()).toEqual([])
    spy.mockRestore()
  })
})

describe('setFollowedTeams', () => {
  beforeEach(() => localStorage.clear())

  it('writes the array to localStorage', () => {
    setFollowedTeams(['Team Spirit', 'Tundra'])
    expect(localStorage.getItem('followedTeams')).toBe(JSON.stringify(['Team Spirit', 'Tundra']))
  })

  it('overwrites a previous value', () => {
    setFollowedTeams(['Team Spirit'])
    setFollowedTeams(['OG'])
    expect(localStorage.getItem('followedTeams')).toBe(JSON.stringify(['OG']))
  })

  it('writes empty array without throwing', () => {
    expect(() => setFollowedTeams([])).not.toThrow()
    expect(localStorage.getItem('followedTeams')).toBe('[]')
  })

  it('does not throw when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full')
    })
    expect(() => setFollowedTeams(['Team Spirit'])).not.toThrow()
    spy.mockRestore()
  })
})

// ── round-trip ─────────────────────────────────────────────────────────────

describe('getFollowedTeams / setFollowedTeams round-trip', () => {
  beforeEach(() => localStorage.clear())

  it('stores and retrieves followed teams unchanged', () => {
    const teams = ['Team Spirit', 'Gaimin Gladiators', 'OG']
    setFollowedTeams(teams)
    expect(getFollowedTeams()).toEqual(teams)
  })

  it('reflects removal of a team', () => {
    setFollowedTeams(['Team Spirit', 'OG'])
    const current = getFollowedTeams()
    setFollowedTeams(current.filter(t => t !== 'OG'))
    expect(getFollowedTeams()).toEqual(['Team Spirit'])
  })
})

// ── match filtering (mirrors MyTeamsSection logic) ─────────────────────────

function makeGame(overrides = {}) {
  return {
    id: String(Math.random()),
    radiantTeam: 'Team A',
    direTeam: 'Team B',
    radiantWin: true,
    tournament: 'DreamLeague S25',
    date: 'Mar 14, 2026',
    startTime: 1741900000,
    seriesId: 1,
    seriesType: 1,
    duration: '0:45',
    ...overrides,
  }
}

function filterMatchesForFollowed(matches, followedTeams) {
  return matches.filter(
    m => followedTeams.includes(m.radiantTeam) || followedTeams.includes(m.direTeam)
  )
}

describe('My Teams match filtering', () => {
  // Spirit 2-0 OG (complete BO3), Tundra 2-0 Liquid (complete BO3), Falcons 1-0 BetBoom (complete BO1)
  const matches = [
    makeGame({ id: '1', radiantTeam: 'Team Spirit', direTeam: 'OG', radiantWin: true, seriesId: 10, startTime: 1741900100 }),
    makeGame({ id: '2', radiantTeam: 'Team Spirit', direTeam: 'OG', radiantWin: true, seriesId: 10, startTime: 1741900200 }),
    makeGame({ id: '3', radiantTeam: 'Tundra', direTeam: 'Liquid', radiantWin: true, seriesId: 20, startTime: 1741900300 }),
    makeGame({ id: '4', radiantTeam: 'Tundra', direTeam: 'Liquid', radiantWin: true, seriesId: 20, startTime: 1741900400 }),
    makeGame({ id: '5', radiantTeam: 'Falcons', direTeam: 'BetBoom', radiantWin: true, seriesId: 30, seriesType: 0, startTime: 1741900500 }),
  ]

  it('returns no matches when followed teams list is empty', () => {
    expect(filterMatchesForFollowed(matches, [])).toHaveLength(0)
  })

  it('returns matches where radiant team is followed', () => {
    const result = filterMatchesForFollowed(matches, ['Team Spirit'])
    expect(result).toHaveLength(2)
    result.forEach(m => expect(m.radiantTeam).toBe('Team Spirit'))
  })

  it('returns matches where dire team is followed', () => {
    const result = filterMatchesForFollowed(matches, ['Liquid'])
    expect(result).toHaveLength(2)
    result.forEach(m => expect(m.direTeam).toBe('Liquid'))
  })

  it('returns matches for multiple followed teams without duplicates', () => {
    const result = filterMatchesForFollowed(matches, ['Team Spirit', 'Tundra'])
    expect(result).toHaveLength(4)
  })

  it('returns nothing when followed team has no matches', () => {
    const result = filterMatchesForFollowed(matches, ['Navi'])
    expect(result).toHaveLength(0)
  })

  it('filtered matches group correctly into series', () => {
    const filtered = filterMatchesForFollowed(matches, ['Team Spirit'])
    const series = groupIntoSeries(filtered)
    expect(series).toHaveLength(1)
    expect(series[0].games).toHaveLength(2)
  })

  it('filtered series include only complete series', () => {
    // 1-game series is complete (BO1), and both Spirit vs OG games resolve to a winner
    const filtered = filterMatchesForFollowed(matches, ['Team Spirit'])
    const series = groupIntoSeries(filtered)
    const complete = series.filter(isSeriesComplete)
    expect(complete).toHaveLength(1)
  })
})

// ── toggle logic (mirrors App.jsx handleToggleFollow) ─────────────────────

function toggleFollowedTeam(current, teamName) {
  const isFollowed = current.includes(teamName)
  return isFollowed ? current.filter(t => t !== teamName) : [...current, teamName]
}

describe('follow toggle logic', () => {
  it('adds a team when not followed', () => {
    expect(toggleFollowedTeam([], 'Team Spirit')).toEqual(['Team Spirit'])
  })

  it('removes a team when already followed', () => {
    expect(toggleFollowedTeam(['Team Spirit', 'OG'], 'OG')).toEqual(['Team Spirit'])
  })

  it('does not add duplicates', () => {
    const result = toggleFollowedTeam(['Team Spirit'], 'Team Spirit')
    expect(result).toEqual([])
  })

  it('preserves order of remaining teams when removing', () => {
    const result = toggleFollowedTeam(['Spirit', 'OG', 'Tundra'], 'OG')
    expect(result).toEqual(['Spirit', 'Tundra'])
  })
})

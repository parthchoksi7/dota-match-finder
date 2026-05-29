/**
 * Tests for findOdMatchByTime — the PS→OD match ID resolution function used by
 * ?mode=recent-completed to resolve real OD match IDs without relying on
 * PS external_identifier (which is only populated after OD indexes the match).
 *
 * Strategy: timestamp is the primary key (±15 min window). Team names break ties
 * when multiple OD matches fall in the window. Uses bidirectional substring matching,
 * same as match-streams.js teamsMatch() — the canonical PS↔OD name matching pattern.
 */

import { describe, it, expect } from 'vitest'
import { findOdMatchByTime } from '../api/_shared.js'

function makeOdMatch(matchId, startTime, radiantName, direName) {
  return {
    match_id: matchId,
    start_time: startTime,
    radiant_team: { name: radiantName },
    dire_team: { name: direName },
  }
}

function makeOpp(name) {
  return { opponent: { name } }
}

describe('findOdMatchByTime', () => {
  it('returns null when no OD matches provided', () => {
    expect(findOdMatchByTime([], 1000, [])).toBeNull()
  })

  it('returns null when no OD match is within ±15 min', () => {
    const odMatches = [makeOdMatch(1, 1000, 'Team A', 'Team B')]
    expect(findOdMatchByTime(odMatches, 1000 + 901, [])).toBeNull()
    expect(findOdMatchByTime(odMatches, 1000 - 901, [])).toBeNull()
  })

  it('returns exact match when timestamp is within ±15 min', () => {
    const odMatches = [makeOdMatch(99, 1000, 'Team A', 'Team B')]
    const result = findOdMatchByTime(odMatches, 1002, [])  // 2 seconds off
    expect(result?.match_id).toBe(99)
  })

  it('returns match when timestamp is within ±15 min window (exclusive at boundary)', () => {
    const odMatches = [makeOdMatch(99, 1000, 'Team A', 'Team B')]
    expect(findOdMatchByTime(odMatches, 1899, [])).not.toBeNull()  // 899s — inside
    expect(findOdMatchByTime(odMatches, 1900, [])).toBeNull()       // 900s — outside
  })

  it('with single candidate, returns it regardless of team names (timestamp is sufficient)', () => {
    const odMatches = [makeOdMatch(42, 5000, 'Nigma Galaxy', 'BB')]
    // PS has different names for the same teams
    const opponents = [makeOpp('BetBoom Team'), makeOpp('Nigma Galaxy')]
    const result = findOdMatchByTime(odMatches, 5010, opponents)
    expect(result?.match_id).toBe(42)
  })

  it('BB vs BetBoom Team: resolves via timestamp uniqueness (no name match required)', () => {
    // This is the exact bug case: OD uses "BB", PS uses "BetBoom Team"
    // Substring match fails: "bb" not in "betboom team", "betboom team" not in "bb"
    // But timestamp uniquely identifies the match
    const odMatches = [makeOdMatch(8814771003, 1747000000, 'Nigma Galaxy', 'BB')]
    const opponents = [makeOpp('BetBoom Team'), makeOpp('Nigma Galaxy')]
    const result = findOdMatchByTime(odMatches, 1747000060, opponents)  // 60s off
    expect(result?.match_id).toBe(8814771003)
  })

  it('with multiple candidates, uses team name tiebreaker (exact pair match)', () => {
    const T = 10000
    const odMatches = [
      makeOdMatch(1, T, 'Team A', 'Team B'),   // wrong match
      makeOdMatch(2, T + 10, 'Team C', 'Team D'),  // correct match
    ]
    const opponents = [makeOpp('Team C'), makeOpp('Team D')]
    const result = findOdMatchByTime(odMatches, T + 5, opponents)
    expect(result?.match_id).toBe(2)
  })

  it('with multiple candidates, team name tiebreaker is order-independent', () => {
    const T = 10000
    const odMatches = [
      makeOdMatch(1, T, 'Aurora Gaming', 'Gaimin Gladiators'),
      makeOdMatch(2, T + 50, 'Team Liquid', 'Vici Gaming'),
    ]
    // PS has Vici as first, Liquid as second
    const opponents = [makeOpp('Vici Gaming'), makeOpp('Team Liquid')]
    const result = findOdMatchByTime(odMatches, T + 40, opponents)
    expect(result?.match_id).toBe(2)
  })

  it('with multiple candidates, team name substring match handles truncated names', () => {
    const T = 20000
    const odMatches = [
      makeOdMatch(1, T, 'Aurora Gaming', 'Team Spirit'),  // "Aurora Gaming" contains "Aurora"
      makeOdMatch(2, T + 100, 'Team Liquid', 'Vici Gaming'),
    ]
    const opponents = [makeOpp('Aurora'), makeOpp('Team Spirit')]
    const result = findOdMatchByTime(odMatches, T + 50, opponents)
    expect(result?.match_id).toBe(1)
  })

  it('with multiple candidates and no team name match, falls back to closest timestamp', () => {
    const T = 30000
    const odMatches = [
      makeOdMatch(1, T, 'Team X', 'Team Y'),
      makeOdMatch(2, T + 200, 'Team X', 'Team Y'),  // same names, further in time
    ]
    const opponents = [makeOpp('Team X'), makeOpp('Team Y')]
    // Both match by name — fallback to closest
    const result = findOdMatchByTime(odMatches, T + 10, opponents)
    expect(result?.match_id).toBe(1)  // closest to T+10
  })

  it('handles null/missing team names gracefully', () => {
    const odMatches = [
      makeOdMatch(1, 1000, 'Team A', 'Team B'),
      makeOdMatch(2, 1050, 'Team C', 'Team D'),
    ]
    // No opponents provided — falls back to closest timestamp
    const result = findOdMatchByTime(odMatches, 1040, [])
    expect(result?.match_id).toBe(2)
  })

  it('handles OD match with null radiant/dire team', () => {
    const T = 5000
    const odMatches = [
      { match_id: 99, start_time: T, radiant_team: null, dire_team: null },
    ]
    const result = findOdMatchByTime(odMatches, T, [makeOpp('Team A'), makeOpp('Team B')])
    // Only 1 candidate — returns it even without team name data
    expect(result?.match_id).toBe(99)
  })

  it('does not match OD entries with null team names even if closer in time', () => {
    // Reproduces the Road to EWC bug: many concurrent qualifiers have null dire_name
    // and started just seconds before the BLAST SLAM VII game. Before the fix, the null
    // dire_name caused sub('og', '') = true (empty string always matches), so the qualifier
    // was incorrectly selected as the exact match.
    const T = 10000
    const odMatches = [
      { match_id: 99, start_time: T + 6, radiant_name: 'Yellow Submarine', dire_name: null },
      { match_id: 42, start_time: T + 357, radiant_name: 'Aurora Gaming', dire_name: 'OG' },
    ]
    const opponents = [makeOpp('Aurora'), makeOpp('OG')]
    const result = findOdMatchByTime(odMatches, T + 400, opponents)
    expect(result?.match_id).toBe(42)
  })

  it('time fallback prefers named matches over null-named matches', () => {
    const T = 10000
    const odMatches = [
      { match_id: 1, start_time: T + 5, radiant_name: null, dire_name: null },
      { match_id: 2, start_time: T + 300, radiant_name: 'Team A', dire_name: 'Team B' },
    ]
    const opponents = [makeOpp('Team C'), makeOpp('Team D')]
    const result = findOdMatchByTime(odMatches, T, opponents)
    expect(result?.match_id).toBe(2)
  })

  it('tiebreaker works with flat radiant_name/dire_name shape (OD promatches format)', () => {
    // OD /api/promatches returns radiant_name and dire_name as flat fields,
    // not radiant_team.name — the tiebreaker must handle both shapes.
    const T = 50000
    const odMatches = [
      { match_id: 1, start_time: T + 295, radiant_name: 'Teiko', dire_name: 'Nethercore' },
      { match_id: 2, start_time: T - 67,  radiant_name: 'PlayTime', dire_name: 'Team Falcons' },
    ]
    const opponents = [makeOpp('PlayTime'), makeOpp('Team Falcons')]
    const result = findOdMatchByTime(odMatches, T, opponents)
    expect(result?.match_id).toBe(2)  // must pick the correct match, not Teiko vs Nethercore
  })
})

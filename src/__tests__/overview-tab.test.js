/**
 * Tests for the Overview tab data derivation logic introduced for ongoing tournaments.
 *
 * These tests verify the pure transformations that TournamentHub computes from
 * effectiveDetail.bracket before rendering: liveMatches, upcomingMatches, and currentRound.
 */

import { describe, it, expect } from 'vitest'

// --- helpers that mirror the component logic verbatim ---

function deriveLiveMatches(bracket) {
  const all = (bracket || []).flatMap(r => r.matches)
  return all.filter(m => m.status === 'running')
}

function deriveUpcomingMatches(bracket) {
  const all = (bracket || []).flatMap(r => r.matches)
  return all
    .filter(m => m.status === 'not_started' && !(m.teamA === 'TBD' && m.teamB === 'TBD'))
    .sort((a, b) => {
      if (!a.scheduledAt && !b.scheduledAt) return 0
      if (!a.scheduledAt) return 1
      if (!b.scheduledAt) return -1
      return new Date(a.scheduledAt) - new Date(b.scheduledAt)
    })
    .slice(0, 3)
}

function deriveCurrentRound(bracket) {
  if (!bracket?.length) return null
  const active = bracket.filter(r =>
    r.matches.some(m => m.status === 'running' || m.status === 'finished')
  )
  return active.length ? Math.max(...active.map(r => r.round)) : null
}

// --- test data builders ---

function makeMatch(overrides = {}) {
  return {
    id: Math.random(),
    teamA: 'Team A',
    teamB: 'Team B',
    status: 'not_started',
    scheduledAt: null,
    scoreA: null,
    scoreB: null,
    ...overrides,
  }
}

function makeRound(round, matches) {
  return { round, matches }
}

// --- liveMatches ---

describe('deriveLiveMatches', () => {
  it('returns empty array when bracket is empty', () => {
    expect(deriveLiveMatches([])).toEqual([])
  })

  it('returns empty array when bracket is undefined', () => {
    expect(deriveLiveMatches(undefined)).toEqual([])
  })

  it('returns only running matches', () => {
    const bracket = [
      makeRound(1, [
        makeMatch({ status: 'finished' }),
        makeMatch({ status: 'running', teamA: 'Spirit', teamB: 'Liquid' }),
        makeMatch({ status: 'not_started' }),
      ]),
    ]
    const result = deriveLiveMatches(bracket)
    expect(result).toHaveLength(1)
    expect(result[0].teamA).toBe('Spirit')
  })

  it('returns multiple live matches across rounds', () => {
    const bracket = [
      makeRound(1, [makeMatch({ status: 'running' })]),
      makeRound(2, [makeMatch({ status: 'running' })]),
    ]
    expect(deriveLiveMatches(bracket)).toHaveLength(2)
  })
})

// --- upcomingMatches ---

describe('deriveUpcomingMatches', () => {
  it('returns empty array when bracket is empty', () => {
    expect(deriveUpcomingMatches([])).toEqual([])
  })

  it('excludes TBD vs TBD matches', () => {
    const bracket = [
      makeRound(1, [
        makeMatch({ teamA: 'TBD', teamB: 'TBD', status: 'not_started' }),
        makeMatch({ teamA: 'Spirit', teamB: 'Tundra', status: 'not_started' }),
      ]),
    ]
    const result = deriveUpcomingMatches(bracket)
    expect(result).toHaveLength(1)
    expect(result[0].teamA).toBe('Spirit')
  })

  it('excludes running and finished matches', () => {
    const bracket = [
      makeRound(1, [
        makeMatch({ status: 'running' }),
        makeMatch({ status: 'finished' }),
        makeMatch({ status: 'not_started', teamA: 'G2', teamB: 'Falcons' }),
      ]),
    ]
    const result = deriveUpcomingMatches(bracket)
    expect(result).toHaveLength(1)
    expect(result[0].teamA).toBe('G2')
  })

  it('caps result at 3 matches', () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      makeMatch({ status: 'not_started', teamA: `T${i}`, teamB: `T${i + 10}` })
    )
    const bracket = [makeRound(1, matches)]
    expect(deriveUpcomingMatches(bracket)).toHaveLength(3)
  })

  it('sorts by scheduledAt ascending, unscheduled last', () => {
    const bracket = [
      makeRound(1, [
        makeMatch({ status: 'not_started', teamA: 'Late', scheduledAt: '2026-03-13T18:00:00Z' }),
        makeMatch({ status: 'not_started', teamA: 'Unscheduled', scheduledAt: null }),
        makeMatch({ status: 'not_started', teamA: 'Early', scheduledAt: '2026-03-13T14:00:00Z' }),
      ]),
    ]
    const result = deriveUpcomingMatches(bracket)
    expect(result.map(m => m.teamA)).toEqual(['Early', 'Late', 'Unscheduled'])
  })
})

// --- currentRound ---

describe('deriveCurrentRound', () => {
  it('returns null when bracket is empty', () => {
    expect(deriveCurrentRound([])).toBeNull()
  })

  it('returns null when bracket is undefined', () => {
    expect(deriveCurrentRound(undefined)).toBeNull()
  })

  it('returns null when no match is running or finished', () => {
    const bracket = [
      makeRound(1, [makeMatch({ status: 'not_started' })]),
    ]
    expect(deriveCurrentRound(bracket)).toBeNull()
  })

  it('returns the round number of the highest active round', () => {
    const bracket = [
      makeRound(1, [makeMatch({ status: 'finished' })]),
      makeRound(2, [makeMatch({ status: 'running' })]),
      makeRound(3, [makeMatch({ status: 'not_started' })]),
    ]
    expect(deriveCurrentRound(bracket)).toBe(2)
  })

  it('picks the highest round when multiple rounds have active matches', () => {
    const bracket = [
      makeRound(1, [makeMatch({ status: 'finished' })]),
      makeRound(2, [makeMatch({ status: 'finished' })]),
      makeRound(3, [makeMatch({ status: 'running' })]),
    ]
    expect(deriveCurrentRound(bracket)).toBe(3)
  })
})

// --- standings snapshot logic ---

describe('standings snapshot - zone detection', () => {
  // Mirrors the showZones / isEliminated logic in the Overview standings section
  function computeZones(standings) {
    const showZones = standings.length >= 4
    const midpoint = Math.ceil(standings.length / 2)
    return standings.map((s, i) => ({
      team: s.team,
      showZones,
      isEliminated: showZones && i >= midpoint && s.losses > s.wins,
    }))
  }

  it('does not show zones when fewer than 4 teams', () => {
    const standings = [
      { team: 'A', wins: 2, losses: 0 },
      { team: 'B', wins: 1, losses: 1 },
      { team: 'C', wins: 0, losses: 2 },
    ]
    const result = computeZones(standings)
    expect(result.every(r => r.showZones === false)).toBe(true)
  })

  it('marks bottom-half losing teams as eliminated', () => {
    const standings = [
      { team: 'A', wins: 3, losses: 0 },
      { team: 'B', wins: 2, losses: 1 },
      { team: 'C', wins: 1, losses: 2 },
      { team: 'D', wins: 0, losses: 3 },
    ]
    const result = computeZones(standings)
    // midpoint = ceil(4/2) = 2; bottom half is i >= 2
    expect(result[0].isEliminated).toBe(false) // top half
    expect(result[1].isEliminated).toBe(false) // top half
    expect(result[2].isEliminated).toBe(true)  // bottom half, 2 losses > 1 win
    expect(result[3].isEliminated).toBe(true)  // bottom half, 3 losses > 0 wins
  })

  it('does not mark a top-half team as eliminated even with a losing record', () => {
    const standings = [
      { team: 'A', wins: 1, losses: 2 },
      { team: 'B', wins: 1, losses: 2 },
      { team: 'C', wins: 1, losses: 2 },
      { team: 'D', wins: 0, losses: 3 },
    ]
    const result = computeZones(standings)
    // Only i >= ceil(4/2)=2 can be eliminated
    expect(result[0].isEliminated).toBe(false)
    expect(result[1].isEliminated).toBe(false)
  })
})

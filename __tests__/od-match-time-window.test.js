/**
 * Guards OD_MATCH_TIME_WINDOW_S — the ±seconds window within which an OpenDota game may be
 * correlated to a PandaScore series game.
 *
 * Why this file exists: the value used to be a bare `900` literal inside findOdMatchByTime plus a
 * hand-copied `const LGM_WINDOW_S = 900` in api/_handlers/liveSeriesGames.js and
 * api/_handlers/liveGamePulse.js. Those two handlers use it to bound their live_game_map Supabase
 * range queries BEFORE handing rows to findOdMatchByTime. If a caller's pre-filter is narrower
 * than the matcher's own window, correlatable games are dropped before the matcher ever sees them
 * — silently, as an unresolved game ("stats indexing" in the UI), with no error anywhere.
 *
 * So the constant and the matcher's actual filtering behavior must stay in lockstep. These tests
 * pin both: the exported value, and that findOdMatchByTime really honors it at the boundary.
 */

import { describe, it, expect } from 'vitest'
import { findOdMatchByTime, OD_MATCH_TIME_WINDOW_S } from '../api/_shared.js'

const OPPONENTS = [
  { opponent: { name: 'Team Liquid' } },
  { opponent: { name: 'Tundra Esports' } },
]

function odGame(startTime, extra = {}) {
  return {
    match_id: 1,
    start_time: startTime,
    radiant_name: 'Team Liquid',
    dire_name: 'Tundra Esports',
    ...extra,
  }
}

describe('OD_MATCH_TIME_WINDOW_S', () => {
  it('is 900s — the value liveSeriesGames.js and liveGamePulse.js range-query on', () => {
    // Not a tautology: these handlers build `start_time >= beginAt - X` / `<= beginAt + X`
    // Supabase filters from this export. Changing it silently changes how wide those reads are.
    expect(OD_MATCH_TIME_WINDOW_S).toBe(900)
  })
})

describe('findOdMatchByTime honors OD_MATCH_TIME_WINDOW_S', () => {
  const BEGIN = 1_700_000_000

  it('matches a game inside the window on the late side', () => {
    const game = odGame(BEGIN + OD_MATCH_TIME_WINDOW_S - 1)
    expect(findOdMatchByTime([game], BEGIN, OPPONENTS)).toBe(game)
  })

  it('matches a game inside the window on the early side', () => {
    const game = odGame(BEGIN - OD_MATCH_TIME_WINDOW_S + 1)
    expect(findOdMatchByTime([game], BEGIN, OPPONENTS)).toBe(game)
  })

  it('rejects a game exactly at the window edge (comparison is strict <)', () => {
    expect(findOdMatchByTime([odGame(BEGIN + OD_MATCH_TIME_WINDOW_S)], BEGIN, OPPONENTS)).toBeNull()
    expect(findOdMatchByTime([odGame(BEGIN - OD_MATCH_TIME_WINDOW_S)], BEGIN, OPPONENTS)).toBeNull()
  })

  it('rejects a game beyond the window even when both team names match exactly', () => {
    // Team names must never widen the time window — timestamp is the primary key.
    const game = odGame(BEGIN + OD_MATCH_TIME_WINDOW_S + 60)
    expect(findOdMatchByTime([game], BEGIN, OPPONENTS)).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(findOdMatchByTime([], BEGIN, OPPONENTS)).toBeNull()
  })

  it('breaks a tie inside the window by exact team-pair match, not by proximity', () => {
    const wrongTeams = odGame(BEGIN + 10, { match_id: 2, radiant_name: 'PARIVISION', dire_name: 'BetBoom Team' })
    const rightTeams = odGame(BEGIN + 400, { match_id: 3 })
    expect(findOdMatchByTime([wrongTeams, rightTeams], BEGIN, OPPONENTS)).toBe(rightTeams)
  })

  it('falls back to nearest start_time when no candidate matches on names', () => {
    const far = odGame(BEGIN + 800, { match_id: 4, radiant_name: 'Xtreme Gaming', dire_name: 'Azure Ray' })
    const near = odGame(BEGIN + 30, { match_id: 5, radiant_name: 'Gaimin Gladiators', dire_name: 'Talon Esports' })
    expect(findOdMatchByTime([far, near], BEGIN, OPPONENTS)).toBe(near)
  })
})

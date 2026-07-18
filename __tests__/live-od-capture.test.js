/**
 * Tests for mapLiveGamesToRows — the filter/transform core of ?mode=od-live-capture
 * (api/_handlers/liveOdCapture.js), which snapshots OpenDota /api/live professional-league
 * games into the live_game_map table.
 *
 * Focus: the pure transformation (pub exclusion, type casts, null handling, uniform keys).
 * The KV-lock throttle and Supabase upsert are exercised in prod, not unit-mocked here.
 */

import { describe, it, expect } from 'vitest'
import { mapLiveGamesToRows, toGoldRows } from '../api/_handlers/liveOdCapture.js'

const CAPTURED_AT = '2026-07-16T00:00:00.000Z'

// A realistic OpenDota /live players[] entry: team 0 = Radiant, team 1 = Dire (confirmed
// empirically 2026-07-16 — every live league game splits exactly 5/5 across these two values).
function livePlayer(team, teamSlot, heroId) {
  return { account_id: 1, hero_id: heroId, team_slot: teamSlot, team }
}

const TEN_PLAYERS = [
  livePlayer(1, 2, 5), livePlayer(0, 1, 82), livePlayer(1, 5, 48), livePlayer(0, 3, 26), livePlayer(1, 3, 126),
  livePlayer(0, 4, 57), livePlayer(1, 1, 71), livePlayer(1, 4, 96), livePlayer(0, 2, 10), livePlayer(0, 5, 79),
]

// A realistic OpenDota /live league entry (shape verified against the live endpoint 2026-07-16).
function leagueGame(overrides = {}) {
  return {
    league_id: 19924,
    match_id: '8898592653',
    series_id: 1120850,
    team_name_radiant: 'Team Spirit',
    team_name_dire: 'Gaimin Gladiators',
    activate_time: 1784163745,
    radiant_lead: 1500,
    radiant_score: 12,
    dire_score: 8,
    server_steam_id: '90288953705420822',
    game_time: 1320,
    players: TEN_PLAYERS,
    ...overrides,
  }
}

describe('mapLiveGamesToRows — filtering', () => {
  it('keeps a valid professional-league game', () => {
    const rows = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(rows).toHaveLength(1)
    expect(rows[0].od_match_id).toBe(8898592653)
  })

  it('excludes pub games (league_id 0)', () => {
    expect(mapLiveGamesToRows([leagueGame({ league_id: 0 })], CAPTURED_AT)).toHaveLength(0)
  })

  it('excludes games with no match_id or match_id "0"', () => {
    expect(mapLiveGamesToRows([leagueGame({ match_id: undefined })], CAPTURED_AT)).toHaveLength(0)
    expect(mapLiveGamesToRows([leagueGame({ match_id: '0' })], CAPTURED_AT)).toHaveLength(0)
    expect(mapLiveGamesToRows([leagueGame({ match_id: 0 })], CAPTURED_AT)).toHaveLength(0)
  })

  it('excludes games with a missing team name (common during draft, recaptured next poll)', () => {
    expect(mapLiveGamesToRows([leagueGame({ team_name_radiant: '' })], CAPTURED_AT)).toHaveLength(0)
    expect(mapLiveGamesToRows([leagueGame({ team_name_dire: null })], CAPTURED_AT)).toHaveLength(0)
  })

  it('drops falsy/garbage entries without throwing', () => {
    const rows = mapLiveGamesToRows([null, undefined, {}, leagueGame()], CAPTURED_AT)
    expect(rows).toHaveLength(1)
  })

  it('returns [] for a non-array input', () => {
    expect(mapLiveGamesToRows(null, CAPTURED_AT)).toEqual([])
    expect(mapLiveGamesToRows(undefined, CAPTURED_AT)).toEqual([])
    expect(mapLiveGamesToRows({ not: 'an array' }, CAPTURED_AT)).toEqual([])
  })
})

describe('mapLiveGamesToRows — types & null handling', () => {
  it('casts od_match_id to a safe-integer number', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(typeof row.od_match_id).toBe('number')
    expect(Number.isSafeInteger(row.od_match_id)).toBe(true)
  })

  it('keeps server_steam_id as a string (value exceeds JS safe-integer range)', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(typeof row.server_steam_id).toBe('string')
    expect(row.server_steam_id).toBe('90288953705420822')
  })

  it('nulls series_id when 0/absent, keeps it when present', () => {
    const [withSeries] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(withSeries.od_series_id).toBe(1120850)
    const [noSeries] = mapLiveGamesToRows([leagueGame({ series_id: 0 })], CAPTURED_AT)
    expect(noSeries.od_series_id).toBeNull()
  })

  it('nulls telemetry fields that are missing or non-finite', () => {
    const [row] = mapLiveGamesToRows(
      [leagueGame({ radiant_lead: undefined, radiant_score: NaN, dire_score: undefined, game_time: undefined, server_steam_id: undefined })],
      CAPTURED_AT,
    )
    expect(row.radiant_lead).toBeNull()
    expect(row.radiant_score).toBeNull()
    expect(row.dire_score).toBeNull()
    expect(row.game_time).toBeNull()
    expect(row.server_steam_id).toBeNull()
  })

  it('preserves a zero gold lead / zero score (0 is a valid value, not null)', () => {
    const [row] = mapLiveGamesToRows(
      [leagueGame({ radiant_lead: 0, radiant_score: 0, dire_score: 0, game_time: -79 })],
      CAPTURED_AT,
    )
    expect(row.radiant_lead).toBe(0)
    expect(row.radiant_score).toBe(0)
    expect(row.dire_score).toBe(0)
    expect(row.game_time).toBe(-79)
  })

  it('nulls start_time when activate_time is absent', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ activate_time: undefined })], CAPTURED_AT)
    expect(row.start_time).toBeNull()
  })

  it('stamps captured_at from the argument', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(row.captured_at).toBe(CAPTURED_AT)
  })
})

describe('mapLiveGamesToRows — live hero picks (Phase 2)', () => {
  it('splits players into radiant/dire hero_id arrays by team (0=Radiant, 1=Dire)', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(row.radiant_hero_ids.sort((a, b) => a - b)).toEqual([10, 26, 57, 79, 82].sort((a, b) => a - b))
    expect(row.dire_hero_ids.sort((a, b) => a - b)).toEqual([5, 48, 71, 96, 126].sort((a, b) => a - b))
  })

  it('never mixes a Dire player into radiant_hero_ids or vice versa', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    const directIds = [5, 48, 71, 96, 126]
    const radiantIds = [10, 26, 57, 79, 82]
    expect(row.radiant_hero_ids.some(id => directIds.includes(id))).toBe(false)
    expect(row.dire_hero_ids.some(id => radiantIds.includes(id))).toBe(false)
  })

  it('returns empty arrays (not null/undefined) when players is missing', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ players: undefined })], CAPTURED_AT)
    expect(row.radiant_hero_ids).toEqual([])
    expect(row.dire_hero_ids).toEqual([])
  })

  it('returns empty arrays when players is not an array', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ players: 'not-an-array' })], CAPTURED_AT)
    expect(row.radiant_hero_ids).toEqual([])
    expect(row.dire_hero_ids).toEqual([])
  })

  it('keeps hero_id 0 (still picking) rather than dropping the player', () => {
    const draftInProgress = [...TEN_PLAYERS.slice(0, 9), livePlayer(0, 5, 0)]
    const [row] = mapLiveGamesToRows([leagueGame({ players: draftInProgress })], CAPTURED_AT)
    expect(row.radiant_hero_ids).toContain(0)
    expect(row.radiant_hero_ids).toHaveLength(5)
  })

  it('tolerates a malformed player entry (null in the array) without throwing', () => {
    const withNull = [...TEN_PLAYERS, null]
    expect(() => mapLiveGamesToRows([leagueGame({ players: withNull })], CAPTURED_AT)).not.toThrow()
  })
})

describe('mapLiveGamesToRows — PostgREST bulk upsert safety', () => {
  it('produces an identical key set on every row (uniform keys required for bulk upsert)', () => {
    const rows = mapLiveGamesToRows(
      [leagueGame(), leagueGame({ match_id: '9', series_id: 0, radiant_lead: undefined })],
      CAPTURED_AT,
    )
    expect(rows).toHaveLength(2)
    const keys0 = Object.keys(rows[0]).sort().join(',')
    const keys1 = Object.keys(rows[1]).sort().join(',')
    expect(keys1).toBe(keys0)
  })
})

describe('toGoldRows — live gold timeseries append (Live Story, Phase A)', () => {
  it('reduces map rows to exactly the five gold-timeseries columns', () => {
    const rows = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    const [g] = toGoldRows(rows)
    expect(g).toEqual({
      od_match_id: 8898592653,
      game_time: 1320,
      radiant_lead: 1500,
      radiant_score: 12,
      dire_score: 8,
    })
  })

  it('keeps draft (negative game_time) and zero-lead points — the read layer filters, not capture', () => {
    const rows = mapLiveGamesToRows([leagueGame({ game_time: -79, radiant_lead: 0 })], CAPTURED_AT)
    const [g] = toGoldRows(rows)
    expect(g.game_time).toBe(-79)
    expect(g.radiant_lead).toBe(0)
  })

  it('drops rows with a null game_time (cannot key the (od_match_id, game_time) unique constraint)', () => {
    const rows = mapLiveGamesToRows([leagueGame({ game_time: undefined })], CAPTURED_AT)
    expect(rows).toHaveLength(1)            // still a valid live_game_map row
    expect(toGoldRows(rows)).toHaveLength(0) // but not a gold-timeseries point
  })

  it('keeps a null radiant_lead point (filtered at read) with a uniform key set for bulk upsert', () => {
    const rows = mapLiveGamesToRows(
      [leagueGame(), leagueGame({ match_id: '9', radiant_lead: undefined })],
      CAPTURED_AT,
    )
    const gold = toGoldRows(rows)
    expect(gold).toHaveLength(2)
    expect(gold[1].radiant_lead).toBeNull()
    expect(Object.keys(gold[0]).sort().join(',')).toBe(Object.keys(gold[1]).sort().join(','))
  })

  it('returns [] for non-array input', () => {
    expect(toGoldRows(null)).toEqual([])
    expect(toGoldRows(undefined)).toEqual([])
  })
})

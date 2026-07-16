/**
 * Tests for mapLiveGamesToRows — the filter/transform core of ?mode=od-live-capture
 * (api/_handlers/liveOdCapture.js), which snapshots OpenDota /api/live professional-league
 * games into the live_game_map table.
 *
 * Focus: the pure transformation (pub exclusion, type casts, null handling, uniform keys).
 * The KV-lock throttle and Supabase upsert are exercised in prod, not unit-mocked here.
 */

import { describe, it, expect } from 'vitest'
import { mapLiveGamesToRows } from '../api/_handlers/liveOdCapture.js'

const CAPTURED_AT = '2026-07-16T00:00:00.000Z'

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

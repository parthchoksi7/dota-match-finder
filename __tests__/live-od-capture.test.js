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
// `name` (the live IGN) defaults to undefined so existing tests that don't care about names are
// unaffected; per-player-name tests below pass it explicitly.
function livePlayer(team, teamSlot, heroId, name) {
  return { account_id: 1, hero_id: heroId, team_slot: teamSlot, team, name }
}

const TEN_PLAYERS = [
  livePlayer(1, 2, 5), livePlayer(0, 1, 82), livePlayer(1, 5, 48), livePlayer(0, 3, 26), livePlayer(1, 3, 126),
  livePlayer(0, 4, 57), livePlayer(1, 1, 71), livePlayer(1, 4, 96), livePlayer(0, 2, 10), livePlayer(0, 5, 79),
]

// Same 10 players, with realistic live IGNs (shape verified against the live OD /live endpoint
// 2026-07-19 — all 10 players of a real running game had a non-empty players[].name).
const TEN_PLAYERS_NAMED = [
  livePlayer(1, 2, 5, 'gpk~'), livePlayer(0, 1, 82, 'Kiritych~'), livePlayer(1, 5, 48, 'Dukalis'), livePlayer(0, 3, 26, 'MieRo'), livePlayer(1, 3, 126, 'Noticed'),
  livePlayer(0, 4, 57, 'Save-'), livePlayer(1, 1, 71, '9Class'), livePlayer(1, 4, 96, 'Satanic'), livePlayer(0, 2, 10, 'Kataomi`'), livePlayer(0, 5, 79, 'No[o]ne-'),
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
    building_state: 16187530, // live sample (24 significant bits) — bitmask of standing buildings
    spectators: 976,
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

describe('mapLiveGamesToRows — live player names (2026-07-19 migration)', () => {
  it('splits players into radiant/dire player-name arrays by team, index-aligned with hero_ids', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ players: TEN_PLAYERS_NAMED })], CAPTURED_AT)
    // TEN_PLAYERS_NAMED radiant entries, in source order: Kiritych~(82), MieRo(26), Save-(57), Kataomi`(10), No[o]ne-(79)
    expect(row.radiant_hero_ids).toEqual([82, 26, 57, 10, 79])
    expect(row.radiant_player_names).toEqual(['Kiritych~', 'MieRo', 'Save-', 'Kataomi`', 'No[o]ne-'])
    // dire entries, in source order: gpk~(5), Dukalis(48), Noticed(126), 9Class(71), Satanic(96)
    expect(row.dire_hero_ids).toEqual([5, 48, 126, 71, 96])
    expect(row.dire_player_names).toEqual(['gpk~', 'Dukalis', 'Noticed', '9Class', 'Satanic'])
  })

  it('keeps a name index-aligned with its hero at the same position (never mixed across players)', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ players: TEN_PLAYERS_NAMED })], CAPTURED_AT)
    const heroToPlayer = Object.fromEntries(row.radiant_hero_ids.map((id, i) => [id, row.radiant_player_names[i]]))
    expect(heroToPlayer[82]).toBe('Kiritych~') // Lone Druid
    expect(heroToPlayer[10]).toBe('Kataomi`')  // Undying
  })

  it('nulls a missing/blank name rather than an empty string', () => {
    const mixed = [...TEN_PLAYERS.slice(0, 9), livePlayer(0, 5, 79, '')]
    const [row] = mapLiveGamesToRows([leagueGame({ players: mixed })], CAPTURED_AT)
    expect(row.radiant_player_names.every(n => n === null)).toBe(true)
  })

  it('returns empty name arrays (not null/undefined) when players is missing', () => {
    const [row] = mapLiveGamesToRows([leagueGame({ players: undefined })], CAPTURED_AT)
    expect(row.radiant_player_names).toEqual([])
    expect(row.dire_player_names).toEqual([])
  })

  it('stays index-aligned even when hero_id is 0 (still picking)', () => {
    const draftInProgress = [...TEN_PLAYERS_NAMED.slice(0, 9), livePlayer(0, 5, 0, 'No[o]ne-')]
    const [row] = mapLiveGamesToRows([leagueGame({ players: draftInProgress })], CAPTURED_AT)
    const idx = row.radiant_hero_ids.indexOf(0)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(row.radiant_player_names[idx]).toBe('No[o]ne-')
  })
})

describe('mapLiveGamesToRows — objective/map state (Live Story R4, Phase A)', () => {
  it('captures building_state and spectators raw (no decode at capture)', () => {
    const [row] = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    expect(row.building_state).toBe(16187530)
    expect(row.spectators).toBe(976)
  })

  it('nulls building_state / spectators when missing or non-finite', () => {
    const [row] = mapLiveGamesToRows(
      [leagueGame({ building_state: undefined, spectators: NaN })],
      CAPTURED_AT,
    )
    expect(row.building_state).toBeNull()
    expect(row.spectators).toBeNull()
  })

  it('preserves a zero spectators / zero building_state (0 is a value, not null — filtered at read)', () => {
    const [row] = mapLiveGamesToRows(
      [leagueGame({ building_state: 0, spectators: 0 })],
      CAPTURED_AT,
    )
    expect(row.building_state).toBe(0)
    expect(row.spectators).toBe(0)
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
  it('reduces map rows to exactly the gold-timeseries columns (incl. the R4 building_state snapshot)', () => {
    const rows = mapLiveGamesToRows([leagueGame()], CAPTURED_AT)
    const [g] = toGoldRows(rows)
    expect(g).toEqual({
      od_match_id: 8898592653,
      game_time: 1320,
      radiant_lead: 1500,
      radiant_score: 12,
      dire_score: 8,
      building_state: 16187530,
    })
  })

  it('carries building_state through as a per-capture timeseries point, nulling a missing one', () => {
    const [withBs] = toGoldRows(mapLiveGamesToRows([leagueGame()], CAPTURED_AT))
    expect(withBs.building_state).toBe(16187530)
    const [noBs] = toGoldRows(mapLiveGamesToRows([leagueGame({ building_state: undefined })], CAPTURED_AT))
    expect(noBs.building_state).toBeNull()
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

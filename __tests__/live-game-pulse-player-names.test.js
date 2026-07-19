/**
 * Tests for resolvePulse's player-name pass-through (api/_handlers/liveGamePulse.js).
 *
 * live_game_map's radiant_player_names/dire_player_names (2026-07-19 migration,
 * scripts/create-live-game-map.sql) are index-aligned with radiant_hero_ids/dire_hero_ids, so the
 * frontend can show "hero — player" per pick. Rows captured before the migration (or before their
 * next capture cycle) simply have these columns as null/absent — resolvePulse must default that to
 * an empty array, the same degrade-safe shape radiant_hero_ids/dire_hero_ids already use.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { BEGIN_AT, BEGIN_AT_UNIX, OD_MATCH_ID } = vi.hoisted(() => {
  const BEGIN_AT = '2026-07-17T00:00:00.000Z'
  return { BEGIN_AT, BEGIN_AT_UNIX: Math.floor(new Date(BEGIN_AT).getTime() / 1000), OD_MATCH_ID: 8898592653 }
})

vi.mock('../api/_handlers/liveSeriesGames.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPsMatchDetail: vi.fn().mockResolvedValue({
      opponents: [{ opponent: { name: 'Team Spirit' } }, { opponent: { name: 'Gaimin Gladiators' } }],
      games: [{ status: 'running', begin_at: BEGIN_AT }],
    }),
  }
})

const { mockGetSupabaseAdmin, setLiveGameMapRows } = vi.hoisted(() => {
  let lgmRows = []
  function makeBuilder(table) {
    return {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn(() => Promise.resolve({ data: lgmRows, error: null })),
      eq: vi.fn(() => (table === 'live_game_gold' ? Promise.resolve({ data: [], error: null }) : Promise.resolve({ data: [], error: null }))),
    }
  }
  const mockGetSupabaseAdmin = vi.fn(() => ({ from: vi.fn((table) => makeBuilder(table)) }))
  return { mockGetSupabaseAdmin, setLiveGameMapRows: (rows) => { lgmRows = rows } }
})

vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: mockGetSupabaseAdmin }))

import { resolvePulse } from '../api/_handlers/liveGamePulse.js'

const log = { warn: vi.fn(), info: vi.fn() }

function liveGameMapRow(overrides = {}) {
  return {
    od_match_id: OD_MATCH_ID,
    start_time: BEGIN_AT_UNIX,
    radiant_name: 'Team Spirit',
    dire_name: 'Gaimin Gladiators',
    radiant_lead: 1500,
    radiant_score: 5,
    dire_score: 3,
    game_time: 600,
    radiant_hero_ids: [1, 2, 3, 4, 5],
    dire_hero_ids: [6, 7, 8, 9, 10],
    captured_at: '2026-07-17T00:10:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolvePulse — live player names', () => {
  it('passes radiant/dire player names through, index-aligned with hero ids', async () => {
    setLiveGameMapRows([liveGameMapRow({
      radiant_player_names: ['Yatoro', 'Collapse', 'Mira', 'Miposhka', 'TORONTOTOKYO'],
      dire_player_names: ['Quinn', 'Ceb', 'Ame', 'Sneyking', 'Boxi'],
    })])
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), false, log)
    expect(pulse.radiantPlayerNames).toEqual(['Yatoro', 'Collapse', 'Mira', 'Miposhka', 'TORONTOTOKYO'])
    expect(pulse.direPlayerNames).toEqual(['Quinn', 'Ceb', 'Ame', 'Sneyking', 'Boxi'])
    expect(pulse.radiantHeroIds).toEqual([1, 2, 3, 4, 5])
  })

  it('defaults to an empty array (not null/undefined) on a pre-migration row missing the columns', async () => {
    const row = liveGameMapRow()
    delete row.radiant_player_names
    delete row.dire_player_names
    setLiveGameMapRows([row])
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), false, log)
    expect(pulse.radiantPlayerNames).toEqual([])
    expect(pulse.direPlayerNames).toEqual([])
  })

  it('defaults to an empty array when the columns are explicitly null (row not yet re-captured since migration)', async () => {
    setLiveGameMapRows([liveGameMapRow({ radiant_player_names: null, dire_player_names: null })])
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), false, log)
    expect(pulse.radiantPlayerNames).toEqual([])
    expect(pulse.direPlayerNames).toEqual([])
  })
})

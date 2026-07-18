/**
 * Tests for resolvePulse's owner-only gate (api/_handlers/liveGamePulse.js, Live Story Phase B).
 *
 * `history` (the live gold-graph timeseries) must reach the response ONLY when isOwner is true —
 * the feature isn't publicly launched yet. This is pure control flow (no I/O of its own), but the
 * function it lives in does touch PandaScore + Supabase, so those are mocked here rather than
 * skipped — unlike shapeGoldHistory (a truly pure helper, tested unmocked in the sibling
 * live-game-pulse-history.test.js), the property under test ("isOwner actually gates the field")
 * can only be observed by exercising resolvePulse itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above top-level consts, so values a factory needs must be
// computed inside vi.hoisted() rather than referenced from an outer const declared below it.
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

// Fluent Supabase mock keyed by table name. live_game_map's real call chain terminates at
// .lte(), live_game_gold's terminates at .eq() -- these never overlap in resolvePulse, so each
// can unconditionally resolve for its own table without tracking call order.
const { mockGetSupabaseAdmin, setLiveGameMapRows, setLiveGameGoldResult } = vi.hoisted(() => {
  let lgmRows = []
  let lggResult = { data: [], error: null }
  function makeBuilder(table) {
    return {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn(() => Promise.resolve({ data: lgmRows, error: null })),
      eq: vi.fn(() => {
        if (table === 'live_game_gold') return Promise.resolve(lggResult)
        throw new Error(`unexpected .eq() on table "${table}" in this mock`)
      }),
    }
  }
  const mockGetSupabaseAdmin = vi.fn(() => ({ from: vi.fn((table) => makeBuilder(table)) }))
  return {
    mockGetSupabaseAdmin,
    setLiveGameMapRows: (rows) => { lgmRows = rows },
    setLiveGameGoldResult: (result) => { lggResult = result },
  }
})

vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: mockGetSupabaseAdmin }))

import { resolvePulse } from '../api/_handlers/liveGamePulse.js'

const log = { warn: vi.fn(), info: vi.fn() }

function liveGameMapRow(overrides = {}) {
  return {
    od_match_id: OD_MATCH_ID,
    start_time: BEGIN_AT_UNIX, // exact match -> the single-candidate branch of findOdMatchByTime
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
  setLiveGameMapRows([liveGameMapRow()])
  setLiveGameGoldResult({
    data: [{ game_time: 600, radiant_lead: 1500, radiant_score: 5, dire_score: 3, captured_at: '2026-07-17T00:10:00.000Z' }],
    error: null,
  })
})

describe('resolvePulse — owner gate', () => {
  it('isOwner=false: the resolved pulse has no `history` key at all', async () => {
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), false, log)
    expect(pulse).not.toBeNull()
    expect(pulse.matchId).toBe(String(OD_MATCH_ID))
    expect('history' in pulse).toBe(false)
  })

  it('isOwner=true: the resolved pulse includes a correctly shaped `history`', async () => {
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), true, log)
    expect(pulse.history).toEqual([{ t: 600, lead: 1500, rk: 5, dk: 3 }])
  })

  it('isOwner=true but the live_game_gold query returns an error: pulse still resolves fully, just without `history`', async () => {
    setLiveGameGoldResult({ data: null, error: { message: 'boom' } })
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), true, log)
    expect(pulse).not.toBeNull()
    expect(pulse.matchId).toBe(String(OD_MATCH_ID))
    expect('history' in pulse).toBe(false)
  })

  it('isOwner=true but the live_game_gold query throws synchronously: the already-resolved pulse survives (isolation guarantee)', async () => {
    mockGetSupabaseAdmin.mockReturnValueOnce({
      from: vi.fn((table) => {
        if (table === 'live_game_gold') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn(() => { throw new Error('network blip') }) }
        }
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn(() => Promise.resolve({ data: [liveGameMapRow()], error: null })),
        }
      }),
    })
    const { pulse } = await resolvePulse(String(OD_MATCH_ID), true, log)
    expect(pulse).not.toBeNull()
    expect(pulse.matchId).toBe(String(OD_MATCH_ID))
  })

  it('non-owner and owner requests resolve the SAME underlying match (the gate only adds a field, never changes which game is resolved)', async () => {
    const nonOwner = await resolvePulse(String(OD_MATCH_ID), false, log)
    const owner = await resolvePulse(String(OD_MATCH_ID), true, log)
    expect(owner.pulse.matchId).toBe(nonOwner.pulse.matchId)
    expect(owner.pulse.radiantLead).toBe(nonOwner.pulse.radiantLead)
  })
})

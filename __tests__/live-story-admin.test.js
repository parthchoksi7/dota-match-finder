/**
 * Tests for the /admin/live-story data endpoint (api/_handlers/liveStoryAdmin.js).
 *
 * kv and getSupabaseAdmin are mocked (same pattern as live-game-pulse-owner-gate.test.js) since
 * this handler's whole job is orchestrating reads across both — the property under test
 * ("overview assembles health+matches+events", "compare computes the real clock delta",
 * "crosscheck degrades correctly when OD hasn't parsed yet") can only be observed by exercising
 * the handler itself, not by unit-testing an I/O-free helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockKv } = vi.hoisted(() => ({
  mockKv: { get: vi.fn(), set: vi.fn() },
}))
vi.mock('../api/_kv.js', () => ({ kv: mockKv }))

const { mockGetSupabaseAdmin, setLiveGameMapResult } = vi.hoisted(() => {
  let result = { data: null, error: null }
  function makeBuilder() {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    }
  }
  const mockGetSupabaseAdmin = vi.fn(() => ({ from: vi.fn(() => makeBuilder()) }))
  return { mockGetSupabaseAdmin, setLiveGameMapResult: (r) => { result = r } }
})
vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: mockGetSupabaseAdmin }))

import handleLiveStoryAdmin from '../api/_handlers/liveStoryAdmin.js'
import { LIVE_STORY_KEYS } from '../api/_handlers/liveStoryCapture.js'

function mockRes() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}

beforeEach(() => {
  mockKv.get.mockReset()
  mockKv.set.mockReset()
  setLiveGameMapResult({ data: null, error: null })
  global.fetch = vi.fn()
})

describe('action=overview', () => {
  it('assembles health, tracked matches, and each match\'s event ring', async () => {
    mockKv.get.mockImplementation((key) => {
      if (key === LIVE_STORY_KEYS.HEALTH_KEY) return Promise.resolve({ ok: true, games: 1 })
      if (key === LIVE_STORY_KEYS.TRACKED_KEY) return Promise.resolve(['123'])
      if (key === LIVE_STORY_KEYS.SNAPSHOT_KEY) {
        return Promise.resolve({ result: { games: [{ match_id: 123, radiant_team: { team_name: 'A' } }] } })
      }
      if (key === LIVE_STORY_KEYS.EVENTS_KEY('123')) return Promise.resolve([{ eventType: 'RoshanKilled' }])
      return Promise.resolve(null)
    })

    const res = mockRes()
    await handleLiveStoryAdmin({ query: {} }, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.health).toEqual({ ok: true, games: 1 })
    expect(payload.matches).toHaveLength(1)
    expect(payload.events['123']).toEqual([{ eventType: 'RoshanKilled' }])
  })

  it('degrades to empty rather than throwing when every key is a cache miss', async () => {
    mockKv.get.mockResolvedValue(null)
    const res = mockRes()
    await handleLiveStoryAdmin({ query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.matches).toEqual([])
    expect(payload.events).toEqual({})
  })
})

describe('action=pair', () => {
  it('returns the last captured pair verbatim', async () => {
    const pair = { prev: {}, next: {}, events: [], at: '2026-08-05T00:00:00Z' }
    mockKv.get.mockResolvedValue(pair)
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'pair' } }, res)
    expect(res.json).toHaveBeenCalledWith({ pair })
  })
})

describe('action=compare', () => {
  it('requires a matchId', async () => {
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'compare' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('computes the clock delta and net-worth lead from real field shapes', async () => {
    mockKv.get.mockResolvedValue({
      result: {
        games: [{
          match_id: 555,
          radiant_team: { team_name: 'Spirit' },
          dire_team: { team_name: 'Falcons' },
          stream_delay_s: 120,
          scoreboard: {
            duration: 725.6,
            radiant: { score: 10, players: [{ net_worth: 6000 }, { net_worth: 4000 }] },
            dire: { score: 8, players: [{ net_worth: 5000 }, { net_worth: 4000 }] },
          },
        }],
      },
    })
    setLiveGameMapResult({
      data: {
        radiant_name: 'Spirit', dire_name: 'Falcons',
        radiant_lead: 900, radiant_score: 10, dire_score: 8,
        game_time: 700, captured_at: '2026-08-05T00:01:00Z',
      },
      error: null,
    })

    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'compare', matchId: '555' } }, res)
    const payload = res.json.mock.calls[0][0]

    // duration 725.6 rounds to 726, OD's game_time is 700 -> Valve is 26s ahead in this fixture.
    expect(payload.clockDeltaS).toBe(26)
    // radiant 6000+4000=10000, dire 5000+4000=9000 -> valve net worth lead +1000.
    expect(payload.valve.netWorthLead).toBe(1000)
    expect(payload.openDota.netWorthLead).toBe(900)
    expect(payload.valve.streamDelayS).toBe(120)
  })

  it('returns nulls rather than throwing when the match is on only one side', async () => {
    mockKv.get.mockResolvedValue({ result: { games: [] } })
    setLiveGameMapResult({ data: null, error: null })
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'compare', matchId: '999' } }, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.valve).toBeNull()
    expect(payload.openDota).toBeNull()
    expect(payload.clockDeltaS).toBeNull()
  })
})

describe('action=crosscheck', () => {
  it('requires a matchId', async () => {
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'crosscheck' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('reports no_building_events_captured when the ring has no building events', async () => {
    mockKv.get.mockResolvedValue([{ eventType: 'HeroKilled' }])
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'crosscheck', matchId: '1' } }, res)
    expect(res.json.mock.calls[0][0].note).toBe('no_building_events_captured')
  })

  it('degrades to not_yet_parsed when OpenDota has no duration for the match yet', async () => {
    mockKv.get.mockResolvedValue([{ eventType: 'TowerDestroyed', team: 2, gameTime: 700, payload: { bit: 0 } }])
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ duration: null, objectives: [] }) })
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'crosscheck', matchId: '1' } }, res)
    expect(res.json.mock.calls[0][0].odFetchError).toBe('not_yet_parsed')
  })

  it('summarizes verdicts once OD has parsed the match', async () => {
    mockKv.get.mockResolvedValue([{ eventType: 'TowerDestroyed', team: 3, gameTime: 736, payload: { bit: 0 } }])
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        duration: 1770,
        objectives: [{ time: 736, type: 'building_kill', key: 'npc_dota_badguys_tower1_top' }],
      }),
    })
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'crosscheck', matchId: '1' } }, res)
    const payload = res.json.mock.calls[0][0]
    expect(payload.summary).toEqual({ confirmed: 1 })
  })

  it('propagates an OpenDota HTTP failure without throwing', async () => {
    mockKv.get.mockResolvedValue([{ eventType: 'TowerDestroyed', team: 2, gameTime: 1, payload: { bit: 0 } }])
    global.fetch.mockResolvedValue({ ok: false, status: 502 })
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'crosscheck', matchId: '1' } }, res)
    expect(res.json.mock.calls[0][0].odFetchError).toBe('http_502')
  })
})

describe('unknown action', () => {
  it('returns 400 rather than falling through to a default', async () => {
    const res = mockRes()
    await handleLiveStoryAdmin({ query: { action: 'nonsense' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

/**
 * Tests for the warm-streams cron in api/live-matches.js.
 *
 * Covers the pure selectSeriesToWarm() selector (tier filter, lookback boundary,
 * series grouping, null-field guards, cap) and the handler branch that drives the
 * existing /api/match-streams resolver to fuzzy-bind completed tier-1 series.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: () => ({}) }))

const { mockKv } = vi.hoisted(() => {
  const mockKv = { get: vi.fn(), set: vi.fn(), mget: vi.fn(), scan: vi.fn(), del: vi.fn() }
  return { mockKv }
})
vi.mock('../api/_kv.js', () => ({ kv: mockKv }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { Object.assign(this, mockKv) } } }))

import handler, { selectSeriesToWarm } from '../api/live-matches.js'

const NOW = 1_780_000_000 // fixed reference second
const recent = (offsetSec = 3600) => NOW - offsetSec

function odGame({ matchId, seriesId = 0, league = 'The International 2026 - Regional Qualifier Southeast Asia', radiant = 'REKONIX', dire = 'TEAM GRIND', start = recent() }) {
  return { match_id: matchId, series_id: seriesId, league_name: league, radiant_name: radiant, dire_name: dire, start_time: start }
}

const TIER1 = ['the international', 'pgl', 'dreamleague']

describe('selectSeriesToWarm', () => {
  it('groups games of one series into a single entry with all ids and the earliest ts', () => {
    const out = selectSeriesToWarm([
      odGame({ matchId: 100, seriesId: 55, start: recent(7200) }),
      odGame({ matchId: 101, seriesId: 55, start: recent(3600) }),
    ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })

    expect(out).toHaveLength(1)
    expect(out[0].ids.sort()).toEqual(['100', '101'])
    expect(out[0].ts).toBe(recent(7200)) // earliest game start
    expect(out[0].radiantTeam).toBe('REKONIX')
    expect(out[0].direTeam).toBe('TEAM GRIND')
  })

  it('treats series_id 0 / null as standalone singletons keyed by match_id', () => {
    const out = selectSeriesToWarm([
      odGame({ matchId: 200, seriesId: 0 }),
      odGame({ matchId: 201, seriesId: null }),
    ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
    expect(out).toHaveLength(2)
    expect(out.every(s => s.ids.length === 1)).toBe(true)
  })

  it('excludes non-tier-1 leagues', () => {
    const out = selectSeriesToWarm([
      odGame({ matchId: 300, league: 'Some Random Online League' }),
    ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
    expect(out).toHaveLength(0)
  })

  it('excludes games older than the lookback window', () => {
    const out = selectSeriesToWarm([
      odGame({ matchId: 400, start: recent(48 * 3600) }),
    ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
    expect(out).toHaveLength(0)
  })

  it('drops games missing match_id, start_time, or either team name', () => {
    const out = selectSeriesToWarm([
      { ...odGame({ matchId: 500 }), match_id: null },
      { ...odGame({ matchId: 501 }), start_time: null },
      { ...odGame({ matchId: 502 }), radiant_name: null },
      { ...odGame({ matchId: 503 }), dire_name: '' },
    ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
    expect(out).toHaveLength(0)
  })

  it('caps the number of returned series', () => {
    const many = Array.from({ length: 50 }, (_, i) => odGame({ matchId: 1000 + i, seriesId: 1000 + i }))
    const out = selectSeriesToWarm(many, { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600, maxSeries: 10 })
    expect(out).toHaveLength(10)
  })

  it('returns [] for non-array input or empty tier1 list', () => {
    expect(selectSeriesToWarm(null, { tier1Names: TIER1, nowSec: NOW, lookbackSec: 1 })).toEqual([])
    expect(selectSeriesToWarm([odGame({ matchId: 1 })], { tier1Names: [], nowSec: NOW, lookbackSec: 1 })).toEqual([])
  })
})

describe('warm-streams handler', () => {
  function makeReq(extra = {}) {
    return { query: { cron: 'warm-streams' }, headers: { authorization: 'Bearer test-secret', host: 'spectateesports.live' }, ...extra }
  }
  function makeRes() {
    const res = { statusCode: null, body: null, ended: false }
    res.setHeader = vi.fn()
    res.status = vi.fn(code => { res.statusCode = code; return res })
    res.json = vi.fn(body => { res.body = body; return res })
    res.end = vi.fn(() => { res.ended = true; return res })
    return res
  }

  // Handler uses real Date.now() for the lookback, so fixtures must be timestamped near now.
  const liveNow = Math.floor(Date.now() / 1000)
  const liveGame = (matchId, seriesId) => odGame({ matchId, seriesId, start: liveNow - 3600 })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    process.env.PANDASCORE_TOKEN = 'test-token' // always set in prod; handler guards on it before any cron branch
    mockKv.get.mockResolvedValue(null)              // no cached tier1 names → falls back to permanent + keywords
    mockKv.set.mockResolvedValue('OK')
    mockKv.mget.mockResolvedValue([null, null])     // unbound → triggers a self-call
  })

  it('rejects unauthorized requests', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer wrong-secret', host: 'x' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('drives /api/match-streams for an unbound tier-1 series and counts it bound', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('api.opendota.com/api/promatches')) {
        if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] }) // stop paging
        return Promise.resolve({ ok: true, json: async () => [
          liveGame(8001, 77),
          liveGame(8002, 77),
        ] })
      }
      // self-call to /api/match-streams resolves the channel
      return Promise.resolve({ ok: true, json: async () => ({ 8001: 'pgl_dota2en2', 8002: 'pgl_dota2en2' }) })
    })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.bound).toBe(1)
    expect(res.body.attempted).toBe(1)
    const matchStreamsCall = global.fetch.mock.calls.find(([u]) => u.includes('/api/match-streams'))
    expect(matchStreamsCall).toBeTruthy()
    // self-call must target the fixed prod origin and carry the full fuzzy-match contract
    expect(matchStreamsCall[0]).toContain('https://spectateesports.live/api/match-streams')
    expect(matchStreamsCall[0]).toMatch(/ids=8001%2C8002/)
    expect(matchStreamsCall[0]).toMatch(/[?&]ts=\d+/)
    expect(matchStreamsCall[0]).toMatch(/radiantTeam=REKONIX/)
    expect(matchStreamsCall[0]).toMatch(/direTeam=TEAM\+GRIND/)
  })

  it('skips a series already fully bound in KV without calling the resolver', async () => {
    mockKv.mget.mockResolvedValue(['pgl_dota2en2', 'pgl_dota2en2'])
    global.fetch = vi.fn((url) => {
      if (url.includes('api.opendota.com/api/promatches')) {
        if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] }) // stop paging
        return Promise.resolve({ ok: true, json: async () => [
          liveGame(9001, 88),
          liveGame(9002, 88),
        ] })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.skipped).toBe(1)
    expect(res.body.attempted).toBe(0)
    const calledMatchStreams = global.fetch.mock.calls.some(([u]) => u.includes('/api/match-streams'))
    expect(calledMatchStreams).toBe(false)
  })

  it('returns 502 when OpenDota is unavailable', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }))
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(502)
  })

  it('pages /promatches with less_than_match_id and stops once the page predates the lookback', async () => {
    let page0Url = null
    global.fetch = vi.fn((url) => {
      if (url.includes('api.opendota.com/api/promatches')) {
        if (!url.includes('less_than_match_id')) {
          page0Url = url
          // last match on the page is older than the 24h window → loop must stop after this page
          return Promise.resolve({ ok: true, json: async () => [
            odGame({ matchId: 7001, seriesId: 11, start: liveNow - 3600 }),
            odGame({ matchId: 7000, seriesId: 12, start: liveNow - 48 * 3600 }),
          ] })
        }
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ 7001: 'pgl_dota2' }) })
    })

    const res = makeRes()
    await handler(makeReq(), res)

    const promatchesCalls = global.fetch.mock.calls.filter(([u]) => u.includes('/promatches'))
    expect(promatchesCalls).toHaveLength(1)               // stopped after page 0 (oldest < lookback)
    expect(page0Url).not.toContain('less_than_match_id')  // first page is the unparameterized feed
    expect(res.body.series).toBe(1)                        // only the in-window series is selected
  })
})

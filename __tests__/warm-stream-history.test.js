/**
 * Tests for the warm-streams cron in api/live-matches.js.
 *
 * Covers the pure selectSeriesToWarm() selector (tier filter, lookback boundary,
 * series grouping, null-field guards, cap, series-completion gate) and the handler
 * branch that drives the existing /api/match-streams resolver to fuzzy-bind completed
 * tier-1 series and, once truly complete, fires the WS3 replay-ready push.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: () => ({}) }))

const { mockKv, mockSendNotification } = vi.hoisted(() => {
  const mockKv = { get: vi.fn(), set: vi.fn(), mget: vi.fn(), scan: vi.fn(), del: vi.fn() }
  return { mockKv, mockSendNotification: vi.fn() }
})
vi.mock('../api/_kv.js', () => ({ kv: mockKv }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { Object.assign(this, mockKv) } } }))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mockSendNotification } }))

import handler, { selectSeriesToWarm } from '../api/live-matches.js'

const NOW = 1_780_000_000 // fixed reference second
const recent = (offsetSec = 3600) => NOW - offsetSec

function odGame({ matchId, seriesId = 0, league = 'The International 2026 - Regional Qualifier Southeast Asia', radiant = 'REKONIX', dire = 'TEAM GRIND', start = recent(), seriesType, radiantWin }) {
  return { match_id: matchId, series_id: seriesId, league_name: league, radiant_name: radiant, dire_name: dire, start_time: start, series_type: seriesType, radiant_win: radiantWin }
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

  // Regression: EWC 2026 Liquid vs Xtreme, 2026-07-14 — a replay-ready push fired after
  // Game 1 alone of a BO3, which was still 1-0. Reuses the SAME completion logic the
  // homepage feed uses (src/seriesLogic.js), not a reimplementation — these tests exercise
  // it through selectSeriesToWarm's output.
  describe('isSeriesComplete gate', () => {
    it('BO3 (seriesType 1) with only Game 1 played is NOT complete', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 900, seriesType: 1, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(false)
    })

    it('BO3 2-0 sweep (2 games, same winner) IS complete', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 901, seriesType: 1, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 901, seriesType: 1, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(true)
    })

    it('BO3 at 1-1 (game 2 won by the loser of game 1) is NOT complete — decider still to play', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 902, seriesType: 1, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 902, seriesType: 1, radiantWin: false }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(false)
    })

    it('BO3 decider: 2-1 after game 3 IS complete', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 903, seriesType: 1, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 903, seriesType: 1, radiantWin: false }),
        odGame({ matchId: 3, seriesId: 903, seriesType: 1, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(true)
    })

    it('BO1 (seriesType 0) is complete after its single game', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 904, seriesType: 0, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(true)
    })

    it('BO5 (seriesType 2) needs 3 wins: 2-0 not complete, 3-0 complete', () => {
      const twoGames = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 905, seriesType: 2, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 905, seriesType: 2, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(twoGames[0].isSeriesComplete).toBe(false)

      const threeGames = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 906, seriesType: 2, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 906, seriesType: 2, radiantWin: true }),
        odGame({ matchId: 3, seriesId: 906, seriesType: 2, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(threeGames[0].isSeriesComplete).toBe(true)
    })

    it('missing/unknown seriesType with 1 game is fail-safe (treated as not-yet-complete, not guessed)', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 907, seriesType: undefined, radiantWin: true }),
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      // winsRequiredForSeries defaults unknown types to 2 (BO3-like) — 1 win is not enough.
      expect(out[0].isSeriesComplete).toBe(false)
    })

    it('a game with no result yet (radiant_win missing) does not count toward the win total', () => {
      const out = selectSeriesToWarm([
        odGame({ matchId: 1, seriesId: 908, seriesType: 1, radiantWin: true }),
        odGame({ matchId: 2, seriesId: 908, seriesType: 1, radiantWin: undefined }), // e.g. still parsing
      ], { tier1Names: TIER1, nowSec: NOW, lookbackSec: 24 * 3600 })
      expect(out[0].isSeriesComplete).toBe(false)
    })
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

  it('passes per-game starts param so each sibling gets its own started_at in Supabase', async () => {
    const game1Start = liveNow - 7200
    const game2Start = liveNow - 3600
    global.fetch = vi.fn((url) => {
      if (url.includes('api.opendota.com/api/promatches')) {
        if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] })
        return Promise.resolve({ ok: true, json: async () => [
          { ...liveGame(8003, 99), start_time: game1Start },
          { ...liveGame(8004, 99), start_time: game2Start },
        ] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ 8003: 'pgl_dota2', 8004: 'pgl_dota2' }) })
    })

    const res = makeRes()
    await handler(makeReq(), res)

    const call = global.fetch.mock.calls.find(([u]) => u.includes('/api/match-streams'))
    expect(call).toBeTruthy()
    // Parse starts param to verify each game ID maps to its own timestamp (not game 1's)
    const starts = new URL(call[0]).searchParams.get('starts')
    const pairs = (starts || '').split(',')
    expect(pairs).toContain(`8003:${game1Start}`)
    expect(pairs).toContain(`8004:${game2Start}`)
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

  // End-to-end regression coverage for the fix: a channel binding alone must NOT be enough
  // to fire the replay-ready push — the series must actually be won. VAPID must be set for
  // dispatchPush to run at all (it no-ops otherwise).
  describe('WS3 replay-ready push — gated on series completion, not just channel bind', () => {
    beforeEach(() => {
      process.env.VAPID_PRIVATE_KEY = 'test-vapid-key'
      mockSendNotification.mockReset().mockResolvedValue({})
      // Route mget by key prefix: unbound stream cache (forces an attempt), one subscriber
      // per team lookup, not-yet-sent dedup, a valid stored subscription, and default prefs.
      mockKv.mget.mockImplementation((...keys) => {
        const first = keys[0] || ''
        if (first.startsWith('stream:match:')) return Promise.resolve(keys.map(() => null))
        if (first.startsWith('push:team:')) return Promise.resolve(keys.map(() => ['user1']))
        if (first.startsWith('push:sent:')) return Promise.resolve(keys.map(() => null))
        if (first.startsWith('push:sub:')) return Promise.resolve(keys.map(() => JSON.stringify({ endpoint: 'https://push.example/ep', keys: { p256dh: 'p', auth: 'a' } })))
        if (first.startsWith('push:prefs:')) return Promise.resolve(keys.map(() => null))
        return Promise.resolve(keys.map(() => null))
      })
    })

    it('does NOT send a replay-ready push when only Game 1 of a BO3 is bound (series still 1-0)', async () => {
      global.fetch = vi.fn((url) => {
        if (url.includes('api.opendota.com/api/promatches')) {
          if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] })
          return Promise.resolve({ ok: true, json: async () => [
            liveGame(8101, 950),
          ].map(g => ({ ...g, series_type: 1, radiant_win: true })) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ 8101: 'pgl_dota2' }) })
      })

      const res = makeRes()
      await handler(makeReq(), res)

      expect(res.body.bound).toBe(1)          // channel binding is unconditional — still happens
      expect(mockSendNotification).not.toHaveBeenCalled()
    })

    it('DOES send a replay-ready push once the BO3 is actually won (2-0)', async () => {
      global.fetch = vi.fn((url) => {
        if (url.includes('api.opendota.com/api/promatches')) {
          if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] })
          return Promise.resolve({ ok: true, json: async () => [
            liveGame(8102, 951),
            liveGame(8103, 951),
          ].map(g => ({ ...g, series_type: 1, radiant_win: true })) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ 8102: 'pgl_dota2', 8103: 'pgl_dota2' }) })
      })

      const res = makeRes()
      await handler(makeReq(), res)

      expect(res.body.bound).toBe(1)
      expect(mockSendNotification).toHaveBeenCalledTimes(1)
      const [, payloadStr] = mockSendNotification.mock.calls[0]
      const payload = JSON.parse(payloadStr)
      expect(payload.tag).toBe('replay-8102') // anchor = min match id in the series
      expect(payload.title).not.toMatch(/\d+\s*-\s*\d+/) // spoiler-safe: no score in the title
    })

    it('the exact incident sequence: Game 1 binds+skips-push on one cron run, Game 2 finishing on a LATER run correctly fires once the series is won', async () => {
      // Run 1: only Game 1 exists yet (not bound in KV).
      global.fetch = vi.fn((url) => {
        if (url.includes('api.opendota.com/api/promatches')) {
          if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] })
          return Promise.resolve({ ok: true, json: async () => [
            liveGame(8201, 952),
          ].map(g => ({ ...g, series_type: 1, radiant_win: true })) })
        }
        return Promise.resolve({ ok: true, json: async () => ({ 8201: 'pgl_dota2' }) })
      })
      const res1 = makeRes()
      await handler(makeReq(), res1)
      expect(res1.body.bound).toBe(1)
      expect(mockSendNotification).not.toHaveBeenCalled() // 1-0, series not complete

      // Run 2 (next cron tick): Game 2 has now finished too. Game 1's channel is already
      // bound in KV (stream:match:8201); Game 2's is not — so the series is re-attempted
      // (existing.every(Boolean) is false) and the completion gate re-evaluates with BOTH
      // games. This is the exact sequence that produced the real incident.
      mockKv.mget.mockImplementation((...keys) => {
        const first = keys[0] || ''
        if (first.startsWith('stream:match:')) return Promise.resolve(keys.map(k => k === 'stream:match:8201' ? 'pgl_dota2' : null))
        if (first.startsWith('push:team:')) return Promise.resolve(keys.map(() => ['user1']))
        if (first.startsWith('push:sent:')) return Promise.resolve(keys.map(() => null))
        if (first.startsWith('push:sub:')) return Promise.resolve(keys.map(() => JSON.stringify({ endpoint: 'https://push.example/ep', keys: { p256dh: 'p', auth: 'a' } })))
        if (first.startsWith('push:prefs:')) return Promise.resolve(keys.map(() => null))
        return Promise.resolve(keys.map(() => null))
      })
      global.fetch = vi.fn((url) => {
        if (url.includes('api.opendota.com/api/promatches')) {
          if (url.includes('less_than_match_id')) return Promise.resolve({ ok: true, json: async () => [] })
          return Promise.resolve({ ok: true, json: async () => [
            liveGame(8201, 952),
            liveGame(8202, 952),
          ].map(g => ({ ...g, series_type: 1, radiant_win: true })) }) // 2-0 sweep
        }
        return Promise.resolve({ ok: true, json: async () => ({ 8201: 'pgl_dota2', 8202: 'pgl_dota2' }) })
      })
      const res2 = makeRes()
      await handler(makeReq(), res2)

      expect(mockSendNotification).toHaveBeenCalledTimes(1) // fires now that the series is actually won
      const payload = JSON.parse(mockSendNotification.mock.calls[0][1])
      expect(payload.tag).toBe('replay-8201')
    })
  })
})

/**
 * Coverage for the last-known-good fallback on /api/live-matches and /api/upcoming-matches
 * (pending-refactors #34).
 *
 * Both endpoints used to throw a 500 straight to the browser when PandaScore returned 429, which
 * breaks the homepage feed outright (Sentry JAVASCRIPT-7: 745 events; JAVASCRIPT-A: 160 events in
 * one unbroken 14-min window). This is the blast-radius fix: it decouples the user-facing feed
 * from PandaScore quota state entirely, independent of the root-cause work in #35/#36.
 *
 * THE TRAP this guards, worth stating because it is invisible from the failure path alone: you
 * cannot "read the expired KV entry" on failure. The `kv.get(KV_KEY)` early-return means the
 * PandaScore fetch is only ever reached once KV_KEY is already GONE, so a second key is required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))

const { trackErrorCalls } = vi.hoisted(() => ({ trackErrorCalls: [] }))
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isTier1: () => true,
    trackError: vi.fn((...args) => { trackErrorCalls.push(args); return Promise.resolve() }),
  }
})

const { mockKv, kvSetCalls, kvDelCalls } = vi.hoisted(() => {
  const kvSetCalls = []
  const kvDelCalls = []
  const mockKv = {
    get: vi.fn(),
    set: vi.fn((...args) => { kvSetCalls.push(args); return Promise.resolve('OK') }),
    del: vi.fn((...args) => { kvDelCalls.push(args); return Promise.resolve(1) }),
    lpush: vi.fn(), ltrim: vi.fn(), expire: vi.fn(), lrange: vi.fn(() => Promise.resolve([])),
  }
  return { mockKv, kvSetCalls, kvDelCalls }
})
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() { Object.assign(this, mockKv) } } }))

import liveHandler from '../api/live-matches.js'
import upcomingHandler from '../api/upcoming-matches.js'

const LIVE = {
  key: 'dota2:live_matches_last_good', primary: 'dota2:live_matches_v5',
  endpoint: '/api/live-matches', handler: liveHandler, holddown: 60,
}
const UPCOMING = {
  key: 'dota2:upcoming_matches_last_good', primary: 'dota2:upcoming_matches_v6',
  endpoint: '/api/upcoming-matches', handler: upcomingHandler, holddown: 300,
}

function makeMatch(id = 1) {
  return {
    id,
    league: { name: 'DreamLeague' },
    serie: { full_name: 'DreamLeague Season 25', name: 'Season 25' },
    match_type: 'best_of_3',
    scheduled_at: '2026-03-24T10:00:00Z',
    begin_at: '2026-03-24T10:00:00Z',
    opponents: [
      { opponent: { id: 10, name: 'Team A' } },
      { opponent: { id: 20, name: 'Team B' } },
    ],
    results: [], games: [], streams_list: [],
  }
}

const makeReq = (query = {}) => ({ query })
function makeRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.setHeader = vi.fn((k, v) => { res.headers[k] = v })
  res.status = vi.fn((c) => { res.statusCode = c; return res })
  res.json = vi.fn((b) => { res.body = b; return res })
  return res
}

/** KV that is cold for the primary key but holds `lastGood` under the fallback key. */
function kvWithLastGood(fallbackKey, lastGood) {
  mockKv.get.mockImplementation((k) => Promise.resolve(k === fallbackKey ? lastGood : null))
}

beforeEach(() => {
  kvSetCalls.length = 0
  kvDelCalls.length = 0
  trackErrorCalls.length = 0
  vi.clearAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockKv.lrange.mockResolvedValue([])
  // Re-stubbed explicitly: vi.clearAllMocks() clears call history but NOT implementations, and the
  // D1 test below replaces this one with a throwing version. Without this, any test added after it
  // inherits a KV that throws on every stream:* write.
  mockKv.set.mockImplementation((...args) => { kvSetCalls.push(args); return Promise.resolve('OK') })
  process.env.PANDASCORE_TOKEN = 'test-token'
  global.fetch = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null }, json: async () => [makeMatch()] })
})

describe.each([LIVE, UPCOMING])('$endpoint last-known-good', ({ key, primary, endpoint, handler, holddown }) => {
  it('writes the last-known-good key on a successful regen, with a 1h TTL', async () => {
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)

    const write = kvSetCalls.find(([k]) => k === key)
    expect(write, `${endpoint} should write ${key}`).toBeDefined()
    expect(write[2]).toEqual({ ex: 3600 })
    // Same payload as the primary cache entry — not a reshaped copy that could drift.
    const primary = kvSetCalls.find(([k]) => k.startsWith('dota2:') && k !== key)
    expect(write[1]).toEqual(primary[1])
  })

  it('serves the last-known-good payload instead of 500ing when PandaScore 429s', async () => {
    const lastGood = { matches: [{ id: 99 }], fetchedAt: '2026-08-20T11:00:00.000Z' }
    kvWithLastGood(key, lastGood)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.matches).toEqual(lastGood.matches)
    expect(res.body.stale).toBe(true)
    // fetchedAt is preserved from the original generation so the age is honest, not refreshed.
    expect(res.body.fetchedAt).toBe(lastGood.fetchedAt)
  })

  it('marks the stale response with a short s-maxage so it self-heals fast', async () => {
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.headers['Cache-Control']).toBe('s-maxage=30, stale-while-revalidate=30')
  })

  it('records the absorbed failure at status 200 so it never pages a human', async () => {
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    await handler(makeReq(), makeRes())

    const call = trackErrorCalls.find(([ep]) => ep === endpoint)
    expect(call, 'the upstream failure must still be recorded').toBeDefined()
    expect(call[1]).toBe(200)
    expect(call[2]).toMatch(/absorbed/)
    expect(call[2]).toMatch(/429/)
  })

  it('still returns 500 when there is no last-known-good payload to fall back to', async () => {
    mockKv.get.mockResolvedValue(null)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(500)
    expect(trackErrorCalls.find(([ep]) => ep === endpoint)[1]).toBe(500)
  })

  it('falls back on a network failure too, not just an HTTP error status', async () => {
    kvWithLastGood(key, { matches: [{ id: 7 }], fetchedAt: 'x' })
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.stale).toBe(true)
  })

  it('does NOT delete the last-known-good key on ?bust=1', async () => {
    // Busting forces a fresh regen; dropping the safety net at the same moment is the opposite
    // of what bust is for, and would leave the very next failure with nothing to serve.
    await handler(makeReq({ bust: '1' }), makeRes())
    expect(kvDelCalls.flat()).not.toContain(key)
  })

  it('keeps no-store on a stale response served during ?bust=1', async () => {
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await handler(makeReq({ bust: '1' }), res)
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  // ── Gaps found in independent review ──────────────────────────────────────

  it('does not leak a stale flag onto a successful response', async () => {
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.stale).toBeUndefined()
  })

  it('still writes the last-known-good key on a successful ?bust=1 regen', async () => {
    await handler(makeReq({ bust: '1' }), makeRes())
    expect(kvSetCalls.map(([k]) => k)).toContain(key)
  })

  it('returns 500 rather than throwing when KV itself is down during the failure', async () => {
    // Both upstreams failing at once. The `.catch(() => null)` on the fallback read is what stops
    // this becoming an unhandled rejection inside the catch block; nothing else pins it.
    mockKv.get.mockRejectedValue(new Error('upstash unreachable'))
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await expect(handler(makeReq(), res)).resolves.not.toThrow()
    expect(res.statusCode).toBe(500)
  })

  it('holds the stale payload down in the primary key so the outage is not amplified', async () => {
    // Without this write, every subsequent origin request re-runs the PandaScore fetch — turning
    // the fallback into an amplifier of the very quota exhaustion it exists to absorb.
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    await handler(makeReq(), makeRes())

    const write = kvSetCalls.find(([k]) => k === primary)
    expect(write, 'stale path must hold down the primary key').toBeDefined()
    expect(write[1].stale).toBe(true)
    expect(write[2]).toEqual({ ex: holddown })
  })

  it('serves a held-down stale entry with the short header, not the normal one', async () => {
    // The held-down payload lives under the PRIMARY key, so it comes back via the early return.
    // Inheriting the normal s-maxage there would pin stale data far past the hold-down itself.
    mockKv.get.mockImplementation((k) => Promise.resolve(k === primary ? { matches: [], fetchedAt: 'x', stale: true } : null))

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(res.headers['Cache-Control']).toBe('s-maxage=30, stale-while-revalidate=30')
  })

  it('serves a normal cached entry with the normal header', async () => {
    mockKv.get.mockImplementation((k) => Promise.resolve(k === primary ? { matches: [], fetchedAt: 'x' } : null))
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.headers['Cache-Control']).not.toBe('s-maxage=30, stale-while-revalidate=30')
  })

  it('does not send an absorbed failure to Sentry', async () => {
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    await handler(makeReq(), makeRes())

    const call = trackErrorCalls.find(([ep]) => ep === endpoint)
    expect(call[4]).toEqual({ sentry: false })
  })

  it('never writes a payload carrying stale into the last-known-good key', async () => {
    // The corruption loop to prevent: a stale payload being promoted back to "good" and then
    // becoming the source for the next fallback, ratcheting the data older every cycle.
    mockKv.get.mockImplementation((k) => Promise.resolve(k === primary ? { matches: [], fetchedAt: 'x', stale: true } : null))
    await handler(makeReq(), makeRes())

    const promoted = kvSetCalls.filter(([k]) => k === key)
    for (const [, value] of promoted) expect(value.stale).toBeUndefined()
  })

  it('does not re-poison the cache with a hold-down during ?bust=1', async () => {
    // bust just deleted KV_KEY on purpose. Writing stale straight back would make the NEXT normal
    // request serve stale instead of retrying — the opposite of what the operator asked for.
    kvWithLastGood(key, { matches: [], fetchedAt: 'x' })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await handler(makeReq({ bust: '1' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(kvSetCalls.map(([k]) => k), 'bust must not write the hold-down').not.toContain(primary)
  })

  it('survives a SYNCHRONOUS throw from the KV client on the failure path', async () => {
    // .catch() only handles rejections; a sync throw would escape as an unhandled rejection and a
    // bare platform 500 with no trackError. The D1 test proves sync throws are reachable here.
    mockKv.get.mockImplementation(() => { throw new Error('sync upstash boom') })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) })

    const res = makeRes()
    await expect(handler(makeReq(), res)).resolves.not.toThrow()
    expect(res.statusCode).toBe(500)
  })
})

// live-matches only: upcoming-matches has no post-payload side effect.
describe('/api/live-matches — a fresh payload must beat the fallback', () => {
  it('does not serve stale when the LOCKED stream-cache write throws after the payload is built', async () => {
    // Found in independent review. cacheRunningStreams() ran unguarded inside the outer try, so a
    // throw there fell into the catch and served an OLDER last-known-good payload than the correct
    // one already in hand — and recorded a genuine VOD-path failure at 200, which the 5xx-only
    // critical rule would then never page on.
    const lastGood = { matches: [{ id: 'STALE' }], fetchedAt: '2026-08-20T11:00:00.000Z' }
    // A RUNNING game with a resolvable single stream, so cacheRunningStreams actually reaches a
    // `stream:*` write — otherwise this test passes vacuously without ever triggering a throw.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => [{
        ...makeMatch(),
        games: [{ position: 1, status: 'running', winner: null, external_identifier: 'G1', begin_at: '2026-03-24T11:30:00Z' }],
        streams_list: [{ official: true, language: 'en', raw_url: 'https://www.twitch.tv/esl_dota2earth' }],
      }],
    })
    mockKv.get.mockImplementation((k) =>
      Promise.resolve(k === 'dota2:live_matches_last_good' ? lastGood : null))
    mockKv.set.mockImplementation((k, ...rest) => {
      kvSetCalls.push([k, ...rest])
      if (String(k).startsWith('stream:')) throw new Error('stream cache exploded')
      return Promise.resolve('OK')
    })

    const res = makeRes()
    await liveHandler(makeReq(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.stale).toBeUndefined()
    expect(res.body.matches).not.toEqual(lastGood.matches)
    // And the VOD-path failure is still recorded as user-visible severity so it keeps paging.
    const call = trackErrorCalls.find(([, code]) => code === 500)
    expect(call, 'a stream cache failure must still be tracked at 500').toBeDefined()
    expect(call[2]).toMatch(/stream cache/i)
  })
})

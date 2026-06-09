/**
 * Tests for api/match-streams.js ?mode=twitch-vod
 *
 * Covers: KV VOD cache hit, full cache miss with Helix fetch, UID cache hit,
 * VOD miss (30min TTL), missing credentials (503), missing params (400),
 * Helix users error (502).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))

const { mockKv } = vi.hoisted(() => {
  const mockKv = {
    get: vi.fn(),
    set: vi.fn(() => Promise.resolve('OK')),
    mget: vi.fn(() => Promise.resolve([])),
  }
  return { mockKv }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { Object.assign(this, mockKv) }
  },
}))

vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual }
})

import handler from '../api/match-streams.js'

function makeReq(query = {}) {
  return { query }
}
function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    setHeader: vi.fn(),
  }
  return res
}

const MATCH_START = 1700000000
const DAY_BUCKET = Math.floor(MATCH_START / 86400) // 19675
const VOD_CACHE_KEY = `twitch:vod:v1:esl_dota2:${DAY_BUCKET}`
const UID_CACHE_KEY = 'twitch:channel-uid:v1:esl_dota2'

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.mget.mockResolvedValue([])
  mockKv.set.mockResolvedValue('OK')
  process.env.TWITCH_CLIENT_ID = 'test-client-id'
  process.env.TWITCH_CLIENT_SECRET = 'test-client-secret'
})

describe('match-streams ?mode=twitch-vod', () => {
  it('returns cached VOD on KV hit', async () => {
    const cached = { url: 'https://www.twitch.tv/videos/123?t=600s', channel: 'esl_dota2', startedAt: '2023-11-14T12:00:00Z' }
    mockKv.get.mockResolvedValueOnce(cached)

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual(cached)
    expect(mockKv.get).toHaveBeenCalledWith(VOD_CACHE_KEY)
    // Only one KV read needed — no Twitch calls
    expect(mockKv.get).toHaveBeenCalledTimes(1)
  })

  it('fetches token, UID, and VOD on full cache miss — caches with correct TTLs', async () => {
    const vodStart = MATCH_START - 3600
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce(null) // token cache miss
      .mockResolvedValueOnce(null) // UID cache miss

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 5184000 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'uid123' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        data: [{
          id: 'vod456',
          created_at: new Date(vodStart * 1000).toISOString(),
          duration: '3h0m0s',
        }]
      })})

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.url).toContain('vod456')
    expect(res._body.channel).toBe('esl_dota2')
    // UID cached for 30 days
    expect(mockKv.set).toHaveBeenCalledWith(UID_CACHE_KEY, 'uid123', { ex: 30 * 24 * 3600 })
    // VOD result cached for 24h
    expect(mockKv.set).toHaveBeenCalledWith(
      VOD_CACHE_KEY,
      expect.objectContaining({ url: expect.stringContaining('vod456') }),
      { ex: 24 * 3600 }
    )
  })

  it('uses cached token and UID, caches VOD miss with 30min TTL', async () => {
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce({ token: 'cached-tok', clientId: 'test-client-id' }) // token cache hit
      .mockResolvedValueOnce('uid999') // UID cache hit

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual({ url: null, channel: 'esl_dota2' })
    // VOD miss cached for 30 min, not 24h
    expect(mockKv.set).toHaveBeenCalledWith(VOD_CACHE_KEY, { url: null, channel: 'esl_dota2' }, { ex: 1800 })
  })

  it('returns 200 with url:null when channel has no Helix user record', async () => {
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce({ token: 'tok', clientId: 'cid' }) // token hit
      .mockResolvedValueOnce(null) // UID cache miss

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })

    const req = makeReq({ mode: 'twitch-vod', channel: 'unknown_channel', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.url).toBeNull()
    // Miss should be cached
    expect(mockKv.set).toHaveBeenCalledWith(
      expect.stringContaining('twitch:vod:v1:unknown_channel:'),
      expect.objectContaining({ url: null }),
      { ex: 1800 }
    )
  })

  it('returns 503 when Twitch credentials are missing', async () => {
    delete process.env.TWITCH_CLIENT_ID
    mockKv.get.mockResolvedValueOnce(null) // VOD cache miss

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(503)
    expect(res._body).toMatchObject({ error: expect.any(String) })
  })

  it('returns 400 when channel param is missing', async () => {
    const req = makeReq({ mode: 'twitch-vod', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(400)
  })

  it('returns 400 when ts param is missing', async () => {
    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(400)
  })

  it('returns 503 when token fetch fails (non-ok from Twitch token endpoint)', async () => {
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce(null) // token cache miss

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false }) // token endpoint non-ok

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(503)
  })

  it('returns 502 when Helix users endpoint returns non-ok', async () => {
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce({ token: 'tok', clientId: 'cid' }) // token hit
      .mockResolvedValueOnce(null) // UID cache miss

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false })

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(502)
  })

  it('returns 502 when Helix videos endpoint returns non-ok', async () => {
    mockKv.get
      .mockResolvedValueOnce(null) // VOD cache miss
      .mockResolvedValueOnce({ token: 'tok', clientId: 'cid' }) // token hit
      .mockResolvedValueOnce('uid999') // UID cache hit

    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false }) // videos fetch fails

    const req = makeReq({ mode: 'twitch-vod', channel: 'esl_dota2', ts: String(MATCH_START) })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(502)
  })
})

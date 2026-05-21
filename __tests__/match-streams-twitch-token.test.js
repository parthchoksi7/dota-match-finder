/**
 * Tests for api/match-streams.js ?mode=twitch-token
 *
 * Covers: KV cache hit, KV miss → Twitch fetch → cache write, missing credentials,
 * Twitch API error, and fetch exception.
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

// Mock PANDASCORE_BASE so the import resolves without env vars
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

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.mget.mockResolvedValue([])
  mockKv.set.mockResolvedValue('OK')
  process.env.TWITCH_CLIENT_ID = 'test-client-id'
  process.env.TWITCH_CLIENT_SECRET = 'test-client-secret'
})

describe('match-streams ?mode=twitch-token', () => {
  it('returns cached token when KV hit', async () => {
    const cached = { token: 'cached-token', clientId: 'test-client-id' }
    mockKv.get.mockResolvedValueOnce(cached)

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual(cached)
    expect(mockKv.get).toHaveBeenCalledWith('twitch:token:v1')
  })

  it('fetches from Twitch on KV miss and caches result', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-token', expires_in: 5184000 }),
    })

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual({ token: 'new-token', clientId: 'test-client-id' })
    expect(mockKv.set).toHaveBeenCalledWith(
      'twitch:token:v1',
      { token: 'new-token', clientId: 'test-client-id' },
      expect.objectContaining({ ex: expect.any(Number) })
    )
  })

  it('returns 503 when credentials are missing', async () => {
    delete process.env.TWITCH_CLIENT_SECRET

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(503)
    expect(res._body).toMatchObject({ error: expect.any(String) })
  })

  it('returns 502 when Twitch API returns non-ok', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false })

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(502)
    expect(res._body).toMatchObject({ error: expect.any(String) })
  })

  it('returns 502 when fetch throws', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network error'))

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(502)
    expect(res._body).toMatchObject({ error: expect.any(String) })
  })

  it('TTL is capped at a minimum of 3600s', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      // expires_in less than 3600 → TTL should clamp to 3600
      json: async () => ({ access_token: 'tok', expires_in: 100 }),
    })

    const req = makeReq({ mode: 'twitch-token' })
    const res = makeRes()
    await handler(req, res)

    expect(mockKv.set).toHaveBeenCalledWith(
      'twitch:token:v1',
      expect.any(Object),
      { ex: 3600 }
    )
  })
})

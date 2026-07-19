/**
 * Handler-level tests for the match-summary path of api/summarize.js's default-exported handler —
 * the request-contract change from `{ matchData }` to `{ matchId }` (2026-07-19). Complements
 * __tests__/summarize-match-fetch.test.js (which unit-tests getMatchData in isolation) by exercising
 * the two new response branches through the REAL handler: 400 on an invalid matchId (real validateId,
 * not mocked) and 502 when getMatchData can't produce match data. Mocks kv and the rate-limit/CORS/
 * logger helpers so no real network or Redis call happens; the Anthropic call is never reached by
 * either test here since both fail before that point.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/_kv.js', () => ({ kv: { get: vi.fn(), set: vi.fn() } }))

vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual, // real validateId — the 400 branch should reflect its real behavior, not a stub
    trackError: vi.fn(),
    rateLimitByIp: vi.fn().mockResolvedValue(true),
    setCorsHeaders: vi.fn().mockReturnValue(false),
    createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  }
})

import handler from '../api/summarize.js'

function mockReq(body) {
  return { method: 'POST', headers: {}, body }
}

function mockRes() {
  const res = {}
  res.setHeader = vi.fn()
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

describe('api/summarize.js handler — match-summary contract ({ matchId })', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    global.fetch = vi.fn()
  })

  it('400s on a missing matchId without ever calling OpenDota', async () => {
    const res = mockRes()
    await handler(mockReq({}), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('400s on a non-numeric matchId without ever calling OpenDota', async () => {
    const res = mockRes()
    await handler(mockReq({ matchId: 'not-a-number' }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('502s when OpenDota has no data for a well-formed matchId (getMatchData returns null)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: vi.fn() }))
    const res = mockRes()
    await handler(mockReq({ matchId: '999999999' }), res)
    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to fetch match data' }))
  })
})

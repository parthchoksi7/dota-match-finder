/**
 * Tests for the feedback handler merged into api/draft-posts.js (type: 'feedback').
 * Uses a mock req/res pattern matching the existing test style.
 * Mocks Resend and kv so no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.mock is hoisted above imports, so mockSend must be declared with vi.hoisted
const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'test-email-id' }))

vi.mock('resend', () => ({
  Resend: vi.fn(function() { return { emails: { send: mockSend } } }),
}))

let kvStore = {}
vi.mock('../api/_kv.js', () => ({
  kv: {
    incr: vi.fn(async (key) => {
      kvStore[key] = (kvStore[key] || 0) + 1
      return kvStore[key]
    }),
    expire: vi.fn().mockResolvedValue(1),
  },
}))

vi.mock('../api/_x-post.js', () => ({
  uploadMedia: vi.fn(),
  postTweet: vi.fn(),
  postPoll: vi.fn(),
  checkTwitterEnv: vi.fn(),
  fetchUserIdByHandle: vi.fn(),
  fetchRecentTweets: vi.fn(),
}))

vi.mock('../api/_shared.js', () => ({
  getPremiumLeagueIds: vi.fn(),
  trackError: vi.fn(),
  PERMANENT_TIER1_NAMES: [],
  KV_TIER1_NAMES_KEY: 'key',
  isTier1ByName: vi.fn(),
  isTier1: vi.fn(),
  buildTournamentName: vi.fn(),
  getSeriesLabel: vi.fn(),
}))

vi.mock('../api/_x-accounts.js', () => ({
  lookupTournamentHandle: vi.fn(),
  lookupTeamHandle: vi.fn(),
  pickTournamentTalent: vi.fn(),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body = {}, ip = '1.2.3.4') {
  return {
    method: 'POST',
    body: { type: 'feedback', ...body },
    headers: { 'x-forwarded-for': ip },
    socket: {},
  }
}

function makeRes() {
  const res = { _status: 200, _body: null }
  res.status = (code) => { res._status = code; return res }
  res.json = (body) => { res._body = body; return res }
  return res
}

// ── Import handler after mocks are set up ────────────────────────────────────

const { default: handler } = await import('../api/draft-posts.js')

// ── Tests ────────────────────────────────────────────────────────────────────

describe('feedback handler (type: feedback)', () => {
  beforeEach(() => {
    kvStore = {}
    mockSend.mockClear()
  })

  it('accepts a valid message and returns ok', async () => {
    const req = makeReq({ message: 'This is a valid feedback message', page: '/' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ ok: true })
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('includes the page and reply_to in the email when email is provided', async () => {
    const req = makeReq({ message: 'Great site, love the stats!', email: 'user@example.com', page: '/about' })
    const res = makeRes()
    await handler(req, res)
    const call = mockSend.mock.calls[0][0]
    expect(call.reply_to).toBe('user@example.com')
    expect(call.html).toContain('/about')
  })

  it('returns 400 when message is missing', async () => {
    const req = makeReq({ message: undefined })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body.error).toBe('message_required')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns 400 when message is too short (under 10 chars)', async () => {
    const req = makeReq({ message: 'Bug' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body.error).toBe('message_too_short')
  })

  it('returns 400 when message exceeds 1000 chars', async () => {
    const req = makeReq({ message: 'a'.repeat(1001) })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body.error).toBe('message_too_long')
  })

  it('returns 400 for an invalid email format', async () => {
    const req = makeReq({ message: 'Here is my feedback message', email: 'not-an-email' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body.error).toBe('invalid_email')
  })

  it('silently succeeds (200) after 3 submissions from the same IP', async () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 3; i++) {
      const req = makeReq({ message: 'Valid feedback message here' }, ip)
      const res = makeRes()
      await handler(req, res)
      expect(res._status).toBe(200)
    }
    // 4th submission: silent 200 but no email sent
    mockSend.mockClear()
    const req = makeReq({ message: 'Valid feedback message here' }, ip)
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(200)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sets reply_to to undefined when no email is provided', async () => {
    const req = makeReq({ message: 'Anonymous feedback message here' })
    const res = makeRes()
    await handler(req, res)
    const call = mockSend.mock.calls[0][0]
    expect(call.reply_to).toBeUndefined()
  })
})

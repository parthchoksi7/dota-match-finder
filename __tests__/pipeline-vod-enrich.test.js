/**
 * Tests for api/pipeline.js ?type=vod-enrich
 *
 * Covers: auth rejection, resolved VOD (DB updated), pending miss (only vod_checked_at),
 * unavailable miss (vod_available=false), Supabase error → 500.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))

// ── Supabase mock (fluent builder) ────────────────────────────────────────────

const { mockUpdate, mockUpsert, mockFrom, mockGetSupabaseAdmin } = vi.hoisted(() => {
  const mockUpdate = vi.fn()
  const mockUpsert = vi.fn().mockResolvedValue({ error: null })

  // Fluent builder: every method returns `this` until `.limit()` / `.maybeSingle()` which resolves
  function makeBuilder(resolveValue) {
    const b = {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve(resolveValue)),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
      in: vi.fn().mockReturnThis(),
    }
    // update returns a builder that resolves on .eq()
    b.update = mockUpdate
    b.upsert = mockUpsert
    return b
  }

  let callCount = 0
  let resolveSequence = []

  const mockFrom = vi.fn((table) => {
    const resolveValue = resolveSequence[callCount++] ?? { data: [], error: null }
    return makeBuilder(resolveValue)
  })

  const mockGetSupabaseAdmin = vi.fn(() => ({
    from: mockFrom,
    _setSequence(seq) { resolveSequence = seq; callCount = 0 },
  }))

  return { mockUpdate, mockUpsert, mockFrom, mockGetSupabaseAdmin }
})

vi.mock('../api/_supabase.js', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
  getSupabaseAnon: vi.fn(),
}))

// Stub all other pipeline deps that are imported but not exercised in vod-enrich path
vi.mock('../api/_kv.js', () => ({ kv: { get: vi.fn(), set: vi.fn(), mget: vi.fn() } }))
vi.mock('../api/pipeline/_session.js', () => ({
  todayKey: vi.fn(() => '2026-06-27'),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  getRecentTopicTitles: vi.fn(),
  addRecentTopics: vi.fn(),
}))
vi.mock('../api/pipeline/_news.js', () => ({ fetchNewsContext: vi.fn() }))
vi.mock('../api/pipeline/_claude.js', () => ({ generateTopics: vi.fn(), generateDraft: vi.fn(), generateXPost: vi.fn() }))
vi.mock('../api/pipeline/_telegram.js', () => ({
  sendMessage: vi.fn(),
  answerCallback: vi.fn(),
  topicsKeyboard: vi.fn(),
  draftKeyboard: vi.fn(),
  retryKeyboard: vi.fn(),
  chunkText: vi.fn(),
}))
vi.mock('../api/pipeline/_publisher.js', () => ({
  publishToDb: vi.fn(),
  postXTweet: vi.fn(),
  updateMetadataFiles: vi.fn(),
  patchLlms: vi.fn(),
  patchSitemap: vi.fn(),
}))
vi.mock('../api/pipeline/_vod-urls.js', () => ({
  groupSeriesFromRows: vi.fn(() => []),
  buildReplayResponse: vi.fn(() => ({})),
}))
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual }
})

import handler from '../api/pipeline.js'

function makeReq(query = {}, headers = {}) {
  return { method: 'GET', query, headers }
}
function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    setHeader: vi.fn(),
    end: vi.fn(),
  }
  return res
}

const CRON_SECRET = 'test-secret'

beforeEach(() => {
  vi.resetAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  mockUpsert.mockResolvedValue({ error: null })
})

describe('pipeline ?type=vod-enrich auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq({ type: 'vod-enrich' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(401)
  })

  it('returns 401 when Authorization header is wrong', async () => {
    const req = makeReq({ type: 'vod-enrich' }, { authorization: 'Bearer wrong-secret' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(401)
  })
})

describe('pipeline ?type=vod-enrich enrichment', () => {
  const authHeaders = { authorization: `Bearer ${CRON_SECRET}` }

  it('returns summary JSON with main/alt/seeded counts on success (no unresolved rows)', async () => {
    // Supabase returns empty rows for all queries → no resolver calls, no updates
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })),
    })

    const req = makeReq({ type: 'vod-enrich' }, authHeaders)
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({
      main: { resolved: 0, pending: 0, unavailable: 0, failed: 0 },
      alt:  { resolved: 0, pending: 0, unavailable: 0, failed: 0 },
      seeded: 0,
    })
  })

  it('resolves one main-channel row and writes twitch_vod_id to DB', async () => {
    const started_at = new Date(Date.now() - 48 * 3600 * 1000).toISOString() // 48h old → past grace
    const mainRow = { id: 1, od_match_id: 123456, channel: 'pgl_dota2', started_at }

    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdateReturn = { eq: mockEq }
    mockUpdate.mockReturnValue(mockUpdateReturn)

    let callIdx = 0
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => {
        const idx = callIdx++
        if (idx === 0) {
          // Pass 1: main channel query
          return {
            select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn(() => Promise.resolve({ data: [mainRow], error: null })),
            update: mockUpdate,
          }
        }
        if (idx === 1) {
          // update call on match_stream_history → handled by mockUpdate above
          return { update: mockUpdate }
        }
        // Seed query + alt query return empty
        return {
          select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }),
    })

    // Resolver returns a valid VOD URL (simulating a KV hit)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://www.twitch.tv/videos/999?t=600s', channel: 'pgl_dota2' }),
    })

    const req = makeReq({ type: 'vod-enrich' }, authHeaders)
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.main.resolved).toBe(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ twitch_vod_id: '999', vod_offset_s: 600, vod_available: true })
    )
  })

  it('marks row pending when resolver returns miss + channel live', async () => {
    const started_at = new Date(Date.now() - 1 * 3600 * 1000).toISOString() // 1h old (within grace)
    const mainRow = { id: 2, od_match_id: 999, channel: 'esl_dota2', started_at }

    // Chainable eq mock supporting .eq().eq()
    const chainEq = vi.fn().mockReturnThis()
    chainEq.mockReturnValue(Promise.resolve({ error: null }))
    mockUpdate.mockReturnValue({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) })

    let passIdx = 0
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => {
        const idx = passIdx++
        const empty = {
          select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: mockUpdate,
        }
        if (idx === 0) {
          // Main channel query → one row
          return { ...empty, limit: vi.fn(() => Promise.resolve({ data: [mainRow], error: null })) }
        }
        return empty
      }),
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: null, channel: 'esl_dota2', live: true }),
    })

    const req = makeReq({ type: 'vod-enrich' }, authHeaders)
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.main.pending).toBe(1)
    // Only vod_checked_at should be written (no twitch_vod_id)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ vod_checked_at: expect.any(String) })
    )
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ twitch_vod_id: expect.anything() })
    )
  })

  it('returns 500 when Supabase main-channel query errors', async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db error' } })),
      })),
    })

    const req = makeReq({ type: 'vod-enrich' }, authHeaders)
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._body).toMatchObject({ error: 'db error' })
  })
})

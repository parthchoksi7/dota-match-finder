/**
 * Integration tests for api/pipeline.js ?type=replay (public replay lookup).
 *
 * Uses the REAL api/pipeline/_vod-urls.js (buildReplayResponse/buildGameUrls) so
 * the match_stream_vods join is exercised end to end. Covers: full multi-language
 * response with alt-channel start-point upgrades, join failure degrading to
 * stream pages (never a 500), case-insensitive channel binding, 404 without a
 * Cache-Control header, 400 on invalid ids, and 500 on a history query error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Thenable fluent builder: chain methods return `this`; awaiting the builder (or
// calling .maybeSingle()) resolves with the next value in the configured sequence,
// so any chain shape (.eq().maybeSingle() or .eq().not()) terminates correctly.

const { mockFrom, mockGetSupabaseAdmin, setSequence } = vi.hoisted(() => {
  let sequence = []
  let callCount = 0

  function makeBuilder(resolveValue) {
    const b = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
      then(resolve, reject) {
        if (resolveValue instanceof Error) return Promise.reject(resolveValue).then(resolve, reject)
        return Promise.resolve(resolveValue).then(resolve, reject)
      },
    }
    return b
  }

  const mockFrom = vi.fn(() => makeBuilder(sequence[callCount++] ?? { data: null, error: null }))
  const mockGetSupabaseAdmin = vi.fn(() => ({ from: mockFrom }))
  const setSequence = (seq) => { sequence = seq; callCount = 0 }
  return { mockFrom, mockGetSupabaseAdmin, setSequence }
})

vi.mock('../api/_supabase.js', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
  getSupabaseAnon: vi.fn(),
}))

// Stub unrelated pipeline deps (same set as pipeline-vod-enrich.test.js), but
// keep _vod-urls.js REAL — the join integration is what this file tests.
vi.mock('../api/_kv.js', () => ({ kv: { get: vi.fn(), set: vi.fn(), mget: vi.fn() } }))
vi.mock('../api/pipeline/_session.js', () => ({
  todayKey: vi.fn(() => '2026-07-11'),
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
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual }
})

import handler from '../api/pipeline.js'

function makeReq(query = {}) {
  return { method: 'GET', query, headers: {} }
}
function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    setHeader(name, value) { this._headers[name] = value },
    end: vi.fn(),
  }
}

const ROW = {
  od_match_id: 8123456789,
  channel: 'pgl_dota2',
  started_at: '2026-07-10T12:00:00Z',
  team_a: 'Team Spirit',
  team_b: 'Team Falcons',
  tournament: 'EWC 2026',
  twitch_vod_id: '900',
  vod_offset_s: 1842,
  vod_available: true,
  vod_checked_at: '2026-07-10T15:00:00Z',
  streams_json: [
    { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true, source: 'twitch', channel: 'pgl_dota2' },
    { raw_url: 'https://www.twitch.tv/pgl_ru', language: 'ru', official: false, main: false, source: 'twitch', channel: 'pgl_ru' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pipeline ?type=replay', () => {
  it('serves main + alt-channel start points when the match_stream_vods join succeeds', async () => {
    setSequence([
      { data: ROW, error: null },
      { data: [{ channel: 'pgl_ru', twitch_vod_id: '777', vod_offset_s: 50 }], error: null },
    ])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: '8123456789' }), res)

    expect(res._status).toBe(200)
    expect(res._body.main).toMatchObject({ url: 'https://www.twitch.tv/videos/900?t=1842s', kind: 'start_point' })
    expect(res._body.others).toHaveLength(1)
    expect(res._body.others[0]).toMatchObject({
      url: 'https://www.twitch.tv/videos/777?t=50s',
      kind: 'start_point',
      deep_link: true,
      language: 'ru',
      official: false,
    })
    expect(res._headers['Cache-Control']).toBe('s-maxage=600, stale-while-revalidate=86400')
  })

  it('binds vod rows to streams case-insensitively', async () => {
    setSequence([
      { data: ROW, error: null },
      { data: [{ channel: 'PGL_RU', twitch_vod_id: '777', vod_offset_s: 50 }], error: null },
    ])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: '8123456789' }), res)
    expect(res._body.others[0]).toMatchObject({ kind: 'start_point', url: 'https://www.twitch.tv/videos/777?t=50s' })
  })

  it('degrades others to stream pages when the vods join fails — never a 500 (invariant I7)', async () => {
    setSequence([
      { data: ROW, error: null },
      new Error('match_stream_vods unavailable'),
    ])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: '8123456789' }), res)

    expect(res._status).toBe(200)
    expect(res._body.main).toMatchObject({ kind: 'start_point' }) // main unaffected (from the row itself)
    expect(res._body.others[0]).toMatchObject({ url: 'https://www.twitch.tv/pgl_ru', kind: 'stream_page', deep_link: false })
  })

  it('returns 404 without a Cache-Control header when no row exists', async () => {
    setSequence([{ data: null, error: null }])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: '999' }), res)
    expect(res._status).toBe(404)
    expect(res._body).toEqual({ error: 'not_found' })
    expect(res._headers['Cache-Control']).toBeUndefined()
  })

  it('returns 400 for a non-numeric id without touching Supabase', async () => {
    setSequence([])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: 'abc; drop table' }), res)
    expect(res._status).toBe(400)
    expect(res._body).toEqual({ error: 'invalid_id' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 500 when the match_stream_history query errors', async () => {
    setSequence([{ data: null, error: { message: 'connection refused' } }])
    const res = makeRes()
    await handler(makeReq({ type: 'replay', id: '8123456789' }), res)
    expect(res._status).toBe(500)
    expect(res._body.error).toBe('connection refused')
  })
})

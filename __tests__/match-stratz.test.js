/**
 * Tests for STRATZ post-game enrichment (backlog #24):
 *  - api/_stratz.js: fetchStratzMatchEnrichment fail-open behavior, headers, position/role labels
 *  - ?mode=match-stratz handler (api/_handlers/matchStratz.js): KV cache, TTLs, response shape
 *  - Client-side merge-by-heroId logic (MatchDrawer.jsx's enrichedPlayers memo, duplicated here
 *    for isolated testing — same pattern __tests__/match-stats.test.js uses for handler internals)
 *  - fetchMatchStratz (src/api.js): cache/in-flight dedup, fail-open contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── api/_stratz.js: pure label helpers ────────────────────────────────────────

import { stratzPositionNumber, stratzPositionLabel, stratzAwardLabel } from '../api/_stratz.js'

describe('stratzAwardLabel', () => {
  // Regression: STRATZ's `award` enum has 4 real values — NONE, MVP, TOP_CORE,
  // TOP_SUPPORT — confirmed running against live match data (2026-08-01). The initial
  // implementation treated any non-empty award string as awarded, so NONE (the common
  // case for 9 of 10 players) rendered a badge literally reading "NONE" in production.
  // By product decision, only MVP is surfaced; TOP_CORE/TOP_SUPPORT are intentionally
  // dropped too, not just NONE.
  it('returns "MVP" for the MVP award', () => {
    expect(stratzAwardLabel('MVP')).toBe('MVP')
  })

  it('returns null for NONE (the common no-award case)', () => {
    expect(stratzAwardLabel('NONE')).toBeNull()
  })

  it('returns null for TOP_CORE and TOP_SUPPORT — only MVP is surfaced', () => {
    expect(stratzAwardLabel('TOP_CORE')).toBeNull()
    expect(stratzAwardLabel('TOP_SUPPORT')).toBeNull()
  })

  it('returns null for missing/unknown values', () => {
    expect(stratzAwardLabel(null)).toBeNull()
    expect(stratzAwardLabel(undefined)).toBeNull()
    expect(stratzAwardLabel('')).toBeNull()
  })
})

describe('stratzPositionNumber', () => {
  it('maps POSITION_1-5 to 1-5', () => {
    expect(stratzPositionNumber('POSITION_1')).toBe(1)
    expect(stratzPositionNumber('POSITION_5')).toBe(5)
  })

  it('returns null for unknown/missing position', () => {
    expect(stratzPositionNumber('UNKNOWN')).toBeNull()
    expect(stratzPositionNumber(null)).toBeNull()
    expect(stratzPositionNumber(undefined)).toBeNull()
  })
})

describe('stratzPositionLabel', () => {
  it('maps each position to the fan-facing label, not STRATZ jargon', () => {
    expect(stratzPositionLabel('POSITION_1')).toBe('Carry')
    expect(stratzPositionLabel('POSITION_2')).toBe('Mid')
    expect(stratzPositionLabel('POSITION_3')).toBe('Offlane')
    expect(stratzPositionLabel('POSITION_4')).toBe('Soft Support')
    expect(stratzPositionLabel('POSITION_5')).toBe('Hard Support')
  })

  it('falls back to role when position is null but role is CORE/LIGHT_SUPPORT/HARD_SUPPORT', () => {
    expect(stratzPositionLabel(null, 'HARD_SUPPORT')).toBe('Hard Support')
    expect(stratzPositionLabel(null, 'LIGHT_SUPPORT')).toBe('Soft Support')
    expect(stratzPositionLabel(null, 'CORE')).toBe('Core')
  })

  it('prefers position over role when both are present', () => {
    // A support-role player who STRATZ still resolved a specific position for
    expect(stratzPositionLabel('POSITION_4', 'LIGHT_SUPPORT')).toBe('Soft Support')
  })

  it('returns null when neither position nor role is present', () => {
    expect(stratzPositionLabel(null, null)).toBeNull()
    expect(stratzPositionLabel(undefined, undefined)).toBeNull()
  })
})

// ── api/_stratz.js: fetchStratzMatchEnrichment fail-open behavior ────────────

import { fetchStratzMatchEnrichment } from '../api/_stratz.js'

describe('fetchStratzMatchEnrichment', () => {
  const ORIGINAL_TOKEN = process.env.STRATZ_TOKEN

  beforeEach(() => {
    process.env.STRATZ_TOKEN = 'test-stratz-token'
  })

  afterEach(() => {
    process.env.STRATZ_TOKEN = ORIGINAL_TOKEN
    vi.unstubAllGlobals()
  })

  it('returns null immediately when STRATZ_TOKEN is unset (no fetch attempted)', async () => {
    delete process.env.STRATZ_TOKEN
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchStratzMatchEnrichment('123')
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the mandatory User-Agent: STRATZ_API header and bearer token', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [{ heroId: 1, imp: 3 }] } } }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await fetchStratzMatchEnrichment('7890123')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.stratz.com/graphql')
    expect(options.method).toBe('POST')
    expect(options.headers['User-Agent']).toBe('STRATZ_API')
    expect(options.headers['Authorization']).toBe('Bearer test-stratz-token')
  })

  it('returns the players array on a successful response', async () => {
    const players = [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players } } }),
    }))

    const result = await fetchStratzMatchEnrichment('7890123')
    expect(result).toEqual(players)
  })

  it('fails open (returns null) on non-OK HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const result = await fetchStratzMatchEnrichment('7890123')
    expect(result).toBeNull()
  })

  it('fails open (returns null) when the GraphQL response carries errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'User is not an admin.' }] }),
    }))
    const result = await fetchStratzMatchEnrichment('7890123')
    expect(result).toBeNull()
  })

  it('fails open (returns null) when match or players is null (unindexed match)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: null } }),
    }))
    const result = await fetchStratzMatchEnrichment('7890123')
    expect(result).toBeNull()
  })

  it('fails open (returns null) on network/throw errors, never rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(fetchStratzMatchEnrichment('7890123')).resolves.toBeNull()
  })

  it('fails open (returns null) on an empty players array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [] } } }),
    }))
    const result = await fetchStratzMatchEnrichment('7890123')
    expect(result).toBeNull()
  })
})

// ── ?mode=match-stratz handler (KV cache + TTL policy) ────────────────────────

vi.mock('dotenv', () => ({ config: vi.fn() }))

const { mockKv, kvSetCalls } = vi.hoisted(() => {
  const kvSetCalls = []
  const mockKv = {
    get: vi.fn(),
    set: vi.fn((...args) => { kvSetCalls.push(args); return Promise.resolve('OK') }),
    mget: vi.fn(),
    del: vi.fn(),
  }
  return { mockKv, kvSetCalls }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { Object.assign(this, mockKv) }
  },
}))

// ── Supabase mock (stratz_match_enrichment durable fallback) ─────────────────
// Same thenable fluent-builder pattern as pipeline-replay.test.js: chain methods
// return `this`, awaiting the builder resolves the next queued value. Defaults to
// an empty sequence (every call resolves { data: null, error: null }) so existing
// tests that don't care about Supabase still hit the live STRATZ path unchanged.

const { mockSupabaseFrom, mockGetSupabaseAdmin, setSupabaseSequence } = vi.hoisted(() => {
  let sequence = []
  let callCount = 0

  function makeBuilder(resolveValue) {
    const b = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
      then(resolve, reject) {
        return Promise.resolve(resolveValue).then(resolve, reject)
      },
    }
    return b
  }

  const mockSupabaseFrom = vi.fn(() => makeBuilder(sequence[callCount++] ?? { data: null, error: null }))
  const mockGetSupabaseAdmin = vi.fn(() => ({ from: mockSupabaseFrom }))
  const setSupabaseSequence = (seq) => { sequence = seq; callCount = 0 }
  return { mockSupabaseFrom, mockGetSupabaseAdmin, setSupabaseSequence }
})

vi.mock('../api/_supabase.js', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
  getSupabaseAnon: vi.fn(),
}))

import handler from '../api/tournaments.js'

function makeStratzReq(query = {}) {
  return { query: { mode: 'match-stratz', ...query }, method: 'GET', body: {} }
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    setHeader(k, v) { this._headers[k] = v },
  }
  return res
}

const SEVEN_DAYS = 60 * 60 * 24 * 7
const THIRTY_MIN = 60 * 30

describe('?mode=match-stratz handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    kvSetCalls.length = 0
    mockKv.get.mockResolvedValue(null)
    setSupabaseSequence([])
    process.env.STRATZ_TOKEN = 'test-stratz-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 400 when id is missing', async () => {
    const req = { query: { mode: 'match-stratz' }, method: 'GET', body: {} }
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body?.error).toMatch(/id required/)
  })

  it('on KV cache hit, returns cached players WITHOUT calling STRATZ', async () => {
    const cachedRaw = [{ heroId: 1, position: 'POSITION_2', role: 'CORE', imp: 5, award: null }]
    mockKv.get.mockResolvedValueOnce(cachedRaw)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(res._body.players).toEqual([
      { heroId: 1, position: 2, positionLabel: 'Mid', imp: 5, award: null },
    ])
  })

  it('?bust=1 clears the KV key and forces a live STRATZ fetch, ignoring any cached value', async () => {
    const rawPlayers = [{ heroId: 9, position: 'POSITION_1', role: 'CORE', imp: 12, award: 'MVP' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '7890123', bust: '1' })
    const res = makeRes()
    await handler(req, res)

    expect(mockKv.del).toHaveBeenCalledWith('stratz:match:v1:7890123')
    expect(mockKv.get).not.toHaveBeenCalled()
    expect(res._body.players).toEqual([
      { heroId: 9, position: 1, positionLabel: 'Carry', imp: 12, award: 'MVP' },
    ])
  })

  it('treats the MISS marker as a cached negative result — no STRATZ call, empty players', async () => {
    mockKv.get.mockResolvedValueOnce('MISS')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(res._body.players).toEqual([])
  })

  it('on cache miss + successful STRATZ fetch, maps and caches with the 7-day FOUND TTL', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' },
      { heroId: 6, position: null, role: 'HARD_SUPPORT', imp: -2, award: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
      { heroId: 6, position: null, positionLabel: 'Hard Support', imp: -2, award: null },
    ])

    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write).toBeDefined()
    expect(write[0]).toBe('stratz:match:v1:7890123')
    expect(write[1]).toEqual(rawPlayers)
    expect(write[2]).toEqual({ ex: SEVEN_DAYS })

    // Also persisted to Supabase — the durable fallback beneath the 7-day KV TTL.
    expect(mockSupabaseFrom).toHaveBeenCalledWith('stratz_match_enrichment')
    expect(mockSupabaseFrom.mock.results[1].value.upsert).toHaveBeenCalledWith(
      { od_match_id: 7890123, players: rawPlayers },
      { onConflict: 'od_match_id' },
    )
  })

  it('on KV miss + Supabase hit, returns the stored result WITHOUT calling STRATZ, and backfills KV', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    const storedPlayers = [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' }]
    setSupabaseSequence([{ data: { players: storedPlayers }, error: null }])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(res._body.players).toEqual([
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
    ])

    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write).toBeDefined()
    expect(write[1]).toEqual(storedPlayers)
    expect(write[2]).toEqual({ ex: SEVEN_DAYS })
  })

  it('on cache miss + STRATZ miss/rate-limit (429), does NOT write anything to Supabase', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(res._body.players).toEqual([])
    // Only the Supabase read happened (checking for a prior stored result) — no upsert.
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(1)
  })

  it('never throws when the Supabase read fails — falls through to a live STRATZ fetch', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    setSupabaseSequence([{ data: null, error: { message: 'connection refused' } }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 4, award: null }] } } }),
    }))

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res._status).toBe(200)
    expect(res._body.players[0].position).toBe(1)
  })

  it('regression: a real 10-player match with NONE/MVP/TOP_CORE/TOP_SUPPORT never surfaces NONE/TOP_CORE/TOP_SUPPORT as awards', async () => {
    // Reproduces the exact live match that surfaced this bug (1win Essence II, game 1).
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 8, position: 'POSITION_1', role: 'CORE', imp: -25, award: 'NONE' },
      { heroId: 94, position: 'POSITION_1', role: 'CORE', imp: 2, award: 'MVP' },
      { heroId: 120, position: 'POSITION_2', role: 'CORE', imp: -7, award: 'TOP_CORE' },
      { heroId: 87, position: 'POSITION_4', role: 'LIGHT_SUPPORT', imp: -5, award: 'TOP_SUPPORT' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '8461956309' })
    const res = makeRes()
    await handler(req, res)

    const awards = res._body.players.map(p => p.award)
    expect(awards).toEqual([null, 'MVP', null, null])
    expect(awards.filter(a => a === 'MVP')).toHaveLength(1)
  })

  it('on cache miss + STRATZ returning null (unindexed/rate-limited), caches the MISS marker with the 30-min TTL', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const req = makeStratzReq({ id: '9999999' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([])

    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write).toBeDefined()
    expect(write[1]).toBe('MISS')
    expect(write[2]).toEqual({ ex: THIRTY_MIN })
  })

  it('an all-null enrichment result keeps the 30-min retry TTL and is never persisted', async () => {
    // Reproduces the live 1win Essence II match (8924695153): STRATZ has indexed the
    // match (heroIds present) but hasn't finished post-game processing yet, so
    // position/role/imp/award all come back null. Caching that for 7 days would mean
    // the badges never appear once STRATZ does finish.
    //
    // The players array is still returned (all fields null) rather than blanked — the
    // client renders that identically to no result, and NOT blanking is what keeps a
    // partially-resolved match from losing the fields it does have. What must not happen
    // is a long TTL or a permanent write.
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 30, position: null, role: null, imp: null, award: null },
      { heroId: 96, position: null, role: null, imp: null, award: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '8924695153' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([
      { heroId: 30, position: null, positionLabel: null, imp: null, award: null },
      { heroId: 96, position: null, positionLabel: null, imp: null, award: null },
    ])

    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write).toBeDefined()
    expect(write[1]).toEqual(rawPlayers)
    expect(write[2]).toEqual({ ex: THIRTY_MIN })

    const upsertCall = mockSupabaseFrom.mock.results.find(r => r.value.upsert.mock.calls.length > 0)
    expect(upsertCall).toBeUndefined()
  })

  it('regression: position/role resolved but imp still null is SERVED, retried, and never persisted', async () => {
    // Reproduces the exact live response for match 8942262723 (2026-08-13): STRATZ can
    // resolve position/role on an earlier pass than imp/award, so "position != null" is
    // NOT proof of a complete result — it must not earn the 7-day TTL or the permanent
    // Supabase row. But the position labels it DID resolve must still reach the client;
    // blanking them was the bug that left every match with no enrichment at all.
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 145, position: 'POSITION_1', role: 'CORE', imp: null, award: null },
      { heroId: 9, position: 'POSITION_5', role: 'HARD_SUPPORT', imp: null, award: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '8942262723' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([
      { heroId: 145, position: 1, positionLabel: 'Carry', imp: null, award: null },
      { heroId: 9, position: 5, positionLabel: 'Hard Support', imp: null, award: null },
    ])

    // Cached as itself (not the MISS marker) so the retry window still renders labels,
    // but on the SHORT TTL so a complete result can replace it.
    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write[1]).toEqual(rawPlayers)
    expect(write[2]).toEqual({ ex: THIRTY_MIN })

    // Incomplete must NOT be persisted to Supabase forever.
    const upsertCall = mockSupabaseFrom.mock.results.find(r => r.value.upsert.mock.calls.length > 0)
    expect(upsertCall).toBeUndefined()

    // And it must not be parked at the CDN for an hour past the 30-min retry.
    expect(res._headers['Cache-Control']).toBe('public, s-maxage=60')
  })

  it('regression: a PARTIAL result (only some players missing imp) serves ALL resolved players, and is never persisted', async () => {
    // The live failure this whole fix exists for. One unresolved imp out of ten used to
    // null out the entire response — erasing the MVP badge and nine good impact scores,
    // and (since the permanent write was gated on the same flag) guaranteeing the Supabase
    // table stayed empty forever. Completeness may gate PERSISTENCE, never DISPLAY.
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' },
      { heroId: 6, position: 'POSITION_5', role: 'HARD_SUPPORT', imp: null, award: null },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '7777777' })
    const res = makeRes()
    await handler(req, res)

    expect(res._body.players).toEqual([
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
      { heroId: 6, position: 5, positionLabel: 'Hard Support', imp: null, award: null },
    ])

    const write = kvSetCalls.find(([key]) => key.startsWith('stratz:match:v1:'))
    expect(write[1]).toEqual(rawPlayers)
    expect(write[2]).toEqual({ ex: THIRTY_MIN })

    const upsertCall = mockSupabaseFrom.mock.results.find(r => r.value.upsert.mock.calls.length > 0)
    expect(upsertCall).toBeUndefined()
  })

  it('a null element in the players array drops only that element, not the whole match', async () => {
    // The shaping step used to throw on a null player and degrade the entire response to
    // empty. A response with holes is incomplete (short TTL, no permanent write) but the
    // players that DID resolve must still render.
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [
      { heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' },
      null,
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))

    const req = makeStratzReq({ id: '7777778' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
    ])

    const upsertCall = mockSupabaseFrom.mock.results.find(r => r.value.upsert.mock.calls.length > 0)
    expect(upsertCall).toBeUndefined()
  })

  it('?bust=1 responds no-store so the CDN cannot serve a cached copy of the bust itself', async () => {
    // Vercel's CDN keys on the full URL including bust=1, so the bust response was itself
    // being edge-cached: a repeat bust inside the window returned the cached copy and never
    // invoked the function, making manual invalidation silently do nothing.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' }] } } }),
    }))

    const req = makeStratzReq({ id: '7890123', bust: '1' })
    const res = makeRes()
    await handler(req, res)

    expect(res._headers['Cache-Control']).toBe('no-store')
  })

  it('a complete result gets the long CDN cache', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' }] } } }),
    }))

    const req = makeStratzReq({ id: '7890124' })
    const res = makeRes()
    await handler(req, res)

    expect(res._headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
  })

  it('propagates the good result even if the Supabase upsert write throws (client construction failure)', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    const rawPlayers = [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 9, award: 'MVP' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: rawPlayers } } }),
    }))
    // Second call to getSupabaseAdmin() (the upsert) throws synchronously, simulating a
    // lazy createClient() failure — the read succeeded (empty sequence default), only the
    // write path breaks.
    let calls = 0
    mockGetSupabaseAdmin.mockImplementation(() => {
      calls += 1
      if (calls === 2) throw new Error('missing SUPABASE_SERVICE_ROLE_KEY')
      return { from: mockSupabaseFrom }
    })

    const req = makeStratzReq({ id: '7890123' })
    const res = makeRes()
    await expect(handler(req, res)).resolves.not.toThrow()

    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
    ])
  })

  it('never throws and returns empty players when STRATZ returns a malformed player element', async () => {
    // Now reaches [] by filtering the bad element rather than by throwing into the shaping
    // catch — same outcome here (the array is ALL holes), but see the null-element test
    // above for the case where filtering is what saves the surrounding good players.
    mockKv.get.mockResolvedValueOnce(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [null] } } }),
    }))

    const req = makeStratzReq({ id: '222' })
    const res = makeRes()
    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res._status).toBe(200)
    expect(res._body.players).toEqual([])
  })

  it('never throws when KV read fails — falls through to a live STRATZ fetch', async () => {
    mockKv.get.mockRejectedValueOnce(new Error('KV unavailable'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { match: { players: [{ heroId: 1, position: 'POSITION_1', role: 'CORE', imp: 4, award: null }] } } }),
    }))

    const req = makeStratzReq({ id: '111' })
    const res = makeRes()
    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res._status).toBe(200)
    expect(res._body.players[0].position).toBe(1)
  })
})

// ── Client-side merge-by-heroId (MatchDrawer.jsx's enrichedPlayers memo) ──────
// Duplicated here for isolated testing, matching this suite's existing pattern
// of testing handler/component internals as pure functions.

function mergeStratzOntoPlayers(players, stratzPlayers) {
  if (!players) return players
  if (!stratzPlayers || stratzPlayers.length === 0) return players
  const byHero = new Map(stratzPlayers.map(p => [p.heroId, p]))
  return players.map(p => {
    const sp = byHero.get(p.heroId)
    if (!sp) return p
    return { ...p, position: sp.position, positionLabel: sp.positionLabel, imp: sp.imp, award: sp.award }
  })
}

describe('mergeStratzOntoPlayers (heroId join)', () => {
  const odPlayers = [
    { heroId: 1, name: 'yatoro', netWorth: 30000, isRadiant: true },
    { heroId: 6, name: 'puppey', netWorth: 12000, isRadiant: false },
  ]

  it('merges STRATZ fields onto the matching OD player by heroId', () => {
    const stratzPlayers = [
      { heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' },
      { heroId: 6, position: null, positionLabel: 'Hard Support', imp: -1, award: null },
    ]
    const merged = mergeStratzOntoPlayers(odPlayers, stratzPlayers)
    expect(merged[0]).toMatchObject({ heroId: 1, name: 'yatoro', position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' })
    expect(merged[1]).toMatchObject({ heroId: 6, name: 'puppey', position: null, positionLabel: 'Hard Support', imp: -1, award: null })
  })

  it('returns OD players unchanged (same shape, no STRATZ fields) when stratzPlayers is null', () => {
    const merged = mergeStratzOntoPlayers(odPlayers, null)
    expect(merged).toBe(odPlayers)
  })

  it('returns OD players unchanged when stratzPlayers is an empty array (graceful degrade)', () => {
    const merged = mergeStratzOntoPlayers(odPlayers, [])
    expect(merged).toBe(odPlayers)
  })

  it('leaves a player untouched when its heroId has no STRATZ match (partial coverage)', () => {
    const stratzPlayers = [{ heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: null }]
    const merged = mergeStratzOntoPlayers(odPlayers, stratzPlayers)
    expect(merged[0].position).toBe(1)
    expect(merged[1].position).toBeUndefined()  // untouched — no position key added at all
  })

  it('returns null/undefined players input unchanged (OD stats not yet loaded)', () => {
    expect(mergeStratzOntoPlayers(null, [{ heroId: 1 }])).toBeNull()
    expect(mergeStratzOntoPlayers(undefined, [{ heroId: 1 }])).toBeUndefined()
  })

  it('never mutates the original OD players array (returns new objects)', () => {
    const stratzPlayers = [{ heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: null }]
    const merged = mergeStratzOntoPlayers(odPlayers, stratzPlayers)
    expect(merged[0]).not.toBe(odPlayers[0])
    expect(odPlayers[0].position).toBeUndefined()
  })
})

// ── fetchMatchStratz (src/api.js) ─────────────────────────────────────────────

import { fetchMatchStratz } from '../src/api.js'

describe('fetchMatchStratz', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns { players: [] } immediately for a falsy matchId (no fetch attempted)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await fetchMatchStratz(null)
    expect(result).toEqual({ players: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches from ?mode=match-stratz&id={matchId} and returns the players array', async () => {
    const uniqueId = `stratz-test-${Date.now()}-a`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ players: [{ heroId: 1, position: 1, positionLabel: 'Carry', imp: 9, award: 'MVP' }] }),
    }))
    const result = await fetchMatchStratz(uniqueId)
    expect(result.players).toHaveLength(1)
    expect(result.players[0].award).toBe('MVP')
  })

  it('fails open to { players: [] } on a non-OK response, without caching the failure', async () => {
    const uniqueId = `stratz-test-${Date.now()}-b`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const result = await fetchMatchStratz(uniqueId)
    expect(result).toEqual({ players: [] })
  })

  it('fails open to { players: [] } on a network throw, never rejects', async () => {
    const uniqueId = `stratz-test-${Date.now()}-c`
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchMatchStratz(uniqueId)).resolves.toEqual({ players: [] })
  })

  it('caches a successful result — a second call for the same matchId does not refetch', async () => {
    const uniqueId = `stratz-test-${Date.now()}-d`
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ players: [{ heroId: 2, position: 2, positionLabel: 'Mid', imp: 1, award: null }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await fetchMatchStratz(uniqueId)
    await fetchMatchStratz(uniqueId)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('dedups concurrent in-flight calls for the same matchId into one request', async () => {
    const uniqueId = `stratz-test-${Date.now()}-e`
    let resolveFetch
    const fetchSpy = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    vi.stubGlobal('fetch', fetchSpy)

    const p1 = fetchMatchStratz(uniqueId)
    const p2 = fetchMatchStratz(uniqueId)
    resolveFetch({ ok: true, json: async () => ({ players: [] }) })
    await Promise.all([p1, p2])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

/**
 * Tests for the stream cache write logic in api/live-matches.js.
 *
 * Verifies that stream → channel entries are only written for the currently
 * running game, not for already-finished games in the same series. This
 * prevents a later game from overwriting an earlier game's cached channel
 * with the wrong stream.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks (must be hoisted before imports) ────────────────────────────

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_shared.js', () => ({ isTier1: () => true }))

// Use vi.hoisted so mockKv is available inside the mock factory (which is hoisted)
const { mockKv, kvSetCalls } = vi.hoisted(() => {
  const kvSetCalls = []
  const mockKv = {
    get: vi.fn(),
    set: vi.fn((...args) => { kvSetCalls.push(args); return Promise.resolve('OK') }),
    del: vi.fn(),
  }
  return { mockKv, kvSetCalls }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { Object.assign(this, mockKv) }
  },
}))

import handler from '../api/live-matches.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch({ games = [], streamChannel = 'esl_dota2earth' } = {}) {
  return {
    id: 1,
    league: { name: 'DreamLeague' },
    serie: { full_name: 'DreamLeague Season 25', name: 'Season 25' },
    match_type: 'best_of_3',
    opponents: [
      { opponent: { id: 10, name: 'Team A' } },
      { opponent: { id: 20, name: 'Team B' } },
    ],
    results: [],
    games,
    streams_list: [
      { official: true, language: 'en', raw_url: `https://www.twitch.tv/${streamChannel}` },
    ],
  }
}

function makeGame({ position, status, matchId, beginAt = '2026-03-24T10:00:00Z' }) {
  return { position, status, winner: null, external_identifier: matchId, begin_at: beginAt }
}

function makeReq(query = {}) {
  return { query }
}

function makeRes() {
  const res = { statusCode: null, body: null }
  res.setHeader = vi.fn()
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('live-matches stream cache writes', () => {
  beforeEach(() => {
    kvSetCalls.length = 0
    mockKv.get.mockResolvedValue(null)  // cold KV cache
    mockKv.set.mockClear()
    process.env.PANDASCORE_TOKEN = 'test-token'

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [makeMatch({
        games: [
          makeGame({ position: 1, status: 'finished',    matchId: 'G1', beginAt: '2026-03-24T10:00:00Z' }),
          makeGame({ position: 2, status: 'running',     matchId: 'G2', beginAt: '2026-03-24T11:30:00Z' }),
          makeGame({ position: 3, status: 'not_started', matchId: null  }),
        ],
      })],
    })
  })

  it('writes a stream:match entry only for the running game, not the finished one', async () => {
    const req = makeReq()
    const res = makeRes()

    await handler(req, res)
    expect(res.statusCode).toBe(200)

    const keysSet = kvSetCalls.map(args => args[0])
    expect(keysSet).toContain('stream:match:G2')
    expect(keysSet).not.toContain('stream:match:G1')
  })

  it('writes a stream:ts entry for the running game start time', async () => {
    const req = makeReq()
    const res = makeRes()

    await handler(req, res)

    const keysSet = kvSetCalls.map(args => args[0])
    // beginAt '2026-03-24T11:30:00Z' = 1742813400s, rounded to 5 min = 1742813400
    const expectedTs = Math.floor(new Date('2026-03-24T11:30:00Z').getTime() / 1000 / 300) * 300
    expect(keysSet).toContain(`stream:ts:${expectedTs}`)
    // Game 1 timestamp should not appear
    const game1Ts = Math.floor(new Date('2026-03-24T10:00:00Z').getTime() / 1000 / 300) * 300
    expect(keysSet).not.toContain(`stream:ts:${game1Ts}`)
  })

  it('does not write any stream entries when no game is running', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [makeMatch({
        games: [
          makeGame({ position: 1, status: 'finished', matchId: 'G1', beginAt: '2026-03-24T10:00:00Z' }),
          makeGame({ position: 2, status: 'finished', matchId: 'G2', beginAt: '2026-03-24T11:30:00Z' }),
        ],
      })],
    })

    const req = makeReq()
    const res = makeRes()

    await handler(req, res)

    const streamKeys = kvSetCalls
      .map(args => args[0])
      .filter(k => k.startsWith('stream:'))
    expect(streamKeys).toHaveLength(0)
  })

  it('does not write stream entries when match has multiple streams', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        ...makeMatch({
          games: [makeGame({ position: 1, status: 'running', matchId: 'G1', beginAt: '2026-03-24T10:00:00Z' })],
        }),
        streams_list: [
          { official: true, language: 'en', raw_url: 'https://www.twitch.tv/esl_dota2earth' },
          { official: true, language: 'en', raw_url: 'https://www.twitch.tv/esl_dota2storm' },
        ],
      }],
    })

    const req = makeReq()
    const res = makeRes()

    await handler(req, res)

    const streamKeys = kvSetCalls
      .map(args => args[0])
      .filter(k => k.startsWith('stream:'))
    expect(streamKeys).toHaveLength(0)
  })
})

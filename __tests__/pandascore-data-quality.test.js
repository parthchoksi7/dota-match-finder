/**
 * Tests for two PandaScore data-quality defects and their fixes:
 *
 * 1. Series score capping (live-matches.js)
 *    PandaScore `results[].score` reports total games won, not series wins.
 *    A BO3 sweep shows score=3 in the raw data; the display must cap it at 2.
 *    `winsRequired(matchType, numberOfGames)` computes the cap.
 *
 * 2. Duplicate match deduplication (upcoming-matches.js)
 *    PandaScore sometimes creates two separate match records for the same fixture
 *    (e.g. after a reschedule or data correction). Both entries appear in
 *    /matches/upcoming simultaneously with different IDs and slightly different
 *    team/tournament name metadata. The handler deduplicates by
 *    (sorted opponent IDs | scheduled_at) and keeps the highest ID.
 *
 * 3. getTwitchStreams language fallback (api/_shared.js)
 *    When PandaScore's bulk endpoint omits language metadata, the English-stream
 *    filter produces an empty array. For international events (DreamLeague, PGL,
 *    ESL One, etc.) the code must fall through to the static channel mapping
 *    rather than picking a Russian/Chinese stream from allTwitchOfficial.
 *    For events whose name contains "qualifier", the fallback is preserved so
 *    CIS/Chinese qualifier streams are not dropped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks required by live-matches.js and upcoming-matches.js ────────────────

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('web-push', () => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }))

const { mockKv, kvSetCalls } = vi.hoisted(() => {
  const kvSetCalls = []
  const mockKv = {
    get: vi.fn().mockResolvedValue(null),
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

vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isTier1: () => true, isTier1ByName: () => false }
})

// ── winsRequired ─────────────────────────────────────────────────────────────

import { winsRequired } from '../api/live-matches.js'

describe('winsRequired', () => {
  it('BO1 requires 1 win', () => {
    expect(winsRequired('best_of_1')).toBe(1)
  })

  it('BO2 requires 2 wins', () => {
    expect(winsRequired('best_of_2')).toBe(2)
  })

  it('BO3 requires 2 wins', () => {
    expect(winsRequired('best_of_3')).toBe(2)
  })

  it('BO5 requires 3 wins', () => {
    expect(winsRequired('best_of_5')).toBe(3)
  })

  it('best_of + numberOfGames=3 (BO3 variant) requires 2 wins', () => {
    expect(winsRequired('best_of', 3)).toBe(2)
  })

  it('best_of + numberOfGames=5 requires 3 wins', () => {
    expect(winsRequired('best_of', 5)).toBe(3)
  })

  it('unknown match type returns Infinity (no capping)', () => {
    expect(winsRequired('unknown')).toBe(Infinity)
    expect(winsRequired(null)).toBe(Infinity)
  })

  it('BO3 sweep: Math.min(3, winsRequired) === 2', () => {
    // Root cause of the 3-0 bug: PandaScore reports score=3 for a BO3 sweep.
    const rawScore = 3
    const max = winsRequired('best_of_3')
    expect(Math.min(rawScore, max)).toBe(2)
  })

  it('BO3 normal win: 2-1 score is not capped', () => {
    const max = winsRequired('best_of_3')
    expect(Math.min(2, max)).toBe(2)
    expect(Math.min(1, max)).toBe(1)
  })
})

// ── getTwitchStreams: language fallback ──────────────────────────────────────

import { getTwitchStreams } from '../api/_shared.js'

function makeStream(channel, language, official = true, main = false) {
  return {
    raw_url: `https://www.twitch.tv/${channel}`,
    language,
    official,
    main,
  }
}

describe('getTwitchStreams — language fallback for international events', () => {
  it('prefers English stream when available', () => {
    const streams = [
      makeStream('esl_dota2', 'en'),
      makeStream('esl_ru', 'ru'),
    ]
    const result = getTwitchStreams(streams, 'DreamLeague', 'DreamLeague Season 29')
    expect(result).toHaveLength(1)
    expect(result[0].url).toContain('esl_dota2')
  })

  it('falls through to static mapping for DreamLeague when no English stream found', () => {
    const streams = [makeStream('esl_ru', 'ru')]
    const result = getTwitchStreams(streams, 'DreamLeague', 'DreamLeague Season 29')
    // Static mapping returns esl_dota2 + esl_dota2ember for DreamLeague
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(s => s.url.includes('esl_dota2'))).toBe(true)
    expect(result.some(s => s.url.includes('esl_ru'))).toBe(false)
  })

  it('falls through to static mapping for PGL when no English stream found', () => {
    const streams = [makeStream('pgl_ru', 'ru')]
    const result = getTwitchStreams(streams, 'PGL', 'PGL Wallachia S4')
    expect(result.some(s => s.url.includes('pgl_dota2'))).toBe(true)
    expect(result.some(s => s.url.includes('pgl_ru'))).toBe(false)
  })

  it('falls through to static mapping for ESL One when no English stream found', () => {
    const streams = [makeStream('esl_ru', 'ru')]
    const result = getTwitchStreams(streams, 'ESL', 'ESL One Bangkok 2025')
    expect(result.some(s => s.url.includes('esl_dota2'))).toBe(true)
    expect(result.some(s => s.url.includes('esl_ru'))).toBe(false)
  })

  it('preserves non-English stream for CIS qualifier (contains "qualifier")', () => {
    const streams = [makeStream('dota2_ru', 'ru')]
    const result = getTwitchStreams(streams, 'DreamLeague', 'DreamLeague Season 29 CIS Qualifier')
    // Should NOT fall through to static; Russian stream is the correct VOD source
    expect(result).toHaveLength(1)
    expect(result[0].url).toContain('dota2_ru')
  })

  it('preserves non-English stream for Chinese qualifier', () => {
    const streams = [makeStream('dota2_cn', 'zh')]
    const result = getTwitchStreams(streams, 'PGL', 'PGL Open Qualifier China')
    expect(result).toHaveLength(1)
    expect(result[0].url).toContain('dota2_cn')
  })

  it('returns empty array when no streams at all for international event (falls to static)', () => {
    const result = getTwitchStreams([], 'DreamLeague', 'DreamLeague Season 29')
    // Static DreamLeague mapping applies
    expect(result.some(s => s.url.includes('esl_dota2'))).toBe(true)
  })
})

// ── upcoming-matches: PandaScore duplicate deduplication ─────────────────────

import upcomingHandler from '../api/upcoming-matches.js'

function makePsMatch(id, teamAId, teamBId, scheduledAt, teamAName = 'Team A', teamBName = 'Team B') {
  return {
    id,
    match_type: 'best_of_3',
    number_of_games: 3,
    scheduled_at: scheduledAt,
    begin_at: null,
    opponents: [
      { opponent: { id: teamAId, name: teamAName } },
      { opponent: { id: teamBId, name: teamBName } },
    ],
    league: { name: 'DreamLeague', tier: 's' },
    serie: { full_name: 'DreamLeague Season 29', name: 'DreamLeague Season 29' },
    tournament: { tier: 's' },
    streams_list: [],
  }
}

describe('upcoming-matches deduplication', () => {
  beforeEach(() => {
    vi.stubEnv('PANDASCORE_TOKEN', 'test-token')
    kvSetCalls.length = 0
    mockKv.get.mockResolvedValue(null)
  })

  it('returns one match when PandaScore sends two records for the same fixture', async () => {
    const scheduledAt = '2026-05-20T14:00:00Z'
    const duplicate1 = makePsMatch(8817588541, 101, 102, scheduledAt, 'Aurora Gaming', 'Natus Vincere')
    const duplicate2 = makePsMatch(8817614909, 101, 102, scheduledAt, 'Aurora', 'NaVi')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([duplicate1, duplicate2]),
    }))

    const req = { query: {} }
    const json = vi.fn()
    const res = { setHeader: vi.fn(), status: vi.fn(() => ({ json })) }

    await upcomingHandler(req, res)

    const [payload] = json.mock.calls[0]
    expect(payload.matches).toHaveLength(1)
    // Keeps higher ID (most recently created = canonical)
    expect(payload.matches[0].id).toBe(8817614909)
  })

  it('keeps two matches when teams differ (different fixtures, not duplicates)', async () => {
    const m1 = makePsMatch(100, 101, 102, '2026-05-20T14:00:00Z', 'Team A', 'Team B')
    const m2 = makePsMatch(101, 103, 104, '2026-05-20T14:00:00Z', 'Team C', 'Team D')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([m1, m2]),
    }))

    const req = { query: {} }
    const json = vi.fn()
    const res = { setHeader: vi.fn(), status: vi.fn(() => ({ json })) }

    await upcomingHandler(req, res)

    const [payload] = json.mock.calls[0]
    expect(payload.matches).toHaveLength(2)
  })

  it('keeps two matches for same teams at different times (not duplicates)', async () => {
    const m1 = makePsMatch(100, 101, 102, '2026-05-20T14:00:00Z')
    const m2 = makePsMatch(101, 101, 102, '2026-05-21T14:00:00Z')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([m1, m2]),
    }))

    const req = { query: {} }
    const json = vi.fn()
    const res = { setHeader: vi.fn(), status: vi.fn(() => ({ json })) }

    await upcomingHandler(req, res)

    const [payload] = json.mock.calls[0]
    expect(payload.matches).toHaveLength(2)
  })
})

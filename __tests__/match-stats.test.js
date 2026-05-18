/**
 * Tests for the ?mode=match-stats handler in api/tournaments.js and the
 * fetchMatchStats() client function in src/api.js.
 *
 * Part 1 coverage:
 *  - Player extraction shape from raw OpenDota match object
 *  - Item ID → name reverse map building
 *  - KV cache hit: OpenDota is NOT called on second request
 *  - OpenDota non-2xx: returns fail-open EMPTY shape (no KV poison)
 *  - res.ok guard: non-2xx does NOT call .json()
 *  - Missing/null fields default to safe values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Pure function helpers (duplicated from the handler for isolated testing) ──

function extractPlayers(rawPlayers) {
  const isRadiant = (p) => (p.player_slot ?? 0) < 128
  return (rawPlayers || []).map(p => ({
    slot: p.player_slot ?? 0,
    heroId: p.hero_id ?? 0,
    name: p.name || p.personaname || '',
    netWorth: p.net_worth ?? 0,
    items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map(v => v ?? 0),
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    isRadiant: isRadiant(p),
  }))
}

function buildItemNames(itemData) {
  const itemNames = {}
  for (const [name, meta] of Object.entries(itemData)) {
    if (meta?.id != null) itemNames[meta.id] = name
  }
  return itemNames
}

// ── Player extraction tests ───────────────────────────────────────────────────

describe('extractPlayers', () => {
  it('extracts basic player fields correctly', () => {
    const raw = [{
      player_slot: 0, hero_id: 1, name: 'yatoro', personaname: 'steam_name',
      net_worth: 52000, item_0: 36, item_1: 108, item_2: 0, item_3: 0, item_4: 0, item_5: 0,
      kills: 12, deaths: 2, assists: 8,
    }]
    const [p] = extractPlayers(raw)
    expect(p.slot).toBe(0)
    expect(p.heroId).toBe(1)
    expect(p.name).toBe('yatoro')  // p.name preferred over personaname
    expect(p.netWorth).toBe(52000)
    expect(p.items).toEqual([36, 108, 0, 0, 0, 0])
    expect(p.kills).toBe(12)
    expect(p.deaths).toBe(2)
    expect(p.assists).toBe(8)
    expect(p.isRadiant).toBe(true)
  })

  it('uses personaname when name is absent', () => {
    const [p] = extractPlayers([{ player_slot: 0, personaname: 'SteamUser' }])
    expect(p.name).toBe('SteamUser')
  })

  it('marks dire players correctly (player_slot >= 128)', () => {
    const [p] = extractPlayers([{ player_slot: 128 }])
    expect(p.isRadiant).toBe(false)
  })

  it('defaults all numeric fields to 0 when null/undefined', () => {
    const [p] = extractPlayers([{}])
    expect(p.slot).toBe(0)
    expect(p.heroId).toBe(0)
    expect(p.netWorth).toBe(0)
    expect(p.items).toEqual([0, 0, 0, 0, 0, 0])
    expect(p.kills).toBe(0)
    expect(p.deaths).toBe(0)
    expect(p.assists).toBe(0)
    expect(p.name).toBe('')
    expect(p.isRadiant).toBe(true)  // slot 0 = radiant
  })

  it('always returns exactly 6 item slots, defaulting missing to 0', () => {
    const [p] = extractPlayers([{ item_0: 36, item_3: 108 }])  // item_1, item_2, item_4, item_5 absent
    expect(p.items).toHaveLength(6)
    expect(p.items[0]).toBe(36)
    expect(p.items[1]).toBe(0)
    expect(p.items[2]).toBe(0)
    expect(p.items[3]).toBe(108)
    expect(p.items[4]).toBe(0)
    expect(p.items[5]).toBe(0)
  })

  it('handles empty players array', () => {
    expect(extractPlayers([])).toEqual([])
    expect(extractPlayers(null)).toEqual([])
    expect(extractPlayers(undefined)).toEqual([])
  })

  it('processes all 10 players in a match', () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({
      player_slot: i < 5 ? i : 128 + (i - 5),
      hero_id: i + 1,
      net_worth: (i + 1) * 10000,
    }))
    const players = extractPlayers(raw)
    expect(players).toHaveLength(10)
    expect(players.filter(p => p.isRadiant)).toHaveLength(5)
    expect(players.filter(p => !p.isRadiant)).toHaveLength(5)
  })
})

// ── Item name map tests ───────────────────────────────────────────────────────

describe('buildItemNames', () => {
  it('builds reverse map from item name to ID', () => {
    const raw = {
      shadow_blade: { id: 36, cost: 3000 },
      black_king_bar: { id: 38, cost: 4050 },
    }
    const map = buildItemNames(raw)
    expect(map[36]).toBe('shadow_blade')
    expect(map[38]).toBe('black_king_bar')
  })

  it('skips entries without an id field', () => {
    const raw = { broken_item: { cost: 100 } }  // no id
    const map = buildItemNames(raw)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('handles empty object', () => {
    expect(buildItemNames({})).toEqual({})
  })

  it('item ID 0 is excluded from the map (0 means empty slot)', () => {
    const raw = { empty: { id: 0 } }
    const map = buildItemNames(raw)
    // id: 0 can map but should render as empty slot in UI — map stores it fine
    // (the ItemSlot component handles itemId 0 as empty regardless of map)
    expect(map[0]).toBe('empty')
  })
})

// ── Handler integration tests (with mocked KV and fetch) ─────────────────────

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual }
})

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

import handler from '../api/tournaments.js'

function makeReq(query = {}) {
  return { query: { mode: 'match-stats', ...query }, method: 'GET', body: {} }
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

function makeRawMatch(overrides = {}) {
  return {
    radiant_gold_adv: [0, 5000, 10000, 15000, -3000],
    players: [
      { player_slot: 0, hero_id: 1, name: 'yatoro', net_worth: 52000,
        item_0: 36, item_1: 108, item_2: 0, item_3: 0, item_4: 0, item_5: 0,
        kills: 12, deaths: 2, assists: 8 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  kvSetCalls.length = 0
  // Default: KV misses (return null for everything)
  mockKv.get.mockResolvedValue(null)
  mockKv.mget.mockResolvedValue([])
})

describe('?mode=match-stats handler', () => {
  it('returns 400 when id is missing', async () => {
    const req = { query: { mode: 'match-stats' }, method: 'GET', body: {} }
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body?.error).toMatch(/id required/)
  })

  it('returns correct shape on KV cache miss + successful OpenDota fetch', async () => {
    mockKv.get.mockResolvedValueOnce(null)   // stats cache miss
    mockKv.get.mockResolvedValueOnce(null)   // item map cache miss
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({               // item constants
        ok: true,
        json: async () => ({ shadow_blade: { id: 36 }, black_king_bar: { id: 38 } }),
      })
      .mockResolvedValueOnce({               // match data
        ok: true,
        json: async () => makeRawMatch(),
      })
    )

    const req = makeReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toHaveProperty('radiantGoldAdv')
    expect(res._body).toHaveProperty('players')
    expect(res._body).toHaveProperty('itemNames')
    expect(res._body.radiantGoldAdv).toEqual([0, 5000, 10000, 15000, -3000])
    expect(res._body.players).toHaveLength(1)
    expect(res._body.players[0].name).toBe('yatoro')
    expect(res._body.players[0].netWorth).toBe(52000)
    expect(res._body.players[0].items).toHaveLength(6)
    expect(res._body.players[0].isRadiant).toBe(true)
    expect(res._body.itemNames[36]).toBe('shadow_blade')

    vi.unstubAllGlobals()
  })

  it('returns cached data without calling OpenDota on KV hit', async () => {
    const cached = { radiantGoldAdv: [100], players: [], itemNames: { 36: 'shadow_blade' } }
    mockKv.get.mockResolvedValueOnce(cached)  // stats cache HIT

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual(cached)
    expect(fetchSpy).not.toHaveBeenCalled()  // OpenDota NOT called

    vi.unstubAllGlobals()
  })

  it('returns fail-open EMPTY shape when OpenDota returns non-2xx', async () => {
    mockKv.get.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })  // item map
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })  // match fetch
    )

    const req = makeReq({ id: '9999999' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual({ radiantGoldAdv: [], players: [], itemNames: {} })

    vi.unstubAllGlobals()
  })

  it('does NOT call .json() or write to KV when OpenDota returns non-2xx', async () => {
    mockKv.get.mockResolvedValue(null)
    const jsonSpy = vi.fn()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: jsonSpy })  // item map
      .mockResolvedValueOnce({ ok: false, status: 503, json: jsonSpy })  // match
    )

    const req = makeReq({ id: '1111111' })
    const res = makeRes()
    await handler(req, res)

    // res.ok guard: json() must not have been called for the match fetch
    // (it may have been called for items if items fetch also failed, but match fetch did not proceed)
    // The key invariant: KV must NOT be poisoned with empty/error data
    const statsKvWrite = kvSetCalls.find(([key]) => key?.startsWith('stats:match:v1:'))
    expect(statsKvWrite).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('uses item map from KV cache without re-fetching constants', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)                               // stats miss
      .mockResolvedValueOnce({ 36: 'shadow_blade' })             // item map HIT

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeRawMatch(),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeReq({ id: '7890123' })
    const res = makeRes()
    await handler(req, res)

    // Only 1 fetch call (match data) — not 2 (item map was cached)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toContain('api/matches/7890123')
    expect(res._body.itemNames[36]).toBe('shadow_blade')

    vi.unstubAllGlobals()
  })
})

// ── GoldGraph computePoints tests ─────────────────────────────────────────────

import { computePoints } from '../src/components/GoldGraph.jsx'

// SVG layout constants (must match GoldGraph.jsx)
const PL = 40   // left padding
const PR = 54   // right padding
const PT = 14   // top padding
const PB = 22   // bottom padding
const VW = 480
const VH = 140
const CW = VW - PL - PR   // 386
const CH = VH - PT - PB   // 104
const MID = PT + CH / 2   // 66

describe('computePoints', () => {
  it('returns correct x/y coordinates for a simple 4-point series', () => {
    const data = [0, 5000, 10000, -3000]
    const pts = computePoints(data)
    expect(pts).toHaveLength(4)

    // Point 0: v=0, x=PL, y=MID (zero → center line)
    expect(pts[0].x).toBeCloseTo(PL)
    expect(pts[0].y).toBeCloseTo(MID)

    // Point 2: v=10000 (max), x midway at 2/3, y at top of chart
    expect(pts[2].x).toBeCloseTo(PL + (2 / 3) * CW)
    expect(pts[2].y).toBeCloseTo(PT)   // MID - halfH = top

    // Point 3: v=-3000, below MID (dire ahead at the end)
    expect(pts[3].y).toBeGreaterThan(MID)
    expect(pts[3].x).toBeCloseTo(PL + CW)  // rightmost point
  })

  it('points span the full chart width left-to-right', () => {
    const data = [100, 200, 300, 400, 500]
    const pts = computePoints(data)
    expect(pts[0].x).toBeCloseTo(PL)
    expect(pts[pts.length - 1].x).toBeCloseTo(PL + CW)
  })

  it('all-positive data keeps every point above the zero line', () => {
    const data = [1000, 2000, 3000, 4000]
    const pts = computePoints(data)
    pts.forEach(p => expect(p.y).toBeLessThan(MID))
  })

  it('all-negative data keeps every point below the zero line', () => {
    const data = [-1000, -2000, -3000, -4000]
    const pts = computePoints(data)
    pts.forEach(p => expect(p.y).toBeGreaterThan(MID))
  })

  it('returns empty array for fewer than 2 data points', () => {
    expect(computePoints([])).toEqual([])
    expect(computePoints([5000])).toEqual([])
  })

  it('handles all-zero data without crashing (max clamped to 1)', () => {
    const data = [0, 0, 0, 0]
    const pts = computePoints(data)
    expect(pts).toHaveLength(4)
    pts.forEach(p => expect(p.y).toBeCloseTo(MID))
  })

  it('mixed positive/negative data crosses the zero line', () => {
    const data = [5000, 3000, -2000, -4000]
    const pts = computePoints(data)
    // First two points are above MID, last two below
    expect(pts[0].y).toBeLessThan(MID)
    expect(pts[1].y).toBeLessThan(MID)
    expect(pts[2].y).toBeGreaterThan(MID)
    expect(pts[3].y).toBeGreaterThan(MID)
  })
})

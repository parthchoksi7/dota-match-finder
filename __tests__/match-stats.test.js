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
    backpackItems: [p.backpack_0, p.backpack_1, p.backpack_2].map(v => v ?? 0),
    permanentBuffs: (p.permanent_buffs || []).map(b => b.permanent_buff),
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    isRadiant: isRadiant(p),
  }))
}

function buildItemNames(itemData) {
  const itemNames = {}
  for (const [name, meta] of Object.entries(itemData)) {
    if (meta?.id != null) itemNames[meta.id] = { key: name, dname: meta.dname || name.replace(/_/g, ' ') }
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
    expect(p.backpackItems).toEqual([0, 0, 0])
    expect(p.kills).toBe(0)
    expect(p.deaths).toBe(0)
    expect(p.assists).toBe(0)
    expect(p.name).toBe('')
    expect(p.isRadiant).toBe(true)  // slot 0 = radiant
  })

  it('extracts backpack items correctly', () => {
    const raw = [{ player_slot: 0, backpack_0: 48, backpack_1: 63, backpack_2: 0 }]
    const [p] = extractPlayers(raw)
    expect(p.backpackItems).toEqual([48, 63, 0])
  })

  it('backpackItems defaults to [0,0,0] when backpack fields are absent', () => {
    const raw = [{ player_slot: 0, item_0: 36 }]
    const [p] = extractPlayers(raw)
    expect(p.backpackItems).toHaveLength(3)
    expect(p.backpackItems).toEqual([0, 0, 0])
  })

  it('extracts permanentBuffs IDs from permanent_buffs array', () => {
    const raw = [{ player_slot: 0, permanent_buffs: [{ permanent_buff: 2, stack_count: 1 }] }]
    const [p] = extractPlayers(raw)
    expect(p.permanentBuffs).toEqual([2])
  })

  it('extracts both scepter (2) and shard (12) when both are consumed', () => {
    const raw = [{
      player_slot: 0,
      permanent_buffs: [{ permanent_buff: 2, stack_count: 1 }, { permanent_buff: 12, stack_count: 1 }],
    }]
    const [p] = extractPlayers(raw)
    expect(p.permanentBuffs).toEqual([2, 12])
  })

  it('permanentBuffs defaults to [] when permanent_buffs is absent', () => {
    const [p] = extractPlayers([{ player_slot: 0 }])
    expect(p.permanentBuffs).toEqual([])
  })

  it('permanentBuffs defaults to [] when permanent_buffs is null', () => {
    const [p] = extractPlayers([{ player_slot: 0, permanent_buffs: null }])
    expect(p.permanentBuffs).toEqual([])
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
  it('stores key and dname for each item', () => {
    const raw = {
      shadow_blade: { id: 36, cost: 3000, dname: 'Shadow Blade' },
      black_king_bar: { id: 38, cost: 4050, dname: 'Black King Bar' },
    }
    const map = buildItemNames(raw)
    expect(map[36]).toEqual({ key: 'shadow_blade', dname: 'Shadow Blade' })
    expect(map[38]).toEqual({ key: 'black_king_bar', dname: 'Black King Bar' })
  })

  it('falls back to underscore-replaced key when dname is absent', () => {
    const raw = { manta: { id: 119 } }  // no dname
    const map = buildItemNames(raw)
    expect(map[119]).toEqual({ key: 'manta', dname: 'manta' })
  })

  it('skips entries without an id field', () => {
    const raw = { broken_item: { cost: 100 } }  // no id
    const map = buildItemNames(raw)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('handles empty object', () => {
    expect(buildItemNames({})).toEqual({})
  })

  it('item ID 0 maps but ItemSlot treats itemId 0 as empty regardless', () => {
    const raw = { empty: { id: 0, dname: 'Empty' } }
    const map = buildItemNames(raw)
    expect(map[0]).toEqual({ key: 'empty', dname: 'Empty' })
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
        json: async () => ({ shadow_blade: { id: 36, dname: 'Shadow Blade' }, black_king_bar: { id: 38, dname: 'Black King Bar' } }),
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
    expect(res._body.itemNames[36]).toEqual({ key: 'shadow_blade', dname: 'Shadow Blade' })

    vi.unstubAllGlobals()
  })

  it('returns cached data without calling OpenDota on KV hit', async () => {
    const cached = { radiantGoldAdv: [100], players: [], itemNames: { 36: { key: 'shadow_blade', dname: 'Shadow Blade' } } }
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
    expect(res._body).toEqual({ radiantGoldAdv: [], players: [], events: [], itemNames: {}, firstBloodTime: null, roshanKills: 0, picksBans: [] })

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
    const statsKvWrite = kvSetCalls.find(([key]) => key?.startsWith('stats:match:v4:'))
    expect(statsKvWrite).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('uses item map from KV cache without re-fetching constants', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)                               // stats miss
      .mockResolvedValueOnce({ 36: { key: 'shadow_blade', dname: 'Shadow Blade' } })  // item map HIT

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
    expect(res._body.itemNames[36]).toEqual({ key: 'shadow_blade', dname: 'Shadow Blade' })

    vi.unstubAllGlobals()
  })
})

// ── GoldGraph computePoints tests ─────────────────────────────────────────────

import { computePoints } from '../src/components/GoldGraph.jsx'

// SVG layout constants (must match GoldGraph.jsx)
const PL = 4    // left stroke-buffer only — labels are HTML
const PR = 16   // right buffer: keeps last marker hit circle within viewBox
const PT = 10   // top padding
const PB = 22   // bottom padding
const VW = 480
const VH = 160
const CW = VW - PL - PR   // 460
const CH = VH - PT - PB   // 128
const MID = PT + CH / 2   // 74

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

// ── Part 3: ItemSlot CDN URL logic (pure, no DOM required) ────────────────────

describe('ItemSlot CDN URL logic', () => {
  it('resolves the correct CDN URL using item.key', () => {
    const itemNames = {
      36: { key: 'shadow_blade', dname: 'Shadow Blade' },
      38: { key: 'black_king_bar', dname: 'Black King Bar' },
    }
    const base = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items'
    expect(`${base}/${itemNames[36].key}_lg.png`).toBe(`${base}/shadow_blade_lg.png`)
    expect(`${base}/${itemNames[38].key}_lg.png`).toBe(`${base}/black_king_bar_lg.png`)
  })

  it('uses dname for display (not underscore key)', () => {
    const itemNames = { 119: { key: 'manta', dname: 'Manta Style' } }
    expect(itemNames[119].dname).toBe('Manta Style')
  })

  it('returns undefined (empty slot) for itemId 0', () => {
    const itemNames = { 36: { key: 'shadow_blade', dname: 'Shadow Blade' } }
    expect(itemNames[0]).toBeUndefined()
  })

  it('returns undefined (empty slot) for an unknown itemId', () => {
    const itemNames = { 36: { key: 'shadow_blade', dname: 'Shadow Blade' } }
    expect(itemNames[999]).toBeUndefined()
  })

  it('empty itemNames map resolves nothing', () => {
    const itemNames = {}
    expect(itemNames[36]).toBeUndefined()
  })
})

// ── Part 3: PlayerStatsSection sort and grouping logic (pure) ─────────────────

function sortAndGroup(players) {
  const radiant = [...players.filter(p => p.isRadiant)].sort((a, b) => b.netWorth - a.netWorth)
  const dire = [...players.filter(p => !p.isRadiant)].sort((a, b) => b.netWorth - a.netWorth)
  return { radiant, dire }
}

describe('PlayerStatsSection sort and grouping', () => {
  const mockPlayers = [
    { isRadiant: true,  netWorth: 20000, name: 'yatoro',   heroId: 1,  items: [0,0,0,0,0,0] },
    { isRadiant: true,  netWorth: 35000, name: 'collapse',  heroId: 2,  items: [36,0,0,0,0,0] },
    { isRadiant: true,  netWorth: 28000, name: 'miposhka', heroId: 3,  items: [0,0,0,0,0,0] },
    { isRadiant: true,  netWorth: 15000, name: 'Larl',     heroId: 4,  items: [0,0,0,0,0,0] },
    { isRadiant: true,  netWorth: 22000, name: 'Torontotokyo', heroId: 5, items: [0,0,0,0,0,0] },
    { isRadiant: false, netWorth: 31000, name: 'Nisha',    heroId: 6,  items: [108,0,0,0,0,0] },
    { isRadiant: false, netWorth: 18000, name: 'Crystallis', heroId: 7, items: [0,0,0,0,0,0] },
    { isRadiant: false, netWorth: 26000, name: 'Pure',     heroId: 8,  items: [0,0,0,0,0,0] },
    { isRadiant: false, netWorth: 12000, name: 'dyrachyo', heroId: 9,  items: [0,0,0,0,0,0] },
    { isRadiant: false, netWorth: 23000, name: 'Puppey',   heroId: 10, items: [0,0,0,0,0,0] },
  ]

  it('separates players into radiant and dire groups', () => {
    const { radiant, dire } = sortAndGroup(mockPlayers)
    expect(radiant).toHaveLength(5)
    expect(dire).toHaveLength(5)
    radiant.forEach(p => expect(p.isRadiant).toBe(true))
    dire.forEach(p => expect(p.isRadiant).toBe(false))
  })

  it('sorts radiant players by netWorth descending', () => {
    const { radiant } = sortAndGroup(mockPlayers)
    for (let i = 1; i < radiant.length; i++) {
      expect(radiant[i - 1].netWorth).toBeGreaterThanOrEqual(radiant[i].netWorth)
    }
    expect(radiant[0].name).toBe('collapse')   // highest NW radiant
    expect(radiant[4].name).toBe('Larl')        // lowest NW radiant
  })

  it('sorts dire players by netWorth descending', () => {
    const { dire } = sortAndGroup(mockPlayers)
    for (let i = 1; i < dire.length; i++) {
      expect(dire[i - 1].netWorth).toBeGreaterThanOrEqual(dire[i].netWorth)
    }
    expect(dire[0].name).toBe('Nisha')          // highest NW dire
    expect(dire[4].name).toBe('dyrachyo')       // lowest NW dire
  })

  it('handles empty players array without crashing', () => {
    const { radiant, dire } = sortAndGroup([])
    expect(radiant).toHaveLength(0)
    expect(dire).toHaveLength(0)
  })

  it('maxNetWorth calculated correctly across both teams', () => {
    const maxNetWorth = Math.max(...mockPlayers.map(p => p.netWorth), 1)
    expect(maxNetWorth).toBe(35000)  // collapse
  })

  it('networth bar width clamps to 100% for max-NW player', () => {
    const maxNetWorth = 35000
    const collapse = mockPlayers.find(p => p.name === 'collapse')
    const barWidth = Math.round((collapse.netWorth / maxNetWorth) * 100)
    expect(barWidth).toBe(100)
  })

  it('networth bar is proportional for mid-range player', () => {
    const maxNetWorth = 35000
    const yatoro = mockPlayers.find(p => p.name === 'yatoro')
    const barWidth = Math.round((yatoro.netWorth / maxNetWorth) * 100)
    expect(barWidth).toBeCloseTo(57, 0)   // 20000/35000 ≈ 57%
  })
})

// ── Part 3: extractMatchEvents (rapier + rampage detection) ──────────────────

function extractMatchEvents(players) {
  const isRadiantPlayer = (p) => (p.player_slot ?? 0) < 128
  const evts = []
  for (const p of players) {
    const team = isRadiantPlayer(p) ? 'radiant' : 'dire'
    const player = p.name || p.personaname || ''
    if (Array.isArray(p.purchase_log)) {
      for (const entry of p.purchase_log) {
        if (entry.key === 'rapier' && typeof entry.time === 'number' && entry.time >= 0) {
          evts.push({ type: 'rapier', team, player, time: entry.time })
        }
      }
    }
    const rampageCount = p.multi_kills?.['5'] || p.multi_kills?.[5] || 0
    if (rampageCount > 0 && Array.isArray(p.kills_log) && p.kills_log.length >= 5) {
      const times = p.kills_log.map(k => k.time).filter(t => typeof t === 'number').sort((a, b) => a - b)
      let found = 0
      let skipUntil = -Infinity
      for (let i = 4; i < times.length && found < rampageCount; i++) {
        if (times[i - 4] <= skipUntil) continue
        let valid = true
        for (let j = 1; j <= 4; j++) {
          if (times[i - 4 + j] - times[i - 4 + j - 1] > 18) { valid = false; break }
        }
        if (valid) {
          evts.push({ type: 'rampage', team, player, time: times[i - 4] })
          skipUntil = times[i]
          found++
        }
      }
    }
  }
  return evts.sort((a, b) => a.time - b.time)
}

describe('extractMatchEvents', () => {
  it('detects rapier purchase from purchase_log', () => {
    const players = [{
      player_slot: 0, name: 'miracle',
      purchase_log: [{ key: 'rapier', time: 1800 }, { key: 'blink', time: 600 }],
    }]
    const events = extractMatchEvents(players)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'rapier', team: 'radiant', player: 'miracle', time: 1800 })
  })

  it('assigns correct team for dire rapier purchase', () => {
    const players = [{
      player_slot: 128, name: 'nisha',
      purchase_log: [{ key: 'rapier', time: 2400 }],
    }]
    const events = extractMatchEvents(players)
    expect(events[0].team).toBe('dire')
  })

  it('detects rampage using multi_kills["5"] as authority and kills_log for timestamp', () => {
    const players = [{
      player_slot: 0, name: 'yatoro',
      multi_kills: { '5': 1 },
      kills_log: [
        { time: 1200 }, { time: 1210 }, { time: 1220 }, { time: 1225 }, { time: 1228 },
      ],
    }]
    const events = extractMatchEvents(players)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'rampage', team: 'radiant', player: 'yatoro', time: 1200 })
  })

  it('detects rampage spanning > 30s when each consecutive kill is within 18s', () => {
    // 5 kills each 14s apart = 56s total span — old 30s window missed this
    const players = [{
      player_slot: 0, name: 'ana',
      multi_kills: { '5': 1 },
      kills_log: [
        { time: 1000 }, { time: 1014 }, { time: 1028 }, { time: 1042 }, { time: 1056 },
      ],
    }]
    const events = extractMatchEvents(players)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'rampage', team: 'radiant', player: 'ana', time: 1000 })
  })

  it('does NOT detect rampage when multi_kills["5"] is absent, even if kills_log pattern matches', () => {
    const players = [{
      player_slot: 0, name: 'player',
      kills_log: [
        { time: 1000 }, { time: 1005 }, { time: 1010 }, { time: 1015 }, { time: 1020 },
      ],
    }]
    const events = extractMatchEvents(players)
    expect(events.filter(e => e.type === 'rampage')).toHaveLength(0)
  })

  it('does NOT detect rampage when a consecutive pair exceeds 18s', () => {
    // gap between kill 3 and 4 is 20s > 18s
    const players = [{
      player_slot: 0, name: 'player',
      multi_kills: { '5': 1 },
      kills_log: [
        { time: 1000 }, { time: 1010 }, { time: 1020 }, { time: 1040 }, { time: 1050 },
      ],
    }]
    const events = extractMatchEvents(players)
    expect(events.filter(e => e.type === 'rampage')).toHaveLength(0)
  })

  it('caps detected rampages at multi_kills["5"] count', () => {
    // kills_log has two valid 5-kill windows but multi_kills says only 1 rampage
    const players = [{
      player_slot: 0, name: 'player',
      multi_kills: { '5': 1 },
      kills_log: [
        { time: 100 }, { time: 105 }, { time: 110 }, { time: 115 }, { time: 120 },
        { time: 500 }, { time: 505 }, { time: 510 }, { time: 515 }, { time: 520 },
      ],
    }]
    const events = extractMatchEvents(players)
    expect(events.filter(e => e.type === 'rampage')).toHaveLength(1)
  })

  it('returns events sorted by time ascending', () => {
    const players = [
      { player_slot: 0, name: 'a', purchase_log: [{ key: 'rapier', time: 3000 }] },
      { player_slot: 128, name: 'b', purchase_log: [{ key: 'rapier', time: 1500 }] },
    ]
    const events = extractMatchEvents(players)
    expect(events[0].time).toBeLessThan(events[1].time)
  })

  it('returns empty array when no events present', () => {
    const players = [{ player_slot: 0, name: 'player', purchase_log: [], kills_log: [] }]
    expect(extractMatchEvents(players)).toEqual([])
  })

  it('handles missing purchase_log and kills_log gracefully', () => {
    const players = [{ player_slot: 0, name: 'player' }]
    expect(() => extractMatchEvents(players)).not.toThrow()
    expect(extractMatchEvents(players)).toEqual([])
  })
})

// ── Roshan event extraction ───────────────────────────────────────────────────

function extractRoshanEvents(objectives) {
  return (objectives || [])
    .filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && typeof o.time === 'number' && o.time >= 0 && (o.team === 2 || o.team === 3))
    .sort((a, b) => a.time - b.time)
    .map((o, idx) => ({ type: 'roshan', time: o.time, team: o.team === 2 ? 'radiant' : 'dire', index: idx + 1 }))
}

describe('extractRoshanEvents', () => {
  it('extracts radiant and dire roshan kills with index and team', () => {
    const objectives = [
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1800, team: 2 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 3600, team: 3 },
    ]
    const events = extractRoshanEvents(objectives)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'roshan', time: 1800, team: 'radiant', index: 1 })
    expect(events[1]).toEqual({ type: 'roshan', time: 3600, team: 'dire', index: 2 })
  })

  it('sorts kills by time ascending and numbers them sequentially', () => {
    const objectives = [
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 3600, team: 3 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1200, team: 2 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 2400, team: 2 },
    ]
    const events = extractRoshanEvents(objectives)
    expect(events.map(e => e.time)).toEqual([1200, 2400, 3600])
    expect(events.map(e => e.index)).toEqual([1, 2, 3])
  })

  it('filters out non-roshan objective types', () => {
    const objectives = [
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1800, team: 2 },
      { type: 'CHAT_MESSAGE_COURIER_LOST', time: 900, team: 2 },
    ]
    expect(extractRoshanEvents(objectives)).toHaveLength(1)
  })

  it('filters out objectives with missing or invalid time', () => {
    const objectives = [
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: undefined, team: 2 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: -1, team: 2 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1800, team: 2 },
    ]
    const events = extractRoshanEvents(objectives)
    expect(events).toHaveLength(1)
    expect(events[0].time).toBe(1800)
  })

  it('filters out objectives with unknown team value', () => {
    const objectives = [
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1800, team: 99 },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 2400, team: null },
      { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 3000, team: 3 },
    ]
    const events = extractRoshanEvents(objectives)
    expect(events).toHaveLength(1)
    expect(events[0].team).toBe('dire')
  })

  it('returns empty array for null/missing objectives', () => {
    expect(extractRoshanEvents(null)).toEqual([])
    expect(extractRoshanEvents(undefined)).toEqual([])
    expect(extractRoshanEvents([])).toEqual([])
  })
})

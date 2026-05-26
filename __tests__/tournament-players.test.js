/**
 * Tests for the ?mode=tournament-players handler in api/tournaments.js
 * and the findLeague() shared utility exported from api/_shared.js.
 *
 * Coverage:
 *  - findLeague: happy path, season disambiguation, qualifier tiebreak, null/empty inputs
 *  - top5 leaderboard building logic (pure, duplicated from handler)
 *  - Handler: missing id → 400
 *  - Handler: KV cache hit → return cached without calling OpenDota
 *  - Handler: KV miss + successful OD flow → correct payload shape
 *  - Handler: no league match found → fail-open empty stats (no KV write)
 *  - Handler: OD match list non-2xx → fail-open empty stats (no KV write)
 *  - Handler: bust=1 → deletes KV key before re-fetching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks must be hoisted before any imports ──────────────────────────────────

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
    del: vi.fn().mockResolvedValue(1),
    lrange: vi.fn().mockResolvedValue([]),
    lpush: vi.fn().mockResolvedValue(1),
    ltrim: vi.fn().mockResolvedValue('OK'),
    expire: vi.fn().mockResolvedValue(1),
  }
  return { mockKv, kvSetCalls }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { Object.assign(this, mockKv) }
  },
}))

import { findLeague } from '../api/_shared.js'
import handler from '../api/tournaments.js'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const mockLeagues = [
  { leagueid: 15438, name: 'DreamLeague Season 29', tier: 'premium' },
  { leagueid: 15200, name: 'DreamLeague Season 28', tier: 'premium' },
  { leagueid: 14900, name: 'PGL Wallachia Season 7', tier: 'premium' },
  { leagueid: 15100, name: 'PGL Wallachia Season 7 Qualifier', tier: 'premium' },
]

function makeMockMatch(overrides = {}) {
  return {
    match_id: 7890001,
    radiant_name: 'Team Spirit',
    dire_name: 'Entity',
    radiant_win: true,
    players: [
      { player_slot: 0,   account_id: 1001, name: 'Yatoro', hero_id: 86, kills: 12, deaths: 2, assists: 8, net_worth: 45000, gold_per_min: 750 },
      { player_slot: 1,   account_id: 1002, name: 'Collapse', hero_id: 7, kills: 5, deaths: 3, assists: 14, net_worth: 32000, gold_per_min: 520 },
      { player_slot: 128, account_id: 2001, name: 'Nisha', hero_id: 1, kills: 8, deaths: 5, assists: 15, net_worth: 38000, gold_per_min: 630 },
      { player_slot: 129, account_id: 2002, name: 'Puppey', hero_id: 53, kills: 2, deaths: 8, assists: 22, net_worth: 18000, gold_per_min: 290 },
      { player_slot: 130, account_id: 2003, name: 'Zai', hero_id: 20, kills: 3, deaths: 6, assists: 18, net_worth: 20000, gold_per_min: 310 },
    ],
    ...overrides,
  }
}

function makeReq(query = {}) {
  return { query: { mode: 'tournament-players', ...query }, method: 'GET', body: {} }
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

beforeEach(() => {
  vi.clearAllMocks()
  kvSetCalls.length = 0
  mockKv.get.mockResolvedValue(null)
  mockKv.mget.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── findLeague unit tests ─────────────────────────────────────────────────────

describe('findLeague', () => {
  it('matches by token overlap — at least 2 shared tokens required', () => {
    const result = findLeague(mockLeagues, 'DreamLeague 29')
    expect(result?.leagueid).toBe(15438)
  })

  it('disambiguates by season number — 28 matches S28 not S29', () => {
    const result = findLeague(mockLeagues, 'DreamLeague 28')
    expect(result?.leagueid).toBe(15200)
  })

  it('prefers non-qualifier over qualifier on equal token overlap', () => {
    // "PGL Wallachia 7" → tokens {pgl, wallachia, 7}
    // Both PGL Wallachia S7 and PGL Wallachia S7 Qualifier share all 3 tokens
    const result = findLeague(mockLeagues, 'PGL Wallachia 7')
    expect(result?.leagueid).toBe(14900) // main event, not qualifier
  })

  it('returns null when fewer than 2 tokens match any league', () => {
    expect(findLeague(mockLeagues, 'BLAST Premier Spring')).toBeNull()
  })

  it('returns null for empty leagues array', () => {
    expect(findLeague([], 'DreamLeague 29')).toBeNull()
  })

  it('returns null for null search string', () => {
    expect(findLeague(mockLeagues, null)).toBeNull()
  })

  it('returns null for empty search string', () => {
    expect(findLeague(mockLeagues, '')).toBeNull()
  })

  it('returns null when leagues is null', () => {
    expect(findLeague(null, 'DreamLeague 29')).toBeNull()
  })

  it('treats "season" as a stop word — stripped from both sides', () => {
    // "DreamLeague Season 29" → tokens {dreamleague, 29}  (season is stop word)
    // should still match league "DreamLeague Season 29"
    const result = findLeague(mockLeagues, 'DreamLeague Season 29')
    expect(result?.leagueid).toBe(15438)
  })

  it('returns null when season number in search does not match any league (cross-season guard)', () => {
    // "BLAST Slam Season 7 2026" → numeric tokens {7, 2026}
    // Only Season 6 exists in OD → neither 7 nor 2026 appear → null
    const leagues = [
      { leagueid: 15000, name: 'BLAST Slam Season 6 2025', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result).toBeNull()
  })

  it('matches correctly when season number and year both appear in the league name', () => {
    const leagues = [
      { leagueid: 15000, name: 'BLAST Slam Season 6 2025', tier: 'premium' },
      { leagueid: 15500, name: 'BLAST Slam Season 7 2026', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result?.leagueid).toBe(15500)
  })

  it('returns null when year in search does not match (cross-year guard)', () => {
    // League exists for 2025 but search is for 2026
    const leagues = [
      { leagueid: 15000, name: 'ESL One 2025', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'ESL One 2026')
    expect(result).toBeNull()
  })

  it('matches when OD uses Roman numeral and PS uses Arabic season number', () => {
    // OD registers the league as "BLAST SLAM I" (Roman numeral I = single char, filtered).
    // PS calls the same tournament "BLAST Slam Season 7 2026".
    // The league has no Arabic numeric tokens to contradict the search, so it should match.
    const leagues = [
      { leagueid: 17414, name: 'BLAST SLAM I', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result?.leagueid).toBe(17414)
  })

  it('still rejects a genuinely wrong season even when Roman numerals are involved', () => {
    // "BLAST Slam Season 6 2025" has Arabic "6" which contradicts search "7 2026"
    const leagues = [
      { leagueid: 15000, name: 'BLAST Slam Season 6 2025', tier: 'premium' },
      { leagueid: 17414, name: 'BLAST SLAM I', tier: 'premium' },
    ]
    // Numeric guard: "6" is not in {7, 2026} → Season 6 rejected; "BLAST SLAM I" has no
    // Arabic numerics → no contradiction → best overlap candidate returned
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result?.leagueid).toBe(17414)
  })

  it('disambiguates multi-char Roman numeral seasons — VII matches S7, VI is rejected', () => {
    // OD uses multi-char Roman numerals: "BLAST SLAM VI" and "BLAST SLAM VII".
    // After normalization VI→6, VII→7. Searching for Season 7: VI contradicts, VII matches.
    const leagues = [
      { leagueid: 16000, name: 'BLAST SLAM VI',  tier: 'premium' },
      { leagueid: 17000, name: 'BLAST SLAM VII', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result?.leagueid).toBe(17000)
  })

  it('rejects all Roman numeral leagues when only the wrong season exists (VI only, searching S7)', () => {
    // OD only has VI; VII hasn't been created yet. Should return null rather than wrong data.
    const leagues = [
      { leagueid: 16000, name: 'BLAST SLAM VI', tier: 'premium' },
    ]
    const result = findLeague(leagues, 'BLAST Slam Season 7 2026')
    expect(result).toBeNull()
  })
})

// ── top5 building logic (pure, duplicated from handler) ───────────────────────

function buildLeaderboard(allMatches) {
  const gamesMap = {}
  const allEntries = []

  for (const match of allMatches) {
    if (!Array.isArray(match.players) || !match.players.length) continue
    const isRadiantPlayer = p => (p.player_slot ?? 0) < 128
    for (const p of match.players) {
      const accountId = p.account_id
      if (!accountId) continue
      gamesMap[accountId] = (gamesMap[accountId] || 0) + 1
      allEntries.push({
        accountId,
        playerName: p.name || p.personaname || '',
        heroId:     p.hero_id ?? 0,
        teamName:   isRadiantPlayer(p) ? (match.radiant_name || '') : (match.dire_name || ''),
        matchId:    match.match_id,
        radiantName: match.radiant_name || '',
        direName:   match.dire_name || '',
        kills:      p.kills ?? 0,
        deaths:     p.deaths ?? 0,
        assists:    p.assists ?? 0,
        netWorth:   p.net_worth ?? 0,
        gpm:        p.gold_per_min ?? 0,
      })
    }
  }

  const top5 = (statKey) =>
    [...allEntries]
      .sort((a, b) => b[statKey] - a[statKey])
      .slice(0, 5)
      .map((e, i) => ({ ...e, value: e[statKey], rank: i + 1, gamesPlayed: gamesMap[e.accountId] || 1 }))

  return {
    kills:    top5('kills'),
    deaths:   top5('deaths'),
    assists:  top5('assists'),
    netWorth: top5('netWorth'),
    gpm:      top5('gpm'),
  }
}

describe('leaderboard building (top5)', () => {
  it('ranks players by stat descending with rank 1 being highest', () => {
    const match = makeMockMatch()
    const { kills } = buildLeaderboard([match])
    expect(kills[0].rank).toBe(1)
    expect(kills[0].playerName).toBe('Yatoro')  // 12 kills — highest
    expect(kills[0].value).toBe(12)
  })

  it('assigns correct team name based on player_slot radiant/dire split', () => {
    const match = makeMockMatch()
    const { kills } = buildLeaderboard([match])
    const yatoro = kills.find(e => e.playerName === 'Yatoro')
    expect(yatoro.teamName).toBe('Team Spirit')  // slot 0 → radiant
    const nisha = kills.find(e => e.playerName === 'Nisha')
    expect(nisha?.teamName).toBe('Entity')  // slot 128 → dire
  })

  it('gamesPlayed counts correctly across multiple matches', () => {
    const match1 = makeMockMatch({ match_id: 7890001 })
    const match2 = makeMockMatch({ match_id: 7890002 })
    const { kills } = buildLeaderboard([match1, match2])
    // Yatoro (accountId 1001) played in both matches
    const yatoro = kills.find(e => e.playerName === 'Yatoro')
    expect(yatoro.gamesPlayed).toBe(2)
  })

  it('caps result at 5 entries per stat even with more players', () => {
    const match = makeMockMatch()
    const { kills } = buildLeaderboard([match])
    expect(kills.length).toBeLessThanOrEqual(5)
  })

  it('attaches value field equal to the stat for the active stat key', () => {
    const match = makeMockMatch()
    const { assists } = buildLeaderboard([match])
    assists.forEach(e => expect(e.value).toBe(e.assists))
  })

  it('skips players with no account_id', () => {
    const match = {
      match_id: 9999,
      radiant_name: 'A', dire_name: 'B',
      players: [
        { player_slot: 0, account_id: null, name: 'Ghost', kills: 99 },
        { player_slot: 1, account_id: 1001, name: 'Real', kills: 5 },
      ],
    }
    const { kills } = buildLeaderboard([match])
    expect(kills.every(e => e.playerName !== 'Ghost')).toBe(true)
    expect(kills.some(e => e.playerName === 'Real')).toBe(true)
  })

  it('uses personaname when name is absent', () => {
    const match = {
      match_id: 9001,
      radiant_name: 'Alpha', dire_name: 'Beta',
      players: [{ player_slot: 0, account_id: 5555, personaname: 'SteamUser', kills: 7 }],
    }
    const { kills } = buildLeaderboard([match])
    expect(kills[0].playerName).toBe('SteamUser')
  })

  it('returns empty arrays for all stats when matches have no players', () => {
    const match = { match_id: 100, players: [] }
    const result = buildLeaderboard([match])
    expect(result.kills).toHaveLength(0)
    expect(result.deaths).toHaveLength(0)
    expect(result.assists).toHaveLength(0)
    expect(result.netWorth).toHaveLength(0)
    expect(result.gpm).toHaveLength(0)
  })

  it('defaults numeric stat fields to 0 when absent from player object', () => {
    const match = {
      match_id: 200, radiant_name: 'X', dire_name: 'Y',
      players: [{ player_slot: 0, account_id: 7777, name: 'Player' }],
    }
    const { kills } = buildLeaderboard([match])
    expect(kills[0].kills).toBe(0)
    expect(kills[0].deaths).toBe(0)
    expect(kills[0].assists).toBe(0)
    expect(kills[0].netWorth).toBe(0)
    expect(kills[0].gpm).toBe(0)
  })
})

// ── Handler integration tests ─────────────────────────────────────────────────

describe('?mode=tournament-players handler', () => {
  it('returns 400 when id is missing', async () => {
    const req = { query: { mode: 'tournament-players' }, method: 'GET', body: {} }
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body?.error).toMatch(/id required/)
  })

  it('returns cached payload without calling OpenDota on KV hit', async () => {
    const cachedPayload = {
      stats: { kills: [{ rank: 1, playerName: 'Yatoro', value: 32 }], deaths: [], assists: [], netWorth: [], gpm: [] },
      gameCount: 5,
      league: 'DreamLeague Season 29',
    }
    mockKv.get.mockResolvedValueOnce(cachedPayload)

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const req = makeReq({ id: '12345', name: 'DreamLeague 29' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toEqual(cachedPayload)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns correct payload shape on KV miss + successful OD flow', async () => {
    // KV: players cache miss, then leagues KV hit
    mockKv.get
      .mockResolvedValueOnce(null)           // players cache miss
      .mockResolvedValueOnce(mockLeagues)    // leagues KV hit

    const match = makeMockMatch()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ match_id: match.match_id }] })  // league match list
      .mockResolvedValueOnce({ ok: true, json: async () => match })                            // full match data
    )

    const req = makeReq({ id: '12345', name: 'DreamLeague 29' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body).toHaveProperty('stats')
    expect(res._body).toHaveProperty('gameCount', 1)
    expect(res._body).toHaveProperty('league', 'DreamLeague Season 29')
    expect(res._body.stats).toHaveProperty('kills')
    expect(res._body.stats).toHaveProperty('deaths')
    expect(res._body.stats).toHaveProperty('assists')
    expect(res._body.stats).toHaveProperty('netWorth')
    expect(res._body.stats).toHaveProperty('gpm')
    expect(res._body.stats.kills[0].playerName).toBe('Yatoro')
    expect(res._body.stats.kills[0].rank).toBe(1)
    expect(res._body.stats.kills[0].value).toBe(12)
    expect(res._body.stats.kills[0].gamesPlayed).toBe(1)
  })

  it('writes result to KV after a successful OD fetch', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockLeagues)

    const match = makeMockMatch()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ match_id: match.match_id }] })
      .mockResolvedValueOnce({ ok: true, json: async () => match })
    )

    const req = makeReq({ id: '55555', name: 'DreamLeague 29' })
    const res = makeRes()
    await handler(req, res)

    const kvWrite = kvSetCalls.find(([key]) => key === 'dota2:tournament_players_v2:55555')
    expect(kvWrite).toBeDefined()
    expect(kvWrite[1]).toHaveProperty('stats')
    expect(kvWrite[1]).toHaveProperty('gameCount')

    vi.unstubAllGlobals()
  })

  it('returns fail-open empty stats when no league match found (no KV write)', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)           // players cache miss
      .mockResolvedValueOnce(mockLeagues)    // leagues KV hit (triggers retry)

    // Leagues retry returns same mockLeagues — "BLAST Premier Spring" still matches nothing
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => mockLeagues })
    vi.stubGlobal('fetch', fetchSpy)

    // "BLAST Premier" has no 2-token overlap with mockLeagues
    const req = makeReq({ id: '99999', name: 'BLAST Premier Spring' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.stats).toEqual({ kills: [], deaths: [], assists: [], netWorth: [], gpm: [] })
    expect(res._body.gameCount).toBe(0)
    // Only the leagues-refresh fetch was called; OD match endpoints were not called
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toContain('/leagues')
    // KV should NOT have been poisoned with empty data
    const kvWrite = kvSetCalls.find(([key]) => key === 'dota2:tournament_players_v2:99999')
    expect(kvWrite).toBeUndefined()
  })

  it('returns fail-open empty stats when OD league match list returns non-2xx (no KV write)', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockLeagues)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })  // match list fails
    )

    const req = makeReq({ id: '77777', name: 'DreamLeague 29' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.stats).toEqual({ kills: [], deaths: [], assists: [], netWorth: [], gpm: [] })
    expect(res._body.gameCount).toBe(0)
    const kvWrite = kvSetCalls.find(([key]) => key === 'dota2:tournament_players_v2:77777')
    expect(kvWrite).toBeUndefined()
  })

  it('fetches leagues from OD when leagues KV misses, then caches them', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)      // players cache miss
      .mockResolvedValueOnce(null)      // leagues KV miss

    const match = makeMockMatch()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockLeagues })         // OD /leagues
      .mockResolvedValueOnce({ ok: true, json: async () => [{ match_id: match.match_id }] })  // league matches
      .mockResolvedValueOnce({ ok: true, json: async () => match })               // full match
    )

    const req = makeReq({ id: '11111', name: 'DreamLeague 29' })
    const res = makeRes()
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.gameCount).toBe(1)

    // Leagues should have been cached in KV
    const leaguesKvWrite = kvSetCalls.find(([key]) => key === 'opendota:leagues_v2')
    expect(leaguesKvWrite).toBeDefined()
  })

  it('bust=1 deletes the KV key before re-fetching', async () => {
    // With bust=1, the players cache check is SKIPPED — the first kv.get goes straight to leagues.
    mockKv.get.mockResolvedValueOnce(mockLeagues)  // only call: opendota:leagues_v2 KV hit

    const match = makeMockMatch()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ match_id: match.match_id }] })
      .mockResolvedValueOnce({ ok: true, json: async () => match })
    )

    const req = makeReq({ id: '33333', name: 'DreamLeague 29', bust: '1' })
    const res = makeRes()
    await handler(req, res)

    expect(mockKv.del).toHaveBeenCalledWith('dota2:tournament_players_v2:33333')
    expect(res._status).toBe(200)
    expect(res._body.gameCount).toBe(1)
  })

  it('uses 30-day TTL when completed=1 query param is set', async () => {
    mockKv.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockLeagues)

    const match = makeMockMatch()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ match_id: match.match_id }] })
      .mockResolvedValueOnce({ ok: true, json: async () => match })
    )

    const req = makeReq({ id: '44444', name: 'DreamLeague 29', completed: '1' })
    const res = makeRes()
    await handler(req, res)

    const kvWrite = kvSetCalls.find(([key]) => key === 'dota2:tournament_players_v2:44444')
    expect(kvWrite).toBeDefined()
    const ttl = kvWrite[2]?.ex
    expect(ttl).toBe(60 * 60 * 24 * 30)  // 30-day TTL for completed events
  })
})

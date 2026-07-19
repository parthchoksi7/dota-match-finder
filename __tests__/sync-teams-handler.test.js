/**
 * Tests for api/_handlers/syncTeams.js — the cron-driven job that harvests tier-1 team
 * names/slugs/acronyms from live PandaScore tournament rosters (?mode=sync-teams).
 *
 * Covers the two noise filters added alongside the dynamic Follow Teams / Calendar team
 * list (previously a hand-maintained array missing newer tier-1 teams like Parivision):
 * - Teams sourced only from a "Qualifier" stage are excluded (isTier1() still classifies
 *   the stage as tier-1 by league-keyword override, but qualifier brackets surface
 *   amateur teams that never reach the actual event).
 * - Placeholder opponent names (TBD/TBA) are excluded.
 * It also covers the dual-KV-key write: the legacy plain-name key (api/news.js's
 * existing reader) must keep receiving plain strings unchanged, while a new key carries
 * the richer {name, slug, acronym} shape for the frontend team pickers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const kvStore = {}
vi.mock('../api/_kv.js', () => ({
  kv: {
    get: vi.fn(async (key) => kvStore[key] ?? null),
    set: vi.fn(async (key, val) => { kvStore[key] = val }),
  },
}))

import { kv } from '../api/_kv.js'
import { KV_TIER1_TEAMS_KEY, KV_TIER1_TEAMS_FULL_KEY, TIER1_TEAMS_SERVER } from '../api/_shared.js'
import handleSyncTeams from '../api/_handlers/syncTeams.js'

function mockReq(auth) {
  return { headers: auth ? { authorization: `Bearer ${auth}` } : {} }
}

function mockRes() {
  const res = {}
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

const RUNNING_GROUP_STAGE = {
  id: 1,
  tier: 's',
  name: 'Group Stage',
  league: { name: 'DreamLeague' },
  teams: [
    { name: 'Brand New Underdog', slug: 'brand-new-underdog', acronym: 'BNU' },
    { name: 'TBD', slug: null, acronym: null },
  ],
}

const RUNNING_QUALIFIER_STAGE = {
  id: 2,
  tier: 's',
  name: 'DreamLeague Season 29 SEA Regional Qualifier',
  league: { name: 'DreamLeague' },
  teams: [
    { name: 'Shadow Amateur FC', slug: 'shadow-amateur-fc', acronym: null },
  ],
}

beforeEach(() => {
  for (const k of Object.keys(kvStore)) delete kvStore[k]
  vi.clearAllMocks()
  delete process.env.CRON_SECRET
  process.env.PANDASCORE_TOKEN = 'test-token'
  global.fetch = vi.fn((url) => {
    const body = url.includes('/running') ? [RUNNING_GROUP_STAGE, RUNNING_QUALIFIER_STAGE] : []
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  })
})

describe('syncTeams handler', () => {
  it('401s when CRON_SECRET is set and the request lacks a matching bearer token', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const res = mockRes()
    await handleSyncTeams(mockReq('wrong'), res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('harvests a genuinely new team from a real (non-qualifier) tier-1 stage', async () => {
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    expect(res.body.added).toContain('Brand New Underdog')
  })

  it('excludes teams sourced only from a Qualifier-named stage', async () => {
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    expect(res.body.added).not.toContain('Shadow Amateur FC')
    expect(kv.set).toHaveBeenCalledWith(
      KV_TIER1_TEAMS_KEY,
      expect.not.arrayContaining(['Shadow Amateur FC']),
      expect.anything(),
    )
  })

  it('excludes placeholder opponent names (TBD)', async () => {
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    expect(res.body.added).not.toContain('TBD')
  })

  it('writes the legacy plain-name KV key as plain strings (api/news.js reader untouched)', async () => {
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    const [, nameList] = kv.set.mock.calls.find(c => c[0] === KV_TIER1_TEAMS_KEY)
    expect(nameList).toContain('Brand New Underdog')
    expect(nameList.every(n => typeof n === 'string')).toBe(true)
    // Static fallback names are still merged in, e.g. an existing tier-1 team
    expect(nameList).toEqual(expect.arrayContaining(TIER1_TEAMS_SERVER))
  })

  it('writes the full-object KV key with slug/acronym for the new team', async () => {
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    const [, fullList] = kv.set.mock.calls.find(c => c[0] === KV_TIER1_TEAMS_FULL_KEY)
    const entry = fullList.find(t => t.name === 'Brand New Underdog')
    expect(entry).toEqual({ name: 'Brand New Underdog', slug: 'brand-new-underdog', acronym: 'BNU' })
  })

  it('migrates a name accumulated in the legacy plain-name list into the full-object list even when it is absent from today\'s tournaments', async () => {
    // Simulates a team tracked over past cron runs (in KV_TIER1_TEAMS_KEY) that is
    // currently out of active tournaments and isn't in the static TIER1_TEAMS_SERVER
    // base — without this migration it would silently never appear in ?mode=teams.
    kvStore[KV_TIER1_TEAMS_KEY] = ['Off Season Legacy Team']
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    const [, fullList] = kv.set.mock.calls.find(c => c[0] === KV_TIER1_TEAMS_FULL_KEY)
    expect(fullList.find(t => t.name === 'Off Season Legacy Team')).toEqual({
      name: 'Off Season Legacy Team', slug: null, acronym: null,
    })
  })

  it('trims a PandaScore team name before storing it, even though only the trimmed form is checked against the placeholder regex', async () => {
    global.fetch = vi.fn((url) => {
      const body = url.includes('/running') ? [{
        ...RUNNING_GROUP_STAGE,
        teams: [{ name: '  Padded Name  ', slug: 'padded-name', acronym: null }],
      }] : []
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    })
    const res = mockRes()
    await handleSyncTeams(mockReq(), res)
    expect(res.body.added).toContain('Padded Name')
    expect(res.body.added).not.toContain('  Padded Name  ')
  })
})

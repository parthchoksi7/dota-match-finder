/**
 * Tests for api/_handlers/teamsList.js (?mode=teams) — the public read endpoint that
 * powers the Follow Teams search (ManageTeamsModal.jsx) and Calendar team picker
 * (Calendar.jsx). Reads the KV list written by ?mode=sync-teams (syncTeams.js) and
 * enriches each team with any known nicknames (TEAM_NICKNAMES in api/_shared.js) so the
 * client can alias-match (e.g. "boomboys" -> BetBoom Team) without its own copy of the
 * nickname dictionary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/_kv.js', () => ({ kv: { get: vi.fn() } }))

import { kv } from '../api/_kv.js'
import handleTeamsList from '../api/_handlers/teamsList.js'

function mockRes() {
  const res = {}
  res.setHeader = vi.fn()
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('teamsList handler', () => {
  it('serves the KV list, enriched with known aliases, sorted by name', async () => {
    kv.get.mockResolvedValue([
      { name: 'Parivision', slug: 'parivision', acronym: null },
      { name: 'BetBoom Team', slug: 'betboom', acronym: 'BB' },
    ])
    const res = mockRes()
    await handleTeamsList({}, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.teams.map(t => t.name)).toEqual(['BetBoom Team', 'Parivision'])
    const betboom = res.body.teams.find(t => t.name === 'BetBoom Team')
    expect(betboom.aliases).toEqual(expect.arrayContaining(['boomboys', 'bb']))
    const parivision = res.body.teams.find(t => t.name === 'Parivision')
    expect(parivision.aliases).toEqual(expect.arrayContaining(['pvision']))
  })

  it('falls back to the static TIER1_TEAMS_SERVER list, with real slugs backfilled from TIER1_TEAMS_SERVER_SLUGS, when KV is empty', async () => {
    // Regression guard: an earlier version of this fallback set slug: null for every
    // team, which silently emptied Calendar.jsx's team picker (it filters on `t.slug`)
    // for up to ~25h (CDN s-maxage + stale-while-revalidate) any time KV was empty —
    // e.g. right after this feature's first deploy, before the sync-teams cron had run.
    kv.get.mockResolvedValue(null)
    const res = mockRes()
    await handleTeamsList({}, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.teams.length).toBeGreaterThan(0)
    const parivision = res.body.teams.find(t => t.name === 'Parivision')
    expect(parivision).toBeTruthy()
    expect(parivision.slug).toBe('parivision')
    expect(res.body.teams.every(t => t.slug)).toBe(true)
  })

  it('falls back to the static list when the KV read throws', async () => {
    kv.get.mockRejectedValue(new Error('KV unreachable'))
    const res = mockRes()
    await handleTeamsList({}, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.teams.length).toBeGreaterThan(0)
  })

  it('sets a CDN-cacheable Cache-Control header', async () => {
    kv.get.mockResolvedValue(null)
    const res = mockRes()
    await handleTeamsList({}, res)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('s-maxage'))
  })
})

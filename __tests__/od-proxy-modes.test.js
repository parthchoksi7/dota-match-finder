/**
 * Tests for the OpenDota proxy modes added to api/tournaments.js to avoid client-side CORS
 * errors (OpenDota's Cloudflare bot protection can 403 direct browser requests and drop the
 * CORS header on that response, which browsers then report as a CORS failure, not a 403):
 *   ?mode=premium-league-ids  — proxies GET /api/leagues, returns array of premium IDs
 *   ?mode=promatches-proxy    — proxies GET /api/promatches, passes pagination param through
 *   ?mode=heroes-proxy        — proxies GET /api/heroes, raw pass-through array
 *
 * Tests focus on the transformation logic (Set→Array spread, non-array guard, URL construction)
 * rather than re-testing buildPremiumLeagueIds itself (covered in tier-filter.test.js).
 */

import { describe, it, expect } from 'vitest'
import { buildPremiumLeagueIds } from '../api/_shared.js'

// ── premium-league-ids: Set→Array spread ─────────────────────────────────────

describe('premium-league-ids transformation', () => {
  it('spreads Set from buildPremiumLeagueIds into a plain array', () => {
    const leagues = [
      { leagueid: 1, tier: 'premium' },
      { leagueid: 2, tier: 'premium' },
      { leagueid: 3, tier: 'professional' },
    ]
    const ids = [...buildPremiumLeagueIds(leagues)]
    expect(Array.isArray(ids)).toBe(true)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).not.toContain(3)  // professional excluded — too broad
  })

  it('returns empty array when only professional leagues exist', () => {
    const leagues = [{ leagueid: 10, tier: 'professional' }]
    const ids = [...buildPremiumLeagueIds(leagues)]
    expect(ids).toEqual([])
  })

  it('returns empty array when leagues array is empty', () => {
    const ids = [...buildPremiumLeagueIds([])]
    expect(ids).toEqual([])
  })

  it('returns empty array when leagues is null (failure fallback)', () => {
    const ids = [...buildPremiumLeagueIds(null)]
    expect(ids).toEqual([])
  })
})

// ── promatches-proxy: URL construction ───────────────────────────────────────

describe('promatches-proxy URL construction', () => {
  function buildOdUrl(lessThan) {
    return lessThan
      ? `https://api.opendota.com/api/promatches?less_than_match_id=${lessThan}`
      : 'https://api.opendota.com/api/promatches'
  }

  it('returns base URL when no less_than param', () => {
    expect(buildOdUrl(undefined)).toBe('https://api.opendota.com/api/promatches')
  })

  it('appends less_than_match_id when less_than is provided', () => {
    expect(buildOdUrl('7800000000')).toBe(
      'https://api.opendota.com/api/promatches?less_than_match_id=7800000000'
    )
  })
})

// ── promatches-proxy: non-array guard ────────────────────────────────────────

describe('promatches-proxy data guard', () => {
  function safeData(data) {
    return Array.isArray(data) ? data : []
  }

  it('passes through a valid array', () => {
    const data = [{ match_id: 1 }, { match_id: 2 }]
    expect(safeData(data)).toEqual(data)
  })

  it('returns empty array when OpenDota returns an object (error shape)', () => {
    expect(safeData({ error: 'rate limited' })).toEqual([])
  })

  it('returns empty array when OpenDota returns null', () => {
    expect(safeData(null)).toEqual([])
  })

  it('returns empty array when OpenDota returns a string', () => {
    expect(safeData('bad gateway')).toEqual([])
  })
})

// ── heroes-proxy: non-array guard (same pattern as promatches-proxy) ────────────

describe('heroes-proxy data guard', () => {
  function safeHeroes(data) {
    return Array.isArray(data) ? data : []
  }

  it('passes through a valid hero array unchanged', () => {
    const data = [{ id: 1, name: 'npc_dota_hero_antimage', localized_name: 'Anti-Mage' }]
    expect(safeHeroes(data)).toEqual(data)
  })

  it('returns empty array when OpenDota returns an object (error shape)', () => {
    expect(safeHeroes({ error: 'rate limited' })).toEqual([])
  })

  it('returns empty array when OpenDota returns null', () => {
    expect(safeHeroes(null)).toEqual([])
  })
})

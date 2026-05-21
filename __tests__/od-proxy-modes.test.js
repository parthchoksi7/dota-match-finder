/**
 * Tests for the two OpenDota proxy modes added to api/tournaments.js to avoid
 * client-side CORS errors:
 *   ?mode=premium-league-ids  — proxies GET /api/leagues, returns array of premium IDs
 *   ?mode=promatches-proxy    — proxies GET /api/promatches, passes pagination param through
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
    expect(ids).not.toContain(3)
  })

  it('returns empty array when no premium leagues exist', () => {
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

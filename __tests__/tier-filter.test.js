/**
 * Unit tests for tier-based filtering functions in api/_shared.js.
 *
 * isTier1            - checks a PandaScore match/tournament object by league.tier ('s' or 'a')
 * buildPremiumLeagueIds - builds a Set of OpenDota league IDs for 'premium' and 'professional' tiers
 *
 * Both are pure functions with no external dependencies or mocking required.
 *
 * Background:
 *   PandaScore tier 's' = elite international LANs (TI, DreamLeague, ESL One, PGL, BLAST, ...)
 *   PandaScore tier 'a' = second-tier professional events (ESL Challenger, regional circuits, ...)
 *   OpenDota 'premium'      = Valve-sponsored DPC events (equivalent of PandaScore tier s)
 *   OpenDota 'professional' = second-tier pro events    (equivalent of PandaScore tier a)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { isTier1, isTier1ByFields, buildPremiumLeagueIds, fetchByTiers } from '../api/_shared.js'

// ── isTier1 (PandaScore match / tournament objects) ──────────────────────────

describe('isTier1', () => {
  describe('positive cases - tier s and a', () => {
    it('returns true for a match with league.tier === "s"', () => {
      expect(isTier1({ league: { tier: 's' } })).toBe(true)
    })

    it('returns true for a match with league.tier === "a"', () => {
      expect(isTier1({ league: { tier: 'a' } })).toBe(true)
    })

    it('is case-insensitive (accepts uppercase "S")', () => {
      expect(isTier1({ league: { tier: 'S' } })).toBe(true)
    })

    it('is case-insensitive (accepts uppercase "A")', () => {
      expect(isTier1({ league: { tier: 'A' } })).toBe(true)
    })

    it('works with a full tier-s match object that has extra fields', () => {
      const match = {
        id: 123,
        league: { id: 1, name: 'DreamLeague', tier: 's' },
        serie: { full_name: 'DreamLeague Season 25' },
        opponents: [],
      }
      expect(isTier1(match)).toBe(true)
    })

    it('works with a full tier-a match object that has extra fields', () => {
      const match = {
        id: 456,
        league: { id: 2, name: 'ESL Challenger', tier: 'a' },
        serie: { full_name: 'ESL Challenger Season 1' },
        opponents: [],
      }
      expect(isTier1(match)).toBe(true)
    })
  })

  describe('negative cases - tiers below a', () => {
    it('returns false for tier "b"', () => {
      expect(isTier1({ league: { tier: 'b' } })).toBe(false)
    })

    it('returns false for tier "unranked"', () => {
      expect(isTier1({ league: { tier: 'unranked' } })).toBe(false)
    })
  })

  describe('missing / null / undefined inputs', () => {
    it('returns false when the match itself is null', () => {
      expect(isTier1(null)).toBe(false)
    })

    it('returns false when the match is undefined', () => {
      expect(isTier1(undefined)).toBe(false)
    })

    it('returns false when league is missing from the match', () => {
      expect(isTier1({})).toBe(false)
    })

    it('returns false when league is null', () => {
      expect(isTier1({ league: null })).toBe(false)
    })

    it('returns false when league.tier is null', () => {
      expect(isTier1({ league: { tier: null } })).toBe(false)
    })

    it('returns false when league.tier is an empty string', () => {
      expect(isTier1({ league: { tier: '' } })).toBe(false)
    })
  })

  describe('filtering a list of matches', () => {
    it('correctly keeps tier-s and tier-a matches, excludes lower tiers', () => {
      const matches = [
        { id: 1, league: { tier: 's' } },
        { id: 2, league: { tier: 'a' } },
        { id: 3, league: { tier: 'b' } },
        { id: 4, league: null },
        { id: 5 },
      ]
      const result = matches.filter(isTier1).map(m => m.id)
      expect(result).toEqual([1, 2])
    })

    it('returns an empty array when no matches are tier s or a', () => {
      const matches = [
        { id: 1, league: { tier: 'b' } },
        { id: 2, league: { tier: 'unranked' } },
      ]
      expect(matches.filter(isTier1)).toHaveLength(0)
    })
  })
})

// ── isTier1ByFields (core tier decision — used by both match and tournament adapters) ──

describe('isTier1ByFields', () => {
  describe('tier-based acceptance', () => {
    it('returns true for tier "s"', () => {
      expect(isTier1ByFields('s', null)).toBe(true)
    })

    it('returns true for tier "a"', () => {
      expect(isTier1ByFields('a', null)).toBe(true)
    })

    it('is case-insensitive for tier', () => {
      expect(isTier1ByFields('S', null)).toBe(true)
      expect(isTier1ByFields('A', null)).toBe(true)
    })
  })

  describe('league-name keyword override (for misclassified qualifier stages of major events)', () => {
    it('returns true for league "DreamLeague Season 29 Qualifiers" even with a lower API tier', () => {
      expect(isTier1ByFields('b', 'DreamLeague Season 29 Qualifiers')).toBe(true)
    })

    it('returns true for league "PGL Wallachia" with a lower API tier', () => {
      expect(isTier1ByFields('b', 'PGL Wallachia')).toBe(true)
    })

    it('returns true for league "BLAST Slam" with a lower API tier', () => {
      expect(isTier1ByFields('b', 'BLAST Slam')).toBe(true)
    })

    it('returns true for league "WePlay Academy League" with a lower API tier', () => {
      expect(isTier1ByFields('b', 'WePlay Academy League')).toBe(true)
    })

    it('returns true for league "ESL One Malaysia" with a lower API tier', () => {
      expect(isTier1ByFields('b', 'ESL One Malaysia')).toBe(true)
    })

    it('returns true for league "The International" with a lower API tier', () => {
      expect(isTier1ByFields('b', 'The International')).toBe(true)
    })

    it('returns true when tier is null/missing but league name matches a known brand', () => {
      expect(isTier1ByFields(null, 'DreamLeague')).toBe(true)
    })

    it('keyword match is case-insensitive', () => {
      expect(isTier1ByFields('b', 'DREAMLEAGUE Season 29')).toBe(true)
    })
  })

  describe('rejection — no tier and no keyword match', () => {
    it('returns false for a lower API tier with an unrecognised league name', () => {
      expect(isTier1ByFields('b', 'random amateur league')).toBe(false)
    })

    it('returns false for a lower API tier with null league name', () => {
      expect(isTier1ByFields('b', null)).toBe(false)
    })

    it('returns false for null tier and null league name', () => {
      expect(isTier1ByFields(null, null)).toBe(false)
    })

    it('returns false for an empty tier and non-matching league name', () => {
      expect(isTier1ByFields('', 'Epic League')).toBe(false)
    })
  })

  describe('isTier1 match adapter uses isTier1ByFields — league-name override via match object', () => {
    it('returns true for a match with a lower tournament tier but known league name', () => {
      const match = {
        tournament: { tier: 'b' },
        league: { name: 'DreamLeague Season 29 Qualifiers' },
      }
      expect(isTier1(match)).toBe(true)
    })

    it('returns false for a match with a lower tournament tier and unknown league name', () => {
      const match = {
        tournament: { tier: 'b' },
        league: { name: 'Amateur Open 2026' },
      }
      expect(isTier1(match)).toBe(false)
    })
  })
})

// ── buildPremiumLeagueIds (OpenDota league list → Set<leagueid>) ─────────────

describe('buildPremiumLeagueIds', () => {
  describe('correct filtering', () => {
    it('returns a Set containing premium and professional tier league IDs', () => {
      const leagues = [
        { leagueid: 1, tier: 'premium', name: 'The International 2025' },
        { leagueid: 2, tier: 'professional', name: 'BetBoom Dacha' },
        { leagueid: 3, tier: 'premium', name: 'DreamLeague Season 25' },
        { leagueid: 4, tier: 'amateur', name: 'Amateur Open' },
        { leagueid: 5, tier: 'excluded', name: 'Excluded League' },
      ]
      const ids = buildPremiumLeagueIds(leagues)

      expect(ids).toBeInstanceOf(Set)
      expect(ids.size).toBe(3)
      expect(ids.has(1)).toBe(true)
      expect(ids.has(2)).toBe(true)
      expect(ids.has(3)).toBe(true)
    })

    it('includes professional tier (ESL Challenger, regional pro circuits)', () => {
      const leagues = [
        { leagueid: 10, tier: 'professional' },
      ]
      const ids = buildPremiumLeagueIds(leagues)
      expect(ids.has(10)).toBe(true)
    })

    it('excludes amateur and excluded tiers', () => {
      const leagues = [
        { leagueid: 20, tier: 'amateur' },
        { leagueid: 30, tier: 'excluded' },
      ]
      const ids = buildPremiumLeagueIds(leagues)
      expect(ids.has(20)).toBe(false)
      expect(ids.has(30)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('returns an empty Set for an empty array', () => {
      expect(buildPremiumLeagueIds([])).toEqual(new Set())
    })

    it('returns an empty Set for null', () => {
      expect(buildPremiumLeagueIds(null)).toEqual(new Set())
    })

    it('returns an empty Set for undefined', () => {
      expect(buildPremiumLeagueIds(undefined)).toEqual(new Set())
    })

    it('returns an empty Set when no leagues are premium or professional', () => {
      const leagues = [
        { leagueid: 1, tier: 'amateur' },
        { leagueid: 2, tier: 'excluded' },
      ]
      expect(buildPremiumLeagueIds(leagues)).toEqual(new Set())
    })

    it('handles leagues with missing tier gracefully', () => {
      const leagues = [
        { leagueid: 1 },
        { leagueid: 2, tier: null },
        { leagueid: 3, tier: 'premium' },
      ]
      const ids = buildPremiumLeagueIds(leagues)
      expect(ids.size).toBe(1)
      expect(ids.has(3)).toBe(true)
    })
  })

  describe('used to filter OpenDota promatches', () => {
    it('filters promatches to include both premium and professional leagues', () => {
      const leagues = [
        { leagueid: 100, tier: 'premium' },
        { leagueid: 200, tier: 'professional' },
        { leagueid: 300, tier: 'amateur' },
      ]
      const premiumIds = buildPremiumLeagueIds(leagues)

      const promatches = [
        { match_id: 1, leagueid: 100 },
        { match_id: 2, leagueid: 200 },
        { match_id: 3, leagueid: 300 },
        { match_id: 4, leagueid: 999 },
      ]

      const filtered = promatches.filter(m => premiumIds.has(m.leagueid))
      expect(filtered.map(m => m.match_id)).toEqual([1, 2])
    })

    it('excludes promatches from amateur and unknown leagues', () => {
      const leagues = [{ leagueid: 100, tier: 'premium' }]
      const premiumIds = buildPremiumLeagueIds(leagues)
      const promatches = [
        { match_id: 1, leagueid: 999 },
        { match_id: 2, leagueid: 888 },
      ]
      expect(promatches.filter(m => premiumIds.has(m.leagueid))).toHaveLength(0)
    })
  })
})

// ── fetchByTiers (PandaScore dual-tier fetch helper) ─────────────────────────
//
// These tests catch the bug where filter[tier]=s,a was used instead of two
// separate requests. PandaScore treats comma-separated values as a literal
// string, returning zero results. The fix fires two parallel requests and merges.

describe('fetchByTiers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function okResponse(data) {
    return { ok: true, status: 200, json: () => Promise.resolve(data) }
  }

  function errResponse(status = 503) {
    return { ok: false, status }
  }

  describe('fetch URL construction - must NOT use comma-separated filter values', () => {
    it('fires exactly two fetch calls for a single fetchByTiers call', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse([]))
      vi.stubGlobal('fetch', mockFetch)

      await fetchByTiers('https://api.pandascore.co/dota2/tournaments/upcoming?sort=begin_at&page[size]=10', {})

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('calls fetch with filter[tier]=s in the first request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse([]))
      vi.stubGlobal('fetch', mockFetch)

      await fetchByTiers('https://api.pandascore.co/dota2/series/upcoming?sort=begin_at&page[size]=20', {})

      expect(mockFetch.mock.calls[0][0]).toContain('filter[tier]=s')
    })

    it('calls fetch with filter[tier]=a in the second request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse([]))
      vi.stubGlobal('fetch', mockFetch)

      await fetchByTiers('https://api.pandascore.co/dota2/series/upcoming?sort=begin_at&page[size]=20', {})

      expect(mockFetch.mock.calls[1][0]).toContain('filter[tier]=a')
    })

    it('never uses a comma-separated filter value like filter[tier]=s,a', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse([]))
      vi.stubGlobal('fetch', mockFetch)

      await fetchByTiers('https://api.pandascore.co/dota2/tournaments/upcoming?sort=begin_at&page[size]=10', {})

      for (const call of mockFetch.mock.calls) {
        expect(call[0]).not.toMatch(/filter\[tier\]=.*,/)
      }
    })
  })

  describe('result merging', () => {
    it('combines results from both tier requests into one array', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(okResponse([{ id: 1 }, { id: 2 }]))
        .mockResolvedValueOnce(okResponse([{ id: 3 }]))
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      expect(result.map(r => r.id)).toEqual([1, 2, 3])
    })

    it('deduplicates entries with the same id appearing in both responses', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(okResponse([{ id: 1 }, { id: 2 }]))
        .mockResolvedValueOnce(okResponse([{ id: 2 }, { id: 3 }]))
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      expect(result).toHaveLength(3)
      expect(result.map(r => r.id)).toEqual([1, 2, 3])
    })

    it('returns empty array when both responses return empty arrays', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse([]))
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      expect(result).toEqual([])
    })

    it('treats a non-array API response as empty (does not throw)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(okResponse({ error: 'unexpected' }))
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      expect(result).toEqual([])
    })
  })

  describe('error handling', () => {
    it('returns only the successful tier results when one request fails', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(errResponse(503))
        .mockResolvedValueOnce(okResponse([{ id: 10 }]))
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(10)
    })

    it('throws if both tier requests fail so callers do not cache empty results', async () => {
      const mockFetch = vi.fn().mockResolvedValue(errResponse(503))
      vi.stubGlobal('fetch', mockFetch)

      await expect(
        fetchByTiers('https://example.com/tournaments?sort=begin_at', {})
      ).rejects.toThrow('PandaScore tier fetch failed')
    })
  })
})

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
import { isTier1, isTier1ByFields, isTier1ByName, buildPremiumLeagueIds, fetchByTiers, PERMANENT_TIER1_NAMES } from '../api/_shared.js'
import { matchesTier1Names } from '../src/utils.js'

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

// ── matchesTier1Names (PandaScore name filter for OpenDota promatches) ────────

describe('matchesTier1Names', () => {
  const names = ['dreamleague', 'esl one', 'pgl wallachia', 'blast']

  describe('positive matches', () => {
    it('returns true when league_name contains a tier1 name', () => {
      expect(matchesTier1Names('DreamLeague Season 25', names)).toBe(true)
      expect(matchesTier1Names('ESL One Bangkok 2025', names)).toBe(true)
      expect(matchesTier1Names('PGL Wallachia Season 8', names)).toBe(true)
      expect(matchesTier1Names('BLAST Slam VII', names)).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(matchesTier1Names('DREAMLEAGUE SEASON 25', names)).toBe(true)
      expect(matchesTier1Names('esl one birmingham 2026', names)).toBe(true)
    })

    it('matches when league name appears in the middle of a longer string', () => {
      expect(matchesTier1Names('Valve The International 2025', ['the international'])).toBe(true)
    })
  })

  describe('negative matches', () => {
    it('returns false for non-matching lower-tier leagues', () => {
      expect(matchesTier1Names('BetBoom Dacha', names)).toBe(false)
      expect(matchesTier1Names('BTS Pro Series', names)).toBe(false)
      expect(matchesTier1Names('Dota 2 Champions League', names)).toBe(false)
    })

    it('does not false-positive on a league that contains "esl" but not "esl one"', () => {
      expect(matchesTier1Names('ESL Meisterschaft', names)).toBe(false)
      expect(matchesTier1Names('ESL Amateur Open', names)).toBe(false)
    })
  })

  describe('min-length guard (names shorter than 4 chars are skipped)', () => {
    it('treats a list of only short names as effectively empty, returning null', () => {
      const shortNames = ['esl', 'pgl']  // both 3 chars
      expect(matchesTier1Names('ESL One Bangkok', shortNames)).toBe(null)
    })

    it('uses valid long names and ignores short names in a mixed list', () => {
      const mixed = ['esl', 'dreamleague']  // 'esl' skipped, 'dreamleague' used
      expect(matchesTier1Names('DreamLeague Season 25', mixed)).toBe(true)
      expect(matchesTier1Names('ESL One Bangkok', mixed)).toBe(false)
    })
  })

  describe('fallback sentinel: returns null when names list is empty or absent', () => {
    it('returns null for an empty array', () => {
      expect(matchesTier1Names('DreamLeague Season 25', [])).toBe(null)
    })

    it('returns null for null', () => {
      expect(matchesTier1Names('DreamLeague Season 25', null)).toBe(null)
    })

    it('returns null for undefined', () => {
      expect(matchesTier1Names('DreamLeague Season 25', undefined)).toBe(null)
    })
  })

  describe('graceful handling of bad leagueName input', () => {
    it('returns false (not null or throw) for null leagueName', () => {
      expect(matchesTier1Names(null, names)).toBe(false)
    })

    it('returns false for undefined leagueName', () => {
      expect(matchesTier1Names(undefined, names)).toBe(false)
    })

    it('returns false for empty string leagueName', () => {
      expect(matchesTier1Names('', names)).toBe(false)
    })
  })

  describe('integration: used to filter OpenDota promatches', () => {
    it('correctly keeps tier1 matches and drops lower-tier ones', () => {
      const tier1Names = ['dreamleague', 'esl one', 'pgl wallachia']
      const promatches = [
        { match_id: 1, league_name: 'DreamLeague Season 25' },
        { match_id: 2, league_name: 'ESL One Bangkok 2025' },
        { match_id: 3, league_name: 'BetBoom Dacha' },
        { match_id: 4, league_name: 'Dota 2 Champions League' },
        { match_id: 5, league_name: 'PGL Wallachia Season 8' },
      ]
      const filtered = promatches.filter(m => matchesTier1Names(m.league_name, tier1Names) === true)
      expect(filtered.map(m => m.match_id)).toEqual([1, 2, 5])
    })

    it('falls back correctly when tier1Names is empty (null sentinel)', () => {
      // Simulate: PandaScore unavailable, use OpenDota premiumIds instead
      const tier1Names = []
      const premiumIds = new Set([100, 200])
      const promatches = [
        { match_id: 1, league_name: 'DreamLeague Season 25', leagueid: 100 },
        { match_id: 2, league_name: 'Some Amateur League', leagueid: 300 },
      ]
      const filtered = promatches.filter(m => {
        const nameMatch = matchesTier1Names(m.league_name, tier1Names)
        if (nameMatch !== null) return nameMatch
        return premiumIds.has(m.leagueid)
      })
      expect(filtered.map(m => m.match_id)).toEqual([1])
    })
  })
})

// ── PERMANENT_TIER1_NAMES (hardcoded fallback list in api/_shared.js) ─────────
//
// These tests verify the export itself and the cold-KV merge pattern used in
// live-matches.js and upcoming-matches.js. The merge ensures DreamLeague
// qualifier matches (tournament.tier = "c") always pass isTier1ByName even
// when KV_TIER1_NAMES_KEY has never been populated.

describe('PERMANENT_TIER1_NAMES', () => {
  describe('export shape', () => {
    it('is exported as a non-empty array', () => {
      expect(Array.isArray(PERMANENT_TIER1_NAMES)).toBe(true)
      expect(PERMANENT_TIER1_NAMES.length).toBeGreaterThan(0)
    })

    it('includes DreamLeague', () => {
      expect(PERMANENT_TIER1_NAMES).toContain('DreamLeague')
    })

    it('includes ESL One', () => {
      expect(PERMANENT_TIER1_NAMES).toContain('ESL One')
    })

    it('all names except the known 3-char "PGL" exception are at least 4 chars (isTier1ByName guard)', () => {
      // "PGL" is 3 chars and will be skipped by isTier1ByName's n.length >= 4 guard.
      // PGL matches rely on the KV cache being warm. All other hardcoded names meet the guard.
      const shortNames = PERMANENT_TIER1_NAMES.filter(n => n.length < 4)
      expect(shortNames).toEqual(['PGL'])
    })
  })

  describe('cold-KV fallback: isTier1ByName with hardcoded names', () => {
    it('returns true for a DreamLeague qualifier match with tournament.tier="c" when using hardcoded names', () => {
      const match = { league: { name: 'DreamLeague' }, tournament: { tier: 'c' } }
      const names = PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
      expect(isTier1ByName(match, names)).toBe(true)
    })

    it('returns false for a non-tier1 league even with hardcoded names', () => {
      const match = { league: { name: 'Some Amateur Open' }, tournament: { tier: 'c' } }
      const names = PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
      expect(isTier1ByName(match, names)).toBe(false)
    })

    it('merged array always contains dreamleague when KV is cold (null)', () => {
      const kvNames = null
      const merged = [...new Set([
        ...(Array.isArray(kvNames) ? kvNames.map(n => n.toLowerCase()) : []),
        ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
      ])]
      expect(merged).toContain('dreamleague')
    })

    it('merged array deduplicates when KV already contains the same names', () => {
      const kvNames = ['DreamLeague', 'ESL One', 'SomeDynamicLeague']
      const merged = [...new Set([
        ...kvNames.map(n => n.toLowerCase()),
        ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
      ])]
      const count = merged.filter(n => n === 'dreamleague').length
      expect(count).toBe(1)
    })

    it('isTier1 now returns true for known league names even with a lower API tier (TIER1_LEAGUE_KEYWORDS override); isTier1ByName remains an additional path for dynamic name lists', () => {
      const match = { league: { name: 'DreamLeague', tier: null }, tournament: { tier: 'c' } }
      // isTier1 now returns true because 'dreamleague' is in TIER1_LEAGUE_KEYWORDS
      expect(isTier1(match)).toBe(true)
      // isTier1ByName also returns true for the same reason (dynamic name list path)
      const names = PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
      expect(isTier1ByName(match, names)).toBe(true)
      // Combined guard still passes
      expect(isTier1(match) || isTier1ByName(match, names)).toBe(true)
    })
  })
})

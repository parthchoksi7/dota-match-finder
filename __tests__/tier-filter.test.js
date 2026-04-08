/**
 * Unit tests for tier-based filtering functions in api/_shared.js.
 *
 * isTier1            — checks a PandaScore match/tournament object by league.tier === 's'
 * buildPremiumLeagueIds — builds a Set of OpenDota premium league IDs from the leagues list
 *
 * Both are pure functions with no external dependencies or mocking required.
 *
 * Background:
 *   PandaScore tier 's' = elite international LANs (TI, DreamLeague, ESL One, PGL, BLAST, …)
 *   OpenDota 'premium'  = Valve-sponsored DPC events — the direct equivalent of PandaScore tier s
 */

import { describe, it, expect } from 'vitest'
import { isTier1, buildPremiumLeagueIds } from '../api/_shared.js'

// ── isTier1 (PandaScore match / tournament objects) ──────────────────────────

describe('isTier1', () => {
  describe('positive cases — tier s', () => {
    it('returns true for a match with league.tier === "s"', () => {
      expect(isTier1({ league: { tier: 's' } })).toBe(true)
    })

    it('is case-insensitive (accepts uppercase "S")', () => {
      expect(isTier1({ league: { tier: 'S' } })).toBe(true)
    })

    it('works with a full match object that has extra fields', () => {
      const match = {
        id: 123,
        league: { id: 1, name: 'DreamLeague', tier: 's' },
        serie: { full_name: 'DreamLeague Season 25' },
        opponents: [],
      }
      expect(isTier1(match)).toBe(true)
    })
  })

  describe('negative cases — non-s tiers', () => {
    it('returns false for tier "a" (second professional tier)', () => {
      expect(isTier1({ league: { tier: 'a' } })).toBe(false)
    })

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
    it('correctly keeps only tier-s matches', () => {
      const matches = [
        { id: 1, league: { tier: 's' } },
        { id: 2, league: { tier: 'a' } },
        { id: 3, league: { tier: 's' } },
        { id: 4, league: null },
        { id: 5 },
      ]
      const result = matches.filter(isTier1).map(m => m.id)
      expect(result).toEqual([1, 3])
    })

    it('returns an empty array when no matches are tier s', () => {
      const matches = [
        { id: 1, league: { tier: 'a' } },
        { id: 2, league: { tier: 'b' } },
      ]
      expect(matches.filter(isTier1)).toHaveLength(0)
    })
  })
})

// ── buildPremiumLeagueIds (OpenDota league list → Set<leagueid>) ─────────────

describe('buildPremiumLeagueIds', () => {
  describe('correct filtering', () => {
    it('returns a Set containing only premium-tier league IDs', () => {
      const leagues = [
        { leagueid: 1, tier: 'premium', name: 'The International 2025' },
        { leagueid: 2, tier: 'professional', name: 'BetBoom Dacha' },
        { leagueid: 3, tier: 'premium', name: 'DreamLeague Season 25' },
        { leagueid: 4, tier: 'amateur', name: 'Amateur Open' },
        { leagueid: 5, tier: 'excluded', name: 'Excluded League' },
      ]
      const ids = buildPremiumLeagueIds(leagues)

      expect(ids).toBeInstanceOf(Set)
      expect(ids.size).toBe(2)
      expect(ids.has(1)).toBe(true)
      expect(ids.has(3)).toBe(true)
    })

    it('excludes professional, amateur, and excluded tiers', () => {
      const leagues = [
        { leagueid: 10, tier: 'professional' },
        { leagueid: 20, tier: 'amateur' },
        { leagueid: 30, tier: 'excluded' },
      ]
      const ids = buildPremiumLeagueIds(leagues)
      expect(ids.has(10)).toBe(false)
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

    it('returns an empty Set when no leagues have premium tier', () => {
      const leagues = [
        { leagueid: 1, tier: 'professional' },
        { leagueid: 2, tier: 'amateur' },
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
    it('filters promatches by leagueid membership', () => {
      const leagues = [
        { leagueid: 100, tier: 'premium' },
        { leagueid: 200, tier: 'professional' },
        { leagueid: 300, tier: 'premium' },
      ]
      const premiumIds = buildPremiumLeagueIds(leagues)

      const promatches = [
        { match_id: 1, leagueid: 100 },
        { match_id: 2, leagueid: 200 },
        { match_id: 3, leagueid: 300 },
        { match_id: 4, leagueid: 999 },
      ]

      const filtered = promatches.filter(m => premiumIds.has(m.leagueid))
      expect(filtered.map(m => m.match_id)).toEqual([1, 3])
    })

    it('returns no matches when no promatches belong to premium leagues', () => {
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

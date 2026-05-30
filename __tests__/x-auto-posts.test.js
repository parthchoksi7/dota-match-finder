/**
 * Unit tests for the auto-post pure functions in api/draft-posts.js:
 * buildDigestTweet and buildPollTweet.
 */

import { describe, it, expect } from 'vitest'
import { buildDigestTweet, buildPollTweet } from '../api/draft-posts.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch({ teamA = 'Team Spirit', teamB = 'Team Liquid', scheduledAt = '2026-05-29T14:00:00Z', matchType = 'best_of_3', leagueName = 'DreamLeague', serieName = 'S25', handleA = 'TSpirit_Dota2', handleB = 'teamliquiddota' } = {}) {
  return {
    opponents: [
      { opponent: { name: teamA } },
      { opponent: { name: teamB } },
    ],
    scheduled_at: scheduledAt,
    match_type: matchType,
    number_of_games: null,
    league: { name: leagueName, tier: 's' },
    serie: { name: serieName, full_name: `${leagueName} ${serieName}` },
    tournament: { tier: 's' },
    // _handleA/_handleB are not real PandaScore fields — used by buildPollTweet
    // which calls lookupTeamHandle(). We test this by using team names that are in
    // the _x-accounts.js lookup table rather than injecting handles directly.
  }
}

// ── buildDigestTweet ─────────────────────────────────────────────────────────

describe('buildDigestTweet', () => {
  it('formats a single match correctly', () => {
    const matches = [makeMatch()]
    const tweet = buildDigestTweet(matches)
    expect(tweet).toContain('Today in pro Dota:')
    expect(tweet).toContain('14:00 UTC — Team Spirit vs Team Liquid')
    expect(tweet).toContain('DreamLeague')
    expect(tweet).toContain('BO3')
    expect(tweet).toContain('spectateesports.live/calendar')
    expect(tweet).not.toMatch(/https?:\/\//)
  })

  it('formats multiple matches as a list', () => {
    const matches = [
      makeMatch({ scheduledAt: '2026-05-29T14:00:00Z', teamA: 'Team Spirit', teamB: 'Team Liquid' }),
      makeMatch({ scheduledAt: '2026-05-29T17:30:00Z', teamA: 'Tundra Esports', teamB: 'OG' }),
    ]
    const tweet = buildDigestTweet(matches)
    expect(tweet).toContain('14:00 UTC — Team Spirit vs Team Liquid')
    expect(tweet).toContain('17:30 UTC — Tundra Esports vs OG')
  })

  it('truncates to 280 chars with +N more suffix when too many matches', () => {
    const matches = Array.from({ length: 10 }, (_, i) =>
      makeMatch({
        teamA: `Very Long Team Name Alpha ${i}`,
        teamB: `Very Long Team Name Beta ${i}`,
        scheduledAt: `2026-05-29T${String(10 + i).padStart(2, '0')}:00:00Z`,
      })
    )
    const tweet = buildDigestTweet(matches)
    expect(tweet.length).toBeLessThanOrEqual(280)
    expect(tweet).toMatch(/\+\d+ more/)
  })

  it('stays within 280 chars for a typical 3-match day', () => {
    const matches = [
      makeMatch({ scheduledAt: '2026-05-29T12:00:00Z', teamA: 'Natus Vincere', teamB: 'Virtus.pro' }),
      makeMatch({ scheduledAt: '2026-05-29T15:00:00Z', teamA: 'Aurora Gaming', teamB: 'Team Secret' }),
      makeMatch({ scheduledAt: '2026-05-29T18:00:00Z', teamA: 'BetBoom Team', teamB: 'OG' }),
    ]
    const tweet = buildDigestTweet(matches)
    expect(tweet.length).toBeLessThanOrEqual(280)
    expect(tweet).not.toMatch(/\+\d+ more/)
  })

  it('includes BO1 and BO5 series labels correctly', () => {
    const bo1 = buildDigestTweet([makeMatch({ matchType: 'best_of_1' })])
    expect(bo1).toContain('BO1')
    const bo5 = buildDigestTweet([makeMatch({ matchType: 'best_of_5' })])
    expect(bo5).toContain('BO5')
  })

  it('zero-pads single-digit hours', () => {
    const tweet = buildDigestTweet([makeMatch({ scheduledAt: '2026-05-29T09:05:00Z' })])
    expect(tweet).toContain('09:05 UTC')
  })

  it('returns a string even for one match', () => {
    const tweet = buildDigestTweet([makeMatch()])
    expect(typeof tweet).toBe('string')
    expect(tweet.length).toBeGreaterThan(0)
  })
})

// ── buildPollTweet ───────────────────────────────────────────────────────────

describe('buildPollTweet', () => {
  it('returns null when teamA handle is unknown', () => {
    const m = makeMatch({ teamA: 'Unknown Team XYZ', teamB: 'Team Spirit' })
    expect(buildPollTweet(m)).toBeNull()
  })

  it('returns null when teamB handle is unknown', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Unknown Team XYZ' })
    expect(buildPollTweet(m)).toBeNull()
  })

  it('returns null when both handles are unknown', () => {
    const m = makeMatch({ teamA: 'Team ABC', teamB: 'Team XYZ' })
    expect(buildPollTweet(m)).toBeNull()
  })

  it('returns text and options when both handles are known', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Team Liquid' })
    const result = buildPollTweet(m)
    expect(result).not.toBeNull()
    expect(result.text).toContain('@TSpirit_Dota2')
    expect(result.text).toContain('@teamliquiddota')
    expect(result.text).toContain('who takes it?')
    expect(result.options).toEqual(['Team Spirit', 'Team Liquid'])
  })

  it('includes tournament name in text', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Team Liquid' })
    const result = buildPollTweet(m)
    expect(result.text).toContain('DreamLeague')
  })

  it('includes series format in text', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Team Liquid', matchType: 'best_of_3' })
    const result = buildPollTweet(m)
    expect(result.text).toContain('BO3')
  })

  it('includes site URL without http/https', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Team Liquid' })
    const result = buildPollTweet(m)
    expect(result.text).toContain('spectateesports.live/calendar')
    expect(result.text).not.toMatch(/https?:\/\//)
  })

  it('poll options match the real team names (not handles)', () => {
    const m = makeMatch({ teamA: 'Team Spirit', teamB: 'Tundra Esports' })
    const result = buildPollTweet(m)
    expect(result).not.toBeNull()
    expect(result.options[0]).toBe('Team Spirit')
    expect(result.options[1]).toBe('Tundra Esports')
  })
})

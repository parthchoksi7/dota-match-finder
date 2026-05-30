/**
 * Unit tests for reply-insertion pure functions in api/draft-posts.js:
 * extractTeamsFromTweet and isResultTweet.
 */

import { describe, it, expect } from 'vitest'
import { extractTeamsFromTweet, isResultTweet } from '../api/draft-posts.js'

// ── isResultTweet ─────────────────────────────────────────────────────────────

describe('isResultTweet', () => {
  it('detects 2-0 score', () => {
    expect(isResultTweet('Team Spirit sweep Tundra 2-0 in the UB Final')).toBe(true)
  })

  it('detects 2-1 score', () => {
    expect(isResultTweet('Spirit def. Liquid 2-1 | Upper Bracket Semifinal')).toBe(true)
  })

  it('detects 1-0 score', () => {
    expect(isResultTweet('OG take Game 1, now leading 1-0')).toBe(true)
  })

  it('detects 0-2 score (from loser perspective)', () => {
    expect(isResultTweet('Aurora eliminated 0-2 by Spirit')).toBe(true)
  })

  it('detects 3-2 score (BO5 final)', () => {
    expect(isResultTweet('Spirit win the Grand Final 3-2 over Liquid')).toBe(true)
  })

  it('rejects a pre-match announcement with no score', () => {
    expect(isResultTweet('Spirit vs Liquid in the Upper Bracket Final! Who takes it?')).toBe(false)
  })

  it('rejects a schedule tweet', () => {
    expect(isResultTweet('Today at 14:00 UTC: Spirit vs OG | BLAST Slam S7')).toBe(false)
  })

  it('rejects standalone ordinal numbers', () => {
    expect(isResultTweet('Team Spirit win their 2nd consecutive championship')).toBe(false)
  })

  it('rejects text with hyphenated words that are not scores', () => {
    expect(isResultTweet('Best-of-three series starts tomorrow')).toBe(false)
  })
})

// ── extractTeamsFromTweet ─────────────────────────────────────────────────────

describe('extractTeamsFromTweet', () => {
  it('extracts full team names (Team Spirit, Team Liquid)', () => {
    const teams = extractTeamsFromTweet('Team Spirit defeat Team Liquid 2-1 in the UB Final')
    expect(teams).toContain('Team Spirit')
    expect(teams).toContain('Team Liquid')
  })

  it('extracts short names (spirit, liquid)', () => {
    const teams = extractTeamsFromTweet('Spirit def. Liquid 2-0 | BO3 | DreamLeague')
    expect(teams).toContain('Team Spirit')
    expect(teams).toContain('Team Liquid')
  })

  it('extracts OG as a standalone word', () => {
    const teams = extractTeamsFromTweet('OG eliminate Tundra 2-1 to advance')
    expect(teams).toContain('OG')
    expect(teams).toContain('Tundra Esports')
  })

  it('does not match OG inside "ongoing"', () => {
    const teams = extractTeamsFromTweet('The ongoing match between Spirit and Liquid')
    expect(teams).not.toContain('OG')
  })

  it('does not match OG inside "logo"', () => {
    const teams = extractTeamsFromTweet('Check out our logo reveal and Spirit win 2-0')
    expect(teams).not.toContain('OG')
  })

  it('extracts Aurora and Tundra', () => {
    const teams = extractTeamsFromTweet('Aurora Gaming sweep Tundra Esports 2-0')
    expect(teams).toContain('Aurora Gaming')
    expect(teams).toContain('Tundra Esports')
  })

  it('returns at most 2 teams even when more are mentioned', () => {
    const teams = extractTeamsFromTweet('Spirit beat Liquid while Tundra eliminated OG')
    expect(teams.length).toBeLessThanOrEqual(2)
  })

  it('returns empty array when no known teams mentioned', () => {
    expect(extractTeamsFromTweet('What a great weekend of Dota!')).toHaveLength(0)
  })

  it('returns one team when only one is found', () => {
    const teams = extractTeamsFromTweet('Team Spirit take the series!')
    expect(teams).toHaveLength(1)
    expect(teams[0]).toBe('Team Spirit')
  })

  it('does not double-count the same team', () => {
    const teams = extractTeamsFromTweet('Spirit Spirit Spirit win 2-0')
    expect(teams.filter(t => t === 'Team Spirit')).toHaveLength(1)
  })

  it('handles mixed case team names in tweet', () => {
    const teams = extractTeamsFromTweet('SPIRIT defeat liquid 2-1')
    expect(teams).toContain('Team Spirit')
    expect(teams).toContain('Team Liquid')
  })

  it('extracts BetBoom without matching "boom" alone', () => {
    const teams = extractTeamsFromTweet('BetBoom Team take down Aurora 2-0')
    expect(teams).toContain('BetBoom Team')
    expect(teams).toContain('Aurora Gaming')
  })

  it('handles virtus.pro with literal dot', () => {
    const teams = extractTeamsFromTweet('Virtus.pro eliminated by Spirit 0-2')
    expect(teams).toContain('Virtus.pro')
    expect(teams).toContain('Team Spirit')
  })
})

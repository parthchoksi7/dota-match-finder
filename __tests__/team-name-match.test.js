/**
 * Tests for normalizeTeamName + teamPairMatch — the canonical PS↔OD team matcher
 * shared by match-streams.js teamsMatch() and _shared.js findOdMatchByTime().
 *
 * Regression: NA qualifier ggboom vs The Bug (PS match 1540278) was unresolvable
 * because OD names the team "ggboom" while PandaScore names it "GG Boom" — the old
 * lowercase-only substring test failed on the space. Normalization strips separators.
 */

import { describe, it, expect } from 'vitest'
import { normalizeTeamName, teamPairMatch } from '../api/_shared.js'

describe('normalizeTeamName', () => {
  it('lowercases and strips spaces', () => {
    expect(normalizeTeamName('GG Boom')).toBe('ggboom')
  })
  it('strips punctuation (dots, hyphens, apostrophes)', () => {
    expect(normalizeTeamName('Virtus.pro')).toBe('virtuspro')
    expect(normalizeTeamName('Team-Spirit')).toBe('teamspirit')
    expect(normalizeTeamName("Na`Vi")).toBe('navi')
  })
  it('keeps Unicode letters and digits', () => {
    expect(normalizeTeamName('KRÜ Blaze')).toBe('krüblaze')
    expect(normalizeTeamName('Team 5')).toBe('team5')
  })
  it('returns empty string for empty/missing input', () => {
    expect(normalizeTeamName('')).toBe('')
    expect(normalizeTeamName(null)).toBe('')
    expect(normalizeTeamName(undefined)).toBe('')
    expect(normalizeTeamName('  ')).toBe('')
  })
})

describe('teamPairMatch', () => {
  it('matches across a space difference (the ggboom regression)', () => {
    // PS opponents: "the bug" / "GG Boom"  ·  OD: ggboom / The Bug
    expect(teamPairMatch('the bug', 'GG Boom', 'ggboom', 'The Bug')).toBe(true)
  })

  it('is order-independent', () => {
    expect(teamPairMatch('GG Boom', 'the bug', 'ggboom', 'The Bug')).toBe(true)
  })

  it('still matches truncated names (existing behavior)', () => {
    expect(teamPairMatch('BetBoom Team', 'Nigma Galaxy', 'BetBoom', 'Nigma')).toBe(true)
  })

  it('matches punctuation differences', () => {
    expect(teamPairMatch('Virtus.pro', 'Shifters', 'Virtuspro', 'Shifters')).toBe(true)
  })

  it('returns false when a name is missing (empty never matches all)', () => {
    expect(teamPairMatch('The Bug', null, 'ggboom', 'The Bug')).toBe(false)
    expect(teamPairMatch('The Bug', 'GG Boom', 'Yellow Submarine', null)).toBe(false)
    expect(teamPairMatch('', '', '', '')).toBe(false)
  })

  it('returns false for genuinely different teams', () => {
    expect(teamPairMatch('Team Spirit', 'Tundra', 'OG', 'Liquid')).toBe(false)
  })
})

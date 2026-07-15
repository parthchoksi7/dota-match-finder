/**
 * Tests for normalizeTeamName + teamPairMatch — the canonical PS↔OD team matcher
 * shared by match-streams.js teamsMatch() and _shared.js findOdMatchByTime().
 *
 * Regression: NA qualifier ggboom vs The Bug (PS match 1540278) was unresolvable
 * because OD names the team "ggboom" while PandaScore names it "GG Boom" — the old
 * lowercase-only substring test failed on the space. Normalization strips separators.
 */

import { describe, it, expect } from 'vitest'
import { normalizeTeamName, teamPairMatch, teamPairScore, findBestPsMatch, resolveFollowedTeamName } from '../api/_shared.js'
import { isTeamFollowed } from '../src/teamMatching.js'

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
  it('does not rewrite a name even when it participates in a known alias (aliasing is additive, not a rewrite)', () => {
    // Regression: an earlier version of the alias mechanism remapped normalizeTeamName's
    // OUTPUT directly, which broke "BetBoom Team" matching any OD row that legitimately
    // calls them "BetBoom" (the common case) — see teamPairMatch tests below.
    expect(normalizeTeamName('BetBoom Team')).toBe('betboomteam')
    expect(normalizeTeamName('BoomBoys')).toBe('boomboys')
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

  it('resolves PS "BetBoom Team" vs OD "BoomBoys" as a strict match via the alias (tier-1 scrub, 2026-07-07)', () => {
    expect(teamPairMatch('BetBoom Team', 'Nigma Galaxy', 'BoomBoys', 'Nigma Galaxy')).toBe(true)
  })

  it('still matches PS "BetBoom Team" against a normal OD "BetBoom" row (the alias must not break this)', () => {
    expect(teamPairMatch('BetBoom Team', 'Nigma Galaxy', 'BetBoom', 'Nigma')).toBe(true)
  })

  it('resolves PS "1win" vs OD "Tundra Esports" as a strict match via the alias (confirmed live 2026-07-15, EWC 2026 match 1565904)', () => {
    // OpenDota's per-match name for this org hasn't caught up to the June 2026 roster/branding
    // swap yet — team_id 8291895 still carries "Tundra Esports" on its most recent match.
    expect(teamPairMatch('1win', 'Vici Gaming', 'Tundra Esports', 'Vici Gaming')).toBe(true)
  })
})

describe('teamPairScore', () => {
  it('scores 2 when both sides match', () => {
    expect(teamPairScore('BetBoom Team', 'Nigma Galaxy', 'BetBoom', 'Nigma')).toBe(2)
  })
  it('scores 1 when only one side matches (the PlayTime/PTime case)', () => {
    expect(teamPairScore('Team Liquid', 'PlayTime', 'PTime', 'Team Liquid')).toBe(1)
  })
  it('scores 0 for genuinely unrelated teams', () => {
    expect(teamPairScore('Team Spirit', 'Tundra', 'OG', 'Liquid')).toBe(0)
  })
  it('scores 0 when any name is missing', () => {
    expect(teamPairScore('Team Spirit', null, 'OG', 'Liquid')).toBe(0)
  })
})

describe('findBestPsMatch', () => {
  it('prefers a strict full match over any partial-score candidate', () => {
    const psMatches = [
      { id: 1, opponents: [{ opponent: { name: 'BetBoom Team' } }, { opponent: { name: 'Something Else' } }] },
      { id: 2, opponents: [{ opponent: { name: 'BetBoom' } }, { opponent: { name: 'Nigma Galaxy' } }] },
    ]
    expect(findBestPsMatch(psMatches, 'BetBoom', 'Nigma')?.id).toBe(2)
  })

  // Regression: EWC 2026 group stage, 2026-07-07. PandaScore uses a different, non-substring
  // name than OpenDota for ONE side of these matchups ("PlayTime"/"PTime"). strict
  // teamPairMatch never finds them since that side contributes 0 either way — but the score
  // fallback still uniquely identifies the right candidate because the OTHER side ("Team
  // Liquid") matches exactly and no other same-window candidate shares that name too. The
  // mismatched side isn't "bridged"; it just doesn't cost enough to block the correct match.
  it('resolves PS "PlayTime" vs OD "PTime" via the other side matching exactly (EWC 2026 regression)', () => {
    const psMatches = [
      { id: 1565610, opponents: [{ opponent: { name: 'L1ga Team' } }, { opponent: { name: 'Nigma Galaxy' } }] },
      { id: 1565609, opponents: [{ opponent: { name: 'Team Liquid' } }, { opponent: { name: 'PlayTime' } }] },
      { id: 1565611, opponents: [{ opponent: { name: 'Level UP' } }, { opponent: { name: 'Aurora' } }] },
    ]
    expect(findBestPsMatch(psMatches, 'PTime', 'Team Liquid')?.id).toBe(1565609)
  })

  // Same mechanism as above: "_PowerRangers"/"Poor Rangers" never match each other (no
  // substring relation, no alias), but "GamerLegion" matches exactly and no other candidate
  // in the window shares that name — so it uniquely wins with score 1.
  it('resolves PS "Poor Rangers" vs OD "_PowerRangers" via the other side matching exactly (EWC 2026 regression)', () => {
    const psMatches = [
      { id: 1565594, opponents: [{ opponent: { name: 'Team Falcons' } }, { opponent: { name: 'BetBoom Team' } }] },
      { id: 1565595, opponents: [{ opponent: { name: 'Poor Rangers' } }, { opponent: { name: 'GamerLegion' } }] },
      { id: 1565596, opponents: [{ opponent: { name: 'Rune Eaters' } }, { opponent: { name: 'Xtreme Gaming' } }] },
      { id: 1561069, opponents: [{ opponent: { name: 'BALU' } }, { opponent: { name: 'summer bear' } }] },
    ]
    expect(findBestPsMatch(psMatches, '_PowerRangers', 'GamerLegion')?.id).toBe(1565595)
  })

  it('returns null on a tie between two equally-plausible partial matches', () => {
    const psMatches = [
      { id: 1, opponents: [{ opponent: { name: 'Alpha Squad' } }, { opponent: { name: 'Totally Different' } }] },
      { id: 2, opponents: [{ opponent: { name: 'Alpha Team' } }, { opponent: { name: 'Also Different' } }] },
    ]
    // Both candidates partially match "Alpha X" with score 1 — no unique winner, no guess.
    expect(findBestPsMatch(psMatches, 'Alpha', 'Unmatched Third Name')).toBeNull()
  })

  it('does not treat a duplicate of the same match (same id) as a competing tie', () => {
    // Same PS match id appears twice in the candidate window — a real API quirk, not two
    // different matches. Both score 1 on the same org; this must resolve, not return null.
    const psMatches = [
      { id: 1565609, opponents: [{ opponent: { name: 'Team Liquid' } }, { opponent: { name: 'PlayTime' } }] },
      { id: 1565609, opponents: [{ opponent: { name: 'Team Liquid' } }, { opponent: { name: 'PlayTime' } }] },
    ]
    expect(findBestPsMatch(psMatches, 'PTime', 'Team Liquid')?.id).toBe(1565609)
  })

  it('returns null when nothing scores above 0', () => {
    const psMatches = [
      { id: 1, opponents: [{ opponent: { name: 'Team Spirit' } }, { opponent: { name: 'Tundra' } }] },
    ]
    expect(findBestPsMatch(psMatches, 'OG', 'Liquid')).toBeNull()
  })

  it('returns null for an empty or missing candidate list', () => {
    expect(findBestPsMatch([], 'OG', 'Liquid')).toBeNull()
    expect(findBestPsMatch(null, 'OG', 'Liquid')).toBeNull()
  })
})

describe('resolveFollowedTeamName (OD name → canonical followable org)', () => {
  it('returns the exact canonical name for an already-canonical input', () => {
    expect(resolveFollowedTeamName('Team Liquid')).toBe('Team Liquid')
    expect(resolveFollowedTeamName('OG')).toBe('OG')
  })

  it('resolves a punctuation/spacing variant to canonical', () => {
    expect(resolveFollowedTeamName('Virtuspro')).toBe('Virtus.pro')
    expect(resolveFollowedTeamName('team liquid')).toBe('Team Liquid')
  })

  it('resolves a known alias divergence (OD BoomBoys → BetBoom Team)', () => {
    expect(resolveFollowedTeamName('BoomBoys')).toBe('BetBoom Team')
  })

  it('passes a non-tier-1 name through unchanged so it is never dropped', () => {
    expect(resolveFollowedTeamName('Some Qualifier Squad')).toBe('Some Qualifier Squad')
  })

  it('does NOT coincidentally map a substring-of-a-short-org name (no "og" false positive)', () => {
    // "OG" normalizes to "og", a substring of these — must NOT resolve to OG.
    expect(resolveFollowedTeamName('Zero Gaming')).toBe('Zero Gaming')
    expect(resolveFollowedTeamName('Turbo Gaming')).toBe('Turbo Gaming')
    expect(resolveFollowedTeamName('Dogs')).toBe('Dogs')
  })

  it('returns the original for empty/missing input', () => {
    expect(resolveFollowedTeamName('')).toBe('')
    expect(resolveFollowedTeamName(null)).toBe(null)
    expect(resolveFollowedTeamName(undefined)).toBe(undefined)
  })
})

describe('isTeamFollowed (favorites highlighting, 2026-07-15 fix)', () => {
  it('matches an exact followed name', () => {
    expect(isTeamFollowed(['Team Liquid'], 'Team Liquid', 'Tundra Esports')).toBe(true)
  })

  it('matches via substring/normalization (e.g. spacing/punctuation differences)', () => {
    expect(isTeamFollowed(['Virtus.pro'], 'Virtuspro', 'Shifters')).toBe(true)
  })

  it('matches via the OD name even when the other candidate name is PS-sourced', () => {
    expect(isTeamFollowed(['BetBoom Team'], 'BetBoom', 'Nigma Galaxy')).toBe(true)
  })

  // The actual bug report: a team followed under its OpenDota name (only ever possible from a
  // played match, since the follow star doesn't appear on unplayed ones) must still highlight
  // that same org's PandaScore-sourced upcoming fixture, even with zero substring overlap.
  it('bridges the "1win"/"Tundra Esports" alias divergence (the reported regression)', () => {
    expect(isTeamFollowed(['Tundra Esports'], '1win', 'Vici Gaming')).toBe(true)
    expect(isTeamFollowed(['1win'], 'Tundra Esports', 'Vici Gaming')).toBe(true)
  })

  it('checks every candidate team name, not just the first', () => {
    expect(isTeamFollowed(['Vici Gaming'], '1win', 'Vici Gaming')).toBe(true)
  })

  it('returns false for unrelated teams', () => {
    expect(isTeamFollowed(['Team Spirit'], '1win', 'Vici Gaming')).toBe(false)
  })

  it('returns false when followedTeams is empty, null, or undefined', () => {
    expect(isTeamFollowed([], 'Team Liquid', 'OG')).toBe(false)
    expect(isTeamFollowed(null, 'Team Liquid', 'OG')).toBe(false)
    expect(isTeamFollowed(undefined, 'Team Liquid', 'OG')).toBe(false)
  })

  it('returns false when every candidate name is empty/missing (an empty name never matches all)', () => {
    expect(isTeamFollowed(['Team Liquid'], null, undefined)).toBe(false)
    expect(isTeamFollowed(['Team Liquid'], '', '')).toBe(false)
  })

  it('matches when any one of multiple followed teams matches any one candidate name', () => {
    expect(isTeamFollowed(['OG', 'Tundra Esports', 'Team Spirit'], '1win', 'Vici Gaming')).toBe(true)
  })

  // Regression: an earlier version reused teamPairMatch's bidirectional-substring rule
  // directly. That's safe there because BOTH sides of a pairing must match at once (a false
  // positive needs two independent coincidences); a single followed name checked against one
  // arbitrary candidate has no such cross-validation, so "OG" (normalizes to "og") false-
  // positive-matched any team whose name happens to contain "og" — including two of the app's
  // own curated tier-1 orgs' generic-name near-misses. Caught in review before shipping.
  it('does NOT false-positive on a short followed name coincidentally substring-matching an unrelated team (the "OG" hazard)', () => {
    expect(isTeamFollowed(['OG'], 'Zero Gaming', 'Something Else')).toBe(false)
    expect(isTeamFollowed(['OG'], 'Turbo Gaming', 'Something Else')).toBe(false)
    expect(isTeamFollowed(['OG'], 'Dogs', 'Something Else')).toBe(false)
  })

  it('still matches a short followed name exactly (the OG guard only blocks substring, not equality)', () => {
    expect(isTeamFollowed(['OG'], 'OG', 'Liquid')).toBe(true)
  })

  it('still matches a long-enough truncation (PS "Aurora" vs OD "Aurora Gaming")', () => {
    expect(isTeamFollowed(['Aurora Gaming'], 'Aurora', 'Something Else')).toBe(true)
  })
})

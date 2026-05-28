import { describe, it, expect } from 'vitest'
import {
  lookupTournamentHandle,
  lookupTeamHandle,
  pickTournamentTalent,
  TOURNAMENT_TALENT,
} from '../api/_x-accounts.js'

// ── lookupTournamentHandle ────────────────────────────────────────────────────

describe('lookupTournamentHandle', () => {
  it('matches BLAST Slam', () => {
    expect(lookupTournamentHandle('BLAST Slam Season 7')).toBe('BLASTDota')
  })

  it('matches DreamLeague (returns ESL handle)', () => {
    expect(lookupTournamentHandle('DreamLeague Season 23')).toBe('ESLDota2')
  })

  it('matches ESL One', () => {
    expect(lookupTournamentHandle('ESL One Birmingham')).toBe('ESLDota2')
  })

  it('matches PGL', () => {
    expect(lookupTournamentHandle('PGL Wallachia Season 3')).toBe('pgldota2')
  })

  it('is case-insensitive', () => {
    expect(lookupTournamentHandle('blast slam s7')).toBe('BLASTDota')
    expect(lookupTournamentHandle('DREAMLEAGUE S23')).toBe('ESLDota2')
  })

  it('returns null for unknown tournament', () => {
    expect(lookupTournamentHandle('WePlay Academy League')).toBeNull()
  })

  it('returns null for null/empty input', () => {
    expect(lookupTournamentHandle(null)).toBeNull()
    expect(lookupTournamentHandle('')).toBeNull()
  })

  it('DreamLeague matches before generic ESL', () => {
    // Both 'dreamleague' and 'esl' patterns would match a DreamLeague name —
    // dreamleague should win and return ESLDota2 via its own entry.
    expect(lookupTournamentHandle('DreamLeague S24')).toBe('ESLDota2')
  })
})

// ── lookupTeamHandle ──────────────────────────────────────────────────────────

describe('lookupTeamHandle', () => {
  it('matches Team Liquid', () => {
    expect(lookupTeamHandle('Team Liquid')).toBe('teamliquiddota')
  })

  it('matches Liquid shortform', () => {
    expect(lookupTeamHandle('Liquid')).toBe('teamliquiddota')
  })

  it('matches Team Spirit', () => {
    expect(lookupTeamHandle('Team Spirit')).toBe('TSpirit_Dota2')
  })

  it('matches Nigma Galaxy', () => {
    expect(lookupTeamHandle('Nigma Galaxy')).toBe('NigmaGalaxy')
  })

  it('matches Natus Vincere', () => {
    expect(lookupTeamHandle('Natus Vincere')).toBe('natusvincere')
  })

  it('matches Virtus.pro', () => {
    expect(lookupTeamHandle('Virtus.pro')).toBe('virtuspro')
  })

  it('matches BOOM Esports', () => {
    expect(lookupTeamHandle('BOOM Esports')).toBe('boomesportsid')
  })

  it('does not match BOOM for BetBoom', () => {
    expect(lookupTeamHandle('BetBoom Team')).toBe('BetBoomTeam')
  })

  it('matches Team Secret', () => {
    expect(lookupTeamHandle('Team Secret')).toBe('teamsecret')
  })

  it('matches Aurora', () => {
    expect(lookupTeamHandle('Aurora')).toBe('AuroraDota2_GG')
  })

  it('matches Tundra Esports', () => {
    expect(lookupTeamHandle('Tundra Esports')).toBe('TundraEsports')
  })

  it('matches PARI Visions', () => {
    expect(lookupTeamHandle('PARI Visions')).toBe('PARIVISIONdota2')
  })

  it('matches PARIVISION legacy name', () => {
    expect(lookupTeamHandle('PARIVISION')).toBe('PARIVISIONdota2')
  })

  it('matches Xtreme Gaming', () => {
    expect(lookupTeamHandle('Xtreme Gaming')).toBe('xtremegamingcn')
  })

  it('matches Glyph', () => {
    expect(lookupTeamHandle('Glyph')).toBe('glyphdota')
  })

  it('matches OG (exact)', () => {
    expect(lookupTeamHandle('OG')).toBe('OGesports')
  })

  it('does not match OG as a substring of other names', () => {
    // 'og' is marked exact — should not match mid-word substrings
    expect(lookupTeamHandle('Vlogger Team')).toBeNull()
    expect(lookupTeamHandle('Toggle Esports')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(lookupTeamHandle('team liquid')).toBe('teamliquiddota')
    expect(lookupTeamHandle('TUNDRA ESPORTS')).toBe('TundraEsports')
  })

  it('returns null for unknown team', () => {
    expect(lookupTeamHandle('Random Team')).toBeNull()
  })

  it('returns null for null/empty input', () => {
    expect(lookupTeamHandle(null)).toBeNull()
    expect(lookupTeamHandle('')).toBeNull()
  })
})

// ── pickTournamentTalent ──────────────────────────────────────────────────────

describe('pickTournamentTalent', () => {
  it('returns 2 talent handles for a known tournament', () => {
    const picks = pickTournamentTalent('BLASTDota')
    expect(picks).toHaveLength(2)
    const pool = TOURNAMENT_TALENT['BLASTDota']
    picks.forEach(t => expect(pool).toContain(t))
  })

  it('returns no duplicates', () => {
    const picks = pickTournamentTalent('BLASTDota')
    expect(new Set(picks).size).toBe(picks.length)
  })

  it('respects the count parameter', () => {
    expect(pickTournamentTalent('BLASTDota', 1)).toHaveLength(1)
    expect(pickTournamentTalent('BLASTDota', 5)).toHaveLength(5)
  })

  it('does not exceed pool size', () => {
    const pool = TOURNAMENT_TALENT['BLASTDota']
    const picks = pickTournamentTalent('BLASTDota', 999)
    expect(picks.length).toBe(pool.length)
  })

  it('returns [] for unknown tournament handle', () => {
    expect(pickTournamentTalent('UnknownTournament')).toEqual([])
  })

  it('returns [] for null handle', () => {
    expect(pickTournamentTalent(null)).toEqual([])
  })
})

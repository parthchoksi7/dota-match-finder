import { describe, it, expect } from 'vitest'
import { slugify, matchUrlFromHistory, matchUrlFromOd } from '../api/sitemap.js'

const BASE = 'https://spectateesports.live'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Team Spirit')).toBe('team-spirit')
    expect(slugify('Natus Vincere')).toBe('natus-vincere')
  })

  it('strips dots and other non-alphanumeric characters', () => {
    expect(slugify('VP.Prodigy')).toBe('vpprodigy')
    expect(slugify('Virtus.pro')).toBe('virtuspro')
  })

  it('collapses multiple hyphens and spaces', () => {
    expect(slugify('Team  Spirit')).toBe('team-spirit')
    expect(slugify('A---B')).toBe('a-b')
  })

  it('handles null, undefined, and empty string', () => {
    expect(slugify(null)).toBe('')
    expect(slugify('')).toBe('')
    expect(slugify(undefined)).toBe('')
  })

  it('preserves existing hyphens', () => {
    expect(slugify('ESL One')).toBe('esl-one')
    expect(slugify('OG')).toBe('og')
  })
})

describe('matchUrlFromHistory (Supabase rows)', () => {
  it('builds the canonical URL matching a live sitemap entry', () => {
    const row = {
      team_a: 'Team Spirit',
      team_b: 'VP.Prodigy',
      tournament: 'The International Europe Closed Qualifier',
      od_match_id: 8860410652,
    }
    expect(matchUrlFromHistory(row)).toBe(
      `${BASE}/match/team-spirit-vs-vpprodigy-the-international-europe-closed-qualifier-8860410652`
    )
  })

  it('builds URL for SEA qualifier', () => {
    const row = {
      team_a: 'Glyph',
      team_b: 'OG',
      tournament: 'The International Southeast Asia Closed Qualifier',
      od_match_id: 8860532107,
    }
    expect(matchUrlFromHistory(row)).toBe(
      `${BASE}/match/glyph-vs-og-the-international-southeast-asia-closed-qualifier-8860532107`
    )
  })

  it('omits empty tournament from slug', () => {
    const row = { team_a: 'Alpha', team_b: 'Beta', tournament: '', od_match_id: 12345 }
    expect(matchUrlFromHistory(row)).toBe(`${BASE}/match/alpha-vs-beta-12345`)
  })

  it('omits null tournament from slug', () => {
    const row = { team_a: 'Alpha', team_b: 'Beta', tournament: null, od_match_id: 12345 }
    expect(matchUrlFromHistory(row)).toBe(`${BASE}/match/alpha-vs-beta-12345`)
  })
})

describe('matchUrlFromOd (OpenDota fallback rows)', () => {
  it('builds URL using radiant/dire names and league', () => {
    const m = {
      radiant_name: 'Team Spirit',
      dire_name: 'Team Liquid',
      league_name: 'DreamLeague Season 25',
      match_id: 7777777777,
    }
    expect(matchUrlFromOd(m)).toBe(
      `${BASE}/match/team-spirit-vs-team-liquid-dreamleague-season-25-7777777777`
    )
  })

  it('falls back to Radiant/Dire when team names are missing', () => {
    const m = { radiant_name: null, dire_name: null, league_name: '', match_id: 1 }
    expect(matchUrlFromOd(m)).toBe(`${BASE}/match/radiant-vs-dire-1`)
  })

  it('omits empty league from slug', () => {
    const m = { radiant_name: 'A', dire_name: 'B', league_name: '', match_id: 99 }
    expect(matchUrlFromOd(m)).toBe(`${BASE}/match/a-vs-b-99`)
  })
})

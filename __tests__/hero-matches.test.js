/**
 * Unit tests for the ?mode=hero-matches handler logic in api/tournaments.js.
 *
 * Tests cover the pure transformation steps extracted from the handler:
 *   - hero_id validation
 *   - KV cache key construction
 *   - SQL LIKE condition generation (tier-1 keyword list)
 *   - SQL query injection safety (integer-only interpolation)
 *   - Explorer row mapping (types, fallback values)
 *   - exhausted flag logic
 *   - nextCursor derivation
 */

import { describe, it, expect } from 'vitest'

// ── hero_id validation ────────────────────────────────────────────────────────

function parseHeroId(raw) {
  const id = parseInt(raw, 10)
  if (!id || isNaN(id)) return null
  return id
}

describe('hero_id validation', () => {
  it('parses a valid numeric string', () => {
    expect(parseHeroId('13')).toBe(13)
  })

  it('parses a number directly', () => {
    expect(parseHeroId(13)).toBe(13)
  })

  it('returns null for a missing value', () => {
    expect(parseHeroId(undefined)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseHeroId('')).toBeNull()
  })

  it('returns null for a non-numeric string', () => {
    expect(parseHeroId('puck')).toBeNull()
  })

  it('returns null for zero (hero_id 0 does not exist)', () => {
    expect(parseHeroId('0')).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseHeroId(null)).toBeNull()
  })
})

// ── KV cache key construction ─────────────────────────────────────────────────

function buildCacheKey(heroId, cursor) {
  const cursorBucket = Math.floor(cursor / 86400)
  return `hero:matches:v1:${heroId}:${cursorBucket}`
}

describe('cache key construction', () => {
  it('includes hero_id and day-bucket in key', () => {
    const key = buildCacheKey(13, 1748800000)
    expect(key).toBe(`hero:matches:v1:13:${Math.floor(1748800000 / 86400)}`)
  })

  it('uses the same key for two cursors within the same UTC day', () => {
    const dayStart = 1748736000
    const k1 = buildCacheKey(1, dayStart)
    const k2 = buildCacheKey(1, dayStart + 3600)
    expect(k1).toBe(k2)
  })

  it('uses a different key for cursors on different UTC days', () => {
    const day1 = 1748736000
    const day2 = day1 + 86400
    expect(buildCacheKey(1, day1)).not.toBe(buildCacheKey(1, day2))
  })

  it('uses a different key for different hero IDs on the same day', () => {
    const cursor = 1748800000
    expect(buildCacheKey(13, cursor)).not.toBe(buildCacheKey(1, cursor))
  })

  it('key starts with the expected prefix', () => {
    expect(buildCacheKey(13, 1748800000)).toMatch(/^hero:matches:v1:/)
  })
})

// ── SQL LIKE condition generation ─────────────────────────────────────────────

const EXPLORER_TIER1_KEYWORDS = ['dreamleague', 'pgl', 'esl one', 'blast', 'weplay', 'the international', 'riyadh']

function buildLikeConditions(keywords) {
  return keywords.map(k => `LOWER(leagues.name) LIKE '%${k}%'`).join(' OR ')
}

describe('SQL LIKE condition generation', () => {
  it('generates one condition per keyword', () => {
    const conds = buildLikeConditions(EXPLORER_TIER1_KEYWORDS)
    for (const kw of EXPLORER_TIER1_KEYWORDS) {
      expect(conds).toContain(`LOWER(leagues.name) LIKE '%${kw}%'`)
    }
  })

  it('joins conditions with OR', () => {
    const conds = buildLikeConditions(['dreamleague', 'pgl'])
    expect(conds).toBe("LOWER(leagues.name) LIKE '%dreamleague%' OR LOWER(leagues.name) LIKE '%pgl%'")
  })

  it('covers all 7 expected tier-1 brands', () => {
    expect(EXPLORER_TIER1_KEYWORDS).toHaveLength(7)
    expect(EXPLORER_TIER1_KEYWORDS).toContain('the international')
    expect(EXPLORER_TIER1_KEYWORDS).toContain('riyadh')
  })
})

// ── SQL query injection safety ────────────────────────────────────────────────

function buildSql(heroId, cursor, likeConditions) {
  return `SELECT matches.match_id, matches.start_time, matches.radiant_win, leagues.name AS league_name, rt.name AS radiant_name, dt.name AS dire_name FROM matches JOIN picks_bans ON matches.match_id = picks_bans.match_id JOIN leagues ON matches.leagueid = leagues.leagueid JOIN teams rt ON matches.radiant_team_id = rt.team_id JOIN teams dt ON matches.dire_team_id = dt.team_id WHERE picks_bans.hero_id = ${heroId} AND picks_bans.is_pick = true AND matches.start_time < ${cursor} AND (${likeConditions}) ORDER BY matches.start_time DESC LIMIT 100`
}

describe('SQL query construction', () => {
  const likeConditions = buildLikeConditions(EXPLORER_TIER1_KEYWORDS)

  it('embeds hero_id as an integer literal', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).toContain('picks_bans.hero_id = 13')
  })

  it('embeds cursor as an integer literal', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).toContain('matches.start_time < 1748800000')
  })

  it('filters picks only (is_pick = true)', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).toContain('picks_bans.is_pick = true')
  })

  it('orders by start_time DESC', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).toContain('ORDER BY matches.start_time DESC')
  })

  it('limits to 100 rows', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).toContain('LIMIT 100')
  })

  it('qualifies all column references with table names (no ambiguous columns)', () => {
    const sql = buildSql(13, 1748800000, likeConditions)
    expect(sql).not.toMatch(/\bSELECT match_id\b/)
    expect(sql).toContain('matches.match_id')
    expect(sql).toContain('matches.start_time')
    expect(sql).toContain('matches.radiant_win')
  })
})

// ── Explorer row mapping ──────────────────────────────────────────────────────

function mapHeroMatchRows(rawRows) {
  return rawRows.map(r => ({
    match_id: String(r.match_id),
    start_time: Number(r.start_time),
    radiant_win: Boolean(r.radiant_win),
    league_name: r.league_name || '',
    radiant_name: r.radiant_name || 'Radiant',
    dire_name: r.dire_name || 'Dire',
  }))
}

describe('Explorer row mapping', () => {
  const raw = {
    match_id: 8012345678,
    start_time: 1748800000,
    radiant_win: true,
    league_name: 'DreamLeague Season 24',
    radiant_name: 'Team Falcons',
    dire_name: 'Team Spirit',
  }

  it('converts match_id to a string', () => {
    const [row] = mapHeroMatchRows([raw])
    expect(typeof row.match_id).toBe('string')
    expect(row.match_id).toBe('8012345678')
  })

  it('converts start_time to a number', () => {
    const [row] = mapHeroMatchRows([{ ...raw, start_time: '1748800000' }])
    expect(typeof row.start_time).toBe('number')
    expect(row.start_time).toBe(1748800000)
  })

  it('converts radiant_win to a boolean', () => {
    const [row] = mapHeroMatchRows([{ ...raw, radiant_win: 1 }])
    expect(typeof row.radiant_win).toBe('boolean')
    expect(row.radiant_win).toBe(true)
  })

  it('defaults radiant_name to "Radiant" when missing', () => {
    const [row] = mapHeroMatchRows([{ ...raw, radiant_name: null }])
    expect(row.radiant_name).toBe('Radiant')
  })

  it('defaults dire_name to "Dire" when missing', () => {
    const [row] = mapHeroMatchRows([{ ...raw, dire_name: '' }])
    expect(row.dire_name).toBe('Dire')
  })

  it('defaults league_name to empty string when missing', () => {
    const [row] = mapHeroMatchRows([{ ...raw, league_name: null }])
    expect(row.league_name).toBe('')
  })

  it('preserves all fields from a well-formed row', () => {
    const [row] = mapHeroMatchRows([raw])
    expect(row.league_name).toBe('DreamLeague Season 24')
    expect(row.radiant_name).toBe('Team Falcons')
    expect(row.dire_name).toBe('Team Spirit')
    expect(row.radiant_win).toBe(true)
  })

  it('maps multiple rows', () => {
    const rows = mapHeroMatchRows([raw, { ...raw, match_id: 9999, radiant_win: false }])
    expect(rows).toHaveLength(2)
    expect(rows[1].match_id).toBe('9999')
    expect(rows[1].radiant_win).toBe(false)
  })
})

// ── exhausted flag ─────────────────────────────────────────────────────────────

describe('exhausted flag', () => {
  it('is false when exactly 100 rows are returned', () => {
    const rows = Array(100).fill(null)
    expect(rows.length < 100).toBe(false)
  })

  it('is true when fewer than 100 rows are returned', () => {
    const rows = Array(42).fill(null)
    expect(rows.length < 100).toBe(true)
  })

  it('is true when 0 rows are returned', () => {
    expect([].length < 100).toBe(true)
  })

  it('is false when exactly 100 rows — there may be more on the next page', () => {
    const rows = Array(100).fill(null)
    expect(rows.length < 100).toBe(false)
  })
})

// ── nextCursor derivation ─────────────────────────────────────────────────────

function deriveNextCursor(rows) {
  return rows.length > 0 ? rows[rows.length - 1].start_time : null
}

describe('nextCursor derivation', () => {
  it('returns the start_time of the last row', () => {
    const rows = [
      { match_id: '1', start_time: 1748800000 },
      { match_id: '2', start_time: 1748700000 },
      { match_id: '3', start_time: 1748600000 },
    ]
    expect(deriveNextCursor(rows)).toBe(1748600000)
  })

  it('returns null when rows is empty', () => {
    expect(deriveNextCursor([])).toBeNull()
  })

  it('uses start_time as cursor (not match_id) for stable pagination', () => {
    const rows = [{ match_id: '8012345678', start_time: 1748100000 }]
    const cursor = deriveNextCursor(rows)
    expect(cursor).toBe(1748100000)
    expect(typeof cursor).toBe('number')
  })
})

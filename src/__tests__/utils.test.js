/**
 * Tests for pure utility functions in src/utils.js.
 *
 * Covers: formatDuration, formatRelativeTime, getSeriesLabel, groupIntoSeries
 * edge cases (midnight-spanning series, seriesId=0, oldest incomplete drop).
 *
 * groupIntoSeries happy-path and isSeriesComplete are also exercised by
 * my-teams.test.js; this file focuses on the uncovered branches.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { formatDuration, formatRelativeTime, getSeriesLabel, groupIntoSeries, formatDateRange, getSeriesWins, trackEvent, isSeriesComplete, winsRequiredForSeries, buildTournamentCards, normalizeTournamentKey, buildTournamentName, tournamentStageLabel, hasPriorFootprint, orderSeriesGames, STORAGE_KEYS } from '../utils'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// ── hasPriorFootprint (spoiler-free default migration guard) ─────────────────

describe('hasPriorFootprint', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('returns false for a brand-new visitor with empty storage', () => {
    expect(hasPriorFootprint()).toBe(false)
  })

  const footprintKeys = [
    STORAGE_KEYS.THEME,
    STORAGE_KEYS.FOLLOWED_TEAMS,
    STORAGE_KEYS.MY_TEAMS,
    STORAGE_KEYS.SUMMARY_CACHE,
    STORAGE_KEYS.NEWS_LAST_VISITED,
    STORAGE_KEYS.CALENDAR_NUDGE_DISMISSED,
    STORAGE_KEYS.RECENT_SEARCHES,
    STORAGE_KEYS.OWNER,
  ]

  for (const key of footprintKeys) {
    it(`returns true when a returning visitor has ${key} set`, () => {
      localStorage.setItem(key, 'x')
      expect(hasPriorFootprint()).toBe(true)
    })
  }

  it('does not count HAS_VISITED or the spoiler keys as a footprint', () => {
    localStorage.setItem(STORAGE_KEYS.HAS_VISITED, 'true')
    localStorage.setItem(STORAGE_KEYS.SPOILER_FREE, 'true')
    localStorage.setItem(STORAGE_KEYS.SPOILER_NUDGE_DISMISSED, '1')
    expect(hasPriorFootprint()).toBe(false)
  })
})

// ── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats hours and minutes as total minutes', () => {
    expect(formatDuration('1:23')).toBe('83m')
  })

  it('formats hours only as total minutes', () => {
    expect(formatDuration('2:00')).toBe('120m')
  })

  it('formats minutes only (zero hours)', () => {
    expect(formatDuration('0:45')).toBe('45m')
  })

  it('returns 0m for 0:00', () => {
    expect(formatDuration('0:00')).toBe('0m')
  })

  it('returns the input unchanged when not a string', () => {
    expect(formatDuration(null)).toBe('-')
    expect(formatDuration(undefined)).toBe('-')
  })

  it('trims whitespace before parsing', () => {
    expect(formatDuration(' 1:30 ')).toBe('90m')
  })
})

// ── formatRelativeTime ──────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  afterEach(() => vi.restoreAllMocks())

  function freezeNow(unixSeconds) {
    vi.spyOn(Date, 'now').mockReturnValue(unixSeconds * 1000)
  }

  const BASE = 1_700_000_000 // arbitrary fixed point

  it('returns "Just now" for < 60s ago', () => {
    freezeNow(BASE + 30)
    expect(formatRelativeTime(BASE)).toBe('Just now')
  })

  it('returns minutes for 1–59 min ago', () => {
    freezeNow(BASE + 3 * 60)
    expect(formatRelativeTime(BASE)).toBe('3m ago')
  })

  it('returns hours for 1–23 h ago', () => {
    freezeNow(BASE + 5 * 3600)
    expect(formatRelativeTime(BASE)).toBe('5h ago')
  })

  it('returns "Yesterday" for 24–47 h ago', () => {
    freezeNow(BASE + 30 * 3600)
    expect(formatRelativeTime(BASE)).toBe('Yesterday')
  })

  it('returns days for 2–6 days ago', () => {
    freezeNow(BASE + 4 * 86400)
    expect(formatRelativeTime(BASE)).toBe('4 days ago')
  })

  it('returns empty string for >= 7 days ago', () => {
    freezeNow(BASE + 8 * 86400)
    expect(formatRelativeTime(BASE)).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(formatRelativeTime(null)).toBe('')
  })

  it('returns empty string for non-number input', () => {
    expect(formatRelativeTime('string')).toBe('')
  })
})

// ── getSeriesLabel ──────────────────────────────────────────────────────────

describe('getSeriesLabel', () => {
  it('returns BO1 for seriesType 0', () => {
    expect(getSeriesLabel(0)).toBe('BO1')
  })

  it('returns BO3 for seriesType 1', () => {
    expect(getSeriesLabel(1)).toBe('BO3')
  })

  it('returns BO5 for seriesType 2', () => {
    expect(getSeriesLabel(2)).toBe('BO5')
  })

  it('returns BO2 for seriesType 3', () => {
    expect(getSeriesLabel(3)).toBe('BO2')
  })

  it('returns empty string for unknown seriesType', () => {
    expect(getSeriesLabel(99)).toBe('')
    expect(getSeriesLabel(undefined)).toBe('')
  })
})

// ── orderSeriesGames (match-drawer game switcher ordering) ───────────────────

describe('orderSeriesGames', () => {
  const g1 = { id: 'a', startTime: 1_741_900_000 } // earliest = Game 1
  const g2 = { id: 'b', startTime: 1_741_905_000 } // latest = Game 2

  it('orders games by ascending startTime regardless of id/feed order', () => {
    // ids given newest-first (feed order); match_id is NOT chronological for same-day games
    const result = orderSeriesGames(['b', 'a'], [g2, g1])
    expect(result.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('produces game numbers where the earliest game is Game 1', () => {
    const ordered = orderSeriesGames(['b', 'a'], [g1, g2])
    const gameNumbers = {}
    ordered.forEach((m, i) => { gameNumbers[m.id] = i + 1 })
    expect(gameNumbers).toEqual({ a: 1, b: 2 })
  })

  it('drops ids that have no matching object', () => {
    const result = orderSeriesGames(['a', 'missing', 'b'], [g1, g2])
    expect(result.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('returns [] for empty/undefined id lists', () => {
    expect(orderSeriesGames([], [g1, g2])).toEqual([])
    expect(orderSeriesGames(undefined, [g1, g2])).toEqual([])
  })

  it('treats missing startTime as 0 without throwing', () => {
    const noTime = { id: 'c' }
    const result = orderSeriesGames(['a', 'c'], [g1, noTime])
    expect(result.map(m => m.id)).toEqual(['c', 'a'])
  })
})

// ── groupIntoSeries edge cases ──────────────────────────────────────────────

function makeGame(overrides = {}) {
  return {
    id: String(Math.random()),
    radiantTeam: 'Team A',
    direTeam: 'Team B',
    radiantWin: true,
    tournament: 'DreamLeague S25',
    date: 'Mar 14, 2026',
    startTime: 1_741_900_000,
    seriesId: 1,
    seriesType: 1, // BO3
    duration: '0:45',
    ...overrides,
  }
}

describe('groupIntoSeries — midnight-spanning series', () => {
  it('keeps games in the same series when seriesId is shared across dates', () => {
    // BO3 2-0: both games won by Radiant so the series is complete and not dropped
    const game1 = makeGame({ date: 'Mar 14, 2026', startTime: 1_741_900_000, seriesId: 42, radiantWin: true })
    const game2 = makeGame({ date: 'Mar 15, 2026', startTime: 1_741_990_000, seriesId: 42, radiantWin: true })
    const result = groupIntoSeries([game1, game2])
    // Should be one series, not two
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(2)
  })
})

describe('groupIntoSeries — seriesId = 0', () => {
  it('does not merge games with seriesId 0 across different team matchups', () => {
    // Use BO1 (seriesType=0) so each single game is a complete series — neither gets dropped
    const game1 = makeGame({ seriesId: 0, seriesType: 0, radiantTeam: 'Team A', direTeam: 'Team B', startTime: 1_741_900_000 })
    const game2 = makeGame({ seriesId: 0, seriesType: 0, radiantTeam: 'Team C', direTeam: 'Team D', startTime: 1_741_900_100 })
    const result = groupIntoSeries([game1, game2])
    expect(result).toHaveLength(2)
  })

  it('does not merge games with seriesId 0 even for same teams on same day', () => {
    // seriesId=0 means no series grouping — each game is its own key
    // because the key becomes teams + tournament + date, which will be identical.
    // Actually they CAN merge if same teams + tournament + date. seriesId=0
    // just prevents the seriesId from being used as key; date-based grouping still applies.
    const game1 = makeGame({ seriesId: 0, startTime: 1_741_900_000 })
    const game2 = makeGame({ seriesId: 0, startTime: 1_741_900_100 })
    // Same teams + tournament + date → still groups into one series
    const result = groupIntoSeries([game1, game2])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(2)
  })
})

describe('groupIntoSeries — oldest incomplete series is dropped', () => {
  it('drops the oldest incomplete series from the list', () => {
    // Series 1: complete BO3 (Team A wins 2-0) — newer
    const s1g1 = makeGame({ seriesId: 10, startTime: 1_741_900_200, radiantWin: true })
    const s1g2 = makeGame({ seriesId: 10, startTime: 1_741_900_300, radiantWin: true })
    // Series 2: incomplete BO3 (only 1 game played) — older
    const s2g1 = makeGame({ seriesId: 20, startTime: 1_741_800_000, radiantWin: true })

    const result = groupIntoSeries([s1g1, s1g2, s2g1])
    // Oldest incomplete (series 20) should be dropped
    const ids = result.map(s => s.id)
    expect(ids).not.toContain('20')
    expect(ids).toContain('10')
  })

  it('keeps all series when none are incomplete', () => {
    // Series 1: complete BO3 2-0
    const s1g1 = makeGame({ seriesId: 10, startTime: 1_741_900_200, radiantWin: true })
    const s1g2 = makeGame({ seriesId: 10, startTime: 1_741_900_300, radiantWin: true })
    // Series 2: complete BO1
    const s2g1 = makeGame({ seriesId: 20, startTime: 1_741_800_000, seriesType: 0, radiantWin: true })

    const result = groupIntoSeries([s1g1, s1g2, s2g1])
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(groupIntoSeries([])).toEqual([])
  })
})

describe('groupIntoSeries — sort order', () => {
  it('sorts series newest-first by startTime', () => {
    // Use BO1 complete series so neither gets dropped by the incomplete-drop logic
    const old = makeGame({ seriesId: 1, seriesType: 0, startTime: 1_741_800_000 })
    const recent = makeGame({ seriesId: 2, seriesType: 0, startTime: 1_741_900_000 })
    const result = groupIntoSeries([old, recent])
    // recent should be first
    expect(result[0].id).toBe('2')
    expect(result[1].id).toBe('1')
  })
})

// ── winsRequiredForSeries ────────────────────────────────────────────────────

describe('winsRequiredForSeries', () => {
  it('returns 1 for BO1 (seriesType 0)', () => expect(winsRequiredForSeries(0)).toBe(1))
  it('returns 2 for BO3 (seriesType 1)', () => expect(winsRequiredForSeries(1)).toBe(2))
  it('returns 3 for BO5 (seriesType 2)', () => expect(winsRequiredForSeries(2)).toBe(3))
  it('returns 2 for BO2 (seriesType 3)', () => expect(winsRequiredForSeries(3)).toBe(2))
  it('defaults to 2 for unknown seriesType', () => expect(winsRequiredForSeries(99)).toBe(2))
})

// ── isSeriesComplete ─────────────────────────────────────────────────────────

function makeCompleteGame({ radiantWin, radiantTeam = 'Team A', direTeam = 'Team B' } = {}) {
  return { radiantWin, radiantTeam, direTeam }
}

describe('isSeriesComplete', () => {
  it('returns false for null or empty input', () => {
    expect(isSeriesComplete(null)).toBe(false)
    expect(isSeriesComplete({ games: [] })).toBe(false)
  })

  it('is complete for a BO1 after 1 game', () => {
    const series = { seriesType: 0, games: [makeCompleteGame({ radiantWin: true })] }
    expect(isSeriesComplete(series)).toBe(true)
  })

  it('is complete for a 2-0 BO3', () => {
    const series = {
      seriesType: 1,
      games: [makeCompleteGame({ radiantWin: true }), makeCompleteGame({ radiantWin: true })],
    }
    expect(isSeriesComplete(series)).toBe(true)
  })

  it('is not complete for a BO3 after only 1 game', () => {
    const series = { seriesType: 1, games: [makeCompleteGame({ radiantWin: true })] }
    expect(isSeriesComplete(series)).toBe(false)
  })

  it('is complete for a BO2 draw (seriesType 3, 1-1 after 2 games)', () => {
    const series = {
      seriesType: 3,
      games: [makeCompleteGame({ radiantWin: true }), makeCompleteGame({ radiantWin: false })],
    }
    expect(isSeriesComplete(series)).toBe(true)
  })

  it('is NOT complete for a BO3 (seriesType 1) at 1-1 — G3 still to play', () => {
    const series = {
      seriesType: 1,
      games: [makeCompleteGame({ radiantWin: true }), makeCompleteGame({ radiantWin: false })],
    }
    expect(isSeriesComplete(series)).toBe(false)
  })

  it('is not complete for a BO2 after only 1 game', () => {
    const series = { seriesType: 3, games: [makeCompleteGame({ radiantWin: true })] }
    expect(isSeriesComplete(series)).toBe(false)
  })
})

// ── groupIntoSeries — BO2 draw handling ──────────────────────────────────────

describe('groupIntoSeries — BO2 draw is not dropped as incomplete', () => {
  it('keeps a completed BO2 1-1 draw in results (seriesType 3)', () => {
    const game1 = makeGame({ seriesId: 99, seriesType: 3, startTime: 1_741_900_000, radiantWin: true })
    const game2 = makeGame({ seriesId: 99, seriesType: 3, startTime: 1_741_900_100, radiantWin: false })
    const result = groupIntoSeries([game1, game2])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(2)
  })
})

// ── groupIntoSeries — null series_id orphan merge ─────────────────────────────

describe('groupIntoSeries — null series_id game merged into numbered series', () => {
  it('merges a null-seriesId game into a numbered series with the same teams, tournament, and within 12h', () => {
    // Games 1 & 2 have seriesId 1099664 (1-1 BO3, incomplete without G3)
    const g1 = makeGame({ seriesId: 1099664, seriesType: 1, startTime: 1_741_800_000, radiantWin: true })
    const g2 = makeGame({ seriesId: 1099664, seriesType: 1, startTime: 1_741_803_600, radiantWin: false })
    // Game 3 has null seriesId — OpenDota omitted it
    const g3 = makeGame({ seriesId: null, seriesType: 1, startTime: 1_741_807_200, radiantWin: true })

    const result = groupIntoSeries([g1, g2, g3])
    // All three games should be in one series, making it complete (2-1)
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(3)
    expect(result[0].id).toBe('1099664')
  })

  it('does not merge null-seriesId game into a numbered series with different teams', () => {
    const g1 = makeGame({ seriesId: 55, seriesType: 0, radiantTeam: 'Team A', direTeam: 'Team B', startTime: 1_741_800_000, radiantWin: true })
    const g2 = makeGame({ seriesId: null, seriesType: 0, radiantTeam: 'Team C', direTeam: 'Team D', startTime: 1_741_800_100, radiantWin: true })

    const result = groupIntoSeries([g1, g2])
    expect(result).toHaveLength(2)
  })

  it('does not merge null-seriesId game into a numbered series more than 12h apart', () => {
    const BASE = 1_741_800_000
    const g1 = makeGame({ seriesId: 77, seriesType: 0, startTime: BASE, radiantWin: true })
    // 13h later — too far
    const g2 = makeGame({ seriesId: null, seriesType: 0, startTime: BASE + 13 * 3600, radiantWin: true })

    const result = groupIntoSeries([g1, g2])
    // Each is its own complete BO1, and they're too far apart to merge
    expect(result).toHaveLength(2)
  })
})

// ── formatDateRange ──────────────────────────────────────────────────────────

describe('formatDateRange', () => {
  it('returns null when beginAt is falsy', () => {
    expect(formatDateRange(null, null)).toBeNull()
    expect(formatDateRange('', '')).toBeNull()
    expect(formatDateRange(undefined, undefined)).toBeNull()
  })

  it('returns just the start date when endAt is missing', () => {
    const result = formatDateRange('2025-03-01T20:00:00Z', null)
    expect(result).toBe('Mar 1')
  })

  it('returns a range string when both dates are provided', () => {
    const result = formatDateRange('2025-03-01T20:00:00Z', '2025-03-15T20:00:00Z')
    expect(result).toMatch(/Mar 1/)
    expect(result).toMatch(/Mar 15/)
    expect(result).toContain(' - ')
  })

  it('includes the year in the end date but not the start date', () => {
    const result = formatDateRange('2025-03-01T20:00:00Z', '2025-03-15T20:00:00Z')
    expect(result).toMatch(/2025/)
    const parts = result.split(' - ')
    expect(parts[0]).not.toMatch(/\d{4}/)
    expect(parts[1]).toMatch(/\d{4}/)
  })
})

// ── getSeriesWins ────────────────────────────────────────────────────────────

function makeSeries(games) {
  return { games }
}

function makeMatchGame({ radiantWin, radiantTeam = 'Radiant', direTeam = 'Dire' } = {}) {
  return { radiantWin, radiantTeam, direTeam }
}

describe('getSeriesWins', () => {
  it('returns 2-0 when radiant sweeps a BO3', () => {
    const series = makeSeries([
      makeMatchGame({ radiantWin: true }),
      makeMatchGame({ radiantWin: true }),
    ])
    expect(getSeriesWins(series)).toEqual({ radiantWins: 2, direWins: 0 })
  })

  it('returns 0-2 when dire sweeps a BO3', () => {
    const series = makeSeries([
      makeMatchGame({ radiantWin: false }),
      makeMatchGame({ radiantWin: false }),
    ])
    expect(getSeriesWins(series)).toEqual({ radiantWins: 0, direWins: 2 })
  })

  it('returns 1-1 for a split BO3 after two games', () => {
    const series = makeSeries([
      makeMatchGame({ radiantWin: true }),
      makeMatchGame({ radiantWin: false }),
    ])
    expect(getSeriesWins(series)).toEqual({ radiantWins: 1, direWins: 1 })
  })

  it('returns 3-2 for a full BO5 won by radiant', () => {
    const series = makeSeries([
      makeMatchGame({ radiantWin: true }),
      makeMatchGame({ radiantWin: false }),
      makeMatchGame({ radiantWin: true }),
      makeMatchGame({ radiantWin: false }),
      makeMatchGame({ radiantWin: true }),
    ])
    expect(getSeriesWins(series)).toEqual({ radiantWins: 3, direWins: 2 })
  })

  it('counts wins correctly when team names differ per game (swap sides)', () => {
    // Game 1: Radiant=Team A wins; Game 2: Radiant=Team B wins (Team A on Dire side)
    // getSeriesWins uses games[0] teams as the canonical reference — both games use the same teams
    const series = makeSeries([
      { radiantWin: true, radiantTeam: 'Team A', direTeam: 'Team B' },
      { radiantWin: false, radiantTeam: 'Team A', direTeam: 'Team B' }, // Dire (Team B) wins
    ])
    expect(getSeriesWins(series)).toEqual({ radiantWins: 1, direWins: 1 })
  })
})

// ── normalizeTournamentKey ───────────────────────────────────────────────────

describe('normalizeTournamentKey', () => {
  it('expands abbreviated season number to match full form', () => {
    expect(normalizeTournamentKey('DreamLeague S29')).toBe('dreamleague season 29')
    expect(normalizeTournamentKey('DreamLeague Season 29')).toBe('dreamleague season 29')
  })

  it('strips punctuation and extra whitespace', () => {
    expect(normalizeTournamentKey('PGL Wallachia S2!')).toBe('pgl wallachia season 2')
  })

  it('converts Roman numeral season designators so S7 and VII match', () => {
    expect(normalizeTournamentKey('Blast Slam S7')).toBe('blast slam season 7')
    expect(normalizeTournamentKey('Blast Slam VII')).toBe('blast slam season 7')
    expect(normalizeTournamentKey('ESL One VIII')).toBe('esl one season 8')
    expect(normalizeTournamentKey('Tournament Season VII')).toBe('tournament season 7')
  })

  it('falls back to "other" for empty/falsy input', () => {
    expect(normalizeTournamentKey(null)).toBe('other')
    expect(normalizeTournamentKey('')).toBe('other')
  })

  it('merges PandaScore and OpenDota TI qualifier names into one key', () => {
    // PS: "The International REGION Closed Qualifier"
    // OD: "The International 2026 - Regional Qualifier REGION"
    expect(normalizeTournamentKey('THE INTERNATIONAL EUROPE CLOSED QUALIFIER'))
      .toBe('the international europe qualifier')
    expect(normalizeTournamentKey('THE INTERNATIONAL 2026 - REGIONAL QUALIFIER EUROPE'))
      .toBe('the international europe qualifier')
    expect(normalizeTournamentKey('THE INTERNATIONAL SOUTHEAST ASIA CLOSED QUALIFIER'))
      .toBe('the international southeast asia qualifier')
    expect(normalizeTournamentKey('THE INTERNATIONAL 2026 - REGIONAL QUALIFIER SOUTHEAST ASIA'))
      .toBe('the international southeast asia qualifier')
  })

  it('enables prefix-based tournament ID lookup across Roman/Arabic naming conventions', () => {
    // OpenDota uses "BLAST Slam VII"; PandaScore uses "BLAST Slam Season 7 2026 - Group Stage".
    // The HomeFeed findTournamentId function does:
    //   nk.startsWith(normalizedFeed + ' ')
    // Both should normalize to the same base so the startsWith check succeeds.
    const feedName = normalizeTournamentKey('BLAST Slam VII')          // from OpenDota
    const psKey    = normalizeTournamentKey('BLAST Slam Season 7 2026 - Group Stage') // PS map key
    expect(feedName).toBe('blast slam season 7')
    expect(psKey.startsWith(feedName + ' ')).toBe(true)

    // Same check for shorthand S7 variant
    const feedS7 = normalizeTournamentKey('BLAST Slam S7')
    expect(feedS7).toBe('blast slam season 7')
    expect(psKey.startsWith(feedS7 + ' ')).toBe(true)

    // No false positive: "season 7" should NOT prefix-match "season 72"
    const psKey72 = normalizeTournamentKey('BLAST Slam Season 72 2026 - Group Stage')
    expect(psKey72.startsWith(feedName + ' ')).toBe(false)
  })
})

// ── buildTournamentName ──────────────────────────────────────────────────────

describe('buildTournamentName', () => {
  it('prepends league when serie lacks the org prefix', () => {
    // PandaScore DreamLeague S29 sends serie="Season 29 2026", league="DreamLeague"
    expect(buildTournamentName('DreamLeague', 'Season 29 2026')).toBe('DreamLeague Season 29 2026')
  })

  it('returns serie unchanged when it already contains the league name', () => {
    expect(buildTournamentName('DreamLeague', 'DreamLeague Season 29 2026')).toBe('DreamLeague Season 29 2026')
  })

  it('is case-insensitive when checking if serie contains league', () => {
    expect(buildTournamentName('PGL', 'pgl wallachia season 7')).toBe('pgl wallachia season 7')
  })

  it('returns league alone when serie is empty', () => {
    expect(buildTournamentName('DreamLeague', '')).toBe('DreamLeague')
  })

  it('returns serie alone when league is empty', () => {
    // Residual edge case: still only produces the suffix, but at least does not crash
    expect(buildTournamentName('', 'Season 29 2026')).toBe('Season 29 2026')
  })

  it('returns empty string when both are empty', () => {
    expect(buildTournamentName('', '')).toBe('')
  })
})

describe('tournamentStageLabel', () => {
  it('strips the league prefix and year, leaving the distinguishing stage', () => {
    expect(tournamentStageLabel('The International 2026 - Regional Qualifier - Europe', 'The International'))
      .toBe('Regional Qualifier - Europe')
  })

  it('disambiguates two parallel events that share a prefix', () => {
    const org = 'The International'
    const a = tournamentStageLabel('The International 2026 - Regional Qualifier - Europe', org)
    const b = tournamentStageLabel('The International 2026 - Regional Qualifier - South America', org)
    expect(a).not.toBe(b)
  })

  it('strips the prefix when no year is present', () => {
    expect(tournamentStageLabel('DreamLeague Season 29', 'DreamLeague')).toBe('Season 29')
  })

  it('is case-insensitive against the org', () => {
    expect(tournamentStageLabel('the international 2026 - Grand Final', 'The International')).toBe('Grand Final')
  })

  it('falls back to the full name when stripping would leave nothing', () => {
    expect(tournamentStageLabel('The International 2026', 'The International')).toBe('The International 2026')
  })

  it('returns the full name when no org is known', () => {
    expect(tournamentStageLabel('Some Unknown Cup 2026', null)).toBe('Some Unknown Cup 2026')
  })

  it('does not strip a mid-string occurrence of the org', () => {
    // org only stripped as a leading prefix, never elsewhere
    expect(tournamentStageLabel('Qualifier for The International', 'The International'))
      .toBe('Qualifier for The International')
  })

  it('returns empty string for empty name', () => {
    expect(tournamentStageLabel('', 'The International')).toBe('')
  })
})

// ── buildTournamentCards ─────────────────────────────────────────────────────

const NOW = 1_700_000_000 // fixed unix timestamp for deterministic tests

function makeLive(tournament, teamA = 'Team A', teamB = 'Team B') {
  return { tournament, teamA, teamB }
}

function makeUpcoming(tournament, scheduledAt, teamA = 'Team A', teamB = 'Team B') {
  return { tournament, scheduledAt, teamA, teamB }
}

function makeCompleted(tournament, startTime, radiantTeam = 'Team A', direTeam = 'Team B') {
  return { tournament, startTime, games: [{ radiantTeam, direTeam, radiantWin: true }] }
}

describe('buildTournamentCards', () => {
  it('returns one card per unique tournament', () => {
    const cards = buildTournamentCards(
      [makeLive('DreamLeague S29')],
      [makeUpcoming('ESL One', new Date(NOW * 1000).toISOString())],
      [],
      [],
      NOW
    )
    expect(cards).toHaveLength(2)
    expect(cards.map(c => c.tournament)).toContain('DreamLeague S29')
    expect(cards.map(c => c.tournament)).toContain('ESL One')
  })

  it('merges PandaScore "S29" name with OpenDota "Season 29" name into one card', () => {
    const cards = buildTournamentCards(
      [makeLive('DreamLeague S29')],
      [],
      [makeCompleted('DreamLeague Season 29', NOW - 3600)],
      [],
      NOW
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].liveMatches).toHaveLength(1)
    expect(cards[0].completedSeries).toHaveLength(1)
  })

  it('puts live cards first', () => {
    const cards = buildTournamentCards(
      [makeLive('Live Event')],
      [makeUpcoming('Upcoming Event', new Date((NOW + 3600) * 1000).toISOString())],
      [makeCompleted('Old Event', NOW - 7200)],
      [],
      NOW
    )
    expect(cards[0].tournament).toBe('Live Event')
  })

  it('puts upcoming cards before completed cards', () => {
    const cards = buildTournamentCards(
      [],
      [makeUpcoming('Upcoming Event', new Date((NOW + 3600) * 1000).toISOString())],
      [makeCompleted('Old Event', NOW - 7200)],
      [],
      NOW
    )
    expect(cards[0].tournament).toBe('Upcoming Event')
  })

  it('floats a followed-team completed card above an unfollowed completed card', () => {
    const cards = buildTournamentCards(
      [],
      [],
      [
        makeCompleted('Unfollowed Event', NOW - 1800, 'Other A', 'Other B'),
        makeCompleted('Followed Event', NOW - 3600, 'Team Liquid', 'Tundra'),
      ],
      ['Team Liquid'],
      NOW
    )
    // Followed card sorts first even though it is older
    expect(cards[0].tournament).toBe('Followed Event')
    expect(cards[0].hasFollowed).toBe(true)
  })

  it('sorts upcoming above followed-team completed (live > upcoming > followed > recency)', () => {
    const cards = buildTournamentCards(
      [],
      [makeUpcoming('Upcoming Event', new Date((NOW + 3600) * 1000).toISOString(), 'Other A', 'Other B')],
      [makeCompleted('Followed Event', NOW - 3600, 'Team Liquid', 'Tundra')],
      ['Team Liquid'],
      NOW
    )
    expect(cards[0].tournament).toBe('Upcoming Event')
    expect(cards[1].hasFollowed).toBe(true)
  })

  it('sorts two completed cards by recency when neither is followed', () => {
    const cards = buildTournamentCards(
      [],
      [],
      [
        makeCompleted('Older Event', NOW - 7200),
        makeCompleted('Newer Event', NOW - 1800),
      ],
      [],
      NOW
    )
    expect(cards[0].tournament).toBe('Newer Event')
    expect(cards[1].tournament).toBe('Older Event')
  })

  it('floats followed-team rows to the top within a completed card', () => {
    const cards = buildTournamentCards(
      [],
      [],
      [
        makeCompleted('DreamLeague S29', NOW - 3600, 'Random Team', 'Other Team'),
        makeCompleted('DreamLeague S29', NOW - 1800, 'Team Liquid', 'Tundra'),
      ],
      ['Team Liquid'],
      NOW
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].completedSeries[0].games[0].radiantTeam).toBe('Team Liquid')
  })

  it('returns empty array when all inputs are empty', () => {
    expect(buildTournamentCards([], [], [], [], NOW)).toEqual([])
  })

  it('sets hasLive and hasUpcoming flags correctly', () => {
    const cards = buildTournamentCards(
      [makeLive('ESL One')],
      [makeUpcoming('ESL One', new Date((NOW + 3600) * 1000).toISOString())],
      [],
      [],
      NOW
    )
    expect(cards[0].hasLive).toBe(true)
    expect(cards[0].hasUpcoming).toBe(true)
  })
})

// ── trackEvent ───────────────────────────────────────────────────────────────

describe('trackEvent', () => {
  beforeEach(() => {
    delete window.gtag
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete window.gtag
  })

  it('calls window.gtag when it is defined', () => {
    window.gtag = vi.fn()
    trackEvent('test_event', { foo: 'bar' })
    expect(window.gtag).toHaveBeenCalledWith('event', 'test_event', { foo: 'bar' })
  })

  it('does not throw when window.gtag is not defined', () => {
    expect(() => trackEvent('test_event', {})).not.toThrow()
  })

  it('calls the vercel track function', async () => {
    const { track } = await import('@vercel/analytics')
    trackEvent('test_event', { key: 'value' })
    expect(track).toHaveBeenCalledWith('test_event', { key: 'value' })
  })
})

// ── groupIntoSeries — third pass: split series_ids ───────────────────────────

const BASE = 1_780_000_000

describe('groupIntoSeries — third pass merges stubs with split series_ids', () => {
  it('T1: merges two BO3 games with different series_ids (Spirit vs OG pattern)', () => {
    // G1 and G2 both incomplete (0 wins each — 1-1 pending G3)
    const g1 = makeGame({ seriesId: 1000, seriesType: 1, startTime: BASE,          radiantWin: false })
    const g2 = makeGame({ seriesId: 1001, seriesType: 1, startTime: BASE + 73 * 60, radiantWin: false })
    const result = groupIntoSeries([g1, g2])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(2)
    expect(result[0].id).toBe('1000') // lower series_id is canonical
  })

  it('T2: merges three games all with different series_ids into one complete BO3', () => {
    // A wins G1 and G3 → 2-1 complete
    const g1 = makeGame({ seriesId: 1000, seriesType: 1, startTime: BASE,           radiantWin: true  })
    const g2 = makeGame({ seriesId: 1001, seriesType: 1, startTime: BASE + 60 * 60, radiantWin: false })
    const g3 = makeGame({ seriesId: 1002, seriesType: 1, startTime: BASE + 120 * 60, radiantWin: true })
    const result = groupIntoSeries([g1, g2, g3])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(3)
    expect(isSeriesComplete(result[0])).toBe(true)
  })

  it('T3: does not merge stubs when games are 8 hours apart', () => {
    const g1 = makeGame({ seriesId: 1000, seriesType: 0, startTime: BASE,               radiantWin: true })
    const g2 = makeGame({ seriesId: 1001, seriesType: 0, startTime: BASE + 8 * 3600,    radiantWin: true })
    const result = groupIntoSeries([g1, g2])
    expect(result).toHaveLength(2)
  })

  it('T4: does not merge complete BO1 stubs (separate legitimate BO1s)', () => {
    // Both are complete BO1s — third pass must leave them alone
    const g1 = makeGame({ seriesId: 1000, seriesType: 0, startTime: BASE,            radiantWin: true })
    const g2 = makeGame({ seriesId: 1001, seriesType: 0, startTime: BASE + 30 * 60,  radiantWin: true })
    const result = groupIntoSeries([g1, g2])
    expect(result).toHaveLength(2)
  })

  it('T5: does not merge when combined games would exceed the series-type max (BO3 max=3)', () => {
    // Each stub has 2 games (1-1 each); combined = 4 > maxGamesForSeries(BO3)=3.
    // Both are incomplete so pagination drops the older stub1000.
    // Guard working → surviving stub1001 has 2 games; guard broken → 4 games in 1 merged series.
    const g1a = makeGame({ seriesId: 1000, seriesType: 1, startTime: BASE,            radiantWin: true  })
    const g1b = makeGame({ seriesId: 1000, seriesType: 1, startTime: BASE + 40 * 60,  radiantWin: false })
    const g2a = makeGame({ seriesId: 1001, seriesType: 1, startTime: BASE + 80 * 60,  radiantWin: true  })
    const g2b = makeGame({ seriesId: 1001, seriesType: 1, startTime: BASE + 120 * 60, radiantWin: false })
    const result = groupIntoSeries([g1a, g1b, g2a, g2b])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(2) // 2 not 4 — max-games guard blocked the merge
  })

  it('T6: does not merge stubs from different tournaments', () => {
    // Both stubs incomplete; pagination drops the older stub1000.
    // Guard working → surviving stub1001 has 1 game (DreamLeague); broken → 2 games merged.
    const g1 = makeGame({ seriesId: 1000, seriesType: 1, startTime: BASE,            tournament: 'BLAST Slam S7',  radiantWin: false })
    const g2 = makeGame({ seriesId: 1001, seriesType: 1, startTime: BASE + 60 * 60,  tournament: 'DreamLeague S25', radiantWin: false })
    const result = groupIntoSeries([g1, g2])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(1) // 1 not 2 — different-tournament guard blocked the merge
    expect(result[0].games[0].tournament).toBe('DreamLeague S25')
  })

  it('T7: regression — null-series-id second pass still works alongside third pass', () => {
    const g1 = makeGame({ seriesId: 99, seriesType: 1, startTime: BASE,              radiantWin: true  })
    const g2 = makeGame({ seriesId: 99, seriesType: 1, startTime: BASE + 3600,       radiantWin: false })
    const g3 = makeGame({ seriesId: null, seriesType: 1, startTime: BASE + 7200,     radiantWin: true  })
    const result = groupIntoSeries([g1, g2, g3])
    expect(result).toHaveLength(1)
    expect(result[0].games).toHaveLength(3)
    expect(result[0].id).toBe('99')
  })
})

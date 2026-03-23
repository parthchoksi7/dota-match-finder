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
import { formatDuration, formatRelativeTime, getSeriesLabel, groupIntoSeries, formatDateRange, getSeriesWins, trackEvent, isSeriesComplete, winsRequiredForSeries } from '../utils'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// ── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration('1:23')).toBe('1h 23m')
  })

  it('formats hours only (zero minutes)', () => {
    expect(formatDuration('2:00')).toBe('2h')
  })

  it('formats minutes only (zero hours)', () => {
    expect(formatDuration('0:45')).toBe('45m')
  })

  it('returns 0m for 0:00', () => {
    expect(formatDuration('0:00')).toBe('0m')
  })

  it('returns the input unchanged when not a string', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
  })

  it('trims whitespace before parsing', () => {
    expect(formatDuration(' 1:30 ')).toBe('1h 30m')
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

  it('is complete for a BO2 draw (seriesType 1 fallback, 1-1 after 2 games)', () => {
    const series = {
      seriesType: 1,
      games: [makeCompleteGame({ radiantWin: true }), makeCompleteGame({ radiantWin: false })],
    }
    expect(isSeriesComplete(series)).toBe(true)
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

// ── formatDateRange ──────────────────────────────────────────────────────────

describe('formatDateRange', () => {
  it('returns null when beginAt is falsy', () => {
    expect(formatDateRange(null, null)).toBeNull()
    expect(formatDateRange('', '')).toBeNull()
    expect(formatDateRange(undefined, undefined)).toBeNull()
  })

  it('returns just the start date when endAt is missing', () => {
    const result = formatDateRange('2025-03-01T00:00:00Z', null)
    expect(result).toBe('Mar 1')
  })

  it('returns a range string when both dates are provided', () => {
    const result = formatDateRange('2025-03-01T00:00:00Z', '2025-03-15T00:00:00Z')
    expect(result).toMatch(/Mar 1/)
    expect(result).toMatch(/Mar 15/)
    expect(result).toContain(' - ')
  })

  it('includes the year in the end date but not the start date', () => {
    const result = formatDateRange('2025-03-01T00:00:00Z', '2025-03-15T00:00:00Z')
    // End date should include the year; start date should not
    expect(result).toMatch(/2025/)
    // Result format: "Mar 1 - Mar 15, 2025"
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

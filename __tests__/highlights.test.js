/**
 * Unit tests for matchHighlightsToSeries in src/api.js.
 * Pure function — no external dependencies, no mocking needed.
 */

import { describe, it, expect } from 'vitest'
import { matchHighlightsToSeries } from '../src/api.js'

// Unix timestamp helpers (seconds)
const t = (isoStr) => Math.floor(new Date(isoStr).getTime() / 1000)

function makeVideo(videoId, title, publishedAt) {
  return { videoId, title, publishedAt, thumbnail: '' }
}

// ── Basic matching ──────────────────────────────────────────────────────────

describe('matchHighlightsToSeries', () => {
  it('returns null when videos array is empty', () => {
    expect(matchHighlightsToSeries([], 'OG', 'Team Liquid', t('2026-05-01T12:00:00Z'))).toBeNull()
  })

  it('returns null when no video title contains either team name', () => {
    const videos = [
      makeVideo('aaa', 'Team Spirit vs Tundra | Grand Final Highlights', '2026-05-01T15:00:00Z'),
    ]
    expect(matchHighlightsToSeries(videos, 'OG', 'Team Liquid', t('2026-05-01T12:00:00Z'))).toBeNull()
  })

  it('matches when both team names appear in title (case-insensitive)', () => {
    const v = makeVideo('abc', 'OG vs Team Liquid | Grand Final | DreamLeague S29', '2026-05-01T15:00:00Z')
    const result = matchHighlightsToSeries([v], 'OG', 'Team Liquid', t('2026-05-01T12:00:00Z'))
    expect(result?.videoId).toBe('abc')
  })

  it('is case-insensitive for team names', () => {
    const v = makeVideo('xyz', 'og vs team liquid highlights', '2026-05-01T15:00:00Z')
    const result = matchHighlightsToSeries([v], 'OG', 'Team Liquid', t('2026-05-01T12:00:00Z'))
    expect(result?.videoId).toBe('xyz')
  })

  it('matches when only one team name appears in title', () => {
    const v = makeVideo('partial', 'Team Liquid Dominates the Grand Final', '2026-05-01T15:00:00Z')
    const result = matchHighlightsToSeries([v], 'OG', 'Team Liquid', t('2026-05-01T12:00:00Z'))
    expect(result?.videoId).toBe('partial')
  })

  // ── Time anchoring ────────────────────────────────────────────────────────

  it('excludes videos published before seriesStartTime', () => {
    const old = makeVideo('old', 'OG vs Team Liquid highlights', '2026-05-01T10:00:00Z')
    const fresh = makeVideo('fresh', 'OG vs Team Liquid Grand Final', '2026-05-01T15:00:00Z')
    const seriesStart = t('2026-05-01T12:00:00Z')
    const result = matchHighlightsToSeries([old, fresh], 'OG', 'Team Liquid', seriesStart)
    expect(result?.videoId).toBe('fresh')
  })

  it('returns null when all matching videos are before seriesStartTime', () => {
    const v = makeVideo('old', 'OG vs Team Liquid', '2026-05-01T10:00:00Z')
    const seriesStart = t('2026-05-01T12:00:00Z')
    expect(matchHighlightsToSeries([v], 'OG', 'Team Liquid', seriesStart)).toBeNull()
  })

  // ── Two same-team series disambiguation ───────────────────────────────────

  it('picks the earliest post-match video for the correct series when two same-team series exist', () => {
    // Group Stage at 13:00, highlights at 15:00
    const gsHighlight = makeVideo('gs', 'OG vs Team Liquid | Group Stage', '2026-05-01T15:00:00Z')
    // UB Final at 19:00, highlights at 21:00
    const ubHighlight = makeVideo('ub', 'OG vs Team Liquid | Upper Bracket Final', '2026-05-01T21:00:00Z')

    const gsSeriesStart = t('2026-05-01T13:00:00Z')
    const ubSeriesStart = t('2026-05-01T19:00:00Z')

    // Group Stage series → should get gsHighlight (earliest after 13:00)
    const gsResult = matchHighlightsToSeries([gsHighlight, ubHighlight], 'OG', 'Team Liquid', gsSeriesStart)
    expect(gsResult?.videoId).toBe('gs')

    // UB Final series → should get ubHighlight (earliest after 19:00; gsHighlight at 15:00 is excluded)
    const ubResult = matchHighlightsToSeries([gsHighlight, ubHighlight], 'OG', 'Team Liquid', ubSeriesStart)
    expect(ubResult?.videoId).toBe('ub')
  })

  // ── No startTime fallback ─────────────────────────────────────────────────

  it('returns first matching video when seriesStartTime is 0 (no time anchor)', () => {
    const older = makeVideo('a', 'OG vs Team Liquid Day 1', '2026-05-01T10:00:00Z')
    const newer = makeVideo('b', 'OG vs Team Liquid Day 2', '2026-05-02T10:00:00Z')
    const result = matchHighlightsToSeries([newer, older], 'OG', 'Team Liquid', 0)
    // sorts ascending by publishedAt, so 'a' (older) comes first
    expect(result?.videoId).toBe('a')
  })

  // ── Null/missing team names ───────────────────────────────────────────────

  it('returns null when both team names are null/undefined', () => {
    const v = makeVideo('x', 'Some highlights video', '2026-05-01T15:00:00Z')
    expect(matchHighlightsToSeries([v], null, undefined, t('2026-05-01T12:00:00Z'))).toBeNull()
  })

  it('still matches if one team name is null and the other matches', () => {
    const v = makeVideo('y', 'OG vs TBD | Highlights', '2026-05-01T15:00:00Z')
    const result = matchHighlightsToSeries([v], 'OG', null, t('2026-05-01T12:00:00Z'))
    expect(result?.videoId).toBe('y')
  })
})

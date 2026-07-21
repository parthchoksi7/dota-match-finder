/**
 * Tests for the pure formatting helpers in SeriesLivePulse.jsx (Phase 2 "live pulse" — gold
 * lead / kill score / live draft for the currently running game of a live series).
 * Imported directly from the component file, same pattern as computePoints from GoldGraph.jsx
 * in match-stats.test.js.
 */

import { describe, it, expect } from 'vitest'
import { formatGoldMagnitude, formatClock, nextPulseState, zipDraftPicks, formatSpectators } from '../src/components/SeriesLivePulse.jsx'

describe('formatGoldMagnitude', () => {
  it('returns null for a zero lead (dead even — nothing to report)', () => {
    expect(formatGoldMagnitude(0)).toBeNull()
  })

  it('returns null for null/undefined/non-finite', () => {
    expect(formatGoldMagnitude(null)).toBeNull()
    expect(formatGoldMagnitude(undefined)).toBeNull()
    expect(formatGoldMagnitude(NaN)).toBeNull()
  })

  it('formats an under-1000 lead as a plain number with a leading + (attribution is by position, not sign)', () => {
    expect(formatGoldMagnitude(250)).toBe('+250')
  })

  it('returns the same positive magnitude regardless of sign — dire-ahead (negative) still reads "+"', () => {
    expect(formatGoldMagnitude(-250)).toBe('+250')
    expect(formatGoldMagnitude(-1100)).toBe('+1.1k')
  })

  it('formats a lead >= 1000 in k-notation with one decimal', () => {
    expect(formatGoldMagnitude(5200)).toBe('+5.2k')
  })

  it('formats exactly 1000 as +1.0k, not +1000', () => {
    expect(formatGoldMagnitude(1000)).toBe('+1.0k')
  })
})

describe('formatSpectators', () => {
  it('returns null for a zero/negative count (render nothing, not "0 spectators")', () => {
    expect(formatSpectators(0)).toBeNull()
    expect(formatSpectators(-5)).toBeNull()
  })

  it('returns null for null/undefined/non-finite', () => {
    expect(formatSpectators(null)).toBeNull()
    expect(formatSpectators(undefined)).toBeNull()
    expect(formatSpectators(NaN)).toBeNull()
  })

  it('formats an under-1000 count as a plain number (real DotaTV samples: 37, 491, 976)', () => {
    expect(formatSpectators(37)).toBe('37')
    expect(formatSpectators(491)).toBe('491')
    expect(formatSpectators(976)).toBe('976')
  })

  it('formats a count >= 1000 in k-notation with one decimal', () => {
    expect(formatSpectators(5230)).toBe('5.2k')
    expect(formatSpectators(1000)).toBe('1.0k')
  })
})

describe('formatClock', () => {
  it('returns null for null/undefined/non-finite', () => {
    expect(formatClock(null)).toBeNull()
    expect(formatClock(undefined)).toBeNull()
    expect(formatClock(NaN)).toBeNull()
  })

  it('returns null for a negative game_time (draft phase, not yet in-game)', () => {
    expect(formatClock(-79)).toBeNull()
  })

  it('formats 0 as 0:00', () => {
    expect(formatClock(0)).toBe('0:00')
  })

  it('formats seconds under a minute with zero-padded seconds', () => {
    expect(formatClock(45)).toBe('0:45')
  })

  it('formats minutes and seconds correctly', () => {
    expect(formatClock(1320)).toBe('22:00')
    expect(formatClock(125)).toBe('2:05')
  })
})

describe('nextPulseState — retain-last-known-good, bounded (Live Story)', () => {
  const NOW = new Date('2026-07-18T00:10:00.000Z').getTime()
  const prev = { matchId: '1', radiantLead: 5000, capturedAt: '2026-07-18T00:09:00.000Z' } // 60s old at NOW

  it('a fresh pulse always wins, regardless of how recent the previous one was', () => {
    const fresh = { matchId: '2', radiantLead: 9000, capturedAt: '2026-07-18T00:10:00.000Z' }
    expect(nextPulseState(fresh, prev, NOW)).toBe(fresh)
  })

  it('a null poll retains the previous pulse while it is still recent (survives a transient miss)', () => {
    expect(nextPulseState(null, prev, NOW)).toBe(prev)
  })

  it('a null poll does NOT retain a previous pulse older than the staleness bound — a real game transition must still clear', () => {
    const stale = { matchId: '1', radiantLead: 5000, capturedAt: '2026-07-18T00:08:00.000Z' } // 120s old at NOW
    expect(nextPulseState(null, stale, NOW)).toBeNull()
  })

  it('a null poll with no previous pulse stays null (nothing to retain)', () => {
    expect(nextPulseState(null, null, NOW)).toBeNull()
  })

  it('treats a previous pulse with a missing/invalid capturedAt as unknown freshness, not indefinitely fresh', () => {
    expect(nextPulseState(null, { matchId: '1', radiantLead: 5000 }, NOW)).toBeNull()
    expect(nextPulseState(null, { matchId: '1', radiantLead: 5000, capturedAt: 'not-a-date' }, NOW)).toBeNull()
  })
})

describe('zipDraftPicks — hero + live IGN, index-aligned (2026-07-19 richer live draft)', () => {
  const heroMap = {
    82: { key: 'lone_druid', name: 'Lone Druid' },
    26: { key: 'undying', name: 'Undying' },
  }

  it('zips hero ids, hero names/keys (from heroMap), and player names by array position', () => {
    const result = zipDraftPicks([82, 26], ['Kiritych~', 'Kataomi`'], heroMap)
    expect(result).toEqual([
      { key: 'lone_druid', name: 'Lone Druid', player: 'Kiritych~' },
      { key: 'undying', name: 'Undying', player: 'Kataomi`' },
    ])
  })

  it('never mixes a name from one position into another position', () => {
    const result = zipDraftPicks([26, 82], ['Kataomi`', 'Kiritych~'], heroMap)
    expect(result[0]).toEqual({ key: 'undying', name: 'Undying', player: 'Kataomi`' })
    expect(result[1]).toEqual({ key: 'lone_druid', name: 'Lone Druid', player: 'Kiritych~' })
  })

  it('degrades to hero-only (player: null) when playerNames is shorter, missing, or undefined — never throws or misaligns', () => {
    expect(zipDraftPicks([82, 26], ['Kiritych~'], heroMap)[1].player).toBeNull()
    expect(zipDraftPicks([82, 26], undefined, heroMap).every(p => p.player === null)).toBe(true)
    expect(zipDraftPicks([82, 26], null, heroMap).every(p => p.player === null)).toBe(true)
  })

  it('degrades hero key/name to null (not a raw id string) while heroMap is still loading', () => {
    const result = zipDraftPicks([82], ['Kiritych~'], null)
    expect(result).toEqual([{ key: null, name: null, player: 'Kiritych~' }])
  })

  it('degrades hero key/name to null for a hero id not present in heroMap (e.g. hero 0 during draft phase)', () => {
    const result = zipDraftPicks([0], [null], heroMap)
    expect(result).toEqual([{ key: null, name: null, player: null }])
  })

  it('returns [] for missing/empty heroIds', () => {
    expect(zipDraftPicks(undefined, ['a'], heroMap)).toEqual([])
    expect(zipDraftPicks([], [], heroMap)).toEqual([])
  })
})

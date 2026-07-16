/**
 * Tests for the pure resolution helpers of ?mode=live-series-games
 * (api/_handlers/liveSeriesGames.js), which resolves the OpenDota match_id for each finished
 * game of a PandaScore series. The team+time matching itself is findOdMatchByTime (covered in
 * recent-completed.test.js); here we cover the unit-specific logic:
 *   - beginAtToUnix    : PS ISO begin_at -> unix seconds for findOdMatchByTime
 *   - shapeLiveGameMapRows : live_game_map DB rows -> findOdMatchByTime input shape
 *   - pickFinishedGameId : most-authoritative-first selection + the authoritative flag that
 *                          governs whether a resolution may be backfilled to the LOCKED KV
 */

import { describe, it, expect } from 'vitest'
import { beginAtToUnix, shapeLiveGameMapRows, pickFinishedGameId } from '../api/_handlers/liveSeriesGames.js'

describe('beginAtToUnix', () => {
  it('converts an ISO 8601 string to unix seconds', () => {
    expect(beginAtToUnix('2026-07-16T00:00:00.000Z')).toBe(1784160000)
  })

  it('floors sub-second precision', () => {
    expect(beginAtToUnix('2026-07-16T00:00:00.999Z')).toBe(1784160000)
  })

  it('returns null for null/undefined/empty', () => {
    expect(beginAtToUnix(null)).toBeNull()
    expect(beginAtToUnix(undefined)).toBeNull()
    expect(beginAtToUnix('')).toBeNull()
  })

  it('returns null for an unparseable date (never NaN)', () => {
    expect(beginAtToUnix('not-a-date')).toBeNull()
  })
})

describe('shapeLiveGameMapRows', () => {
  it('maps DB rows into findOdMatchByTime input shape', () => {
    const rows = shapeLiveGameMapRows([
      { od_match_id: '8898592653', start_time: '1784163745', radiant_name: 'Team Spirit', dire_name: 'Gaimin Gladiators', league_id: 19924 },
    ])
    expect(rows).toEqual([
      { match_id: 8898592653, start_time: 1784163745, radiant_name: 'Team Spirit', dire_name: 'Gaimin Gladiators' },
    ])
    expect(typeof rows[0].match_id).toBe('number')
    expect(typeof rows[0].start_time).toBe('number')
  })

  it('returns [] for null/empty input', () => {
    expect(shapeLiveGameMapRows(null)).toEqual([])
    expect(shapeLiveGameMapRows([])).toEqual([])
  })
})

describe('pickFinishedGameId — priority order', () => {
  it('prefers PandaScore external_identifier (authoritative)', () => {
    expect(pickFinishedGameId({ externalId: '111', kvId: '222', streamHistoryId: '333', liveGameMapId: '444' }))
      .toEqual({ matchId: '111', authoritative: true })
  })

  it('falls back to KV when no external_identifier (authoritative)', () => {
    expect(pickFinishedGameId({ externalId: null, kvId: '222', streamHistoryId: '333', liveGameMapId: '444' }))
      .toEqual({ matchId: '222', authoritative: true })
  })

  it('falls back to match_stream_history when no external/KV (authoritative, exact key)', () => {
    expect(pickFinishedGameId({ externalId: null, kvId: null, streamHistoryId: '333', liveGameMapId: '444' }))
      .toEqual({ matchId: '333', authoritative: true })
  })

  it('uses live_game_map ONLY as last resort and flags it NON-authoritative', () => {
    expect(pickFinishedGameId({ externalId: null, kvId: null, streamHistoryId: null, liveGameMapId: '444' }))
      .toEqual({ matchId: '444', authoritative: false })
  })

  it('returns no match when every source is null', () => {
    expect(pickFinishedGameId({ externalId: null, kvId: null, streamHistoryId: null, liveGameMapId: null }))
      .toEqual({ matchId: null, authoritative: false })
  })

  it('coerces the chosen id to a string', () => {
    expect(pickFinishedGameId({ externalId: 8898592653 }).matchId).toBe('8898592653')
  })

  it('never marks a fuzzy live_game_map hit authoritative (KV-poisoning guard)', () => {
    // This is the load-bearing invariant: a fuzzy correlation must never be backfilled to the
    // live:game: KV the LOCKED live-matches.js enrichment reads.
    const r = pickFinishedGameId({ externalId: null, kvId: null, streamHistoryId: null, liveGameMapId: '999' })
    expect(r.authoritative).toBe(false)
  })
})

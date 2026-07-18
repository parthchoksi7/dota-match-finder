/**
 * Tests for shapeGoldHistory — the pure shaping step of the Live Story gold-graph history
 * (api/_handlers/liveGamePulse.js, ?mode=live-game-pulse&owner=1), which turns raw live_game_gold
 * rows into the timeseries payload the frontend graph consumes.
 *
 * Focus: dedup-by-game_time, draft/no-lead filtering, recency-capped ordering, field renaming.
 * The KV cache and Supabase read are exercised in prod, not unit-mocked here (same convention as
 * live-od-capture.test.js).
 */

import { describe, it, expect } from 'vitest'
import { shapeGoldHistory, GOLD_HISTORY_MAX_POINTS } from '../api/_handlers/liveGamePulse.js'

function row(overrides = {}) {
  return {
    game_time: 600,
    radiant_lead: 1500,
    radiant_score: 5,
    dire_score: 3,
    captured_at: '2026-07-17T00:10:00.000Z',
    ...overrides,
  }
}

describe('shapeGoldHistory — filtering', () => {
  it('drops draft-phase points (negative game_time)', () => {
    expect(shapeGoldHistory([row({ game_time: -79 })])).toEqual([])
  })

  it('keeps game_time 0 (the instant the game starts)', () => {
    const [point] = shapeGoldHistory([row({ game_time: 0 })])
    expect(point.t).toBe(0)
  })

  it('drops points with a null radiant_lead (never got a reading)', () => {
    expect(shapeGoldHistory([row({ radiant_lead: null })])).toEqual([])
  })

  it('keeps a zero net-worth lead (dead even is a real point, not missing data)', () => {
    const [point] = shapeGoldHistory([row({ radiant_lead: 0 })])
    expect(point.lead).toBe(0)
  })

  it('returns [] for non-array input', () => {
    expect(shapeGoldHistory(null)).toEqual([])
    expect(shapeGoldHistory(undefined)).toEqual([])
  })

  it('drops falsy entries without throwing', () => {
    expect(shapeGoldHistory([null, undefined, row()])).toHaveLength(1)
  })
})

describe('shapeGoldHistory — dedup by game_time', () => {
  it('keeps only the latest captured_at when two rows share a game_time', () => {
    const older = row({ game_time: 600, radiant_lead: 1000, captured_at: '2026-07-17T00:10:00.000Z' })
    const newer = row({ game_time: 600, radiant_lead: 1800, captured_at: '2026-07-17T00:10:05.000Z' })
    const result = shapeGoldHistory([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0].lead).toBe(1800)
  })

  it('is order-independent (newer row first still wins on captured_at, not array position)', () => {
    const older = row({ game_time: 600, radiant_lead: 1000, captured_at: '2026-07-17T00:10:00.000Z' })
    const newer = row({ game_time: 600, radiant_lead: 1800, captured_at: '2026-07-17T00:10:05.000Z' })
    const result = shapeGoldHistory([newer, older])
    expect(result[0].lead).toBe(1800)
  })
})

describe('shapeGoldHistory — ordering, capping, and field shape', () => {
  it('sorts ascending by game_time regardless of input order', () => {
    const rows = [row({ game_time: 900 }), row({ game_time: 0 }), row({ game_time: 300 })]
    expect(shapeGoldHistory(rows).map(p => p.t)).toEqual([0, 300, 900])
  })

  it('caps to the most recent GOLD_HISTORY_MAX_POINTS points, not an arbitrary slice', () => {
    const total = GOLD_HISTORY_MAX_POINTS + 20
    const rows = Array.from({ length: total }, (_, i) => row({ game_time: i * 60 }))
    const result = shapeGoldHistory(rows)
    expect(result).toHaveLength(GOLD_HISTORY_MAX_POINTS)
    // the earliest 20 points must be dropped, keeping the most recent GOLD_HISTORY_MAX_POINTS
    expect(result[0].t).toBe(20 * 60)
    expect(result[result.length - 1].t).toBe((total - 1) * 60)
  })

  it('renames fields to the compact {t, lead, rk, dk} wire shape', () => {
    const [point] = shapeGoldHistory([row({ game_time: 600, radiant_lead: 1234, radiant_score: 7, dire_score: 4 })])
    expect(point).toEqual({ t: 600, lead: 1234, rk: 7, dk: 4 })
  })
})

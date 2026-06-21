/**
 * Tests for computeStreamsBackfill() in scripts/backfill-streams-json.mjs — the pure
 * decision that widens match_stream_history.streams_json from PandaScore streams_list.
 * It must add new streams (incl. unofficial), never shrink, and be idempotent.
 */

import { describe, it, expect } from 'vitest'
import { computeStreamsBackfill } from '../scripts/backfill-streams-json.mjs'

const pglEn = { official: true, main: true, language: 'en', raw_url: 'https://www.twitch.tv/pgl_dota2' }
const winlineRu = { official: false, main: false, language: 'ru', raw_url: 'https://www.twitch.tv/dota2_winline_ru' }

describe('computeStreamsBackfill', () => {
  it('adds an unofficial stream missing from an official-only row', () => {
    const existing = [{ raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true }]
    const { allStreams, added, shouldUpdate } = computeStreamsBackfill(existing, [pglEn, winlineRu])
    expect(shouldUpdate).toBe(true)
    expect(added.map(s => s.channel)).toEqual(['dota2_winline_ru'])
    // full set is rewritten with the canonical shape (source/channel present)
    expect(allStreams).toHaveLength(2)
    expect(allStreams.every(s => 'source' in s && 'channel' in s)).toBe(true)
  })

  it('upgrades a legacy null streams_json row', () => {
    const { added, shouldUpdate } = computeStreamsBackfill(null, [pglEn, winlineRu])
    expect(shouldUpdate).toBe(true)
    expect(added).toHaveLength(2)
  })

  it('is idempotent — no update when all PS streams already stored', () => {
    const existing = [
      { raw_url: 'https://www.twitch.tv/pgl_dota2', source: 'twitch', channel: 'pgl_dota2' },
      { raw_url: 'https://www.twitch.tv/dota2_winline_ru', source: 'twitch', channel: 'dota2_winline_ru' },
    ]
    const { added, shouldUpdate } = computeStreamsBackfill(existing, [pglEn, winlineRu])
    expect(shouldUpdate).toBe(false)
    expect(added).toHaveLength(0)
  })

  it('never shrinks — PandaScore returning an empty list does not update', () => {
    const existing = [{ raw_url: 'https://www.twitch.tv/pgl_dota2', source: 'twitch', channel: 'pgl_dota2' }]
    const { shouldUpdate } = computeStreamsBackfill(existing, [])
    expect(shouldUpdate).toBe(false)
  })

  it('null PandaScore streams_list is a no-op', () => {
    const { shouldUpdate, added } = computeStreamsBackfill(null, null)
    expect(shouldUpdate).toBe(false)
    expect(added).toHaveLength(0)
  })
})

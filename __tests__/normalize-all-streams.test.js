/**
 * Tests for normalizeAllStreams() in api/_shared.js — the helper that captures
 * every stream URL (all languages, all sources, official AND unofficial) for storage
 * in match_stream_history.streams_json. Shared by both Supabase write-paths
 * (live-matches.js + match-streams.js). Drives the internal VOD-URL browser.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class {} }))

import { normalizeAllStreams } from '../api/_shared.js'

describe('normalizeAllStreams', () => {
  it('returns [] for null/empty input', () => {
    expect(normalizeAllStreams(null)).toEqual([])
    expect(normalizeAllStreams([])).toEqual([])
  })

  it('drops entries with no raw_url', () => {
    const out = normalizeAllStreams([{ language: 'en', official: true }])
    expect(out).toEqual([])
  })

  it('keeps unofficial streams (not just official)', () => {
    const out = normalizeAllStreams([
      { official: false, language: 'ru', raw_url: 'https://www.twitch.tv/dota2_winline_ru' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].official).toBe(false)
    expect(out[0].channel).toBe('dota2_winline_ru')
  })

  it('keeps all languages', () => {
    const out = normalizeAllStreams([
      { official: true, language: 'en', raw_url: 'https://www.twitch.tv/pgl_dota2' },
      { official: true, language: 'ru', raw_url: 'https://www.twitch.tv/pgl_dota2ru' },
      { official: true, language: 'zh', raw_url: 'https://www.twitch.tv/pgl_dota2cn' },
    ])
    expect(out.map(s => s.language)).toEqual(['en', 'ru', 'zh'])
  })

  it('classifies twitch source and extracts channel login', () => {
    const out = normalizeAllStreams([
      { official: true, main: true, language: 'en', raw_url: 'https://www.twitch.tv/esl_dota2' },
    ])
    expect(out[0]).toMatchObject({ source: 'twitch', channel: 'esl_dota2', main: true })
  })

  it('handles twitch urls without www and with trailing slash', () => {
    const out = normalizeAllStreams([
      { raw_url: 'http://twitch.tv/some_channel/' },
    ])
    expect(out[0]).toMatchObject({ source: 'twitch', channel: 'some_channel' })
  })

  it('classifies youtube source with null channel', () => {
    const yt = normalizeAllStreams([{ raw_url: 'https://www.youtube.com/watch?v=abc', language: 'en' }])
    expect(yt[0]).toMatchObject({ source: 'youtube', channel: null })
    const ytShort = normalizeAllStreams([{ raw_url: 'https://youtu.be/abc' }])
    expect(ytShort[0].source).toBe('youtube')
  })

  it('classifies unknown platforms as other', () => {
    const out = normalizeAllStreams([{ raw_url: 'https://vk.com/video123' }])
    expect(out[0]).toMatchObject({ source: 'other', channel: null })
  })

  it('coerces missing official/main to false and missing language to null', () => {
    const out = normalizeAllStreams([{ raw_url: 'https://www.twitch.tv/x' }])
    expect(out[0]).toMatchObject({ official: false, main: false, language: null })
  })
})

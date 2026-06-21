/**
 * Tests for the internal VOD-URL browser grouping logic (api/pipeline/_vod-urls.js).
 * Pure functions: row → Series → Games → main/other URLs + replay-available.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyStreamSource,
  twitchChannelFromUrl,
  normalizeStreamEl,
  buildGameUrls,
  groupSeriesFromRows,
} from '../api/pipeline/_vod-urls.js'

describe('classifyStreamSource / twitchChannelFromUrl', () => {
  it('classifies sources', () => {
    expect(classifyStreamSource('https://www.twitch.tv/pgl_dota2')).toBe('twitch')
    expect(classifyStreamSource('https://youtube.com/watch?v=x')).toBe('youtube')
    expect(classifyStreamSource('https://youtu.be/x')).toBe('youtube')
    expect(classifyStreamSource('https://vk.com/x')).toBe('other')
    expect(classifyStreamSource(null)).toBe('other')
  })
  it('extracts twitch login', () => {
    expect(twitchChannelFromUrl('https://www.twitch.tv/esl_dota2')).toBe('esl_dota2')
    expect(twitchChannelFromUrl('http://twitch.tv/x/')).toBe('x')
    expect(twitchChannelFromUrl('https://youtube.com/x')).toBe(null)
  })
})

describe('normalizeStreamEl (legacy rows)', () => {
  it('derives source/channel when missing (legacy streams_json shape)', () => {
    const out = normalizeStreamEl({ raw_url: 'https://www.twitch.tv/pgl', language: 'en', official: true })
    expect(out).toMatchObject({ source: 'twitch', channel: 'pgl', main: false })
  })
  it('keeps explicit source/channel from new rows', () => {
    const out = normalizeStreamEl({ raw_url: 'https://x', source: 'other', channel: null, language: 'ru', official: false, main: true })
    expect(out).toMatchObject({ source: 'other', channel: null, main: true, official: false })
  })
})

describe('buildGameUrls', () => {
  const streams = [
    { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true, source: 'twitch', channel: 'pgl_dota2' },
    { raw_url: 'https://www.twitch.tv/pgl_ru', language: 'ru', official: false, main: false, source: 'twitch', channel: 'pgl_ru' },
    { raw_url: 'https://youtube.com/watch?v=z', language: 'en', official: true, main: false, source: 'youtube', channel: null },
  ]

  it('uses the resolved Twitch VOD as a deep-linked start point when available', () => {
    const { main, others } = buildGameUrls({
      channel: 'pgl_dota2', streams_json: streams,
      twitch_vod_id: '999', vod_offset_s: 1842,
    })
    expect(main).toMatchObject({
      url: 'https://www.twitch.tv/videos/999?t=1842s',
      deep_link: true, kind: 'start_point', channel: 'pgl_dota2',
    })
    // primary channel is represented by the VOD, so it's excluded from others;
    // the RU + YouTube streams remain.
    expect(others.map(o => o.channel ?? o.source)).toEqual(['pgl_ru', 'youtube'])
    expect(others.every(o => o.deep_link === false)).toBe(true)
  })

  it('VOD without offset is a replay link, not a start point', () => {
    const { main } = buildGameUrls({ channel: 'pgl_dota2', streams_json: streams, twitch_vod_id: '999', vod_offset_s: null })
    expect(main).toMatchObject({ url: 'https://www.twitch.tv/videos/999', deep_link: false, kind: 'replay' })
  })

  it('falls back to the primary channel stream page when no VOD resolved', () => {
    const { main, others } = buildGameUrls({ channel: 'pgl_dota2', streams_json: streams })
    expect(main).toMatchObject({ url: 'https://www.twitch.tv/pgl_dota2', kind: 'stream_page', deep_link: false })
    expect(others).toHaveLength(2) // the two non-main streams
  })

  it('youtube-only series (no twitch channel) still produces a main url', () => {
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [{ raw_url: 'https://youtube.com/watch?v=z', language: 'en', official: true, main: false, source: 'youtube', channel: null }],
    })
    expect(main).toMatchObject({ source: 'youtube', deep_link: false, kind: 'stream_page' })
    expect(others).toHaveLength(0)
  })

  it('handles empty / missing streams_json', () => {
    expect(buildGameUrls({ channel: null, streams_json: null })).toEqual({ main: null, others: [] })
  })
})

describe('groupSeriesFromRows', () => {
  it('groups games by ps_match_id, sorts by position, flags replay availability', () => {
    const rows = [
      { od_match_id: 2, ps_match_id: 100, game_position: 2, started_at: '2026-06-19T12:30:00Z', tournament: 'T', team_a: 'A', team_b: 'B', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }] },
      { od_match_id: 1, ps_match_id: 100, game_position: 1, started_at: '2026-06-19T11:00:00Z', tournament: 'T', team_a: 'A', team_b: 'B', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }], twitch_vod_id: '5', vod_offset_s: 10 },
    ]
    const series = groupSeriesFromRows(rows)
    expect(series).toHaveLength(1)
    expect(series[0].ps_match_id).toBe(100)
    expect(series[0].games.map(g => g.game_position)).toEqual([1, 2]) // sorted
    expect(series[0].replay_available).toBe(true) // game 1 has a VOD
    expect(series[0].date).toBe('2026-06-19')
    expect(series[0].games[0].replay_available).toBe(true)
    expect(series[0].games[1].replay_available).toBe(false)
  })

  it('falls back to tournament+teams+day key when ps_match_id is null', () => {
    const rows = [
      { od_match_id: 1, ps_match_id: null, game_position: 1, started_at: '2026-06-18T10:00:00Z', tournament: 'Q', team_a: 'X', team_b: 'Y', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }] },
      { od_match_id: 2, ps_match_id: null, game_position: 2, started_at: '2026-06-18T11:00:00Z', tournament: 'Q', team_a: 'X', team_b: 'Y', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }] },
    ]
    const series = groupSeriesFromRows(rows)
    expect(series).toHaveLength(1)
    expect(series[0].games).toHaveLength(2)
    expect(series[0].replay_available).toBe(false)
  })

  it('orders series newest-first by most recent game', () => {
    const rows = [
      { od_match_id: 1, ps_match_id: 1, game_position: 1, started_at: '2026-06-10T10:00:00Z', tournament: 'T', team_a: 'A', team_b: 'B', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }] },
      { od_match_id: 2, ps_match_id: 2, game_position: 1, started_at: '2026-06-20T10:00:00Z', tournament: 'T', team_a: 'C', team_b: 'D', channel: 'c', streams_json: [{ raw_url: 'https://www.twitch.tv/c' }] },
    ]
    const series = groupSeriesFromRows(rows)
    expect(series.map(s => s.ps_match_id)).toEqual([2, 1])
  })
})

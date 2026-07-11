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
  buildReplayResponse,
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
    // the RU + YouTube streams remain. Official (YouTube) sorts before the
    // unofficial RU restream.
    expect(others.map(o => o.channel ?? o.source)).toEqual(['youtube', 'pgl_ru'])
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

  it('youtube-only series (no twitch channel, no ?t=) still produces a stream_page main url', () => {
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [{ raw_url: 'https://youtube.com/watch?v=z', language: 'en', official: true, main: false, source: 'youtube', channel: null }],
    })
    expect(main).toMatchObject({ source: 'youtube', deep_link: false, kind: 'stream_page' })
    expect(others).toHaveLength(0)
  })

  it('youtube URL with ?t= is treated as a timestamped start_point', () => {
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [{ raw_url: 'https://www.youtube.com/live/abc123?t=827', language: 'en', official: true, main: true, source: 'youtube', channel: null }],
    })
    expect(main).toMatchObject({ url: 'https://www.youtube.com/live/abc123?t=827', source: 'youtube', deep_link: true, kind: 'start_point', channel: null })
    expect(others).toHaveLength(0)
  })

  it('handles empty / missing streams_json', () => {
    expect(buildGameUrls({ channel: null, streams_json: null })).toEqual({ main: null, others: [] })
  })

  it('never picks an unofficial stream as primary when an official one exists (guard-rail)', () => {
    // null channel + no main flags + unofficial listed first → primary must still be official.
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [
        { raw_url: 'https://www.twitch.tv/dota2_winline_ru', language: 'ru', official: false, main: false, source: 'twitch', channel: 'dota2_winline_ru' },
        { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: false, source: 'twitch', channel: 'pgl_dota2' },
      ],
    })
    expect(main).toMatchObject({ channel: 'pgl_dota2', official: true, kind: 'stream_page' })
    // the unofficial RU restream is still available, just demoted to others.
    expect(others.map(o => o.channel)).toEqual(['dota2_winline_ru'])
  })

  it('official main beats a non-main official stream for the primary slot', () => {
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [
        { raw_url: 'https://www.twitch.tv/pgl_dota2en2', language: 'en', official: true, main: false, source: 'twitch', channel: 'pgl_dota2en2' },
        { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true, source: 'twitch', channel: 'pgl_dota2' },
      ],
    })
    expect(main).toMatchObject({ channel: 'pgl_dota2', official: true })
    expect(others.map(o => o.channel)).toEqual(['pgl_dota2en2'])
  })

  it('upgrades an alt channel to a start point when vodByChannel has it (P3.3)', () => {
    const vodByChannel = { pgl_ru: { twitch_vod_id: '777', vod_offset_s: 1200 } }
    const { main, others } = buildGameUrls({ channel: 'pgl_dota2', streams_json: streams }, vodByChannel)
    // main has no resolved VOD → stream page; the RU alt now deep-links.
    expect(main).toMatchObject({ channel: 'pgl_dota2', kind: 'stream_page' })
    const ru = others.find(o => o.channel === 'pgl_ru')
    expect(ru).toMatchObject({ url: 'https://www.twitch.tv/videos/777?t=1200s', kind: 'start_point', deep_link: true })
    const yt = others.find(o => o.source === 'youtube')
    expect(yt).toMatchObject({ kind: 'stream_page', deep_link: false }) // no ?t= → still stream_page
  })

  it('main + alt can both be start points simultaneously', () => {
    const { main, others } = buildGameUrls(
      { channel: 'pgl_dota2', twitch_vod_id: '999', vod_offset_s: 1842, streams_json: streams },
      { pgl_ru: { twitch_vod_id: '777', vod_offset_s: 1200 } },
    )
    expect(main).toMatchObject({ url: 'https://www.twitch.tv/videos/999?t=1842s', kind: 'start_point' })
    expect(others.find(o => o.channel === 'pgl_ru')).toMatchObject({ kind: 'start_point' })
  })

  it('clamps negative VOD offsets to 0 (clock skew must not emit ?t=-Ns)', () => {
    const { main } = buildGameUrls({ channel: 'pgl_dota2', streams_json: streams, twitch_vod_id: '999', vod_offset_s: -42 })
    expect(main.url).toBe('https://www.twitch.tv/videos/999?t=0s')
    const { others } = buildGameUrls(
      { channel: 'pgl_dota2', streams_json: streams },
      { pgl_ru: { twitch_vod_id: '777', vod_offset_s: -5 } },
    )
    expect(others.find(o => o.channel === 'pgl_ru').url).toBe('https://www.twitch.tv/videos/777?t=0s')
  })

  it('matches channels case-insensitively between streams_json, row.channel, and vodByChannel', () => {
    const upperStreams = [
      { raw_url: 'https://www.twitch.tv/PGL_Dota2', language: 'en', official: true, main: true },
      { raw_url: 'https://www.twitch.tv/PGL_RU', language: 'ru', official: false, main: false },
    ]
    const { main, others } = buildGameUrls(
      { channel: 'pgl_dota2', twitch_vod_id: '999', vod_offset_s: 100, streams_json: upperStreams },
      { pgl_ru: { twitch_vod_id: '777', vod_offset_s: 200 } },
    )
    // Uppercase raw_url channel still binds to the lowercase row.channel VOD…
    expect(main).toMatchObject({ url: 'https://www.twitch.tv/videos/999?t=100s', kind: 'start_point' })
    // …and to the lowercase match_stream_vods key.
    expect(others[0]).toMatchObject({ url: 'https://www.twitch.tv/videos/777?t=200s', kind: 'start_point' })
  })

  it('dedups duplicate raw_urls and URL-form variants of the same channel', () => {
    const { main, others } = buildGameUrls({
      channel: null,
      streams_json: [
        { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true },
        { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'ru', official: true, main: false }, // dual-language duplicate
        { raw_url: 'https://twitch.tv/pgl_dota2/', language: 'en', official: true, main: false },   // URL-form variant
        { raw_url: 'https://www.twitch.tv/pgl_ru', language: 'ru', official: false, main: false },
      ],
    })
    expect(main).toMatchObject({ channel: 'pgl_dota2', language: 'en' })
    expect(others).toHaveLength(1)
    expect(others[0].channel).toBe('pgl_ru')
  })

  it('sorts others: official first, then start points, then EN, then language A-Z', () => {
    const { others } = buildGameUrls(
      {
        channel: 'main_ch',
        streams_json: [
          { raw_url: 'https://www.twitch.tv/main_ch', language: 'en', official: true, main: true },
          { raw_url: 'https://www.twitch.tv/caster_es', language: 'es', official: false, main: false },
          { raw_url: 'https://www.twitch.tv/official_ru', language: 'ru', official: true, main: false },
          { raw_url: 'https://www.twitch.tv/official_en2', language: 'en', official: true, main: false },
          { raw_url: 'https://www.twitch.tv/caster_en', language: 'en', official: false, main: false },
        ],
      },
      { official_ru: { twitch_vod_id: '55', vod_offset_s: 10 } },
    )
    // official+start_point > official (en before others) > unofficial (en before es)
    expect(others.map(o => o.channel)).toEqual(['official_ru', 'official_en2', 'caster_en', 'caster_es'])
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

describe('buildReplayResponse (public ?type=replay shape)', () => {
  it('serves the stored Twitch VOD as a deep-linked start point', () => {
    const r = buildReplayResponse({
      od_match_id: 8123, channel: 'pgl_dota2', twitch_vod_id: '900', vod_offset_s: 1842,
      vod_available: true, vod_checked_at: '2026-06-20T00:00:00Z',
      streams_json: [{ raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true, source: 'twitch', channel: 'pgl_dota2' }],
    })
    expect(r).toMatchObject({
      od_match_id: 8123,
      replay_available: true,
      vod_available: true,
      checked_at: '2026-06-20T00:00:00Z',
    })
    expect(r.main).toMatchObject({ url: 'https://www.twitch.tv/videos/900?t=1842s', deep_link: true, kind: 'start_point' })
  })

  it('reports replay_available=false and a stream-page main when unresolved', () => {
    const r = buildReplayResponse({
      od_match_id: 1, channel: 'pgl_dota2',
      streams_json: [{ raw_url: 'https://www.twitch.tv/pgl_dota2', source: 'twitch', channel: 'pgl_dota2' }],
    })
    expect(r.replay_available).toBe(false)
    expect(r.main).toMatchObject({ kind: 'stream_page', deep_link: false })
    expect(r.vod_available).toBe(null)
  })

  it('treats vod_available=true alone (no twitch_vod_id) as replay available', () => {
    const r = buildReplayResponse({ od_match_id: 2, channel: null, vod_available: true, streams_json: [] })
    expect(r.replay_available).toBe(true)
    expect(r.main).toBe(null)
  })

  it('YouTube URL with ?t= is a replay start_point even with no twitch_vod_id', () => {
    const r = buildReplayResponse({
      od_match_id: 8860067580, channel: null, twitch_vod_id: null, vod_offset_s: null, vod_available: null,
      streams_json: [{ raw_url: 'https://www.youtube.com/live/yVPfwcQeviE?t=827', language: 'en', official: true, main: true, source: 'youtube', channel: null }],
    })
    expect(r.replay_available).toBe(true)
    expect(r.main).toMatchObject({ url: 'https://www.youtube.com/live/yVPfwcQeviE?t=827', kind: 'start_point', deep_link: true, source: 'youtube' })
    expect(r.vod_available).toBe(null)
  })

  it('passes vodByChannel through so others[] deep-link in the public response', () => {
    const r = buildReplayResponse(
      {
        od_match_id: 1, channel: 'pgl_dota2', twitch_vod_id: '900', vod_offset_s: 100,
        streams_json: [
          { raw_url: 'https://www.twitch.tv/pgl_dota2', language: 'en', official: true, main: true },
          { raw_url: 'https://www.twitch.tv/pgl_ru', language: 'ru', official: false, main: false },
        ],
      },
      { pgl_ru: { twitch_vod_id: '777', vod_offset_s: 50 } },
    )
    expect(r.main).toMatchObject({ kind: 'start_point' })
    expect(r.others[0]).toMatchObject({ url: 'https://www.twitch.tv/videos/777?t=50s', kind: 'start_point', language: 'ru' })
  })

  it('sparse resolver-written rows (no streams_json) still serve the main VOD with empty others', () => {
    const r = buildReplayResponse({
      od_match_id: 2, channel: 'esl_dota2', started_at: '2026-07-01T10:00:00Z',
      twitch_vod_id: '111', vod_offset_s: 900, streams_json: null,
    })
    expect(r.main).toMatchObject({ url: 'https://www.twitch.tv/videos/111?t=900s', kind: 'start_point' })
    expect(r.others).toEqual([])
    expect(r.replay_available).toBe(true)
  })
})

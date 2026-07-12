/**
 * Tests for scripts/_vod-enrich-lib.mjs — pure enrichment helpers used by vod-enrich.mjs.
 */

import { describe, it, expect } from 'vitest'
import { parseVodUrl, classifyResolution, buildVodSeedRows } from '../scripts/_vod-enrich-lib.mjs'

describe('parseVodUrl', () => {
  it('parses id + offset', () => {
    expect(parseVodUrl('https://www.twitch.tv/videos/2401234567?t=1842s')).toEqual({ vodId: '2401234567', offset: 1842 })
  })
  it('defaults offset to 0 when no t param', () => {
    expect(parseVodUrl('https://www.twitch.tv/videos/999')).toEqual({ vodId: '999', offset: 0 })
  })
  it('returns null for non-video urls / null', () => {
    expect(parseVodUrl('https://www.twitch.tv/pgl_dota2')).toBe(null)
    expect(parseVodUrl(null)).toBe(null)
  })
})

describe('classifyResolution', () => {
  const now = () => '2026-06-21T00:00:00Z'

  it('resolved → update with vod id/offset/available', () => {
    const r = classifyResolution({ url: 'https://www.twitch.tv/videos/900?t=10s' }, 100, { now })
    expect(r.outcome).toBe('resolved')
    expect(r.vodId).toBe('900')
    expect(r.update).toMatchObject({ twitch_vod_id: '900', vod_offset_s: 10, vod_available: true, vod_resolved_at: '2026-06-21T00:00:00Z' })
  })

  it('miss + channel live → pending (checked_at only)', () => {
    const r = classifyResolution({ url: null, live: true }, 1000, { now })
    expect(r.outcome).toBe('pending')
    expect(r.update).toEqual({ vod_checked_at: '2026-06-21T00:00:00Z' })
  })

  it('miss + within grace → pending', () => {
    const r = classifyResolution({ url: null }, 5, { graceHours: 24, now })
    expect(r.outcome).toBe('pending')
  })

  it('miss + past grace → unavailable', () => {
    const r = classifyResolution({ url: null }, 50, { graceHours: 24, now })
    expect(r.outcome).toBe('unavailable')
    expect(r.update).toEqual({ vod_checked_at: '2026-06-21T00:00:00Z', vod_available: false })
  })

  it('hit with unparseable url → fail', () => {
    const r = classifyResolution({ url: 'https://www.twitch.tv/pgl' }, 100, { now })
    expect(r.outcome).toBe('fail')
  })
})

describe('buildVodSeedRows', () => {
  it('emits one row per NON-main twitch channel, deduped', () => {
    const rows = [
      {
        od_match_id: 1, channel: 'pgl_dota2', started_at: '2026-06-20T10:00:00Z',
        streams_json: [
          { raw_url: 'https://www.twitch.tv/pgl_dota2', source: 'twitch', channel: 'pgl_dota2', language: 'en' }, // main → skip
          { raw_url: 'https://www.twitch.tv/pgl_ru', source: 'twitch', channel: 'pgl_ru', language: 'ru' },
          { raw_url: 'https://youtube.com/watch?v=x', source: 'youtube', channel: null, language: 'en' }, // not twitch → skip
        ],
      },
      {
        od_match_id: 1, channel: 'pgl_dota2', started_at: '2026-06-20T10:00:00Z',
        streams_json: [{ raw_url: 'https://www.twitch.tv/pgl_ru', source: 'twitch', channel: 'pgl_ru', language: 'ru' }], // dup
      },
    ]
    const seeds = buildVodSeedRows(rows)
    expect(seeds).toEqual([
      { od_match_id: 1, channel: 'pgl_ru', language: 'ru', started_at: '2026-06-20T10:00:00Z' },
    ])
  })

  it('derives source from raw_url for legacy rows lacking the source field', () => {
    const seeds = buildVodSeedRows([
      { od_match_id: 2, channel: 'main', started_at: 't', streams_json: [{ raw_url: 'https://www.twitch.tv/alt', channel: 'alt' }] },
    ])
    expect(seeds).toHaveLength(1)
    expect(seeds[0].channel).toBe('alt')
  })

  it('handles null/empty streams_json', () => {
    expect(buildVodSeedRows([{ od_match_id: 1, channel: 'c', started_at: 't', streams_json: null }])).toEqual([])
    expect(buildVodSeedRows(null)).toEqual([])
  })

  it('regression: excludes the main channel case-insensitively (EWC mixed-case bug)', () => {
    // row.channel is lowercased by getTwitchStreams(); the streams_json entry for the same
    // broadcast keeps PandaScore's original mixed case. Without a case-insensitive compare,
    // this main channel would be seeded as a duplicate "alt" row and get its own,
    // independently (and possibly wrongly) resolved offset — overriding the correct one.
    const seeds = buildVodSeedRows([
      {
        od_match_id: 1, channel: 'ewc_legiongauntlet_en2', started_at: '2026-07-11T10:00:00Z',
        streams_json: [
          { raw_url: 'https://www.twitch.tv/EWC_LegionGauntlet_EN2', source: 'twitch', channel: 'EWC_LegionGauntlet_EN2', language: 'en' },
          { raw_url: 'https://www.twitch.tv/betboom_dota_ru', source: 'twitch', channel: 'betboom_dota_ru', language: 'ru' },
        ],
      },
    ])
    expect(seeds).toEqual([
      { od_match_id: 1, channel: 'betboom_dota_ru', language: 'ru', started_at: '2026-07-11T10:00:00Z' },
    ])
  })
})

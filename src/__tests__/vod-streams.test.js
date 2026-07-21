/**
 * Tests for src/vodStreams.js — pure helpers behind the Supabase-first
 * multi-language stream flow in resolveMatchStreams.
 */

import { describe, it, expect } from 'vitest'
import { VOD_MAX_AGE_S, isVodExpired, degradeExpiredOthers, dedupOthersAgainstPrimary, resolvableStoredMain } from '../vodStreams'

const NOW = 1_800_000_000

describe('isVodExpired', () => {
  it('is false inside the window and true past it (boundary)', () => {
    expect(isVodExpired(NOW - VOD_MAX_AGE_S + 60, NOW)).toBe(false)
    expect(isVodExpired(NOW - VOD_MAX_AGE_S - 1, NOW)).toBe(true)
  })
  it('is false when startTime is missing', () => {
    expect(isVodExpired(null, NOW)).toBe(false)
    expect(isVodExpired(undefined, NOW)).toBe(false)
  })
})

describe('degradeExpiredOthers', () => {
  it('degrades an expired Twitch video link to its channel page', () => {
    const out = degradeExpiredOthers([
      { url: 'https://www.twitch.tv/videos/777?t=50s', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: true, kind: 'start_point' },
    ])
    expect(out).toEqual([
      { url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: false, kind: 'stream_page' },
    ])
  })
  it('drops a dead video link with no channel to fall back to', () => {
    expect(degradeExpiredOthers([{ url: 'https://www.twitch.tv/videos/777', channel: null, source: 'twitch' }])).toEqual([])
  })
  it('passes through stream pages and YouTube links (no Twitch expiry)', () => {
    const page = { url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', kind: 'stream_page', deep_link: false }
    const yt = { url: 'https://youtube.com/live/abc?t=827', channel: null, source: 'youtube', kind: 'start_point', deep_link: true }
    expect(degradeExpiredOthers([page, yt])).toEqual([page, yt])
  })
  it('handles null/undefined input', () => {
    expect(degradeExpiredOthers(null)).toEqual([])
    expect(degradeExpiredOthers(undefined)).toEqual([])
  })
})

describe('resolvableStoredMain', () => {
  const twitchStartPoint = { url: 'https://www.twitch.tv/videos/900?t=100s', channel: 'pgl_dota2', source: 'twitch', kind: 'start_point' }
  const twitchStreamPage = { url: 'https://www.twitch.tv/pgl_dota2', channel: 'pgl_dota2', source: 'twitch', kind: 'stream_page' }
  const kickStreamPage = { url: 'https://kick.com/epldota_en2', channel: null, source: 'other', kind: 'stream_page' }
  const youtubeStreamPage = { url: 'https://youtube.com/live/abc', channel: null, source: 'youtube', kind: 'stream_page' }
  const youtubeStartPoint = { url: 'https://youtube.com/live/abc?t=827', channel: null, source: 'youtube', kind: 'start_point' }

  it('returns a non-expired Twitch start-point', () => {
    expect(resolvableStoredMain({ main: twitchStartPoint }, false)).toBe(twitchStartPoint)
  })

  it('rejects an expired Twitch start-point (falls through to the live resolver)', () => {
    expect(resolvableStoredMain({ main: twitchStartPoint }, true)).toBeNull()
  })

  it('rejects a Twitch stream-page main (no timestamp resolved yet) so the chain can still try', () => {
    expect(resolvableStoredMain({ main: twitchStreamPage }, false)).toBeNull()
  })

  it('promotes a Kick stream-page main regardless of expiry (no Twitch chain path exists for it)', () => {
    expect(resolvableStoredMain({ main: kickStreamPage }, false)).toBe(kickStreamPage)
    expect(resolvableStoredMain({ main: kickStreamPage }, true)).toBe(kickStreamPage)
  })

  it('promotes a YouTube main whether or not it has a timestamp', () => {
    expect(resolvableStoredMain({ main: youtubeStreamPage }, false)).toBe(youtubeStreamPage)
    expect(resolvableStoredMain({ main: youtubeStartPoint }, true)).toBe(youtubeStartPoint)
  })

  it('returns null when there is no stored row, no main, or no url', () => {
    expect(resolvableStoredMain(null, false)).toBeNull()
    expect(resolvableStoredMain({}, false)).toBeNull()
    expect(resolvableStoredMain({ main: null }, false)).toBeNull()
    expect(resolvableStoredMain({ main: { source: 'other', kind: 'stream_page', url: null } }, false)).toBeNull()
  })
})

describe('dedupOthersAgainstPrimary', () => {
  const RU = { url: 'https://www.twitch.tv/videos/777?t=50s', channel: 'pgl_ru', language: 'ru' }
  const ES = { url: 'https://www.twitch.tv/caster_es', channel: 'caster_es', language: 'es' }

  it('never modifies the primary list and returns only surviving others', () => {
    const primary = [{ url: 'https://www.twitch.tv/videos/900?t=100s', channel: 'pgl_dota2' }]
    const out = dedupOthersAgainstPrimary(primary, [RU, ES])
    expect(out).toEqual([RU, ES])
    expect(primary).toHaveLength(1)
  })

  it('drops an other whose channel matches the chain-resolved primary (case-insensitive)', () => {
    const primary = [{ url: 'https://www.twitch.tv/videos/900?t=100s', channel: 'PGL_RU' }]
    expect(dedupOthersAgainstPrimary(primary, [RU, ES])).toEqual([ES])
  })

  it('dedups by url including trailing-slash variants and within others themselves', () => {
    const primary = [{ url: 'https://www.twitch.tv/caster_es/', channel: null }]
    const dupRu = { ...RU }
    expect(dedupOthersAgainstPrimary(primary, [ES, RU, dupRu])).toEqual([RU])
  })

  it('drops url-less entries and handles empty/absent primaries', () => {
    expect(dedupOthersAgainstPrimary([], [RU, { channel: 'x' }, null])).toEqual([RU])
    expect(dedupOthersAgainstPrimary(null, [RU])).toEqual([RU])
    expect(dedupOthersAgainstPrimary([{ url: null, channel: 'pgl_ru' }], [RU])).toEqual([RU])
  })
})

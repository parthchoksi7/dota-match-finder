/**
 * Tests for the preferred-broadcast-language preference: pickPreferredStream (the shape-agnostic
 * splitter used by both the live and replay surfaces) and getStreamLanguage (the localStorage
 * reader).
 *
 * "No preference" defaults to English, and an explicit preference with no live stream in that
 * language also falls back to English — see pickPreferredStream's doc comment. Only when English
 * itself isn't broadcast either (a CIS/Chinese-only qualifier, say) does nothing get promoted and
 * the surface keeps whatever default it already had.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pickPreferredStream, getStreamLanguage, STREAM_LANGUAGES, STORAGE_KEYS } from '../utils'

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }))

// Replay-surface shape (url + deep_link/kind); live-surface entries use raw_url and carry no
// deep_link at all. pickPreferredStream reads neither url field, so both shapes flow through it.
const EN_OFFICIAL = { url: 'https://twitch.tv/pgl_dota2', channel: 'pgl_dota2', language: 'en', official: true, main: true, deep_link: false }
const RU_PAGE = { url: 'https://twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', official: false, deep_link: false }
const RU_VOD = { url: 'https://twitch.tv/videos/777?t=50s', channel: 'pgl_ru_vod', language: 'ru', official: false, deep_link: true }
const RU_OFFICIAL_PAGE = { url: 'https://twitch.tv/pgl_ru_main', channel: 'pgl_ru_main', language: 'ru', official: true, deep_link: false }
const ZH_LIVE = { raw_url: 'https://twitch.tv/zh_caster', channel: 'zh_caster', language: 'zh', official: false }

describe('pickPreferredStream', () => {
  it('defaults to English when no preference is set', () => {
    const { preferred, rest } = pickPreferredStream([EN_OFFICIAL, RU_PAGE], null)
    expect(preferred).toBe(EN_OFFICIAL)
    expect(rest).toEqual([RU_PAGE])
  })

  it('returns the list untouched when neither the preference nor English is broadcast', () => {
    const list = [RU_PAGE]
    const { preferred, rest } = pickPreferredStream(list, null)
    expect(preferred).toBeNull()
    expect(rest).toBe(list)
  })

  it('falls back to English when the preferred language is not broadcast', () => {
    // The core fallback question: RU preferred, only EN available → promote EN rather than
    // leaving the fan with no default stream at all.
    const { preferred, rest } = pickPreferredStream([EN_OFFICIAL], 'ru')
    expect(preferred).toBe(EN_OFFICIAL)
    expect(rest).toEqual([])
  })

  it('returns the list untouched when neither the preferred language nor English is broadcast', () => {
    const list = [RU_PAGE]
    const { preferred, rest } = pickPreferredStream(list, 'zh')
    expect(preferred).toBeNull()
    expect(rest).toBe(list)
  })

  it('promotes the matching-language stream and removes it from the rest', () => {
    const { preferred, rest } = pickPreferredStream([EN_OFFICIAL, RU_PAGE], 'ru')
    expect(preferred).toBe(RU_PAGE)
    expect(rest).toEqual([EN_OFFICIAL])
  })

  it('prefers a deep-linked replay over an official channel link in the same language', () => {
    // A jump-to-the-moment VOD beats officialness — landing on the exact moment is what the fan
    // actually wants from the replay surface.
    const { preferred } = pickPreferredStream([RU_OFFICIAL_PAGE, RU_VOD], 'ru')
    expect(preferred).toBe(RU_VOD)
  })

  it('prefers an official stream over a co-stream when neither is deep-linked', () => {
    const { preferred } = pickPreferredStream([RU_PAGE, RU_OFFICIAL_PAGE], 'ru')
    expect(preferred).toBe(RU_OFFICIAL_PAGE)
  })

  it('keeps the first of equally ranked same-language streams (stable)', () => {
    // Distinct URLs — two entries sharing a URL are duplicates of one broadcast, and the
    // dedupe test below covers that case instead.
    const first = { ...RU_PAGE, channel: 'first', url: 'https://twitch.tv/first' }
    const second = { ...RU_PAGE, channel: 'second', url: 'https://twitch.tv/second' }
    const { preferred, rest } = pickPreferredStream([first, second], 'ru')
    expect(preferred).toBe(first)
    expect(rest).toEqual([second])
  })

  it('works on live-surface entries, which carry raw_url and no deep_link/main', () => {
    const { preferred, rest } = pickPreferredStream([EN_OFFICIAL, ZH_LIVE], 'zh')
    expect(preferred).toBe(ZH_LIVE)
    expect(rest).toEqual([EN_OFFICIAL])
  })

  it('tolerates null, undefined, and entries with no language', () => {
    expect(pickPreferredStream(null, 'ru')).toEqual({ preferred: null, rest: [] })
    expect(pickPreferredStream(undefined, 'ru')).toEqual({ preferred: null, rest: [] })
    const withHoles = [null, { url: 'x' }, RU_PAGE]
    expect(pickPreferredStream(withHoles, 'ru').preferred).toBe(RU_PAGE)
  })

  it('promotes nothing when a primary slot is already in the preferred language', () => {
    // Otherwise a co-stream page gets promoted OVER an official broadcast the fan already had in
    // the right language — on the replay surface that buries a real timestamped VOD.
    const { preferred, rest } = pickPreferredStream([RU_PAGE], 'ru', ['ru'])
    expect(preferred).toBeNull()
    expect(rest).toEqual([RU_PAGE])
  })

  it('still promotes when the incumbent languages are different or unknown', () => {
    expect(pickPreferredStream([RU_PAGE], 'ru', ['en']).preferred).toBe(RU_PAGE)
    expect(pickPreferredStream([RU_PAGE], 'ru', []).preferred).toBe(RU_PAGE)
    // An explicit null skips the `= []` default, which only fires for undefined.
    expect(pickPreferredStream([RU_PAGE], 'ru', null).preferred).toBe(RU_PAGE)
    expect(pickPreferredStream([RU_PAGE], 'ru', undefined).preferred).toBe(RU_PAGE)
  })

  it('does not treat two streams with no URL at all as duplicates of each other', () => {
    // sameStream must not collapse unrelated entries just because both URLs are empty.
    const noUrlRu = { language: 'ru', channel: 'a', source: 'twitch' }
    const noUrlEn = { language: 'en', channel: 'b', source: 'twitch' }
    const { preferred, rest } = pickPreferredStream([noUrlRu, noUrlEn], 'ru')
    expect(preferred).toBe(noUrlRu)
    expect(rest).toEqual([noUrlEn])
  })

  it('drops a duplicate of the promoted stream from the rest, not just the same object', () => {
    // PandaScore lists one broadcast twice as dual-language rows sharing a raw_url; the live
    // surface gets that list undeduped, so identity-only filtering leaves a twin link behind.
    const ruTwin = { raw_url: 'https://www.twitch.tv/pgl_x', channel: 'pgl_x', language: 'ru', source: 'twitch' }
    const enTwin = { raw_url: 'https://twitch.tv/pgl_x/', channel: 'pgl_x', language: 'en', source: 'twitch' }
    const { preferred, rest } = pickPreferredStream([ruTwin, enTwin], 'ru')
    expect(preferred).toBe(ruTwin)
    expect(rest).toEqual([])
  })

  it('keeps genuinely different channels in the rest', () => {
    const { rest } = pickPreferredStream([RU_PAGE, EN_OFFICIAL], 'ru')
    expect(rest).toEqual([EN_OFFICIAL])
  })

  it('does not mutate the input list', () => {
    const list = [EN_OFFICIAL, RU_PAGE]
    pickPreferredStream(list, 'ru')
    expect(list).toEqual([EN_OFFICIAL, RU_PAGE])
  })
})

describe('getStreamLanguage', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { localStorage.clear() })

  it('returns null when nothing is stored (the default is no preference)', () => {
    expect(getStreamLanguage()).toBeNull()
  })

  it('returns a stored code that is in the supported list', () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    expect(getStreamLanguage()).toBe('ru')
  })

  it('ignores an unsupported or stale stored code rather than filtering every stream to nothing', () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'xx')
    expect(getStreamLanguage()).toBeNull()
  })
})

describe('STREAM_LANGUAGES', () => {
  it('covers every language code observed in production stream data', () => {
    // Sampled 2026-07-27 from match_stream_history.streams_json (419 rows / 832 streams).
    const observed = ['en', 'ru', 'uk', 'zh', 'es', 'th', 'tl', 'fr', 'pt', 'vi']
    const codes = STREAM_LANGUAGES.map(l => l.code)
    expect(codes).toEqual(expect.arrayContaining(observed))
  })

  it('has a unique code and a non-empty label for every entry', () => {
    const codes = STREAM_LANGUAGES.map(l => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const l of STREAM_LANGUAGES) expect(l.label.length).toBeGreaterThan(0)
  })
})

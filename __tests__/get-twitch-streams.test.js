/**
 * Tests for getTwitchStreams() in api/_shared.js — resolves the single primary Twitch
 * channel (VOD anchor) from a PandaScore streams_list. Feeds the LOCKED VOD replay chain
 * (cacheRunningStreams ts-bucket + match-streams fuzzy resolver) and the live stream link.
 *
 * Covers the EWC 2026 allowlist: PandaScore marks the event's official Twitch broadcasts
 * official:false (only the YouTube stream is official:true), and returns no-www URLs.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class {} }))

import { getTwitchStreams } from '../api/_shared.js'

describe('getTwitchStreams', () => {
  it('returns [] for null/empty input', () => {
    expect(getTwitchStreams(null)).toEqual([])
    expect(getTwitchStreams([])).toEqual([])
  })

  it('returns the official English twitch stream (normal case, unchanged)', () => {
    const out = getTwitchStreams([
      { official: true, main: true, language: 'en', raw_url: 'https://www.twitch.tv/esl_dota2' },
    ])
    expect(out).toEqual([{ label: 'ESL', url: 'https://www.twitch.tv/esl_dota2' }])
  })

  it('ignores unofficial twitch streams that are not allowlisted', () => {
    const out = getTwitchStreams([
      { official: false, main: false, language: 'en', raw_url: 'https://www.twitch.tv/some_random_caster' },
      { official: true, main: true, language: 'en', raw_url: 'https://www.youtube.com/watch?v=abc' },
    ])
    expect(out).toEqual([])
  })

  it('promotes an allowlisted EWC channel that PandaScore marks official:false (no-www URL)', () => {
    // Mirrors the real EWC payload: YouTube is official:true, the EWC twitch stream is official:false.
    const out = getTwitchStreams([
      { official: false, main: false, language: 'en', raw_url: 'https://twitch.tv/ewc_legiongauntlet_en' },
      { official: false, main: false, language: 'ru', raw_url: 'https://twitch.tv/betboom_dota_ru' },
      { official: true, main: true, language: 'en', raw_url: 'https://www.youtube.com/watch?v=BLX7obzQS60' },
    ])
    expect(out).toEqual([{ label: 'ewc_legiongauntlet_en', url: 'https://www.twitch.tv/ewc_legiongauntlet_en' }])
  })

  it('extracts a clean login from a no-www URL so the downstream channel replace works', () => {
    const out = getTwitchStreams([
      { official: false, language: 'en', raw_url: 'https://twitch.tv/ewc_legiongauntlet_en3' },
    ])
    // The consuming code does url.replace('https://www.twitch.tv/', '') → must yield the bare login.
    const channel = out[0].url.replace('https://www.twitch.tv/', '')
    expect(channel).toBe('ewc_legiongauntlet_en3')
  })

  it('matches allowlist case-insensitively', () => {
    const out = getTwitchStreams([
      { official: false, language: 'en', raw_url: 'https://www.twitch.tv/EWC_LegionGauntlet_EN2' },
    ])
    expect(out[0].url).toBe('https://www.twitch.tv/ewc_legiongauntlet_en2')
  })

  it('skips a match when PandaScore lists no allowlisted twitch channel (L1/Nigma case)', () => {
    // PandaScore lists Kick for English + a RU twitch + official YouTube; no EWC twitch stream.
    const out = getTwitchStreams([
      { official: false, main: false, language: 'en', raw_url: 'https://kick.com/esl_dota2ember' },
      { official: false, main: false, language: 'ru', raw_url: 'https://twitch.tv/betboom_dota_ru2' },
      { official: true, main: true, language: 'en', raw_url: 'https://www.youtube.com/watch?v=6ch95zxwRNE' },
    ])
    expect(out).toEqual([])
  })

  it('still prefers a real official English stream over a non-en fallback', () => {
    const out = getTwitchStreams([
      { official: true, main: false, language: 'ru', raw_url: 'https://www.twitch.tv/pgl_dota2ru' },
      { official: true, main: false, language: 'en', raw_url: 'https://www.twitch.tv/pgl_dota2' },
    ])
    expect(out).toEqual([{ label: 'PGL', url: 'https://www.twitch.tv/pgl_dota2' }])
  })
})

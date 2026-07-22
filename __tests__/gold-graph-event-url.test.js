/**
 * Regression test for buildEventUrl's ?t= parsing. api/pipeline/_vod-urls.js and the admin
 * VOD-URL tool can write a manually-timestamped start_point `?t=` as a bare digit count
 * (e.g. `?t=827`), not Twitch's XhYmZs suffixed format. Before this fix, the XhYmZs regex
 * silently matched nothing on a bare digit string, defaulting baseSecs to 0 and landing the
 * Roshan/rax-marker WATCH link at eventTimeSecs instead of 827 + eventTimeSecs.
 */

import { describe, it, expect } from 'vitest'
import { buildEventUrl } from '../src/components/GoldGraph.jsx'

describe('buildEventUrl', () => {
  it('adds event seconds onto a bare-digit ?t= (start_point kind)', () => {
    const result = buildEventUrl('https://www.twitch.tv/videos/123?t=827', 60)
    expect(new URL(result).searchParams.get('t')).toBe('14m47s')
  })

  it('adds event seconds onto a standard XhYmZs ?t=', () => {
    const result = buildEventUrl('https://www.twitch.tv/videos/123?t=1h05m30s', 90)
    expect(new URL(result).searchParams.get('t')).toBe('1h7m0s')
  })

  it('adds event seconds onto a minutes-only ?t= (no hours or seconds part)', () => {
    const result = buildEventUrl('https://www.twitch.tv/videos/123?t=5m', 60)
    expect(new URL(result).searchParams.get('t')).toBe('6m0s')
  })

  it('adds event seconds onto an hours+seconds ?t= with no minutes part', () => {
    const result = buildEventUrl('https://www.twitch.tv/videos/123?t=1h30s', 90)
    expect(new URL(result).searchParams.get('t')).toBe('1h2m0s')
  })

  it('treats a missing ?t= as 0 base seconds', () => {
    const result = buildEventUrl('https://www.twitch.tv/videos/123', 45)
    expect(new URL(result).searchParams.get('t')).toBe('45s')
  })

  it('returns null for an unparseable URL', () => {
    expect(buildEventUrl('not a url', 60)).toBeNull()
  })
})

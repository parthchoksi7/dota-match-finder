/**
 * Tests for fetchStoredReplay (src/api.js) — the P3.2 Supabase-first replay lookup.
 * A stored hit is returned ONLY for a timestamped start-point VOD; everything else
 * resolves to null so the caller falls back to the live resolver.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchStoredReplay } from '../api'

function mockFetchOnce({ ok = true, status = 200, json }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(json),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchStoredReplay', () => {
  it('returns the url+channel for a resolved start-point VOD', async () => {
    mockFetchOnce({ json: { main: { kind: 'start_point', url: 'https://www.twitch.tv/videos/900?t=1842s', channel: 'pgl_dota2', source: 'twitch' } } })
    const r = await fetchStoredReplay('8123456789')
    expect(r).toEqual({ url: 'https://www.twitch.tv/videos/900?t=1842s', channel: 'pgl_dota2', source: 'twitch' })
  })

  it('calls the replay endpoint with the encoded match id', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ main: null }) })
    vi.stubGlobal('fetch', f)
    await fetchStoredReplay('8123')
    expect(f).toHaveBeenCalledWith('/api/pipeline?type=replay&id=8123')
  })

  it('returns null for a replay-without-offset (no start point) so caller falls back', async () => {
    mockFetchOnce({ json: { main: { kind: 'replay', url: 'https://www.twitch.tv/videos/900', channel: 'pgl_dota2' } } })
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null for a stream-page main (not enriched)', async () => {
    mockFetchOnce({ json: { main: { kind: 'stream_page', url: 'https://www.twitch.tv/pgl_dota2', channel: 'pgl_dota2' } } })
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null on 404 (no record)', async () => {
    mockFetchOnce({ ok: false, status: 404, json: { error: 'not_found' } })
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null for null/undefined id without fetching', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fetchStoredReplay(null)).toBe(null)
    expect(await fetchStoredReplay(undefined)).toBe(null)
    expect(f).not.toHaveBeenCalled()
  })
})

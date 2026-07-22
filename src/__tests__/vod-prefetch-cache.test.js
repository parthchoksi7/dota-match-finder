/**
 * Regression tests for the VOD pre-fetch cache (pending-refactors #5). This wraps the LOCKED
 * resolveMatchStreams with a client-side promise cache so a hover/touchstart on a game-switcher
 * chip can warm the result before the user clicks — these tests target the 3 correctness bugs
 * that got the 2026-07-20 attempt reverted, not resolveMatchStreams itself (covered elsewhere).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prefetchMatchStreams, clearVodPrefetchCache, VOD_PREFETCH_TTL_MS } from '../vodPrefetchCache.js'

function makeMatch(id, overrides = {}) {
  return { id, seriesId: null, radiantTeam: 'A', direTeam: 'B', startTime: 1000, ...overrides }
}

function makeResolver(result = { url: 'https://twitch.tv/x', channel: 'x', allVods: [{ url: 'https://twitch.tv/x' }], otherStreams: [] }) {
  return vi.fn().mockResolvedValue(result)
}

describe('prefetchMatchStreams', () => {
  beforeEach(() => {
    clearVodPrefetchCache()
    vi.useRealTimers()
  })

  it('caches the resolution so a second call with the same allMatches size does not re-resolve', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1')
    const allMatches = [match]

    await prefetchMatchStreams(match, allMatches, resolver)
    await prefetchMatchStreams(match, allMatches, resolver)

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('a warmed hover-prefetch is reused by the subsequent click (same promise identity)', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1')
    const allMatches = [match]

    const hoverPromise = prefetchMatchStreams(match, allMatches, resolver)
    const clickPromise = prefetchMatchStreams(match, allMatches, resolver)

    expect(clickPromise).toBe(hoverPromise)
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('re-resolves once allMatches has grown past the cached snapshot (sibling set may have changed)', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1')

    await prefetchMatchStreams(match, [match], resolver)
    await prefetchMatchStreams(match, [match, makeMatch('m2')], resolver)

    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('does not re-resolve when allMatches shrinks or stays the same size', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1')
    const bigger = [match, makeMatch('m2'), makeMatch('m3')]

    await prefetchMatchStreams(match, bigger, resolver)
    await prefetchMatchStreams(match, [match, makeMatch('m2')], resolver) // shrank

    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('expires after the TTL and resolves again', async () => {
    vi.useFakeTimers()
    const resolver = makeResolver()
    const match = makeMatch('m1')
    const allMatches = [match]

    await prefetchMatchStreams(match, allMatches, resolver)
    vi.advanceTimersByTime(VOD_PREFETCH_TTL_MS + 1)
    await prefetchMatchStreams(match, allMatches, resolver)

    expect(resolver).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('evicts a rejected resolution instead of caching the failure for the rest of the TTL', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({ url: 'ok', channel: 'c', allVods: [], otherStreams: [] })
    const match = makeMatch('m1')
    const allMatches = [match]

    await expect(prefetchMatchStreams(match, allMatches, failing)).rejects.toThrow('network error')
    const result = await prefetchMatchStreams(match, allMatches, failing)

    expect(failing).toHaveBeenCalledTimes(2)
    expect(result.url).toBe('ok')
  })

  it('clearVodPrefetchCache (pull-to-refresh) forces every subsequent call to re-resolve', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1')
    const allMatches = [match]

    await prefetchMatchStreams(match, allMatches, resolver)
    clearVodPrefetchCache()
    await prefetchMatchStreams(match, allMatches, resolver)

    expect(resolver).toHaveBeenCalledTimes(2)
  })

  it('skips unplayed matches without calling the resolver', async () => {
    const resolver = makeResolver()
    const match = makeMatch('m1', { unplayed: true })

    const result = await prefetchMatchStreams(match, [match], resolver)

    expect(resolver).not.toHaveBeenCalled()
    expect(result).toEqual({ url: null, channel: null, allVods: [], otherStreams: [] })
  })

  it('caches independently per match id', async () => {
    const resolver = makeResolver()
    const m1 = makeMatch('m1')
    const m2 = makeMatch('m2')

    await prefetchMatchStreams(m1, [m1, m2], resolver)
    await prefetchMatchStreams(m2, [m1, m2], resolver)

    expect(resolver).toHaveBeenCalledTimes(2)
  })
})

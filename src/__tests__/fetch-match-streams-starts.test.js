/**
 * Tests that fetchMatchStreams sends per-game start times via the `starts` param so the
 * resolver persists each sibling row with its OWN started_at (correct per-game VOD offsets).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMatchStreams } from '../api'

function capture() {
  const calls = []
  vi.stubGlobal('fetch', vi.fn((url) => {
    calls.push(url)
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
  return calls
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('fetchMatchStreams starts param', () => {
  it('encodes per-game start times as starts=id:ts pairs', async () => {
    const calls = capture()
    await fetchMatchStreams(['1', '2', '3'], 1000, 'A', 'B', { '1': 1000, '2': 2000, '3': 3000 })
    const url = calls[0]
    expect(url).toContain('ids=1%2C2%2C3')
    expect(url).toContain('ts=1000')
    // URLSearchParams encodes ':' as %3A and ',' as %2C
    expect(decodeURIComponent(url.split('starts=')[1])).toBe('1:1000,2:2000,3:3000')
  })

  it('floors fractional timestamps and omits null entries', async () => {
    const calls = capture()
    await fetchMatchStreams(['1', '2'], 1000, 'A', 'B', { '1': 1000.9, '2': null })
    expect(decodeURIComponent(calls[0].split('starts=')[1])).toBe('1:1000')
  })

  it('omits the starts param entirely when no startTimes given (back-compat)', async () => {
    const calls = capture()
    await fetchMatchStreams(['1'], 1000, 'A', 'B')
    expect(calls[0]).not.toContain('starts=')
  })
})

/**
 * Integration tests for the live "worth watching" signal's OWNER-ONLY gate
 * (`.claude/specs/live-worth-watching-signal-spec.md`, built owner-only 2026-08-01).
 *
 * The one property this build must never violate: `.signal` reaching a non-owner response. Unlike
 * api/_handlers/liveGamePulse.js (which partitions its KV cache per-owner), api/live-matches.js
 * caches ONE shared payload for every caller (`dota2:live_matches_v5`), so the gate has to be
 * enforced at response time (stripSignalForResponse), not at attachment time — these tests exist
 * specifically because that's a less obvious place for the guarantee to live, and easy to
 * accidentally regress by moving the gate back to attachment time.
 */
import { describe, it, expect, vi } from 'vitest'

// Import-safety: live-matches.js constructs an Upstash client + Supabase admin client at module
// load. Mock both so importing the pure helpers doesn't require real credentials (same pattern as
// push-score-ping.test.js).
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() {} } }))

import { stripSignalForResponse, resolveLiveSignals, collectRunningGames } from '../api/live-matches.js'

const log = { warn: () => {}, info: () => {}, error: () => {} }

describe('stripSignalForResponse — the owner gate', () => {
  const payload = {
    matches: [
      { id: 1, teamA: 'A', teamB: 'B', signal: 'CLOSE' },
      { id: 2, teamA: 'C', teamB: 'D' }, // no signal (unbadged)
    ],
    fetchedAt: '2026-08-01T00:00:00.000Z',
  }

  it('passes the payload through untouched for an owner', () => {
    expect(stripSignalForResponse(payload, true)).toBe(payload)
  })

  it('strips .signal from every match for a non-owner', () => {
    const result = stripSignalForResponse(payload, false)
    expect(result.matches.every(m => !('signal' in m))).toBe(true)
  })

  it('never mutates the original cached payload object (subsequent owner reads must still see it)', () => {
    stripSignalForResponse(payload, false)
    expect(payload.matches[0].signal).toBe('CLOSE')
  })

  it('preserves every other field on a stripped match', () => {
    const result = stripSignalForResponse(payload, false)
    expect(result.matches[0]).toEqual({ id: 1, teamA: 'A', teamB: 'B' })
  })

  it('is a no-op on a payload with no matches array (defensive)', () => {
    expect(stripSignalForResponse({ error: 'x' }, false)).toEqual({ error: 'x' })
  })
})

describe('resolveLiveSignals — failure isolation', () => {
  it('a Supabase failure yields no signals, never throws', async () => {
    vi.doMock('../api/_supabase.js', () => ({
      getSupabaseAdmin: () => ({
        from: () => ({
          select: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    }))
    vi.resetModules()
    const { resolveLiveSignals: freshResolve } = await import('../api/live-matches.js')
    const rawMatches = [{
      id: 1,
      opponents: [{ opponent: { name: 'A' } }, { opponent: { name: 'B' } }],
      games: [{ status: 'running', begin_at: '2026-08-01T00:00:00Z', position: 1 }],
    }]
    const result = await freshResolve(rawMatches, log)
    expect(result.size).toBe(0)
    vi.doUnmock('../api/_supabase.js')
    vi.resetModules()
  })

  it('no running games means no query is even attempted (nothing to correlate)', async () => {
    const result = await resolveLiveSignals([], log)
    expect(result.size).toBe(0)
  })
})

describe('collectRunningGames — precondition for the signal pipeline', () => {
  it('a series missing a running game or a full opponent pair never enters the pipeline', () => {
    const noRunning = [{ id: 1, opponents: [{ opponent: { name: 'A' } }, { opponent: { name: 'B' } }], games: [{ status: 'finished' }] }]
    const oneOpponent = [{ id: 2, opponents: [{ opponent: { name: 'A' } }], games: [{ status: 'running', begin_at: '2026-08-01T00:00:00Z' }] }]
    expect(collectRunningGames(noRunning)).toEqual([])
    expect(collectRunningGames(oneOpponent)).toEqual([])
  })
})

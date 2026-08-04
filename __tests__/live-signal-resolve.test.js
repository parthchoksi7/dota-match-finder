/**
 * Integration tests for the live "worth watching" signal's server-side resolution
 * (`.claude/specs/live-worth-watching-signal-spec.md`). Built owner-only 2026-08-01, flipped
 * public 2026-08-03 — `.signal` now reaches every caller's response; the only remaining way to
 * disable it is the `feature:live-signal` KV kill switch (`isFeatureEnabled`, see api/_shared.js).
 */
import { describe, it, expect, vi } from 'vitest'

// Import-safety: live-matches.js constructs an Upstash client + Supabase admin client at module
// load. Mock both so importing the pure helpers doesn't require real credentials (same pattern as
// push-score-ping.test.js).
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() {} } }))

import { resolveLiveSignals, collectRunningGames } from '../api/live-matches.js'

const log = { warn: () => {}, info: () => {}, error: () => {} }

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

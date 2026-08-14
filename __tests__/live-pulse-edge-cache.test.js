/**
 * Cache-Control contract for `?mode=live-pulse` (api/_handlers/livePulseCombined.js) and the
 * deliberate absence of one on `?mode=od-live-capture`.
 *
 * These headers are load-bearing for the Fluid Active CPU budget (2026-08-11), and one of them
 * also silently sets the OpenDota capture cadence — neither property is visible from the handler's
 * response body, so without these assertions a future edit could regress either with every existing
 * test still green. That is exactly what happened before: the endpoint's invocation count scaled
 * linearly with viewership for weeks while the whole suite passed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const LIVE_OD_CAPTURE_SRC = readFileSync(
  path.resolve(process.cwd(), 'api/_handlers/liveOdCapture.js'),
  'utf8',
)

vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
})

const mockGetCachedPulse = vi.fn()
const mockGetCachedValvePulse = vi.fn()
vi.mock('../api/_handlers/liveGamePulse.js', () => ({ getCachedPulse: mockGetCachedPulse }))
vi.mock('../api/_handlers/liveValvePulse.js', () => ({ getCachedValvePulse: mockGetCachedValvePulse }))

const handleLivePulseCombined = (await import('../api/_handlers/livePulseCombined.js')).default

function mockRes() {
  const res = {
    headers: {},
    setHeader: vi.fn((k, v) => { res.headers[k] = v }),
    status: vi.fn(() => res),
    json: vi.fn(payload => { res.body = payload; return res }),
  }
  return res
}

// The capture's KV lock TTL (LOCK_TTL_S in liveOdCapture.js). Not exported, so it is read out of
// the source below rather than restated, and the cadence arithmetic is asserted from the pair —
// the two numbers are only correct RELATIVE to each other.
const EXPECTED_CAPTURE_CADENCE_S = 60

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCachedPulse.mockResolvedValue({ pulse: null })
  mockGetCachedValvePulse.mockResolvedValue({ pulse: null })
})

describe('?mode=live-pulse — edge cache contract', () => {
  it('sets a shared-cacheable Cache-Control on a successful response', async () => {
    const res = mockRes()
    await handleLivePulseCombined({ query: { id: '123', owner: '1' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=\d+/)
    expect(res.headers['Cache-Control']).toContain('public')
  })

  it('pins the browser cache off with max-age=0 (Vercel strips s-maxage before the client sees it, and the leftover directives would otherwise be honored by the browser, hiding fresh data from the poll)', async () => {
    const res = mockRes()
    await handleLivePulseCombined({ query: { id: '123' } }, res)
    expect(res.headers['Cache-Control']).toContain('max-age=0')
  })

  it('pairs s-maxage with the capture lock so the real OD capture cadence stays at 60s', async () => {
    const res = mockRes()
    await handleLivePulseCombined({ query: { id: '123' } }, res)
    const sMaxAge = Number(/s-maxage=(\d+)/.exec(res.headers['Cache-Control'])[1])
    const lockTtl = Number(/const LOCK_TTL_S = (\d+)/.exec(LIVE_OD_CAPTURE_SRC)[1])

    // Each origin revalidation runs captureOdLiveOnce(); attempts every P seconds against a
    // never-released lock of L produce a real capture every ceil(L/P)*P. Only the PAIR is
    // meaningful — either number alone says nothing. A pairing that stretches this (the old
    // P=45/L=60 would have given 90s) silently thins the live_game_gold timeseries behind the
    // net-worth graph and invalidates GOLD_HISTORY_MAX_POINTS, which is sized from this cadence.
    expect(Math.ceil(lockTtl / sMaxAge) * sMaxAge).toBe(EXPECTED_CAPTURE_CADENCE_S)
  })

  it('keeps the lock strictly BELOW the revalidation interval, so the cadence is attempt-limited rather than decided by a lock/TTL phase race', () => {
    const res = mockRes()
    return handleLivePulseCombined({ query: { id: '123' } }, res).then(() => {
      const sMaxAge = Number(/s-maxage=(\d+)/.exec(res.headers['Cache-Control'])[1])
      const lockTtl = Number(/const LOCK_TTL_S = (\d+)/.exec(LIVE_OD_CAPTURE_SRC)[1])
      expect(lockTtl).toBeLessThan(sMaxAge)
    })
  })

  it('does not attach the pulse cache header to the 400 validation responses', async () => {
    // Scope note, verified against production: this asserts the HANDLER adds nothing on the 400
    // path, not that the served 400 is uncacheable. api/tournaments.js sets a generic
    // `s-maxage=60, stale-while-revalidate=300` on the router before dispatching to this mode, so a
    // real 400 goes out with that inherited default. Harmless — a 400 here is deterministic per URL
    // (the id either parses or it does not), so a shared cache entry can only ever repeat the same
    // answer, and it shields the origin from malformed-URL spam. What matters is that the
    // capture-cadence-coupled header above is never applied to a response that skipped the capture.
    const missingId = mockRes()
    await handleLivePulseCombined({ query: {} }, missingId)
    expect(missingId.status).toHaveBeenCalledWith(400)
    expect(missingId.headers['Cache-Control']).toBeUndefined()

    const badId = mockRes()
    await handleLivePulseCombined({ query: { id: 'not-an-id' } }, badId)
    expect(badId.status).toHaveBeenCalledWith(400)
    expect(badId.headers['Cache-Control']).toBeUndefined()
  })

  it('still returns both sources when one rejects (the merge invariant the cache must not disturb)', async () => {
    mockGetCachedValvePulse.mockRejectedValue(new Error('valve down'))
    const res = mockRes()
    await handleLivePulseCombined({ query: { id: '123' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.valve).toEqual({ pulse: null })
    expect(res.body.od).toEqual({ pulse: null })
  })
})

describe('?mode=od-live-capture — deliberately NOT edge-cached', () => {
  it('stays no-store: the CDN looks up its cache before the function runs, so a stored entry would be served to the QStash */15 backstop and silently skip both the OD capture and the Live Story piggyback', () => {
    const handlerBody = LIVE_OD_CAPTURE_SRC.slice(
      LIVE_OD_CAPTURE_SRC.indexOf('export default async function handleLiveOdCapture'),
    )
    expect(handlerBody).toContain("'private, no-store'")
    expect(handlerBody).not.toMatch(/setHeader\([^)]*s-maxage/)
  })

  it('still declares a numeric LOCK_TTL_S for the cadence assertions above to read', () => {
    const m = /const LOCK_TTL_S = (\d+)/.exec(LIVE_OD_CAPTURE_SRC)
    expect(m).not.toBeNull()
    expect(Number(m[1])).toBeGreaterThan(0)
  })
})

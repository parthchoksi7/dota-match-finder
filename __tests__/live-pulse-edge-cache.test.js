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

// The capture's KV lock TTL (LOCK_TTL_S in liveOdCapture.js). Not exported, so it is restated here
// and asserted against the real module below, so the two can never drift apart unnoticed.
const LOCK_TTL_S = 60

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

  it('keeps s-maxage at a value that DIVIDES the capture lock, so the OD capture cadence is unchanged', async () => {
    const res = mockRes()
    await handleLivePulseCombined({ query: { id: '123' } }, res)
    const sMaxAge = Number(/s-maxage=(\d+)/.exec(res.headers['Cache-Control'])[1])

    // Each origin revalidation runs captureOdLiveOnce(); periodic attempts every `sMaxAge` seconds
    // against a never-released LOCK_TTL_S lock produce a real capture every ceil(LOCK/P)*P. Anything
    // that is not an exact divisor stretches the real cadence (P=45 -> 90s, not 60s) and silently
    // thins the live_game_gold timeseries behind the net-worth graph.
    const effectiveCaptureCadence = Math.ceil(LOCK_TTL_S / sMaxAge) * sMaxAge
    expect(effectiveCaptureCadence).toBe(LOCK_TTL_S)
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

  it('LOCK_TTL_S is still the value the live-pulse cadence assertion above assumes', () => {
    expect(Number(/const LOCK_TTL_S = (\d+)/.exec(LIVE_OD_CAPTURE_SRC)[1])).toBe(LOCK_TTL_S)
  })
})

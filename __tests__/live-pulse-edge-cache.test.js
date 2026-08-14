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

// liveOdCapture's LOCK_TTL_S is the ONLY thing that sets the real OD capture cadence: attempts on
// that global lock arrive from one stream per (series x edge PoP) plus one per open homepage tab,
// so they are effectively continuous and the lock is re-claimed right after it expires. Pinned
// EXACTLY, because every dependent invariant is calibrated to this number — GOLD_HISTORY_MAX_POINTS
// (150 points sized for a 2h game), the OpenDota keyless request budget, and live_game_gold's row
// growth on a table with no prune job. Lowering it is a silent 1/L cost multiplier on all three.
const EXPECTED_LOCK_TTL_S = 60

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

  it('pins LOCK_TTL_S exactly — it is the sole control on real capture cadence, and lowering it silently multiplies OpenDota calls and unpruned live_game_gold rows', () => {
    // Deliberately an EXACT equality rather than a relationship with s-maxage. A previous version of
    // this test asserted `ceil(LOCK/s-maxage)*s-maxage === 60` plus `LOCK < s-maxage`, which encodes
    // a single-periodic-attempter model this system does not have — and, worse, those two
    // assertions are satisfied by EVERY LOCK_TTL_S from 1 to 59 when s-maxage is 60. That let a
    // 60 -> 45 change (a 33% cost increase on three separate budgets) pass with a green suite. An
    // exact pin is the only assertion that actually guards the axis this project is over budget on.
    const lockTtl = Number(/const LOCK_TTL_S = (\d+)/.exec(LIVE_OD_CAPTURE_SRC)[1])
    expect(lockTtl).toBe(EXPECTED_LOCK_TTL_S)
  })

  it('keeps GOLD_HISTORY_MAX_POINTS large enough for a long game at the pinned capture cadence', async () => {
    const pulseSrc = readFileSync(path.resolve(process.cwd(), 'api/_handlers/liveGamePulse.js'), 'utf8')
    const maxPoints = Number(/GOLD_HISTORY_MAX_POINTS = (\d+)/.exec(pulseSrc)[1])
    // One gold row accrues per capture, so a game of D seconds yields D / LOCK_TTL_S points and
    // shapeGoldHistory keeps only the most recent GOLD_HISTORY_MAX_POINTS — anything beyond that
    // silently drops EARLY-game history off the net-worth graph. 2h is the long-game case the
    // constant's own comment sizes for; this ties the two constants together so a cadence change
    // cannot quietly outgrow the buffer again.
    const pointsForTwoHourGame = (2 * 60 * 60) / EXPECTED_LOCK_TTL_S
    expect(maxPoints).toBeGreaterThanOrEqual(pointsForTwoHourGame)
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

/**
 * Isolated regression test for a bug caught in code review: an earlier version of the
 * `?mode=od-live-capture` piggyback (api/tournaments.js) awaited BOTH dynamic imports
 * (liveOdCapture.js, then liveStoryCapture.js) before invoking either handler — so a throwing
 * import() for the unrelated Live Story module silently skipped the older, load-bearing OD
 * capture entirely.
 *
 * The sibling file (od-live-capture-piggyback.test.js) mocks captureLiveStoryOnce as a function
 * that REJECTS, which only proves the CALL is isolated — it never exercises the import() itself
 * throwing, which was the actual failure mode. Simulating that precisely requires vi.doMock +
 * vi.resetModules() + a fresh dynamic import, which mutates the shared module registry for the
 * rest of the test file it runs in — kept in its own file specifically so that doesn't leak into
 * unrelated tests (an earlier attempt to add this test inline broke a later, unrelated test in
 * the same file for exactly this reason).
 */
import { describe, it, expect, vi } from 'vitest'

describe('regression: Live Story import failure must not skip the OD capture', () => {
  it('still calls handleLiveOdCapture and sends its response when the Live Story module fails to import', async () => {
    const mockHandleLiveOdCapture = vi.fn(async (req, res) => {
      res.status(200).json({ ok: true, captured: 3 })
    })

    vi.resetModules()
    vi.doMock('../api/_handlers/liveOdCapture.js', () => ({ default: mockHandleLiveOdCapture }))
    vi.doMock('../api/_handlers/liveStoryCapture.js', () => {
      throw new Error('simulated module load failure')
    })

    const { default: freshHandler } = await import('../api/tournaments.js')
    const req = { method: 'GET', query: { mode: 'od-live-capture' }, headers: {} }
    const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }
    res.status.mockReturnValue(res)

    await expect(freshHandler(req, res)).resolves.not.toThrow()
    expect(mockHandleLiveOdCapture).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, captured: 3 })
  })
})

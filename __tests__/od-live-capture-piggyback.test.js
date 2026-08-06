/**
 * Tests for the `?mode=od-live-capture` branch in api/tournaments.js piggybacking Live Story's
 * Valve capture onto the existing od-live-capture QStash schedule (see the comment in
 * api/_handlers/liveStoryCapture.js). This is orchestration logic — start one promise, await
 * another, await the first — that's easy to get subtly wrong (wrong order, an unhandled
 * rejection, the OD response getting delayed or broken by the Live Story call) and has no
 * router-level test coverage otherwise, so it's exercised directly here rather than only
 * verified live.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockHandleLiveOdCapture, mockCaptureLiveStoryOnce } = vi.hoisted(() => ({
  mockHandleLiveOdCapture: vi.fn(async (req, res) => {
    res.status(200).json({ ok: true, captured: 3 })
  }),
  mockCaptureLiveStoryOnce: vi.fn(async () => ({ ok: true, captured: 1 })),
}))

vi.mock('../api/_handlers/liveOdCapture.js', () => ({ default: mockHandleLiveOdCapture }))
vi.mock('../api/_handlers/liveStoryCapture.js', () => ({ captureLiveStoryOnce: mockCaptureLiveStoryOnce }))

import handler from '../api/tournaments.js'

function mockReqRes(mode) {
  const req = { method: 'GET', query: { mode }, headers: {} }
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }
  res.status.mockReturnValue(res)
  return { req, res }
}

beforeEach(() => {
  mockHandleLiveOdCapture.mockClear()
  mockCaptureLiveStoryOnce.mockClear()
})

describe('od-live-capture piggyback', () => {
  it('calls both captures on ?mode=od-live-capture', async () => {
    const { req, res } = mockReqRes('od-live-capture')
    await handler(req, res)
    expect(mockHandleLiveOdCapture).toHaveBeenCalledTimes(1)
    expect(mockCaptureLiveStoryOnce).toHaveBeenCalledTimes(1)
  })

  it('sends the OD response untouched by the piggybacked call', async () => {
    const { req, res } = mockReqRes('od-live-capture')
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, captured: 3 })
    // Exactly one response cycle — the Live Story capture must never write its own response here.
    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledTimes(1)
  })

  it('does not let a Live Story capture failure break or delay the OD response', async () => {
    mockCaptureLiveStoryOnce.mockRejectedValueOnce(new Error('steam api down'))
    const { req, res } = mockReqRes('od-live-capture')
    await expect(handler(req, res)).resolves.not.toThrow()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, captured: 3 })
  })

  it('awaits the Live Story promise before the handler returns (does not fire-and-forget)', async () => {
    let liveStoryResolved = false
    mockCaptureLiveStoryOnce.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 20))
      liveStoryResolved = true
      return { ok: true }
    })
    const { req, res } = mockReqRes('od-live-capture')
    await handler(req, res)
    // If the handler returned before this resolved, Vercel could freeze the container mid-fetch —
    // this is the property that actually makes the piggyback reliable, not just "gets called".
    expect(liveStoryResolved).toBe(true)
  })
})

describe('live-story-capture mode (unchanged, standalone)', () => {
  it('still works as its own directly-callable endpoint', async () => {
    const { req, res } = mockReqRes('live-story-capture')
    await handler(req, res)
    expect(mockCaptureLiveStoryOnce).toHaveBeenCalledTimes(1)
    expect(mockHandleLiveOdCapture).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useVisiblePolling } from '../utils/useVisiblePolling'

// The hook exists to stop backgrounded tabs from polling — that was measured at ~2,400 wasted
// serverless invocations/day for a single forgotten homepage tab (2026-08-09, Fluid Active CPU
// budget). These tests pin the two properties that make it safe to swap in for setInterval:
// a hidden tab issues ZERO calls, and returning to a visible tab is never SLOWER than the old
// unconditional interval would have been.

function Harness({ cb, ms, enabled = true }) {
  useVisiblePolling(cb, ms, { enabled })
  return null
}

let visibility = 'visible'

function setVisibility(next) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => visibility === 'hidden')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useVisiblePolling', () => {
  it('does not fire on mount — the caller owns the initial fetch', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    expect(cb).not.toHaveBeenCalled()
  })

  it('ticks on the interval while visible', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('issues zero calls while the tab is hidden, however long it stays hidden', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires immediately on return when a full interval elapsed while hidden', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(10_000) })
    act(() => { setVisibility('visible') })
    // The fan gets fresh data on the spot rather than waiting out a tick scheduled before they
    // left — strictly better than the setInterval this replaced.
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('does NOT refetch when the tab is flicked away and back inside one interval', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { vi.advanceTimersByTime(200) })
    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { setVisibility('visible') })
    // Rapid tab switching must never poll FASTER than the configured rate.
    expect(cb).not.toHaveBeenCalled()
  })

  it('resumes on the ORIGINAL phase after a short hide, never later than plain setInterval would', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(900) })   // t=900, still inside the first interval
    act(() => { setVisibility('visible') })
    expect(cb).not.toHaveBeenCalled()            // no catch-up: a full interval hasn't elapsed

    act(() => { vi.advanceTimersByTime(100) })   // t=1000 — exactly when setInterval would fire
    expect(cb).toHaveBeenCalledTimes(1)

    // ...and the steady cadence continues from there, not from the resume point.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('does not stack timers when visibilitychange fires repeatedly while already visible', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { setVisibility('visible'); setVisibility('visible'); setVisibility('visible') })
    act(() => { vi.advanceTimersByTime(1000) })
    // A duplicate 'visible' event must not create a second interval (which would double the rate).
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('resumes the interval after returning', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} />)
    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { setVisibility('visible') })   // 1 catch-up call
    act(() => { vi.advanceTimersByTime(2000) })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('never polls when disabled', () => {
    const cb = vi.fn()
    render(<Harness cb={cb} ms={1000} enabled={false} />)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('stops polling after unmount', () => {
    const cb = vi.fn()
    const { unmount } = render(<Harness cb={cb} ms={1000} />)
    unmount()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(cb).not.toHaveBeenCalled()
  })

  it('always calls the latest callback without restarting the interval', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Harness cb={first} ms={1000} />)
    act(() => { vi.advanceTimersByTime(900) })
    rerender(<Harness cb={second} ms={1000} />)
    act(() => { vi.advanceTimersByTime(100) })
    // Interval kept its original phase (fired at 1000ms, not restarted at 900ms) and used the
    // newest callback — this is what lets callers pass an unstable inline function safely.
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

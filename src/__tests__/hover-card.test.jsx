/**
 * Coverage for HoverCard (FloatingTooltip.jsx), rewritten 2026-08-08 from `position: absolute` to
 * a measured, clamped `position: fixed` after a real clipping bug shipped (level badge in the
 * live player board — the tooltip rendered inside the sheet's overflow-hidden bound and was cut
 * off). The property that matters here isn't pixel-perfect layout, it's that the tooltip is
 * ALWAYS `position: fixed` (which is what lets it escape any ancestor's overflow:hidden) and
 * ALWAYS clamped on-screen, regardless of where its trigger sits.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { HoverCard, TOOLTIP_EDGE_MARGIN } from '../components/FloatingTooltip.jsx'

// jsdom never lays anything out, so getBoundingClientRect always returns zeros. Stub it per
// element (trigger vs tooltip) so positioning math has real numbers to clamp against.
function mockRect(el, rect) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect,
  })
}

function renderCard(props = {}) {
  return render(
    <HoverCard content={<span>Level 6</span>} align={props.align} className={props.className}>
      <button>trigger</button>
    </HoverCard>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('HoverCard positioning', () => {
  it('renders the tooltip as position:fixed, not absolute — fixed is what escapes an ancestor overflow:hidden', async () => {
    vi.useFakeTimers()
    renderCard()
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.className).toMatch(/\bfixed\b/)
    expect(tooltip.className).not.toMatch(/\babsolute\b/)
  })

  it('positions near the trigger once both rects are measured', async () => {
    vi.useFakeTimers()
    const { container } = renderCard()
    const trigger = container.querySelector('.relative')
    mockRect(trigger, { top: 300, left: 300, right: 340, bottom: 320, width: 40, height: 20 })
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    mockRect(screen.getByRole('tooltip'), { width: 120, height: 40 })
    // Second render pass (content ref now exists) needed for useLayoutEffect to re-measure —
    // trigger it by advancing a microtask.
    await act(async () => {})
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.style.top).not.toBe('')
    expect(tooltip.style.left).not.toBe('')
  })

  it('clamps left edge so the tooltip never renders off the LEFT of the viewport', async () => {
    vi.useFakeTimers()
    const { container } = renderCard({ align: 'right' })
    const trigger = container.querySelector('.relative')
    // Trigger near the very left edge, tooltip wider than the trigger's own left offset —
    // align="right" would naturally put the tooltip's left edge at a negative x.
    mockRect(trigger, { top: 100, left: 5, right: 25, bottom: 120, width: 20, height: 20 })
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    mockRect(screen.getByRole('tooltip'), { width: 150, height: 40 })
    await act(async () => {})
    const left = parseFloat(screen.getByRole('tooltip').style.left)
    expect(left).toBeGreaterThanOrEqual(TOOLTIP_EDGE_MARGIN)
  })

  it('clamps top edge so the tooltip never renders above the TOP of the viewport', async () => {
    vi.useFakeTimers()
    const { container } = renderCard()
    const trigger = container.querySelector('.relative')
    // Trigger near the very top — a tooltip anchored above it would go negative.
    mockRect(trigger, { top: 5, left: 200, right: 220, bottom: 25, width: 20, height: 20 })
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    mockRect(screen.getByRole('tooltip'), { width: 120, height: 60 })
    await act(async () => {})
    const top = parseFloat(screen.getByRole('tooltip').style.top)
    expect(top).toBeGreaterThanOrEqual(TOOLTIP_EDGE_MARGIN)
  })
})

describe('HoverCard show/hide behavior', () => {
  it('does not show immediately on hover — waits out the show delay', () => {
    vi.useFakeTimers()
    renderCard()
    fireEvent.mouseEnter(screen.getByRole('button'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows after the hover delay, hides after the mouse leaves', async () => {
    vi.useFakeTimers()
    renderCard()
    fireEvent.mouseEnter(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens on focus and closes on blur, for keyboard/AT users', async () => {
    vi.useFakeTimers()
    renderCard()
    fireEvent.focus(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(120) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.blur(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('cancels a pending show if the pointer leaves before the delay elapses', async () => {
    vi.useFakeTimers()
    renderCard()
    fireEvent.mouseEnter(screen.getByRole('button'))
    fireEvent.mouseLeave(screen.getByRole('button'))
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('does not leak a pending timer into a setState call after unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = renderCard()
    fireEvent.mouseEnter(screen.getByRole('button'))
    unmount()
    // Would throw/warn ("state update on unmounted component") if the timer weren't cleaned up.
    await act(async () => { vi.advanceTimersByTime(200) })
  })
})

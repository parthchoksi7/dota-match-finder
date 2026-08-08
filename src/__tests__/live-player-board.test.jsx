/**
 * Coverage for LivePlayerBoard's ultimate-ready ring (LiveValveBoard.jsx).
 *
 * The ring around a hero portrait isn't a self-explanatory affordance on its own — confirmed
 * directly (2026-08-08): a real viewer looking at the board couldn't tell what it meant. Two
 * fixes: a persistent legend (visible without hovering anything) and a proper HoverCard tooltip
 * on the ring itself (previously a native `title`, which is slow, unstyled, and invisible on
 * touch).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { LivePlayerBoard } from '../components/LiveValveBoard.jsx'

const HEROES = { 41: { key: 'faceless_void', name: 'Faceless Void' } }

function playerWith(over = {}) {
  return {
    playerSlot: 0, accountId: '1', heroId: 41, name: 'Nightfall', level: 18,
    kills: 5, deaths: 2, assists: 6, lastHits: 100, denies: 5, gold: 500, netWorth: 15000,
    gpm: 500, xpm: 480, items: [0, 0, 0, 0, 0, 0], respawnTimer: 0, isDead: false,
    ultimate: { unlocked: true, ready: true, cooldown: 0 },
    ...over,
  }
}

function renderBoard(radiantOverrides = {}) {
  return render(
    <LivePlayerBoard
      players={{ radiant: [playerWith(radiantOverrides)], dire: [] }}
      heroes={HEROES}
      itemNames={{}}
      radiantName="Tundra"
      direName="BetBoom"
    />
  )
}

describe('LivePlayerBoard — ultimate legend', () => {
  it('always shows a persistent legend explaining both ring states, not just on hover', () => {
    renderBoard()
    expect(screen.getByText('Ultimate ready')).toBeInTheDocument()
    expect(screen.getByText('On cooldown')).toBeInTheDocument()
  })
})

describe('LivePlayerBoard — ultimate ring', () => {
  it('renders a solid green ring when the ultimate is ready', () => {
    const { container } = renderBoard({ ultimate: { unlocked: true, ready: true, cooldown: 0 } })
    const ring = container.querySelector('[aria-label^="Ultimate ready"]')
    expect(ring).not.toBeNull()
    expect(ring.className).toMatch(/border-green-500/)
    expect(ring.className).not.toMatch(/border-dashed/)
  })

  it('renders a dashed gray ring with the cooldown seconds when on cooldown', () => {
    const { container } = renderBoard({ ultimate: { unlocked: true, ready: false, cooldown: 42 } })
    const ring = container.querySelector('[aria-label="Ultimate on cooldown — 42s"]')
    expect(ring).not.toBeNull()
    expect(ring.className).toMatch(/border-dashed/)
  })

  it('renders no ring at all when the ultimate is not yet unlocked', () => {
    const { container } = renderBoard({ ultimate: { unlocked: false, ready: false, cooldown: null } })
    expect(container.querySelector('[aria-label^="Ultimate"]')).toBeNull()
  })

  it('shows a HoverCard tooltip (not a native title) with the same label on hover', async () => {
    vi.useFakeTimers()
    const { container } = renderBoard({ ultimate: { unlocked: true, ready: true, cooldown: 0 } })
    const ring = container.querySelector('[aria-label^="Ultimate ready"]')
    expect(ring.getAttribute('title')).toBeNull()
    fireEvent.mouseEnter(ring)
    await act(async () => { vi.advanceTimersByTime(120) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ultimate ready')
    vi.useRealTimers()
  })
})

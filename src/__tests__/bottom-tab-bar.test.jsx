/**
 * Tests for BottomTabBar.
 *
 * Covers:
 * - Renders 3 tabs: Home, Tournaments, More
 * - Highlights the Home tab on /, /match/:slug
 * - Highlights the Tournaments tab on /tournaments, /tournament/:id
 * - Tapping More dispatches SETTINGS_OPEN_EVENT
 * - Hidden on desktop (md:hidden class)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomTabBar from '../components/BottomTabBar'
import { SETTINGS_OPEN_EVENT } from '../components/SettingsSheet'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))

function setPathname(path) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
  })
}

beforeEach(() => {
  setPathname('/')
})

describe('BottomTabBar - structure', () => {
  it('renders Home, Tournaments, and More tabs', () => {
    render(<BottomTabBar />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Tournaments')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('has md:hidden class so desktop hides it', () => {
    const { container } = render(<BottomTabBar />)
    const nav = container.querySelector('nav')
    expect(nav.className).toContain('md:hidden')
  })
})

describe('BottomTabBar - active state', () => {
  it('marks Home active when path is /', () => {
    setPathname('/')
    render(<BottomTabBar />)
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks Home active when path is /match/some-slug', () => {
    setPathname('/match/team-a-vs-team-b-12345')
    render(<BottomTabBar />)
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks Tournaments active when path is /tournaments', () => {
    setPathname('/tournaments')
    render(<BottomTabBar />)
    const trnmtLink = screen.getByText('Tournaments').closest('a')
    expect(trnmtLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks Tournaments active when path is /tournament/:id', () => {
    setPathname('/tournament/123')
    render(<BottomTabBar />)
    const trnmtLink = screen.getByText('Tournaments').closest('a')
    expect(trnmtLink).toHaveAttribute('aria-current', 'page')
  })

  it('does not mark Home active on /tournaments', () => {
    setPathname('/tournaments')
    render(<BottomTabBar />)
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink).not.toHaveAttribute('aria-current')
  })
})

describe('BottomTabBar - More tab', () => {
  it('dispatches SETTINGS_OPEN_EVENT when More is tapped', () => {
    const listener = vi.fn()
    window.addEventListener(SETTINGS_OPEN_EVENT, listener)
    render(<BottomTabBar />)
    fireEvent.click(screen.getByText('More'))
    expect(listener).toHaveBeenCalled()
    window.removeEventListener(SETTINGS_OPEN_EVENT, listener)
  })
})

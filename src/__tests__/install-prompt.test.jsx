/**
 * Tests for InstallPrompt.
 *
 * Covers:
 * - Does not render when already installed (standalone display mode)
 * - Does not render when previously dismissed (localStorage flag set)
 * - On iOS Safari, shows the step-by-step guide modal and no Install button
 * - On iOS Chrome, shows the "open in Safari" tip when triggered manually
 * - On Android, shows the Install button when beforeinstallprompt fires
 * - Close button hides the modal and persists the dismissed flag
 * - Install button calls the deferred prompt and tracks outcome
 * - Manual trigger via SHOW_EVENT re-shows the guide even after dismiss
 * - Manual trigger without a deferred prompt falls back to a generic browser-menu hint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import InstallPrompt, { SHOW_EVENT } from '../components/InstallPrompt'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'
// Must include "Safari" and NOT include "Chrome/CriOS" to match isIOSSafari()
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IOS_CHROME_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

function mockMatchMedia(standalone) {
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(false)
  setUserAgent(ANDROID_UA)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('InstallPrompt - visibility', () => {
  it('does not render when app is in standalone mode', () => {
    mockMatchMedia(true)
    render(<InstallPrompt />)
    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()
  })

  it('does not render when previously dismissed', () => {
    localStorage.setItem('pwa-install-dismissed', '1')
    render(<InstallPrompt />)
    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()
  })

  it('does not render on Android until beforeinstallprompt fires', () => {
    render(<InstallPrompt />)
    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()
  })
})

describe('InstallPrompt - iOS Safari', () => {
  beforeEach(() => {
    setUserAgent(IOS_UA)
  })

  it('shows the step-by-step guide modal immediately on iOS Safari', () => {
    render(<InstallPrompt />)
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByText(/Tap the Share button/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument()
  })

  it('does not show an Install button on iOS Safari', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument()
  })
})

describe('InstallPrompt - iOS Chrome', () => {
  it('shows the install guide when SHOW_EVENT is dispatched on iOS Chrome', async () => {
    setUserAgent(IOS_CHROME_UA)
    render(<InstallPrompt />)

    await act(async () => {
      window.dispatchEvent(new Event(SHOW_EVENT))
    })

    expect(screen.getByText(/Tap the Share button/i)).toBeInTheDocument()
    expect(screen.getByText(/Install in 3 quick steps/i)).toBeInTheDocument()
  })
})

describe('InstallPrompt - Android', () => {
  it('shows the Install button when beforeinstallprompt fires', async () => {
    render(<InstallPrompt />)

    const event = new Event('beforeinstallprompt')
    event.prompt = vi.fn()
    event.userChoice = Promise.resolve({ outcome: 'accepted' })

    await act(async () => {
      window.dispatchEvent(event)
    })

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^install$/i })).toBeInTheDocument()
  })

  it('calls the deferred prompt when Install is clicked', async () => {
    render(<InstallPrompt />)

    const promptFn = vi.fn()
    const event = new Event('beforeinstallprompt')
    event.prompt = promptFn
    event.userChoice = Promise.resolve({ outcome: 'accepted' })

    await act(async () => {
      window.dispatchEvent(event)
    })

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }))

    await waitFor(() => expect(promptFn).toHaveBeenCalled())
  })
})

describe('InstallPrompt - dismiss', () => {
  beforeEach(() => {
    setUserAgent(IOS_UA)
  })

  it('hides the modal when the close button is clicked', () => {
    render(<InstallPrompt />)
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()
  })

  it('persists the dismissed flag to localStorage', () => {
    render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(localStorage.getItem('pwa-install-dismissed')).toBe('1')
  })
})

describe('InstallPrompt - manual trigger (SHOW_EVENT)', () => {
  it('re-shows the guide after a previous dismiss', async () => {
    setUserAgent(IOS_UA)
    localStorage.setItem('pwa-install-dismissed', '1')
    render(<InstallPrompt />)

    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new Event(SHOW_EVENT))
    })

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByText(/Tap the Share button/i)).toBeInTheDocument()
  })

  it('falls back to a generic browser-menu hint when no deferred prompt is available', async () => {
    setUserAgent(ANDROID_UA)
    render(<InstallPrompt />)

    await act(async () => {
      window.dispatchEvent(new Event(SHOW_EVENT))
    })

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByText(/Open your browser menu/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument()
  })
})

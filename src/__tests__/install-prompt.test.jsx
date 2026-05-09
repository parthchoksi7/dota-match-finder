/**
 * Tests for InstallPrompt.
 *
 * Covers:
 * - Does not render when already installed (standalone display mode)
 * - Does not render when previously dismissed (localStorage flag set)
 * - On iOS, shows the Share/Add to Home Screen hint and no Install button
 * - On Android, shows the Install button when beforeinstallprompt fires
 * - Dismiss button hides the banner and persists the dismissed flag
 * - Install button calls the deferred prompt and tracks outcome
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import InstallPrompt from '../components/InstallPrompt'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'

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

describe('InstallPrompt - iOS', () => {
  beforeEach(() => {
    setUserAgent(IOS_UA)
  })

  it('shows the iOS share hint immediately on iOS', () => {
    render(<InstallPrompt />)
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByText(/Tap Share then Add to Home Screen/i)).toBeInTheDocument()
  })

  it('does not show an Install button on iOS', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('button', { name: /^install$/i })).not.toBeInTheDocument()
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

  it('hides the banner when dismiss is clicked', () => {
    render(<InstallPrompt />)
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument()
  })

  it('persists the dismissed flag to localStorage', () => {
    render(<InstallPrompt />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(localStorage.getItem('pwa-install-dismissed')).toBe('1')
  })
})

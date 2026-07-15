/**
 * Tests for SettingsSheet.
 *
 * Covers:
 * - Hidden by default
 * - Opens when SETTINGS_OPEN_EVENT is dispatched
 * - Closes on close button, Escape, or backdrop click
 * - Spoiler row hidden when no onSpoilerToggle prop
 * - Spoiler row shown with current state when prop is passed
 * - Theme row reflects localStorage and toggles between Dark and Light
 * - Calendar / About / What's New are anchor links to the right routes
 * - Install row dispatches PWA SHOW_EVENT and closes the sheet
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SettingsSheet, { SETTINGS_OPEN_EVENT } from '../components/SettingsSheet'
import { SHOW_EVENT as PWA_SHOW_EVENT } from '../components/InstallPrompt'
import { MANAGE_TEAMS_OPEN_EVENT } from '../components/ManageTeamsModal'
import { isPushSupported, getPushPermission, needsIOSInstall } from '../utils/push'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn(), getFollowedTeams: vi.fn(() => ['Team Liquid']) }
})
// SettingsSheet now renders the shared PushNotificationSettings, which uses the full push API.
vi.mock('../utils/push', () => ({
  isPushSupported: vi.fn(() => false),
  getPushPermission: vi.fn(() => 'unsupported'),
  subscribeToPush: vi.fn(() => Promise.resolve({ ok: true })),
  needsIOSInstall: vi.fn(() => false),
  updatePushPrefs: vi.fn(() => Promise.resolve({ ok: true })),
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  isPushSupported.mockReturnValue(false)
  getPushPermission.mockReturnValue('unsupported')
  needsIOSInstall.mockReturnValue(false)
})

async function openSheet() {
  await act(async () => {
    window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT))
  })
}

describe('SettingsSheet - visibility', () => {
  it('does not render content by default', () => {
    render(<SettingsSheet />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens when SETTINGS_OPEN_EVENT fires', async () => {
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes when the close button is clicked', async () => {
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('SettingsSheet - spoiler row', () => {
  it('does not render the Spoiler row when onSpoilerToggle is not passed', async () => {
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.queryByText('Spoiler-free')).not.toBeInTheDocument()
  })

  it('renders the Spoiler row with state On when spoilerFree=true', async () => {
    render(<SettingsSheet spoilerFree={true} onSpoilerToggle={vi.fn()} />)
    await openSheet()
    expect(screen.getByText('Spoiler-free')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('renders state Off when spoilerFree=false', async () => {
    render(<SettingsSheet spoilerFree={false} onSpoilerToggle={vi.fn()} />)
    await openSheet()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('calls onSpoilerToggle when Spoiler row is clicked', async () => {
    const onToggle = vi.fn()
    render(<SettingsSheet spoilerFree={false} onSpoilerToggle={onToggle} />)
    await openSheet()
    fireEvent.click(screen.getByText('Spoiler-free').closest('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})

describe('SettingsSheet - theme row', () => {
  it('renders all three theme options', async () => {
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'system' })).toBeInTheDocument()
  })

  it('selects light theme when light button is clicked', async () => {
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('selects dark theme when dark button is clicked', async () => {
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('defaults to system when no theme in localStorage', async () => {
    render(<SettingsSheet />)
    await openSheet()
    const systemBtn = screen.getByRole('button', { name: 'system' })
    expect(systemBtn.className).toContain('bg-white')
  })

  it('reflects dark theme stored in localStorage', async () => {
    localStorage.setItem('theme', 'dark')
    render(<SettingsSheet />)
    await openSheet()
    const darkBtn = screen.getByRole('button', { name: 'dark' })
    expect(darkBtn.className).toContain('bg-white')
  })
})

describe('SettingsSheet - links', () => {
  it('renders calendar link to /calendar', async () => {
    render(<SettingsSheet />)
    await openSheet()
    const link = screen.getByText('Add to Google / Apple Calendar').closest('a')
    expect(link).toHaveAttribute('href', '/calendar')
  })

  it('renders About as a link to /about', async () => {
    render(<SettingsSheet />)
    await openSheet()
    const link = screen.getByText('About').closest('a')
    expect(link).toHaveAttribute('href', '/about')
  })

  it("renders What's New as a link to /release-notes", async () => {
    render(<SettingsSheet />)
    await openSheet()
    const link = screen.getByText("What's New").closest('a')
    expect(link).toHaveAttribute('href', '/release-notes')
  })
})

describe('SettingsSheet - inline push notification controls', () => {
  // SettingsSheet now renders the shared PushNotificationSettings component directly, so the
  // full alert controls live in Settings (not just a routing row). These verify the wrapper
  // gating + that the shared component actually mounts in the Settings context.
  it('renders no push UI when push is not supported (wrapper gated, no empty gap)', async () => {
    isPushSupported.mockReturnValue(false)
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.queryByText('Live match alerts')).not.toBeInTheDocument()
    expect(screen.queryByText('Get match alerts')).not.toBeInTheDocument()
  })

  it('shows the inline Enable control when supported and permission is default', async () => {
    isPushSupported.mockReturnValue(true)
    getPushPermission.mockReturnValue('default')
    render(<SettingsSheet />)
    await openSheet()
    // getFollowedTeams is mocked to ['Team Liquid'] → primer path ("Turn on"), not the bare row
    expect(screen.getByText('Get match alerts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /turn on/i })).toBeInTheDocument()
  })

  it('shows the inline On toggle + Customize alerts when permission is granted', async () => {
    isPushSupported.mockReturnValue(true)
    getPushPermission.mockReturnValue('granted')
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.getByRole('switch', { name: 'Live match alerts' })).toBeInTheDocument()
    expect(screen.getByText('Customize alerts')).toBeInTheDocument()
  })

  it('shows the blocked message inline when permission is denied', async () => {
    isPushSupported.mockReturnValue(true)
    getPushPermission.mockReturnValue('denied')
    render(<SettingsSheet />)
    await openSheet()
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument()
  })

  it('shows the iOS install card inline when needsIOSInstall (and closing the sheet is wired to the guide)', async () => {
    isPushSupported.mockReturnValue(true)
    needsIOSInstall.mockReturnValue(true)
    const listener = vi.fn()
    window.addEventListener(PWA_SHOW_EVENT, listener)
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByRole('button', { name: /add to home screen/i }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // onCloseParent closed the sheet
    window.removeEventListener(PWA_SHOW_EVENT, listener)
  })
})

describe('SettingsSheet - my teams row', () => {
  it('routes to Manage Teams and closes when clicked', async () => {
    const listener = vi.fn()
    window.addEventListener(MANAGE_TEAMS_OPEN_EVENT, listener)
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByText('My teams').closest('button'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    window.removeEventListener(MANAGE_TEAMS_OPEN_EVENT, listener)
  })
})

describe('SettingsSheet - install', () => {
  it('dispatches PWA SHOW_EVENT and closes when Install row is clicked', async () => {
    const listener = vi.fn()
    window.addEventListener(PWA_SHOW_EVENT, listener)
    render(<SettingsSheet />)
    await openSheet()
    fireEvent.click(screen.getByText('Install as app').closest('button'))
    expect(listener).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    window.removeEventListener(PWA_SHOW_EVENT, listener)
  })
})

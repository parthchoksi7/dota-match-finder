/**
 * Tests for the push notification entry points in ManageTeamsModal added alongside
 * WS5 (permission pre-prompt + iOS install guide):
 * - iOS in-tab (needsIOSInstall true): shows an "Add to Home Screen" card that opens
 *   the InstallPrompt guide and dismisses the modal, and never calls subscribeToPush
 * - First-time default-permission ask: shows a primer with "Not now" (never touches
 *   the OS permission dialog) and "Turn on" (calls subscribeToPush, same as Enable)
 * - "Not now" persists a dismissed flag so the primer collapses to the compact row
 * - Granted state still shows the Toggle + test-notification footer, no primer/iOS card
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ManageTeamsModal from '../components/ManageTeamsModal'
import { SHOW_EVENT as PWA_SHOW_EVENT } from '../components/InstallPrompt'
import { isPushSupported, getPushPermission, subscribeToPush, needsIOSInstall } from '../utils/push'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn() }
})
vi.mock('../utils/push', () => ({
  isPushSupported: vi.fn(() => true),
  getPushPermission: vi.fn(() => 'default'),
  subscribeToPush: vi.fn(() => Promise.resolve({ ok: true })),
  needsIOSInstall: vi.fn(() => false),
}))

const baseProps = {
  open: true,
  followedTeams: ['Team Liquid'],
  onToggleFollow: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  isPushSupported.mockReturnValue(true)
  getPushPermission.mockReturnValue('default')
  needsIOSInstall.mockReturnValue(false)
  subscribeToPush.mockResolvedValue({ ok: true })
})

describe('ManageTeamsModal - visibility', () => {
  it('renders nothing when open=false', () => {
    render(<ManageTeamsModal {...baseProps} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ManageTeamsModal - iOS install card', () => {
  it('shows the install card instead of Enable/primer when needsIOSInstall is true', () => {
    needsIOSInstall.mockReturnValue(true)
    render(<ManageTeamsModal {...baseProps} />)
    expect(screen.getByText('Get match alerts')).toBeInTheDocument()
    expect(screen.getByText(/requires installing/i)).toBeInTheDocument()
    expect(screen.queryByText('Enable')).not.toBeInTheDocument()
    expect(screen.queryByText('Turn on')).not.toBeInTheDocument()
  })

  it('shows ONLY the install card, never the "notifications blocked" card, when permission is already denied on iOS in-tab', () => {
    // Regression: iOS in-tab permission state is moot until installed (Apple blocks push
    // regardless), so needsIOSInstall must win over pushDenied, not render alongside it.
    needsIOSInstall.mockReturnValue(true)
    getPushPermission.mockReturnValue('denied')
    render(<ManageTeamsModal {...baseProps} />)
    expect(screen.getByText('Get match alerts')).toBeInTheDocument()
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument()
  })

  it('clicking Add to Home Screen dispatches the PWA show event and closes the modal, without subscribing', () => {
    needsIOSInstall.mockReturnValue(true)
    const listener = vi.fn()
    window.addEventListener(PWA_SHOW_EVENT, listener)
    const onClose = vi.fn()
    render(<ManageTeamsModal {...baseProps} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /add to home screen/i }))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(subscribeToPush).not.toHaveBeenCalled()
    window.removeEventListener(PWA_SHOW_EVENT, listener)
  })
})

describe('ManageTeamsModal - permission pre-prompt (primer)', () => {
  it('shows the primer (not the compact Enable row) on a first-time default-permission ask with a followed team', () => {
    render(<ManageTeamsModal {...baseProps} />)
    expect(screen.getByText(/heads-up before kickoff/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /turn on/i })).toBeInTheDocument()
  })

  it('does NOT show the primer when no teams are followed (falls back to compact card + hint)', () => {
    render(<ManageTeamsModal {...baseProps} followedTeams={[]} />)
    expect(screen.queryByText(/heads-up before kickoff/i)).not.toBeInTheDocument()
    expect(screen.getByText('Follow at least one team first.')).toBeInTheDocument()
  })

  it('"Not now" dismisses the primer, persists the flag, and never calls subscribeToPush', () => {
    render(<ManageTeamsModal {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(subscribeToPush).not.toHaveBeenCalled()
    expect(localStorage.getItem('spectate-push-primer-dismissed')).toBe('1')
    // Collapses to the compact row
    expect(screen.getByText('Enable')).toBeInTheDocument()
    expect(screen.queryByText(/heads-up before kickoff/i)).not.toBeInTheDocument()
  })

  it('does not show the primer again once previously dismissed', () => {
    localStorage.setItem('spectate-push-primer-dismissed', '1')
    render(<ManageTeamsModal {...baseProps} />)
    expect(screen.queryByText(/heads-up before kickoff/i)).not.toBeInTheDocument()
    expect(screen.getByText('Enable')).toBeInTheDocument()
  })

  it('"Turn on" calls subscribeToPush with the followed teams, same as the compact Enable button', async () => {
    render(<ManageTeamsModal {...baseProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /turn on/i }))
    })
    expect(subscribeToPush).toHaveBeenCalledWith(['Team Liquid'])
  })
})

describe('ManageTeamsModal - granted state', () => {
  it('shows the Toggle and test-notification footer, no primer or iOS card, when permission is granted', () => {
    getPushPermission.mockReturnValue('granted')
    render(<ManageTeamsModal {...baseProps} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByText('Send test notification')).toBeInTheDocument()
    expect(screen.queryByText(/heads-up before kickoff/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Get match alerts')).not.toBeInTheDocument()
  })
})

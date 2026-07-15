/**
 * Tests for PushNotificationSettings — the shared push control surface rendered by BOTH
 * ManageTeamsModal and SettingsSheet. The per-surface interaction tests live with those
 * components; this file covers the component's own contract: self-hiding, the `source`
 * analytics tag, and the onCloseParent hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PushNotificationSettings from '../components/PushNotificationSettings'
import { SHOW_EVENT as PWA_SHOW_EVENT } from '../components/InstallPrompt'
import { trackEvent } from '../utils'
import { isPushSupported, getPushPermission, needsIOSInstall } from '../utils/push'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn() }
})
vi.mock('../utils/push', () => ({
  isPushSupported: vi.fn(() => true),
  getPushPermission: vi.fn(() => 'granted'),
  subscribeToPush: vi.fn(() => Promise.resolve({ ok: true })),
  needsIOSInstall: vi.fn(() => false),
  updatePushPrefs: vi.fn(() => Promise.resolve({ ok: true })),
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  isPushSupported.mockReturnValue(true)
  getPushPermission.mockReturnValue('granted')
  needsIOSInstall.mockReturnValue(false)
})

describe('PushNotificationSettings', () => {
  it('renders nothing when push is unsupported and not denied (self-hides)', () => {
    isPushSupported.mockReturnValue(false)
    getPushPermission.mockReturnValue('unsupported')
    const { container } = render(<PushNotificationSettings followedTeams={['Team Liquid']} source="test" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still shows the blocked message when denied even if isPushSupported is false', () => {
    isPushSupported.mockReturnValue(false)
    getPushPermission.mockReturnValue('denied')
    render(<PushNotificationSettings followedTeams={[]} source="test" />)
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument()
  })

  it('tags every event with the provided source', () => {
    getPushPermission.mockReturnValue('granted')
    render(<PushNotificationSettings followedTeams={['Team Liquid']} source="settings_sheet" />)
    fireEvent.click(screen.getByText('Customize alerts'))
    expect(trackEvent).toHaveBeenCalledWith('push_prefs_customize_expand', { source: 'settings_sheet' })

    fireEvent.click(screen.getByRole('switch', { name: 'Live alerts' }))
    expect(trackEvent).toHaveBeenCalledWith('push_prefs_type_toggle', { type: 'live', enabled: false })
  })

  it('calls onCloseParent before dispatching the install guide event on iOS', () => {
    needsIOSInstall.mockReturnValue(true)
    const order = []
    const onCloseParent = vi.fn(() => order.push('close'))
    const guideListener = vi.fn(() => order.push('guide'))
    window.addEventListener(PWA_SHOW_EVENT, guideListener)

    render(<PushNotificationSettings followedTeams={[]} source="test" onCloseParent={onCloseParent} />)
    fireEvent.click(screen.getByRole('button', { name: /add to home screen/i }))

    expect(onCloseParent).toHaveBeenCalledTimes(1)
    expect(guideListener).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['close', 'guide']) // parent closes first, then the guide opens
    window.removeEventListener(PWA_SHOW_EVENT, guideListener)
  })

  it('does not throw when onCloseParent is omitted (optional prop)', () => {
    needsIOSInstall.mockReturnValue(true)
    render(<PushNotificationSettings followedTeams={[]} source="test" />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: /add to home screen/i }))).not.toThrow()
  })
})

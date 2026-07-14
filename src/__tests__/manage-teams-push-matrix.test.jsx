/**
 * Exhaustive state-matrix test for the ManageTeamsModal push section.
 *
 * The section has four visual states (iOS-install / primer / compact / denied) selected by
 * five inputs. The class of bug that slipped past the first review was TWO states rendering
 * at once (iOS card + denied). This test renders EVERY combination and asserts exactly one
 * push card shows — and that it's the correct one — so any future edit that breaks mutual
 * exclusivity fails here rather than in production.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ManageTeamsModal from '../components/ManageTeamsModal'
import { isPushSupported, getPushPermission, needsIOSInstall } from '../utils/push'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn() }
})
vi.mock('../utils/push', () => ({
  isPushSupported: vi.fn(),
  getPushPermission: vi.fn(),
  subscribeToPush: vi.fn(() => Promise.resolve({ ok: true })),
  needsIOSInstall: vi.fn(),
}))
vi.mock('./InstallPrompt', () => ({ SHOW_EVENT: 'pwa-show-prompt' }), { virtual: true })

const PRIMER_DISMISSED_KEY = 'spectate-push-primer-dismissed'

// Distinct marker per state (titles overlap — "Get match alerts" is shared by iOS card and
// primer). Case-SENSITIVE regexes on purpose: the denied card's copy ends "...receive live
// match alerts" (lowercase), which a case-insensitive matcher would wrongly flag as the
// compact card's "Live match alerts" (capital L) title. Regex keeps the two distinct.
const MARKERS = {
  ios: /Add to Home Screen/,
  primer: /Turn on/,
  compact: /Live match alerts/,
  denied: /Notifications are blocked/,
}

// Mirror of the component's actual render conditions, used to compute the expected state.
function expectedState({ pushSupported, iosInstallNeeded, permission, primerDismissed, teamCount }) {
  const granted = permission === 'granted'
  const denied = permission === 'denied'
  if (pushSupported && iosInstallNeeded) return 'ios'
  const showPrimer = pushSupported && !iosInstallNeeded && !granted && !denied && !primerDismissed && teamCount > 0
  if (pushSupported && !iosInstallNeeded && !denied && showPrimer) return 'primer'
  if (pushSupported && !iosInstallNeeded && !denied) return 'compact'
  if (denied && !iosInstallNeeded) return 'denied'
  return 'none'
}

const SUPPORTED = [true, false]
const IOS = [true, false]
const PERMISSION = ['default', 'granted', 'denied']
const DISMISSED = [true, false]
const TEAMS = [0, 1]

const combos = []
for (const pushSupported of SUPPORTED)
  for (const iosInstallNeeded of IOS)
    for (const permission of PERMISSION)
      for (const primerDismissed of DISMISSED)
        for (const teamCount of TEAMS)
          combos.push({ pushSupported, iosInstallNeeded, permission, primerDismissed, teamCount })

describe('ManageTeamsModal push section — exhaustive state matrix (48 combinations)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it.each(combos)(
    'supported=$pushSupported ios=$iosInstallNeeded perm=$permission dismissed=$primerDismissed teams=$teamCount',
    (state) => {
      isPushSupported.mockReturnValue(state.pushSupported)
      needsIOSInstall.mockReturnValue(state.iosInstallNeeded)
      getPushPermission.mockReturnValue(state.permission)
      if (state.primerDismissed) localStorage.setItem(PRIMER_DISMISSED_KEY, '1')

      render(
        <ManageTeamsModal
          open
          followedTeams={state.teamCount ? ['Team Liquid'] : []}
          onToggleFollow={() => {}}
          onClose={() => {}}
        />
      )

      const expected = expectedState(state)

      // Exactly one push card renders — never zero-when-expected, never two.
      const present = Object.entries(MARKERS).filter(([, matcher]) => screen.queryByText(matcher))
      if (expected === 'none') {
        expect(present.map(([k]) => k)).toEqual([])
      } else {
        expect(present.map(([k]) => k)).toEqual([expected])
      }
    }
  )
})

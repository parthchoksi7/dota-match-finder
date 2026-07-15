import { useState, useEffect } from "react"
import { trackEvent } from "../utils"
import { isPushSupported, getPushPermission, subscribeToPush, needsIOSInstall, updatePushPrefs } from "../utils/push"
import { SHOW_EVENT as PWA_SHOW_EVENT } from "./InstallPrompt"

// The entire push-notification control surface — the four mutually-exclusive states
// (iOS-install / permission primer / granted compact card with Customize panel / denied)
// plus all their state and handlers. Rendered identically from BOTH ManageTeamsModal and
// SettingsSheet so notification management lives wherever a user looks for it, with a single
// source of truth (never duplicate this logic per surface). Self-hides (renders nothing)
// when push isn't supported and isn't denied.
//
// Props:
//   followedTeams: string[]  — the teams to subscribe with (canonical getFollowedTeams()).
//   source: string           — analytics source tag for every trackEvent fired here.
//   onCloseParent?: () => void — called before opening the iOS install guide so the parent
//                                modal/sheet closes first (the guide is its own overlay).

const PUSH_DISABLED_KEY = 'spectate-push-disabled'
// Shown once: explains what alerts you get + a "Not now" that never touches the OS
// permission dialog, so a decline here can't burn Notification.requestPermission's
// one-shot prompt. Collapses to the compact Enable row for good once dismissed or granted.
const PUSH_PRIMER_DISMISSED_KEY = 'spectate-push-primer-dismissed'
// Mirrors the server-side push:prefs shape so the Customize panel reads instantly with no
// round trip. Per-browser, like followedTeams and the flags above — the subscription
// endpoint these sync to is itself per-browser, so there's no cross-device state to reconcile.
const PUSH_PREFS_KEY = 'spectate-push-prefs'
const DEFAULT_PREFS = { types: { soon: true, live: true, replay: true }, quietStart: null, quietEnd: null }
// Pre-filled the first time a user turns quiet hours on — matches the original Phase 1
// design intent (.claude/push-phase1-plan.md), not a server-enforced default.
const DEFAULT_QUIET_START = 23 // 11 PM
const DEFAULT_QUIET_END = 8    // 8 AM

function loadStoredPrefs() {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    // quietStart/quietEnd are a pair — the UI reads quietStart != null alone to decide
    // whether to show the toggle as on and render the pickers, so a half-corrupted value
    // (one valid, one not) must fall back to BOTH null, never one null + one number.
    const quietValid = Number.isInteger(parsed.quietStart) && Number.isInteger(parsed.quietEnd)
    return {
      types: { ...DEFAULT_PREFS.types, ...(parsed.types || {}) },
      quietStart: quietValid ? parsed.quietStart : null,
      quietEnd: quietValid ? parsed.quietEnd : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function formatHour12(h) {
  const period = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour} ${period}`
}

function BellIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function AddToHomeIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function Toggle({ on, onChange, disabled, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
        on ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export default function PushNotificationSettings({ followedTeams = [], source, onCloseParent }) {
  const [pushPermission, setPushPermission] = useState(() => getPushPermission())
  const [pushDisabled, setPushDisabled] = useState(() => {
    try { return localStorage.getItem(PUSH_DISABLED_KEY) === '1' } catch { return false }
  })
  const [pushLoading, setPushLoading] = useState(false)
  const [testState, setTestState] = useState('idle') // idle | sending | sent | failed
  const [primerDismissed, setPrimerDismissed] = useState(() => {
    try { return localStorage.getItem(PUSH_PRIMER_DISMISSED_KEY) === '1' } catch { return false }
  })
  const [prefs, setPrefs] = useState(loadStoredPrefs)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useEffect(() => {
    if (testState !== 'sent' && testState !== 'failed') return
    const t = setTimeout(() => setTestState('idle'), 5000)
    return () => clearTimeout(t)
  }, [testState])

  const pushSupported = isPushSupported()
  const pushGranted = pushPermission === 'granted'
  const pushDenied = pushPermission === 'denied'
  const pushOn = pushGranted && !pushDisabled
  const iosInstallNeeded = needsIOSInstall()
  const showPrimer = pushSupported && !iosInstallNeeded && !pushGranted && !pushDenied && !primerDismissed && followedTeams.length > 0

  function handleDismissPrimer() {
    try { localStorage.setItem(PUSH_PRIMER_DISMISSED_KEY, '1') } catch {}
    setPrimerDismissed(true)
    trackEvent('push_primer_dismissed', { source })
  }

  function handleOpenInstallGuide() {
    trackEvent('push_ios_install_prompt', { source })
    if (typeof onCloseParent === 'function') onCloseParent()
    window.dispatchEvent(new Event(PWA_SHOW_EVENT))
  }

  async function handleEnablePush() {
    if (followedTeams.length === 0) return
    setPushLoading(true)
    try {
      const result = await subscribeToPush(followedTeams)
      if (result.ok) {
        setPushPermission('granted')
        setPushDisabled(false)
        try { localStorage.removeItem(PUSH_DISABLED_KEY) } catch {}
        trackEvent('push_enable', { source, team_count: followedTeams.length })
      } else {
        setPushPermission(getPushPermission())
      }
    } finally {
      setPushLoading(false)
    }
  }

  async function handleTogglePush() {
    if (pushOn) {
      // Turn off: tell server to send for 0 teams, set disabled flag locally
      setPushDisabled(true)
      try { localStorage.setItem(PUSH_DISABLED_KEY, '1') } catch {}
      subscribeToPush([]).catch(() => {})
      trackEvent('push_disable', { source })
    } else {
      // Turn on: re-subscribe with current team list
      setPushLoading(true)
      try {
        const result = await subscribeToPush(followedTeams)
        if (result.ok) {
          setPushDisabled(false)
          try { localStorage.removeItem(PUSH_DISABLED_KEY) } catch {}
          trackEvent('push_enable', { source, team_count: followedTeams.length })
        }
      } finally {
        setPushLoading(false)
      }
    }
  }

  async function handleTestPush() {
    setTestState('sending')
    trackEvent('push_test_click', { source })
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setTestState('failed'); trackEvent('push_test_failed', { reason: 'no_subscription' }); return }
      const res = await fetch('/api/live-matches?mode=push-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      setTestState(res.ok ? 'sent' : 'failed')
      trackEvent(res.ok ? 'push_test_sent' : 'push_test_failed', { status: res.status })
    } catch {
      setTestState('failed')
      trackEvent('push_test_failed', { reason: 'network' })
    }
  }

  // Optimistic: update local state + localStorage immediately, sync to the server in the
  // background. Fire-and-forget matches the existing "turn off" precedent (subscribeToPush([])
  // .catch(() => {})) — a failed sync is low-stakes and self-heals on the next successful call.
  function persistPrefs(next) {
    setPrefs(next)
    try { localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(next)) } catch {}
    updatePushPrefs(followedTeams, next).catch(() => {})
  }

  function handleToggleCustomize() {
    const next = !customizeOpen
    setCustomizeOpen(next)
    if (next) trackEvent('push_prefs_customize_expand', { source })
  }

  function handleToggleType(type) {
    const next = { ...prefs, types: { ...prefs.types, [type]: !prefs.types[type] } }
    persistPrefs(next)
    trackEvent('push_prefs_type_toggle', { type, enabled: next.types[type] })
  }

  function handleToggleQuietHours() {
    const enabling = prefs.quietStart == null
    const next = enabling
      ? { ...prefs, quietStart: DEFAULT_QUIET_START, quietEnd: DEFAULT_QUIET_END }
      : { ...prefs, quietStart: null, quietEnd: null }
    persistPrefs(next)
    trackEvent('push_prefs_quiet_hours_toggle', { enabled: enabling })
  }

  function handleQuietHourChange(field, value) {
    const next = { ...prefs, [field]: Number(value) }
    persistPrefs(next)
    trackEvent('push_prefs_quiet_hours_change', { quietStart: next.quietStart, quietEnd: next.quietEnd })
  }

  return (
    <>
      {pushSupported && iosInstallNeeded && (
        <div className="rounded border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-start gap-2.5 px-3 py-3">
            <span className="text-gray-400 dark:text-gray-600 mt-0.5"><BellIcon /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Get match alerts</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-snug mt-1">
                iOS requires installing Spectate Esports to your home screen first.
              </p>
            </div>
          </div>
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={handleOpenInstallGuide}
              className="focus-ring w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
            >
              <AddToHomeIcon />
              Add to Home Screen
            </button>
          </div>
        </div>
      )}

      {pushSupported && !iosInstallNeeded && !pushDenied && showPrimer && (
        <div className="rounded border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-start gap-2.5 px-3 py-3">
            <span className="text-gray-400 dark:text-gray-600 mt-0.5"><BellIcon /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Get match alerts</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-snug mt-1">
                A heads-up before kickoff, when your team goes live, and when the replay's ready. Off anytime.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              type="button"
              onClick={handleDismissPrimer}
              className="focus-ring flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="focus-ring flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors"
            >
              {pushLoading ? '...' : 'Turn on'}
            </button>
          </div>
        </div>
      )}

      {pushSupported && !iosInstallNeeded && !pushDenied && !showPrimer && (
        <div className="rounded border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={pushOn ? 'text-red-500' : 'text-gray-400 dark:text-gray-600'}>
                <BellIcon />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">Live match alerts</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-snug mt-0.5">
                  {pushGranted
                    ? pushOn ? 'On for all your teams' : 'Paused'
                    : 'Notify when your teams go live'}
                </p>
              </div>
            </div>
            {pushGranted ? (
              <Toggle on={pushOn} onChange={handleTogglePush} disabled={pushLoading} ariaLabel="Live match alerts" />
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushLoading || followedTeams.length === 0}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {pushLoading ? '...' : 'Enable'}
              </button>
            )}
          </div>
          {!pushGranted && followedTeams.length === 0 && (
            <p className="px-3 pb-3 text-[11px] text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 pt-2">
              Follow at least one team first.
            </p>
          )}
          {pushOn && (
            <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800">
              {testState === 'sent' ? (
                <p className="text-[11px] font-semibold text-green-600 dark:text-green-500">
                  Sent. Check your notifications
                </p>
              ) : testState === 'failed' ? (
                <p className="text-[11px] font-semibold text-red-500">
                  Couldn't send. Re-enable alerts or try again
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleTestPush}
                  disabled={testState === 'sending'}
                  className="focus-ring text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 transition-colors"
                >
                  {testState === 'sending' ? 'Sending...' : 'Send test notification'}
                </button>
              )}
            </div>
          )}
          {pushOn && (
            <div className="border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                aria-expanded={customizeOpen}
                onClick={handleToggleCustomize}
                className="focus-ring w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-500">
                  Customize alerts
                </span>
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0 ${customizeOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {customizeOpen && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="space-y-2.5">
                    {[
                      { key: 'soon', label: 'Starting soon', sublabel: 'A few minutes before kickoff' },
                      { key: 'live', label: 'Live', sublabel: 'When your team goes live' },
                      { key: 'replay', label: 'Replay ready', sublabel: 'When the VOD is available' },
                    ].map(({ key, label, sublabel }) => (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{label}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight mt-0.5">{sublabel}</p>
                        </div>
                        <Toggle on={prefs.types[key]} onChange={() => handleToggleType(key)} ariaLabel={`${label} alerts`} />
                      </div>
                    ))}
                  </div>

                  <div className="pt-2.5 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">Quiet hours</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight mt-0.5">Mutes every alert during this window (your local time)</p>
                      </div>
                      <Toggle on={prefs.quietStart != null} onChange={handleToggleQuietHours} ariaLabel="Quiet hours" />
                    </div>
                    {prefs.quietStart != null && (
                      <div className="flex items-center gap-2 mt-2.5">
                        <select
                          aria-label="Quiet hours start"
                          value={prefs.quietStart}
                          onChange={e => handleQuietHourChange('quietStart', e.target.value)}
                          className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-gray-500 dark:focus:border-gray-500"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>{formatHour12(h)}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide flex-shrink-0">to</span>
                        <select
                          aria-label="Quiet hours end"
                          value={prefs.quietEnd}
                          onChange={e => handleQuietHourChange('quietEnd', e.target.value)}
                          className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-gray-500 dark:focus:border-gray-500"
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>{formatHour12(h)}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* iosInstallNeeded takes priority even over denied: on iOS in-tab, permission state
          is moot until installed (Apple blocks push regardless), and without this guard both
          cards could render at once for a user who denied in-tab before this flow existed. */}
      {pushDenied && !iosInstallNeeded && (
        <div className="flex items-start gap-2.5 px-3 py-3 rounded border border-gray-100 dark:border-gray-800">
          <span className="text-gray-400 dark:text-gray-600 mt-0.5">
            <BellIcon />
          </span>
          <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed">
            Notifications are blocked. Allow them in your browser or system settings to receive live match alerts.
          </p>
        </div>
      )}
    </>
  )
}

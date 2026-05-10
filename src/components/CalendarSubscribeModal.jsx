import { useState } from 'react'
import { trackEvent } from '../utils'

/**
 * Modal for calendar subscription.
 * Primary CTA: one-click provider buttons (Google, Apple, Outlook).
 * Secondary: copy URL manually + manual setup accordion.
 *
 * Props:
 *   isOpen: bool
 *   onClose: () => void
 *   url: string  - the .ics subscription URL (https://)
 *   feedType: 'team' | 'tournament'
 *   source: string
 *   label: string - human-readable label for what's being subscribed to
 */
export default function CalendarSubscribeModal({ isOpen, onClose, url, feedType, source, label }) {
  const [copied, setCopied] = useState(false)
  const [openPlatform, setOpenPlatform] = useState(null)

  if (!isOpen) return null

  const webcalUrl = url ? url.replace(/^https:\/\//, 'webcal://') : ''
  const googleUrl = webcalUrl
    ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcalUrl)}`
    : ''
  const appleUrl = webcalUrl
  const outlookUrl = url
    ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}`
    : ''

  function handleProviderClick(provider) {
    trackEvent('calendar_provider_click', { provider, feed_type: feedType, source })
    if (provider === 'apple') {
      window.location.href = appleUrl
    } else if (provider === 'google') {
      window.open(googleUrl, '_blank', 'noopener')
    } else if (provider === 'outlook') {
      window.open(outlookUrl, '_blank', 'noopener')
    }
  }

  function handleCopy() {
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      trackEvent('calendar_url_copy', { feed_type: feedType, url, source })
    }).catch(() => {
      const input = document.getElementById('calendar-url-input')
      if (input) { input.select(); document.execCommand('copy') }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function togglePlatform(platform) {
    setOpenPlatform(prev => prev === platform ? null : platform)
  }

  const providers = [
    {
      id: 'google',
      label: 'Add to Google Calendar',
      badge: 'G',
      badgeColor: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    },
    {
      id: 'apple',
      label: 'Add to Apple Calendar',
      badge: 'A',
      badgeColor: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    },
    {
      id: 'outlook',
      label: 'Add to Outlook',
      badge: 'O',
      badgeColor: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
    },
  ]

  const platforms = [
    {
      id: 'google',
      name: 'Google Calendar',
      steps: [
        'Open Google Calendar on your computer (calendar.google.com)',
        'Click the "+" next to "Other calendars" in the left sidebar',
        'Choose "From URL"',
        'Paste the URL above and click "Add calendar"',
        'Your calendar will update within 12-24 hours',
      ],
      note: 'Google Calendar refreshes subscribed calendars roughly every 12-24 hours.',
    },
    {
      id: 'apple',
      name: 'Apple Calendar',
      steps: [
        'Open the Calendar app on Mac or iPhone',
        'On Mac: go to File > New Calendar Subscription',
        'On iPhone: go to Settings > Calendar > Accounts > Add Account > Other > Add Subscribed Calendar',
        'Paste the URL and tap Subscribe',
        'Set the refresh interval to "Every Hour" for more frequent updates',
      ],
      note: 'Apple Calendar can be set to refresh as often as every 5 minutes.',
    },
    {
      id: 'outlook',
      name: 'Outlook',
      steps: [
        'Open Outlook (desktop or web at outlook.com)',
        'Go to the Calendar view',
        'Click "Add calendar" from the left panel',
        'Choose "Subscribe from web"',
        'Paste the URL and click "Import"',
      ],
      note: 'Outlook typically refreshes subscribed calendars once per day.',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Calendar subscription"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold">
              Calendar Feed
            </p>
            <h2 className="font-display font-black text-lg uppercase tracking-wide text-gray-900 dark:text-white leading-tight mt-0.5">
              Subscribe to Matches
            </h2>
            {label && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{label}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">

          {/* One-click provider buttons */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-3">
              Add to your calendar
            </p>
            <div className="flex flex-col gap-2">
              {providers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderClick(p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${p.badgeColor}`}>
                      {p.badge}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{p.label}</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Copy URL (secondary) */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-2">
              Or copy URL manually
            </p>
            <div className="flex items-stretch gap-2">
              <input
                id="calendar-url-input"
                type="text"
                readOnly
                value={url || ''}
                className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300 select-all"
                onFocus={e => e.target.select()}
              />
              <button
                type="button"
                onClick={handleCopy}
                className={
                  'px-3 py-2 rounded text-sm font-semibold transition-colors flex-shrink-0 ' +
                  (copied
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200')
                }
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Platform instructions accordion */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-2">
              Manual setup instructions
            </p>
            <div className="border border-gray-200 dark:border-gray-800 rounded divide-y divide-gray-200 dark:divide-gray-800">
              {platforms.map(platform => (
                <div key={platform.id}>
                  <button
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    aria-expanded={openPlatform === platform.id}
                  >
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {platform.name}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={'w-4 h-4 text-gray-400 transition-transform duration-150 ' + (openPlatform === platform.id ? 'rotate-180' : '')}
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {openPlatform === platform.id && (
                    <div className="px-4 pb-3 bg-gray-50 dark:bg-gray-800/50">
                      <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {platform.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      {platform.note && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 italic">
                          {platform.note}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-600 italic">
            Times are always shown in UTC and converted to your local timezone automatically by your calendar app.
          </p>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { trackEvent } from '../utils'

const ACCOUNTS = [
  { handle: 'pgldota2', label: 'PGL' },
  { handle: 'esldota2', label: 'ESL' },
  { handle: 'blastdota', label: 'BLAST' },
  { handle: 'LiquipediaDota', label: 'Liquipedia' },
  { handle: 'GosuGamersDotA', label: 'GosuGamers' },
]

const SCRIPT_POLL_TIMEOUT_MS = 10000

function loadTwitterScript(onReady, onError) {
  if (window.twttr?.widgets) { onReady(); return }
  if (document.getElementById('twitter-wjs')) {
    // Script tag already injected but widgets not ready yet - poll until ready or timeout
    const start = Date.now()
    const poll = setInterval(() => {
      if (window.twttr?.widgets) { clearInterval(poll); onReady() }
      else if (Date.now() - start > SCRIPT_POLL_TIMEOUT_MS) { clearInterval(poll); onError() }
    }, 100)
    return
  }
  const s = document.createElement('script')
  s.id = 'twitter-wjs'
  s.src = 'https://platform.twitter.com/widgets.js'
  s.async = true
  s.charset = 'utf-8'
  s.onload = onReady
  s.onerror = onError
  document.head.appendChild(s)
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark')
}

export default function SocialFeedSection() {
  const [account, setAccount] = useState(ACCOUNTS[0].handle)
  const [scriptReady, setScriptReady] = useState(() => !!window.twttr?.widgets)
  const [scriptError, setScriptError] = useState(false)
  const containerRef = useRef(null)

  // Inject the Twitter widget script once when this section is first mounted
  useEffect(() => {
    if (scriptReady) return
    loadTwitterScript(
      () => setScriptReady(true),
      () => setScriptError(true),
    )
  }, [])

  // Re-trigger widget rendering whenever account changes or script becomes ready
  useEffect(() => {
    if (!scriptReady || !containerRef.current) return
    window.twttr.widgets.load(containerRef.current)
  }, [scriptReady, account])

  function handleAccountSwitch(handle) {
    if (handle === account) return
    setAccount(handle)
    trackEvent('social_account_switch', { to: handle })
  }

  const theme = isDarkMode() ? 'dark' : 'light'

  return (
    <div className="flex flex-col gap-4">

      {/* Account selector chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-1 px-1">
        {ACCOUNTS.map(a => (
          <button
            key={a.handle}
            type="button"
            onClick={() => handleAccountSwitch(a.handle)}
            className={`flex-shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full border transition-colors ${
              account === a.handle
                ? 'bg-sky-500 border-sky-500 text-white'
                : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Account header strip */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-sky-500">
          @{account} on X
        </span>
        <a
          href={`https://x.com/${account}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="ml-auto text-[10px] font-bold uppercase tracking-widest text-sky-500 hover:text-sky-400 transition-colors"
          onClick={() => trackEvent('social_open_profile', { handle: account })}
        >
          View on X ↗
        </a>
      </div>

      {/* Timeline embed - key forces remount on account switch */}
      <div
        key={account}
        ref={containerRef}
        className="rounded border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 min-h-[120px]"
      >
        {scriptError ? (
          <EmbedError handle={account} onRetry={() => {
            setScriptError(false)
            loadTwitterScript(
              () => setScriptReady(true),
              () => setScriptError(true),
            )
          }} />
        ) : !scriptReady ? (
          <EmbedSkeleton />
        ) : (
          // The <a> is processed and replaced by an iframe by twttr.widgets.load().
          // No skeleton sibling here to avoid both rendering visible at the same time.
          // Note: data-tweet-limit was deprecated in X's 2024 embed parameter update.
          <a
            className="twitter-timeline"
            data-theme={theme}
            data-chrome="noheader nofooter noborders"
            data-height="600"
            data-dnt="true"
            data-aria-polite="assertive"
            href={`https://twitter.com/${account}`}
          >
            Tweets by @{account}
          </a>
        )}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-700 uppercase tracking-widest text-center">
        Content embedded from X - Not affiliated with X Corp
      </p>
    </div>
  )
}

function EmbedSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse flex-shrink-0" />
            <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-32" />
          </div>
          <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-full" />
          <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-3/4" />
        </div>
      ))}
    </div>
  )
}

function EmbedError({ handle, onRetry }) {
  return (
    <div className="py-10 text-center flex flex-col items-center gap-3">
      <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
        Could not load @{handle}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs font-bold uppercase tracking-wide border border-gray-300 dark:border-gray-700 rounded hover:border-gray-500 dark:hover:border-gray-500 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

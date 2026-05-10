import { useState, useEffect } from "react"
import { trackEvent } from "../utils"

const DISMISSED_KEY = "pwa-install-dismissed"
export const SHOW_EVENT = "pwa-show-prompt"

function isIOSSafari() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua)
}

function isIOSChrome() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && /crios/i.test(ua)
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  // mode: null | 'ios-guide' | 'ios-chrome' | 'android'
  const [mode, setMode] = useState(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isInStandaloneMode()) return

    const safari = isIOSSafari()
    const chrome = isIOSChrome()
    const dismissed = localStorage.getItem(DISMISSED_KEY)

    if (safari && !dismissed) {
      setMode("ios-guide")
      trackEvent("pwa_prompt_show", { platform: "ios_safari", trigger: "auto" })
    }

    const installPromptHandler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!localStorage.getItem(DISMISSED_KEY)) {
        setMode("android")
        trackEvent("pwa_prompt_show", { platform: "android", trigger: "auto" })
      }
    }

    const manualShowHandler = () => {
      if (safari) {
        setMode("ios-guide")
        trackEvent("pwa_prompt_show", { platform: "ios_safari", trigger: "manual" })
      } else if (chrome) {
        setMode("ios-chrome")
        trackEvent("pwa_prompt_show", { platform: "ios_chrome", trigger: "manual" })
      } else {
        setMode("android")
        trackEvent("pwa_prompt_show", { platform: "android", trigger: "manual" })
      }
    }

    window.addEventListener("beforeinstallprompt", installPromptHandler)
    window.addEventListener(SHOW_EVENT, manualShowHandler)
    return () => {
      window.removeEventListener("beforeinstallprompt", installPromptHandler)
      window.removeEventListener(SHOW_EVENT, manualShowHandler)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1")
    trackEvent("pwa_prompt_dismiss", { platform: mode })
    setMode(null)
  }

  async function install() {
    if (!deferredPrompt) return
    trackEvent("pwa_install_click")
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    trackEvent("pwa_install_outcome", { outcome })
    if (outcome === "accepted") setMode(null)
    setDeferredPrompt(null)
  }

  if (mode === "ios-guide") return <IOSSafariGuide onDismiss={dismiss} />
  if (mode === "ios-chrome") return <IOSChromeTip onDismiss={dismiss} />
  if (mode !== "android") return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-3 py-3 flex items-center gap-3">
        <img src="/favicon.png" alt="" className="w-8 h-8 rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Add to Home Screen</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            {deferredPrompt ? "Works offline, no app store needed" : 'Open your browser menu and tap "Install app"'}
          </p>
        </div>
        {deferredPrompt && (
          <button
            onClick={install}
            className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 rounded transition-colors min-h-[44px]"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-xl leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function IOSSafariGuide({ onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:w-80 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="Spectate Esports" className="w-9 h-9 rounded-xl flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">Spectate Esports</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 leading-tight">Add to Home Screen</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8 flex items-center justify-center text-2xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Install in 3 quick steps using Safari:
          </p>

          <Step number={1} title='Tap the Share button' subtitle="At the bottom of your Safari browser">
            <SafariShareIcon />
          </Step>

          <Step number={2} title='"Add to Home Screen"' subtitle='Scroll down in the menu to find it'>
            <AddToHomeIcon />
          </Step>

          <Step number={3} title='Tap "Add" in the top right' subtitle="The app will appear on your home screen">
            <CheckCircleIcon />
          </Step>
        </div>

        <div className="px-5 pb-6">
          <button
            onClick={onDismiss}
            className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-sm rounded-xl py-3.5 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ number, title, subtitle, children }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
        <span className="text-white text-sm font-bold">{number}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        <div className="mt-2 text-gray-400 dark:text-gray-600">
          {children}
        </div>
      </div>
    </div>
  )
}

function IOSChromeTip({ onDismiss }) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
    trackEvent("pwa_copy_link_ios_chrome")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:w-80 rounded-t-2xl sm:rounded-2xl shadow-xl">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Open in Safari to Install</p>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8 flex items-center justify-center text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Chrome on iPhone cannot install web apps. Open this page in Safari to add Spectate Esports to your home screen.
          </p>
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 rounded-xl py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>{copied ? "Link copied!" : "Copy link"}</span>
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
            Then open Safari and paste in the address bar
          </p>
        </div>
      </div>
    </div>
  )
}

function SafariShareIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v10M8 6l4-4 4 4" />
      <path d="M20 14v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6" />
    </svg>
  )
}

function AddToHomeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

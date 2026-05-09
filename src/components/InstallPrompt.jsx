import { useState, useEffect } from "react"
import { trackEvent } from "../utils"

const DISMISSED_KEY = "pwa-install-dismissed"
export const SHOW_EVENT = "pwa-show-prompt"

function isIOS() {
  if (typeof navigator === "undefined") return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isInStandaloneMode()) return

    const ios = isIOS()
    setIosHint(ios)

    const dismissed = localStorage.getItem(DISMISSED_KEY)

    if (ios && !dismissed) {
      setShow(true)
      trackEvent("pwa_prompt_show", { platform: "ios", trigger: "auto" })
    }

    const installPromptHandler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!localStorage.getItem(DISMISSED_KEY)) {
        setShow(true)
        trackEvent("pwa_prompt_show", { platform: "android", trigger: "auto" })
      }
    }

    const manualShowHandler = () => {
      setShow(true)
      trackEvent("pwa_prompt_show", { platform: ios ? "ios" : "android", trigger: "manual" })
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
    setShow(false)
    trackEvent("pwa_prompt_dismiss", { platform: iosHint ? "ios" : "android" })
  }

  async function install() {
    if (!deferredPrompt) return
    trackEvent("pwa_install_click")
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    trackEvent("pwa_install_outcome", { outcome })
    if (outcome === "accepted") setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  const canInstallNatively = !iosHint && !!deferredPrompt
  const hintText = iosHint
    ? "Tap Share then Add to Home Screen"
    : canInstallNatively
      ? "Works offline, no app store needed"
      : 'Open your browser menu and tap "Install app"'

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-3 py-3 flex items-center gap-3">
        <img src="/favicon.png" alt="" className="w-8 h-8 rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Add to Home Screen</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{hintText}</p>
        </div>
        {canInstallNatively && (
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

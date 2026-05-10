import { useState, useEffect } from "react"
import { trackEvent } from "../utils"
import { SHOW_EVENT as PWA_SHOW_EVENT } from "./InstallPrompt"

export const SETTINGS_OPEN_EVENT = "settings:open"

/**
 * Settings sheet (slide-up on mobile, anchored panel top-right on desktop).
 * Groups: Display (Spoiler, Theme), Stay updated (Calendar, Install), Info (About, What's New).
 *
 * Open by dispatching `window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT))`.
 *
 * Props:
 *   spoilerFree: bool - current spoiler-free state (optional; row hidden if onSpoilerToggle missing)
 *   onSpoilerToggle: () => void - toggles spoiler-free mode (optional; only homepage passes this)
 */
export default function SettingsSheet({ spoilerFree, onSpoilerToggle }) {
  const [isOpen, setIsOpen] = useState(false)
  const onClose = () => setIsOpen(false)

  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "system" } catch { return "system" }
  })

  useEffect(() => {
    try { localStorage.setItem("theme", theme) } catch {}
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const apply = () => document.documentElement.classList.toggle("dark", mq.matches)
      apply()
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  useEffect(() => {
    const onOpen = () => setIsOpen(true)
    window.addEventListener(SETTINGS_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(SETTINGS_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === "Escape") setIsOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  if (!isOpen) return null

  function selectTheme(next) {
    trackEvent("theme_toggle", { theme: next, source: "settings_sheet" })
    setTheme(next)
  }

  function handleInstall() {
    trackEvent("pwa_install_icon_click", { source: "settings_sheet" })
    window.dispatchEvent(new Event(PWA_SHOW_EVENT))
    onClose()
  }

  function handleSpoiler() {
    if (typeof onSpoilerToggle === "function") onSpoilerToggle()
  }

  const showSpoilerRow = typeof onSpoilerToggle === "function"
  const isInstalled = typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="Settings"
        className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg
                   inset-x-0 bottom-0 rounded-t-lg
                   sm:inset-x-auto sm:bottom-auto sm:top-20 sm:right-4 sm:w-72 sm:rounded
                   max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-900 dark:text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="p-2">
          <SettingsGroupLabel>Display</SettingsGroupLabel>
          {showSpoilerRow && (
            <SettingsRow onClick={handleSpoiler} label="Spoiler-free">
              <span className={`text-xs font-semibold ${spoilerFree ? "text-red-500" : "text-gray-500 dark:text-gray-500"}`}>
                {spoilerFree ? "On" : "Off"}
              </span>
            </SettingsRow>
          )}
          <div className="flex items-center justify-between px-2 py-3 min-h-[44px]">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Theme</span>
            <div className="inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
              {["light", "dark", "system"].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectTheme(t)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors capitalize ${
                    theme === t
                      ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <SettingsGroupLabel>Stay updated</SettingsGroupLabel>
          <SettingsRow as="a" href="/calendar" label="Add to Google / Apple Calendar" sublabel="Google, Apple, Outlook" onClick={() => trackEvent("nav_calendar_click", { source: "settings_sheet" })}>
            <Arrow />
          </SettingsRow>
          {!isInstalled && (
            <SettingsRow onClick={handleInstall} label="Install as app">
              <Arrow />
            </SettingsRow>
          )}

          <SettingsGroupLabel>Info</SettingsGroupLabel>
          <SettingsRow as="a" href="/about" label="About">
            <Arrow />
          </SettingsRow>
          <SettingsRow as="a" href="/release-notes" label="What's New">
            <Arrow />
          </SettingsRow>
        </div>
      </div>
    </>
  )
}

function SettingsGroupLabel({ children }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 px-2 pt-3 pb-1">
      {children}
    </p>
  )
}

function SettingsRow({ as = "button", href, onClick, label, sublabel, children }) {
  const className = "w-full flex items-center justify-between px-2 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-left min-h-[44px]"
  const content = (
    <>
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
        {sublabel && (
          <span className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{sublabel}</span>
        )}
      </span>
      {children}
    </>
  )
  if (as === "a") {
    return <a href={href} onClick={onClick} className={className}>{content}</a>
  }
  return <button type="button" onClick={onClick} className={className}>{content}</button>
}

function Arrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-gray-400 dark:text-gray-600" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

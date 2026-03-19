import { useState, useEffect } from "react"
import { track } from "@vercel/analytics"

function logEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

export default function SiteHeader({ spoilerFree, onSpoilerToggle }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "dark" } catch { return "dark" }
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try { localStorage.setItem("theme", theme) } catch {}
  }, [theme])

  const showSpoiler = typeof onSpoilerToggle === "function"

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
      <a href="/" className="flex items-center gap-3 min-w-0">
        <img src="/favicon.png" alt="Spectate Esports" className="h-12 w-12 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-xl sm:text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white truncate leading-none">
            Spectate <span className="text-red-500">Esports</span>
          </p>
          <p className="hidden sm:block text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest mt-0.5">
            Pro Dota 2 replays. Timestamped to the draft.
          </p>
        </div>
      </a>
      <div className="flex items-center gap-3 sm:gap-4">
        <a href="/tournaments" onClick={() => logEvent('nav_tournaments_click', {})} className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Tournaments</a>
        <a href="/calendar" onClick={() => logEvent('nav_calendar_click', {})} className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Calendar</a>
        <a href="/about" className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">About</a>
        <a href="/release-notes" className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">What's New</a>
        {showSpoiler && (
          <button
            type="button"
            onClick={onSpoilerToggle}
            className={"focus-ring p-2 rounded border transition-colors " + (
              spoilerFree
                ? "bg-red-600 border-red-600 text-white"
                : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
            )}
            aria-label={spoilerFree ? "Disable spoiler-free mode" : "Enable spoiler-free mode"}
            title={spoilerFree ? "Spoiler-free mode on — scores hidden" : "Enable spoiler-free mode"}
          >
            {spoilerFree ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => { const next = theme === "dark" ? "light" : "dark"; logEvent("theme_toggle", { theme: next }); setTheme(() => next) }}
          className="focus-ring p-2 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}

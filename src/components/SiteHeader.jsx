import { useEffect, useState } from "react"
import { trackEvent, hasUnreadNews, fetchNewsUnread } from "../utils"
import SettingsSheet, { SETTINGS_OPEN_EVENT } from "./SettingsSheet"
import InstallPrompt from "./InstallPrompt"

/**
 * Site header. Minimal first-principles design:
 * - Logo + tagline (orientation)
 * - Tournaments link (desktop only - mobile uses bottom tab bar)
 * - Spoiler-free toggle (only when onSpoilerToggle is passed; homepage state)
 * - Settings cog (opens SettingsSheet which holds theme, calendar, install, about, what's new)
 */
export default function SiteHeader({ spoilerFree, onSpoilerToggle, onSearchOpen }) {
  const showSpoiler = typeof onSpoilerToggle === "function"
  const isNewsPage = typeof window !== "undefined" && window.location.pathname === "/news"
  const [newsUnread, setNewsUnread] = useState(() => !isNewsPage && hasUnreadNews())

  useEffect(() => {
    if (isNewsPage) return
    fetchNewsUnread().then(unread => setNewsUnread(unread))
  }, [])

  useEffect(() => {
    if (newsUnread) trackEvent('news_unread_indicator_shown', { path: window.location.pathname })
  }, [newsUnread])

  function openSettings() {
    window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT))
  }

  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-3">
        <a href="/" aria-label="Spectate Esports - Home" className="flex items-center gap-3 min-w-0">
          <img src="/favicon.png" alt="Spectate Esports" className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0" />
          <div className="hidden sm:block min-w-0">
            <p className="font-display text-2xl font-black uppercase tracking-widest text-gray-900 dark:text-white truncate leading-none">
              Spectate <span className="text-red-500">Esports</span>
            </p>
            <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest mt-0.5">
              Pro Dota 2 replays. Timestamped to the draft.
            </p>
          </div>
        </a>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <a
            href="/tournaments"
            onClick={() => trackEvent('nav_tournaments_click', {})}
            className="hidden md:inline text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Tournaments
          </a>
          <a
            href="/articles"
            onClick={() => trackEvent('nav_articles_click', {})}
            className="hidden md:inline text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Articles
          </a>
          <a
            href="/news"
            onClick={() => trackEvent('nav_news_click', {})}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            News
            {newsUnread && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />}
          </a>
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              aria-label="Search matches"
              title="Search"
              className="focus-ring p-2 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
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
              title={spoilerFree ? "Spoiler-free mode on - scores hidden" : "Enable spoiler-free mode"}
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
            onClick={openSettings}
            aria-label="Open settings"
            title="Settings"
            className="hidden md:inline-flex items-center justify-center focus-ring p-2 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>
      <SettingsSheet spoilerFree={spoilerFree} onSpoilerToggle={onSpoilerToggle} />
      <InstallPrompt />
    </>
  )
}

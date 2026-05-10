import { trackEvent } from "../utils"
import { SETTINGS_OPEN_EVENT } from "./SettingsSheet"

/**
 * Fixed-bottom tab bar for mobile navigation.
 * Hidden on md+ via Tailwind. 3 tabs: Home, Tournaments, More.
 *
 * "More" dispatches SETTINGS_OPEN_EVENT to open the SettingsSheet.
 */
export default function BottomTabBar() {
  const path = typeof window === "undefined" ? "" : window.location.pathname
  const homeActive = path === "/" || path.startsWith("/match/")
  const tournamentsActive = path === "/tournaments" || path.startsWith("/tournament/")

  function openSettings() {
    window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT))
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        <Tab href="/" label="Home" active={homeActive} icon={<HomeIcon />} />
        <Tab href="/tournaments" label="Tournaments" active={tournamentsActive} icon={<TrophyIcon />} />
        <Tab onClick={openSettings} label="More" icon={<MoreIcon />} />
      </div>
    </nav>
  )
}

function Tab({ href, onClick, label, active, icon }) {
  const base = "flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 min-h-[56px] transition-colors"
  const color = active
    ? "text-red-500"
    : "text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white"

  function track() {
    trackEvent("bottom_nav_tap", { destination: href || "more" })
  }

  if (href) {
    return (
      <a href={href} onClick={track} className={`${base} ${color}`} aria-current={active ? "page" : undefined}>
        <span className="w-5 h-5" aria-hidden="true">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </a>
    )
  }
  return (
    <button type="button" onClick={() => { track(); onClick && onClick() }} className={`${base} ${color}`}>
      <span className="w-5 h-5" aria-hidden="true">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
    </button>
  )
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

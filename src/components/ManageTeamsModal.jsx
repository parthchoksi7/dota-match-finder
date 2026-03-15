import { useEffect } from "react"
import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? "0" : "1.5"}
      />
    </svg>
  )
}

function ManageTeamsModal({ open, followedTeams, onToggleFollow, onClose }) {
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-teams-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2
            id="manage-teams-title"
            className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white"
          >
            My Teams
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {followedTeams.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-6">
              No teams followed yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
              {followedTeams.map(team => (
                <li key={team} className="flex items-center justify-between py-2.5 min-h-[44px]">
                  <span className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                    {team}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("unfollow_team", { team_name: team })
                      onToggleFollow(team)
                    }}
                    className="focus-ring p-1 rounded text-yellow-400 hover:text-gray-300 dark:hover:text-gray-700 transition-colors"
                    aria-label={`Unfollow ${team}`}
                    title={`Unfollow ${team}`}
                  >
                    <StarIcon filled={true} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-gray-400 dark:text-gray-600 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-3">
            Your followed teams are saved in this browser. They will not appear if you use incognito mode, a different browser, or another device.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ManageTeamsModal

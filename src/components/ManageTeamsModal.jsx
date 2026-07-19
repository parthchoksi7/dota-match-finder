import { useState, useEffect } from "react"
import { trackEvent, teamMatchesQuery } from "../utils"
import { fetchTier1Teams } from "../api"
import { TIER1_TEAMS_FALLBACK } from "../data/tier1TeamsFallback"
import PushNotificationSettings from "./PushNotificationSettings"

// Dispatch on window to open this modal from anywhere (SettingsSheet, follow callout).
// Same pattern as SETTINGS_OPEN_EVENT in SettingsSheet.
export const MANAGE_TEAMS_OPEN_EVENT = 'manage-teams:open'

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ManageTeamsModal({ open, followedTeams, onToggleFollow, onClose }) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [teams, setTeams] = useState(TIER1_TEAMS_FALLBACK)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setShowDropdown(false)
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Swaps in the live, auto-updated tier-1 team list once fetched. fetchTier1Teams()
  // never rejects — it resolves to TIER1_TEAMS_FALLBACK on any network/parse error — so
  // the dropdown always has a usable list, live data or not.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchTier1Teams().then(list => {
      if (!cancelled && Array.isArray(list) && list.length > 0) setTeams(list)
    })
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  const suggestions = teams.filter(team =>
    !followedTeams.includes(team.name) &&
    teamMatchesQuery(team, query)
  )

  function handleAddTeam(name) {
    onToggleFollow(name)
    setQuery('')
    setShowDropdown(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-teams-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Sheet — slides up from bottom on mobile, centered on desktop */}
      <div className="relative w-full sm:max-w-sm bg-white dark:bg-gray-900 border-t sm:border border-gray-200 dark:border-gray-700 rounded-t-2xl sm:rounded max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 id="manage-teams-title" className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">
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

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">

          {/* ── Search to add a team ─────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[4px] text-gray-500 dark:text-gray-500 mb-2">Follow a Team</p>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search teams..."
                className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-500 dark:focus:border-gray-500 transition-colors"
              />
              {showDropdown && suggestions.length > 0 && (
                <ul className="absolute z-10 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl max-h-48 overflow-y-auto">
                  {suggestions.map(team => (
                    <li key={team.name}>
                      <button
                        type="button"
                        onMouseDown={() => handleAddTeam(team.name)}
                        className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        {team.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && query.length > 0 && suggestions.length === 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-xl px-3 py-2.5">
                  <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">No teams found</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Followed teams list ──────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[4px] text-gray-500 dark:text-gray-500 mb-2">Following</p>
            {followedTeams.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 py-3 uppercase tracking-widest">
                No teams yet — search above to add one
              </p>
            ) : (
              <ul className="rounded border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                {followedTeams.map(team => (
                  <li key={team} className="flex items-center justify-between pl-3 pr-2 min-h-[44px]">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {team}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent('unfollow_team', { team_name: team, source: 'manage_teams_modal' })
                        onToggleFollow(team)
                      }}
                      className="focus-ring p-1.5 rounded text-gray-300 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      aria-label={`Remove ${team}`}
                      title={`Remove ${team}`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Push notifications (shared with SettingsSheet) ── */}
          <PushNotificationSettings followedTeams={followedTeams} source="manage_teams_modal" onCloseParent={onClose} />

          {/* ── Calendar link ────────────────────────────────── */}
          {followedTeams.length > 0 && (
            <a
              href="/calendar"
              onClick={() => trackEvent('calendar_nudge_click', { source: 'manage_teams_modal' })}
              className="flex items-center gap-2.5 px-3 py-3 w-full rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500 transition-colors group"
            >
              <span className="text-gray-400 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                <CalendarIcon />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors leading-snug">Add to Calendar</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-snug">Subscribe to your teams' match schedule</p>
              </div>
            </a>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
            Saved in this browser only. Won't carry over to incognito mode, other browsers, or other devices.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ManageTeamsModal

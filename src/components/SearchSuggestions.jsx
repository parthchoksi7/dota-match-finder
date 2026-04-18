import { useState, useEffect } from 'react'
import { toTitleCase, trackEvent } from '../utils'

const RECENT_KEY = 'dota-recent-searches'
const MAX_RECENT = 5

export function addRecentSearch(query) {
  if (!query || !query.trim()) return
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const deduped = prev.filter(s => s.toLowerCase() !== query.toLowerCase())
    localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...deduped].slice(0, MAX_RECENT)))
  } catch {}
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M6 3H3a1 1 0 00-1 1v3a4 4 0 004 4h.5M18 3h3a1 1 0 011 1v3a4 4 0 01-4 4h-.5M7 3h10v6a5 5 0 01-10 0V3z" />
    </svg>
  )
}

export default function SearchSuggestions({ allMatches = [], onSearch }) {
  const [recent, setRecent] = useState([])
  const [liveTournament, setLiveTournament] = useState(null)

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'))
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/tournaments?mode=series')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const live = d?.live?.[0]
        if (live) setLiveTournament(live)
      })
      .catch(() => {})
  }, [])

  // Build suggestions: live tournament first, then unique winning teams from recent matches
  const suggestions = []
  if (liveTournament) {
    suggestions.push({
      type: 'tournament',
      label: toTitleCase(liveTournament.name),
      sublabel: null,
      query: liveTournament.leagueName || liveTournament.name,
    })
  }
  const seenTeams = new Set()
  for (const m of allMatches) {
    if (m.unplayed || m.radiantWin === undefined || m.radiantWin === null) continue
    const winner = m.radiantWin ? m.radiantTeam : m.direTeam
    if (!winner) continue
    const key = winner.toLowerCase()
    if (seenTeams.has(key)) continue
    seenTeams.add(key)
    suggestions.push({
      type: 'team',
      label: winner,
      sublabel: m.tournament,
      query: winner,
    })
    if (suggestions.length >= 5) break
  }

  const handleSelect = (query) => {
    onSearch(query)
    trackEvent('suggestion_click', { query })
  }

  const removeRecent = (e, q) => {
    e.stopPropagation()
    const updated = recent.filter(s => s !== q)
    setRecent(updated)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch {}
  }

  const clearRecent = () => {
    setRecent([])
    try { localStorage.removeItem(RECENT_KEY) } catch {}
  }

  const hasRecent = recent.length > 0
  const hasSuggestions = suggestions.length > 0

  if (!hasRecent && !hasSuggestions) return null

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 overflow-hidden">

      {/* Recent searches */}
      {hasRecent && (
        <div>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
              Recent
            </span>
            <button
              type="button"
              onClick={clearRecent}
              className="text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
            >
              Clear all
            </button>
          </div>
          <ul role="list">
            {recent.map(q => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => handleSelect(q)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group text-left"
                >
                  <ClockIcon />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{q}</span>
                  <button
                    type="button"
                    onClick={(e) => removeRecent(e, q)}
                    aria-label={`Remove ${q} from recent searches`}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-5 h-5 flex items-center justify-center text-base leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity rounded"
                  >
                    ×
                  </button>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Divider between recent and suggestions */}
      {hasRecent && hasSuggestions && (
        <div className="border-t border-gray-100 dark:border-gray-800" />
      )}

      {/* Suggestions */}
      {hasSuggestions && (
        <div>
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
              Suggestions
            </span>
          </div>
          <ul role="list">
            {suggestions.map((s, i) => (
              <li key={s.label + i}>
                <button
                  type="button"
                  onClick={() => handleSelect(s.query)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  {s.type === 'tournament' ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                  ) : (
                    <TrophyIcon />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate font-medium">
                    {s.label}
                  </span>
                  {s.type === 'tournament' ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-red-500 flex-shrink-0">
                      Live
                    </span>
                  ) : s.sublabel ? (
                    <span className="text-xs text-gray-400 dark:text-gray-600 flex-shrink-0 truncate max-w-[140px]">
                      {s.sublabel}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer link */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex justify-end">
        <a
          href="/tournaments"
          className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          All tournaments →
        </a>
      </div>
    </div>
  )
}

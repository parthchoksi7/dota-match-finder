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

// Abbreviate a long tournament name to fit in a chip. Strips trailing stage
// markers ("- Group Stage", "Season 8 2026") and caps to first 2 words.
function abbrevTournament(name) {
  if (!name) return ''
  const cleaned = name
    .replace(/\s*[-–—:]\s*(group stage|playoffs|main event|qualifier).*$/i, '')
    .replace(/\s+season\s+\d+.*$/i, '')
    .replace(/\s+\d{4}.*$/i, '')
    .trim()
  const words = cleaned.split(/\s+/)
  return words.slice(0, 2).join(' ')
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

  // Build suggestion chips: live tournament first, then unique winning teams.
  const chips = []
  if (liveTournament) {
    chips.push({
      type: 'tournament',
      label: toTitleCase(abbrevTournament(liveTournament.name) || liveTournament.leagueName || liveTournament.name),
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
    chips.push({ type: 'team', label: winner, query: winner })
    if (chips.length >= 5) break
  }

  const handleSelect = (query) => {
    onSearch(query)
    trackEvent('suggestion_click', { query })
  }

  const removeRecent = (e, q) => {
    e.preventDefault()
    e.stopPropagation()
    const updated = recent.filter(s => s !== q)
    setRecent(updated)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch {}
  }

  if (chips.length === 0 && recent.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <button
          key={`sugg-${c.type}-${i}`}
          type="button"
          onClick={() => handleSelect(c.query)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs text-gray-700 dark:text-gray-300"
        >
          {c.type === 'tournament' && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
          )}
          <span className="truncate max-w-[160px]">{c.label}</span>
        </button>
      ))}

      {recent.map((q) => (
        <span
          key={`recent-${q}`}
          className="group inline-flex items-center rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
        >
          <button
            type="button"
            onClick={() => handleSelect(q)}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
            <span className="truncate max-w-[120px]">{q}</span>
          </button>
          <button
            type="button"
            onClick={(e) => removeRecent(e, q)}
            aria-label={`Remove ${q}`}
            className="pr-2 pl-0.5 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-sm leading-none"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}

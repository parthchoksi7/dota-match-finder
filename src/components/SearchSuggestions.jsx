import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { toTitleCase, trackEvent } from '../utils'
import { fetchHeroes } from '../api'

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

const SearchSuggestions = forwardRef(function SearchSuggestions({ allMatches = [], onSearch, query = '' }, ref) {
  const [recent, setRecent] = useState([])
  const [liveTournament, setLiveTournament] = useState(null)
  const [heroMap, setHeroMap] = useState({})
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')) } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/tournaments?mode=series')
      .then(r => r.ok ? r.json() : null)
      .then(d => { const live = d?.live?.[0]; if (live) setLiveTournament(live) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchHeroes().then(setHeroMap).catch(() => {})
  }, [])

  // Reset keyboard highlight on every new keystroke
  useEffect(() => { setHighlightedIndex(-1) }, [query])

  const q = query.toLowerCase().trim()

  // All suggestion matching is local — no API calls on keystroke
  const suggestions = useMemo(() => {
    if (!q) return []

    // Heroes (max 3) — navigate directly to /heroes/:slug
    const heroSuggs = Object.values(heroMap)
      .filter(h => {
        const name = h.name?.toLowerCase() || ''
        const key = (h.key || '').replace(/_/g, ' ')
        return name.includes(q) || key.includes(q)
      })
      .slice(0, 3)
      .map(h => ({ type: 'hero', label: h.name, key: h.key }))

    // Teams (max 3) — runs text filter search
    const seenTeams = new Set()
    const teamSuggs = []
    for (const m of allMatches) {
      for (const name of [m.radiantTeam, m.direTeam]) {
        if (!name) continue
        const nl = name.toLowerCase()
        if (seenTeams.has(nl)) continue
        seenTeams.add(nl)
        if (nl.includes(q)) {
          teamSuggs.push({ type: 'team', label: name })
          if (teamSuggs.length >= 3) break
        }
      }
      if (teamSuggs.length >= 3) break
    }

    // Tournaments (max 2) — runs text filter search
    const seenTournaments = new Set()
    const eventSuggs = []
    for (const m of allMatches) {
      if (!m.tournament) continue
      const tl = m.tournament.toLowerCase()
      if (seenTournaments.has(tl)) continue
      seenTournaments.add(tl)
      if (tl.includes(q)) {
        eventSuggs.push({ type: 'tournament', label: m.tournament })
        if (eventSuggs.length >= 2) break
      }
    }

    return [...heroSuggs, ...teamSuggs, ...eventSuggs]
  }, [q, heroMap, allMatches])

  const handleSelect = useCallback((item) => {
    trackEvent('suggestion_select', { type: item.type, label: item.label, query: q })
    if (item.type === 'hero') {
      window.location.href = `/heroes/${item.key}`
    } else {
      onSearch(item.label)
    }
  }, [q, onSearch])

  // Keyboard navigation API exposed to parent via ref
  useImperativeHandle(ref, () => ({
    moveDown() {
      if (!suggestions.length) return
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1))
    },
    moveUp() {
      setHighlightedIndex(i => Math.max(i - 1, -1))
    },
    selectHighlighted() {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        handleSelect(suggestions[highlightedIndex])
        return true
      }
      return false
    },
  }), [suggestions, highlightedIndex, handleSelect])

  // ── As-you-type suggestions ─────────────────────────────────────────
  if (q) {
    if (suggestions.length === 0) {
      return (
        <div className="flex items-center px-3 min-h-[44px]">
          <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
            No results for &ldquo;{query}&rdquo;
          </span>
        </div>
      )
    }

    return (
      <div className="flex flex-col" role="listbox" aria-label="Search suggestions">
        {suggestions.map((item, i) => {
          const isHighlighted = i === highlightedIndex
          const typeLabel = item.type === 'hero' ? 'HERO' : item.type === 'team' ? 'TEAM' : 'EVENT'
          return (
            <button
              key={`${item.type}-${item.label}`}
              type="button"
              role="option"
              aria-selected={isHighlighted}
              onMouseDown={(e) => e.preventDefault()} // keep input focused
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseLeave={() => setHighlightedIndex(-1)}
              tabIndex={-1}
              className={`flex items-center gap-3 w-full px-3 min-h-[44px] text-left transition-colors ${
                isHighlighted
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-widest w-12 flex-shrink-0 ${
                item.type === 'hero' ? 'text-red-500' : 'text-gray-400 dark:text-gray-600'
              }`}>
                {typeLabel}
              </span>
              <span className="font-display font-bold text-sm text-gray-900 dark:text-white truncate flex-1">
                {item.label}
              </span>
              {isHighlighted && (
                <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  // ── Idle: static chips (existing behavior) ──────────────────────────
  const chips = []
  if (liveTournament) {
    const source = liveTournament.leagueName || liveTournament.name || ''
    const label = toTitleCase(source.split(/\s+/)[0] || liveTournament.name)
    chips.push({ type: 'tournament', label, query: label })
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

  const handleChipSelect = (chipQuery) => {
    onSearch(chipQuery)
    trackEvent('suggestion_click', { query: chipQuery })
  }

  const removeRecent = (e, chipQuery) => {
    e.preventDefault()
    e.stopPropagation()
    const updated = recent.filter(s => s !== chipQuery)
    setRecent(updated)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch {}
  }

  if (chips.length === 0 && recent.length === 0) return null

  return (
    <div className="px-3 py-2.5 flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <button
          key={`sugg-${c.type}-${i}`}
          type="button"
          onClick={() => handleChipSelect(c.query)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs text-gray-700 dark:text-gray-300"
        >
          {c.type === 'tournament' && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
          )}
          <span className="truncate max-w-[160px]">{c.label}</span>
        </button>
      ))}

      {recent.map((recentQuery) => (
        <span
          key={`recent-${recentQuery}`}
          className="group inline-flex items-center rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
        >
          <button
            type="button"
            onClick={() => handleChipSelect(recentQuery)}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
            <span className="truncate max-w-[120px]">{recentQuery}</span>
          </button>
          <button
            type="button"
            onClick={(e) => removeRecent(e, recentQuery)}
            aria-label={`Remove ${recentQuery}`}
            className="pr-2 pl-0.5 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-sm leading-none"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
})

export default SearchSuggestions

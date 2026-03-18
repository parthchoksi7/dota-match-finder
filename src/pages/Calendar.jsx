import { useState, useEffect, useMemo } from 'react'
import SiteHeader from '../components/SiteHeader'
import CalendarSubscribeModal from '../components/CalendarSubscribeModal'
import { trackEvent } from '../utils'

// Tier 1 teams with their PandaScore slugs
const TIER1_TEAMS = [
  { name: 'Team Liquid', slug: 'team-liquid' },
  { name: 'Tundra Esports', slug: 'tundra-esports' },
  { name: 'Team Spirit', slug: 'team-spirit' },
  { name: 'BetBoom Team', slug: 'betboom' },
  { name: 'Team Falcons', slug: 'team-falcons' },
  { name: 'Gaimin Gladiators', slug: 'gaimin-gladiators' },
  { name: 'Aurora Gaming', slug: 'aurora-gaming' },
  { name: 'OG', slug: 'og' },
  { name: 'Natus Vincere', slug: 'natus-vincere' },
  { name: 'Virtus.pro', slug: 'virtus-pro' },
  { name: 'Team Secret', slug: 'team-secret' },
  { name: 'Team Aster', slug: 'team-aster' },
  { name: 'Talon Esports', slug: 'talon-esports' },
  { name: 'Nouns Esports', slug: 'nouns-esports' },
  { name: 'Team Yandex', slug: 'team-yandex' },
  { name: 'PSG.LGD', slug: 'psg-lgd' },
  { name: 'Nigma Galaxy', slug: 'nigma-galaxy' },
  { name: 'Evil Geniuses', slug: 'evil-geniuses' },
  { name: 'beastcoast', slug: 'beastcoast' },
  { name: 'Thunder Awaken', slug: 'thunder-awaken' },
]

function formatScheduledTime(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function UpcomingMatchRow({ match }) {
  const opponents = match.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const time = formatScheduledTime(match.begin_at || match.scheduled_at)
  const leagueName = match.league?.name || ''
  const serieName = match.serie?.full_name || match.serie?.name || ''
  const tournament = leagueName || serieName || 'Unknown'

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-900 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {teamA} vs {teamB}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{tournament}</p>
      </div>
      {time && (
        <p className="text-xs text-gray-500 dark:text-gray-500 tabular-nums flex-shrink-0">{time}</p>
      )}
    </div>
  )
}

function TeamChip({ team, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
      {team.name}
      <button
        type="button"
        onClick={() => onRemove(team)}
        aria-label={`Remove ${team.name}`}
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  )
}

export default function Calendar() {
  const [selectedTeams, setSelectedTeams] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [previewMatches, setPreviewMatches] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tournaments, setTournaments] = useState([])
  const [tournamentsLoading, setTournamentsLoading] = useState(true)
  const [tournamentModalUrl, setTournamentModalUrl] = useState(null)
  const [tournamentModalLabel, setTournamentModalLabel] = useState(null)

  useEffect(() => {
    trackEvent('calendar_page_view', {})
  }, [])

  // Load upcoming tournaments
  useEffect(() => {
    fetch('/api/tournaments?mode=series')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const all = [...(data.live || []), ...(data.upcoming || [])]
        setTournaments(all)
      })
      .catch(() => setTournaments([]))
      .finally(() => setTournamentsLoading(false))
  }, [])

  // Build the calendar URL from selected teams
  const calendarUrl = useMemo(() => {
    if (selectedTeams.length === 0) return ''
    const slugs = selectedTeams.map(t => t.slug).join(',')
    return `https://spectateesports.live/api/calendar/team?teams=${slugs}`
  }, [selectedTeams])

  // Fetch preview matches when teams change
  useEffect(() => {
    if (selectedTeams.length === 0) {
      setPreviewMatches([])
      return
    }
    const slugs = selectedTeams.map(t => t.slug).join(',')
    setPreviewLoading(true)
    fetch(`/api/calendar/team?teams=${encodeURIComponent(slugs)}`, {
      headers: { Accept: 'text/calendar' },
    })
      .then(() => {
        // Preview: fetch upcoming matches separately for display
        return fetch(`/api/upcoming-matches`)
      })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const matches = data?.matches || []
        const filtered = matches.filter(m => {
          const tA = (m.teamA || '').toLowerCase()
          const tB = (m.teamB || '').toLowerCase()
          return selectedTeams.some(t => {
            const n = t.name.toLowerCase()
            const s = t.slug.toLowerCase()
            return tA.includes(n) || tB.includes(n) || tA.includes(s) || tB.includes(s)
          })
        })
        setPreviewMatches(filtered)
      })
      .catch(() => setPreviewMatches([]))
      .finally(() => setPreviewLoading(false))
  }, [selectedTeams.map(t => t.slug).join(',')])

  // Filtered team suggestions
  const suggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const selectedSlugs = new Set(selectedTeams.map(t => t.slug))
    return TIER1_TEAMS.filter(t =>
      !selectedSlugs.has(t.slug) &&
      (q === '' || t.name.toLowerCase().includes(q) || t.slug.includes(q))
    )
  }, [searchQuery, selectedTeams])

  function addTeam(team) {
    setSelectedTeams(prev => [...prev, team])
    setSearchQuery('')
    setShowDropdown(false)
    trackEvent('calendar_team_select', { team_name: team.name })
  }

  function removeTeam(team) {
    setSelectedTeams(prev => prev.filter(t => t.slug !== team.slug))
    trackEvent('calendar_team_remove', { team_name: team.name })
  }

  function handleOpenModal() {
    if (!calendarUrl) return
    trackEvent('calendar_subscribe_modal_open', { source: 'calendar_page' })
    setModalOpen(true)
  }

  function handleTournamentSubscribe(tournament) {
    const url = `https://spectateesports.live/api/calendar/tournament?series=${tournament.id}`
    const label = tournament.full_name || tournament.name || `Series ${tournament.id}`
    setTournamentModalUrl(url)
    setTournamentModalLabel(label)
    trackEvent('calendar_subscribe_modal_open', { source: 'tournament', series_id: tournament.id })
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full">

        {/* Page header */}
        <div>
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-1">Spectate Esports</p>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-widest text-gray-900 dark:text-white">
            Calendar Feeds
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Subscribe to Dota 2 match schedules in Google Calendar, Apple Calendar, or Outlook.
          </p>
        </div>

        {/* Team selector card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-amber-500">
              Team Calendar
            </h2>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Selected teams */}
            {selectedTeams.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTeams.map(team => (
                  <TeamChip key={team.slug} team={team} onRemove={removeTeam} />
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search teams to add..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
              />
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-10 max-h-56 overflow-y-auto">
                  {suggestions.map(team => (
                    <button
                      key={team.slug}
                      type="button"
                      onMouseDown={() => addTeam(team)}
                      className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Generated URL */}
            {calendarUrl ? (
              <div className="space-y-3">
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={calendarUrl}
                    className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300 select-all"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={handleOpenModal}
                    className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 rounded text-sm font-semibold transition-colors flex-shrink-0 flex items-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Subscribe
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-4">
                Add teams above to generate your calendar URL.
              </p>
            )}
          </div>
        </div>

        {/* Match preview */}
        {selectedTeams.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-blue-500">
                Upcoming Matches
              </h2>
            </div>
            <div className="px-5 py-3">
              {previewLoading ? (
                <div className="py-4 flex justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : previewMatches.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-4">
                  No upcoming matches found.
                </p>
              ) : (
                previewMatches.map((m, i) => (
                  <div key={m.id || i} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 dark:border-gray-900 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {m.teamA} vs {m.teamB}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{m.tournament}</p>
                    </div>
                    {m.scheduledAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 tabular-nums flex-shrink-0">
                        {formatScheduledTime(m.scheduledAt)}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tournament feeds */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-red-500">
              Tournament Feeds
            </h2>
          </div>
          <div className="px-5 py-3">
            {tournamentsLoading ? (
              <div className="py-4 flex justify-center">
                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" />
              </div>
            ) : tournaments.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-4">
                No active tournaments right now.
              </p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {tournaments.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {t.full_name || t.name}
                      </p>
                      {t.league?.name && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-wider">{t.league.name}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTournamentSubscribe(t)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      Add to Calendar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Team calendar modal */}
      <CalendarSubscribeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        url={calendarUrl}
        feedType="team"
        source="calendar_page"
        label={selectedTeams.length > 0 ? selectedTeams.map(t => t.name).join(', ') : ''}
      />

      {/* Tournament calendar modal */}
      <CalendarSubscribeModal
        isOpen={!!tournamentModalUrl}
        onClose={() => { setTournamentModalUrl(null); setTournamentModalLabel(null) }}
        url={tournamentModalUrl || ''}
        feedType="tournament"
        source="tournament"
        label={tournamentModalLabel}
      />
    </div>
  )
}

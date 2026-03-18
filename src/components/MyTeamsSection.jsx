import { useEffect, useRef, useState } from "react"
import { groupIntoSeries, isSeriesComplete, trackEvent } from "../utils"
import MatchCard from "./MatchCard"
import CalendarSubscribeModal from "./CalendarSubscribeModal"

// Convert a team display name to a PandaScore slug (best effort)
function teamNameToSlug(name) {
  const aliases = {
    'team liquid': 'team-liquid',
    'liquid': 'team-liquid',
    'tundra esports': 'tundra-esports',
    'tundra': 'tundra-esports',
    'team spirit': 'team-spirit',
    'spirit': 'team-spirit',
    'betboom team': 'betboom',
    'betboom': 'betboom',
    'team falcons': 'team-falcons',
    'falcons': 'team-falcons',
    'gaimin gladiators': 'gaimin-gladiators',
    'gaimin': 'gaimin-gladiators',
    'aurora gaming': 'aurora-gaming',
    'aurora': 'aurora-gaming',
    'natus vincere': 'natus-vincere',
    'navi': 'natus-vincere',
    'virtus.pro': 'virtus-pro',
    'vp': 'virtus-pro',
    'team secret': 'team-secret',
    'secret': 'team-secret',
    'team aster': 'team-aster',
    'aster': 'team-aster',
    'talon esports': 'talon-esports',
    'talon': 'talon-esports',
    'nouns esports': 'nouns-esports',
    'nouns': 'nouns-esports',
    'team yandex': 'team-yandex',
    'yandex': 'team-yandex',
    'og': 'og',
    'psg.lgd': 'psg-lgd',
    'evil geniuses': 'evil-geniuses',
    'eg': 'evil-geniuses',
  }
  const lower = (name || '').toLowerCase().trim()
  return aliases[lower] || lower.replace(/\s+/g, '-')
}

function MyTeamsSection({
  matches,
  followedTeams,
  onSelectMatch,
  onDraftPosts,
  onDraftRedditPosts,
  onManageTeams,
  onToggleFollow,
  spoilerFree = false,
  expandedSeriesId,
  grandFinalMatchIds = new Set(),
}) {
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const sectionViewFired = useRef(false)

  const myMatches = (matches || []).filter(
    m => followedTeams.includes(m.radiantTeam) || followedTeams.includes(m.direTeam)
  )
  const allSeries = groupIntoSeries(myMatches)
  const completeSeries = allSeries.filter(isSeriesComplete)

  // Fire once per page load when the section has visible matches
  useEffect(() => {
    if (!sectionViewFired.current && completeSeries.length > 0) {
      trackEvent("my_teams_section_view", {
        team_count: followedTeams.length,
        match_count: completeSeries.length,
      })
      sectionViewFired.current = true
    }
  }, [completeSeries.length])

  if (!followedTeams || followedTeams.length === 0) return null

  const calendarUrl = followedTeams.length > 0
    ? `https://spectateesports.live/api/calendar/team?teams=${followedTeams.map(teamNameToSlug).join(',')}`
    : ''

  function handleSelectGame(game) {
    const matchedTeam = followedTeams.find(
      t => t === game.radiantTeam || t === game.direTeam
    )
    trackEvent("my_teams_vod_click", {
      match_id: game.id,
      team_name: matchedTeam || "",
    })
    onSelectMatch(game)
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-amber-500">
          My Teams
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              trackEvent("calendar_subscribe_modal_open", { source: "my_teams" })
              setCalendarModalOpen(true)
            }}
            className="focus-ring flex items-center gap-1 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Subscribe to calendar feed for your teams"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </button>
          <button
            type="button"
            onClick={() => {
              trackEvent("manage_teams_open", {})
              onManageTeams()
            }}
            className="focus-ring text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Manage
          </button>
        </div>
      </div>

      {completeSeries.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest py-4 text-center">
          No recent matches for your teams.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {completeSeries.map(s => (
            <MatchCard
              key={s.id}
              series={s}
              onSelectGame={handleSelectGame}
              onDraftPosts={onDraftPosts}
              onDraftRedditPosts={onDraftRedditPosts}
              defaultExpanded={false}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={onToggleFollow}
              expandedSeriesId={expandedSeriesId}
              isGrandFinal={s.games.some(g => grandFinalMatchIds.has(g.id))}
            />
          ))}
        </div>
      )}

      <CalendarSubscribeModal
        isOpen={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        url={calendarUrl}
        feedType="team"
        source="my_teams"
        label={followedTeams.join(', ')}
      />
    </div>
  )
}

export default MyTeamsSection

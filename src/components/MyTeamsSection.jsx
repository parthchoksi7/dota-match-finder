import { useEffect, useRef, useState } from "react"
import { groupIntoSeries, isSeriesComplete, trackEvent } from "../utils"
import { isPushSupported, getPushPermission, subscribeToPush } from "../utils/push"
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
  const [calendarDismissed, setCalendarDismissed] = useState(
    () => !!localStorage.getItem('calendar-card-dismissed')
  )
  const [pushPermission, setPushPermission] = useState(() => getPushPermission())
  const [pushCardDismissed, setPushCardDismissed] = useState(
    () => !!localStorage.getItem('push-card-dismissed')
  )
  const [subscribing, setSubscribing] = useState(false)
  const sectionViewFired = useRef(false)
  const pushSupported = isPushSupported()

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
    ? `https://spectateesports.live/api/tournaments?mode=calendar-team&teams=${followedTeams.map(teamNameToSlug).join(',')}`
    : ''

  function handleDismissCalendar() {
    localStorage.setItem('calendar-card-dismissed', '1')
    setCalendarDismissed(true)
    trackEvent("calendar_card_dismissed")
  }

  function handleDismissPushCard() {
    localStorage.setItem('push-card-dismissed', '1')
    setPushCardDismissed(true)
    trackEvent("push_card_dismissed")
  }

  async function handleEnableNotifications() {
    setSubscribing(true)
    trackEvent("push_notifications_enable_click", { team_count: followedTeams.length })
    const result = await subscribeToPush(followedTeams)
    setPushPermission(getPushPermission())
    setSubscribing(false)
    if (result.ok) trackEvent("push_notifications_subscribed", { team_count: followedTeams.length })
  }

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

      {!calendarDismissed && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">
                Sync to your calendar
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 leading-snug">
                Google Calendar, Apple Calendar, Outlook
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                trackEvent("calendar_subscribe_modal_open", { source: "my_teams" })
                setCalendarModalOpen(true)
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 rounded transition-colors whitespace-nowrap"
            >
              Sync now →
            </button>
            <button
              type="button"
              onClick={handleDismissCalendar}
              aria-label="Dismiss"
              className="w-8 h-8 flex items-center justify-center text-lg text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {pushSupported && pushPermission === 'default' && !pushCardDismissed && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">
                Live match alerts
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 leading-snug">
                Get notified when your teams go live
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={subscribing}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 rounded transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {subscribing ? 'Enabling…' : 'Enable →'}
            </button>
            <button
              type="button"
              onClick={handleDismissPushCard}
              aria-label="Dismiss"
              className="w-8 h-8 flex items-center justify-center text-lg text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

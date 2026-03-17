import { useEffect, useRef } from "react"
import { groupIntoSeries, isSeriesComplete, trackEvent } from "../utils"
import MatchCard from "./MatchCard"

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
              isGrandFinal={
                s.tournament?.toLowerCase().includes('grand final') ||
                s.games.some(g => grandFinalMatchIds.has(g.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MyTeamsSection

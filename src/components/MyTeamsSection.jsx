import { useEffect, useRef } from "react"
import { groupIntoSeries, isSeriesComplete } from "../utils"
import MatchCard from "./MatchCard"
import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

function MyTeamsSection({
  matches,
  followedTeams,
  onSelectMatch,
  onDraftPosts,
  onManageTeams,
  onToggleFollow,
  spoilerFree = false,
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
      <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden mb-3">
        <div className="px-4 sm:px-5 py-3.5 bg-gray-50 dark:bg-gray-900/60 flex justify-between items-center">
          <h2 className="text-sm uppercase tracking-widest text-gray-700 dark:text-gray-300 font-bold">
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
              defaultExpanded={false}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MyTeamsSection

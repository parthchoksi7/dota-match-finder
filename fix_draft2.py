code = open('src/components/DraftDisplay.jsx').read()

# Read the file and rewrite it completely without role logic
new_code = '''import { useState, useEffect } from "react"
import { fetchHeroes } from "../api"

const LANE_ORDER = { Carry: 1, Mid: 2, Off: 3, "Soft Sup": 4, "Hard Sup": 5, Unknown: 6 }

function DraftDisplay({ matchId, radiantTeam, direTeam, autoLoad = false }) {
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (autoLoad) loadDraft()
  }, [matchId])

  async function loadDraft() {
    if (draft) {
      setExpanded((e) => !e)
      return
    }
    setLoading(true)
    setExpanded(true)
    try {
      const [matchRes, heroes] = await Promise.all([
        fetch(`https://api.opendota.com/api/matches/${matchId}`).then((r) => r.json()),
        fetchHeroes()
      ])

      const picks_bans = matchRes.picks_bans || []

      const bans = picks_bans
        .filter((p) => !p.is_pick)
        .sort((a, b) => a.order - b.order)
        .map((p) => ({
          heroName: heroes[p.hero_id]?.name || `Hero ${p.hero_id}`,
          isRadiant: p.team === 0,
          order: p.order
        }))

      const players = (matchRes.players || [])
        .map((p) => ({
          heroName: heroes[p.hero_id]?.name || `Hero ${p.hero_id}`,
          personaname: p.name || p.personaname || "Unknown",
          isRadiant: p.isRadiant ?? p.player_slot < 128,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists
        }))

      setDraft({ bans, players })
    } catch (e) {
      setError("Failed to load draft data")
      setExpanded(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-24" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-500">{error}</p>
  }

  if (!draft) {
    if (autoLoad) return null
    return (
      <button
        type="button"
        onClick={loadDraft}
        className="focus-ring text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        Show Draft
      </button>
    )
  }

  return (
    <div className="space-y-5">

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
          Picks
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-600 dark:text-green-500 mb-2">
              {radiantTeam}
            </p>
            {draft.players
              .filter((p) => p.isRadiant)
              .map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col px-3 py-2 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                      {p.heroName}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                      {p.kills}/{p.deaths}/{p.assists}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {p.personaname}
                  </span>
                </div>
              ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-500 mb-2">
              {direTeam}
            </p>
            {draft.players
              .filter((p) => !p.isRadiant)
              .map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col px-3 py-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                      {p.heroName}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                      {p.kills}/{p.deaths}/{p.assists}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {p.personaname}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {draft.bans.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
            Bans
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { team: radiantTeam, isRadiant: true },
              { team: direTeam, isRadiant: false }
            ].map(({ team, isRadiant }) => (
              <div key={team}>
                <p className="text-xs text-gray-400 dark:text-gray-600 mb-1.5 uppercase tracking-wider">
                  {team}
                </p>
                <div className="flex flex-wrap gap-1">
                  {draft.bans
                    .filter((b) => b.isRadiant === isRadiant)
                    .map((b, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500 line-through"
                      >
                        {b.heroName}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

export default DraftDisplay
'''

with open('src/components/DraftDisplay.jsx', 'w') as f:
    f.write(new_code)

print('Done! Role labels removed from DraftDisplay.jsx')

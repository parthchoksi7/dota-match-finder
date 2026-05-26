import { useState, useEffect } from "react"
import { fetchHeroes } from "../api"
import { track } from "@vercel/analytics"
import { RampageSvg } from "./GameIndicators"

function logEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

const LANE_ORDER = { Carry: 1, Mid: 2, Off: 3, "Soft Sup": 4, "Hard Sup": 5, Unknown: 6 }

function DraftDisplay({ matchId, radiantTeam, direTeam, autoLoad = false, spoilerFree = false, rampagePlayers = new Set(), matchStats = null }) {
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (autoLoad) loadDraft()
  }, [matchId])

  // If matchStats arrives after the initial auto-load returned empty players (e.g. OD
  // rate-limited the browser request), reload using the server-side data instead.
  useEffect(() => {
    if (!autoLoad || !matchStats?.players?.length) return
    if (draft?.players?.length > 0) return
    if (loading) return
    loadDraft({ force: true })
  }, [matchStats])

  async function loadDraft({ force = false } = {}) {
    if (draft && !force) {
      setExpanded((e) => !e)
      return
    }
    logEvent("draft_load", { matchId })
    setLoading(true)
    setExpanded(true)
    try {
      // If matchStats already has player data (fetched server-side with KV caching),
      // use it directly to avoid a redundant browser→OD call that can hit rate limits.
      if (matchStats?.players?.length > 0) {
        const heroes = await fetchHeroes()
        const players = matchStats.players.map((p) => ({
          heroName: heroes[p.heroId]?.name || `Hero ${p.heroId}`,
          heroKey: heroes[p.heroId]?.key || null,
          personaname: p.name || '',
          isRadiant: p.isRadiant,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        }))
        const bans = (matchStats.picksBans || [])
          .filter((p) => !p.isPick)
          .sort((a, b) => a.order - b.order)
          .map((p) => ({
            heroName: heroes[p.heroId]?.name || `Hero ${p.heroId}`,
            isRadiant: p.team === 0,
            order: p.order,
          }))
        setDraft({ bans, players })
        return
      }

      // Fallback: fetch directly from OpenDota (used when matchStats not available,
      // e.g. standalone "Show Draft" button or PandaScore matches).
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
          heroKey: heroes[p.hero_id]?.key || null,
          personaname: p.name || p.personaname || '',
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
              .map((p, i) => {
                const hasRampage = !spoilerFree && rampagePlayers.has(p.personaname)
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 ${hasRampage ? 'border-l-2 border-l-orange-500 dark:border-l-orange-400' : ''}`}
                  >
                    {p.heroKey ? (
                      <img
                        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${p.heroKey}.png`}
                        alt={p.heroName}
                        className="w-8 h-8 rounded-sm flex-shrink-0 object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-sm flex-shrink-0 bg-green-200 dark:bg-green-900" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span className="font-semibold text-xs text-gray-900 dark:text-white truncate min-w-0">
                          {p.heroName}
                        </span>
                        {!spoilerFree && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                            {p.kills}/{p.deaths}/{p.assists}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate min-w-0">
                          {p.personaname}
                        </span>
                        {hasRampage && (
                          <span className="flex-shrink-0 text-orange-500 dark:text-orange-400" title="Rampage — 5-kill streak" aria-label="Rampage">
                            <RampageSvg className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-500 mb-2">
              {direTeam}
            </p>
            {draft.players
              .filter((p) => !p.isRadiant)
              .map((p, i) => {
                const hasRampage = !spoilerFree && rampagePlayers.has(p.personaname)
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 ${hasRampage ? 'border-l-2 border-l-orange-500 dark:border-l-orange-400' : ''}`}
                  >
                    {p.heroKey ? (
                      <img
                        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${p.heroKey}.png`}
                        alt={p.heroName}
                        className="w-8 h-8 rounded-sm flex-shrink-0 object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-sm flex-shrink-0 bg-red-200 dark:bg-red-900" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span className="font-semibold text-xs text-gray-900 dark:text-white truncate min-w-0">
                          {p.heroName}
                        </span>
                        {!spoilerFree && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                            {p.kills}/{p.deaths}/{p.assists}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate min-w-0">
                          {p.personaname}
                        </span>
                        {hasRampage && (
                          <span className="flex-shrink-0 text-orange-500 dark:text-orange-400" title="Rampage — 5-kill streak" aria-label="Rampage">
                            <RampageSvg className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
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

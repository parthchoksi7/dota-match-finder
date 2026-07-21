import { useEffect, useState } from 'react'
import { fetchMatchStats, fetchHeroes } from '../api'
import HeroIcon from './HeroIcon'

// Glanceable 5v5 hero-icon strip for one finished game inside the live-series companion.
// Intentionally lighter than the drawer's DraftDisplay (no names/KDA) — the deep view is the
// MatchDrawer a tap away. Fed by the session-cached fetchMatchStats + fetchHeroes. Each strip
// has a stable matchId (one per game position), so the effect never needs to reset mid-life.
// Shown even in spoiler-free mode: a draft is pre-game and doesn't reveal the result (same as the
// drawer's DraftDisplay). Only the winner/score/indicators are spoilers, and those are gated by
// the parent — never here.
export default function SeriesGameDraftStrip({ matchId }) {
  const [draft, setDraft] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    Promise.all([fetchMatchStats(matchId), fetchHeroes()])
      .then(([stats, heroMap]) => {
        if (cancelled) return
        const players = stats?.players
        if (players && players.length > 0) {
          const radiant = []
          const dire = []
          for (const p of players) {
            const entry = { key: heroMap?.[p.heroId]?.key || null, name: heroMap?.[p.heroId]?.name || `Hero ${p.heroId}` }
            ;(p.isRadiant ? radiant : dire).push(entry)
          }
          setDraft({ radiant, dire })
        }
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [matchId])

  if (!matchId) return null

  if (!loaded) {
    return (
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {[...Array(10)].map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded-sm bg-gray-200 dark:bg-gray-800 animate-pulse flex-shrink-0 ${i === 5 ? 'ml-2' : ''}`} />
        ))}
      </div>
    )
  }

  // loaded but no draft = OpenDota hasn't parsed this match yet (players:[]). Show the same
  // "Stats indexing" copy the parent uses for an unresolved game, rather than collapsing to blank.
  if (!draft) {
    return <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">Stats indexing</p>
  }

  return (
    <div className="flex items-center gap-0.5" role="img" aria-label="Game draft">
      {draft.radiant.map((h, i) => <HeroIcon key={`r${i}`} heroKey={h.key} name={h.name} />)}
      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1.5 flex-shrink-0" aria-hidden="true" />
      {draft.dire.map((h, i) => <HeroIcon key={`d${i}`} heroKey={h.key} name={h.name} />)}
    </div>
  )
}

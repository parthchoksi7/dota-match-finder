
import { useState, useEffect } from "react"
import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}

const BADGE_STYLES = {
  must_watch: "bg-red-600 text-white border-red-600",
  good: "bg-amber-500 text-white border-amber-500",
  average: "bg-gray-500 text-white border-gray-500",
  skip: "bg-gray-800 text-gray-400 border-gray-700",
}

const SIGNAL_LABELS = {
  gold_comeback:   "Gold comeback",
  mega_comeback:   "Mega creep comeback",
  back_and_forth:  "Back and forth",
  high_kills:      "High kill game",
  good_duration:   "Great game length",
}

// Series drama: did the series go to the deciding game?
function winsRequired(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  return 2
}

function seriesWentToDecider(series) {
  const needed = winsRequired(series.seriesType)
  const teamWins = {}
  for (const g of series.games) {
    const winner = g.radiantWin ? g.radiantTeam : g.direTeam
    teamWins[winner] = (teamWins[winner] || 0) + 1
  }
  const wins = Object.values(teamWins)
  return wins.length >= 2 && wins.every(w => w >= needed - 1)
}

// Simple in-memory cache so navigating back doesn't re-fetch
const memCache = {}

export default function WatchBadge({ series }) {
  const [state, setState] = useState(() => memCache[series.id] || null)
  const [loading, setLoading] = useState(!memCache[series.id])

  useEffect(() => {
    if (memCache[series.id]) return
    let cancelled = false

    const matchIds = series.games.map(g => g.id)
    fetch("/api/watchability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId: series.id, matchIds }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        // Apply series decider bonus
        let adjusted = { ...data }
        if (seriesWentToDecider(series) && data.score !== undefined) {
          const bumped = Math.min(data.score + 1, 5)
          const ratingMap = [null, "skip", "skip", "average", "good", "must_watch"]
          const labelMap = { must_watch: "Must Watch", good: "Good", average: "Average", skip: "Skip" }
          adjusted.score = bumped
          adjusted.rating = ratingMap[bumped]
          adjusted.label = labelMap[ratingMap[bumped]]
          if (!adjusted.signals.includes("series_decider")) {
            adjusted.signals = [...adjusted.signals, "series_decider"]
          }
        }
        memCache[series.id] = adjusted
        setState(adjusted)
        trackEvent("watchability_computed", {
          rating: adjusted.rating,
          seriesId: series.id,
          tournament: series.tournament,
        })
      })
      .catch(() => {
        if (!cancelled) setState({ rating: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [series.id])

  if (loading) {
    return (
      <span className="inline-block h-4 w-16 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
    )
  }

  if (!state || !state.rating || state.rating === "skip") return null

  const styleClass = BADGE_STYLES[state.rating] || BADGE_STYLES.average
  const signals = (state.signals || [])
    .filter(s => SIGNAL_LABELS[s])
    .map(s => SIGNAL_LABELS[s])

  const tooltip = signals.length > 0 ? signals.join(" · ") : undefined

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded border ${styleClass} cursor-default select-none shrink-0`}
    >
      {state.label}
    </span>
  )
}

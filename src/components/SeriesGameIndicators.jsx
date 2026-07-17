import { useEffect, useState } from 'react'
import { fetchMatchIndicators } from '../api'
import GameIndicators from './GameIndicators'

// Highlight-event chips (Rampage, Divine Rapier, 20k swing, mega comeback) for a finished game —
// the "what actually happened" glance that a fan cares about more than the raw draft. Reuses the
// session-cached fetchMatchIndicators + the compact GameIndicators variant. GameIndicators renders
// null when there are no notable events, so an unremarkable game shows nothing. Spoiler-gated by
// the parent (these reveal outcome, so only mounted when spoilers are on).
export default function SeriesGameIndicators({ matchId }) {
  const [indicators, setIndicators] = useState(null)

  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    const key = String(matchId)
    fetchMatchIndicators([key])
      .then(map => { if (!cancelled) setIndicators(map[key] || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [matchId])

  if (!indicators) return null
  return <GameIndicators indicators={indicators} variant="compact" className="flex-shrink-0" />
}

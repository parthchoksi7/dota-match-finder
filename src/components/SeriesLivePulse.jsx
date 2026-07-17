import { useEffect, useState } from 'react'
import { fetchLiveGamePulse, fetchHeroes } from '../api'
import SeriesScoreRow from './SeriesScoreRow'

const POLL_MS = 20000

// Absolute gold-lead magnitude with a leading "+", e.g. 2540 -> "+2.5k", -300 -> "+300". The
// sign is NOT encoded here: the caller attributes the lead by placing this badge next to the
// leading team's name (radiant if radiantLead > 0, else dire), so it always reads as a positive
// "ahead by" amount tied to a named team — never a bare "+500" a viewer can't attribute.
export function formatGoldMagnitude(lead) {
  if (!Number.isFinite(lead) || lead === 0) return null
  const abs = Math.abs(lead)
  return '+' + (abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : String(abs))
}

export function formatClock(gameTime) {
  if (!Number.isFinite(gameTime) || gameTime < 0) return null
  const m = Math.floor(gameTime / 60)
  const s = gameTime % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function HeroIcon({ heroKey, name }) {
  if (!heroKey) return <div className="w-5 h-5 rounded-sm bg-gray-200 dark:bg-gray-800 flex-shrink-0" aria-hidden="true" />
  return (
    <img
      src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${heroKey}.png`}
      alt={name}
      title={name}
      className="w-5 h-5 rounded-sm object-cover flex-shrink-0"
      loading="lazy"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
    />
  )
}

// Live pulse for the CURRENTLY RUNNING game of a series: gold lead + kill score + live draft,
// sourced from live_game_map via ?mode=live-game-pulse. Self-polls while mounted (matchId is
// stable — one running game per series at a time).
//
// Each poll ALSO nudges the capture (?mode=od-live-capture) before reading the pulse, so "a
// viewer has this exact live game open" drives freshness directly — not just the app's ambient
// 2-min site-wide poll, which can leave the pulse tens of seconds to minutes stale (worse if the
// browser tab backgrounds and throttles that interval). The capture is server-lock-throttled to
// ~once/110s regardless of caller count, so most of these pings are a cheap early-exit KV read;
// only the poll that actually lands on an open lock window pays for the full OpenDota round trip.
//
// Live draft shows even in spoiler-free (pre-outcome, same rule as the finished-game draft
// strip); gold lead + kill score are gated by the parent.
export default function SeriesLivePulse({ psMatchId, spoilerFree }) {
  const [pulse, setPulse] = useState(null)
  const [heroMap, setHeroMap] = useState(null)

  useEffect(() => {
    if (!psMatchId) return
    let cancelled = false
    async function poll() {
      await fetch('/api/tournaments?mode=od-live-capture').catch(() => {})
      if (cancelled) return
      fetchLiveGamePulse(psMatchId).then(p => { if (!cancelled) setPulse(p) }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [psMatchId])

  useEffect(() => {
    let cancelled = false
    fetchHeroes().then(map => { if (!cancelled) setHeroMap(map) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!pulse) return null

  // Attribute the gold lead to a NAMED team by position: the badge sits next to radiant when
  // radiantLead > 0, else next to dire. Never a bare, unattributable "+500" (sides swap game to
  // game, so radiant/dire has no fixed relationship to the header's team order).
  const leadMag = formatGoldMagnitude(pulse.radiantLead)
  const radiantAhead = Number.isFinite(pulse.radiantLead) && pulse.radiantLead > 0
  // Same advantage-color rule as GoldGraph's header row (finalColor): green when Radiant leads,
  // red when Dire leads. The badge was previously hardcoded green regardless of side — wrong on
  // any Dire-leading game, and inconsistent with this exact rule used everywhere else (GoldGraph,
  // event markers, TeamIndicators).
  const leadColor = radiantAhead ? 'rgb(34,197,94)' : 'rgb(239,68,68)'
  const clock = formatClock(pulse.gameTime)
  const hasScore = pulse.radiantScore != null && pulse.direScore != null
  const radiantHeroes = (pulse.radiantHeroIds || []).map(id => ({ key: heroMap?.[id]?.key || null, name: heroMap?.[id]?.name || `Hero ${id}` }))
  const direHeroes = (pulse.direHeroIds || []).map(id => ({ key: heroMap?.[id]?.key || null, name: heroMap?.[id]?.name || `Hero ${id}` }))

  return (
    <div className="px-4 py-3">
      {!spoilerFree && (hasScore || leadMag || clock) && (
        <div className="mb-2 space-y-0.5">
          <SeriesScoreRow
            name={pulse.radiantName || 'Radiant'}
            score={pulse.radiantScore}
            leadLabel={radiantAhead ? leadMag : null}
            leadColor={leadColor}
          />
          <SeriesScoreRow
            name={pulse.direName || 'Dire'}
            score={pulse.direScore}
            leadLabel={!radiantAhead ? leadMag : null}
            leadColor={leadColor}
          />
          {clock && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 tabular-nums pt-0.5">{clock}</p>}
        </div>
      )}
      {(radiantHeroes.length > 0 || direHeroes.length > 0) && (
        <div className="flex items-center gap-0.5" role="img" aria-label="Live draft">
          {radiantHeroes.map((h, i) => <HeroIcon key={`r${i}`} heroKey={h.key} name={h.name} />)}
          {radiantHeroes.length > 0 && direHeroes.length > 0 && (
            <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1.5 flex-shrink-0" aria-hidden="true" />
          )}
          {direHeroes.map((h, i) => <HeroIcon key={`d${i}`} heroKey={h.key} name={h.name} />)}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { fetchLiveGamePulse, fetchHeroes } from '../api'
import { trackEvent, getStreamLanguage, pickPreferredStream } from '../utils'
import { computeMomentum, computeStakes } from '../utils/momentum'
import { formatGoldMagnitude, formatLiveScoreTitle } from '../utils/liveScore'
import HeroIcon from './HeroIcon'
import DotaMinimap from './DotaMinimap'
import LiveGoldGraph from './LiveGoldGraph'
import SeriesScoreRow from './SeriesScoreRow'
import LiveStreamPicker from './LiveStreamPicker'
import { streamLabel } from './StreamPicker'
import { TwitchIcon, YouTubeIcon } from './PlatformIcons'
import { SHEET_PADDING } from './Sheet'

const POLL_MS = 20000
// Bounds the retain-last-known-good behavior below: a failed/empty poll and a routine "no game
// is running right now" (the ordinary gap between games in a BO3/BO5 — drafting, or the new
// game's OD correlation hasn't landed yet) are indistinguishable from the client's point of view,
// since both surface as a null pulse. Retaining indefinitely would show a FINISHED game's numbers
// captioned as if they described whichever game is running now. 90s survives a transient miss or
// two at this component's 20s poll cadence without risking that.
const STALE_AFTER_MS = 90000

// Decides what the next pulse state should be after a poll. A fresh (non-null) result always
// wins. A null/failed result retains the previous pulse ONLY while it's still recent (bounded by
// STALE_AFTER_MS) — otherwise a transient poll miss would flicker the whole live section out and
// back, but an actual game transition would correctly still clear the stale display. Exported for
// unit testing.
export function nextPulseState(freshPulse, prevPulse, now = Date.now()) {
  if (freshPulse) return freshPulse
  if (prevPulse?.capturedAt) {
    const age = now - new Date(prevPulse.capturedAt).getTime()
    if (Number.isFinite(age) && age < STALE_AFTER_MS) return prevPulse
  }
  return null
}

// Moved to src/utils/liveScore.js (2026-07-27) so the server-side live-score push copy and the
// client surfaces share one implementation. Re-exported here because this was its original home
// and existing importers/tests reference it from this module.
export { formatGoldMagnitude }

// Mirrors the running game's score into the browser tab title while the companion is open — the
// glanceable surface for a fan who keeps the site in a background tab. Captures the document's
// own title at first render and restores it on unmount (sheet closed, series switched, game
// finished), so a stale score can never outlive the live game it described.
//
// Unconditionally suppressed in spoiler-free mode: unlike the score push, which is an explicit
// opt-in, the tab title is a passive surface the fan never consented to.
function useLiveScoreTabTitle(pulse, spoilerFree) {
  const originalTitleRef = useRef(typeof document === 'undefined' ? null : document.title)
  const trackedRef = useRef(false)

  useEffect(() => () => {
    if (typeof document !== 'undefined' && originalTitleRef.current !== null) {
      document.title = originalTitleRef.current
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const title = spoilerFree ? null : formatLiveScoreTitle(pulse)
    if (!title) {
      if (originalTitleRef.current !== null) document.title = originalTitleRef.current
      return
    }
    document.title = title
    if (!trackedRef.current) {
      trackedRef.current = true
      trackEvent('live_tab_title_active')
    }
  }, [pulse, spoilerFree])
}

export function formatClock(gameTime) {
  if (!Number.isFinite(gameTime) || gameTime < 0) return null
  const m = Math.floor(gameTime / 60)
  const s = gameTime % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Zips one side's hero ids + live IGNs (index-aligned by construction — both arrays were split
// from OD /live's players[] in the same pass, same order, api/_handlers/liveOdCapture.js) into
// per-pick display data. `heroIds`/`playerNames` are read positionally, so a shorter/missing
// `playerNames` (a pre-migration or not-yet-recaptured live_game_map row) degrades each pick to
// hero-only rather than throwing or misaligning. `heroMap` may be null while still loading — a
// hero name of null (not "Hero 155") tells DraftPickRow to render icon-only rather than flashing a
// raw id string. Exported for unit testing.
export function zipDraftPicks(heroIds, playerNames, heroMap) {
  return (heroIds || []).map((id, i) => ({
    key: heroMap?.[id]?.key || null,
    name: heroMap?.[id]?.name || null,
    player: playerNames?.[i] || null,
  }))
}

// One pick in the live draft — mirrors the finished-game DraftDisplay row (hero icon + hero name +
// player name), tinted by side (Radiant green / Dire red). Two columns of these replace the old
// bare-icon strip so the live draft reads like the drawer's completed-game draft. Deliberately
// WITHOUT per-player KDA: OpenDota's /live feed carries only the team-level score (already shown
// above), never per-player kills/deaths/assists — there is no live source for it, so the row never
// shows a stat slot that would have to be faked. A null hero key/name (hero map still loading, or
// hero_id 0 during draft phase) degrades to a placeholder tile + no label, never a broken image or
// a "Hero 155" flash. playerName is the live IGN from live_game_map's radiant/dire_player_names
// (2026-07-19 migration) — null on rows captured before that migration or before their next capture
// cycle, in which case the row is hero-only, same degrade-safe shape as a name-pending hero.
function DraftPickRow({ heroKey, heroName, playerName, side }) {
  const tint = side === 'radiant'
    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50'
    : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'
  const placeholder = side === 'radiant' ? 'bg-green-200 dark:bg-green-900' : 'bg-red-200 dark:bg-red-900'
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${tint}`}>
      <HeroIcon
        heroKey={heroKey}
        name={heroName}
        sizeClassName="w-8 h-8"
        placeholderClassName={placeholder}
        collapseOnError
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        {heroName && (
          <span className="block font-semibold text-xs text-gray-900 dark:text-white truncate min-w-0">
            {heroName}
          </span>
        )}
        {playerName && (
          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate min-w-0">
            {playerName}
          </span>
        )}
      </div>
    </div>
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
// ~once/60s regardless of caller count, so most of these 20s pings are a cheap early-exit KV read;
// only the poll that actually lands on an open lock window pays for the full OpenDota round trip.
//
// Live draft shows even in spoiler-free (pre-outcome, same rule as the finished-game draft
// strip); gold lead + kill score are gated by the parent.
//
// Live Story: seriesLabel/seriesScore/teamA/teamB feed computeStakes ("does this game matter").
// `true` below always requests `history` from the pulse endpoint (api/_handlers/liveGamePulse.js
// still checks its own `&owner=1` query param, which this satisfies unconditionally now that the
// surface is public — left as-is server-side since it's harmless and already tested).
export default function SeriesLivePulse({ psMatchId, isOwner, spoilerFree, seriesLabel, seriesScore, teamA, teamB, tournament, streams, youtubeStream, otherStreams, primaryLanguages }) {
  const [pulse, setPulse] = useState(null)
  const [heroMap, setHeroMap] = useState(null)
  // Read once per mount rather than per render — this component re-renders on every 20s poll,
  // and the sheet remounts when reopened, which is when a preference change should take effect.
  const [streamLanguage] = useState(getStreamLanguage)

  // Called before every early return below — the tab title must keep tracking (and restoring)
  // even in the states where this component renders nothing.
  useLiveScoreTabTitle(pulse, spoilerFree)

  useEffect(() => {
    if (!psMatchId) return
    let cancelled = false
    async function poll() {
      await fetch('/api/tournaments?mode=od-live-capture').catch(() => {})
      if (cancelled) return
      fetchLiveGamePulse(psMatchId, true).then(p => { if (!cancelled) setPulse(prev => nextPulseState(p, prev)) }).catch(() => {})
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

  // Watch links don't depend on the pulse poll (they come from the already-fetched match
  // object), so they're computed and rendered regardless of whether a pulse has arrived yet -
  // a fan shouldn't wait on the 20s live-data poll just to get a link to the stream.
  const twitchUrl = streams?.[0]?.url || null
  const twitchLabel = streams?.[0]?.label || null
  // A fan's preferred-language stream takes the primary slot: rendered first, in the same purple
  // treatment as the default watch buttons. The defaults are NOT hidden — they demote to the rest
  // of the row — so promoting a co-stream never costs the fan access to the official broadcast.
  // No match (or no preference) returns preferred=null and leaves the row exactly as it is today.
  const { preferred: preferredStream, rest: restStreams } = pickPreferredStream(otherStreams, streamLanguage, primaryLanguages)
  // Unlike the replay surface, the chip shows for EVERY language including English — the
  // LiveStreamPicker rows below have no 'en' exclusion either, so suppressing it here would make
  // a promoted EN co-stream the only stream on the surface without a language marker.
  const preferredLangChip = preferredStream?.language ? preferredStream.language.toUpperCase() : null
  // Three identical filled buttons would leave no primary at all, so the defaults drop to an
  // outline treatment once a preferred-language stream occupies the primary slot. Without a
  // preference they keep today's filled purple exactly.
  const demotedWatchClass = preferredStream
    ? 'border border-gray-300 dark:border-gray-700 text-purple-700 dark:text-purple-400 hover:border-gray-400 dark:hover:border-gray-600'
    : 'bg-purple-700 hover:bg-purple-800 text-white'
  const hasWatchLinks = !!(twitchUrl || youtubeStream || preferredStream || (restStreams && restStreams.length > 0))
  const watchLinks = hasWatchLinks && (
    <div className="mb-2">
      {(twitchUrl || youtubeStream || preferredStream) && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {preferredStream && (
            <a
              href={preferredStream.raw_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Watch live${preferredStream.language ? ` in ${preferredStream.language.toUpperCase()}` : ''} on ${streamLabel({ ...preferredStream, url: preferredStream.raw_url })}${preferredStream.official === false ? ', co-stream' : ''}`}
              onClick={() => trackEvent('live_match_watch', {
                matchId: psMatchId,
                channel: preferredStream.channel,
                language: preferredStream.language,
                official: preferredStream.official,
                teamA,
                teamB,
                tournament,
                source: 'live_series_sheet',
                from_preference: true,
              })}
              className="focus-ring inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" aria-hidden="true" />
              {preferredLangChip && (
                <span className="px-1 py-0.5 rounded bg-white/20 text-[10px] font-bold uppercase leading-none">
                  {preferredLangChip}
                </span>
              )}
              Watch · {streamLabel({ ...preferredStream, url: preferredStream.raw_url })}
              {preferredStream.official === false && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  Co-stream
                </span>
              )}
            </a>
          )}
          {twitchUrl && (
            <a
              href={twitchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('live_match_watch', { channel: twitchLabel, teamA, teamB, tournament, source: 'live_series_sheet', preferred_language_match: !!preferredStream })}
              className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded transition-colors whitespace-nowrap ${demotedWatchClass}`}
            >
              <TwitchIcon />
              Watch{twitchLabel ? ` · ${twitchLabel}` : ''}
            </a>
          )}
          {youtubeStream && (
            <a
              href={youtubeStream}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('live_match_watch_youtube', { teamA, teamB, tournament, source: 'live_series_sheet', preferred_language_match: !!preferredStream })}
              className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded transition-colors whitespace-nowrap ${demotedWatchClass}`}
            >
              <YouTubeIcon />
              Watch on YouTube
            </a>
          )}
        </div>
      )}
      {restStreams && restStreams.length > 0 && <LiveStreamPicker streams={restStreams} matchId={psMatchId} />}
    </div>
  )

  if (!pulse) return hasWatchLinks ? <div className={`${SHEET_PADDING} py-3`}>{watchLinks}</div> : null

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
  const radiantHeroes = zipDraftPicks(pulse.radiantHeroIds, pulse.radiantPlayerNames, heroMap)
  const direHeroes = zipDraftPicks(pulse.direHeroIds, pulse.direPlayerNames, heroMap)

  // Live Story surfaces (stakes chip, momentum read, net-worth graph) are public. Spoiler-free
  // still hides them (they reveal who's winning) — draft above is unaffected, same "draft is
  // pre-outcome, not a spoiler" rule the finished-game strip already follows.
  const showLiveStory = !spoilerFree
  const stakes = showLiveStory ? computeStakes({ seriesLabel, seriesScore, teamA, teamB }) : null
  const momentum = showLiveStory
    ? computeMomentum({ radiantLead: pulse.radiantLead, gameTime: pulse.gameTime, radiantName: pulse.radiantName, direName: pulse.direName })
    : null

  return (
    <div className={`${SHEET_PADDING} py-3`}>
      {watchLinks}
      {stakes?.kind && (
        <p className="mb-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400">
            {stakes.kind === 'DECIDER' ? 'Decider' : `Match Point · ${stakes.leaderName}`}
          </span>
        </p>
      )}
      {momentum && (
        <p className="mb-1.5">
          <span
            className={`text-xs font-bold uppercase tracking-wide ${momentum.leadColor ? '' : 'text-gray-600 dark:text-gray-400'}`}
            style={momentum.leadColor ? { color: momentum.leadColor } : undefined}
          >
            {momentum.band === 'EVEN' ? 'Even' : `${momentum.leaderName} ${momentum.band === 'FAR_AHEAD' ? 'Far Ahead' : 'Ahead'}`}
          </span>
          <span className="ml-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-600 normal-case tracking-normal">
            game time {formatClock(pulse.gameTime)}
          </span>
        </p>
      )}
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
          {/* Momentum row above already shows the clock inline ("game time 14:43") whenever it
              renders — only fall back to this line when momentum is null (e.g. gameTime present
              but radiantLead isn't finite yet), so the two never show the same clock twice. */}
          {clock && !momentum && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 tabular-nums pt-0.5">{clock}</p>}
        </div>
      )}
      {isOwner && showLiveStory && pulse.objectives && (
        <DotaMinimap
          radiant={pulse.objectives.radiant}
          dire={pulse.objectives.dire}
          radiantName={pulse.radiantName}
          direName={pulse.direName}
        />
      )}
      {showLiveStory && <LiveGoldGraph history={pulse.history} radiantName={pulse.radiantName} direName={pulse.direName} />}
      {(radiantHeroes.length > 0 || direHeroes.length > 0) && (
        <div className="mt-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Picks</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 dark:text-green-500 mb-1.5 truncate">
                {pulse.radiantName || 'Radiant'}
              </p>
              {radiantHeroes.map((h, i) => (
                <DraftPickRow key={`r${i}`} heroKey={h.key} heroName={h.name} playerName={h.player} side="radiant" />
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-500 mb-1.5 truncate">
                {pulse.direName || 'Dire'}
              </p>
              {direHeroes.map((h, i) => (
                <DraftPickRow key={`d${i}`} heroKey={h.key} heroName={h.name} playerName={h.player} side="dire" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

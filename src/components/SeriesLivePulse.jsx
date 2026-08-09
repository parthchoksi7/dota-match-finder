import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchLiveGamePulse, fetchLiveValvePulse, fetchHeroes } from '../api'
import { RoshanStatus, LivePlayerBoard, LiveBanList, LiveEventFeed } from './LiveValveBoard'
import { trackEvent, getStreamLanguage, pickPreferredStream } from '../utils'
import { computeMomentum, computeStakes } from '../utils/momentum'
import { formatGoldMagnitude, formatLiveScoreTitle } from '../utils/liveScore'
import HeroIcon from './HeroIcon'
import DotaMinimap from './DotaMinimap'
import LiveGoldGraph from './LiveGoldGraph'
import LiveStreamPicker from './LiveStreamPicker'
import { streamLabel } from './StreamPicker'
import { TwitchIcon, YouTubeIcon } from './PlatformIcons'
import { SHEET_PADDING } from './Sheet'
import { InfoButton } from './FloatingTooltip'

const POLL_MS = 40000
// Bounds the retain-last-known-good behavior below: a failed/empty poll and a routine "no game
// is running right now" (the ordinary gap between games in a BO3/BO5 — drafting, or the new
// game's OD correlation hasn't landed yet) are indistinguishable from the client's point of view,
// since both surface as a null pulse. Retaining indefinitely would show a FINISHED game's numbers
// captioned as if they described whichever game is running now. 90s survives a transient miss or
// two at this component's 40s poll cadence without risking that.
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

// Duplicated from MatchDrawer.jsx's identical local StarIcon rather than extracted — two call
// sites for a 10-line SVG doesn't clear the bar for a shared file yet (see teamMatching.js-style
// extraction the day a third caller shows up).
function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? '0' : '1.5'}
      />
    </svg>
  )
}

// Live pulse for the CURRENTLY RUNNING game of a series: gold lead + kill score + live draft,
// sourced from live_game_map via ?mode=live-game-pulse. Self-polls while mounted (matchId is
// stable — one running game per series at a time).
//
// The pulse endpoint itself nudges the OD /live capture as its own first step (server-side, on a
// pulse-cache miss — see liveGamePulse.js/liveOdCapture.js) before resolving, so "a viewer has
// this exact live game open" still drives freshness directly, not just the app's ambient 2-min
// site-wide poll. Until 2026-08-02 this component fired that capture nudge itself via a separate
// `?mode=od-live-capture` fetch before every pulse read — folded server-side so this poll costs one
// serverless invocation per tick instead of two (the capture's own KV lock still throttles the
// actual OpenDota fetch to ~once/60s regardless of caller count, unchanged). Poll interval widened
// 20s → 40s the same day (further CPU-budget reduction, see the memory/CONTEXT.md note) — the
// underlying capture only refreshes ~once/60s anyway, so a 20s poll was already re-fetching
// unchanged data most ticks; 40s trades a bit of that margin for ~33% fewer invocations.
//
// Live draft shows even in spoiler-free (pre-outcome, same rule as the finished-game draft
// strip); names/score/stakes/momentum/map/graph are gated by `hideScore` below, same contract as
// MatchDrawer's own `hideScore` (spoiler-free + not yet manually revealed) — team names are NOT
// spoiler content (matches MatchDrawer, which always shows radiant/direTeam regardless of
// spoilerFree), only the score/outcome-adjacent surfaces are.
//
// Live Story: seriesLabel/seriesScore/teamA/teamB feed computeStakes ("does this game matter").
// `true` below always requests `history` from the pulse endpoint (api/_handlers/liveGamePulse.js
// still checks its own `&owner=1` query param, which this satisfies unconditionally now that the
// surface is public — left as-is server-side since it's harmless and already tested).
//
// Names/score/watch/map/graph/draft section shapes deliberately mirror MatchDrawer.jsx's own
// sections (2026-07-31 — the two were independently designed and had drifted for data that's
// identical between a live and a completed game: team names, kill score, follow, watch position,
// draft section label). MatchDrawer itself is the fixed baseline and was not changed.
export default function SeriesLivePulse({ psMatchId, spoilerFree, seriesLabel, seriesScore, teamA, teamB, tournament, streams, youtubeStream, otherStreams, primaryLanguages, followedTeams, onToggleFollow }) {
  const [pulse, setPulse] = useState(null)
  // Valve telemetry. Null is the normal, expected state — see the poll effect below.
  const [valvePulse, setValvePulse] = useState(null)
  const [heroMap, setHeroMap] = useState(null)
  // Mirrors MatchDrawer's scoreRevealed: spoiler-free hides the score/outcome-adjacent surfaces
  // behind a "Reveal score" button rather than the site-wide spoiler-free setting being the only
  // lever, same as a completed game. Reset whenever the game itself changes.
  const [scoreRevealed, setScoreRevealed] = useState(false)
  // Read once per mount rather than per render — this component re-renders on every 40s poll,
  // and the sheet remounts when reopened, which is when a preference change should take effect.
  const [streamLanguage] = useState(getStreamLanguage)

  // Prefer Valve (the data-provenance target once the feature is validated and flagged on) but
  // fall back to the OD pulse whenever Valve hasn't resolved — flag off (the documented current
  // default) or a transient correlation miss — so production behavior matches what shipped BEFORE
  // this work until the Valve path is actually live. Confirmed by independent review: without
  // this, the entire score/clock/map/graph/draft surface silently blanks for every viewer whenever
  // the flag is off, even though the OD pulse driving all of it before this diff still resolves
  // fine. This is a compatibility fallback, not a relaxation of "Valve owns in-game numbers" — the
  // instant valvePulse resolves, everything prefers it exclusively again. `pulse`/`valvePulse`
  // share enough field names (radiantName/direName/radiantLead/radiantScore/direScore/gameTime/
  // history) that a whole-object fallback works for those; draft and the tower map need their own
  // branch below since the two sources' shapes genuinely diverge. Player-level telemetry (KDA/
  // items/GPM/barracks/Roshan/timeline) has no OD equivalent at all — those sections stay gated on
  // valvePulse alone, correctly rendering nothing until the feature is live, same as before this
  // diff existed.
  const liveSource = valvePulse || pulse

  // Called before every early return below — the tab title must keep tracking (and restoring)
  // even in the states where this component renders nothing.
  useLiveScoreTabTitle(liveSource, spoilerFree)

  useEffect(() => {
    setScoreRevealed(false)
  }, [psMatchId])

  // Without this, the sheet host reuses this component instance across a live-series switch
  // (App.jsx keeps it mounted to avoid a close/reopen flash), so a stale pulse from the
  // previously-viewed series would otherwise survive under nextPulseState's retain-last-known-good
  // window (up to STALE_AFTER_MS) and render as if it belonged to the newly selected series.
  // useLayoutEffect (not useEffect) so the clear lands before the browser paints the new
  // psMatchId's props alongside the still-mounted old pulse — otherwise a same-frame mix (new
  // series' stakes chip over the old series' name/score) could flash for one paint.
  useLayoutEffect(() => {
    setPulse(null)
  }, [psMatchId])

  useEffect(() => {
    if (!psMatchId) return
    let cancelled = false
    function poll() {
      fetchLiveGamePulse(psMatchId, true).then(p => { if (!cancelled) setPulse(prev => nextPulseState(p, prev)) }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [psMatchId])

  // Valve-sourced telemetry — now the PRIMARY source for score, clock, net-worth lead, the
  // net-worth graph, and the tower/barracks map below (all switched off the OD pulse 2026-08-06).
  // Still a separate state + effect rather than merged into the OD poll above: independent failure
  // modes, and while the endpoint is fail-closed behind `feature:live-valve-pulse:enabled` (see
  // CONTEXT.md's public-graduation bar), `valvePulse` staying null must not take the OD-only
  // sections (draft, watch links) down with it.
  //
  // Same retain-last-known-good bound as the OD pulse (`nextPulseState`/`STALE_AFTER_MS`) — added
  // 2026-08-06 after watching a real correlation miss freeze the Valve UI mid-game live (Valve's
  // team_name block intermittently drops for a poll or two; without this the whole section would
  // have blanked on that single miss instead of holding the last good read for up to 90s).
  useLayoutEffect(() => {
    setValvePulse(null)
  }, [psMatchId])

  useEffect(() => {
    if (!psMatchId) return
    let cancelled = false
    let interval
    function poll() {
      fetchLiveValvePulse(psMatchId).then(p => { if (!cancelled) setValvePulse(prev => nextPulseState(p, prev)) }).catch(() => {})
    }
    // First fetch stays immediate so the Valve-sourced sections don't lag the OD ones on mount.
    // The recurring cadence is staggered half a cycle behind the OD poller above (same POLL_MS,
    // same mount tick) so the two independent pollers don't double up on every outbound-request
    // burst — only the interval's phase is offset, not the first paint.
    poll()
    const stagger = setTimeout(() => {
      poll()
      interval = setInterval(poll, POLL_MS)
    }, POLL_MS / 2)
    return () => { cancelled = true; clearTimeout(stagger); clearInterval(interval) }
  }, [psMatchId])

  useEffect(() => {
    let cancelled = false
    fetchHeroes().then(map => { if (!cancelled) setHeroMap(map) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Watch links don't depend on the pulse poll (they come from the already-fetched match
  // object), so they're computed and rendered regardless of whether a pulse has arrived yet -
  // a fan shouldn't wait on the 40s live-data poll just to get a link to the stream.
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
    <div>
      {(twitchUrl || youtubeStream || preferredStream) && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {preferredStream && (
            <a
              href={preferredStream.raw_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Watch live${preferredStream.language ? ` in ${preferredStream.language.toUpperCase()}` : ''} on ${streamLabel({ ...preferredStream, url: preferredStream.raw_url })}`}
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

  // Gate on EITHER source, not just the OD `pulse` — everything below now runs primarily off
  // `valvePulse`, and gating solely on `pulse` would hide the entire Valve-sourced section (score,
  // map, player board, event feed) any time OD's own correlation hasn't resolved, even when Valve's
  // has. Every section below already degrades gracefully when `valvePulse` alone is null (score
  // shows "pending", map/graph/board sections don't render), so falling through here is safe.
  if (!pulse && !valvePulse) {
    return hasWatchLinks ? (
      <div className={`${SHEET_PADDING} py-3`}>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
          Watch Live
        </p>
        {watchLinks}
      </div>
    ) : null
  }

  const usingValve = !!valvePulse
  // Valve's feed can mark a game "live" before its clock actually starts (draft just locked in,
  // world still loading) — every per-player field is a real, honest 0/starting-value in that
  // window, not missing data. Without this check the player board rendered a full grid of blank
  // portraits and 0/0/0 stats, which reads as broken rather than "starting soon."
  const valveMatchLoading = usingValve && !(valvePulse.gameTime > 0)
  // Valve's own broadcast delay for this tournament (anti-stream-sniping, varies 10s-15min by
  // event) — surfaced because it's a real spoiler risk specific to this data source: everything
  // below reflects the game RIGHT NOW, while the public Twitch/Kick stream a fan is watching
  // alongside this sheet lags behind it by exactly this much.
  const streamDelayS = usingValve && Number.isFinite(valvePulse.streamDelayS) && valvePulse.streamDelayS > 0
    ? valvePulse.streamDelayS
    : null
  const streamDelayLabel = streamDelayS != null
    ? (streamDelayS < 60 ? `${streamDelayS}s` : `${Math.round(streamDelayS / 60)}m`)
    : null

  // Attribute the gold lead to a NAMED team by position: the badge sits next to radiant when
  // radiantLead > 0, else next to dire. Never a bare, unattributable "+500" (sides swap game to
  // game, so radiant/dire has no fixed relationship to the header's team order).
  const leadMag = formatGoldMagnitude(liveSource?.radiantLead)
  const radiantAhead = Number.isFinite(liveSource?.radiantLead) && liveSource.radiantLead > 0
  // Same advantage-color rule as GoldGraph's header row (finalColor): green when Radiant leads,
  // red when Dire leads. The badge was previously hardcoded green regardless of side — wrong on
  // any Dire-leading game, and inconsistent with this exact rule used everywhere else (GoldGraph,
  // event markers, TeamIndicators).
  const leadColor = radiantAhead ? 'rgb(34,197,94)' : 'rgb(239,68,68)'
  const clock = formatClock(liveSource?.gameTime)
  const hasScore = liveSource?.radiantScore != null && liveSource?.direScore != null
  // Draft: Valve gives {heroId, name} player objects (heroId + live IGN, joined server-side from
  // the top-level players[] block — the only place a live IGN exists); OD gives parallel hero-id/
  // name arrays. Genuinely different shapes, so this branches by source instead of going through
  // liveSource. zipDraftPicks itself is source-agnostic — same helper, different inputs.
  //
  // players[].heroId stays 0 for every player until the game clock actually starts (same window
  // valveMatchLoading guards above) — during the real draft phase the ONLY place a real pick
  // exists is valvePulse.draft.{radiant,dire}Picks. That field is pick ORDER, not slot order
  // (_liveValveState.js's own comment), so it can't be reliably zipped with player names — a
  // wrong pairing would be worse than no pairing. zipDraftPicks already degrades a null
  // playerName to a hero-only row (DraftPickRow's own documented contract), so this shows real
  // heroes with no player attribution while loading, then switches to fully-attributed rows once
  // players[].heroId populates for real.
  const radiantHeroes = usingValve
    ? (valveMatchLoading
      ? zipDraftPicks(valvePulse.draft?.radiantPicks, null, heroMap)
      : zipDraftPicks(valvePulse.players?.radiant?.map(p => p.heroId), valvePulse.players?.radiant?.map(p => p.name), heroMap))
    : zipDraftPicks(pulse?.radiantHeroIds, pulse?.radiantPlayerNames, heroMap)
  const direHeroes = usingValve
    ? (valveMatchLoading
      ? zipDraftPicks(valvePulse.draft?.direPicks, null, heroMap)
      : zipDraftPicks(valvePulse.players?.dire?.map(p => p.heroId), valvePulse.players?.dire?.map(p => p.name), heroMap))
    : zipDraftPicks(pulse?.direHeroIds, pulse?.direPlayerNames, heroMap)

  const radiantName = liveSource?.radiantName || 'Radiant'
  const direName = liveSource?.direName || 'Dire'
  // Same contract as MatchDrawer's hideScore: spoiler-free hides the result until manually
  // revealed. Stakes/momentum/tower-map/net-worth-graph ride the same gate — they're all
  // outcome-adjacent, same as MatchDrawer's game-facts line riding its own hideScore.
  const hideScore = spoilerFree && !scoreRevealed
  const showLiveStory = !hideScore
  const stakes = showLiveStory ? computeStakes({ seriesLabel, seriesScore, teamA, teamB }) : null
  const momentum = showLiveStory && liveSource
    ? computeMomentum({ radiantLead: liveSource.radiantLead, gameTime: liveSource.gameTime, radiantName: liveSource.radiantName, direName: liveSource.direName })
    : null
  // Tower map: Valve gives decodable per-tower state (richer — tier4/barracks too, via the props
  // passed below); OD gives raw [top,mid,bot] standing counts directly on pulse.objectives. The OD
  // fallback path renders exactly as it did before this diff — count-only, towers-only, no rich
  // props — since DotaMinimap's richer rendering requires data OD structurally cannot provide.
  const laneCounts = state => state ? ['top', 'mid', 'bot'].map(lane => state.lanes[lane].filter(Boolean).length) : null
  const radiantTowerCounts = usingValve ? laneCounts(valvePulse?.towers?.radiant) : (pulse?.objectives?.radiant ?? null)
  const direTowerCounts = usingValve ? laneCounts(valvePulse?.towers?.dire) : (pulse?.objectives?.dire ?? null)

  function follow(name) {
    trackEvent(followedTeams?.includes(name) ? 'unfollow_team' : 'follow_team', { team_name: name, source: 'live_series_sheet' })
    onToggleFollow(name)
  }

  return (
    <div className={`${SHEET_PADDING} py-3 space-y-6`}>
      {streamDelayLabel && (
        <div className="-mt-1 flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600">
            Broadcast delay ~{streamDelayLabel}
          </span>
          <InfoButton
            ariaLabel="What does broadcast delay mean?"
            title="Broadcast delay"
            description={`This tournament holds its public stream back ${streamDelayLabel} to stop players from watching it for an edge. Everything below reflects the game right now — if you're also watching the stream, it can spoil what you're about to see.`}
          />
        </div>
      )}
      {(stakes?.kind || momentum) && (
        <div>
          {stakes?.kind && (
            <p className="mb-1.5">
              <span className="inline-flex items-center max-w-full truncate px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {stakes.kind === 'DECIDER' ? 'Decider' : `Match Point · ${stakes.leaderName}`}
              </span>
            </p>
          )}
          {momentum && (
            <p>
              <span
                className={`text-xs font-bold uppercase tracking-wide ${momentum.leadColor ? '' : 'text-gray-600 dark:text-gray-400'}`}
                style={momentum.leadColor ? { color: momentum.leadColor } : undefined}
              >
                {momentum.band === 'EVEN' ? 'Even' : `${momentum.leaderName} ${momentum.band === 'FAR_AHEAD' ? 'Far Ahead' : 'Ahead'}`}
              </span>
              <span className="ml-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-600 normal-case tracking-normal">
                game time {clock}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Names row — mirrors MatchDrawer's names row exactly: left/right anchored, follow stars,
          no winner/loser coloring (no result yet — same rule MatchDrawer uses in spoiler-free
          mode, "both names get winner style when no result is known"). */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-display font-black text-base sm:text-lg uppercase tracking-wide truncate text-gray-900 dark:text-white">
            {radiantName}
          </span>
          {onToggleFollow && (
            <button
              type="button"
              onClick={() => follow(radiantName)}
              className={`flex-shrink-0 p-[14px] rounded transition-colors ${
                followedTeams?.includes(radiantName)
                  ? 'text-yellow-400'
                  : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400 dark:hover:text-yellow-400'
              }`}
              aria-label={followedTeams?.includes(radiantName) ? `Unfollow ${radiantName}` : `Follow ${radiantName}`}
              title={followedTeams?.includes(radiantName) ? `Unfollow ${radiantName}` : `Follow ${radiantName}`}
            >
              <StarIcon filled={followedTeams?.includes(radiantName)} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          {onToggleFollow && (
            <button
              type="button"
              onClick={() => follow(direName)}
              className={`flex-shrink-0 p-[14px] rounded transition-colors ${
                followedTeams?.includes(direName)
                  ? 'text-yellow-400'
                  : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400 dark:hover:text-yellow-400'
              }`}
              aria-label={followedTeams?.includes(direName) ? `Unfollow ${direName}` : `Follow ${direName}`}
              title={followedTeams?.includes(direName) ? `Unfollow ${direName}` : `Follow ${direName}`}
            >
              <StarIcon filled={followedTeams?.includes(direName)} />
            </button>
          )}
          <span className="font-display font-black text-base sm:text-lg uppercase tracking-wide truncate text-right text-gray-900 dark:text-white">
            {direName}
          </span>
        </div>
      </div>

      {/* Score + live facts — mirrors MatchDrawer's score + first-blood/roshan facts group */}
      <div>
        <div className="flex items-center justify-center gap-3">
          {hideScore ? (
            <button
              type="button"
              onClick={() => {
                setScoreRevealed(true)
                trackEvent('spoiler_reveal', { matchId: psMatchId, radiantTeam: radiantName, direTeam: direName, source: 'live' })
              }}
              className="font-display text-sm font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Reveal score
            </button>
          ) : !hasScore ? (
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
              Score pending
            </span>
          ) : (
            <>
              <span className="font-display text-4xl font-black text-gray-900 dark:text-white">{liveSource.radiantScore}</span>
              <span className="text-gray-300 dark:text-gray-700 text-2xl font-medium select-none">—</span>
              <span className="font-display text-4xl font-black text-gray-900 dark:text-white">{liveSource.direScore}</span>
            </>
          )}
        </div>

        {/* The momentum band above already shows the clock inline ("game time 4:13") whenever it
            renders — the clock here is a fallback for when momentum is null (e.g. gameTime
            present but radiantLead isn't finite yet), so the two never show the same clock
            twice. */}
        {!hideScore && (leadMag || (clock && !momentum)) && (
          <div className="flex items-center justify-center gap-2 mt-1.5">
            {leadMag && (
              <span className="text-[10px] font-semibold uppercase tracking-wide tabular-nums" style={{ color: leadColor }}>
                {radiantAhead ? radiantName : direName} {leadMag} net worth
              </span>
            )}
            {leadMag && clock && !momentum && (
              <span className="text-[10px] text-gray-300 dark:text-gray-700 select-none" aria-hidden="true">·</span>
            )}
            {clock && !momentum && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 tabular-nums">
                {clock}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Watch — same section label position/style as MatchDrawer's "Watch Full Match Replay",
          different wording since this is a live broadcast, not a replay. */}
      {hasWatchLinks && (
        <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Watch Live
          </p>
          {watchLinks}
        </div>
      )}

      {/* Roshan leads the objective-state block, ahead of the graph's history — both answer "how
          close is this to ending." */}
      {showLiveStory && valvePulse && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <RoshanStatus respawnTimer={valvePulse.roshanRespawnTimer} />
        </div>
      )}

      {showLiveStory && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <LiveGoldGraph history={liveSource?.history} radiantName={radiantName} direName={direName} />
        </div>
      )}

      {/* Directly under the graph, on purpose (moved up from the bottom of the sheet 2026-08-07):
          the feed is what EXPLAINS the graph's swings, so the two read as cause and effect, and a
          fight card's swing figure references the same quantity as the graph's y-axis. It also puts
          the match narrative ahead of per-player stats, which is the right order for a viewer
          arriving mid-game asking "what did I miss". Timeline is grouped + newest-first server-side
          (groupTimelineEvents); only kills/Roshan/marquee items ever reach it. */}
      {showLiveStory && valvePulse?.timeline?.length > 0 && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1">Live Event Feed</p>
          <LiveEventFeed
            groups={valvePulse.timeline}
            heroes={heroMap}
            itemNames={valvePulse.itemNames}
            radiantName={radiantName}
            direName={direName}
            matchId={psMatchId}
          />
        </div>
      )}

      {/* Per-player telemetry sits after the graph, mirroring MatchDrawer's completed-match order
          (gold graph, then player stats) so the two surfaces read the same way. */}
      {/* Same always-truthy-container trap as Barracks above: gate on there actually being a
          player on one of the two sides. */}
      {showLiveStory && (valvePulse?.players?.radiant?.length > 0 || valvePulse?.players?.dire?.length > 0) && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Player Stats</p>
          {valveMatchLoading ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
              Match starting — waiting for players to load in.
            </p>
          ) : (
            <LivePlayerBoard
              players={valvePulse.players}
              heroes={heroMap}
              itemNames={valvePulse.itemNames}
              radiantName={radiantName}
              direName={direName}
            />
          )}
        </div>
      )}

      {/* Tower map sits directly above Draft, not near the top (moved 2026-08-09 — owner feedback:
          the map read as too prominent above the fold for a stat that matters most once you
          already know who's playing what). Barracks + tier-4 render ON the map itself
          (radiant/direBarracksState props), not as a separate text panel — a prior pass had them
          as a text-only BarracksPanel below the map; removed in favor of this once the map could
          actually place them (2026-08-06). */}
      {showLiveStory && radiantTowerCounts && direTowerCounts && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <DotaMinimap
            radiant={radiantTowerCounts}
            dire={direTowerCounts}
            radiantName={radiantName}
            direName={direName}
            {...(usingValve ? {
              radiantTowerState: valvePulse.towers.radiant,
              direTowerState: valvePulse.towers.dire,
              radiantBarracksState: valvePulse.barracks?.radiant,
              direBarracksState: valvePulse.barracks?.dire,
            } : {})}
          />
        </div>
      )}

      {(radiantHeroes.length > 0 || direHeroes.length > 0) && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Draft</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 dark:text-green-500 mb-1.5 truncate">
                {radiantName}
              </p>
              {radiantHeroes.map((h, i) => (
                <DraftPickRow key={`r${i}`} heroKey={h.key} heroName={h.name} playerName={h.player} side="radiant" />
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-500 mb-1.5 truncate">
                {direName}
              </p>
              {direHeroes.map((h, i) => (
                <DraftPickRow key={`d${i}`} heroKey={h.key} heroName={h.name} playerName={h.player} side="dire" />
              ))}
            </div>
          </div>
          {/* Bans render inside the existing Draft block rather than as their own section — they
              are part of the same draft story, and DraftDisplay's completed-match layout already
              puts Picks and Bans under one heading. Renders regardless of spoiler-free, same rule
              as the picks above: a draft is pre-outcome. */}
          {/* `draft` is always an object, so gate on a ban actually existing — otherwise a game
              still in its pick phase renders an empty "Bans" label. */}
          {(valvePulse?.draft?.radiantBans?.length > 0 || valvePulse?.draft?.direBans?.length > 0) && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-1.5">
                Bans
              </p>
              <LiveBanList draft={valvePulse.draft} heroes={heroMap} />
            </div>
          )}
        </div>
      )}

    </div>
  )
}

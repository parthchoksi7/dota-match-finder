import { useEffect, useRef, useState } from 'react'
import { fetchLiveGamePulse, fetchHeroes } from '../api'
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
// `?mode=od-live-capture` fetch before every pulse read — folded server-side so this 20s poll now
// costs one serverless invocation per tick instead of two (the capture's own KV lock still throttles
// the actual OpenDota fetch to ~once/60s regardless of caller count, unchanged).
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
  const [heroMap, setHeroMap] = useState(null)
  // Mirrors MatchDrawer's scoreRevealed: spoiler-free hides the score/outcome-adjacent surfaces
  // behind a "Reveal score" button rather than the site-wide spoiler-free setting being the only
  // lever, same as a completed game. Reset whenever the game itself changes.
  const [scoreRevealed, setScoreRevealed] = useState(false)
  // Read once per mount rather than per render — this component re-renders on every 20s poll,
  // and the sheet remounts when reopened, which is when a preference change should take effect.
  const [streamLanguage] = useState(getStreamLanguage)

  // Called before every early return below — the tab title must keep tracking (and restoring)
  // even in the states where this component renders nothing.
  useLiveScoreTabTitle(pulse, spoilerFree)

  useEffect(() => {
    setScoreRevealed(false)
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

  if (!pulse) {
    return hasWatchLinks ? (
      <div className={`${SHEET_PADDING} py-3`}>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
          Watch Live
        </p>
        {watchLinks}
      </div>
    ) : null
  }

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

  const radiantName = pulse.radiantName || 'Radiant'
  const direName = pulse.direName || 'Dire'
  // Same contract as MatchDrawer's hideScore: spoiler-free hides the result until manually
  // revealed. Stakes/momentum/tower-map/net-worth-graph ride the same gate — they're all
  // outcome-adjacent, same as MatchDrawer's game-facts line riding its own hideScore.
  const hideScore = spoilerFree && !scoreRevealed
  const showLiveStory = !hideScore
  const stakes = showLiveStory ? computeStakes({ seriesLabel, seriesScore, teamA, teamB }) : null
  const momentum = showLiveStory
    ? computeMomentum({ radiantLead: pulse.radiantLead, gameTime: pulse.gameTime, radiantName: pulse.radiantName, direName: pulse.direName })
    : null

  function follow(name) {
    trackEvent(followedTeams?.includes(name) ? 'unfollow_team' : 'follow_team', { team_name: name, source: 'live_series_sheet' })
    onToggleFollow(name)
  }

  return (
    <div className={`${SHEET_PADDING} py-3 space-y-6`}>
      {(stakes?.kind || momentum) && (
        <div>
          {stakes?.kind && (
            <p className="mb-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
                game time {formatClock(pulse.gameTime)}
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
              <span className="font-display text-4xl font-black text-gray-900 dark:text-white">{pulse.radiantScore}</span>
              <span className="text-gray-300 dark:text-gray-700 text-2xl font-medium select-none">—</span>
              <span className="font-display text-4xl font-black text-gray-900 dark:text-white">{pulse.direScore}</span>
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

      {showLiveStory && pulse.objectives && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <DotaMinimap
            radiant={pulse.objectives.radiant}
            dire={pulse.objectives.dire}
            radiantName={pulse.radiantName}
            direName={pulse.direName}
          />
        </div>
      )}

      {showLiveStory && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <LiveGoldGraph history={pulse.history} radiantName={pulse.radiantName} direName={pulse.direName} />
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
        </div>
      )}
    </div>
  )
}

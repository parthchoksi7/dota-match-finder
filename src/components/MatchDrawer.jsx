import DraftDisplay from "./DraftDisplay"
import GoldGraph from "./GoldGraph"
import PlayerStatsSection from "./PlayerStatsSection"
import { TeamIndicators } from "./GameIndicators"
import { VOD_CHANNEL_LABELS, fetchMatchIndicators, fetchMatchStats, fetchHighlights, matchHighlightsToSeries } from "../api"
import { useEffect, useMemo, useRef, useState } from "react"
import { formatDuration, trackEvent } from "../utils"

function formatGameTime(seconds) {
  if (seconds == null || seconds < 0) return null
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

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

function MatchDrawer({
  match,
  onDismiss,
  summary,
  summaryLoading,
  summaryError,
  cachedSummary,
  onSummarize,
  copyFeedback,
  onCopyVod,
  onCopyLink,
  twitchSearchHref,
  gameNumber,
  seriesMatches,
  shareUrl,
  spoilerFree = false,
  gameSwitcher,
  followedTeams,
  onToggleFollow,
  openSource = 'unknown',
}) {
  const drawerRef = useRef(null)
  const [scoreRevealed, setScoreRevealed] = useState(false)

  const [gameIndicators, setGameIndicators] = useState(null)
  const [draftExpanded, setDraftExpanded] = useState(true)
  const [matchStats, setMatchStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [seriesHighlight, setSeriesHighlight] = useState(null)

  useEffect(() => {
    if (!match?.id || match.unplayed) return
    trackEvent('drawer_opened', {
      match_id: match.id,
      tournament: match.tournament,
      source: openSource,
      is_from_panda_score: !!match._fromPandaScore,
    })
  }, [match?.id])

  useEffect(() => {
    setScoreRevealed(false)
    setGameIndicators(null)
    setDraftExpanded(true)
    if (!match?.id || match.unplayed || spoilerFree) return
    fetchMatchIndicators([match.id]).then(map => {
      setGameIndicators(map[match.id] ?? null)
    }).catch(() => {})
  }, [match?.id, spoilerFree])

  useEffect(() => {
    setMatchStats(null)
    setStatsLoading(false)
    if (!match?.id || match._fromPandaScore || spoilerFree) return
    setStatsLoading(true)
    fetchMatchStats(match.id).then(s => {
      setMatchStats(s)
      setStatsLoading(false)
      if (s) trackEvent('match_stats_view', { match_id: match.id, tournament: match.tournament })
    }).catch(() => {
      setStatsLoading(false)
    })
  }, [match?.id, match?._fromPandaScore, spoilerFree])

  useEffect(() => {
    setSeriesHighlight(null)
    if (!match?.id || match._fromPandaScore) return
    fetchHighlights(match.tournament).then(videos => {
      setSeriesHighlight(matchHighlightsToSeries(videos, match.radiantTeam, match.direTeam, match.startTime))
    }).catch(() => {})
  }, [match?.id, match?._fromPandaScore, match?.tournament])

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onDismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDismiss])

  // Per-team indicator sets derived from the single-game gameIndicators object
  const drawerIndicatorSets = useMemo(() => {
    const rapier = new Set()
    const goldSwing = new Set()
    const megaComeback = new Set()
    const rampage = new Set()
    if (gameIndicators && match && !spoilerFree) {
      if (gameIndicators.radiantHasRapier) rapier.add(match.radiantTeam)
      if (gameIndicators.direHasRapier) rapier.add(match.direTeam)
      if (gameIndicators.goldSwingWinner === 'radiant') goldSwing.add(match.radiantTeam)
      if (gameIndicators.goldSwingWinner === 'dire') goldSwing.add(match.direTeam)
      if (gameIndicators.megaComebackWinner === 'radiant') megaComeback.add(match.radiantTeam)
      if (gameIndicators.megaComebackWinner === 'dire') megaComeback.add(match.direTeam)
      if (gameIndicators.radiantHasRampage) rampage.add(match.radiantTeam)
      if (gameIndicators.direHasRampage) rampage.add(match.direTeam)
    }
    return { rapier, goldSwing, megaComeback, rampage }
  }, [gameIndicators, match, spoilerFree])

  // Player-level rampage set — drives the per-card badge in DraftDisplay
  const rampagePlayers = useMemo(() => {
    if (!matchStats?.events || spoilerFree) return new Set()
    return new Set(matchStats.events.filter(e => e.type === 'rampage').map(e => e.player))
  }, [matchStats, spoilerFree])

  if (!match) return null

  // Unplayed game slot — show minimal drawer with empty state
  if (match.unplayed) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onDismiss}
          aria-hidden="true"
        />
        <div
          className="fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] lg:w-[520px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-slide-in"
          role="dialog"
          aria-modal="true"
          aria-label="Match details"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold truncate">
                {match.tournament}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                {match.radiantTeam} vs {match.direTeam}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-4 shrink-0 p-2 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-5 py-8">
            <div className="text-center space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Game {match.gameNumber}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                This game was not played.
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }

  const displaySummary = summary || cachedSummary
  const twitchHref = twitchSearchHref || "https://www.twitch.tv/search?term=dota%202"
  const allVods = match.allVods || (match.url ? [{ url: match.url, channel: match.channel }] : [])
  const gameLabel = gameNumber && seriesMatches > 1 ? (spoilerFree ? "Game " + gameNumber : "Game " + gameNumber + " of " + seriesMatches) : null
  const hideScore = spoilerFree && !scoreRevealed

  const radiantNameColor = (!hideScore && match.radiantWin) || hideScore
    ? 'text-gray-900 dark:text-white'
    : 'text-gray-400 dark:text-gray-500'
  const direNameColor = (!hideScore && !match.radiantWin) || hideScore
    ? 'text-gray-900 dark:text-white'
    : 'text-gray-400 dark:text-gray-500'

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onDismiss}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        className="fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] lg:w-[520px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label="Match details"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold truncate">
              {match.tournament}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400 dark:text-gray-600">
                {match.date} · {formatDuration(match.duration)}
              </p>
              {gameLabel && (
                <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {gameLabel}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-4 shrink-0 p-2 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {gameSwitcher && (
          <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden px-5 py-2.5 border-b border-gray-800 shrink-0" style={{ scrollbarWidth: 'none' }}>
            {gameSwitcher}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-5 py-5 space-y-6">

          {/* Names row — left/right anchored, single line, no separator */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-display font-black text-base sm:text-lg uppercase tracking-wide truncate ${radiantNameColor}`}>
                {match.radiantTeam}
              </span>
              {!hideScore && (
                <TeamIndicators
                  rapierTeams={drawerIndicatorSets.rapier}
                  goldSwingTeams={drawerIndicatorSets.goldSwing}
                  megaComebackTeams={drawerIndicatorSets.megaComeback}
                  rampageTeams={drawerIndicatorSets.rampage}
                  teamName={match.radiantTeam}
                />
              )}
              {onToggleFollow && !match.unplayed && (
                <button
                  type="button"
                  onClick={() => {
                    trackEvent(followedTeams?.includes(match.radiantTeam) ? 'unfollow_team' : 'follow_team', { team_name: match.radiantTeam, source: 'drawer' })
                    onToggleFollow(match.radiantTeam)
                  }}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    followedTeams?.includes(match.radiantTeam)
                      ? 'text-yellow-400'
                      : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400 dark:hover:text-yellow-400'
                  }`}
                  aria-label={followedTeams?.includes(match.radiantTeam) ? `Unfollow ${match.radiantTeam}` : `Follow ${match.radiantTeam}`}
                  title={followedTeams?.includes(match.radiantTeam) ? `Unfollow ${match.radiantTeam}` : `Follow ${match.radiantTeam}`}
                >
                  <StarIcon filled={followedTeams?.includes(match.radiantTeam)} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              {onToggleFollow && !match.unplayed && (
                <button
                  type="button"
                  onClick={() => {
                    trackEvent(followedTeams?.includes(match.direTeam) ? 'unfollow_team' : 'follow_team', { team_name: match.direTeam, source: 'drawer' })
                    onToggleFollow(match.direTeam)
                  }}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    followedTeams?.includes(match.direTeam)
                      ? 'text-yellow-400'
                      : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400 dark:hover:text-yellow-400'
                  }`}
                  aria-label={followedTeams?.includes(match.direTeam) ? `Unfollow ${match.direTeam}` : `Follow ${match.direTeam}`}
                  title={followedTeams?.includes(match.direTeam) ? `Unfollow ${match.direTeam}` : `Follow ${match.direTeam}`}
                >
                  <StarIcon filled={followedTeams?.includes(match.direTeam)} />
                </button>
              )}
              {!hideScore && (
                <TeamIndicators
                  rapierTeams={drawerIndicatorSets.rapier}
                  goldSwingTeams={drawerIndicatorSets.goldSwing}
                  megaComebackTeams={drawerIndicatorSets.megaComeback}
                  rampageTeams={drawerIndicatorSets.rampage}
                  teamName={match.direTeam}
                  tooltipAlign="right"
                />
              )}
              <span className={`font-display font-black text-base sm:text-lg uppercase tracking-wide truncate text-right ${direNameColor}`}>
                {match.direTeam}
              </span>
            </div>
          </div>

          {/* Score + game facts — grouped so they stay visually tight */}
          <div className="mt-1">
            {/* Score row — centered, standalone */}
            <div className="flex items-center justify-center gap-3">
              {hideScore ? (
                <button
                  type="button"
                  onClick={() => {
                    setScoreRevealed(true)
                    trackEvent("spoiler_reveal", { matchId: match.id, radiantTeam: match.radiantTeam, direTeam: match.direTeam })
                  }}
                  className="font-display text-sm font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Reveal score
                </button>
              ) : match._fromPandaScore && match.radiantScore == null ? (
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                  Stats pending
                </span>
              ) : (
                <>
                  <span className={`font-display text-4xl font-black ${match.radiantWin ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                    {match.radiantScore ?? (match.radiantWin ? 1 : 0)}
                  </span>
                  <span className="text-gray-300 dark:text-gray-700 text-2xl font-medium select-none">—</span>
                  <span className={`font-display text-4xl font-black ${!match.radiantWin ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                    {match.direScore ?? (!match.radiantWin ? 1 : 0)}
                  </span>
                </>
              )}
            </div>

            {/* Game facts: first blood time + Roshan kill count */}
            {!spoilerFree && !match._fromPandaScore && matchStats && (matchStats.firstBloodTime != null || matchStats.roshanKills > 0) && (
              <div className="flex items-center justify-center gap-2 mt-1.5">
                {matchStats.firstBloodTime != null && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 tabular-nums">
                    First blood {formatGameTime(matchStats.firstBloodTime)}
                  </span>
                )}
                {matchStats.firstBloodTime != null && matchStats.roshanKills > 0 && (
                  <span className="text-[10px] text-gray-300 dark:text-gray-700 select-none" aria-hidden="true">·</span>
                )}
                {matchStats.roshanKills > 0 && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 tabular-nums">
                    {matchStats.roshanKills} {matchStats.roshanKills === 1 ? 'Roshan' : 'Roshans'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Watch Full Match Replay
              </p>
              {allVods.length > 1 && (
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  Multiple channels were live — try each one to find this match.
                </p>
              )}
            </div>
            {match.loadingVod && (
              <span className="text-xs text-amber-600 dark:text-yellow-500 uppercase tracking-widest animate-pulse">
                Finding VOD...
              </span>
            )}
            {!match.loadingVod && allVods.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {allVods.map((vod, i) => {
                    const label = VOD_CHANNEL_LABELS[vod.channel] || vod.channel || "Watch on Twitch"
                    return (
                      <a
                        key={i}
                        href={vod.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackEvent("vod_click", {
                          matchId: match.id,
                          channel: vod.channel,
                          radiantTeam: match.radiantTeam,
                          direTeam: match.direTeam,
                          tournament: match.tournament,
                          spoilerFreeMode: spoilerFree,
                        })}
                        className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors"
                      >
                        {label}
                      </a>
                    )
                  })}
                </div>
                <div className="flex gap-4 pt-1">
                  <button
                    type="button"
                    onClick={onCopyVod}
                    className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2 transition-colors"
                  >
                    {copyFeedback === "vod" ? "Copied!" : "Copy VOD link"}
                  </button>
                  <button
                    type="button"
                    onClick={onCopyLink}
                    className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2 transition-colors"
                    title={shareUrl}
                  >
                    {copyFeedback === "link" ? "Copied!" : "Share match"}
                  </button>
                </div>
              </div>
            )}
            {!match.loadingVod && allVods.length === 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-widest">
                  No VOD found
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  May not be published yet or was not on a tracked channel.
                </p>
                <div className="flex gap-4 pt-1">
                  <a
                    href={twitchHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("twitch_search_click", { matchId: match.id })}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider"
                  >
                    Search Twitch
                  </a>
                  <button
                    type="button"
                    onClick={onCopyLink}
                    className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2 transition-colors"
                    title={shareUrl}
                  >
                    {copyFeedback === "link" ? "Copied!" : "Share match"}
                  </button>
                </div>
              </div>
            )}
            {seriesHighlight && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-900 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
                  Series Highlights
                </p>
                <a
                  href={`https://www.youtube.com/watch?v=${seriesHighlight.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent("highlight_click", { matchId: match.id, videoId: seriesHighlight.videoId, tournament: match.tournament })}
                  className="flex items-start gap-2 group min-h-[44px] py-1"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" aria-hidden="true">
                    <rect x="1" y="3" width="14" height="10" rx="2.5" opacity="0.25" />
                    <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    {!spoilerFree && (
                      <p className="text-xs font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-white group-hover:text-purple-400 transition-colors">
                        {seriesHighlight.title}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-purple-500 group-hover:text-purple-400 flex-shrink-0 pl-2 transition-colors">
                    Watch
                  </span>
                </a>
              </div>
            )}
          </div>

          {/* Collapsible draft section */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setDraftExpanded(v => !v)}
              className="flex items-center justify-between w-full min-h-[44px] py-1 text-left group"
              aria-expanded={draftExpanded}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                Draft
              </span>
              <svg
                viewBox="0 0 16 16"
                className={`w-4 h-4 text-gray-400 dark:text-gray-600 transition-transform duration-150 ${draftExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {draftExpanded && (
              <DraftDisplay
                key={match.id}
                matchId={match.id}
                radiantTeam={match.radiantTeam}
                direTeam={match.direTeam}
                autoLoad={true}
                spoilerFree={spoilerFree}
                rampagePlayers={rampagePlayers}
                matchStats={matchStats}
              />
            )}
          </div>

          {/* Gold advantage graph + player stats — hidden in spoiler-free mode and for PandaScore-only matches */}
          {!spoilerFree && !match._fromPandaScore && (
            <>
              <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
                  Gold Advantage
                </h3>
                <div className="-ml-5">
                  <GoldGraph
                    radiantGoldAdv={matchStats?.radiantGoldAdv}
                    radiantName={match.radiantTeam}
                    direName={match.direTeam}
                    loading={statsLoading}
                    events={matchStats?.events}
                    vodUrl={allVods[0]?.url}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
                  Player Stats
                </h3>
                <PlayerStatsSection
                  players={matchStats?.players}
                  itemNames={matchStats?.itemNames}
                  radiantName={match.radiantTeam}
                  direName={match.direTeam}
                  loading={statsLoading}
                />
              </div>
            </>
          )}

          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              AI Summary
            </p>
            <button
              type="button"
              onClick={() => onSummarize(match)}
              disabled={summaryLoading}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white text-xs font-bold uppercase tracking-widest rounded border border-gray-200 dark:border-gray-700 transition-colors"
            >
              {summaryLoading ? "Generating..." : displaySummary ? "Regenerate" : "Generate Summary"}
            </button>
            {summaryLoading && (
              <div className="h-16 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
            )}
            {summaryError && (
              <div className="p-3 rounded border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 text-sm">
                {summaryError}
              </div>
            )}
            {displaySummary && !summaryLoading && (
              <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                {displaySummary.replace(/\*\*/g, "")}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}

export default MatchDrawer

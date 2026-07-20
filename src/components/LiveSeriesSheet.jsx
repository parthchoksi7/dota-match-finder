import { useEffect, useRef, useState } from 'react'
import { fetchLiveSeriesGameIds } from '../api'
import { trackEvent } from '../utils'
import SeriesGameDraftStrip from './SeriesGameDraftStrip'
import SeriesGameIndicators from './SeriesGameIndicators'
import SeriesGameScore from './SeriesGameScore'
import SeriesLivePulse from './SeriesLivePulse'

function formatMinutes(seconds) {
  if (!seconds || isNaN(seconds)) return null
  return Math.round(seconds / 60) + 'm'
}

function PlayIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// Builds the ordered list of game tabs for the switcher: every finished game plus the
// currently running one (if any), in position order. Exported for the default-position helper.
function buildGameTabs(match) {
  const finished = (match.games || []).filter(g => g.status === 'finished')
  const running = (match.games || []).find(g => g.status === 'running')
  const tabs = finished.map(g => ({ position: g.position, kind: 'finished' }))
  if (running) tabs.push({ position: running.position, kind: 'live' })
  return tabs
}

// The "currently most relevant" tab: the running game, or the last finished one if nothing is
// running right now (a between-games gap). Recomputed fresh from whatever `match` is current -
// this is what an unpinned viewer auto-follows as the series progresses.
function defaultPosition(match) {
  const tabs = buildGameTabs(match)
  const live = tabs.find(t => t.kind === 'live')
  if (live) return live.position
  return tabs.length ? tabs[tabs.length - 1].position : null
}

// The mid-series companion: shows one game at a time (finished draft/score/indicators, or the
// currently running game's live pulse) via a chip switcher, so a fan reaches "what's happening
// now" without scrolling past every earlier game first. `initialGamePosition` lets a future
// per-game entry point open the sheet pre-scoped to a specific game; no caller passes it today.
export default function LiveSeriesSheet({ match, onDismiss, onReplay, loadingGameId, spoilerFree, initialGamePosition }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  // Recover OD match_ids for finished games the live feed returned without one, so their draft
  // strips can render.
  const [resolvedIds, setResolvedIds] = useState({})
  useEffect(() => {
    if (!match?.id) return
    let cancelled = false
    fetchLiveSeriesGameIds(match.id)
      .then(map => { if (!cancelled && map && Object.keys(map).length) setResolvedIds(map) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [match?.id])

  // `pinnedPosition` is null until the fan explicitly clicks a tab - while null, the switcher
  // auto-follows `defaultPosition` (the running game, or the last finished one) as the series
  // progresses, so a fan who never touches the switcher still gets moved onto a newly-live game
  // instead of being silently stuck viewing a game that already finished. Clicking any tab
  // (including the already-active one) pins the fan's choice and stops the auto-follow, matching
  // the earlier "don't yank the fan back to a different tab" rule for anyone who DID engage.
  const [pinnedPosition, setPinnedPosition] = useState(initialGamePosition ?? null)
  // Reset the pin only when a genuinely different series is shown under this same mounted
  // instance (e.g. a push-notification target swaps `selectedLiveSeries` mid-view) - a same-series
  // re-sync from the ambient poll must never touch it.
  const prevMatchIdRef = useRef(match.id)
  useEffect(() => {
    if (prevMatchIdRef.current !== match.id) {
      prevMatchIdRef.current = match.id
      setPinnedPosition(initialGamePosition ?? null)
    }
  }, [match.id, initialGamePosition])

  const finishedGames = (match.games || []).filter(g => g.status === 'finished')
  const currentGame = (match.games || []).find(g => g.status === 'running')
  const gameTabs = buildGameTabs(match)
  const selectedPosition = pinnedPosition ?? defaultPosition(match)

  const selectedFinishedGame = finishedGames.find(g => g.position === selectedPosition) || null
  const showLivePulse = !!currentGame && currentGame.position === selectedPosition

  // Every language/co-stream PandaScore knows about, minus whichever channel/link is already
  // shown as its own primary Watch button below (see the "all live streams" scope - additive
  // `allStreams` field on api/live-matches.js's mapMatch()). Compared case-insensitively:
  // normalizeAllStreams() (api/_shared.js) preserves the raw_url's original casing, while
  // getTwitchStreams() lowercases the channel via twitchLoginFromUrl - PandaScore is confirmed to
  // send mixed-case logins (e.g. EWC 2026's `EWC_LegionGauntlet_EN2`), so a case-sensitive
  // comparison here would fail to exclude the primary channel and double-list it.
  const primaryTwitchChannel = match.streams?.[0]?.url
    ? match.streams[0].url.replace('https://www.twitch.tv/', '').toLowerCase()
    : null
  const otherStreams = (match.allStreams || []).filter(s => {
    if (primaryTwitchChannel && s.source === 'twitch' && s.channel && s.channel.toLowerCase() === primaryTwitchChannel) return false
    if (match.youtubeStream && s.raw_url === match.youtubeStream) return false
    return true
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${match.teamA} vs ${match.teamB} series`}
        className="fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-slide-in"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Live Series</p>
            </div>
            <h2 className="font-display text-base font-black uppercase tracking-wide text-gray-900 dark:text-white truncate mt-0.5">
              {match.teamA} <span className="text-gray-400 dark:text-gray-600">vs</span> {match.teamB}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-600 truncate">{match.tournament}{match.seriesLabel ? ` · ${match.seriesLabel}` : ''}</p>
            {match.bracketRound && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mt-0.5 truncate">{match.bracketRound}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="flex-shrink-0 p-2 -mr-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Game switcher */}
        {gameTabs.length > 1 && (
          <div className="flex-shrink-0 flex gap-1.5 overflow-x-auto px-4 pt-2 pb-1 border-b border-gray-100 dark:border-gray-900" style={{ scrollbarWidth: 'none' }}>
            {gameTabs.map(tab => {
              const isActive = tab.position === selectedPosition
              return (
                <button
                  key={tab.position}
                  type="button"
                  disabled={!!loadingGameId}
                  onClick={() => {
                    setPinnedPosition(tab.position)
                    trackEvent('live_series_tab_click', { position: tab.position, status: tab.kind })
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 shadow-sm'
                      : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  {tab.kind === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />}
                  G{tab.position}
                </button>
              )
            })}
          </div>
        )}

        {/* Selected game content */}
        <div className="flex-1 overflow-y-auto py-2">
          {selectedFinishedGame && (() => {
            const game = selectedFinishedGame
            const gameMatchId = game.matchId || resolvedIds[game.position] || null
            // String() guards against `loadingGameId` (set from a click) and `gameMatchId` (may be
            // re-derived from a fresher poll response by the time this re-renders) landing on
            // different JS types for what's otherwise the same id.
            const isLoadingThis = !!loadingGameId && String(loadingGameId) === String(gameMatchId)
            const clickable = gameMatchId && onReplay && !loadingGameId
            const rowClassName = clickable
              ? 'focus-ring -mx-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
              : ''
            return (
              <div className="px-4 py-3">
                <div
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onReplay(gameMatchId) : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReplay(gameMatchId) } } : undefined}
                  aria-label={
                    isLoadingThis
                      ? `Loading Game ${game.position}`
                      : clickable
                        ? `Game ${game.position}${!spoilerFree && game.winnerName ? `, ${game.winnerName} won` : ''}, view stats and replay`
                        : undefined
                  }
                  aria-busy={isLoadingThis || undefined}
                  className={rowClassName}
                >
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-display font-black text-sm text-gray-400 dark:text-gray-600 flex-shrink-0 w-5">
                        G{game.position}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!spoilerFree && game.winnerName ? (
                            <p className="font-display font-black text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate min-w-0">
                              {game.winnerName}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400 dark:text-gray-600">Game {game.position}</p>
                          )}
                          {!spoilerFree && gameMatchId && <SeriesGameIndicators matchId={gameMatchId} />}
                        </div>
                        {!spoilerFree && (gameMatchId || game.length) && (
                          <div className="flex items-center gap-1.5">
                            {gameMatchId && <SeriesGameScore matchId={gameMatchId} />}
                            {gameMatchId && game.length && (
                              <span className="text-gray-300 dark:text-gray-700 text-[10px]" aria-hidden="true">&middot;</span>
                            )}
                            {game.length && (
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">{formatMinutes(game.length)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isLoadingThis && (
                      <span aria-live="polite" className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-yellow-500 animate-pulse">
                        Loading&hellip;
                      </span>
                    )}
                    {clickable && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">
                        <PlayIcon />
                        Replay
                      </span>
                    )}
                  </div>
                  <div className="mt-2 pl-8">
                    {gameMatchId ? (
                      <SeriesGameDraftStrip matchId={gameMatchId} />
                    ) : (
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">Stats indexing</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {showLivePulse && (
            <div>
              <div className="flex items-center gap-3 px-4 py-3 pb-0">
                <span className="font-display font-black text-sm text-gray-400 dark:text-gray-600 flex-shrink-0 w-5">
                  G{currentGame.position}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-red-500">Live</span>
                </div>
              </div>
              <SeriesLivePulse
                psMatchId={match.id}
                spoilerFree={spoilerFree}
                seriesLabel={match.seriesLabel}
                seriesScore={match.seriesScore}
                teamA={match.teamA}
                teamB={match.teamB}
                tournament={match.tournament}
                streams={match.streams}
                youtubeStream={match.youtubeStream}
                otherStreams={otherStreams}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

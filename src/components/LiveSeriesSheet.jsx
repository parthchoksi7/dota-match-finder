import { useEffect, useState } from 'react'
import { fetchLiveSeriesGameIds } from '../api'
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

// The mid-series companion: shows the completed games of an in-progress series (draft, score,
// notable-event indicators, tap-through to the full MatchDrawer) plus a live pulse (gold lead,
// kill score, live draft) for the currently running game.
export default function LiveSeriesSheet({ match, onDismiss, onReplay, loadingGameId, spoilerFree }) {
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

  const finishedGames = (match.games || []).filter(g => g.status === 'finished')
  const currentGame = (match.games || []).find(g => g.status === 'running')

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

        {/* Game rows */}
        <div className="flex-1 overflow-y-auto py-2">
          {finishedGames.map(game => {
            const gameMatchId = game.matchId || resolvedIds[game.position] || null
            // String() guards against `loadingGameId` (set from a click) and `gameMatchId` (may be
            // re-derived from a fresher poll response by the time this re-renders) landing on
            // different JS types for what's otherwise the same id.
            const isLoadingThis = !!loadingGameId && String(loadingGameId) === String(gameMatchId)
            const isDimmed = !!loadingGameId && !isLoadingThis
            const clickable = gameMatchId && onReplay && !loadingGameId
            const rowClassName = clickable
              ? 'focus-ring -mx-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
              : isDimmed
                ? '-mx-2 px-2 py-1.5 rounded transition-opacity opacity-50'
                : ''
            return (
              <div key={game.position} className="px-4 py-3 border-b border-gray-50 dark:border-gray-900 last:border-b-0">
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
          })}

          {currentGame && (
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
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

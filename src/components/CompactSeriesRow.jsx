import { useState, useEffect, useMemo } from 'react'
import { getSeriesWins, getSeriesLabel, trackEvent } from '../utils'
import { fetchMatchIndicators } from '../api'
import GameIndicators from './GameIndicators'

const PlayIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0" aria-hidden="true">
    <path d="M3 2.5a.5.5 0 0 1 .765-.424l10 5.5a.5.5 0 0 1 0 .848l-10 5.5A.5.5 0 0 1 3 13.5v-11z"/>
  </svg>
)

function CompactSeriesRow({ series, onSelectGame, onSelectSeries, spoilerFree = false, followedTeams, onToggleFollow, isGrandFinal = false, isFollowedMatch = false }) {
  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const { radiantWins, direWins } = getSeriesWins(series)
  const seriesLabel = getSeriesLabel(series.seriesType)

  const [indicatorsMap, setIndicatorsMap] = useState({})
  useEffect(() => {
    if (spoilerFree) return
    const gameIds = series.games.map(g => g.id).filter(Boolean)
    if (gameIds.length === 0) return
    fetchMatchIndicators(gameIds).then(map => {
      if (Object.keys(map).length > 0) setIndicatorsMap(map)
    }).catch(() => {})
  }, [series.id, spoilerFree])

  const seriesIndicators = useMemo(() => {
    const all = Object.values(indicatorsMap)
    if (all.length === 0) return null
    return {
      hasRapier: all.some(i => i.hasRapier),
      hasGoldSwing: all.some(i => i.hasGoldSwing),
      hasMegaComeback: all.some(i => i.hasMegaComeback),
    }
  }, [indicatorsMap])

  const lastGame = series.games[series.games.length - 1]
  const radiantWinner = !spoilerFree && radiantWins > direWins
  const direWinner = !spoilerFree && direWins > radiantWins

  function handleRowClick() {
    trackEvent('compact_row_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame(lastGame)
  }

  function handleReplayClick(e) {
    e.stopPropagation()
    trackEvent('compact_replay_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame({ ...series.games[0], _skipExpand: true })
  }

  const rowBase = `px-4 py-2.5 border-b border-gray-100 dark:border-gray-900 last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
    (isGrandFinal || isFollowedMatch) ? 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10' : ''
  }`

  return (
    <div
      role="row"
      onClick={handleRowClick}
      className={rowBase}
      aria-label={`${radiantTeam} vs ${direTeam}`}
    >

      {/* ── Mobile layout (< sm): Sofascore-style stacked rows ─────────────── */}
      <div className="sm:hidden flex flex-col gap-1">

        {/* Radiant team row */}
        <div className="flex items-center gap-1.5">
          <span className={`flex-1 min-w-0 font-display text-sm tracking-wide uppercase leading-tight ${
            radiantWinner ? 'font-black text-gray-900 dark:text-white'
            : spoilerFree ? 'font-black text-gray-900 dark:text-white'
            : 'font-bold text-gray-400 dark:text-gray-500'
          }`}>
            {radiantTeam}
          </span>
          {!spoilerFree && (
            <span className={`shrink-0 w-5 text-right font-display font-black text-xl tabular-nums ${
              radiantWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'
            }`}>
              {radiantWins}
            </span>
          )}
        </div>

        {/* Dire team row */}
        <div className="flex items-center gap-1.5">
          <span className={`flex-1 min-w-0 font-display text-sm tracking-wide uppercase leading-tight ${
            direWinner ? 'font-black text-gray-900 dark:text-white'
            : spoilerFree ? 'font-black text-gray-900 dark:text-white'
            : 'font-bold text-gray-400 dark:text-gray-500'
          }`}>
            {direTeam}
          </span>
          {!spoilerFree && (
            <span className={`shrink-0 w-5 text-right font-display font-black text-xl tabular-nums ${
              direWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'
            }`}>
              {direWins}
            </span>
          )}
        </div>

        {/* Meta row: format + indicators + replay */}
        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            {seriesLabel && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500 shrink-0">
                {seriesLabel}
              </span>
            )}
            {!spoilerFree && seriesIndicators && (
              <GameIndicators indicators={seriesIndicators} variant="compact" />
            )}
          </div>
          <button
            type="button"
            onClick={handleReplayClick}
            className="focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
            aria-label={`Watch ${radiantTeam} vs ${direTeam} replay`}
          >
            <PlayIcon />
          </button>
        </div>
      </div>

      {/* ── Desktop layout (≥ sm): horizontal 4-column grid ────────────────── */}
      <div
        className="hidden sm:grid sm:items-center sm:gap-2 sm:min-h-[36px]"
        style={{ gridTemplateColumns: '1fr 76px 1fr auto' }}
      >
        {/* Radiant team (left-aligned) */}
        <div className="flex items-center min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate ${
            radiantWinner ? 'font-black text-gray-900 dark:text-white'
            : spoilerFree ? 'font-black text-gray-900 dark:text-white'
            : 'font-bold text-gray-400 dark:text-gray-500'
          }`}>
            {radiantTeam}
          </span>
        </div>

        {/* Score block (center) */}
        <div className="flex flex-col items-center gap-0.5">
          {spoilerFree ? (
            <span className="font-display font-black text-xl text-gray-300 dark:text-gray-700 tabular-nums select-none">
              ? - ?
            </span>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`font-display font-black text-xl tabular-nums ${radiantWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {radiantWins}
              </span>
              <span className="text-sm font-medium text-gray-300 dark:text-gray-700">-</span>
              <span className={`font-display font-black text-xl tabular-nums ${direWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {direWins}
              </span>
            </div>
          )}
          {seriesLabel && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
              {seriesLabel}
            </span>
          )}
          {!spoilerFree && seriesIndicators && (
            <GameIndicators indicators={seriesIndicators} variant="compact" />
          )}
        </div>

        {/* Dire team (right-aligned) */}
        <div className="flex items-center justify-end min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate text-right ${
            direWinner ? 'font-black text-gray-900 dark:text-white'
            : spoilerFree ? 'font-black text-gray-900 dark:text-white'
            : 'font-bold text-gray-400 dark:text-gray-500'
          }`}>
            {direTeam}
          </span>
        </div>

        {/* Replay button */}
        <button
          type="button"
          onClick={handleReplayClick}
          className="focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
          aria-label={`Watch ${radiantTeam} vs ${direTeam} replay`}
        >
          <PlayIcon />
        </button>
      </div>

    </div>
  )
}

export default CompactSeriesRow

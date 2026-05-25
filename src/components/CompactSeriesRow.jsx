import { useState, useEffect, useMemo } from 'react'
import { getSeriesWins, getSeriesLabel, trackEvent } from '../utils'
import { fetchMatchIndicators } from '../api'
import { TeamIndicators } from './GameIndicators'

const PlayIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0" aria-hidden="true">
    <path d="M3 2.5a.5.5 0 0 1 .765-.424l10 5.5a.5.5 0 0 1 0 .848l-10 5.5A.5.5 0 0 1 3 13.5v-11z"/>
  </svg>
)

function CompactSeriesRow({ series, onSelectGame, onSelectSeries, spoilerFree = false, followedTeams, onToggleFollow, isGrandFinal = false, isFollowedMatch = false, bracketRound = null }) {
  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const { radiantWins, direWins } = getSeriesWins(series)
  const seriesLabel = getSeriesLabel(series.seriesType)

  const [indicatorsMap, setIndicatorsMap] = useState({})
  useEffect(() => {
    if (spoilerFree) return
    const gameIds = series.games.map(g => g.id).filter(id => id && !id.startsWith('_ps-'))
    if (gameIds.length === 0) return
    fetchMatchIndicators(gameIds).then(map => {
      if (Object.keys(map).length > 0) setIndicatorsMap(map)
    }).catch(() => {})
  }, [series.id, spoilerFree])

  // Build per-team indicator sets by mapping radiant/dire across all games to team names
  const { rapierTeams, goldSwingTeams, megaComebackTeams, rampageTeams } = useMemo(() => {
    const rapierTeams = new Set()
    const goldSwingTeams = new Set()
    const megaComebackTeams = new Set()
    const rampageTeams = new Set()
    series.games.forEach(game => {
      const ind = indicatorsMap[game.id]
      if (!ind) return
      if (ind.radiantHasRapier) rapierTeams.add(game.radiantTeam)
      if (ind.direHasRapier) rapierTeams.add(game.direTeam)
      if (ind.goldSwingWinner === 'radiant') goldSwingTeams.add(game.radiantTeam)
      if (ind.goldSwingWinner === 'dire') goldSwingTeams.add(game.direTeam)
      if (ind.megaComebackWinner === 'radiant') megaComebackTeams.add(game.radiantTeam)
      if (ind.megaComebackWinner === 'dire') megaComebackTeams.add(game.direTeam)
      if (ind.radiantHasRampage) rampageTeams.add(game.radiantTeam)
      if (ind.direHasRampage) rampageTeams.add(game.direTeam)
    })
    return { rapierTeams, goldSwingTeams, megaComebackTeams, rampageTeams }
  }, [indicatorsMap, series.games])

  const hasAnyIndicators = rapierTeams.size > 0 || goldSwingTeams.size > 0 || megaComebackTeams.size > 0 || rampageTeams.size > 0

  const lastGame = series.games[series.games.length - 1]
  const radiantWinner = !spoilerFree && radiantWins > direWins
  const direWinner = !spoilerFree && direWins > radiantWins

  const isClickable = !!(onSelectSeries || onSelectGame)

  function handleRowClick() {
    if (!isClickable) return
    trackEvent('compact_row_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame(lastGame)
  }

  function handleReplayClick(e) {
    if (!isClickable) return
    e.stopPropagation()
    trackEvent('compact_replay_click', { series_id: series.id, tournament: series.tournament })
    if (onSelectSeries) onSelectSeries(series)
    else onSelectGame({ ...series.games[0], _skipExpand: true })
  }

  const rowBase = `px-4 py-2.5 border-b border-gray-100 dark:border-gray-900 last:border-b-0 transition-colors duration-150 ${isClickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50' : ''} ${
    (isGrandFinal || isFollowedMatch) ? 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10' : ''
  }`

  const indicatorProps = { rapierTeams, goldSwingTeams, megaComebackTeams, rampageTeams }

  return (
    <div
      role="row"
      onClick={handleRowClick}
      className={rowBase}
      aria-label={`${radiantTeam} vs ${direTeam}`}
    >

      {/* ── Mobile layout (< sm): two-row compact ───────────────────────────── */}
      <div className="sm:hidden flex flex-col gap-0.5">

        {/* Row 1: both teams + score on one line */}
        <div className="flex items-center gap-1.5 min-w-0">

          {/* Radiant side — left-aligned, truncates */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className={`truncate font-display text-sm tracking-wide uppercase leading-tight ${
              radiantWinner ? 'font-black text-gray-900 dark:text-white'
              : spoilerFree ? 'font-black text-gray-900 dark:text-white'
              : 'font-bold text-gray-400 dark:text-gray-500'
            }`}>
              {radiantTeam}
            </span>
            {!spoilerFree && hasAnyIndicators && (
              <TeamIndicators {...indicatorProps} teamName={radiantTeam} />
            )}
          </div>

          {/* Score — fixed center */}
          <div className="flex items-center flex-shrink-0">
            {spoilerFree ? (
              <span className="font-display font-black text-base text-gray-300 dark:text-gray-700 tabular-nums select-none">?·?</span>
            ) : (
              <>
                <span className={`font-display font-black text-lg tabular-nums ${radiantWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                  {radiantWins}
                </span>
                <span className="text-xs font-medium text-gray-300 dark:text-gray-700 mx-0.5">-</span>
                <span className={`font-display font-black text-lg tabular-nums ${direWinner ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                  {direWins}
                </span>
              </>
            )}
          </div>

          {/* Dire side — right-aligned, truncates */}
          <div className="flex items-center justify-end gap-1 min-w-0 flex-1">
            {!spoilerFree && hasAnyIndicators && (
              <TeamIndicators {...indicatorProps} teamName={direTeam} tooltipAlign="right" />
            )}
            <span className={`truncate text-right font-display text-sm tracking-wide uppercase leading-tight ${
              direWinner ? 'font-black text-gray-900 dark:text-white'
              : spoilerFree ? 'font-black text-gray-900 dark:text-white'
              : 'font-bold text-gray-400 dark:text-gray-500'
            }`}>
              {direTeam}
            </span>
          </div>
        </div>

        {/* Row 2: format label + replay button */}
        <div className="flex items-center justify-between">
          {seriesLabel ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500">
              {seriesLabel}
            </span>
          ) : <span />}
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
        {/* Radiant team + indicators (left-aligned) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate ${
            radiantWinner ? 'font-black text-gray-900 dark:text-white'
            : spoilerFree ? 'font-black text-gray-900 dark:text-white'
            : 'font-bold text-gray-400 dark:text-gray-500'
          }`}>
            {radiantTeam}
          </span>
          {!spoilerFree && hasAnyIndicators && (
            <TeamIndicators {...indicatorProps} teamName={radiantTeam} />
          )}
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
        </div>

        {/* Dire team + indicators (right-aligned) */}
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          {!spoilerFree && hasAnyIndicators && (
            <TeamIndicators {...indicatorProps} teamName={direTeam} tooltipAlign="right" />
          )}
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

      {bracketRound && (
        <p className="px-4 pb-1 -mt-0.5 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-600">
          {bracketRound}
        </p>
      )}
    </div>
  )
}

export default CompactSeriesRow

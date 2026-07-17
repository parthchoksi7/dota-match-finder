// Shared score-row shape for the live-series companion: team name (left) + score (right), with
// an optional gold-lead badge. Used by both SeriesLivePulse (live game, no winner yet) and
// SeriesGameScore (finished game, true winner/loser) so the two states read as one system.
//
// `winner`: true = winner styling (DESIGN_GUIDELINES "Match cards — winner/loser state"), false =
// loser styling, undefined = neutral (live, no result yet — matches the prior live-pulse look).
export default function SeriesScoreRow({ name, score, winner, leadLabel, leadColor }) {
  const nameClass = winner === true
    ? 'font-black text-gray-900 dark:text-white'
    : winner === false
      ? 'font-bold text-gray-400 dark:text-gray-500'
      : 'font-bold text-gray-700 dark:text-gray-300'
  const scoreClass = winner === false
    ? 'font-black text-gray-400 dark:text-gray-500'
    : 'font-black text-gray-900 dark:text-white'

  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className={`font-display text-xs uppercase tracking-wide truncate min-w-0 ${nameClass}`}>
        {name}
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        {leadLabel && (
          <span className="flex flex-col items-end leading-none" aria-label={`${name} leads by ${leadLabel} gold`}>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: leadColor }}>{leadLabel}</span>
            <span className="text-[7px] font-bold uppercase tracking-wide" style={{ color: leadColor }}>Gold</span>
          </span>
        )}
        {score != null && (
          <span className={`font-display text-sm tabular-nums w-4 text-right ${scoreClass}`}>{score}</span>
        )}
      </span>
    </div>
  )
}

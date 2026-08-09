import { useEffect, useRef } from 'react'
import { trackEvent, isGrandFinal } from '../utils'
import { computeStakes } from '../utils/momentum'
import { TwitchIcon, YouTubeIcon } from './PlatformIcons'

// Live "worth watching" feed-row badge (`.claude/specs/live-worth-watching-signal-spec.md`).
// PUBLIC as of 2026-08-03 — `match.signal` is present on every live-matches response
// (api/live-matches.js's live-signal enrichment, gated only by the `feature:live-signal` KV kill
// switch, not by viewer identity).
//
// Two suppressions were added on top of the spec during a pre-build critique
// (/dota_data_scientist + /dota_analyst + /dota_pm, 2026-08-01), both scoped to ONE_SIDED only —
// CLOSE/SWINGING are a positive "come watch this" read and are never suppressed:
//   - A followed team's row never gets the recessive "deprioritize" treatment. The badge has no
//     notion of followedTeams (a per-viewer preference, same boundary as spoilerFree below), and a
//     partisan fan watching their own team behind is often MORE invested, not less.
//   - Grand Finals and BO3/BO5 deciders never get it either. A lopsided score in a decider is
//     still appointment viewing (career-defining performances, tournament narrative closure) —
//     the net-worth gap is real, but "deprioritize this row" is the wrong read for the single
//     highest-stakes game type this product covers.
const BADGE_COPY = {
  SWINGING: { label: 'SWINGING', ariaLabel: 'Current game has a big momentum swing' },
  CLOSE: { label: 'CLOSE', ariaLabel: 'Current game is close' },
  ONE_SIDED: { label: 'ONE-SIDED', ariaLabel: 'Current game is one-sided' },
}

function LiveMatchRow({ match, onSelectMatchId, onSelectLiveMatch, spoilerFree, isFollowedMatch, isHighlighted = false }) {
  const hasScore = match.seriesScore && match.seriesScore !== '0-0'
  const [scoreA, scoreB] = hasScore ? match.seriesScore.split('-').map(Number) : [0, 0]

  const isDeciderOrGrandFinal = isGrandFinal(match.bracketRound) || computeStakes({
    seriesLabel: match.seriesLabel, seriesScore: match.seriesScore, teamA: match.teamA, teamB: match.teamB,
  }).kind === 'DECIDER'
  const rawSignal = match.signal || null
  const signal = spoilerFree ? null
    : (rawSignal === 'ONE_SIDED' && (isFollowedMatch || isDeciderOrGrandFinal)) ? null
    : rawSignal
  const badge = signal ? BADGE_COPY[signal] : null

  // Push-notification landing: scroll the targeted row into view. The ring below fades
  // out via transition-shadow when App clears the highlight after a few seconds.
  const rootRef = useRef(null)
  useEffect(() => {
    if (isHighlighted && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  const watchUrl = match.streams?.[0]?.url || null
  const watchLabel = match.streams?.[0]?.label || null

  const amberStyle = 'border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10'
  const redStyle = 'border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/10'

  // hasScore is no longer required to open the row: the companion's live pulse (draft/score/
  // Live Story) renders fine before any game has been decided, so a fresh 0-0 series is openable
  // too — hasScore-only was a leftover from before the companion had anything worth showing then.
  const isClickable = !!onSelectLiveMatch

  // Only expand when the keypress originates from this element, not a child link (watch buttons) —
  // same guard MatchCard.jsx's handleExpandKeyDown uses for its own div[role="button"] row.
  function handleRowKeyDown(e) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectLiveMatch(match.id)
    }
  }

  const hasSubRow = match.currentGame || match.bracketRound || watchUrl || match.youtubeStream || badge

  // The centered sub-row label must not sit under the mobile-only (sm:hidden) 44px watch
  // buttons at the row's right edge. Reserved width scales with how many can render at once
  // (Twitch + YouTube can both exist for the same live match) — sized for the 44px touch
  // target, unlike the desktop text-label buttons which don't need the same clearance.
  const mobileWatchButtonCount = (watchUrl ? 1 : 0) + (match.youtubeStream ? 1 : 0)
  // 0 buttons → only the small aria-hidden placeholder renders (unchanged 28px), so the
  // original reservation still applies; 1/2 buttons need the wider 44px-button clearance.
  const subRowLabelMaxWidth = mobileWatchButtonCount >= 2
    ? 'max-w-[calc(100%-14rem)]'
    : mobileWatchButtonCount === 1
    ? 'max-w-[calc(100%-8rem)]'
    : 'max-w-[calc(100%-3.5rem)]'

  return (
    <div
      ref={rootRef}
      onClick={() => { if (isClickable) onSelectLiveMatch(match.id) }}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? handleRowKeyDown : undefined}
      aria-label={isClickable ? `View live match details: ${match.teamA} vs ${match.teamB}` : undefined}
      className={`border-b border-gray-100 dark:border-gray-900 last:border-b-0 transition-shadow duration-700 ${
        isFollowedMatch ? amberStyle : redStyle
      } ${isHighlighted ? 'ring-2 ring-inset ring-amber-400 dark:ring-amber-500' : ''} ${isClickable ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] focus-ring' : ''}`}
    >
      {/* Main row: Team A · Score · Team B · chevron (clickable-row affordance — otherwise nothing
          on the row itself signals it opens live match details, especially on mobile where there's
          no hover state to discover it). */}
      <div
        className="grid items-center gap-2 px-4 pt-2.5 pb-1 min-h-[40px]"
        style={{ gridTemplateColumns: isClickable ? '1fr auto 1fr auto' : '1fr auto 1fr' }}
      >
        {/* Team A (left) */}
        <div className="flex items-center min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate font-black ${
            !spoilerFree && hasScore && scoreA < scoreB
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-900 dark:text-white'
          }`}>
            {match.teamA}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1 shrink-0">
          {hasScore && !spoilerFree ? (
            <>
              <span className={`font-display font-black text-xl tabular-nums ${scoreA > scoreB ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {scoreA}
              </span>
              <span className="text-sm font-medium text-gray-300 dark:text-gray-700">-</span>
              <span className={`font-display font-black text-xl tabular-nums ${scoreB > scoreA ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                {scoreB}
              </span>
            </>
          ) : hasScore && spoilerFree ? (
            <span className="font-display font-black text-xl text-gray-300 dark:text-gray-700 tabular-nums select-none">?·?</span>
          ) : (
            <span className="font-display font-black text-base text-gray-400 dark:text-gray-600 select-none">vs</span>
          )}
        </div>

        {/* Team B (right) */}
        <div className="flex items-center justify-end min-w-0">
          <span className={`font-display text-sm tracking-wide uppercase truncate text-right font-black ${
            !spoilerFree && hasScore && scoreB < scoreA
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {match.teamB}
          </span>
        </div>

        {isClickable && (
          <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* Sub-row: G{n} · bracket stage (centered) + watch button (right) */}
      {hasSubRow && (
        <div className="relative flex items-center px-4 pb-2.5 min-h-[44px] sm:min-h-[28px]">
          {(match.currentGame || match.bracketRound || badge) && (
            <span className={`absolute left-1/2 -translate-x-1/2 ${subRowLabelMaxWidth} sm:max-w-[calc(100%-3.5rem)] flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap overflow-hidden`}>
              {match.currentGame && (
                <>
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                  <span className="font-bold text-red-500">G{match.currentGame}</span>
                </>
              )}
              {match.currentGame && Number.isFinite(match.gameTime) && match.gameTime >= 0 && (
                <>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="text-gray-500 dark:text-gray-500">{Math.round(match.gameTime / 60)}m</span>
                </>
              )}
              {/* "the next visible thing" is always either bracketRound or the badge, on every
                  viewport (see the mobile-yield rule below), so this separator never needs its
                  own breakpoint class. */}
              {match.currentGame && (match.bracketRound || badge) && (
                <span className="text-gray-300 dark:text-gray-700">·</span>
              )}
              {match.bracketRound && (
                // Mobile yield rule (spec UX "Mobile (375px first)"): when a badge is present,
                // bracketRound is the least-actionable of the three tokens (the tournament card
                // header above already establishes event context) and yields to it below `sm:`.
                <span className={`text-gray-500 dark:text-gray-500 ${badge ? 'hidden sm:inline' : ''}`}>
                  {match.bracketRound}
                </span>
              )}
              {match.bracketRound && badge && (
                <span className="hidden sm:inline text-gray-300 dark:text-gray-700">·</span>
              )}
              {badge && (
                <span
                  aria-label={badge.ariaLabel}
                  className={`font-bold ${signal === 'ONE_SIDED' ? 'text-gray-500 dark:text-gray-500' : 'text-red-500'}`}
                >
                  {badge.label}
                </span>
              )}
            </span>
          )}

          {/* Watch buttons */}
          {watchUrl || match.youtubeStream ? (
            <div className="flex items-center gap-1 ml-auto">
              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch', { channel: watchLabel, teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="sm:hidden focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on Twitch`}
                >
                  <TwitchIcon />
                </a>
              )}
              {match.youtubeStream && (
                <a
                  href={match.youtubeStream}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch_youtube', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="sm:hidden focus-ring flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on YouTube`}
                >
                  <YouTubeIcon />
                </a>
              )}
              {watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch', { channel: watchLabel, teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on Twitch`}
                >
                  <TwitchIcon />
                  Watch{watchLabel ? ` · ${watchLabel}` : ''}
                </a>
              )}
              {match.youtubeStream && (
                <a
                  href={match.youtubeStream}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => {
                    e.stopPropagation()
                    trackEvent('live_match_watch_youtube', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
                  }}
                  className="hidden sm:inline-flex focus-ring flex-shrink-0 items-center justify-center w-7 h-7 rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors"
                  aria-label={`Watch ${match.teamA} vs ${match.teamB} on YouTube`}
                >
                  <YouTubeIcon />
                </a>
              )}
            </div>
          ) : (
            <div className="ml-auto w-7 h-7" aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  )
}

export default LiveMatchRow

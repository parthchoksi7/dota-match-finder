import { trackEvent } from '../utils'

// Sticky "Now Watching" bar (pending-refactors #10). Shows once a match's drawer has been
// closed, so its Watch action stays reachable while the fan keeps scrolling the match list —
// without reopening the full drawer (which brings back its blocking backdrop). Fully separate
// from the VOD Replay System itself: it only ever reads `match.allVods`, already resolved by
// the time the drawer closed (see resolveMatchStreams in App.jsx) — no re-resolution happens
// here.
export default function NowWatchingBar({ match, spoilerFree, onReopen, onDismiss }) {
  if (!match) return null

  const vod = match.allVods?.[0]
  const hasScore = !spoilerFree && match.radiantScore != null && match.direScore != null
  const radiantWinner = hasScore && match.radiantWin
  const direWinner = hasScore && match.radiantWin === false

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-3xl mx-auto px-4 py-2 min-h-[44px] flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            trackEvent('now_watching_bar_reopen', { matchId: match.id })
            onReopen()
          }}
          className="focus-ring flex-1 min-w-0 flex items-center gap-2 text-left rounded"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 shrink-0">
            Now Viewing
          </span>
          <span className="min-w-0 flex items-center gap-1.5 font-display font-black text-sm uppercase tracking-wide truncate">
            <span className={radiantWinner || !hasScore ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
              {match.radiantTeam}
            </span>
            <span className="text-gray-300 dark:text-gray-700 font-normal normal-case">vs</span>
            <span className={direWinner || !hasScore ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
              {match.direTeam}
            </span>
          </span>
        </button>

        {vod && (
          <a
            href={vod.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('now_watching_bar_watch_click', { matchId: match.id, channel: vod.channel })}
            className="focus-ring flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-700 hover:bg-purple-800 text-white transition-colors whitespace-nowrap"
          >
            Watch
          </a>
        )}

        <button
          type="button"
          onClick={() => {
            trackEvent('now_watching_bar_dismiss', { matchId: match.id })
            onDismiss()
          }}
          aria-label="Dismiss now viewing bar"
          className="focus-ring flex-shrink-0 p-2 -m-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

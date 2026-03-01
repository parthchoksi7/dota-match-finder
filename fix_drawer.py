code = '''import DraftDisplay from "./DraftDisplay"
import { VOD_CHANNEL_LABELS } from "../api"
import { useEffect, useRef } from "react"

function WatchButton({ url, channel }) {
  const label = channel
    ? "Watch on Twitch (" + (VOD_CHANNEL_LABELS[channel] || channel) + ")"
    : "Watch on Twitch"
  const href = url
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors">
      {label}
    </a>
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
}) {
  const drawerRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onDismiss()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDismiss])

  if (!match) return null

  const displaySummary = summary || cachedSummary
  const twitchHref = twitchSearchHref || "https://www.twitch.tv/search?term=dota%202"

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
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
              {match.date} · {match.duration}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-4 shrink-0 p-2 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          <div className="flex items-center justify-between gap-2">
            <span className={"font-display text-lg font-black uppercase tracking-wide truncate " + (match.radiantWin ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
              {match.radiantTeam}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className={"font-display text-3xl font-black " + (match.radiantWin ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
                {match.radiantScore ?? (match.radiantWin ? 1 : 0)}
              </span>
              <span className="text-gray-400 dark:text-gray-700 text-xl">-</span>
              <span className={"font-display text-3xl font-black " + (!match.radiantWin ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
                {match.direScore ?? (!match.radiantWin ? 1 : 0)}
              </span>
            </div>
            <span className={"font-display text-lg font-black uppercase tracking-wide truncate text-right " + (!match.radiantWin ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500")}>
              {match.direTeam}
            </span>
          </div>

          <DraftDisplay
            matchId={match.id}
            radiantTeam={match.radiantTeam}
            direTeam={match.direTeam}
            autoLoad={true}
          />

          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Watch
            </p>
            {match.loadingVod && (
              <span className="text-xs text-amber-600 dark:text-yellow-500 uppercase tracking-widest animate-pulse">
                Finding VOD...
              </span>
            )}
            {!match.loadingVod && match.url && (
              <div className="flex flex-wrap gap-2">
                <WatchButton url={match.url} channel={match.channel} />
                <button
                  type="button"
                  onClick={onCopyVod}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  {copyFeedback === "vod" ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={onCopyLink}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                >
                  {copyFeedback === "link" ? "Copied!" : "Share match"}
                </button>
              </div>
            )}
            {!match.loadingVod && !match.url && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-500 uppercase tracking-widest">
                  No VOD found
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  May not be published yet or was not on a tracked channel.
                </p>
                <a href={twitchHref} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider">
                  Search Twitch
                </a>
              </div>
            )}
          </div>

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
                {displaySummary.replace(/\\*\\*/g, "")}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}

export default MatchDrawer
'''

with open('src/components/MatchDrawer.jsx', 'w') as f:
    f.write(code)

print('Done!')

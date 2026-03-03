import DraftDisplay from "./DraftDisplay"
import { VOD_CHANNEL_LABELS } from "../api"
import { useEffect, useRef } from "react"
import { track } from "@vercel/analytics"

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
  const allVods = match.allVods || (match.url ? [{ url: match.url, channel: match.channel }] : [])
  const gameLabel = gameNumber && seriesMatches > 1 ? "Game " + gameNumber + " of " + seriesMatches : null

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
                {match.date} · {match.duration}
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
            {!match.loadingVod && allVods.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {allVods.map((vod, i) => {
                    const label = VOD_CHANNEL_LABELS[vod.channel] || vod.channel || "Watch on Twitch"
                    const href = vod.url
                    return (
                      <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                        onClick={() => track("vod_click", { matchId: match.id, channel: vod.channel, radiantTeam: match.radiantTeam, direTeam: match.direTeam, tournament: match.tournament })}
                        className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors">
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
                  <a href={twitchHref} target="_blank" rel="noopener noreferrer"
                    onClick={() => track("twitch_search_click", { matchId: match.id })}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider">
                    Search Twitch
                  </a>
                  <button
                    type="button"
                    onClick={onCopyLink}
                    className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2 transition-colors"
                  >
                    {copyFeedback === "link" ? "Copied!" : "Share match"}
                  </button>
                </div>
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

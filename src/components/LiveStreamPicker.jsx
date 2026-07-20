import { useState } from "react"
import { streamLabel } from "./StreamPicker"
import { trackEvent } from "../utils"

// Sibling to StreamPicker (VOD/replay) for the Live Series Companion. Every row here is
// "watch live now" - no deep_link/from-stream-start concept applies, since there is no VOD
// timestamp yet (see DESIGN_GUIDELINES "two distinct shapes for two distinct states").
function LiveStreamRow({ stream, matchId }) {
  const label = streamLabel({ ...stream, url: stream.raw_url })
  const lang = stream.language ? stream.language.toUpperCase() : null
  const ariaLabel = `Watch live${lang ? ` in ${lang}` : ""} on ${label}` +
    (stream.official === false ? ", co-stream" : "")
  return (
    <a
      href={stream.raw_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      onClick={() => trackEvent("live_match_watch", {
        matchId,
        channel: stream.channel,
        language: stream.language,
        official: stream.official,
        source: "live_series_sheet",
        from_picker: true,
      })}
      className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
      {lang && (
        <span className="flex-shrink-0 px-1 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-500">
          {lang}
        </span>
      )}
      <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 truncate">{label}</span>
      {stream.official === false && (
        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600">
          Co-stream
        </span>
      )}
    </a>
  )
}

/**
 * Multi-language/co-stream list for the currently live game inside the Live Series Companion.
 * Renders alongside the primary Twitch/YouTube watch buttons: a single extra stream inline,
 * two or more behind a collapsed count pill. Mirrors StreamPicker's render-mode rules exactly.
 */
export default function LiveStreamPicker({ streams, matchId }) {
  const [expanded, setExpanded] = useState(false)
  if (!streams || streams.length === 0) return null

  if (streams.length === 1) {
    return <LiveStreamRow stream={streams[0]} matchId={matchId} />
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          const next = !expanded
          setExpanded(next)
          if (next) trackEvent("live_stream_picker_expand", { matchId, count: streams.length })
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 min-h-[32px] rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 tabular-nums">
          {streams.length} more streams
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {streams.map((s, i) => (
            <LiveStreamRow key={`${s.channel || s.raw_url}-${i}`} stream={s} matchId={matchId} />
          ))}
        </div>
      )}
    </div>
  )
}

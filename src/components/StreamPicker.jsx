import { useState } from "react"
import { VOD_CHANNEL_LABELS } from "../api"
import { trackEvent } from "../utils"

function streamLabel(stream) {
  return VOD_CHANNEL_LABELS[stream.channel] || stream.channel || (stream.source === "youtube" ? "YouTube" : "Twitch")
}

function StreamRow({ stream, matchId }) {
  const label = streamLabel(stream)
  const lang = stream.language ? stream.language.toUpperCase() : null
  const ariaLabel = `Watch${lang ? ` in ${lang}` : ""} on ${label}` +
    (stream.official === false ? ", co-stream" : "") +
    (stream.deep_link ? "" : ", from stream start")
  return (
    <a
      href={stream.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      onClick={() => trackEvent("vod_click", {
        matchId,
        channel: stream.channel,
        language: stream.language,
        official: stream.official,
        kind: stream.kind,
        from_picker: true,
      })}
      className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
    >
      {lang && (
        <span className="flex-shrink-0 px-1 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-500">
          {lang}
        </span>
      )}
      {stream.deep_link && (
        <svg className="w-3 h-3 flex-shrink-0 text-purple-700 dark:text-purple-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M3 1.5l7 4.5-7 4.5z" />
        </svg>
      )}
      <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 truncate">{label}</span>
      {stream.official === false && (
        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600">
          Co-stream
        </span>
      )}
      {!stream.deep_link && (
        <span className="ml-auto flex-shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-600">
          From stream start
        </span>
      )}
    </a>
  )
}

/**
 * Multi-language stream list for the match drawer's replay section. Renders the
 * non-primary streams recorded for a game: a single extra stream inline, two or
 * more behind a collapsed count pill. The primary official stream stays in the
 * existing purple VOD button above — this component never renders it.
 */
export default function StreamPicker({ streams, matchId }) {
  const [expanded, setExpanded] = useState(false)
  if (!streams || streams.length === 0) return null

  if (streams.length === 1) {
    return <StreamRow stream={streams[0]} matchId={matchId} />
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          const next = !expanded
          setExpanded(next)
          if (next) trackEvent("stream_picker_expand", { matchId, count: streams.length })
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
            <StreamRow key={`${s.channel || s.url}-${i}`} stream={s} matchId={matchId} />
          ))}
        </div>
      )}
    </div>
  )
}

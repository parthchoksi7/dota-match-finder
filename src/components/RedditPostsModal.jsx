import { useState, useEffect, useRef } from "react"

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors focus-ring"
      style={copied
        ? { borderColor: '#16a34a', color: '#16a34a' }
        : { borderColor: 'rgb(209 213 219)', color: 'rgb(107 114 128)' }
      }
    >
      {copied ? "Copied!" : label}
    </button>
  )
}

function RedditPostsModal({ open, onClose, series, matchPost, dayComment, loading, error }) {
  const overlayRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()

    function onKeyDown(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const team1 = series?.games?.[0]?.radiantTeam
  const team2 = series?.games?.[0]?.direTeam
  const title = team1 && team2 ? `${team1} vs ${team2}` : "Series"

  const fullPost = matchPost
    ? `${matchPost.title}\n\n${matchPost.body}`
    : ""

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Draft Reddit posts"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 sm:rounded shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold">
              Draft Reddit posts
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 truncate">
              {title}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 p-2 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-ring"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">
                Generating posts...
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && matchPost && (
            <div className="border border-amber-200 dark:border-amber-900/50 rounded p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  VOD Roundup Post
                </span>
                <CopyButton text={fullPost} label="Copy post" />
              </div>

              {/* Title row */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-600 font-semibold">
                    Title
                  </span>
                  <CopyButton text={matchPost.title} label="Copy title" />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed font-medium">
                  {matchPost.title}
                </p>
              </div>

              <div className="border-t border-amber-100 dark:border-amber-900/30" />

              {/* Body */}
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-600 font-semibold">
                  Body
                </span>
                <p className="text-sm text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                  {matchPost.body}
                </p>
              </div>
            </div>
          )}

          {!loading && !error && dayComment && (
            <div className="border border-gray-200 dark:border-gray-800 rounded p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Match Thread Comment
                </span>
                <CopyButton text={dayComment} />
              </div>
              <p className="text-sm text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                {dayComment}
              </p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        {!loading && !error && matchPost && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center">
              Copy title into Reddit's Title field - body into the text box - comment pastes directly
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default RedditPostsModal

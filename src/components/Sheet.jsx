import { useEffect } from 'react'

// The right-anchored modal panel shared by every sheet-style overlay: full-viewport backdrop,
// sliding panel, and Escape-to-close.
//
// Extracted from `MatchDrawer` and `LiveSeriesSheet`, which had independently hand-coded a
// byte-identical backdrop and panel (down to the same z-indexes, blur, border, and shadow) plus
// their own copies of the same Escape keydown effect — differing only in panel width and
// aria-label. A third overlay would have made it three copies.
//
// What deliberately stays with the caller: the header (title block + its close button) and the
// body content. Both MatchDrawer and LiveSeriesSheet now use the same "✕" glyph close-button
// treatment (unified 2026-07-30), but the header layout/copy still legitimately differs per
// sheet, so it isn't folded into this shared shell.
//
// App.jsx (2026-07-30) is the sole call site for both: a single host <Sheet> wraps whichever of
// MatchDrawer/LiveSeriesSheet is active, so switching between them (e.g. tapping a finished game
// inside a live series) swaps the inner content instead of unmounting/remounting this whole
// panel — that used to replay the slide-in as a visible close-then-reopen flash.
//
// Motion: `animate-slide-in` is entrance-only. There is no exit animation, by design — the panel
// unmounts immediately on dismiss. React would need the unmount deferred to play one, and the
// drawer slide-in is the product's single signature motion (see DESIGN_GUIDELINES "Motion &
// Animation"); a competing exit animation is not wanted. Preserve this behavior. Since the host
// now stays mounted across a live<->drawer swap, that slide-in only replays on a genuine sheet
// open/close, not on a content swap — the swap itself gets a lighter cross-fade
// (`animate-sheet-content-fade`) applied by the caller (App.jsx), not by this shell.
//
// SHEET_WIDTH / SHEET_PADDING are the canonical match-sheet shell contract (pending-refactors
// #4 — MatchDrawer and LiveSeriesSheet had independently picked their own width and a flat
// (non-responsive) padding, so the two panels drifted apart on desktop/tablet). Both callers
// import these instead of hardcoding their own values so a third sheet can't reintroduce the
// drift. `widthClassName` still defaults to the shared width but can be overridden if a future
// sheet genuinely needs a different size.
export const SHEET_WIDTH = "sm:w-[480px] lg:w-[520px]"
export const SHEET_PADDING = "px-4 sm:px-5"

export default function Sheet({ onDismiss, ariaLabel, widthClassName = SHEET_WIDTH, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <>
      {/* Backdrop — click-to-dismiss, and aria-hidden so AT never announces it as content */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onDismiss}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`fixed top-0 right-0 z-50 h-full w-full ${widthClassName} bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-slide-in`}
      >
        {children}
      </div>
    </>
  )
}

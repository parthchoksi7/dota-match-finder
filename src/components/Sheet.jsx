import { useEffect } from 'react'

// The right-anchored modal panel shared by every sheet-style overlay: full-viewport backdrop,
// sliding panel, and Escape-to-close.
//
// Extracted from `MatchDrawer` and `LiveSeriesSheet`, which had independently hand-coded a
// byte-identical backdrop and panel (down to the same z-indexes, blur, border, and shadow) plus
// their own copies of the same Escape keydown effect — differing only in panel width and
// aria-label. A third overlay would have made it three copies.
//
// What deliberately stays with the caller: the header (title block + its close button). The two
// existing sheets style their close affordance differently (a "✕" glyph vs. an SVG icon, with
// different hover colors), and unifying those is a design decision, not a DRY cleanup — folding
// them in here would have changed pixels at both call sites.
//
// Motion: `animate-slide-in` is entrance-only. There is no exit animation, by design — the panel
// unmounts immediately on dismiss. React would need the unmount deferred to play one, and the
// drawer slide-in is the product's single signature motion (see DESIGN_GUIDELINES "Motion &
// Animation"); a competing exit animation is not wanted. Preserve this behavior.
export default function Sheet({ onDismiss, ariaLabel, widthClassName, children }) {
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

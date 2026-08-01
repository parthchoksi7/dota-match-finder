import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * FloatingTooltip — the shared surface + geometry for everything in the app's floating layer
 * (tooltips, hover cards, popovers).
 *
 * Extracted per pending-refactors #15. Before this, 7 call sites hand-rolled their own floating
 * card and had drifted to three radii (`rounded`/`rounded-md`/`rounded-lg`) and three shadows
 * (`shadow-lg`/`shadow-xl`/`shadow-2xl`) for what is visually one layer. `Sheet.jsx`'s header
 * comment documents the same failure mode happening one level up, at the drawer/backdrop level.
 *
 * There are deliberately TWO surfaces, not one — this is a real distinction, not residual drift:
 *
 *   TOOLTIP_SURFACE  a dark chip in BOTH themes, for transient hover readouts floating over
 *                    dense content (graph crosshairs, item icons, indicator chips). This is the
 *                    standard sports-UI treatment and is what all of those sites already did.
 *   TOOLTIP_PANEL    theme-aware, matching the card system, for click-opened informational
 *                    popovers carrying body copy or links.
 *
 * Both share one radius/shadow pair, so a new floating element only has to pick a surface.
 * Floating elements are the documented exception to the "no box-shadow except drawer" rule —
 * elevation is what makes them read as above the page. See DESIGN_GUIDELINES.md.
 */

/** Keep-on-screen margin for viewport clamping. */
export const TOOLTIP_EDGE_MARGIN = 8

/** The single radius + shadow pair for the whole floating layer. */
const TOOLTIP_SHAPE = 'rounded-md shadow-xl'

/** Inverted surface — dark chip regardless of theme. For transient hover readouts. */
export const TOOLTIP_SURFACE =
  `bg-gray-900 dark:bg-gray-950 border border-gray-700 dark:border-gray-800 text-white ${TOOLTIP_SHAPE}`

/** Panel surface — theme-aware, matches the card system. For click-opened popovers. */
export const TOOLTIP_PANEL =
  `bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 ${TOOLTIP_SHAPE}`

/**
 * Nominal width of the compact graph-scrub readout, used only as the clamp width. The card is
 * sized by its content, so this is an upper estimate — clamping slightly early is invisible,
 * while clamping late would let it clip at a screen edge.
 */
export const SCRUB_TOOLTIP_WIDTH = 200

/**
 * Clamps a desired left edge so a `width`-wide floating element stays fully on screen.
 * Replaces four hand-inlined variants of this same Math.max/Math.min sandwich.
 */
export function clampLeft(left, width, margin = TOOLTIP_EDGE_MARGIN) {
  if (typeof window === 'undefined') return left
  // max() last so a viewport narrower than the element still pins to the left edge rather
  // than going negative.
  return Math.max(margin, Math.min(window.innerWidth - width - margin, left))
}

/** Clamps a desired top edge so a floating element doesn't run off the top of the viewport. */
export function clampTop(top, margin = TOOLTIP_EDGE_MARGIN) {
  return Math.max(margin, top)
}

const ALIGN_CLASSES = {
  left: 'left-0',
  right: 'right-0',
  center: 'left-1/2 -translate-x-1/2',
}

/**
 * Hover-delayed card anchored above its trigger.
 *
 * Owns the open/close timers (a show delay so a mouse crossing a dense item row doesn't strobe
 * tooltips, a shorter hide delay so travel onto the card itself doesn't dismiss it), the
 * invisible hover bridge that makes that travel possible, and the surface. Both item-hover
 * cards (`ItemSlot`, `PlayerStatsSection`'s `ConsumedUpgrade`) had independently hand-rolled
 * byte-identical copies of all of it.
 *
 * @param {object}          props
 * @param {React.ReactNode} props.content    Tooltip body, rendered inside the surface.
 * @param {React.ReactNode} props.children   The trigger.
 * @param {'left'|'right'|'center'} [props.align='center']  Horizontal pin, for row-edge items.
 * @param {string}          [props.className]  Classes for the positioning wrapper.
 */
export function HoverCard({ content, children, align = 'center', className = '' }) {
  const [visible, setVisible] = useState(false)
  const showTimer = useRef(null)
  const hideTimer = useRef(null)

  const scheduleShow = useCallback(() => {
    clearTimeout(hideTimer.current)
    showTimer.current = setTimeout(() => setVisible(true), 120)
  }, [])

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 80)
  }, [])

  // Neither original call site cleaned these up, so unmounting mid-delay (closing the sheet
  // while a tooltip was pending) left a timer that fired setState on an unmounted component.
  useEffect(() => () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
  }, [])

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      {children}

      {/* Invisible bridge: keeps the card open while the pointer travels from trigger to card. */}
      {visible && content && (
        <div
          className="absolute bottom-full left-0 right-0 h-2"
          aria-hidden="true"
          onMouseEnter={scheduleShow}
          onMouseLeave={scheduleHide}
        />
      )}

      {visible && content && (
        <div
          role="tooltip"
          className={`absolute bottom-full mb-2 z-[9999] ${ALIGN_CLASSES[align] ?? ALIGN_CLASSES.center}`}
          onMouseEnter={scheduleShow}
          onMouseLeave={scheduleHide}
        >
          <div className={`${TOOLTIP_SURFACE} p-2 min-w-[120px] max-w-[180px]`}>
            {content}
          </div>
        </div>
      )}
    </div>
  )
}

/** Title line of a hover card. */
export function HoverCardTitle({ children }) {
  return (
    <p className="text-xs font-semibold text-white whitespace-nowrap leading-tight">{children}</p>
  )
}

/**
 * Click-opened "i" info button + popover, for explaining a UI term inline (e.g. the match
 * drawer's "Channel link" marker). Positioning/dismiss logic: fixed-position popover anchored
 * below the button, clamped on-screen, closes on outside click.
 *
 * `TournamentDetail.jsx`'s `StageInfoTooltip` hand-rolls an identical version of this — see
 * `.claude/pending-refactors.md` for migrating it onto this shared component.
 */
export function InfoButton({ ariaLabel, title, description, width = 288 }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const tooltipRef = useRef(null)

  function open(e) {
    e.stopPropagation()
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
  }

  useEffect(() => {
    if (!pos) return
    function handler(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target)
      ) setPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pos])

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        aria-label={ariaLabel}
        className="group inline-flex items-center justify-center p-1 rounded-full flex-shrink-0"
      >
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-600 group-hover:border-gray-600 dark:group-hover:border-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors leading-none font-bold"
          style={{ fontSize: '9px' }}
        >
          i
        </span>
      </button>
      {pos && (
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] w-72 ${TOOLTIP_PANEL} p-3`}
          style={{ top: pos.top, left: clampLeft(pos.left, width) }}
        >
          {title && <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{title}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
        </div>
      )}
    </span>
  )
}

/** Dota 2 Wiki footer row for an item hover card — divider + external link. Both item hover
 * cards built this identically, down to the aria-label wording.
 */
export function WikiLink({ name }) {
  if (!name) return null
  return (
    <>
      <div className="border-t border-gray-700/50 my-1.5" />
      <a
        href={`https://dota2.fandom.com/wiki/${encodeURIComponent(name)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${name} on Dota 2 Wiki (opens in new tab)`}
        className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors leading-tight"
      >
        <span>Dota 2 Wiki</span>
        <span aria-hidden="true">↗</span>
      </a>
    </>
  )
}

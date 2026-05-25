import { createPortal } from 'react-dom'
import { useState, useRef } from 'react'

/**
 * GameIndicators — icon chips for notable game events.
 *
 * Default export GameIndicators: aggregate view used in MatchCard game rows.
 * Named export TeamIndicators: per-team inline badges next to team names.
 */

function Tooltip({ label, children, align = 'center' }) {
  const [triggerRect, setTriggerRect] = useState(null)
  const ref = useRef(null)

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setTriggerRect(ref.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => setTriggerRect(null)}
    >
      {children}
      {triggerRect && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: triggerRect.bottom + 6,
            zIndex: 9999,
            ...(align === 'right'
              ? { left: triggerRect.right, transform: 'translateX(-100%)' }
              : { left: triggerRect.left + triggerRect.width / 2, transform: 'translateX(-50%)' }),
          }}
          className="pointer-events-none px-2.5 py-1.5 rounded-md bg-gray-950 text-white text-[11px] font-medium leading-snug whitespace-nowrap shadow-2xl"
        >
          {label}
          <span
            style={{
              position: 'absolute',
              bottom: '100%',
              ...(align === 'right' ? { right: '0.5rem' } : { left: '50%', transform: 'translateX(-50%)' }),
            }}
            className="border-[5px] border-transparent border-b-gray-950"
          />
        </span>,
        document.body
      )}
    </span>
  )
}

// ── SVG icons — exported so CompactSeriesRow / MatchDrawer / GoldGraph can use them ─

// Aegis of the Immortal shield — used as a graph marker for Roshan kills
export function RoshanSvg({ className = 'w-3.5 h-3.5', ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true" {...props}>
      <path d="M8 2 L13 4 V8 C13 10.5 11 12.5 8 13.5 C5 12.5 3 10.5 3 8 V4 Z" />
    </svg>
  )
}

export function RapierSvg({ className = 'w-3.5 h-3.5', ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true" {...props}>
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="4" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="3" cy="13" r="1.25" fill="currentColor" />
    </svg>
  )
}

export function GoldSwingSvg({ className = 'w-3.5 h-3.5', ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true" {...props}>
      <polyline
        points="2,4 6,11 14,3"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
      <polyline
        points="11.5,3 14,3 14,5.5"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

export function MegaComebackSvg({ className = 'w-3.5 h-3.5', ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true" {...props}>
      <path d="M3 9 L 4 5 L 5 7.5 L 6.5 3 L 8 7 L 9.5 3.5 L 11 7 L 12 5.5 L 13 9 Z" />
      <path d="M3 9 Q 3 12 5 13 L 11 13 Q 13 12 13 9 Z" />
      <path d="M3.5 11.5 L 0.5 10.5 L 0.5 13 L 3.5 12.5 Z" />
      <rect x="5" y="13" width="1.4" height="1.5" rx="0.3" />
      <rect x="9.5" y="13" width="1.4" height="1.5" rx="0.3" />
      <circle cx="10" cy="10" r="0.6" fill="#030712" />
    </svg>
  )
}

export function RampageSvg({ className = 'w-3.5 h-3.5', ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M 8 0.5
          C 5 0.5 2.5 2.5 2.5 5.5
          C 2.5 7 3 8.2 3.7 9
          L 3.7 10.2
          L 5.2 10.2
          L 5.2 11.5
          L 6.5 11.5
          L 6.5 10.5
          L 9.5 10.5
          L 9.5 11.5
          L 10.8 11.5
          L 10.8 10.2
          L 12.3 10.2
          L 12.3 9
          C 13 8.2 13.5 7 13.5 5.5
          C 13.5 2.5 11 0.5 8 0.5 Z
          M 4.6 5.2 L 7 5.2 L 7 7.6 L 5.9 8 L 4.6 7.3 Z
          M 9 5.2 L 11.4 5.2 L 11.4 7.3 L 10.1 8 L 9 7.6 Z
          M 7.5 8 L 8.5 8 L 8.8 9.2 L 7.2 9.2 Z
        "
      />
      <g transform="rotate(-30 8 13)">
        <rect x="2.5" y="12.6" width="9" height="0.9" rx="0.1" />
        <polygon points="11.5,12.5 13,13.05 11.5,13.6" />
        <rect x="3.5" y="12.2" width="0.5" height="1.6" />
      </g>
      <g transform="rotate(30 8 13)">
        <rect x="2.5" y="12.6" width="9" height="0.9" rx="0.1" />
        <polygon points="11.5,12.5 13,13.05 11.5,13.6" />
        <rect x="3.5" y="12.2" width="0.5" height="1.6" />
      </g>
    </svg>
  )
}

// ── Per-team inline badges ─────────────────────────────────────────────────────

/**
 * Tiny icon badges shown inline next to a team name.
 * Each icon is only shown when the given team earned/experienced that event.
 *
 * @param {Set<string>} rapierTeams        — bought Divine Rapier
 * @param {Set<string>} goldSwingTeams     — recovered from 20k+ gold deficit
 * @param {Set<string>} megaComebackTeams  — won with mega creeps against them
 * @param {Set<string>} rampageTeams       — had at least one rampage (5-kill streak)
 * @param {string}      teamName
 */
export function TeamIndicators({ rapierTeams, goldSwingTeams, megaComebackTeams, rampageTeams, teamName, tooltipAlign = 'center' }) {
  const icons = []
  if (rapierTeams?.has(teamName)) {
    icons.push({ key: 'rapier', label: 'Had Divine Rapier in this game', Icon: RapierSvg, color: 'text-red-500 dark:text-red-400' })
  }
  if (goldSwingTeams?.has(teamName)) {
    icons.push({ key: 'goldSwing', label: 'Recovered from a 20,000+ gold deficit', Icon: GoldSwingSvg, color: 'text-amber-500 dark:text-amber-400' })
  }
  if (megaComebackTeams?.has(teamName)) {
    icons.push({ key: 'mega', label: 'Won with mega creeps against them', Icon: MegaComebackSvg, color: 'text-violet-500 dark:text-violet-400' })
  }
  if (rampageTeams?.has(teamName)) {
    icons.push({ key: 'rampage', label: 'A player got a rampage (5-kill streak)', Icon: RampageSvg, color: 'text-orange-500 dark:text-orange-400' })
  }

  if (icons.length === 0) return null

  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      {icons.map(({ key, label, Icon, color }) => (
        <Tooltip key={key} label={label} align={tooltipAlign}>
          <span className={`inline-flex items-center justify-center w-4 h-4 ${color}`}>
            <Icon className="w-3 h-3" />
          </span>
        </Tooltip>
      ))}
    </span>
  )
}

// ── Aggregate component — MatchCard game rows ──────────────────────────────────

const INDICATORS = [
  {
    key: 'hasRapier',
    label: 'Divine Rapier in this game',
    shortLabel: 'Rapier',
    icon: RapierSvg,
    colorClass: 'text-red-500 dark:text-red-400',
    bgClass: 'bg-red-500/10 dark:bg-red-500/15',
    ringClass: 'ring-red-500/20',
  },
  {
    key: 'hasGoldSwing',
    label: '20,000+ gold swing reversed',
    shortLabel: 'Gold Swing',
    icon: GoldSwingSvg,
    colorClass: 'text-amber-500 dark:text-amber-400',
    bgClass: 'bg-amber-500/10 dark:bg-amber-500/15',
    ringClass: 'ring-amber-500/20',
  },
  {
    key: 'hasMegaComeback',
    label: 'Won with mega creeps against them',
    shortLabel: 'Mega',
    icon: MegaComebackSvg,
    colorClass: 'text-violet-500 dark:text-violet-400',
    bgClass: 'bg-violet-500/10 dark:bg-violet-500/15',
    ringClass: 'ring-violet-500/20',
  },
  {
    key: 'hasRampage',
    label: 'Rampage (5-kill streak) in this game',
    shortLabel: 'Rampage',
    icon: RampageSvg,
    colorClass: 'text-orange-500 dark:text-orange-400',
    bgClass: 'bg-orange-500/10 dark:bg-orange-500/15',
    ringClass: 'ring-orange-500/20',
  },
]

function GameIndicators({ indicators, variant = 'compact', className = '' }) {
  if (!indicators) return null

  const active = INDICATORS.filter(ind => indicators[ind.key])
  if (active.length === 0) return null

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {active.map(ind => {
          const Icon = ind.icon
          return (
            <Tooltip key={ind.key} label={ind.label}>
              <span
                className={`
                  inline-flex items-center justify-center
                  w-5 h-5 rounded-full
                  ${ind.bgClass} ${ind.colorClass}
                  ring-1 ${ind.ringClass}
                `}
              >
                <Icon />
              </span>
            </Tooltip>
          )
        })}
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {active.map(ind => {
        const Icon = ind.icon
        return (
          <Tooltip key={ind.key} label={ind.label}>
            <span
              className={`
                inline-flex items-center gap-1.5
                px-2.5 py-1 rounded-full
                ${ind.bgClass} ${ind.colorClass}
                ring-1 ${ind.ringClass}
                text-[11px] font-bold uppercase tracking-wide
                cursor-default select-none
              `}
            >
              <Icon />
              {ind.shortLabel}
            </span>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default GameIndicators

/**
 * GameIndicators — small icon chips showing notable game events.
 * variant="compact"  → icon-only pills (series rows, game lists)
 * variant="full"     → icon + label (MatchDrawer game sheet)
 */

function Tooltip({ label, children }) {
  return (
    <span className="relative group/indicator inline-flex">
      {children}
      <span
        role="tooltip"
        className="
          pointer-events-none absolute z-50
          bottom-full left-1/2 -translate-x-1/2 mb-2
          px-2.5 py-1.5 rounded-md
          bg-gray-950 text-white text-[11px] font-medium leading-snug text-center
          shadow-2xl whitespace-nowrap
          opacity-0 -translate-y-0.5
          group-hover/indicator:opacity-100 group-hover/indicator:translate-y-0
          transition-all duration-150 ease-out
        "
      >
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-950" />
      </span>
    </span>
  )
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function RapierSvg() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
      {/* Blade */}
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      {/* Crossguard — perpendicular to blade */}
      <line x1="4" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      {/* Pommel */}
      <circle cx="3" cy="13" r="1.25" fill="currentColor" />
    </svg>
  )
}

function GoldSwingSvg() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
      {/* Trend line: climbs to peak then reverses below start */}
      <polyline
        points="1,11 5,3 10,8 15,14"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Down-arrow at reversal end */}
      <polyline
        points="12,12 15,14 12,14"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function MegaComebackSvg() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      {/* Lightning bolt — universal "dramatic moment" icon */}
      <path d="M9.5 1.5 L4.5 8.5 H7.5 L6.5 14.5 L12 7.5 H9 Z" />
    </svg>
  )
}

// ── Indicator definitions ──────────────────────────────────────────────────────

const INDICATORS = [
  {
    key: 'hasRapier',
    label: 'Divine Rapier purchased',
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
    label: 'Mega creep comeback',
    shortLabel: 'Mega',
    icon: MegaComebackSvg,
    colorClass: 'text-violet-500 dark:text-violet-400',
    bgClass: 'bg-violet-500/10 dark:bg-violet-500/15',
    ringClass: 'ring-violet-500/20',
  },
]

// ── Public component ───────────────────────────────────────────────────────────

/**
 * @param {object} indicators  — { hasRapier, hasGoldSwing, hasMegaComeback }
 * @param {"compact"|"full"}   variant — compact = icon only; full = icon + label
 * @param {string} className
 */
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

  // Full variant — icon + label pill (used in MatchDrawer)
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

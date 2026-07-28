// The segmented-control chip row for switching between games of a series: shared by
// MatchDrawer (via App.jsx's `gameSwitcher` prop) and LiveSeriesSheet's mid-series companion.
//
// Extracted after the two grew independently hand-rolled implementations that drifted visually
// (different container, border, and active-state treatment; one showed team names, one didn't)
// despite two prior fixes to the underlying default-game / "return to live" logic — those fixes
// only patched behavior inside each separate file, never the fact that there were two files
// (pending-refactors #6, flagged after the 3rd round of user feedback about the inconsistency).
// Segmented-control was chosen as the canonical treatment: it's the pattern DESIGN_GUIDELINES.md
// already documents for "switching between views within a contained component," and it already
// carried the richer team-name label.
//
// Purely presentational — callers own their own outer scroll wrapper (padding/border differ
// slightly between MatchDrawer's and LiveSeriesSheet's, which is fine; only the chip row itself
// needs to stay byte-identical) and build the `tabs` array from whatever series/game shape they
// have.
export default function GameSwitcher({ tabs, disabled = false }) {
  return (
    <div className="inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          disabled={disabled}
          onClick={tab.onClick}
          onMouseEnter={tab.onMouseEnter}
          onTouchStart={tab.onTouchStart}
          aria-current={tab.isActive ? 'true' : undefined}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            tab.isActive
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          {tab.isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
          )}
          {tab.label}
          {tab.sublabel && (
            <span className="font-normal text-gray-500 dark:text-gray-500 min-w-0 max-w-[80px] truncate">
              {tab.sublabel}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

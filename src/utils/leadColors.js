// Net-worth-lead colors, shared by every surface that paints "who is ahead" — `momentum.js`'s
// `leadColor`, both gold graphs' header/hover/final readouts, and `SeriesLivePulse`'s lead line.
//
// These are raw `rgb()` strings rather than Tailwind classes on purpose: their consumers are SVG
// `fill`/`stroke` attributes and measured inline `style` values, where a class name cannot apply.
// That is the documented exception to DESIGN_GUIDELINES.md's "always use Tailwind classes for
// colors" rule, not a violation of it — and it is exactly why these drifted into nine hand-typed
// copies across five files before being hoisted here.
//
// Values are green-500 / red-500 / gray-400, matching DESIGN_GUIDELINES.md's Win / Loss tokens.
// Changing one changes the advantage color everywhere at once, which is the point.
export const LEAD_COLOR_RADIANT = 'rgb(34,197,94)'
export const LEAD_COLOR_DIRE = 'rgb(239,68,68)'

// Used only for "the lead is too small to call a side", i.e. the third arm of a lead ternary.
// Deliberately NOT applied to the graphs' axis-label/tick chrome, which happens to be the same
// gray but means something different (inert scaffolding, not a neutral game state).
export const LEAD_COLOR_EVEN = 'rgb(156,163,175)'

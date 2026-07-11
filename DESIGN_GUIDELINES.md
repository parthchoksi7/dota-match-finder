# Design Guidelines

Reference this file before making any UI or UX change. Every decision should be
defensible against these principles.

---

## Philosophy

**Think like a world-class sports/esports UI designer.** Every design decision should be evaluated against the best products in the genre: Sofascore, FlashScore, ESPN, HLTV, Liquipedia. Don't just make it functional — make it feel premium and purpose-built. Strong genre conventions exist for a reason: stacked team rows, right-aligned scores, compact meta rows, status pills, amber for live/followed highlights. Use them. When designing anything, ask "what would Sofascore do here?"

**Minimal esports.** The product exists to surface information fast, without ego.
Every element earns its place or gets cut. When in doubt, remove. Don't add.

**Mobile first, desktop enhanced.** Every design decision must be evaluated on a 375px mobile screen first. Truncation, overflow, stacked layout, touch targets, and thumb zones all come from the mobile constraint. Desktop is then an enhancement layer - more columns, hover states, inline actions that would be too small or crowded on mobile. Before committing any UI change, mentally render it at 375px width AND at 1280px width. If it only works at one size, it's not done.

---

## Typography

### Typefaces
- **Display (headings, team names, scores):** Barlow Condensed — bold or black weight only
- **Body (labels, metadata, table data):** Barlow — regular or semibold

### Hierarchy (3 levels only)
| Level | Usage | Style |
|---|---|---|
| Primary | Team names, scores, section titles | Display font, font-black or font-bold, near-white/near-black |
| Secondary | Tournament names, tab labels, stat values | Body font, font-semibold, gray-700 dark:gray-300 |
| Tertiary | Timestamps, metadata, labels | Body font, font-medium, uppercase, tracking-widest, gray-500 dark:gray-500 |

### Rules
- Never use more than 3 type sizes in a single component
- Tertiary text: always `uppercase tracking-widest text-xs`
- Numeric data: always `tabular-nums` to prevent layout shift
- Score/match result numbers: always display font, font-black

---

## Color

### Palette
| Token | Light | Dark | Usage |
|---|---|---|---|
| Surface | white / gray-50 | gray-950 | Page background |
| Surface raised | gray-100 | gray-900 | Cards, panels |
| Surface hover | gray-200 | gray-800 | Hover states |
| Border subtle | gray-200 | gray-800 | Default borders |
| Border accent | gray-400 | gray-600 | Emphasized borders |
| Text primary | gray-900 | white | Headings, team names |
| Text secondary | gray-700 | gray-300 | Body content |
| Text tertiary | gray-500 | gray-500 | Metadata, labels |
| Accent | red-500 | red-500 | Active states, live indicators, CTAs |
| Win | green-600 | green-500 | Positive outcomes |
| Loss | red-600 | red-500 | Negative outcomes |
| Watch / VOD | purple-700 | purple-600 | Watch actions only |
| Follow (active) | yellow-400 | yellow-400 | Followed/favorited team star only |

### Rules
- **Red is reserved** for: active tab indicators, live pulse dots, primary CTAs, and loss states. Never use red for decorative purposes.
- **Purple is reserved** for watch/VOD actions only. Don't repurpose it.
- **Yellow-400 is reserved** for the follow/star active state only. Don't repurpose it.
- **Sky-50 / sky-950/20 tinted background** is reserved for the editorial card (`EditorialCard`) — the only tinted background in the feed. It signals "this is context, not a score." Do not use tinted backgrounds for other card types.
- Light mode must use gray-900 (not gray-700) for primary text — never sacrifice contrast for softness
- No gradients. No shadows except on the match drawer overlay.
- Borders are always 1px, never 2px+, unless it's an active indicator underline

---

## Spacing

### Scale in use
- `gap-1` / `gap-1.5` — within a single data row (label + value pairs)
- `gap-2` / `gap-3` — between list items (match rows, stat rows)
- `gap-4` — between sections within a panel
- `gap-6` — between major page sections
- `px-4 sm:px-5` — standard horizontal panel padding
- `py-3` / `py-4` — standard vertical panel padding

### Rules
- Never introduce a new spacing value without checking the scale above first
- Touch targets minimum `min-h-[44px]` on all interactive elements

---

## Component Patterns

### Cards / Panels
- Border: `border border-gray-200 dark:border-gray-800 rounded`
- No box-shadow (except drawer)
- **Card background must be explicit**: `bg-white dark:bg-gray-950` on the card wrapper — do not rely on inheritance. Without an explicit background the card is transparent, which breaks segmented controls and other elements that use relative background steps (e.g. `dark:bg-gray-900` tab bar needs a `dark:bg-gray-950` card behind it to be visible).
- Header background: `bg-gray-100 dark:bg-gray-900`
- Section dividers: `border-t border-gray-100 dark:border-gray-900`

### Buttons
| Variant | Classes |
|---|---|
| Primary (CTA) | `bg-red-600 hover:bg-red-700 text-white` |
| Watch / VOD | `bg-purple-700 hover:bg-purple-800 text-white` |
| Secondary | `bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300` |
| Ghost | `border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600` |
- All buttons: `font-semibold text-sm rounded px-3 py-1.5` (small) or `px-4 py-2` (default)
- Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`

### My Teams feed card

Amber-bordered card shown at the top of the date feed when the user follows at least one team that has a match on the active date. Aggregates all followed-team matches (live + upcoming + completed) across all tournaments into one place.

- Card border: `border border-amber-400/60 dark:border-amber-500/40` — visible on both light and dark backgrounds
- Header background: `bg-amber-50/80 dark:bg-amber-400/10`, bottom border: `border-amber-200 dark:border-amber-500/20`
- Header content: filled star SVG (`text-amber-500`) + "MY TEAMS" label in `text-xs font-bold uppercase tracking-[4px] text-amber-600 dark:text-amber-500`
- Match rows inside use the same components (LiveMatchRow, UpcomingMatchRow, CompactSeriesRow) with `isFollowedMatch` always true
- Hidden when 0 followed teams OR when no followed-team matches exist on the active date

### Tournament feed card (HomeFeed)

Compact tournament grouping card in the date feed. Replaces the old TournamentHub chip + separate section pattern.

- Border: `border border-gray-200 dark:border-gray-800 rounded`
- Header is a `<button>` covering the full row; single click expands/collapses TournamentHub inline
- Header contains: org eyebrow (red, tracking-[4px]) + tournament name (display font, bold) / live pulse + LIVE label / row count / chevron (right-aligned)
- **Tournament name is the stage label, not the raw name.** It is rendered via `tournamentStageLabel(card.tournament, card.org)`, which strips the redundant league prefix and an optional following year (the org eyebrow above already shows the league). This surfaces the distinguishing token (e.g. `Regional Qualifier — EU`) that would otherwise be lost to truncation, so two parallel events under the same league no longer read identically. It uses `line-clamp-2 leading-snug` (never `truncate`) so a long stage label wraps to two lines instead of clipping. The button's `aria-label` keeps the full unstripped name for screen readers. Falls back to the full name when no org is known or stripping would leave nothing.
- Chevron rotates 180deg when TournamentHub is expanded (`rotate-180`)
- TournamentHub expands **above** match rows (between header and first match row), not below
- No collapse/expand of match rows - all rows are always visible
- Followed-team rows within the card have amber left border (`border-l-2 border-l-amber-500 bg-amber-50/60 dark:border-l-amber-400 dark:bg-amber-400/10`) and are sorted to the top. Use `dark:border-l-amber-400` (brighter shade, full opacity) in dark mode — amber-500/60 is invisible against dark backgrounds

### Upcoming match row (UpcomingMatchRow)

Two-line compact row for a scheduled match. Mobile-first: never truncates team names.

- Line 1: `TEAM A vs TEAM B` - display font, font-black, truncates as one unit
- Line 2: countdown time string (`In 2h 30m - 3:00 AM PDT`) in `text-[11px] text-blue-500`
- Stream pill (ESL/etc): `hidden sm:block` - desktop only, never shown on mobile
- Amber left border when `isFollowedMatch`
- No click handler (match not yet played)

### Date strip (filled pill track)

Scrollable horizontal row of date pills inside a gray pill-shaped track. Active date gets a filled white/dark pill with a shadow. Standard pattern used by Sofascore, FlashScore, and ESPN.

**Windowed view (HomeFeed):** the strip never shows all available dates at once. It always shows exactly 1 previous date (with matches) + the selected date + all future dates. As the user navigates back one day at a time, the window slides with them. New data loaded in the background only ever surfaces as a single new pill — no jarring multi-pill insertions.

```
[May 13] [May 14 (selected)] [Today] [Tomorrow]
   ↑ 1 previous day only     ↑ selected + all future dates
```

**Auto-fetch guarantee:** a `useEffect` in HomeFeed watches `availableDates` and calls `onLoadMore()` whenever the selected date is at index 0 (no previous day visible) and `hasMore` is true. It loops until a previous date exists or `hasMore` becomes false. Date switching itself never calls `onLoadMore()` directly.

**Loading state:** while auto-fetching, a shimmer placeholder pill appears at the far left of the strip. No explicit chevron button — the auto-fetch is invisible. Shimmer: `flex-shrink-0 w-14 h-7 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse`.

- Outer container: `flex items-stretch bg-gray-100 dark:bg-gray-900`
- **Shimmer pill** (left slot, shown when `loadingEarlier && !onLoadEarlier`): `flex-shrink-0 self-center w-14 h-7 mx-1.5 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse aria-hidden`
- **Legacy chevron button** (kept in DateStrip for backwards compat): only rendered when `onLoadEarlier` is explicitly passed — HomeFeed passes `null`
- **Scrollable pill track**: `flex flex-1 overflow-x-auto gap-1 p-1.5 [&::-webkit-scrollbar]:hidden` + `scrollbarWidth: 'none'` inline style
- Active pill: `bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white rounded-full px-3 py-1.5`
- Inactive pill: `text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full px-3 py-1.5`
- Both pills: `flex-shrink-0 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all duration-150`
- Auto-scrolls active pill into center view on mount **and on every `activeDate` change** via `scrollIntoView({ behavior: 'instant', inline: 'center' })` — so a swipe-driven change recenters the strip
- Hidden when `dates` is empty. Shown even with 1 date (label is informative).
- Fires `date_strip_click` GA event per pill.

**Swipe-to-change-day (mobile):** the date strip is not the only way to change days — a horizontal swipe on the feed body does the same thing, matching Sofascore/FlashScore. **Swipe left → previous day (Yesterday); swipe right → next day (Tomorrow).** This is an intent-direction mapping (flick toward the date you want), which is the direction the strip reads left-to-right, not a content-drag pager. Handlers live on HomeFeed's outer `<div>`, not DateStrip, because the gesture must cover the whole day's content. Rules for any swipe-nav gesture:
- Instant switch, no slide animation — identical to tapping a pill (respects the "no layout animation / one signature motion" rule)
- Ignore gestures that begin inside a `.overflow-x-auto` region (date strip track, stage tabs, standings/bracket tables) — those own the horizontal axis
- Require ≥55px horizontal travel and horizontal dominance (`|dx| > |dy| * 1.4`) so vertical scrolling is never hijacked; never call `preventDefault` (keep native scroll passive)
- Swipe remains an enhancement — the pills stay the primary, keyboard/AT-accessible control

### Inline TournamentHub (hideStatusLabel mode)

When TournamentHub is expanded inline within a tournament card, it uses `hideStatusLabel=true`:

- Root div gets `p-3 sm:p-4` padding to separate content from the card border
- Status label row ("Upcoming Tournament", "Recently Completed") is hidden entirely
- The header "ADD TO CALENDAR" button is also hidden - the per-tournament "Add to calendar" link inside the section serves this purpose
- The persistent calendar icon in the filter bar (links to /calendar) gives first-time users a route to calendar features without expanding any tournament

### Grand Final match cards
- Detected when `series.tournament.toLowerCase().includes('grand final')`
- Card background: `bg-amber-50/60 dark:bg-amber-950/20`
- Card border: `border-amber-500/70 dark:border-amber-500/60`, hover: `hover:border-amber-500 dark:hover:border-amber-400`
- Internal dividers: `border-amber-200 dark:border-amber-800/50`
- Trophy badge in the tournament header row: trophy emoji + "Grand Final" label in `text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wide`
- Do NOT animate-pulse the card border or background
- **Amber on dark backgrounds**: always use `dark:border-l-amber-400` (not amber-500/60) for left-border row indicators. The lighter, brighter amber-400 at full opacity is the only shade that reads against dark gray at the 2px border width. Opacity variants of amber-500 disappear.

### Match drawer — score section layout

The score section uses two stacked rows, not a single 3-column flex row. This eliminates truncation on long team names.

**Row 1 — Names row:**
```
TUNDRA ESPORTS [indicators] ☆          ☆ [indicators] BETBOOM TEAM
```
- Container: `flex items-center justify-between gap-2`
- Left cluster (`min-w-0`): `[radiant name (truncate)] [radiant indicators] [radiant star]`
- Right cluster (`min-w-0`): `[dire star] [dire indicators] [dire name (truncate, text-right)]`
- No separator between teams — color contrast (winner white / loser gray) provides the distinction
- Name: `font-display font-black text-base sm:text-lg uppercase tracking-wide truncate` — `text-base` on mobile to keep both names on one line; `sm:text-lg` on desktop where the wider drawer gives enough room; `truncate` as last resort for extreme name lengths
- No `flex-wrap` — names must stay on a single row
- Indicators: `flex-shrink-0`, hidden when `hideScore`
- Stars: `flex-shrink-0`, hidden when `!onToggleFollow || match.unplayed`

**Row 2 — Score row:**
```
             29  —  25
```
- Container: `flex items-center justify-center gap-3 mt-1`
- Score: `font-display text-4xl font-black` (up from text-3xl — names no longer compete for horizontal space)
- Separator "—": `text-gray-300 dark:text-gray-700 text-2xl font-medium select-none`
- Winner score: `text-gray-900 dark:text-white`; loser: `text-gray-400 dark:text-gray-500`
- In spoiler-free mode: "Reveal score" ghost button replaces both numbers, centered in this row

**Stats pending state** (PandaScore-sourced games not yet indexed by OpenDota):
```
            STATS PENDING
```
- When `match._fromPandaScore && match.radiantScore == null`, the score row is replaced by a single centered label
- Label: `text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600`
- Winner/loser distinction is still visible via team name color (white vs gray-400/500) in the names row above
- No "0 — 0" fallback — showing fabricated numbers is worse than showing nothing
- In spoiler-free mode, "Reveal score" still shows (the result is hidden, not absent)

**Color logic:**
```js
const radiantNameColor = (!hideScore && match.radiantWin) || hideScore
  ? 'text-gray-900 dark:text-white'
  : 'text-gray-400 dark:text-gray-500'
```
Both names use winner color in spoiler-free mode (no result is known yet).

### Match cards — winner/loser state
- **Winner** team name: `font-display font-black text-base sm:text-xl uppercase tracking-wide text-gray-900 dark:text-white`
- **Loser** team name: same size but `font-bold text-gray-400 dark:text-gray-500` — still readable, clearly secondary
- **Winner** score digit: `font-display font-black text-2xl sm:text-3xl text-gray-900 dark:text-white`
- **Loser** score digit: same size, `text-gray-500 dark:text-gray-500`
- Score separator "-": `text-base font-medium text-gray-300 dark:text-gray-700` - structural glue, not content
- Spoiler-free mode: both teams get the winner style (font-black, primary color) since no result is shown

### Follow / star button
- Size: `w-3.5 h-3.5` SVG star icon, button wrapper `p-0.5 rounded`
- Unfollowed: `text-gray-300 dark:text-gray-700`, hover: `hover:text-yellow-400 dark:hover:text-yellow-400`
- Followed: `text-yellow-400` (filled star)
- Transition: `transition-colors`
- Placement: inline after the team name, `flex-shrink-0` so it never pushes the name
- Must use `e.stopPropagation()` when nested inside a clickable card header to prevent card expand
- Only rendered when `onToggleFollow` prop is provided - absent by default on cards that don't need it

### Tabs (navigation inside panels)

Two distinct tab patterns exist - use the right one for the context:

**Segmented control** (section tabs within a component, e.g. TournamentHub Overview/Standings/Schedule/Heroes):
- Container: `inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5` inside a padded row with bottom border
- Active: `bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded`
- Inactive: `text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300`
- No red indicator - the filled background IS the active indicator
- Use when: switching between views within a contained component

**Source/account picker chips** (horizontal scrollable pill row for switching between external content sources, e.g. Social Feed account switcher):
- Container: `flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-1 px-1`
- Each chip: `flex-shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-full border transition-colors`
- Active: `bg-sky-500 border-sky-500 text-white`
- Inactive: `border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-500 dark:hover:border-gray-500`
- Use when: switching between named external data sources (accounts, feeds) inside a section — NOT for switching between page-level views (use underline tabs) or component sub-views (use segmented control)

**Underline tabs** (full-width navigation rows for switching top-level items):
- Active: `border-b-2 border-red-500 text-gray-900 dark:text-white`
- Inactive: `border-b-2 border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white`
- Use when: switching between top-level distinct items at the same hierarchical level
- Do NOT use for sub-stage navigation inside a component — use the stage picker pattern instead

### Copy button (clipboard)
- Use the shared `CopyButton` component (`src/components/CopyButton.jsx`) for any copy-to-clipboard action
- Default state: ghost border (`border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400`)
- Confirmed state: `border-green-600 text-green-600 dark:border-green-500 dark:text-green-500`, label changes to "Copied!" for 2 seconds
- Always use Tailwind classes for colors, never inline `style` props

### Pull-to-refresh indicator (standalone PWA only)

- Only rendered in `display-mode: standalone` — never in browser (browser has native pull-to-refresh)
- A floating pill anchored to the top of the viewport, centered horizontally: `fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none`
- Pill: `bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full p-2 shadow-md`
- **Pull phase**: refresh icon (`w-5 h-5 text-gray-500 dark:text-gray-400`) rotates proportionally to pull distance via inline `style={{ transform: rotate(Xdeg) }}`; translateY animates the pill down from above the viewport
- **Loading phase**: same refresh icon with `animate-spin` class; pill stays visible at full translateY
- Threshold: 72px — must pull past this to trigger a refresh
- Icon: circular arrow (refresh icon), not a down-arrow. Same icon for both phases (pull = static/rotating by gesture, loading = spinning)

### Inline feature callout card (My Teams)

Used for opt-in features surfaced inline within the My Teams section (calendar sync, push notifications).

```jsx
<div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded mb-3">
  <div className="flex items-center gap-2 min-w-0">
    {/* 16×16 icon, text-gray-400 dark:text-gray-600, flex-shrink-0 */}
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-snug">{title}</p>
      <p className="text-xs text-gray-400 dark:text-gray-600 leading-snug">{subtitle}</p>
    </div>
  </div>
  {/* action: primary dark/light button OR success state */}
</div>
```

- Action button (not yet enabled): `bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 px-3 py-1.5 text-xs font-semibold rounded whitespace-nowrap`
- Success state (already enabled): `text-green-600 dark:text-green-500 text-xs font-semibold flex items-center gap-1` with a 14×14 checkmark icon
- `mb-3` between cards; no dividers between them

### Loading states
- **Inline spinners:** `w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin`
- **Skeleton loaders:** Use `animate-pulse bg-gray-200 dark:bg-gray-800 rounded` blocks that mirror the actual content shape
- Prefer skeleton loaders over spinners for anything that occupies a list or table layout
- Skeleton column widths should vary naturally (e.g. `42% 58% 50% 66%`) so rows don't look identical
- Table skeletons: preserve the exact `<colgroup>` / `<col>` structure of the real table so column alignment matches on load
- Header cells in skeletons: thin bars (`h-2`) at ~50-70% of the column width
- Data cells: slightly taller bars (`h-2.5`) for name/value columns, shorter (`h-2`) for narrow stat columns

### Empty states
- Always include: a single line of dry, direct copy explaining the state
- Optional: one action (retry, clear search) - never more than one
- Tone: confident, not apologetic. "Nothing matched" not "Sorry, no matches found"
- Punctuation: no period at the end of single-line copy. "Nothing matched" not "Nothing matched."
- Style: `text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center`
- Wrapper padding: `py-8` for full-section empty states, `py-4` for inline/compact states
- Action button: ghost variant (`border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600`), `mt-4` below the copy line

### Section labels

Homepage sections use **floating labels** — a small `<h2>` rendered *above* the card border, not inside a header bar. This creates clear visual separation between sections while keeping the card surface clean.

**Markup pattern:**
```jsx
<div className="flex items-center [justify-between] mb-2">
  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-[color]">
    Section Title
  </h2>
  {/* optional right-slot: Manage button, match count, etc. */}
</div>
```

**Left-accent color by section** (`border-l-2` is the one approved 2px exception alongside the active underline tab):
| Section | Accent | Token |
|---|---|---|
| Live Tournament / Live Now | `border-red-500` | Red = live (matches live indicator color) |
| Upcoming Tournament / Upcoming Matches | `border-blue-500` | Blue = scheduled/future |
| My Teams | `border-amber-500` | Amber = personal content |
| Recently Completed | `border-emerald-500` | Emerald = concluded successfully |
| Latest Results | `border-gray-400 dark:border-gray-600` | Gray = historical/neutral |
| News Feed | `border-sky-500` | Sky blue = discovery/information content |
| Editorial Card | `border-sky-500` (hover) | Sky blue = editorial; uses tinted background instead of left border |

- Label text is always tertiary style: `text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500`
- `mb-2` gap between label and the card below
- Live sections keep the pulsing red dot inline in the label text
- `justify-between` when a right-slot is needed (Manage button, result count)
- **Count right-slot:** `text-xs text-gray-500 dark:text-gray-500 tabular-nums`. Show only when `count > 1` — a single item carries no useful count signal. Use a bare number with no label suffix; the section heading already provides context.

### Inline count pill (collapsed list)

Used when a flex-wrap toolbar (e.g. TournamentBar) needs to represent a collapsed group as a single interactive element rather than listing all items inline.

**Pattern:**
```jsx
<button className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors flex-shrink-0">
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{count} live</span>
  <svg className={`w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} ...>
    <path d="M19 9l-7 7-7-7" />  {/* same path used in TeamRoster, TournamentDetail */}
  </svg>
</button>
```

**Rules:**
- Only collapse when group has `> 1` items — a single item needs no pill
- Ghost border style (`border-gray-300/700`) — do NOT use the full secondary button background
- Chevron: `w-3 h-3`, path `M19 9l-7 7-7-7`, `rotate-180` when expanded, `transition-transform duration-150`
- Expanded items render inline after the pill in the same flex-wrap row — no layout container change needed
- Track expand/collapse events: `trackEvent('*_toggle', { action: 'expand' | 'collapse', count })`

### Stream picker (multi-language replay list)

Used in the match drawer's "Watch Full Match Replay" section to surface every recorded stream for a game (all languages, official + co-streams) below the primary official VOD button. Component: `src/components/StreamPicker.jsx`; data arrives as `match.otherStreams` (already sorted server-side: official → resolved start points → EN → language A-Z).

**Structure:**
- The primary official stream stays in the existing purple VOD button — the picker never contains it, and `allVods[0]` (GoldGraph anchor, Copy VOD link) is never a picker entry
- 0 other streams → no picker chrome at all
- Exactly 1 other stream → rendered directly as one inline row, no pill (count-pill rule above)
- ≥2 → collapsed inline count pill (`{n} more streams` + chevron, `aria-expanded`), expanding a vertical `space-y-1.5` list in place; collapsed by default, state resets per game

**Row anatomy** (full-row `<a>`, `min-h-[44px] px-3 py-2 rounded`, ghost border):
- Language chip: 2-letter uppercase code (`EN`, `RU`, `ES`) in entity-chip style — `px-1 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-[10px] font-bold text-gray-500`. Omitted when language is null. **Never use flag icons — flags ≠ languages** (RU serves all of CIS, ES serves LATAM + Spain)
- Play glyph (purple, `w-3 h-3`) only when `deep_link: true` — signals the link jumps to the game start
- Channel label: `text-xs font-semibold text-purple-700 dark:text-purple-400 truncate` (purple = watch action)
- "Co-stream" badge (`text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-600`) only when `official === false` — official is the default state, not a feature
- "From stream start" marker (right-aligned, same tertiary style) whenever `deep_link` is false — never let a user expect a timestamp jump that won't happen
- The primary button shows a language chip (`bg-white/20`) when the primary broadcast is non-English, and a Co-stream badge in the rare case no official stream exists

**Analytics:** `stream_picker_expand { matchId, count }` on expand only; row clicks fire `vod_click` with `language`, `official`, `kind`, `from_picker: true`.

### Scrollable tournament chip picker

Used when a section can display content for one of N items and N is variable (e.g. multiple live tournaments). The chip bar sits between the section label and the content panel.

**Pattern:**
```jsx
{items.length > 1 && (
  <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
    {items.map(item => {
      const isActive = (selectedId || items[0]?.id) === item.id
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => setSelectedId(item.id)}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
            isActive
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 shadow-sm'
              : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent hover:border-gray-300 dark:hover:border-gray-700'
          }`}
        >
          {label}
        </button>
      )
    })}
  </div>
)}
```

**Rules:**
- `overflow-x-auto` + `flex-shrink-0` on chips — horizontally scrollable on mobile, no wrapping
- `scrollbarWidth: 'none'` inline style removes the scrollbar track on desktop
- `pb-1` prevents clipping of chip borders during scroll
- Active chip: elevated appearance (`bg-white dark:bg-gray-800 border shadow-sm`) — distinct from ghost hover
- Inactive chip: ghost with transparent border → colored on hover — never use filled background
- Label sizing: `tracking-wide` maximum (not `tracking-widest`) for chip labels — chips must stay compact
- First item is always pre-selected with no explicit initial state — `selectedId || items[0]?.id`
- **Adaptive labels** for live tournament chips via `getTabLabel(tournament, allOngoing)`:
  - All same org (e.g. 6 DreamLeague qualifiers) → region abbreviation: `WEU`, `EEU`, `CN`, `SEA`, `NA`, `SA`
  - Different orgs, each unique → league name only: `ESL`, `PGL`, `DreamLeague`
  - Mixed (same org appears multiple times with different regions) → `"League Region"`: `ESL WEU`, `ESL EEU`
- Do NOT use this pattern for fixed-count tab bars (2–4 items) — use the segmented control pattern instead

### Game indicators (GameIndicators component)

Four icon chips that surface notable in-game events: Divine Rapier, 20K+ Gold Swing, Mega Creep Comeback, Rampage. Never rendered in spoiler-free mode.

**Color tokens (these are reserved for indicators only):**
| Indicator | Color | Background chip |
|---|---|---|
| Divine Rapier | `text-red-500` | `bg-red-500/10 dark:bg-red-500/15` |
| 20K+ Gold Swing | `text-amber-500` | `bg-amber-500/10 dark:bg-amber-500/15` |
| Mega Creep Comeback | `text-violet-500` | `bg-violet-500/10 dark:bg-violet-500/15` |
| Rampage (5-kill streak) | `text-orange-500` | `bg-orange-500/10 dark:bg-orange-500/15` |

**Compact variant** (series rows, game rows in MatchCard):
- Chip: `w-5 h-5 rounded-full flex items-center justify-center` with colored background
- Icon: SVG at `w-3 h-3` (16x16 viewBox)
- Tooltip: appears on hover using `group/indicator` scoped Tailwind — `absolute bottom-full left-1/2 -translate-x-1/2 mb-1` positioning, `z-10`, `text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded bg-gray-900 text-white`
- Wrapper: `relative group/indicator` so tooltip is scoped per chip

**Full variant** (MatchDrawer only):
- Pill: `inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide` with colored border and text
- Icon: same SVG at `w-3 h-3`
- Label: short text ("Divine Rapier", "Gold Swing", "Mega Comeback")
- No tooltip needed — label is already visible

**Placement:**
- Series rows (CompactSeriesRow): below the BO3/BO5 format label, inside the center score column
- Game rows (MatchCard): inline after the winner name, inside the `!spoilerFree && game` section
- Match drawer (MatchDrawer): between the team score row and the VOD section, `full` variant

**Data flow:**
- `fetchMatchIndicators(matchIds)` in `src/api.js` — module-level `Map` cache per browser session
- Fetched lazily: CompactSeriesRow on mount, MatchCard on expand, MatchDrawer on match change
- Aggregated for series (OR across all games) in CompactSeriesRow via `useMemo`

### Live indicators
- Pulsing red dot: `inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse`
- Only used for genuinely live/running states — never as decoration
- In bracket round column labels: swap label to `text-red-500` and prepend a `w-1 h-1` pulse dot when any match in that round is `status === 'running'`
- Live bracket match card: `border-red-500/80 bg-red-500/5` — do NOT animate-pulse the card itself (fades text content)

### Site header nav (May 2026 redesign)

The header was redesigned from first principles in May 2026 because the additive approach (every new feature got a slot) led to a 7-item nav that broke on mobile. The new rule: **the header is for orientation + state, not navigation.**

**Header contents (all that's allowed):**
- Logo + tagline (orientation)
- One text link: Tournaments (the only content destination that earns header space) - hidden below `md:` because mobile uses the bottom tab bar
- Spoiler-free toggle (only when `onSpoilerToggle` is passed; it's a state indicator, not just a setting)
- Settings cog (⚙) - opens `SettingsSheet` which holds Theme, Calendar, Install, About, What's New

**Anything else belongs elsewhere:**
- Theme toggle, Calendar feeds, Install app → `SettingsSheet`
- About, What's New → `SiteFooter`
- Frequent mobile destinations (Home, Tournaments) → `BottomTabBar`

**Why these rules:**
- Orientation, state, and one universal action are the only jobs a header can do well in narrow space
- Navigation is a separate problem solved by the bottom tab bar (mobile) and the page itself (desktop)
- Information pages (About, What's New) are visited once per user, max - they don't earn header real estate

**Implementation rules:**
- Icon buttons must have `aria-label` AND `title`
- Standard icon button class: `focus-ring p-2 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors`
- Touch target minimum: `min-h-[44px]`. The `p-2` + `h-4 w-4` icon naturally hits this.
- Do NOT add new icons to the header. If a new feature needs a global affordance, add it to `SettingsSheet` instead.

**Mobile brand**: phones (< 640px / below `sm:`) show the shield logo only; the wordmark and tagline are wrapped in `hidden sm:block` and only appear at `sm:` and up. Don't try to fit both the shield and a long wordmark on phones - it forces tracking and font compromises that cause truncation (e.g. "SPECTATE ESP..."). The shield is the brand on mobile; the browser tab title carries the verbal name. The logo bumps from `h-10` on mobile to `sm:h-12` on desktop so it carries proper visual weight when standing alone. The brand `<a>` keeps an `aria-label="Spectate Esports - Home"` so screen readers still announce the brand correctly when only the icon is rendered.

**Settings entry point**: the gear icon in the header uses `hidden md:inline-flex` — it is visible only on `md:` and up (desktop), where the bottom tab bar is hidden. On mobile, the "More" tab in the bottom tab bar is the sole entry point to `SettingsSheet`. Do not show both — duplicate entry points for the same action create confusion about which is authoritative.

### Bottom tab bar (mobile primary nav)

Fixed-bottom tab bar shown on mobile (`md:hidden`). Lives in `src/components/BottomTabBar.jsx`. Three tabs: **Home**, **Tournaments**, **More**.

**Why this pattern:** Sports apps (theScore, Sofascore, FlashScore, ESPN) all use bottom tabs because they put primary destinations in the thumb zone. Hidden hamburger-style nav reduces engagement by ~21% (Nielsen Norman Group). Bottom tabs typically improve task completion ~40% over hamburger menus.

**Pattern:**
- Container: `fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 md:hidden`
- Safe-area inset: `style={{ paddingBottom: "env(safe-area-inset-bottom)" }}` to handle iPhone notch
- Each tab: `flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px]` (above the 44px touch target floor)
- Icon: `w-5 h-5` Feather-style line icon
- Label: `text-[10px] font-bold uppercase tracking-wide` (compact)
- Active state: `text-red-500` (icon and label both turn red - aligns with the red-as-active rule)
- Inactive: `text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white`
- Active link gets `aria-current="page"` for assistive tech

**Page padding:** Every page that mounts BottomTabBar must add `pb-20 md:pb-8` (or similar) to its main content so content isn't obscured by the bar.

**Never:**
- Increase the tab count beyond 4 (5 is the absolute max in industry research; we use 3)
- Show on desktop (`md:hidden` is non-negotiable)
- Animate the bar on scroll - it's always-visible

### Settings sheet (consolidated settings)

Slide-up sheet on mobile, dropdown panel anchored top-right on desktop. Lives in `src/components/SettingsSheet.jsx`. Triggered by dispatching `SETTINGS_OPEN_EVENT` (a window event) - so any component can open it without prop drilling.

**Groups inside the sheet:**
- **Display**: Spoiler-free toggle (with current state shown), Theme toggle (with current value shown)
- **Stay updated**: Calendar feeds (link), Install as app (button)
- **Info**: About (link), What's New (link)

**Pattern:**
- Backdrop: `fixed inset-0 bg-black/40 z-40`
- Sheet: `fixed z-50 bg-white dark:bg-gray-900 border ... inset-x-0 bottom-0 rounded-t-lg sm:inset-x-auto sm:bottom-auto sm:top-20 sm:right-4 sm:w-72 sm:rounded`
- Group label: `text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 px-2 pt-3 pb-1`
- Row: `flex items-center justify-between px-2 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded min-h-[44px]`
- Row label: `text-sm font-semibold text-gray-900 dark:text-white`
- Row value (right): toggles show "On"/"Off" or "Dark"/"Light" in `text-xs text-gray-500`
- Closes on Escape, backdrop click, or close button

### Tournament identity
- League organizer label: `text-xs uppercase tracking-[4px] text-red-500 mb-1` above the tournament display name
- Use `getLeagueLabel(name)` helper (in TournamentHub.jsx) to extract organizer from tournament name
- Recognized leagues: DreamLeague, ESL, PGL, BLAST, WePlay, Riyadh Masters, The International, Beyond The Summit
- If no match, no label is shown (don't show a generic fallback)
- This follows the same eyebrow label pattern used in AboutPage section headers

---

## Motion & Animation

### Principles
- One signature motion done well > ten mediocre animations
- The drawer slide-in is the signature motion — keep it, refine it, don't add competing animations
- All other transitions: `duration-150` or less, `ease-out`

### Approved animations
| Animation | Usage |
|---|---|
| `animate-pulse` | Live indicators, skeleton loaders |
| `animate-spin` | Loading spinners |
| `slide-in` (custom) | Match drawer entrance only |
| `transition-colors duration-150` | Hover state color changes |

### Rules
- No bounce, spring, or elastic easing — too playful for this product
- No entrance animations on list items or cards
- Never animate layout properties (width, height, margin) — only opacity and transform

---

## Information Hierarchy

### Within any component, apply this order:
1. **What** — the primary subject (team name, tournament name)
2. **Result / Status** — score, live/finished/upcoming
3. **Context** — date, format, round
4. **Actions** — watch, share, expand

Metadata (dates, formats, round numbers) should never visually compete with primary content.

---

## Inline Feature Callout (Sync Card)

Used to surface a persistent, contextual action inside a section without a modal. Example: "Sync to your calendar" card in My Teams.

- Container: `flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded`
- Place between the section header row and the section content
- Primary action button: `bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-1.5 text-xs font-semibold rounded`
- Sub-label: `text-xs text-gray-400 dark:text-gray-600`
- Never use red here — this is a feature affordance, not an alert

---

## Inline Nudge (Post-Action Prompt)

One-time contextual prompt triggered by a user action (e.g. following their first team). Appears inline in the content flow — not a modal, not a toast.

- Border: `border border-blue-200 dark:border-blue-900` — blue signals informational, not urgent
- Background: `bg-white dark:bg-gray-900`
- Always provide an X dismiss button (`aria-label="Dismiss"`) in the top-right corner
- Store dismissal in `localStorage` so it never reappears after the user acts on it or closes it
- Copy must mention the specific context (team name, feature) — never generic

---

## NewsCard Pattern

Used in `src/components/NewsCard.jsx` for the /news feed.

- Full card is an `<a>` with `target="_blank" rel="noopener noreferrer nofollow"` — entire row is clickable
- Text-only layout (no images) — consistent with the minimal esports philosophy
- Source label + timestamp: `text-xs font-medium uppercase tracking-widest text-gray-500` with an `aria-hidden="true"` separator dot
- Headline: `font-display font-bold text-sm leading-snug line-clamp-2`
- Excerpt: `text-xs text-gray-500 line-clamp-2 leading-relaxed`
- Entity chips (teams, tournaments): ghost border `border border-gray-300 dark:border-gray-700 text-gray-500`, max 3 shown
- Hover state: `hover:bg-gray-100 dark:hover:bg-gray-800`
- Separator: `border-b border-gray-100 dark:border-gray-900` (same as the list container's internal dividers)
- Wrap a list of NewsCards in `bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 overflow-hidden`
- Skeleton: matches card shape — three `animate-pulse` bars (no image placeholder)

---

## Match drawer — end-game stats (GoldGraph + PlayerStatsSection)

Displayed below the collapsible draft section for completed OpenDota-indexed matches. Hidden in spoiler-free mode and for PandaScore-only matches.

### Section headers
Both sections use the tertiary label style: `text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500`.

### Gold advantage graph (GoldGraph)
- Custom SVG, no chart library. Props: `radiantGoldAdv`, `radiantName`, `direName`, `loading`, `events`, `vodUrl`.
- Two `<path>` elements clipped to above-zero (green-500/20 fill) and below-zero (red-500/20 fill) halves.
- Zero line: dashed, `stroke-gray-200 dark:stroke-gray-700`, strokeWidth 0.75.
- Data line: `stroke-gray-400 dark:stroke-gray-500`, strokeWidth 1.5.
- SVG viewBox 480x160 with `preserveAspectRatio="none"` — fills the container width.
- **SVG constants**: `VW=480, VH=160, PL=4, PR=4, PT=10, PB=22, CW=472, CH=128, MID=74`. PL/PR are minimal stroke-buffer only — no labels inside the SVG.
- **Full-bleed rendering**: In MatchDrawer, GoldGraph is wrapped in `-mx-5` so the SVG spans the full drawer panel width. GoldGraph returns a React fragment: an HTML header row + the SVG wrapper div.
- **HTML header row** (above SVG): `flex justify-between px-5 mb-1.5` — RADIANT label (green-500) · current gold diff in advantage color · DIRE label (red-500). The `px-5` realigns text with the rest of the drawer content despite the bleed.
- Loading: fragment with `h-5 mb-1.5` spacer + 160px `animate-pulse bg-gray-200 dark:bg-gray-800 rounded` skeleton.
- Empty (< 2 data points): 160px `h-[160px]` div — "Gold data unavailable".
- **Event markers**: See `## Game event markers` section below. Three types: Roshan kill, Rampage, Divine Rapier. Colored by side (#22c55e Radiant / #ef4444 Dire), not by event type.
- **Hover tooltip** (desktop scrub): `position: fixed`, viewport-clamped via `Math.max(8, Math.min(window.innerWidth - 210, clientX - 80))` — escapes drawer's `overflow-x-hidden` so it never clips at left/right screen edges. Uses `hoverViewport` state (set on `mousemove`).
- **Event tooltip**: `activeEvent` state. `position: fixed`, measured by `useLayoutEffect` after render. Shows: colored icon · event label · separator · subject · separator · minute · "WATCH" in amber.
- **Click-to-VOD**: `buildEventUrl(vodUrl, event.time)` parses the Twitch `?t=` offset already in the VOD URL, adds `event.time` seconds, reformats to `Xh Ym Zs`, opens in new tab. No-op if no `vodUrl`.
- Tooltip and click work on desktop hover/click. Touch devices get click-only (no hover tooltip).

### Player stats row (PlayerStatsSection)
- Per-player row (3 lines): hero icon (24px) + name (truncate, `text-sm font-semibold`) + networth (right, `text-xs tabular-nums text-gray-500`) / 6x ItemSlot (24px each, `gap-0.5`, indented 8px to align under name) / networth bar (`h-1 rounded-full`, green-500 for Radiant, red-500 for Dire).
- Team group header: `text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-500` (Radiant) or `text-red-600 dark:text-red-500` (Dire).
- Players sorted by netWorth descending within each team.
- Dire group separated by `border-t border-gray-100 dark:border-gray-900 pt-4`.
- Loading skeleton: 5 rows per team with `animate-pulse` bars matching the row shape.

### ItemSlot
- `w-6 h-6` (md, default) or `w-5 h-5` (sm). Always `rounded-sm`.
- Empty slot (itemId=0 or name not found): `bg-gray-200 dark:bg-gray-800` placeholder, `aria-hidden="true"`.
- CDN URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/{name}_lg.png` with `loading="lazy"` and `onError` fallback to empty slot.
- Tooltip: CSS hover tooltip via `group`/`group-hover:opacity-100` pattern. Wrapper div has `relative group`; no `overflow-hidden` (clips absolute-positioned tooltips). `rounded-sm` on the `<img>` directly.

---

## What to Avoid

- Adding sections "just in case" — every section needs a job
- Repeating information across tabs or sections
- Overusing red — it loses meaning if it appears too often
- Nested navigation (tabs inside tabs) — flatten or consolidate
- Generic spinner for anything with predictable content shape — use skeleton instead
- Arbitrary widths/heights not derived from the spacing scale
- Decorative borders or dividers that don't separate distinct content zones
- Copy that apologizes ("Sorry, no results") or over-explains obvious states
- Designing only at desktop width — always render at 375px first
- Team names or tournament names that truncate on mobile — use two-line layouts instead of one-line with ellipsis
- Putting interactive elements (stream pills, watch buttons, replay links) in positions that are invisible on mobile without providing an alternative touch-friendly path. **Established pattern**: Watch (Live) and Replay (Results) use a `sm:hidden` icon-only purple button (44px tap target) + `hidden sm:inline-flex` full-text button — same 4th-column slot, different density per breakpoint.
- Using red for YouTube stream buttons. YouTube is a watch action — it uses `bg-purple-700 hover:bg-purple-800` just like Twitch. The platform icon (YouTube SVG vs Twitch SVG) provides the visual distinction between platforms; color should not carry that meaning. This keeps red reserved for its semantic uses (CTAs, live, loss).

---

## Game event markers

Three event types appear as icon markers on the gold-advantage graph, plotted at their event timestamp along the gold line.

### Event types

| Event | Icon component | Triggered by |
|-------|----------------|--------------|
| Roshan kill | `RoshanSvg` (Aegis shield) | Team that killed Roshan |
| Rampage | `RampageSvg` (skull + crossed daggers) | Player who got the rampage |
| Divine Rapier purchase | `RapierSvg` (sword slash) | Player/team that bought |

All three SVG components live in `src/components/GameIndicators.jsx`.

### Coloring rule

**Marker color = the side that triggered the event, not the event type.**

- Radiant event → `#22c55e` (green-500)
- Dire event → `#ef4444` (red-500)

A Dire Roshan kill during Radiant's gold lead renders a **red marker in the green band** — that visual contradiction tells the story.

### Implementation (GoldGraph.jsx)

- `MARKER_SVG` maps event type strings to icon components: `{ roshan: RoshanSvg, rampage: RampageSvg, rapier: RapierSvg }`
- Each marker is a `<g className="gold-graph-marker">` with `style={{ color: sideColor }}` — icon fills via `currentColor`
- 24px transparent `<circle r="12">` hit area inside the `<g>` for easy hover targeting
- Active marker gets a `<circle r="10" stroke="currentColor">` focus ring
- Markers positioned with `translate(x - 6, y - 6)` so the 12×12 icon is centered on the data point
- Z-ordering: inactive markers rendered first, active marker rendered last (sits on top of siblings)
- Vertical dashed ruler (`stroke="#374151" strokeDasharray="3 4"`) rendered behind all markers at the active marker's x position

### Tooltip structure

Dark inline-styled card (#030712 bg, 1px #1f2937 border, 4px radius, `0 10px 30px rgba(0,0,0,0.55)` shadow):

```
[icon in sideColor]  [Event Label]  ·  [Subject]  ·  [Xm]  [WATCH?]
```

- **Icon**: 12×12 icon in side color
- **Event label**: "Roshan", "Roshan 2", "Rampage", or "Divine Rapier"
- **Subject**: team name for Roshan; player name for Rampage; `player · hero` for Rapier (falls back to team name)
- **Minute**: `Math.floor(event.time / 60)` in tabular-nums, color #9ca3af
- **WATCH**: amber `#f59e0b`, 11px, uppercase, shown only when `eventUrl` is non-null

**Flip logic**: when `(markerX - PL) / CW > 0.60`, flip left with `translateX(-100%)`, otherwise offset 4px right.

### CSS (index.css)

```css
.gold-graph-marker { cursor: pointer; }
.gold-graph-marker svg {
  stroke: #030712;           /* thin dark outline for readability on same-color bands */
  stroke-width: 0.8;
  paint-order: stroke;       /* stroke behind fill so outline doesn't obscure icon */
  transition: transform 120ms ease-out;
  transform-origin: center;
  transform-box: fill-box;
}
.gold-graph-marker:hover svg { transform: scale(1.15); }
```

### Click-to-VOD

`buildEventUrl(vodUrl, event.time)` adds `event.time` seconds to the existing `?t=` offset in the Twitch VOD URL, reformats as `Xh Ym Zs`, opens in new tab. No-op when `vodUrl` is null.

## Graph marker color system (Option F)

Graph markers use a two-layer color system:

| Layer | What it encodes | Color |
|---|---|---|
| Icon + disc fill tint | Event type | Chip indicator hue (same as match-card chip row) |
| Outer ring | Side (who triggered it) | Radiant `#22c55e` / Dire `#ef4444` |

### Event hues (graph markers)
| Event | Icon | Disc fill |
|---|---|---|
| Divine Rapier | `#ef4444` | `rgba(239,68,68,0.18)` |
| Rampage | `#f97316` | `rgba(249,115,22,0.18)` |
| Roshan | `#f59e0b` | `rgba(245,158,11,0.18)` |

Disc has no border — the side ring sits on the disc edge and acts as its colored border.

### Side ring
Radiant: `#22c55e` · Dire: `#ef4444`
The ring sits on the disc edge (radius = disc radius), drawn on top of the
disc fill as its colored border — no gap between disc and ring.
Default: 2px stroke, 70% opacity · Active: 2.5px stroke, 100% opacity

### Position rule
Radiant lollipops rise above the line. Dire lollipops fall below.
Position and ring color are redundant signals — either alone conveys the side.

### Active vs inactive
Active marker: full opacity, disc 1px larger, ring thicker.
Inactive markers: 65% opacity on disc and icon, 70% opacity on ring.

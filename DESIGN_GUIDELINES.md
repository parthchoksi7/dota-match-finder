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
- **Display (headings, team names, scores):** Helvetica Neue — bold or black weight only
- **Body (labels, metadata, table data):** Helvetica Neue — regular or semibold

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
| Personal / highlighted | amber-600 | amber-400 | Champion labels, Grand Final accents, My Teams, followed-row left border |

### Rules
- **Red is reserved** for: active tab indicators, live pulse dots, primary CTAs, and loss states. Never use red for decorative purposes.
- **Purple is reserved** for watch/VOD actions only. Don't repurpose it.
- **Yellow-400 is reserved** for the follow/star active state only. Don't repurpose it — this was violated by an earlier "Champion" label treatment (`text-yellow-600 dark:text-yellow-400`); resolved 2026-07-21 by recoloring to `amber-600 dark:amber-400` (see Personal/highlighted row above), matching the existing Grand Final trophy badge convention below instead of adding a second yellow exception.
- **Amber is the shared "personal/highlighted content" token** — My Teams card, Grand Final card, followed-row left borders, section-label left-accent, and tournament Champion labels all use it. Don't treat it as a free color for unrelated accents.
- **Sky-50 / sky-950/20 tinted background** is reserved for the editorial card (`EditorialCard`) — the only tinted background in the feed. It signals "this is context, not a score." Do not use tinted backgrounds for other card types.
- Light mode must use gray-900 (not gray-700) for primary text — never sacrifice contrast for softness
- No gradients. No shadows except on the match drawer overlay and the floating layer (tooltips, hover cards, popovers) — see "Floating layer" under Component Patterns. Elevation is what makes a floating element read as *above* the page, so it's a genuine exception, not drift.
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
- **Exception — compact purple icon buttons (watch/replay actions in dense rows): always `w-7 h-7` (28px), on mobile AND desktop, never the 44px touch-target floor.** This has been re-broken twice by applying the 44px floor to a single new button instead of matching the row's existing icon size:
  - `CompactSeriesRow`'s replay buttons: a 2026-07-21 audit grew them to `w-11 h-11` for touch-target compliance; the larger purple square read as visually oversized against the row's compact type scale and was reverted same-day.
  - `LiveMatchRow`'s mobile-only Twitch/YouTube watch buttons (`sm:hidden`): shipped at `w-11 h-11` while the row's own desktop YouTube button sat right next to it at `w-7 h-7` — same oversized-square problem, caught and fixed 2026-07-30.
  - **Rule going forward**: any new purple icon-only button added to a match row (live, compact series, or upcoming) must be `w-7 h-7` with the icon at `w-2.5 h-2.5` (see `TwitchIcon`/`YouTubeIcon` in `PlatformIcons.jsx`), matching every existing instance — do not size a new button to the 44px floor "for mobile" without checking what size the row's other icon buttons already use.

---

## Component Patterns

### Cards / Panels
- Border: `border border-gray-200 dark:border-gray-800 rounded`
- No box-shadow (except drawer)
- **Card background must be explicit**: `bg-white dark:bg-gray-950` on the card wrapper — do not rely on inheritance. Without an explicit background the card is transparent, which breaks segmented controls and other elements that use relative background steps (e.g. `dark:bg-gray-900` tab bar needs a `dark:bg-gray-950` card behind it to be visible).
- Header background: `bg-gray-100 dark:bg-gray-900`
- Section dividers: `border-t border-gray-100 dark:border-gray-900`

### Floating layer (tooltips, hover cards, popovers)

Everything that floats above the page pulls its surface from `src/components/FloatingTooltip.jsx`.
Never hand-roll a floating card — that's what produced the three-radii/three-shadow drift the
2026-07-21 audit found (`.claude/design-consistency-audit-2026-07.md` §3).

**One radius/shadow pair for the whole layer:** `rounded-md shadow-xl`. A new floating element
only has to pick a surface:

| Constant | Surface | Use for |
|---|---|---|
| `TOOLTIP_SURFACE` | `bg-gray-900 dark:bg-gray-950` + `border-gray-700 dark:border-gray-800`, `text-white` | Transient hover readouts floating over dense content — graph crosshairs, item icons, indicator chips. Deliberately a **dark chip in both themes** (standard sports-UI treatment); this is not a missing `dark:` variant. |
| `TOOLTIP_PANEL` | `bg-white dark:bg-gray-900` + `border-gray-200 dark:border-gray-700` | Click-opened informational popovers carrying body copy or links (e.g. the tournament stage-info card). Theme-aware, matches the card system. |

**Geometry helpers** (don't re-inline the `Math.max`/`Math.min` sandwich):
- `clampLeft(left, width)` / `clampTop(top)` — keep a floating element fully on screen, 8px margin (`TOOLTIP_EDGE_MARGIN`). Any `position: fixed` tooltip needs this: `fixed` is what lets it escape the drawer's `overflow-x-hidden`, and clamping is what stops it clipping at a screen edge.
- `SCRUB_TOOLTIP_WIDTH` — clamp width for the compact graph-scrub readout.

**Components:**
- `HoverCard` — hover-delayed card anchored above its trigger. Owns the show/hide timers (120ms show so a mouse crossing a dense item row doesn't strobe, 80ms hide so travel onto the card doesn't dismiss it), the invisible hover bridge that makes that travel possible, timer cleanup on unmount, and `align="left" | "right" | "center"` for row-edge items. Used by `ItemSlot` and `PlayerStatsSection`'s consumed-upgrade icons.
- `HoverCardTitle`, `WikiLink` — the title line and the Dota 2 Wiki footer row (divider + external link + `aria-label`) shared by both item hover cards.
- `InfoButton` — click-opened "i" info button + `TOOLTIP_PANEL` popover for explaining a UI term inline (props: `ariaLabel`, `title`, `description`, `width`). Fixed-position, anchored below the button, clamped on-screen, closes on outside click. Used by the match drawer's "Channel link" explainer (see "Stream picker" below). `TournamentDetail.jsx`'s `StageInfoTooltip` predates this and hand-rolls the identical pattern — see `.claude/pending-refactors.md` for migrating it onto this shared component instead of a third hand-rolled copy.

Use the raw `TOOLTIP_SURFACE` constant (not `HoverCard`) when the trigger already owns its own
open/close mechanism — a portal-positioned tooltip, a caller-measured `fixed` position, or a
pure-CSS `group-hover` label where a component's timers and re-renders would be disproportionate.

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

Amber-bordered card shown at the top of the date feed whenever the user follows at least one team. Aggregates all followed-team matches (live + upcoming + completed) across all tournaments into one place.

- Card border: `border border-amber-400/60 dark:border-amber-500/40` — visible on both light and dark backgrounds
- Header background: `bg-amber-50/80 dark:bg-amber-400/10`, bottom border: `border-amber-200 dark:border-amber-500/20`
- Header content: filled star SVG (`text-amber-500`) + "MY TEAMS" label in `text-xs font-bold uppercase tracking-[4px] text-amber-600 dark:text-amber-500`
- Match rows inside use the same components (LiveMatchRow, UpcomingMatchRow, CompactSeriesRow) with `isFollowedMatch` always true
- **No-match fallback state**: when no followed team has a match on the active date, the card persists with the same header and a body showing the next scheduled followed-team match within 72h — "NEXT MATCH" tertiary label, team names in display font (same treatment as UpcomingMatchRow), time in `text-[11px] font-semibold tabular-nums text-blue-500 dark:text-blue-400` via `formatMatchTime` — or the empty-state line "No matches in the next 3 days". The card never disappears for a follower; it is the persistent anchor for the follow feature.
- Hidden only when 0 teams are followed. In that case a dismissible "Follow your teams" prompt using the inline feature callout card pattern (below) renders in the same slot, with a "Choose teams" primary action that opens ManageTeamsModal and an × dismiss persisted to `localStorage['spectate-follow-card-dismissed']`

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
- Stream pill (ESL/etc): shown on both mobile and desktop — team name (`min-w-0 truncate`) yields horizontal space to it rather than the pill hiding
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

**Swipe-to-change-day (mobile):** the date strip is not the only way to change days — a horizontal swipe on the feed body does the same thing, matching the calendar-app convention (iOS/Google Calendar) and Sofascore/FlashScore. **Drag left→right (swipe right) → previous day (Yesterday); drag right→left (swipe left) → next day (Tomorrow).** This is a content-drag pager, not an intent-direction flick: the gesture behaves as if the days themselves sit on a horizontal timeline and dragging pulls that timeline under your finger — dragging right pulls an earlier day into view, dragging left pulls a later one in. Handlers live on HomeFeed's outer `<div>`, not DateStrip, because the gesture must cover the whole day's content. Rules for any swipe-nav gesture:
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
- Detection is bracketRound-based, not tournament-name-based: `series.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))`, matching "Final", "Finals", "Grand Final", "Grand Finals" (case-insensitive) but not e.g. "Upper Bracket Final". `bracketRound` comes from `parseBracketRound()` (`api/_shared.js`) parsing PandaScore's match name, enriched onto match objects client-side. Computed independently at each call site today (`HomeFeed.jsx`, `MatchList.jsx`, and the singular form in `MatchDrawer.jsx`) — see `.claude/pending-refactors.md` #22 for the not-yet-done shared-helper extraction.
- Card background: `bg-amber-50/60 dark:bg-amber-950/20`
- Card border: `border-amber-500/70 dark:border-amber-500/60`, hover: `hover:border-amber-500 dark:hover:border-amber-400`
- Internal dividers: `border-amber-200 dark:border-amber-800/50`
- Trophy badge in the tournament header row: trophy emoji + "Grand Final" label in `text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wide`
- Do NOT animate-pulse the card border or background
- **Amber on dark backgrounds**: always use `dark:border-l-amber-400` (not amber-500/60) for left-border row indicators. The lighter, brighter amber-400 at full opacity is the only shade that reads against dark gray at the 2px border width. Opacity variants of amber-500 disappear.
- **Match drawer (MatchDrawer)**: the trophy badge only (no amber card background/border — the drawer is a full-panel sheet, not a list card, so the "Personal/highlighted" amber card treatment above doesn't apply the same way). Rendered inline in the header meta row, next to the `Game X of Y` pill: `<span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400"><span aria-hidden>🏆</span> Grand Final</span>`.
- **This 🏆 + amber-600/400 treatment is a shared "achievement/distinction" pattern, not Grand-Final-exclusive** — the second consumer is the per-player MVP/award badge in `PlayerStatsSection` (see "Match drawer — end-game stats" → "STRATZ enrichment" below). Any third achievement-style badge should reuse this exact treatment rather than inventing a new one.

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
- **Also used for**: the Live Series Companion's and match drawer's game switcher (`GameSwitcher.jsx`, shared by `LiveSeriesSheet.jsx` and `App.jsx`'s `gameSwitcher` → `MatchDrawer`) — same active/inactive treatment, plus a `disabled:opacity-50 disabled:cursor-not-allowed` state (chips are disabled while a tap-through replay fetch is in flight, so a fan can't switch tabs mid-transition) and a small `w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse` live dot prepended to whichever chip represents the currently-running (or "return to live") game.

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

### Two-action permission primer card (push notifications)

Used to ask for a permission-gated feature (push alerts) BEFORE the browser's native permission dialog fires, so a "no" in our UI never touches — and can't accidentally exhaust — the OS-level one-shot prompt. Also the pattern for a hard platform blocker (iOS needing install-to-home-screen before push can work at all).

```jsx
<div className="rounded border border-gray-100 dark:border-gray-800 overflow-hidden">
  <div className="flex items-start gap-2.5 px-3 py-3">
    <span className="text-gray-400 dark:text-gray-600 mt-0.5">{/* 16×16 icon */}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{title}</p>
      <p className="text-[11px] text-gray-400 dark:text-gray-600 leading-snug mt-1">{explanation}</p>
    </div>
  </div>
  <div className="flex items-center gap-2 px-3 pb-3">
    {/* two-button variant: secondary "Not now" + primary "Turn on" */}
    {/* single-button variant (hard blocker): one full-width primary action */}
  </div>
</div>
```

### Nested settings row (progressive disclosure within a card)

Used when a card's default state should stay untouched but power users need deeper control — e.g. "Customize alerts" inside the granted push card, revealing per-type toggles and quiet hours. Reuses the same chevron affordance as the stream picker (`### Stream picker (multi-language replay list)`), applied to a settings row instead of a list:

```jsx
<div className="border-t border-gray-100 dark:border-gray-800">
  <button
    type="button"
    aria-expanded={expanded}
    onClick={() => setExpanded(!expanded)}
    className="focus-ring w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
  >
    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-500">{label}</span>
    <svg className={`w-3 h-3 text-gray-400 transition-transform duration-150 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} ...>
      <path d="M19 9l-7 7-7-7" />
    </svg>
  </button>
  {expanded && <div className="px-3 pb-3 space-y-3">{/* nested controls */}</div>}
</div>
```

- Collapsed by default; resets to collapsed whenever the parent modal/sheet reopens (matches the existing search-dropdown reset pattern) — never persisted across sessions
- Nested toggle rows: `flex items-center justify-between gap-2`, label `text-xs font-semibold text-gray-800 dark:text-gray-200`, sublabel `text-[10px] text-gray-400 dark:text-gray-600` directly beneath, `Toggle` component on the right with an `ariaLabel` prop (required once more than one toggle can appear together — screen readers and tests both need to distinguish them)
- Nested `<select>` (e.g. an hour picker): `px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded`, paired selects separated by a small lowercase `to` label, each with an `aria-label` (no visible `<label>` needed at this density)
- Only reveal a sub-control when its toggle is on (e.g. quiet-hours start/end pickers appear only once "Quiet hours" is switched on) — don't show disabled/greyed-out controls for an off state
- Track the expand itself once (`{feature}_customize_expand`), and each meaningful change as its own event — don't bundle a whole panel's interactions into one generic event

- Explanation line states the concrete value ("a heads-up before kickoff, when live, when the replay's ready") — never generic ("enable notifications")
- Secondary/dismiss button: `flex-1 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600` — ghost, ties for width with the primary button
- Primary button: same `bg-gray-900 dark:bg-white` treatment as the standard callout action button
- Dismissing (secondary button) never calls the browser permission API — it only sets a "seen" localStorage flag so the primer shows once, then permanently collapses to the compact status row (still offering the feature, just without the expanded pitch)
- The primer is gated on having something to notify about (e.g. only shown once ≥1 team is followed) — asking before there's any payoff reads as noise
- Single-button variant (e.g. iOS "Add to Home Screen"): drop the two-button row for one full-width primary button; used when the feature is structurally blocked rather than a permission ask

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
- The primary official stream stays in the existing purple VOD button — the picker never contains it. The GoldGraph anchor and Copy VOD link read `resolvedVods[0]`, the resolver's own timestamped VOD, which is never a picker entry (see "Preferred stream language" below — a promoted stream can sit ahead of it in the button row, but must never become the timestamp anchor)
- 0 other streams → no picker chrome at all
- Exactly 1 other stream → rendered directly as one inline row, no pill (count-pill rule above)
- ≥2 → collapsed inline count pill (`{n} more streams` + chevron, `aria-expanded`), expanding a vertical `space-y-1.5` list in place; collapsed by default, state resets per game

**Row anatomy** (full-row `<a>`, `min-h-[44px] px-3 py-2 rounded`, ghost border):
- Language chip: 2-letter uppercase code (`EN`, `RU`, `ES`) in entity-chip style — `px-1 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-[10px] font-bold text-gray-500`. Omitted when language is null. **Never use flag icons — flags ≠ languages** (RU serves all of CIS, ES serves LATAM + Spain)
- Play glyph (purple, `w-3 h-3`) only when `deep_link: true` — signals the link jumps to the game start
- Channel label: `text-xs font-semibold text-purple-700 dark:text-purple-400 truncate` (purple = watch action)
- "Channel link" marker (right-aligned, tertiary style) whenever `deep_link` is false — it's a plain channel/stream page, not a timestamped deep link, so never word it as if the moment (or even the VOD itself) will be found automatically
- The primary button shows a language chip (`bg-white/20`) when the primary broadcast is non-English
- **No "Co-stream" badge** (removed 2026-07-31) — whether a stream is official carries no decision-making value for a fan choosing a channel to watch; `official` is still tracked in analytics (`vod_click`/`live_match_watch` payloads), just not surfaced as UI copy anywhere in either picker or either primary-button treatment
- **"Channel link" explainer**: the match drawer's "Watch Full Match Replay" heading carries an `InfoButton` (`src/components/FloatingTooltip.jsx`) that explains what the "Channel link" marker means and why some replays don't deep-link to the game start — added because the marker alone was confusing without context. Always rendered next to the heading (not conditional on whether a "Channel link" marker actually appears below), matching `TournamentDetail.jsx`'s "About {stage}" info-icon precedent. Live has no equivalent — no `deep_link`/"channel link" concept exists there.

**Analytics:** `stream_picker_expand { matchId, count }` on expand only; row clicks fire `vod_click` with `language`, `official`, `kind`, `from_picker: true`.

**Live sibling**: `src/components/LiveStreamPicker.jsx` (used in the Live Series Companion's live-game section) follows the exact same structure rules (0/1/≥2, language chip, shared `streamLabel` export from `StreamPicker.jsx`) but drops the play glyph and "channel link" marker entirely — there is no VOD timestamp concept for a live stream, every row is just "watch live now." Do not conflate the two components; a live stream and a VOD replay are different states with different honesty markers (same "two distinct shapes for two distinct states" rule as the score row below). Analytics: `live_stream_picker_expand { matchId, count }`; row clicks fire `live_match_watch` with `source: 'live_series_sheet'`, `from_picker: true`.

### Preferred stream language (primary-slot promotion)

When a fan has set a stream language (`SettingsSheet` → Display → Stream language), their language takes the **primary watch slot** on both surfaces. `pickPreferredStream` (`utils.js`) selects it; the surface renders it first.

**Promotion rules (identical on live and replay):**
- The promoted stream renders **first** in the watch-button row, in the surface's filled primary treatment, carrying the same language chip (`bg-white/20`) rules as any other primary button
- The previous default is **demoted, never hidden** — it drops to an outline treatment (`border border-gray-300 dark:border-gray-700` + purple label) in the same row. Three filled buttons would leave the row with no primary at all, and removing the official broadcast to make room for a co-stream is never acceptable
- The promoted stream is removed from the picker below it, so it never appears twice — matched by normalized URL, not object identity, since PandaScore lists one channel twice as dual-language rows
- **Nothing is promoted when the primary is already in the fan's language.** Promoting a co-stream over an already-correct official broadcast is a downgrade, not a fix
- No preference, or no stream in that language → the row renders exactly as it does today. **Never substitute English as a fallback** — the surface's existing default already handles regional-only events correctly
- The promoted live button carries a language chip for **every** language including English, matching the picker rows below it (the replay surface's primary keeps its existing non-English-only chip rule)
- A promotion must never remove a state the fan would otherwise get: on replay, the no-replay notice and "Search Twitch" link still render when the resolver found no VOD

**Replay-only honesty rule:** a promoted stream with `deep_link: false` keeps the **"Channel link" marker** even in the primary button. Most PandaScore stream pages carry no VOD timestamp, and the whole point of the primary purple button elsewhere is "this jumps to the moment" — a fan must never be led to expect a timestamped replay and land on a bare channel. Scope this marker to the promoted entry only: the resolver's own VOD entries carry no `deep_link` field at all, so treating its absence as "not deep-linked" would wrongly brand a genuine timestamped VOD.

**Analytics:** `stream_language_pref_set { language, source }` on the setting; `from_preference: true` on a promoted-stream click; `preferred_language_match` on the demoted default buttons.

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
- Tooltip: portal-rendered (`createPortal` to `document.body`) at a `position: fixed` coord measured from the trigger rect, so it escapes the row's overflow. Surface is `TOOLTIP_SURFACE` (see Floating layer) at `px-2.5 py-1.5 text-[11px] font-medium`, plus a 5px CSS-triangle arrow whose fill tracks the surface background (`border-b-gray-900 dark:border-b-gray-950`). `align="right"` pins it to the trigger's right edge for end-of-row chips.

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
| `sheet-content-fade` (custom, `duration-150 ease-out`, opacity only) | Inner content swap inside the shared sheet host (`App.jsx`) when switching between LiveSeriesSheet and MatchDrawer without unmounting the outer panel |

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
- **Full-bleed rendering**: In MatchDrawer, GoldGraph is wrapped in `-ml-4 sm:-ml-5` (left-only, matching `Sheet.jsx`'s shared `SHEET_PADDING` — see "Match drawer / Live Series sheet shell" below) so the SVG spans to the panel's true left edge. GoldGraph returns a React fragment: an HTML header row + the SVG wrapper div.
- **HTML header row** (above SVG): `flex justify-between pl-4 sm:pl-5 pr-0 mb-1.5` — RADIANT label (green-500) · current gold diff in advantage color · DIRE label (red-500). `pl-4 sm:pl-5` realigns text with the rest of the drawer content at each breakpoint despite the left bleed; `pr-0` lets DIRE sit at the wrapper's own right edge, which is already the panel's content boundary since there's no right-side bleed.
- Loading: fragment with `h-5 mb-1.5` spacer + 160px `animate-pulse bg-gray-200 dark:bg-gray-800 rounded` skeleton.
- Empty (< 2 data points): 160px `h-[160px]` div — "Gold data unavailable".
- **Event markers**: See `## Game event markers` section below. Three types: Roshan kill, Rampage, Divine Rapier. Colored by side (#22c55e Radiant / #ef4444 Dire), not by event type.
- **Hover tooltip** (desktop scrub): `TOOLTIP_SURFACE` at `position: fixed`, viewport-clamped via `clampLeft(hoverViewport.x - 80, SCRUB_TOOLTIP_WIDTH)` / `clampTop(...)` (see Floating layer) — `fixed` escapes the drawer's `overflow-x-hidden`, clamping stops it clipping at left/right screen edges. Uses `hoverViewport` state (set on `mousemove`).
- **Event tooltip**: `activeEvent` state. `position: fixed`, measured by `useLayoutEffect` after render. Shows: colored icon · event label · separator · subject · separator · minute · "WATCH" in amber.
- **Click-to-VOD**: `buildEventUrl(vodUrl, event.time)` parses the Twitch `?t=` offset already in the VOD URL, adds `event.time` seconds, reformats to `Xh Ym Zs`, opens in new tab. No-op if no `vodUrl`.
- Tooltip and click work on desktop hover/click. Touch devices get click-only (no hover tooltip).

### Player stats row (PlayerStatsSection)
- Per-player row (3 lines): position badge (16px) + hero icon (24px) + name (truncate, `text-sm font-semibold`) + MVP badge (if awarded) + impact/networth cluster (right) / 6x ItemSlot (24px each, `gap-0.5`, indented 8px to align under name) / networth bar (`h-1 rounded-full`, green-500 for Radiant, red-500 for Dire).
- Team group header: `text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-500` (Radiant) or `text-red-600 dark:text-red-500` (Dire).
- Players sorted by netWorth descending within each team.
- Dire group separated by `border-t border-gray-100 dark:border-gray-900 pt-4`.
- Loading skeleton: 5 rows per team with `animate-pulse` bars matching the row shape.

**STRATZ enrichment (position/role/imp/award)** — a second, independently-fetched data source (`fetchMatchStratz`, `?mode=match-stratz`) merged onto the OD player list client-side by `heroId` (a hero can only be picked once per match, so it's a reliable join even when a Steam profile is private). Fetched in parallel with `fetchMatchStats`, never gating it — see `MatchDrawer.jsx`'s `stratzMatchId`/`enrichedPlayers` staleness-guard pair, same pattern as `statsMatchId`/`currentStats`. All four fields below are silent-degrade: absent whenever STRATZ hasn't resolved (rate-limited, unindexed match, cold cache) — no skeleton, no error state, the row just renders as it did before this feature shipped.

- **Position badge** (`PositionBadge`, `src/components/PlayerStatsSection.jsx`): `w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[9px] font-bold`, showing the bare digit 1–5 — this is the numeral shorthand pro broadcasts and drafts already use, not STRATZ's internal `POSITION_N`/`CORE`/`LIGHT_SUPPORT`/`HARD_SUPPORT` jargon. Placed immediately left of the hero icon, same row, same vertical center. Neutral gray, not a semantic color — position is identity, not a judgment, and shouldn't borrow a color that means something else one line below (the networth bar's Radiant/Dire green/red). Full label ("Hard Support") reveals via `HoverCard` (the same floating-layer component this file already imports for `ConsumedUpgrade`) — no new floating-layer pattern. **`align="left"` is required**, not the `HoverCard` default (`center`): this badge is the leftmost element in the row, so a centered tooltip extends further left and clips against the match drawer's `overflow-x-hidden` — the exact same edge case `ItemSlot`'s `edgePin="left"` already solves for the first two item slots in this same row (see "Floating layer" → `HoverCard`'s `align` prop). Caught by visually inspecting the running app, not by any test. A role-only fallback (STRATZ `role` present, `position` null — happens because `role` can only disambiguate LIGHT_SUPPORT/HARD_SUPPORT from CORE, never carries a number) renders the label's first letter instead of a numeral.
- **MVP badge**: reuses the Grand Final trophy convention — 🏆 (`aria-hidden`) + `text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wide` — placed inline after the player name, `flex-shrink-0` so it never pushes the name into truncation. **Only STRATZ's literal `MVP` award value is surfaced.** STRATZ's `award` enum has four real values, confirmed running against live match data: `NONE` (no award — the common case for 9 of 10 players), `MVP`, `TOP_CORE`, `TOP_SUPPORT`. The first implementation treated any non-empty award string as awarded, which rendered a trophy badge literally reading "NONE" on every unawarded player in production — caught by the owner looking at the running app, not by a test written against the one verified sample in the audit doc. `TOP_CORE`/`TOP_SUPPORT` are a deliberate product decision to drop too (not just a `NONE`-shaped bug) — the trophy stays scoped to the single highest-value per-match distinction rather than three recognitions diluting it. `stratzAwardLabel()` (`api/_stratz.js`) is the single place this mapping lives — never re-derive it at a call site. This generalizes the trophy badge from Grand-Final-exclusive to the shared "achievement/distinction" pattern — any third use should reuse this, not reinvent it.
- **Impact score**: rendered as a **chip**, not bare colored text — `inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-bold tabular-nums`, prepended to the existing net-worth stat slot (impact chip first, net worth second). A first version rendered the signed number as plain text directly beside net worth; the owner caught, from the running app, that it read as an unexplained second net-worth-like figure rather than a distinct stat — the bordered/tinted chip (same convention as `GameIndicators`' colored chips) visually marks "this is a different kind of number" before a fan even reaches the hover explainer. Colored via the existing win/loss tokens — `green-600/500` + `bg-green-500/10` positive, `red-600/500` + `bg-red-500/10` negative, `gray-400/600` + `bg-gray-500/10` zero — not a new color, since "over/under-performed" is the same polarity as win/loss. The `+`/`-` sign itself (not color alone) carries the signal for colorblind users. **Scale is documented, not guessed**: STRATZ's own knowledge base confirms IMP runs **-100 to +100**, with **0 as a fair baseline** (draft advantage and rank already factored in, so it measures how much a player's performance moved their team's win probability, not an absolute judgment) — see the full sourced methodology in `.claude/specs/stratz-api-audit.md`. The chip's `HoverCard` (content: title "Impact Score" + the one-line explanation above) is the only place this methodology needs to live in the UI — don't duplicate the explanation elsewhere. `align="right"` since the chip sits toward the row's right side.

### ItemSlot
- `w-6 h-6` (md, default) or `w-5 h-5` (sm). Always `rounded-sm`.
- Empty slot (itemId=0 or name not found): `bg-gray-200 dark:bg-gray-800` placeholder, `aria-hidden="true"`.
- CDN URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/{name}_lg.png` with `loading="lazy"` and `onError` fallback to empty slot.
- Tooltip: wrap the `<img>` in `HoverCard` (see Floating layer) — it supplies the wrapper's `relative`, the hover delays, and the surface. Pass `align` from the slot's `edgePin` so the first slots in a row pin left instead of overflowing. Content is `HoverCardTitle` + an optional `Neutral item` line + `WikiLink`. Never add `overflow-hidden` to the wrapper (it clips the card); `rounded-sm` goes on the `<img>` directly.

---

## Live series companion — names/score section (mirrors MatchDrawer)

**2026-07-31: unified with `MatchDrawer.jsx`'s own names/score section.** The prior version of this doc documented `SeriesLivePulse.jsx`'s live-game score row and `SeriesGameScore.jsx`'s finished-game row as "two distinct shapes for two distinct states — do not conflate them." That was correct for *why the data differs* (a live game has no final result) but had drifted into *the shared data looking different too* — team names, kill score, and follow all render identically between a live game and a completed one now; `MatchDrawer` is the fixed baseline and was not changed to achieve this.

**`SeriesLivePulse.jsx` (running game) — same shape as `MatchDrawer`'s names/score section:**
- **Names row**: `flex items-center justify-between gap-2`, `font-display font-black text-base sm:text-lg uppercase tracking-wide truncate`, both teams `text-gray-900 dark:text-white` (no winner/loser split — no result yet, same rule `MatchDrawer` uses in spoiler-free mode: "both names get winner style when no result is known"). Follow stars use the identical `MatchDrawer` star-button treatment (`w-4 h-4` icon, `p-[14px]` touch target, yellow-400 filled/unfollowed-gray) — new capability as of this pass; the live view previously had no follow affordance at all.
- **Score row**: `flex items-center justify-center gap-3`, `font-display text-4xl font-black text-gray-900 dark:text-white` for both digits (again no winner/loser color — a live lead is not a result), separator `—` `text-gray-300 dark:text-gray-700 text-2xl font-medium select-none`. Renders **"Score pending"** (`text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600`) instead of fabricated digits until the pulse has a score — same rule as `MatchDrawer`'s "Stats pending" state.
- **Spoiler-free**: gated behind a `MatchDrawer`-identical **"Reveal score"** button (local `scoreRevealed` state, reset when the game changes) rather than a hard, non-overridable hide — team names and the draft are NOT spoiler content (mirrors `MatchDrawer`, which always shows `radiantTeam`/`direTeam` regardless of `spoilerFree`), only the score and everything outcome-adjacent (stakes, momentum, net-worth lead, tower map, `LiveGoldGraph`) rides the same reveal gate.
- **Net-worth-lead + clock facts line** — the live-only analogue of `MatchDrawer`'s first-blood/Roshan facts line (same position, same `text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600 tabular-nums`, same centered middot-separated layout): `{leading team} {leadMag} net worth · {clock}`. `leadMag` (`formatGoldMagnitude`) already includes its own `+`/magnitude formatting — do not prepend another `+` in the JSX (shipped as a bug once: rendered `++5.0k`). Advantage color is the leading team's name text color, same rule as `GoldGraph`'s header row (`radiantLead > 0` → green, `< 0` → red) — a fixed color regardless of side is wrong.
- **Watch section** sits *after* names/score (mirrors `MatchDrawer`'s "Watch Full Match Replay" position, not before it) under a **"Watch Live"** label (same typography, different wording since this is a broadcast, not a replay).
- **Draft section label is "Draft"**, not "Picks" — matches `MatchDrawer`'s section header wording.
- Stakes chip / momentum line have no `MatchDrawer` equivalent (live-only) and sit as an eyebrow above the names row.

**`SeriesGameScore.jsx` (finished game, compact single-line inside the live sheet's per-tab summary card, not `MatchDrawer`):**
- Reuses the sitewide winner/loser score-digit convention ("Match cards — winner/loser state" above), scaled to this card's density: `font-display font-black text-xs tabular-nums`, winner digit `text-gray-900 dark:text-white`, loser digit `text-gray-400 dark:text-gray-500`, separator `—` `text-gray-300 dark:text-gray-700 mx-1 font-medium`.
- Does NOT show either team's name — the card's header line above it already shows the winner's name, so this only needs winner-first digit ordering (via OpenDota's `radiant_win` mapped onto the already-known PandaScore names one level up, never displaying an OD-sourced name here).
- Placed inline with the game duration, separated by a tertiary middot: `{score} · {duration}` — score first, since "how did it go" outranks "how long" in the glance hierarchy.
- Renders nothing until parsed (no fabricated "0-0") — same rule as the draft strip's "Stats indexing" fallback.
- This compact card is a distinct, still-unreconciled surface from both `MatchDrawer` and the live-pulse names/score above — see `.claude/product-backlog.md` #22 for the open scoping question on it (a fan lands here only in the between-games gap or before OD data resolves; any click-through with resolved data already routes straight to the real `MatchDrawer`).

---

## Live series companion — live net-worth graph + live draft (Live Story)

Two surfaces inside the running-game block of `SeriesLivePulse.jsx`. Both are built to read as the pre-game siblings of the finished-game `GoldGraph`/`DraftDisplay`, so a viewer can't tell "this is the cut-down live version" from styling alone — only from the honesty markers (partial-history caption; no KDA/IGN).

### Live net-worth graph (`LiveGoldGraph.jsx`)
- **Same visual chrome as `GoldGraph`:** green area fill (`rgba(34,197,94,0.25)`) above the dashed zero line, red (`rgba(239,68,68,0.25)`) below; data line `stroke-gray-400 dark:stroke-gray-500`; RADIANT (green) · current net-worth diff (advantage color) · DIRE (red) header row; 5-minute time-axis labels (`fontSize 9`, `rgb(156,163,175)`). Section label is **"Net Worth"** (`text-[10px] font-bold uppercase tracking-widest text-gray-500`), never "Gold" — same rule as the score-row micro-label.
- **Compact viewBox** (`480×128`, `PL 4 / PR 8 / PT 8 / PB 20`), contained within the sheet's `SHEET_PADDING` (NOT full-bleed like the drawer's `-ml-4 sm:-ml-5` `GoldGraph` — the live graph aligns with the score row + draft in the same sheet).
- **Two deliberate divergences from `GoldGraph` (intentional — do NOT "fix" into uniformity):**
  1. **Time-scaled x-axis, not index-spaced.** `computeTimeScaledPoints()` maps `x ∝ game_time`, so an irregular/sparse capture gap (the live feed is ~60–110s cadence, with gaps on pauses/reconnects) shows as honest horizontal distance instead of being compressed. `GoldGraph` is index-spaced because it has a value every minute.
  2. **Hover/scrub SNAPS to the nearest real captured point; never interpolates.** The live capture is coarse — interpolating a value between two snapshots would imply a precision we don't have. Desktop `onMouseMove` + mobile horizontal-drag (`passive:false`, 5px direction-intent threshold, same as `GoldGraph`) → crosshair + dot + floating `position:fixed`, viewport-clamped tooltip (`MM:SS · +X.Xk TEAM`, reusing `GoldGraph`'s exported `formatHoverLabel`).
- **No event markers** — there is no live Roshan/Rapier/teamfight feed (those are post-game only). Don't add marker/collision machinery here.
- **Partial-history honesty:** if the first captured point isn't near kickoff (`t > 90`), render a `Since MM:SS — full trend after the game ends` caption rather than implying the line covers the whole game.
- `role="img"` + a trend `aria-label` ("Net worth trend, trending up"). GA: `live_gold_scrub { source }`.

### Tower map (`DotaMinimap.jsx`, R4 — public since 2026-07-31)

The actual Dota 2 minimap texture (`public/dota-minimap-7.40.webp`, self-hosted, 512x512 — see `CONTEXT.md`'s Phase D entry for sourcing/licensing), not a hand-drawn schematic, placed after the Watch Live section and above `LiveGoldGraph` (2026-07-31: the names/score/watch section was restructured to mirror `MatchDrawer`'s ordering — see "Live series companion — names/score section" above) — the "state read" surfaces (stakes, momentum, score) sit together near the top, ahead of the graph's *history*. Sourced from `pulse.objectives = { radiant: [top,mid,bot], dire: [top,mid,bot] }` (standing-tower counts, 0-3 per lane, decoded server-side, `api/_buildingState.js`), which is only present at all when confidence is high — no separate loading/low-confidence state to design because an absent field already means "don't render." Swapped from an abstract SVG schematic to the real texture 2026-07-28 — two prior passes (river/road styling, diamond markers) never read as "Dota" to the owner because the underlying shape (axis-aligned square, right-angle lane bends) didn't match the real map's geometry no matter how much surface detail was added; a real texture sidesteps that.

- Wrapped in a bordered card (`border border-gray-200 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-950 p-2.5`) — the map is a big enough visual element to deserve its own contained panel, not a floating raw SVG loose in the sheet.
- A small legend row (filled/hollow swatch pair + "Standing"/"Destroyed" labels) sits above the map — added once towers became diamonds rather than obviously-tower-shaped icons, so the fill convention doesn't need to be inferred. Legend swatches keep the original theme-neutral gray (`#9ca3af`/`#6b7280`) since they sit on the card's own flat background, not the texture.
- Square SVG, `viewBox 0 0 512 512` (matching the texture's native resolution 1:1), capped at `max-w-[240px] mx-auto` — Radiant base bottom-left, Dire base top-right. The texture renders as an `<image>` element filling the viewBox; no hand-drawn river or lane-road strokes anymore — that terrain is now real map art.
- **Towers are 16×16 diamonds** (a `<rect>` rotated 45°): standing = filled team color (`#22c55e` Radiant / `#ef4444` Dire) with a solid **white** stroke; destroyed = near-transparent fill with a **dashed** white-ish stroke. Both properties changed from the schematic version (which used a flat near-black background and opacity alone to distinguish state) because a real, colorful, varied-terrain background has no single flat color to design contrast against — white stroke pops on any terrain, and the dashed pattern is a second, colorblind-safe cue beyond just fill/opacity. **A dark halo rect** (`rgba(0,0,0,0.6)` stroke, no fill, ~1.5px larger on each side, same rotation) renders behind every marker — a plain white stroke alone still washed out against light terrain (grass, sand); the halo is the same outline-behind-fill trick already used for the RAD/DIRE base labels below, applied to the towers too (2026-07-30, size bumped 13→16 at the same time). The halo rect is untagged; the visible marker rect carries `data-tower-marker="true"` so `dota-minimap.test.jsx`'s marker-count and destroyed-count assertions can scope past it.
- **Ordering is the load-bearing correctness property, not just a visual one.** Each lane/side's 3 positions are ordered `[T1, T2, T3]` = farthest-from-that-side's-own-base to closest — a real bug (Dire's top and bot lanes had this backwards, drawing Dire's outermost tower near its own base instead of near the enemy's) shipped once and was caught only by the owner visually inspecting the live map, not by any test, because the original tests checked marker *count* and *destroyed-state count*, never *position*. `TOWER_POSITIONS`/`BASE_POSITIONS` are exported specifically so `dota-minimap.test.jsx`'s geometry regression tests can assert T1 is farther from a side's own base than T3, per lane per side — any future coordinate change must keep passing those. Coordinates were re-traced by hand against the real texture's visible lane corridors (2026-07-28) and manually re-verified against this exact property before shipping, given the ordering bug's history.
- Base corners: outlined text labels only (`RAD`/`DIRE`, `paintOrder="stroke"` so a dark stroke sits behind the colored fill for legibility against the texture) — the schematic's two-ring glow circles were dropped since the real texture already shows both bases clearly; a redundant ring would compete with real art instead of complementing it.
- **The caption below the map is not decorative — do not remove, shrink below legibility, or make conditional.** `Towers only — barracks, base towers & Ancient status unknown` renders every time the map renders, unconditionally. This exists because `building_state` cannot determine barracks/tier-4/Ancient state (confirmed by direct disproof, not absence of signal — see `CONTEXT.md`, "R4.0 decode spike") — the map draws literally nothing for those, and the caption is what stops "no marker" from being misread as "confirmed standing." Any future redesign of this surface must preserve an equally-legible version of this statement.
- `aria-label` on the `<svg>` (`role="img"`) states the same per-lane counts AND the same unknown-scope sentence, built by the exported pure `buildMinimapAriaLabel()` — screen-reader users get the identical caveat, not just a bare count.
- Gated by `showLiveStory` only (spoiler-free hides it, same rule as momentum/stakes/graph) — the `isOwner &&` frontend gate was dropped 2026-07-31 (was always a staged-rollout flag, not a security boundary; the API already returned `objectives` to every request regardless, since `SeriesLivePulse.jsx`'s only caller of `fetchLiveGamePulse` has always hardcoded `owner=1` — see "PS ↔ OD Data Connection" / `CONTEXT.md` R4 Phase C). `isOwner` prop threading (`App.jsx` → `LiveSeriesSheet.jsx` → `SeriesLivePulse.jsx`) removed as dead code in the same pass — `App.jsx`'s own `isOwner` still exists and still gates the unrelated Draft X/Reddit-posts owner tools.

### Live draft rows (`SeriesLivePulse.jsx` `DraftPickRow`)
- **Same row shape as `DraftDisplay`'s spoiler-free row** (do NOT design a separate pattern — mirror it so the two never drift): two columns headed by the team name (`text-[10px] font-semibold uppercase tracking-widest`, green-600/red-600), then per-pick rows — `flex items-center gap-2 px-2 py-1.5 rounded border`, side-tinted (`bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50` / red), a 32px hero icon (`w-8 h-8 rounded-sm`), and the hero name (`font-semibold text-xs truncate min-w-0`).
- **Deliberately omits per-player KDA and player IGN.** OD `/live` carries no per-player kills/deaths/assists (only the team-level score, shown in the score row), and player names aren't captured yet. The row is the same shape a future IGN/stat slot attaches to — not a dead end.
- A hero whose name hasn't resolved yet (hero map still loading, or `hero_id` 0 in draft phase) degrades to icon-only (placeholder tile + no label) — never a broken image or a raw "Hero 155".
- Renders regardless of spoiler-free (a draft is pre-outcome, same rule as `DraftDisplay` and the finished-game strip).

---

## Live feed row — "worth watching" signal badge (public, built owner-only 2026-08-01, flipped public 2026-08-03)

A per-row badge in `LiveMatchRow.jsx`'s sub-row, answering a different question than everything in
the companion sheet above: not "how's this game going" for a game a fan already opened, but "which
of several simultaneous live rows is worth opening at all." Spec: `.claude/specs/
live-worth-watching-signal-spec.md`. Computed server-side (`src/utils/liveSignal.js` +
`api/live-matches.js`'s `resolveLiveSignals`) from `live_game_map`'s net-worth lead only — no new
data source. Renders for every viewer — the only way to disable it is the `feature:live-signal` KV
kill switch (`isFeatureEnabled`, `api/_shared.js`), not viewer identity.

- **Three states, one badge, never stacked:** `CLOSE` and `SWINGING` share one **positive**
  treatment (`text-red-500`, `text-[10px] font-bold uppercase tracking-wide`) — red is the row's
  existing live-state color (the pulse dot, `G3`), so the badge reads as part of that cluster
  rather than a fourth hue. `ONE_SIDED` is deliberately **recessive**
  (`text-gray-500 dark:text-gray-500`, same size/weight) — low contrast *is* the message
  ("deprioritize this row"). No badge at all (the ordinary-competitive-game case) renders nothing —
  absence carries meaning, same as the tower map's "no field = don't render" rule above.
- **Copy:** bare state word (`CLOSE`, `SWINGING`, `ONE-SIDED`) plus an `aria-label` on the same
  span (`"Current game is close"` / `"Current game has a big momentum swing"` /
  `"Current game is one-sided"`) — a bare "CLOSE" reads ambiguously as a verb to a screen reader
  without it. No color-only cue: the badge is real text.
- **Mobile yield rule — the badge wins, `bracketRound` loses.** Below `sm:`, when a badge is
  present, `bracketRound` gets `hidden sm:inline` (and its preceding middot the same class) so the
  sub-row reads `● G3 · CLOSE` instead of overflowing with all three tokens. Desktop keeps all
  three: `● G3 · Upper Bracket Final · CLOSE`. The middot between `G3` and "whatever's next" is
  NOT breakpoint-gated — on every viewport, something (bracketRound or the badge) always follows
  it when currentGame is present, so it needs no responsive class of its own.
- **Two suppressions on top of the spec, both scoped to `ONE_SIDED` only** (a pre-build critique
  finding, `/dota_data_scientist` + `/dota_analyst` + `/dota_pm`, 2026-08-01) — `CLOSE`/`SWINGING`
  are a positive read and are never suppressed: a followed team's row never gets the recessive
  treatment (a partisan fan behind is often more invested, not less), and neither does a Grand
  Final or BO3/BO5 decider (`isGrandFinal(bracketRound) || computeStakes(...).kind === 'DECIDER'`)
  — a lopsided score in either context is still appointment viewing.
- **Spoiler-free suppresses all three states unconditionally** — same rule as the companion sheet's
  outcome-adjacent surfaces above.
- **No animation, no skeleton, no layout shift.** A 10px label doesn't deserve a placeholder, and a
  shimmering badge implies data that may never arrive; the row's sub-row already reserves a fixed
  `min-h` so a badge appearing/disappearing on the next poll never shifts anything around it.

---

## Glanceable live score — browser tab title, PWA badge, score notification

Three surfaces that render a running game's state **outside the app's own chrome**, for a fan who
isn't looking at the site. All formatting lives in `src/utils/liveScore.js`; the server-side push
copy imports the same module, so the two can't drift. Spec: `.claude/specs/glanceable-live-score-spec.md`.

These are the only places in the product where layout is not ours to control — the browser truncates
the tab, the OS truncates the notification. Ordering is therefore a **design decision, not a
formatting detail**.

### Browser tab title (`useLiveScoreTabTitle`, in `SeriesLivePulse.jsx`)

```
24(+2.4k)-19 Tundra v BetBoom
```

- **Score first.** A browser tab shows ~12-18 characters. `24(+2.4k)-1…` still answers the question;
  `Tundra vs Bet…` does not. Do not "fix" this into name-first for consistency with the notification
  title — the two have different truncation budgets, and this ordering is the whole point.
- **The gold lead is fused into the score group, not appended after the names.** A first version
  put it last (`24-19 Tundra v BetBoom · Tundra +2.4k`) on the theory that losing it to truncation
  "only" cost precision — in practice the tab almost always truncates before that trailing clause is
  ever visible, so the gold lead was routinely invisible in real use. It now sits as a parenthetical
  directly on the leading side's own digit (`24(+2.4k)-19`), inside the part of the title that
  actually survives truncation. **Do not move it back to a trailing clause.**
- **The first score belongs to the first-listed name, and the parenthetical inherits that same
  attribution** — it sits on whichever digit belongs to the side that's ahead, never as a bare,
  unattributed `+2.4k` and never repeating the team name to stay unambiguous. That positional
  attribution IS what keeps a title truncated at any point legible. Never insert anything between
  the score group and the names.
- Team names go through `shortTeamName()` (strips `Team `, ` Esports`, ` Gaming`, ` Club`). Org
  boilerplate is pure noise at this character budget, and names are now the LAST thing in the
  title — the part that's fine to lose to truncation once you already know which series you opened.
- **No kill score → return null and leave the title alone.** Never a fabricated `0-0` — same rule as
  `SeriesGameScore` and the draft strip's "Stats indexing" fallback.
- **Spoiler-free suppresses it unconditionally.** No opt-in, no override. Unlike the score
  notification, the tab title is a passive surface the fan never consented to.
- Restore the captured original title exactly on unmount. A score that outlives its live game is
  worse than no score.

### PWA icon badge

- Counts live series involving a **followed** team only. A badge means "something of yours is
  happening"; with zero follows there is nothing of yours, so no badge.
- A badge is a count, not a result — spoiler-free does **not** suppress it.
- Never badge with anything other than a count. The Badging API renders a number or a bare dot
  depending on platform, so any meaning beyond magnitude is lost.

### Live-score notification

- **The one alert type that carries a result, and therefore the one that defaults OFF.** Every other
  push type (`soon`/`live`/`replay`) stays spoiler-safe and defaults on. Do not relax that rule for
  them, and do not flip this one's default.
- Title is **name-first** (`Tundra 24-19 BetBoom`) — a notification title has ~35 characters, so it
  can use the natural reading order rather than the tab's truncation-first one.
- Body clauses (`Game 2 · BO3 1-0 · Tundra +2.4k · 32 min`) are each dropped independently when their
  source is missing. A sparse pulse produces a shorter honest line, never a placeholder.
- **One constant `tag` per series + `silent: true`.** Each send replaces the previous notification in
  place. That in-place update is what makes a stream of these read as a glanceable score rather than
  a stack of alerts, and silence is what keeps an ambient update from interrupting like a kickoff
  alert. Do not add `renotify`.
- Its settings row lives in the existing "Customize alerts" nested panel (see "Nested settings row"
  above) — no new pattern. When spoiler-free is on, the caveat rides in the row's **sublabel**, in the
  ordinary tertiary style; do not invent a warning color for it. Red and amber both already mean
  something else, and the copy carries the message on its own.

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

`TOOLTIP_SURFACE` (see Floating layer) at `inline-flex items-center gap-2 px-2.5 py-[7px] text-[13px] leading-none`. Only the measured `left`/`top` stay inline. The per-span colors below remain inline because they're per-event *data* (side color, chip color), not design tokens:

```
[icon in sideColor]  [Event Label]  ·  [Subject]  ·  [Xm]  [WATCH?]
```

- **Icon**: 12×12 icon in side color
- **Event label**: "Roshan", "Roshan 2", "Rampage", or "Divine Rapier"
- **Subject**: team name for Roshan; player name for Rampage; `player · hero` for Rapier (falls back to team name)
- **Minute**: `Math.floor(event.time / 60)` in tabular-nums, color #9ca3af
- **WATCH**: amber `#f59e0b`, 11px, uppercase, shown only when `eventUrl` is non-null

**Flip logic**: when `(markerX - PL) / CW > 0.45` the card prefers the marker's left side (`markerVPX - tipW`, using the width `useLayoutEffect` measured), otherwise it offsets 4px right. Either way the result goes through `clampLeft(..., tipW)`, so both bounds apply and a narrow viewport can't push the card off the opposite edge.

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

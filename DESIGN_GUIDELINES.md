# Design Guidelines

Reference this file before making any UI or UX change. Every decision should be
defensible against these principles.

---

## Philosophy

**Minimal esports.** The product exists to surface information fast, without ego.
Every element earns its place or gets cut. When in doubt, remove. Don't add.

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

### Grand Final match cards
- Detected when `series.tournament.toLowerCase().includes('grand final')`
- Card background: `bg-amber-50/60 dark:bg-amber-950/20`
- Card border: `border-amber-500/70 dark:border-amber-500/60`, hover: `hover:border-amber-500 dark:hover:border-amber-400`
- Internal dividers: `border-amber-200 dark:border-amber-800/50`
- Trophy badge in the tournament header row: trophy emoji + "Grand Final" label in `text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wide`
- Do NOT animate-pulse the card border or background
- Amber is used here at the card level only - section label `border-l-2 border-amber-500` for My Teams remains unchanged

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

## What to Avoid

- Adding sections "just in case" — every section needs a job
- Repeating information across tabs or sections
- Overusing red — it loses meaning if it appears too often
- Nested navigation (tabs inside tabs) — flatten or consolidate
- Generic spinner for anything with predictable content shape — use skeleton instead
- Arbitrary widths/heights not derived from the spacing scale
- Decorative borders or dividers that don't separate distinct content zones
- Copy that apologizes ("Sorry, no results") or over-explains obvious states

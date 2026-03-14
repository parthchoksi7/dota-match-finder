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

**Underline tabs** (tournament/event switcher, full-width navigation rows):
- Active: `border-b-2 border-red-500 text-gray-900 dark:text-white`
- Inactive: `border-b-2 border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white`
- Use when: switching between top-level items (e.g. multiple active tournaments)

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
- Tone: confident, not apologetic. "Nothing matched." not "Sorry, no matches found."
- Style: `text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center`
- Wrapper padding: `py-8` for full-section empty states, `py-4` for inline/compact states
- Action button: ghost variant (`border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600`), `mt-4` below the copy line

### Live indicators
- Pulsing red dot: `inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse`
- Only used for genuinely live/running states — never as decoration
- In bracket round column labels: swap label to `text-red-500` and prepend a `w-1 h-1` pulse dot when any match in that round is `status === 'running'`
- Live bracket match card: `border-red-500/80 bg-red-500/5` — do NOT animate-pulse the card itself (fades text content)

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

## What to Avoid

- Adding sections "just in case" — every section needs a job
- Repeating information across tabs or sections
- Overusing red — it loses meaning if it appears too often
- Nested navigation (tabs inside tabs) — flatten or consolidate
- Generic spinner for anything with predictable content shape — use skeleton instead
- Arbitrary widths/heights not derived from the spacing scale
- Decorative borders or dividers that don't separate distinct content zones
- Copy that apologizes ("Sorry, no results") or over-explains obvious states

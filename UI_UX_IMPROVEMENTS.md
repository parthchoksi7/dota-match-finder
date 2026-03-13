# UI/UX Improvement Plan

Recommendations for Dota Match Finder, as if managing the product. Ordered by impact and effort.

---

## 1. **Loading & feedback**

- **Initial load**: Show a skeleton or spinner while `fetchProMatches()` runs. Right now the header/search appear immediately but matches aren’t available yet; a small “Loading matches…” or skeleton in the main area would set expectations.
- **Search**: The 300ms artificial delay is good for perceived responsiveness; keep a clear loading state (e.g. disabled search button + “Searching…” or a subtle spinner in the search bar).
- **VOD lookup**: “Finding VOD…” is clear; consider a small progress hint if you ever search multiple channels (e.g. “Checking ESL…” → “Checking BTS…”).
- **AI summary**: Disable the “AI Match Summary” button and show “Generating…”; optionally show a short skeleton where the summary will appear so the panel doesn’t jump.

---

## 2. **Empty & error states**

- **No results**: “No matches found” is good. Add one suggested action: e.g. “Try a different team or tournament” with a link/button that clears the search and refocuses the input.
- **API failure**: “Failed to load matches.” could include a “Retry” button that calls `fetchProMatches()` again and clears the error on success.
- **No VOD**: “No VOD found” could briefly explain why (e.g. “VOD may not be published yet or wasn’t streamed on supported channels”) and maybe “Check back later” or a link to Twitch search.

---

## 3. **Search & discovery**

- **Search on Enter**: You already submit on Enter; ensure the search input is the primary focus when the page loads (e.g. `autoFocus` or focus after first load) so users can type and hit Enter immediately.
- **Recent or popular**: If you have room, a few “Recent searches” or “Popular: Team Liquid, OG, DreamLeague” could speed repeat use.
- **Clear search**: A clear (×) or “Clear” control when there’s a query (and especially when results are shown) so users can reset without deleting manually.

---

## 4. **Selected match panel (Now Watching)**

- **Sticky / persistent**: On scroll, keep the “Now Watching” panel sticky below the header (or as a compact bar) so the Watch / Summary actions stay visible.
- **Copy link**: “Copy VOD link” next to “Watch on Twitch” helps people share or open in another tab.
- **Keyboard**: Allow Escape to dismiss the panel; ensure focus is moved back to the list or search when it closes.

---

## 5. **Match cards & list**

- **Result count**: “X series” is useful; consider “X series (Y games)” for clarity.
- **Card affordance**: Row hover already suggests clickability; ensure the whole row is a single click target (it is) and that the cursor is pointer. A very subtle “Watch” or play icon on hover could reinforce “click to get VOD”.
- **Duration**: Game duration is in `HH:MM` (from ISO); if that’s not human-friendly, show “1h 23m” or “45m” for quick scanning.
- **Series type**: Optionally show “BO3” / “BO5” next to the tournament name so users know series length at a glance.

---

## 6. **Visual hierarchy & consistency**

- **Focus states**: All interactive elements (search input, buttons, card rows, Dismiss, AI Summary) should have visible focus rings for keyboard users (e.g. `focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-950`).
- **Buttons**: Align disabled states: e.g. `disabled:opacity-60 disabled:cursor-not-allowed` on Search and AI Summary so it’s obvious they’re not clickable.
- **Borders**: You use `border-gray-800` widely; consider a single border color variable or Tailwind theme so future tweaks are one place.
- **Letter-spacing in tables**: Use `tracking-wide` (not `tracking-widest`) for `text-xs` column headers inside fixed-width columns. `tracking-widest` adds ~3 px per character gap which pushes short labels like "Picks" or "Win%" beyond a `w-10` (40 px) column boundary and causes visible overlap with adjacent cells.

---

## 7. **Responsive & touch**

- **Touch targets**: On mobile, ensure buttons and list rows have at least ~44px height; padding on `MatchCard` rows and SearchBar buttons might need a bump on small screens.
- **Header**: The “Powered by OpenDota + Twitch” in the header is `hidden md:block`; that’s fine. Ensure the logo/title doesn’t wrap awkwardly on narrow screens (e.g. shorten to “Match Finder” on very small if needed).
- **Footer**: Footer text could stack on small screens (“Built by Parth” on one line, “Powered by…” on the next) if the line gets too long.

---

## 8. **Accessibility**

- **Landmarks**: Wrap main content in `<main>` and keep one `<h1>` (you have it). Add `aria-live` for dynamic messages (e.g. “No matches found”, “Finding VOD…”) so screen readers get updates.
- **Errors**: Associate error text with the search form using `aria-describedby` or `aria-errormessage` when `error` is set.
- **Labels**: Search type (Team vs Tournament) is clear; ensure the search input has an associated `<label>` (visible or sr-only) for screen readers.

---

## 9. **Performance & polish**

- **Fonts**: Barlow is loaded (likely from Google Fonts); consider `font-display: swap` and preconnect to the font origin to avoid layout shift.
- **List length**: If a search returns many series, add pagination or “Load more” (e.g. show 10, then “Show more”) to keep initial render and scroll smooth.
- **VOD in background**: When a user clicks a game, you could start resolving the VOD in the background while expanding the panel, so “Finding VOD…” is shorter or already done when they look.

---

## 10. **Nice-to-haves**

- **Dark/light**: You’re dark-only; a theme toggle would be a plus for some users (and good practice).
- **Share**: “Share this match” that copies a link to the app with match id or search pre-filled (if you add routing).
- **Filters**: After search, filters like “Has VOD” or “BO5 only” could narrow results without a new query.

---

## Summary

| Priority | Area              | Example change                          |
|----------|-------------------|-----------------------------------------|
| High     | Loading           | Initial load skeleton or spinner        |
| High     | Errors            | Retry on “Failed to load matches”       |
| High     | A11y              | Focus styles, aria-live, labels         |
| Medium   | Empty states      | Clear search, retry, short explanations  |
| Medium   | Selected match    | Sticky panel, copy VOD link             |
| Medium   | Mobile            | Touch target size, footer wrapping      |
| Low      | Discovery         | Recent/popular searches, BO3/BO5 label  |
| Low      | Polish            | Duration format, pagination, theme      |

If you want to implement a subset, start with: **initial load state**, **Retry on error**, and **focus + aria-live** for accessibility; then add **sticky Now Watching** and **copy VOD link** for daily use.

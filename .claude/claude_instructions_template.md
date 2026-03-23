# Project Instructions for Spectate Esports

Claude should follow these guidelines for ALL tasks in this project:

---

## Design Guidelines (UI/UX changes)

Before making any UI or visual change:

1. **Read `DESIGN_GUIDELINES.md`** at the repo root before touching any component
2. **Check every decision** against the principles there (color tokens, spacing scale, typography hierarchy, component patterns, motion rules)
3. **After making UI changes**, review `DESIGN_GUIDELINES.md` and update it if the change introduces a new pattern, overrides an existing one, or reveals a gap. Keep it current so it reflects the actual codebase.

This applies to: className edits, new components, loading/empty/error states, animations, and copy changes.

4. **Check tab/label overflow on mobile** - any row of tabs, pills, or segmented controls must use `flex w-full` with `flex-1` on each item (not `inline-flex`) so labels never clip on narrow screens. Also avoid `tracking-widest` on tab labels; use `tracking-wide` at most. Verify mentally at ~320px width before committing.

---

## Required Updates for Any New Feature or Interaction

### 1. About Page
- File: `src/pages/AboutPage.jsx`
- Update the feature list with new capabilities
- Add brief descriptions of what the feature does

### 2. Context Documentation
- File: `CONTEXT.md`
- Add new features to the appropriate section
- Document new API integrations or dependencies
- Update the "Known Issues/Limitations" section if relevant
- Add to the "Backlog/Future Ideas" if there are follow-up enhancements

### 3. Release Notes
- File: `src/pages/ReleaseNotesPage.jsx` (the `RELEASES` array at the top)
- Add entry for every new feature or bug fix
- Include: date, tag ("new"/"improvement"/"fix"), title, desc, and optional items array
- Keep most recent releases at the top of the array

### 4. robots.txt and Sitemap
- File: `public/robots.txt`
  - Add an explicit `Allow:` line for every new **public** route (e.g. `/tournaments`, `/tournament/`)
  - Never disallow routes that users or search engines should be able to reach
  - **NEVER add `/analytics` to the Allow list** — it is a private, password-protected internal tool and must stay `Disallow: /analytics`
- File: `api/sitemap.js`
  - Add a `<url>` entry for every new static **public** page route (e.g. `/tournaments`)
  - Use `<priority>0.8</priority>` and `<changefreq>daily</changefreq>` for high-value pages
  - Use `<priority>0.5</priority>` and `<changefreq>weekly</changefreq>` for lower-traffic pages
  - Dynamic per-item pages (e.g. `/tournament/:id`) do not need sitemap entries unless there is a finite, known list to enumerate
  - **NEVER add `/analytics` to the sitemap** — it is private and must not be indexed by search engines

### 5. Analytics Tracking
- Add Google Analytics event tracking for ALL new user interactions
- Event naming convention: `feature_action` (e.g., `vod_click`, `summary_generate`)
- Required for: buttons, links, form submissions, drawer opens/closes
- Always use `trackEvent` imported from `../utils` (or `../../utils`). **NEVER define a local `trackEvent` or `logEvent` function in a component** — this creates duplication and drift.

### 6. Automated Testing
- Write tests for all new features before marking them complete
- Test files should live in `__tests__/` or `*.test.js` files
- Cover:
  - Happy path (feature works as expected)
  - Edge cases (empty data, API failures, missing fields)
  - User interactions (clicks, inputs, navigation)
- Use existing testing framework (React Testing Library + Vitest/Jest)

### 7. Regression Testing
- Make a calculated decision on whether to run the full test suite based on the scope of changes. You are the expert - use your judgement.
- Run regression (`npm test`) when:
  - Changes touch shared utilities, API handlers, or components used across multiple pages
  - A bug fix could have introduced a new edge case
  - Refactoring touched core logic
- Skip regression when:
  - Changes are isolated UI additions (new text, new card, new modal) with no shared logic modified
  - The only changed files are a single new component plus its dedicated test
  - Changes are purely additive (new route, new copy, new release note entry)
- If you run regression, report the result. If you skip it, briefly state why.

---

## Vercel Serverless Function Limit

**The Hobby plan allows a maximum of 12 serverless functions per deployment.**

- Count the deployable functions in `api/` before adding any new ones: `ls api/[^_]*.js | wc -l`
- Current count is 12 (the maximum). Do NOT add new `.js` files to `api/` without first merging or removing an existing one.
- **Exception**: Files prefixed with `_` (e.g. `api/_shared.js`) are NOT deployed as serverless functions and do NOT count toward the limit. Use `api/_shared.js` for shared utilities that multiple functions need. The plain `ls api/*.js | wc -l` will show 13 due to `_shared.js` — this is expected and correct.
- When a new feature needs a backend endpoint, merge it into the closest existing file using a query param or POST body field to distinguish behavior. Common patterns:
  - Add `?mode=newfeature` to an existing GET endpoint
  - Add `type: 'newfeature'` to an existing POST endpoint body
  - Add `?series=1` or similar flag to extend an existing endpoint
- Document which endpoints share a file in `CONTEXT.md`

---

## Cost Optimization Requirements

### API Rate Limits and Caching
- **Always check if data can be cached** before making API calls
- Use `localStorage` or `sessionStorage` for:
  - Hero data (rarely changes)
  - Match summaries (never change once generated)
  - Twitch tokens (valid for ~60 days)
- Implement rate limiting on the frontend:
  - Debounce search inputs
  - Prevent duplicate concurrent requests
  - Show "already loading" states
- **Free API limits to respect:**
  - OpenDota: No hard limit but avoid spam
  - Twitch: Rate limited per client ID
  - Anthropic Claude: Pay-per-use (minimize unnecessary calls)
  
### Caching Strategy
- Cache hero list on first load (store in `localStorage` with expiry)
- Cache match summaries by match ID (never regenerate)
- Cache Twitch tokens until expiry
- For search results: cache the filtered view, not raw API data
- Add cache invalidation logic if data becomes stale

### Before Adding New API Calls
- Ask: "Can this be computed locally instead?"
- Ask: "Can we batch multiple requests?"
- Ask: "Can we cache the response?"
- Document the caching strategy in `CONTEXT.md`

---

## Code Quality Standards

### File Organization
- Components in `src/components/`
- API calls in `src/api.js`
- Utilities in `src/utils.js`
- Serverless functions in `api/`

### Error Handling
- Always wrap API calls in try-catch
- Show user-friendly error messages that explain what failed and what to do next
- **Document failure modes**: For every feature, explain what happens when:
  - API is down or rate limited
  - Network connection fails
  - Data is missing or malformed
  - User has no internet connection
- Give users clear next steps (e.g., "Try again in a few minutes" or "Check your internet connection")
- Log errors to console for debugging
- Never let the app crash silently

### Comments
- Add brief comments for complex logic
- Document why, not what (code should be self-explanatory)
- Add JSDoc for reusable utility functions

### Writing Style
- **Never use em dashes (—)** in any user-facing text, code comments, or documentation
- Use hyphens (-) or rewrite sentences to avoid the need for dashes
- Keep language simple and clear for beginner-friendly communication

---

## Deployment Checklist

Before deploying to production:

1. ✅ Run regression tests (`npm test`)
2. ✅ Check all new features have GA tracking (use `trackEvent` from `src/utils.js` — never define locally)
3. ✅ Verify API rate limits won't be exceeded
4. ✅ Test on mobile viewport
5. ✅ Update `CONTEXT.md` with changes
6. ✅ Update About page
7. ✅ Update `src/pages/ReleaseNotesPage.jsx` with new release entry
8. ✅ Run through relevant scenarios in `QA_PROCESS.md`
9. ✅ Ask user: "Ready to deploy? All tests passed and docs updated."

---

## Owner-Only Features

These features are intentionally hidden from public documentation. They are gated by a localStorage key and only accessible to the site owner. Do NOT document them in CONTEXT.md, About page, or Release Notes.

### Draft X Posts

- Enabled by: `localStorage.setItem('spectate-owner', 'true')` in the browser console
- When enabled, a "Draft X posts" button appears on completed series cards in `MatchCard`
- Button opens `XPostsModal` (src/components/XPostsModal.jsx)
- `App.jsx` calls `/api/draft-posts` with series metadata and game replay URLs
- `api/draft-posts.js` uses Claude Haiku to generate one post per game (under 200 chars + link)
- `api/og.js?mode=series` generates a downloadable series summary image (winner, score, tournament, format) — merged into `api/og.js` to stay within the 12-function limit
- Posts vary in tone across games (opener, momentum shift, decider narrative)
- Each post ends with the Spectate match URL as the CTA/replay link
- `XPostsModal` shows posts per game with a one-click Copy button; closes on Escape or backdrop click
- Hidden in spoiler-free mode

### Draft Reddit Posts

- Enabled by the same `spectate-owner` localStorage flag
- A "Draft Reddit" button (Reddit alien icon) appears next to the "Draft X posts" button on completed series cards
- Button opens `RedditPostsModal` (src/components/RedditPostsModal.jsx)
- `App.jsx` calls `/api/reddit-posts` with series metadata; no VOD fetching needed
- `api/reddit-posts.js` uses Claude Haiku in a single call to generate two posts:
  - **VOD Roundup Post** - fully spoiler-free; suitable for r/DotaVods or r/Dota2; includes title and body separately so they can be pasted into Reddit's post form
  - **Match Thread Comment** - can reference the result; 2-4 sentences; suitable for dropping in a post-match discussion thread
- All links use `?spoilers=off` so recipients land in spoiler-free mode automatically
- `?spoilers=off` URL param also works as a standalone entry point - enables spoiler-free mode on load and persists it to localStorage
- `RedditPostsModal` shows amber-accented VOD Roundup section with separate "Copy title" and "Copy post" buttons, plus a standard gray Match Thread Comment section
- Hidden in spoiler-free mode (same as X posts)

---

## Notes for Claude Code

- This is a beginner-friendly project - explain technical decisions
- Always show what changed and why
- If something breaks, explain how to fix it
- When in doubt, ask before making breaking changes

# Project Instructions for Spectate Esports

Claude should follow these guidelines for ALL tasks in this project:

---

## Design Guidelines (UI/UX changes)

**Core design mindset:** Whenever making any UI or design decision, think like a world-class UI/UX designer specializing in sports and esports (Sofascore, FlashScore, ESPN, HLTV, Liquipedia). Don't just make it functional — make it feel premium and purpose-built. Ask "what would Sofascore do here?" before every layout, color, or interaction decision.

Before making any UI or visual change:

1. **Read `DESIGN_GUIDELINES.md`** at the repo root before touching any component
2. **Check every decision** against the principles there (color tokens, spacing scale, typography hierarchy, component patterns, motion rules)
3. **After making UI changes**, review `DESIGN_GUIDELINES.md` and update it if the change introduces a new pattern, overrides an existing one, or reveals a gap. Keep it current so it reflects the actual codebase.

This applies to: className edits, new components, loading/empty/error states, animations, and copy changes.

4. **Check tab/label overflow on mobile** - any row of tabs, pills, or segmented controls must use `flex w-full` with `flex-1` on each item (not `inline-flex`) so labels never clip on narrow screens. Avoid `tracking-widest` specifically on segmented control and underline tab labels — the extra letter-spacing compounds with the label width and causes clipping on 320px screens; use `tracking-wide` at most for those. Tertiary metadata labels (dates, formats, section headers, badges) should still use `tracking-widest` per the typography rules in DESIGN_GUIDELINES.md. Verify mentally at ~320px width before committing.

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

### 4. AI + Search Discoverability
- Read `.claude/ai_discoverability.md` and apply its implementation checklist before finalizing any new feature
- **New public route** → add a handler in `middleware.js` (matcher + route function + JSON-LD + semantic HTML in root div)
- **New public route** → add entry to `public/llms.txt` (page link + one-line description of what it contains)
- **New entity type** (hero, player, team) → add to `public/llms-full.txt` with schema and known values; add `SportsTeam`/`Person`/`Thing` JSON-LD to middleware
- **New API endpoint or mode** → add URL to "Machine-Readable Endpoints" section in `public/llms.txt`; add response schema to `public/llms-full.txt`
- **Every page** must pass the bare-HTML test: `curl -A "GPTBot/1.0" https://spectateesports.live/{route}` should return a meaningful `<h1>`, `<meta name="description">`, `<link rel="canonical">`, and `<script type="application/ld+json">`

### 6. robots.txt and Sitemap
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

### 7. Analytics Tracking
- Add Google Analytics event tracking for ALL new user interactions
- Event naming convention: `feature_action` (e.g., `vod_click`, `summary_generate`)
- Required for: buttons, links, form submissions, drawer opens/closes
- Always use `trackEvent` imported from `../utils` (or `../../utils`). **NEVER define a local `trackEvent` or `logEvent` function in a component** — this creates duplication and drift.

### 8. Automated Testing

**New pure functions, API modes, and data-pipeline logic require dedicated tests. No exceptions.**

UI-only additions (new copy, new static card, new route with no shared logic modified) do not require new tests but must not break existing ones.

- Test files live in `__tests__/` or `*.test.js` files
- Cover at minimum:
  - Happy path (feature works as expected)
  - Edge cases (empty data, API failures, missing/null fields)
  - Boundary conditions (off-by-one, empty arrays, zero values)
  - User interactions (clicks, inputs, navigation) for UI changes
- Use existing testing framework (React Testing Library + Vitest/Jest)
- New pure utility functions (especially those in `api/_shared.js` or `src/utils.js`) must have dedicated unit tests in `__tests__/`
- New API handler modes (`?mode=...`) must have integration-style tests covering the core logic path
- Run `npm test` after writing tests and confirm they pass before proceeding

### 9. Code Review (as a completely different developer)

After making any code change, do a fresh independent read of **every modified file** as if you are seeing the code for the first time. Assume the author made mistakes. Actively look for:

- **Logic errors**: wrong field name, inverted condition, wrong object passed to a function, off-by-one
- **Missing `res.ok` checks**: always check `res.ok` before calling `.json()` on a fetch response; a non-2xx response that passes silently to `.json()` can populate a cache with garbage data
- **Poisoned caches**: a module-level or KV cache set to a bad value (empty `Set`, `null`, error object) on API failure will persist silently until process restart, causing all downstream data to be hidden or wrong
- **Broken imports**: a removed or renamed export still imported elsewhere; catch with `grep -r` across the whole repo, not just the touched files
- **Inconsistency between server and client versions**: the same helper duplicated in `api/_shared.js` and `src/api.js` must behave identically (same error handling, same field names, same fallback values)
- **Stale comments and documentation**: comments that contradict the new code; `CONTEXT.md`, `QA_PROCESS.md` sections that still describe old behavior

Use the `Explore` subagent to read and report on each modified file, then fix every issue before committing.

If you notice a refactor opportunity (duplicate logic, untested pure function, dead code) while reviewing, add it to `.claude/pending-refactors.md` with file path + line range. Do not do it inline unless it is trivially small and isolated.

### 10. Regression Testing
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
- **Exception**: Files prefixed with `_` (e.g. `api/_shared.js`, `api/_watchability.js`, `api/_liquipedia.js`) are NOT deployed as serverless functions and do NOT count toward the limit. The authoritative count is `ls api/[^_]*.js | wc -l` — this must equal 12. The plain `ls api/*.js | wc -l` will be higher (currently 15) because it includes the underscore-prefixed utility files; this is expected.
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
- Default to no comments. Add one short line only when the WHY is non-obvious: a hidden constraint, a workaround for a known external bug, a subtle invariant that would surprise a reader.
- Do not comment on WHAT the code does — well-named identifiers already do that.
- No JSDoc, no multi-line comment blocks.

### Writing Style
- **Never use em dashes (—) in user-facing UI copy.** In technical documentation and code comments, hyphens or sentence rewrites are preferred but em dashes are acceptable where clarity benefits.
- Keep user-facing copy direct and confident. No apologetic language ("Sorry, no results").

---

## Deployment Checklist

Before deploying to production:

1. ✅ **Tests written and passing**: confirm that every new function, API mode, or logic path added in this change has corresponding tests in `__tests__/` or `*.test.js`. Run `npm test` and confirm all new tests pass. Do not deploy if new code has no tests.
2. ✅ Run full regression tests (`npm test`) and confirm no pre-existing tests are broken
3. ✅ **Code review**: re-read every modified file as an independent reviewer (see §7 above); fix all issues found
4. ✅ **QA step** (beyond unit tests): run through `QA_PROCESS.md` scenarios relevant to the change; for any new API field being read, verify the field name against actual API docs or a live response; for any filter/tier change, manually confirm at least one known tier-S event appears and at least one non-tier-S event is excluded. **CRITICAL: if you add a new query parameter to any external API URL, manually verify that the parameter is accepted by that exact endpoint before shipping** - mocked unit tests do not catch 400/404 responses from the real API. PandaScore note: `filter[tier]` only works on the generic `/tournaments` endpoint, not on game-specific `/dota2/*` endpoints.
5. ✅ **AI + search discoverability** — for any new route, API, or entity: middleware handler added, JSON-LD present, `public/llms.txt` updated, `public/llms-full.txt` updated if needed; run the bare-HTML test: `curl -A "GPTBot/1.0" https://spectateesports.live/{route}` must return real content (not an empty div)
6. ✅ Check all new features have GA tracking (use `trackEvent` from `src/utils.js`; never define locally)
7. ✅ Verify API rate limits won't be exceeded
8. ✅ Test on mobile viewport
9. ✅ Update `CONTEXT.md` with changes
10. ✅ Update About page
11. ✅ Update `src/pages/ReleaseNotesPage.jsx` with new release entry
12. ✅ **Bust KV caches affected by the change** — after any deploy that modifies tier filtering, stream caching, or tournament data logic, bust the relevant caches:
    - Tier-1 league names (homepage match filter): `curl "https://spectateesports.live/api/tournaments?mode=tier1-leagues&bust=1"`
    - Live matches: `curl "https://spectateesports.live/api/live-matches?bust=1"`
    - Tournament list: `curl "https://spectateesports.live/api/tournaments?bust=1"`
    - Only bust what the change actually affects — not all caches every time.
13. ✅ Ask user: "Ready to deploy? All tests passed and docs updated."
14. ✅ **Post-deploy production verification** — after every deploy that touches any API handler or data pipeline, run:
    ```
    npm run verify-prod
    ```
    The script hits the live production endpoints, busts the news cache for a fresh fetch, and checks:
    - All three news sources (steam-news-api, liquipedia, currents) each return at least 1 article
    - The most recent article is less than 168 hours (7 days) old
    - Liquipedia article URLs resolve to liquipedia.net (catches wrong-page regressions)
    - Live-matches and tournaments endpoints respond with the expected shape
    - `?mode=tier1-leagues` returns at least 8 league names (fewer means the tier filter is broken and major events will be missing from the homepage)
    **If the script exits 1:** first option is Vercel instant rollback (dashboard → Deployments → previous deploy → Promote to Production) to restore the site immediately while you fix the bug. Then fix, commit, redeploy, and re-run `npm run verify-prod` until it exits 0. Do NOT mark the deploy as complete until all checks pass.

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
- `App.jsx` calls `/api/draft-posts` with `{ type: "reddit", ...series metadata }`; no VOD fetching needed
- `api/draft-posts.js` handles `type === 'reddit'` using Claude Haiku in a single call to generate two posts:
  - **VOD Roundup Post** - fully spoiler-free; suitable for r/DotaVods or r/Dota2; includes title and body separately so they can be pasted into Reddit's post form
  - **Match Thread Comment** - can reference the result; 2-4 sentences; suitable for dropping in a post-match discussion thread
- All links use `?spoilers=off` so recipients land in spoiler-free mode automatically
- `?spoilers=off` URL param also works as a standalone entry point - enables spoiler-free mode on load and persists it to localStorage
- `RedditPostsModal` shows amber-accented VOD Roundup section with separate "Copy title" and "Copy post" buttons, plus a standard gray Match Thread Comment section
- Hidden in spoiler-free mode (same as X posts)

---

## /preview vs Homepage Boundary

`/preview` (`src/pages/PreviewPage.jsx`) and the homepage (`src/App.jsx`, `MatchCard.jsx`, `HomeFeed.jsx`, etc.) are separate design surfaces. Changes requested for `/preview` must NEVER touch homepage components, and vice versa. Shared components (`MatchDrawer.jsx`, `TournamentHub.jsx`, etc.) may only be changed in ways that are backward-compatible and do not alter homepage behaviour.

## VOD Channel Resolution

PandaScore is the authoritative source for Twitch channel attribution. The client-side `findTwitchVod` function in `src/api.js` trusts the `preferredChannel` resolved by the server (`api/match-streams.js` via PandaScore fuzzy match) exclusively - it does NOT fall back to other channels. Do not add hardcoded channel lists or tournament-name-to-channel mappings to `src/api.js`. Channel labels for display belong in `VOD_CHANNEL_LABELS`. Channel routing logic belongs in `api/_shared.js` (`getTwitchStreams`).

## KV Cache Poisoning Risk

Several KV entries are written on first miss and served on every subsequent hit until TTL expires. A stale value written by old code persists even after a new deployment because the function returns immediately on cache hit without re-validating. **After any deploy that touches tier filtering or stream caching logic, always bust the affected KV caches** (see deployment checklist item 10). Known sensitive keys:

- `dota2:tier1_league_names_v1` (2h TTL) — written by `api/tournaments.js?mode=tier1-leagues`; controls which matches appear on the homepage. If this has fewer than ~8 entries, DreamLeague and other major events will be missing from results.
- `dota2:live_matches_v3` (30s TTL) — low risk due to short TTL
- `dota2:tournament_list_v7` (6h TTL) — written by `api/tournaments.js`; high risk if stale after structural changes

## Notes for Claude Code

- Always show what changed and why. Use CONTEXT.md to document new behavior; commit messages to document intent.
- If something breaks, explain the root cause, not just the fix.
- When in doubt about scope or impact, ask before making changes — especially for anything touching tier filtering, KV cache keys, or the Vercel function list.
- Document surprising or non-obvious behavior in CONTEXT.md. Don't over-explain things that follow established project patterns.

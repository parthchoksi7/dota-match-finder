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
- **Content changes to existing entities** (team status, org history, editorial facts) → update the relevant entries in `public/llms.txt` and `public/llms-full.txt` to match. These files are read by AI crawlers and GEO pipelines — stale entity data here means stale AI answers. Check: team list counts, org status (disbanded/active), shortDesc summaries.

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
  - Hero data (already implemented — see Caching Strategy below)
  - Match summaries (never change once generated)
- Implement rate limiting on the frontend:
  - Debounce search inputs
  - Prevent duplicate concurrent requests
  - Show "already loading" states
- **Free API limits to respect:**
  - OpenDota: No hard limit but avoid spam
  - Twitch: Rate limited per client ID
  - Anthropic Claude: Pay-per-use (minimize unnecessary calls)
  
### Caching Strategy
- **Hero list** — already cached in `localStorage` under `STORAGE_KEYS.HEROES` (`"spectate-heroes-v1"`) with a 24h TTL + module-level `heroCache` variable as L1. Do NOT add duplicate hero caching. Invalidate by clearing that key.
- Cache match summaries by match ID (never regenerate)
- **Twitch token** — cached server-side in KV (`twitch:token:v1`, ~50-day TTL). The token is used exclusively server-side by `api/match-streams.js?mode=twitch-vod` to call Twitch Helix and return only the VOD URL. The `?mode=twitch-token` endpoint and the client-side `getTwitchToken()` function have been removed — the token never reaches the browser.
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

## VOD Replay System — LOCKED. DO NOT MODIFY WITHOUT EXPLICIT OWNER APPROVAL.

The VOD replay chain has broken three times due to seemingly unrelated changes (Jun 8: caching refactor introduced day-bucket collision; Jun 10: static channel fallback removed; Jun 10: ts-bucket write was gated behind external_identifier guard, so personal/qualifier streams were never recorded). Every layer below is load-bearing. Do not change cache key formats, TTLs, lookup order, or channel resolution logic without explicit written approval from the owner.

### How it works (end to end)

A user opens a completed match. `resolveMatchStreams()` in `src/App.jsx` runs:

**Step 1 — Channel resolution (`GET /api/match-streams?ids=...&ts=...&radiantTeam=...&direTeam=...`)**

`api/match-streams.js` tries three sources in order, stopping at first hit:

1. **KV fast path** — `stream:match:{odMatchId}` (14-day TTL). Written by `cacheRunningStreams()` in `api/live-matches.js` while the game is actively `status === 'running'` AND `game.external_identifier` is non-null AND `streams.length === 1`. Value is the raw Twitch channel login (e.g. `esl_dota2`). Major broadcast channels (ESL, PGL) reliably get this entry; personal/qualifier streams often miss it because `external_identifier` is null on PandaScore while running.

2. **PandaScore fuzzy match** — queries `PANDASCORE_BASE/matches?range[begin_at]={startTime±2h}` (`page[size]=50`), finds the match by `teamsMatch()` (bidirectional substring on both opponent names), then calls `getTwitchStreams(psMatch.streams_list)` to extract the channel. If a channel is resolved, writes it to `stream:match:{odMatchId}` for future fast-path hits. The ±2h window (widened from ±1h on Jun 19) covers late games of long BO5s whose OD `start_time` drifts past the series-level `begin_at` PandaScore filters on; `teamsMatch()` still disambiguates within the window. NOTE: PandaScore only carries `streams_list` for running matches; completed matches often have an empty list, causing this step to produce no channel.

3. **Time-bucket candidates** — reads `stream:ts:{roundedTs}` (a JSON array of channels that were live in that 5-min window). Written by `cacheRunningStreams()` for ALL running single-stream games regardless of whether `external_identifier` is set — this is the only path that captures personal/qualifier streams. Returns the result as `_candidates` in the response. `resolveMatchStreams` uses `_candidates[0]` as the `preferredChannel` if and only if exactly one candidate exists (ambiguous multi-stream windows produce no channel). **When exactly one candidate is found, `match-streams.js` also writes `stream:match:{id}` to KV (`nx:true`, `STREAM_TTL`) and upserts to Supabase (`ignoreDuplicates: true`) so future lookups hit the fast path and the match has a permanent DB record.**

`resolveMatchStreams` collapses the result:
- If exactly one definitive channel across all queried match IDs → use it.
- Else if `_candidates` has exactly one entry → use it as fallback.
- Else → `preferredChannel = null`, no VOD lookup.

**Step 2 — Channel → Twitch VOD (`GET /api/match-streams?mode=twitch-vod&channel=...&ts=...`)**

Only called when `preferredChannel` is non-null. `findTwitchVod()` in `src/api.js` delegates entirely to the server.

Server-side cache lookup order:
1. **`twitch:vod:v2:{channel}:{matchStartTime}`** — per-match VOD cache (24h TTL on hit, 5min TTL on miss for matches within last 24h, 30min for older). Key is `v2` + exact `matchStartTime` so different games on the same channel on the same day get separate entries. `v1` used day-bucket granularity and caused cross-game cache pollution (the Jun 8 regression).
2. **`twitch:channel-uid:v1:{channel}`** — maps Twitch login → Helix user_id (30-day TTL). Avoids a Helix `/users` call on every VOD lookup.
3. **`twitch:token:v1`** — Twitch OAuth client-credentials token (~50-day TTL, refreshed 1h before expiry).

If all three are cold: fetches token → resolves user_id → fetches last 30 archived VODs from Helix → finds the VOD whose `[created_at, created_at + duration]` window contains `matchStartTime` → computes `offset = matchStartTime - vodStart + 600` (the +600 adds 10 min of pre-game buffer) → returns and caches the timestamped URL.

**Live-channel fallback on a VOD miss (added Jun 19, premise corrected Jun 20).** Twitch DOES expose the in-progress broadcast through `/videos` — it appears as a `type=archive` video whose `duration` grows in near-real-time (verified live: `stream_id` matches the active stream, duration tracked elapsed time within seconds). So **completed earlier series of a still-live broadcast DO resolve a real timestamped VOD mid-broadcast** — the window-match loop finds them. A VOD miss therefore does NOT mean "broadcast still live"; it means the requested time sits at/near the live edge (a few minutes of duration lag) or before the channel's oldest stored VOD. When the miss is for a recent match (`matchStartTime` within the last 24h), the endpoint additionally calls Helix `/streams?user_id={userId}` and returns `{ url: null, channel, live: true|false }`. The `live` flag is consumed by the `vod-enrich.mjs` job (don't mark a row permanently VOD-less while its channel is still live). The web client does NOT render a "Watch Live" button (product decision Jun 20 — fans want the replay, not the live edge); on a miss it shows "No VOD found". `findTwitchVod` passes `live` + `channel` through; `resolveMatchStreams` turns a live miss into `liveUrl = https://www.twitch.tv/{channel}`, and `MatchDrawer` renders a "Watch Live on Twitch" button instead of "No VOD found". The `live` flag is cached inside the existing `twitch:vod:v2` miss entry, so its staleness is bounded by the same 5-min recent-miss TTL — no new cache key, TTL, or lookup-order change. Once the broadcast ends and the archive VOD publishes, the next lookup (after the 5-min TTL) returns the real timestamped VOD.

**What `getTwitchStreams()` does and does NOT do**

`getTwitchStreams(streamsList)` in `api/_shared.js` returns what PandaScore's `streams_list` actually contains. It does NOT fall back to hardcoded channel names by tournament name. If PandaScore has no stream, it returns `[]`. Do not add static mappings back.

### Rules

- **Do not change any KV cache key** (`stream:match:*`, `twitch:vod:v2:*`, `twitch:channel-uid:v1:*`, `twitch:token:v1`, `stream:ts:*`) without owner approval and a version bump (e.g. `v2` → `v3`).
- **Do not change the `twitch:vod:v2` key format** — in particular, do not revert to day-bucket or introduce any coarser granularity. The key must contain the exact `matchStartTime` so each game gets its own entry.
- **Do not add hardcoded tournament-name-to-channel mappings** anywhere in the codebase.
- **Do not change the TTLs** (24h hit / 5min recent miss / 30min old miss for VOD; 14-day for stream:match; 30-day for channel-uid) without owner approval.
- **Do not change the lookup order** (KV fast path → PS fuzzy match → ts-bucket) in `match-streams.js`.
- **Do not move the `stream:ts` write back inside the `external_identifier` guard** in `cacheRunningStreams()`. It must execute before `if (!matchId) continue` so personal/qualifier streams are recorded even when PS hasn't linked to OD yet.
- **Do not change the `_candidates` consumption logic** in `resolveMatchStreams` (`src/App.jsx`) — it is the final fallback for personal/qualifier streams and must only activate when exactly one candidate exists.
- **Do not revert the per-game `started_at` persistence** (2026-06-21). The Supabase writes in `match-streams.js` use the optional `starts=id:ts,…` param (sent by `fetchMatchStreams`) so each sibling game's row stores its OWN start time. Persisting all siblings with the single shared `ts` again corrupts per-game VOD offsets (games 2/3 inherit game 1's offset). Resolution logic (PS-fuzzy window, ts-bucket) still legitimately uses the primary `ts` — only the persisted `started_at` value is per-game.
- After any deploy touching this system, bust the relevant KV caches (see deployment checklist §12) and run `npm run verify-prod`.

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

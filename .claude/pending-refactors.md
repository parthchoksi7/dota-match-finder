# Pending Refactors

Tracked from the May 2026 deep code review and the June 2026 Staff Engineer technical audit.
Completed items removed.

---

## Safe to do anytime (low blast radius)

~~### Sync `findLeague` test copy with production implementation~~ ✅ Done
~~### Remove dead `rawUrl` fallback in LiveMatchRow~~ ✅ Done
~~### Extract `getSeriesLabel()` to `_shared.js`~~ ✅ Done
~~### Extract KV singleton to `api/_kv.js`~~ ✅ Done

---

## Quick wins (June 2026 audit + followups — all <1 day each)

~~### [SECURITY] Add security response headers to vercel.json~~ ✅ Done (commit 8cc3e69)
~~### [SECURITY] Fix analytics-chat password comparison — timingSafeEqual~~ ✅ Done (commit 8cc3e69)
~~### [RELIABILITY] Add distributed lock to draft-posts.js (cron dedup)~~ ✅ Done (commit 8cc3e69)
~~### [RELIABILITY] Add TTL to module-level `_premiumLeagueIds` in-memory cache~~ ✅ Done (commit 468936e)
~~### [RELIABILITY] Fix `getHeroNames()` in summarize.js — add KV cache + timeout~~ ✅ Done (commit 468936e)
~~### [CORRECTNESS] Remove duplicate `PERMANENT_TIER1_NAMES` in tournaments.js~~ ✅ Done (commit 468936e)

### [SECURITY] Restrict CORS on sensitive endpoints
- **Files:** `api/summarize.js`, `api/match-streams.js`, `api/pipeline.js`, `api/analytics-chat.js`, `api/live-matches.js`
- **What:** All endpoints use `res.setHeader('Access-Control-Allow-Origin', '*')`. Sensitive endpoints (Twitch token, Claude summarize, analytics, pipeline webhook) must restrict to `https://spectateesports.live`. Add a `setCorsHeaders(req, res, { allowAll })` helper to `_shared.js`. Public read endpoints (live-matches, upcoming-matches) can stay `*`.
- **Why:** The `?mode=twitch-token` endpoint returns a live OAuth token to any origin. The `/api/summarize` endpoint can be called from any site at your Claude API cost.
- **Risk:** None if implemented correctly (SPA origin is fixed). Test on staging before shipping.

~~### [SECURITY] Rate-limit LLM and expensive endpoints~~ ✅ Done — `rateLimitByIp()` in `_shared.js`, 10 req/min on `summarize` and `analytics-chat`. Watchability still unthrottled.

### [SECURITY] Rate-limit watchability endpoint
- **Files:** `api/tournaments.js` (watchability mode)
- **What:** Apply 20 req/min via `rateLimitByIp()` (already in `_shared.js`). Import `_kv` and add a check at the start of the watchability handler.
- **Why:** Watchability calls Twitch Helix for each match — an uncached bot loop can exhaust the Twitch rate-limit quota.
- **Risk:** None — same pattern as summarize/analytics-chat.

### [SECURITY] Move analytics-chat password to request header (PARTIAL — timingSafeEqual ✅ done)
- **Files:** `api/analytics-chat.js`, `src/components/AnalyticsChat.jsx`
- **What:** Read the password from `req.headers['x-analytics-password']` in both `handleAuth` and `handleChat` instead of `req.body.password`. Update `AnalyticsChat.jsx` to send an `x-analytics-password` header on all requests.
- **Why:** Request body content appears in Vercel's raw function logs; HTTP headers are not logged. Closes the log-exposure gap the `timingSafeEqual` fix left open.
- **Risk:** Coordinated two-file change — must deploy backend and frontend together.

~~### [SECURITY] Add Permissions-Policy header to vercel.json~~ ✅ Done
~~### [RELIABILITY] Log KV lock contention in auto-tweet cron~~ ✅ Done
~~### [DX] Add Vercel function count guard to GitHub Actions CI~~ ✅ Done (`.github/workflows/check-limits.yml`)

---

## Medium-effort (June 2026 audit)

### [SECURITY] Push subscription userId must be server-derived, not client-provided
- **Files:** `api/live-matches.js` (push-subscribe handler)
- **What:** Derive `userId` server-side as `HMAC-SHA256(subscriptionEndpoint, VAPID_PRIVATE_KEY).slice(0,32)`. Ignore the client-provided `userId` entirely. The subscription endpoint is unique per browser/device and the client cannot forge it.
- **Why:** Currently any caller can pass `userId: "someone-elses-id"` and overwrite another user's subscription or delete their team preferences. The KV `push:sub:{userId}` and `push:team:{name}` indexes are writable by anyone.
- **Risk:** Medium — existing push subscriptions stored with client-generated IDs will lose their team preferences on first re-subscribe. Requires `src/utils/pushNotifications.js` to remove the localStorage-based userId.

### [SECURITY] Proxy Twitch Helix API calls server-side; don't send OAuth token to browser
- **Files:** `api/match-streams.js`, `src/api.js`
- **What:** Add `?mode=twitch-vod&channel={channel}&ts={offset}` to `match-streams.js` that fetches the Twitch VOD using the cached token server-side and returns only the VOD URL + metadata. Remove the `?mode=twitch-token` endpoint entirely. Update `src/api.js getTwitchToken()` to call the new proxy mode.
- **Why:** The Twitch OAuth token is currently returned to any origin (`CORS: *`). Any site can use it to make Helix API calls against your rate limit quota.
- **Risk:** Adds latency to the VOD lookup flow (one extra server hop). KV caching of VOD results mitigates repeat lookups for the same match.

### [ARCHITECTURE] Extract tournaments.js handlers into `api/_handlers/` modules
- **Files:** `api/tournaments.js` (2,271 lines, 15+ modes)
- **What:** Create `api/_handlers/` subdirectory (Vercel excludes `_`-prefixed paths from function deployment, so this does NOT increase the function count). Move each mode into its own file:
  ```
  api/_handlers/matchStats.js
  api/_handlers/watchability.js
  api/_handlers/recentCompleted.js
  api/_handlers/tournamentPlayers.js
  api/_handlers/highlights.js
  api/_handlers/calendarTeam.js
  api/_handlers/calendarTournament.js
  api/_handlers/matchIndicators.js
  api/_handlers/seriesList.js
  api/_handlers/tier1Leagues.js
  api/_handlers/syncTeams.js
  api/_handlers/matchEnrichment.js
  api/_handlers/llmsData.js
  ```
  `api/tournaments.js` becomes a thin 50-line router that dispatches `req.query.mode` to the appropriate handler.
- **Why:** A 2,271-line file with 15 different concerns is the #1 maintainability risk in the codebase. A bug in one mode's handler can mask a syntax error in another. Code review requires reading the entire file.
- **Risk:** Medium — each mode shares some module-level state (KV constants, isTier1 function). Must audit imports carefully. The iCal helpers in the file can stay in a `_handlers/_ical.js` shared helper.
- **Start with:** `matchStats.js` and `watchability.js` — they have the most isolated KV namespaces and are already well-encapsulated.

### [OBSERVABILITY] Structured logging with request correlation IDs
- **Files:** `api/_shared.js`, all handler files
- **What:** Add a `createLogger(endpoint, requestId)` factory to `_shared.js` that writes structured JSON (`{ level, endpoint, requestId, msg, ts, ...extras }`). Generate a `requestId` at the top of each handler (`crypto.randomUUID().slice(0,8)`). Replace all `console.log/warn/error` with the logger.
- **Why:** Current logging is ad-hoc strings with no correlation IDs. Debugging a production issue requires scrolling through Vercel's unstructured log UI. Structured JSON enables filtering and search if you ever add a log aggregator.
- **Risk:** Very low — purely a logging format change.

### [OBSERVABILITY] Add Sentry error monitoring
- **Files:** `api/_shared.js`, all handler files, `vite.config.js`
- **What:** `npm install @sentry/node @sentry/vite-plugin`. Initialize in `_shared.js` (server) and `src/main.jsx` (browser). Replace `trackError()` Redis telemetry with `Sentry.captureException()`. Set up a Sentry project alert for error rate spikes.
- **Why:** The homegrown Redis error list (`monitor:errors:{date}`, capped at 100, 3-day TTL) has no alerting, no stack traces, and no release tracking. You only see errors if you actively check the KV key. Sentry free tier: 5,000 errors/month.
- **Risk:** Low — additive. `trackError()` can be removed after Sentry is verified working.
- **Dependencies:** Requires Sentry account + `SENTRY_DSN` env var.

### [PERFORMANCE] Per-route service worker caching strategies
- **Files:** `src/sw.js`
- **What:** Apply granular `ExpirationPlugin` TTLs based on data volatility:
  - `/api/live-matches*` → NetworkFirst, maxAge 120s
  - `/api/upcoming-matches*` → NetworkFirst, maxAge 900s
  - `/api/tournaments*mode=recent-completed*` → NetworkFirst, maxAge 300s
  - `/api/tournaments*mode=match-stats*` → CacheFirst, maxAge 7 days (immutable once parsed)
  - `/api/tournaments*mode=match-indicators*` → CacheFirst, maxAge 7 days
- **Why:** The current setup uses a single NetworkFirst strategy for all `/api/*` routes. A user who opened a live match, went offline, and came back online may briefly see a stale final score. More importantly, immutable data (match stats) gets re-fetched unnecessarily.
- **Risk:** Low — purely additive TTL config.

### [CORRECTNESS] Input validation layer for query parameters
- **Files:** `api/_shared.js`, all handler files
- **What:** Add `validateId(val, { name, numeric, maxLen })` and `validateEnum(val, allowed, name)` helpers to `_shared.js`. Apply at the entry of every handler before any processing. Numeric IDs: `/^\d+$/` check + max 15 chars. Mode strings: allowlist check against known modes.
- **Why:** Query parameters are currently passed to external API URLs without sanitization. A crafted `ids` or `begin_at` could alter constructed fetch URLs or trigger unexpected behavior.
- **Risk:** Very low — validation rejects invalid input fast, before any external calls.

### [SECURITY] Content-Security-Policy header
- **Files:** `vercel.json`, potentially `middleware.js` (for nonce generation)
- **What:** Inventory all script/style/image origins used by the SPA (GA4: `www.googletagmanager.com`, `www.google-analytics.com`; Vercel Analytics: `va.vercel-scripts.com`; Vercel Speed Insights: similar). Build a restrictive CSP header: `script-src 'self' https://www.googletagmanager.com https://va.vercel-scripts.com 'nonce-{n}'`. Start with `Content-Security-Policy-Report-Only` and monitor violations for 2 weeks before enforcing.
- **Why:** CSP is the strongest XSS mitigation available. The existing X-Frame-Options/X-Content-Type-Options/Referrer-Policy are hygiene; CSP is active defense.
- **Risk:** Medium — inline scripts (React hydration, GA snippet) need nonces or hashes. A misconfigured CSP breaks the whole site. Use Report-Only mode first.

### [MAINTAINABILITY] Move `_x-accounts.js` team/tournament handles to KV
- **Files:** `api/_x-accounts.js` (hardcoded maps), `api/draft-posts.js` (lookup calls)
- **What:** Store the `TEAM_HANDLES`, `TOURNAMENT_HANDLES`, and `TOURNAMENT_TALENT` maps as a single JSON blob in KV (`x-accounts:handles:v1`). Add a simple admin endpoint (POST `?mode=update-handles`, gated by `CRON_SECRET`) to update the blob without a deploy. `lookupTeamHandle()` and `lookupTournamentHandle()` read from KV with a 1h in-memory cache fallback.
- **Why:** When a team rebrands (e.g. OG → OG Esports, new org entering the scene), the handle map goes stale and requires a code change + deploy. A KV-backed map can be updated in seconds.
- **Risk:** Medium — handle lookup is on the critical path for auto-tweet cron. Must keep `_x-accounts.js` as a fallback if KV is unavailable.

~~### [PERFORMANCE] Pre-warm match stats on completed card visibility~~ ✅ Done — `IntersectionObserver` in `MatchCard.jsx` pre-fetches `match-indicators` for completed-game cards 300px before they enter view.

### [CORRECTNESS] JSDoc type annotations for shared data shapes
- **Files:** `api/_shared.js`, `src/utils.js`, `src/api.js`
- **What:** Add `@typedef` JSDoc blocks for the canonical data shapes: `PSMatch`, `ODMatch`, `SeriesGame`, `SeriesGroup`, `StreamResult`, `GameIndicators`. Reference them with `@param {SeriesGame[]} games` on every function. Enable `"checkJs": true` and `"strict": false` in a `jsconfig.json` to surface type errors in the IDE.
- **Why:** With 41 components and 12 API handlers passing the same data shapes, a typo in a property name or a missing null guard causes a silent runtime bug. JSDoc costs nothing to add and is readable by humans and IDEs.
- **Risk:** Zero — purely additive documentation.

---

## Strategic refactors (June 2026 audit — high effort, high impact)

### [ARCHITECTURE] Upgrade to Vercel Pro and split the god function into real separate functions
- **What:** Pay ~$20/month for Vercel Pro (removes the 12-function cap). Split `api/tournaments.js` 15 modes, `api/live-matches.js` push-subscribe handler, `api/analytics-chat.js` 3 modes, and `api/pipeline.js` 3 modes back into focused, individually-deployable serverless functions. Each function gets its own timeout and memory config in `vercel.json`.
- **Expected benefit:** The single highest-leverage architectural change available. Every subsequent feature can be added without compromising existing endpoints. `tournaments.js` goes from 2,271 lines to ~15 focused files of 100–200 lines each. Independent timeouts mean a slow tournament-players fetch can't time out a match-stats request.
- **Risk:** ~$20/month cost. `vercel.json` rewrites need updating. Some module-level state that currently lives in the god function may need refactoring once it's split across files.
- **Sequence:** Upgrade plan → audit shared module state → split functions one at a time → update `vercel.json` rewrites → update CONTEXT.md.

### [ARCHITECTURE] Full TypeScript migration
- **What:** Phase 1 (jsconfig + checkJs, 1 week): enable `checkJs: true`, fix all implicit any errors in `_shared.js` and `api.js`. Phase 2 (rename to .ts, 1–2 weeks): start with `_shared.ts`, `_kv.ts`, then API handlers, then React components. Phase 3: CI enforcement (`tsc --noEmit` in GitHub Actions).
- **Expected benefit:** Compiles away an entire category of bugs (wrong property name, null not handled, wrong function signature). Required for sustainable multi-engineer development. Makes the PS↔OD bridge contract machine-checkable. Enables IDE autocomplete on the complex PandaScore and OpenDota object shapes.
- **Risk:** Medium — edge middleware (`middleware.js`) has edge runtime constraints that limit which Node.js types are available. React 19 is fully TypeScript-compatible. Vercel serverless functions support TypeScript natively.
- **Dependencies:** Must complete JSDoc phase (medium effort above) first so the type shapes are already documented.
- **Sequence:** jsconfig + checkJs → fix errors → rename to .ts file by file (start with leaf files that have no imports, work inward) → enforce in CI.

### [RELIABILITY] Move push subscriptions from KV to Supabase
- **What:** Design a `push_subscriptions` table in Supabase: `(id UUID PK, user_id TEXT UNIQUE, endpoint TEXT, p256dh TEXT, auth TEXT, teams TEXT[], updated_at TIMESTAMPTZ)`. Migrate the push-subscribe write path in `live-matches.js` to Supabase upsert. Migrate the notification send path to query Supabase by team name instead of KV `push:team:{name}` index.
- **Expected benefit:** Proper relational data model. No more 30-day TTL expiry silently deleting subscriptions. Queryable: you can count subscribers per team, identify expired subscriptions, and analyze notification delivery rates. The server-derived userId fix (medium effort above) is a prerequisite.
- **Risk:** Medium — requires a migration of existing KV subscriptions, a new Supabase table, and updating both the subscribe and send paths. Supabase is already integrated (articles table), so no new credentials needed.
- **Sequence:** Server-derived userId fix → design schema → dual-write (KV + Supabase) → verify parity → cut over read path to Supabase → deprecate KV push keys.

### [PERFORMANCE] Replace O(n²) series merge with union-find
- **Files:** `src/utils.js` (`groupIntoSeries`, third pass, lines 163–190)
- **What:** The `while(mergedAny) + break outer` restart loop is O(n²·m) in the worst case. Replace with a path-compressed union-find (disjoint set union) that finds merge candidates in a single pass: O(n²) one pass to build the merge set + O(n·α(n)) for union operations ≈ effectively O(n²) total but with no restart penalty.
- **Why:** At current scale (~50–100 matches per page) this is negligible. At 10x scale (500+ matches in a tournament view + multi-page load-more), the restart loop starts accumulating. The fix is also significantly easier to reason about.
- **Risk:** Medium — the series merge algorithm is subtle and has existing tests. Must keep all current test cases passing. Run `vitest run` before and after.
- **Dependencies:** None — isolated to `src/utils.js`.
- **Sequence:** Write the union-find variant → run tests → measure against synthetic large dataset → ship if all pass.

---

## Blocked on external dependency

### WhatsApp Channel auto-posting
- **Spec:** Full product spec exists in conversation history (May 2026)
- **Blocker:** Meta has no public API for posting to WhatsApp Channels (the public broadcast/Updates feature) as of May 2026. The WhatsApp Business Cloud API only covers 1:1 and template-based messaging.
- **When to revisit:** When Meta opens a Channel posting API. Monitor Meta's WhatsApp Business Platform changelog.
- **What's ready to drop in:** Caption generation (`buildWaCaption()`), image pipeline (reuses `api/og.js?mode=series`), indicator aggregation — all covered by the X auto-tweet infrastructure. The only missing piece is the actual `sendWhatsAppChannelMessage()` call.
- **Channel URL:** https://whatsapp.com/channel/0029VbD1pLaEawdlikSoLf0t

---

## Medium-effort, high-payoff (May 2026)

### App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.
- **Effort:** Medium | **Payoff:** High (prevents impossible states, reduces reset-on-entry boilerplate)

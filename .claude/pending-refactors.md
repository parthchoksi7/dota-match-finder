# Pending Refactors

Tracked from the May 2026 deep code review and the June 2026 Staff Engineer technical audit.
Completed items removed.

---

## Temporary — remove after the event ends

### [EWC 2026] Remove `OFFICIAL_TWITCH_ALLOWLIST` from `api/_shared.js`
Added 2026-07-07. PandaScore marks the Esports World Cup 2026 YouTube stream `official:true` but the official EWC Twitch broadcasts (`ewc_legiongauntlet_en`, `_en2`, `_en3`) `official:false`, so `getTwitchStreams()` skipped them and no VOD was cached. The allowlist promotes those three logins to official when PandaScore lists them for a match. It only fires for matches where PandaScore actually lists an EWC channel (by owner decision — matches where PandaScore lists Kick/none, e.g. L1 vs Nigma on `_en2`, are intentionally skipped). Once EWC 2026 is over, delete the `OFFICIAL_TWITCH_ALLOWLIST` set and revert the filter in `getTwitchStreams()` to `s.official && ...`. Keep the `twitchLoginFromUrl()` no-www normalization — it is a general correctness fix, not EWC-specific.

---

## Safe to do anytime (low blast radius)

~~### [UX] Shorten twitch-vod miss TTL for very recent matches~~ ✅ Done — 5-min TTL for matches in last 24h, 30-min for older; both miss paths in `match-streams.js` updated.

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

~~### [SECURITY] Restrict CORS on sensitive endpoints~~ ✅ Done — `setCorsHeaders()` in `_shared.js`; `twitch-token`, `summarize`, `analytics-chat`, `pipeline` restricted to `https://spectateesports.live`; `live-matches` and `tournaments` stay `*`.

~~### [SECURITY] Rate-limit LLM and expensive endpoints~~ ✅ Done — `rateLimitByIp()` in `_shared.js`, 10 req/min on `summarize` and `analytics-chat`. Watchability still unthrottled.

~~### [SECURITY] Rate-limit watchability endpoint~~ ✅ Done — 20 req/min on cache-miss path in `handleWatchability`
~~### [SECURITY] Move analytics-chat password to request header~~ ✅ Done — header primary, body fallback; `AnalyticsPage.jsx` and `AnalyticsChat.jsx` updated

~~### [SECURITY] Add Permissions-Policy header to vercel.json~~ ✅ Done
~~### [RELIABILITY] Log KV lock contention in auto-tweet cron~~ ✅ Done
~~### [DX] Add Vercel function count guard to GitHub Actions CI~~ ✅ Done (`.github/workflows/check-limits.yml`)

---

## Medium-effort (June 2026 audit)

~~### [SECURITY] Push subscription userId must be server-derived, not client-provided~~ ✅ Done — `api/live-matches.js` now derives `userId = HMAC-SHA256(VAPID_PRIVATE_KEY, endpoint).slice(0,32)` server-side; client no longer sends or controls userId; `src/utils/push.js` localStorage UUID logic removed.

~~### [SECURITY] Proxy Twitch Helix API calls server-side; don't send OAuth token to browser~~ ✅ Done — `?mode=twitch-vod` added to `match-streams.js` with server-side Helix calls and dual KV caching (channel UID 30d, VOD result 24h/30min); `?mode=twitch-token` removed; `src/api.js findTwitchVod()` is now a thin proxy wrapper.

~~### [ARCHITECTURE] Extract tournaments.js handlers into `api/_handlers/` modules~~ ✅ Done — `api/tournaments.js` reduced to 156-line router; 17 handler files + 2 shared utility files created under `api/_handlers/`.

~~### [OBSERVABILITY] Structured logging with request correlation IDs~~ ✅ Done — `createLogger(endpoint)` factory in `_shared.js`; all handler files migrated to structured JSON logs with per-request correlation IDs.

### [OBSERVABILITY] Add Sentry error monitoring
- **Files:** `api/_shared.js`, all handler files, `vite.config.js`
- **What:** `npm install @sentry/node @sentry/vite-plugin`. Initialize in `_shared.js` (server) and `src/main.jsx` (browser). Replace `trackError()` Redis telemetry with `Sentry.captureException()`. Set up a Sentry project alert for error rate spikes.
- **Why:** The homegrown Redis error list (`monitor:errors:{date}`, capped at 100, 3-day TTL) has no alerting, no stack traces, and no release tracking. You only see errors if you actively check the KV key. Sentry free tier: 5,000 errors/month.
- **Risk:** Low — additive. `trackError()` can be removed after Sentry is verified working.
- **Dependencies:** Requires Sentry account + `SENTRY_DSN` env var.

~~### [PERFORMANCE] Per-route service worker caching strategies~~ ✅ Done — `src/sw.js` now uses per-route NetworkFirst/CacheFirst strategies with `ExpirationPlugin` TTLs matched to data volatility.

~~### [CORRECTNESS] Input validation layer for query parameters~~ ✅ Done — `validateId()` and `validateEnum()` in `_shared.js`; applied to `match-streams.js`, `matchStats.js`, `matchIndicators.js`, `liveSeriesGames.js`, `tournament-detail.js`.

~~### [SECURITY] Content-Security-Policy header~~ ✅ Done — `Content-Security-Policy-Report-Only` header added to `vercel.json`; covers all known first- and third-party origins; report-only mode for 2-week observation before enforcement.

~~### [MAINTAINABILITY] Move `_x-accounts.js` team/tournament handles to KV~~ ✅ Done — `refreshHandles()` reads `x-accounts:handles:v1` from KV with 1h in-memory cache; static constants remain as fallback; admin `POST ?type=update-handles` in `draft-posts.js` gated by `CRON_SECRET`.

~~### [PERFORMANCE] Pre-warm match stats on completed card visibility~~ ✅ Done — `IntersectionObserver` in `MatchCard.jsx` pre-fetches `match-indicators` for completed-game cards 300px before they enter view.

~~### [CORRECTNESS] JSDoc type annotations for shared data shapes~~ ✅ Done — `@typedef` blocks for `PSMatch`, `ODMatch`, `SeriesGame`, `SeriesGroup`, `StreamResult`, `GameIndicators` added to `api/_shared.js`; `jsconfig.json` created with `checkJs: true`.

---

## Strategic refactors (June 2026 audit — high effort, high impact)

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

---

## Frontend polish / UX

Small-to-medium items consolidated from UI_UX_IMPROVEMENTS.md. All low blast radius.

### Sticky "Now Watching" panel
- **What:** Keep the match detail panel (currently a drawer) sticky below the header on scroll so Watch / Summary actions stay visible while browsing the match list.
- **Effort:** Medium

### `font-display: swap` for Barlow font
- **What:** Add `font-display: swap` and `<link rel="preconnect">` to the Google Fonts import to avoid layout shift on first load.
- **Effort:** Low

### VOD pre-fetch in background
- **What:** When a user clicks a game row, start resolving the VOD before the drawer finishes opening. Currently the "Finding VOD…" spinner only starts after the drawer is open.
- **Effort:** Low

### Recent / popular search suggestions
- **What:** Show up to 5 recent searches (localStorage) and a few suggested queries ("Team Liquid", "DreamLeague") in the search overlay before the user types anything.
- **Effort:** Medium

### "Has VOD" filter
- **What:** Post-search filter chip to narrow results to games that have a confirmed VOD link. Complements the existing All/BO1/BO3/BO5 series type filter.
- **Effort:** Medium

### `aria-describedby` on search errors
- **What:** Associate the error message ("Failed to load matches") with the search form using `aria-describedby` for screen reader users.
- **Effort:** Low

### Mobile touch target audit
- **What:** Verify button and list row heights are ≥44px on small screens. `MatchCard` rows and `SearchBar` buttons may need padding bumps below 375px.
- **Effort:** Low

### Batch push-subscriber KV reads in `sendPushNotificationsForMatches`
- **What:** `api/live-matches.js` `sendPushNotificationsForMatches()` does sequential per-team / per-user `kv.get()` calls inside nested loops (`push:team:*`, `push:sent:*`, `push:sub:*`). This runs on the `?cron=1` capture path, now firing every 10 min. Fine at today's subscriber count, but it scales linearly with subscribers and is the most likely cause of a future `maxDuration` timeout on that path (a stopgap `maxDuration: 30` was added Jun 20). Replace the per-user gets with `kv.mget()` batches.
- **Effort:** Medium

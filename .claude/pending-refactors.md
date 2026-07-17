# Pending Refactors

Tracked from the May 2026 deep code review and the June 2026 Staff Engineer technical audit.
Completed items removed.

---

## Temporary — remove after the event ends

### [EWC 2026] Remove `OFFICIAL_TWITCH_ALLOWLIST` from `api/_shared.js`
Added 2026-07-07. PandaScore marks the Esports World Cup 2026 YouTube stream `official:true` but the official EWC Twitch broadcasts (`ewc_legiongauntlet_en`, `_en2`, `_en3`) `official:false`, so `getTwitchStreams()` skipped them and no VOD was cached. The allowlist promotes those three logins to official when PandaScore lists them for a match. It only fires for matches where PandaScore actually lists an EWC channel (by owner decision — matches where PandaScore lists Kick/none, e.g. L1 vs Nigma on `_en2`, are intentionally skipped). Once EWC 2026 is over, delete the `OFFICIAL_TWITCH_ALLOWLIST` set and revert the filter in `getTwitchStreams()` to `s.official && ...`. Keep the `twitchLoginFromUrl()` no-www normalization — it is a general correctness fix, not EWC-specific.

---

## Safe to do anytime (low blast radius)

### Remove dead "Multiple channels were live" copy in MatchDrawer
- **What:** `MatchDrawer.jsx` renders "Multiple channels were live. Try each one to find this match." when `allVods.length > 1`, but no code path produces more than one `allVods` entry: `findTwitchVod` returns at most one, the stored-replay path returns exactly one, and the 2026-07-11 stream-picker work deliberately kept multi-language streams in a separate `otherStreams` field. The copy block is unreachable.
- **Effort:** Trivial

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

### Verify "OG" PS↔OD name mapping when next active
- **What:** 2026-07-07 tier-1 team-name scrub (see CONTEXT.md `TEAM_NAME_ALIAS_GROUPS`) couldn't confirm PandaScore's team search for "OG" — their 2-char name makes PS's search return noise, so their real PS team id was never found. Revisit once OG has a live/recent match to check both providers' actual match-time naming — add to `TEAM_NAME_ALIAS_GROUPS` only if a real divergence shows up.
- **Effort:** Low (just needs a live match to check against)

~~### "1win Team" PS↔OD name mapping~~ ✅ Done (2026-07-15) — confirmed live: PandaScore names the org "1win" (EWC 2026 match id 1565904), OpenDota's team_id 8291895 still carries per-match `radiant_name`/`dire_name` "Tundra Esports" (pre-June-2026-roster-swap identity, OD ties team_id to Steam group continuity, not branding). No substring relationship, so added `['1win', 'tundraesports']` to `TEAM_NAME_ALIAS_GROUPS` in `src/teamMatching.js`. Surfaced by a favorites-highlighting bug report (team followed via its OD name didn't highlight its PS-sourced upcoming fixture).

### verify-prod od-consistency check miscalibrated for round-robin group stages
- **What:** `scripts/verify-prod.mjs`'s od-consistency check (`maxExpected = effectiveSeries * 5`) uses `finishedSeries` from the bracket API as the fallback denominator when `totalStandingWins <= finishedSeries * 3`. For a BO2 round-robin group stage (e.g. EWC 2026 Group A), `finishedSeries` (bracket-only) stayed at 3 all day while the actual completed-game count climbed to 18 as more round-robin series finished — the bracket API doesn't track round-robin completions the way it tracks elimination-bracket ones, so the denominator never grows with real progress. Failed a 2026-07-07 deploy verification for reasons unrelated to that deploy (confirmed: the deploy's actual target — 4 previously-unmatched EWC series — was independently verified archived correctly via direct `match_stream_history` inspection). Needs a group-stage-aware denominator (e.g. count distinct series_id in OD's own game list) instead of relying on the bracket API for formats that don't use single-elimination brackets.
- **Effort:** Medium

~~### Match-drawer game switcher groups by raw seriesId, unlike groupIntoSeries~~ ✅ Done (2026-07-11) — reported live via a PTime vs Nigma Galaxy (EWC 2026) BO2 that OD split across two series_ids; the drawer showed only game 1 with no switcher. Extracted the null/split-seriesId merge passes out of `groupIntoSeries` into exported `buildSeriesGroups(matches)` (returns the pre-sort, pre-trim seriesMap); `groupIntoSeries` now calls it before its sort + drop-oldest-incomplete trim. `App.jsx`'s `seriesMatchMap` is now built from `buildSeriesGroups`, keyed per-game by each game's own raw `seriesId` (not the merged group id) so the existing `selectedMatch.seriesId` lookup still hits. Regression tests added in `utils.test.js`.

### `seriesMatchMap` can overwrite (not merge) on colliding null/0/undefined `seriesId` keys
- **What:** Spotted during the 2026-07-11 `buildSeriesGroups` fix above. `App.jsx`'s `seriesMatchMap[g.seriesId] = ids` uses each game's raw `seriesId` as the object key. If two *unrelated* series both contain an orphan game with `seriesId` null/0/undefined (JS coerces all to the same string key), the later-processed group silently overwrites the earlier one's entry — the earlier match's game-switcher would resolve to the wrong series' sibling list. Pre-existing risk (the old naive per-game groupBy had the same key collision, just merged via `push` into one array instead of overwriting) — not introduced by the 2026-07-11 fix, but worth closing. Fix: key `seriesMatchMap` by each game's own `id` instead of its `seriesId`, pointing at the merged group's id list, so unrelated orphan games never share a key.
- **Effort:** Low

### Duplicated `HeroIcon` + `LGM_WINDOW_S` across live-series-companion files
- **What:** Flagged in the Phase 2 review (2026-07-16). (1) `HeroIcon` (the 20px hero-icon `<img>` with cloudflare CDN URL + onError fallback) is duplicated near-identically in `src/components/SeriesLivePulse.jsx` and `src/components/SeriesGameDraftStrip.jsx` — extract to one shared component (e.g. `src/components/HeroIcon.jsx`) and import in both. (2) `const LGM_WINDOW_S = 900` is duplicated verbatim in `api/_handlers/liveSeriesGames.js` and `api/_handlers/liveGamePulse.js` (both must match `findOdMatchByTime`'s hard-coded 900s window) — export it from one place (or from `_shared.js` next to `findOdMatchByTime`) so the two can't drift. Neither is a bug; both are cleanup.
- **Effort:** Low

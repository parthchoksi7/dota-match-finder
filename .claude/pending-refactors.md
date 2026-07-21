# Pending Refactors

Tracked from the May 2026 deep code review, the June 2026 Staff Engineer technical audit, and ad-hoc findings since. Every open item below carries a RICE score and the backlog is sorted by it, highest first — that ordering **is** the priority order. Completed items are archived at the bottom, not left inline.

## Maintenance rules (read before editing this file)

**Adding a new item:**
1. Score it — Reach, Impact, Confidence, Effort — using the rubric below.
2. Compute `Score = (Reach × Impact × Confidence) / Effort`.
3. Insert it into "Prioritized Backlog" at the position matching its score (descending). Don't append to the bottom.
4. Exception: if the item is genuinely blocked on something outside this codebase (no API exists, waiting on a third party), put it in "Blocked on external dependency" instead — RICE doesn't apply to work that can't start. If it's tied to a hard external deadline (an event ending, a flag flip), put it in "Temporary" instead.

**Closing an item out:**
1. Delete it from the Prioritized Backlog entirely.
2. Add one line to "Completed Archive" at the bottom: `~~item name~~ ✅ Done (date, commit if known) — one-line summary of what shipped.`
3. Don't leave strikethrough items sitting in the middle of the prioritized list — it breaks the score ordering for everyone scanning it.

### Scoring rubric

| Factor | Scale | Meaning |
|---|---|---|
| **Reach** | 1–5 | How much of the traffic/codebase/team this touches. 5 = every request or page load; 4 = a core, frequently-used feature; 3 = a common but non-universal feature; 2 = a narrow user segment or edge case; 1 = dev-only or a rare edge case. |
| **Impact** | 1–5 | Consequence of leaving it undone (or benefit of doing it). 5 = outage/security/data-loss-class or a confirmed-pattern bug that already broke prod once; 4 = a real correctness bug or major UX/perf issue; 3 = moderate, noticeable improvement; 2 = minor polish or a narrow-scope bug; 1 = cosmetic/dead-code cleanup. |
| **Confidence** | 0–100% | How sure we are the Reach/Impact estimate is right and the fix will land cleanly. Lower it when the item is speculative, an "audit" with an unknown outcome, or depends on data we don't have yet. |
| **Effort** | days | 0.25 = trivial, 1 = low, 3 = medium, 8 = high, 20 = very high / multi-week. |

This is an engineering-backlog adaptation of product RICE (Reach isn't literally "users per quarter") — treat scores as a strong default ordering, not a rule that overrides judgment. If you deliberately work an item out of order, that's fine, just don't reorder the file to match after the fact — let completion move it to the archive instead.

---

## Temporary — remove after the event ends

Exempt from RICE: these have a hard deadline, not a priority score.

### [EWC 2026] Remove `OFFICIAL_TWITCH_ALLOWLIST` from `api/_shared.js`
Added 2026-07-07. PandaScore marks the Esports World Cup 2026 YouTube stream `official:true` but the official EWC Twitch broadcasts (`ewc_legiongauntlet_en`, `_en2`, `_en3`) `official:false`, so `getTwitchStreams()` skipped them and no VOD was cached. The allowlist promotes those three logins to official when PandaScore lists them for a match. It only fires for matches where PandaScore actually lists an EWC channel (by owner decision — matches where PandaScore lists Kick/none, e.g. L1 vs Nigma on `_en2`, are intentionally skipped). Once EWC 2026 is over, delete the `OFFICIAL_TWITCH_ALLOWLIST` set and revert the filter in `getTwitchStreams()` to `s.official && ...`. Keep the `twitchLoginFromUrl()` no-www normalization — it is a general correctness fix, not EWC-specific.

---

## Blocked on external dependency

Exempt from RICE: work that literally cannot start yet.

### WhatsApp Channel auto-posting
- **Spec:** Full product spec exists in conversation history (May 2026)
- **Blocker:** Meta has no public API for posting to WhatsApp Channels (the public broadcast/Updates feature) as of May 2026. The WhatsApp Business Cloud API only covers 1:1 and template-based messaging.
- **When to revisit:** When Meta opens a Channel posting API. Monitor Meta's WhatsApp Business Platform changelog.
- **What's ready to drop in:** Caption generation (`buildWaCaption()`), image pipeline (reuses `api/og.js?mode=series`), indicator aggregation — all covered by the X auto-tweet infrastructure. The only missing piece is the actual `sendWhatsAppChannelMessage()` call.
- **Channel URL:** https://whatsapp.com/channel/0029VbD1pLaEawdlikSoLf0t

---

## Prioritized Backlog (RICE-ranked, highest first)

| # | Item | Reach | Impact | Conf. | Effort | Score |
|---|---|---|---|---|---|---|
| 1 | `font-display: swap` for Barlow font | 5 | 2 | 90% | 0.5 | **18.0** |
| 2 | Mobile touch target audit | 4 | 2 | 60% | 0.5 | **9.6** |
| 3 | VOD pre-fetch in background | 4 | 2 | 80% | 1 | **6.4** |
| 4 | Add Sentry error monitoring | 5 | 4 | 90% | 3 | **6.0** |
| 5 | `seriesMatchMap` key collision on null/0/undefined `seriesId` | 2 | 3 | 90% | 1 | **5.4** |
| 5 | Duplicated `HeroIcon` + `LGM_WINDOW_S` | 3 | 2 | 90% | 1 | **5.4** |
| 7 | Batch push-subscriber KV reads in `sendPushNotificationsForMatches` | 4 | 4 | 80% | 3 | **4.3** |
| 8 | Remove dead "Multiple channels were live" copy | 1 | 1 | 100% | 0.25 | **4.0** |
| 8 | `aria-describedby` on search errors | 1 | 2 | 100% | 0.5 | **4.0** |
| 10 | Shared `Sheet`/`Drawer` wrapper for `LiveSeriesSheet` + `MatchDrawer` | 4 | 1 | 85% | 1 | **3.4** |
| 11 | Replace O(n²) series merge with union-find | 5 | 2 | 90% | 3 | **3.0** |
| 12 | Sticky "Now Watching" panel | 4 | 3 | 70% | 3 | **2.8** |
| 13 | App.jsx state machine for async clusters (`useReducer`) | 3 | 3 | 70% | 3 | **2.1** |
| 13 | Guard against unmemoized-hook-driven infinite fetch loops on admin pages | 1 | 3 | 70% | 1 | **2.1** |
| 15 | URL query-param rewrite boilerplate (4x in App.jsx) | 2 | 1 | 100% | 1 | **2.0** |
| 16 | verify-prod od-consistency check miscalibrated for round-robin | 2 | 3 | 90% | 3 | **1.8** |
| 17 | Recent / popular search suggestions | 3 | 2 | 60% | 3 | **1.2** |
| 17 | "Has VOD" filter | 3 | 2 | 60% | 3 | **1.2** |
| 17 | Move push subscriptions from KV to Supabase | 3 | 4 | 80% | 8 | **1.2** |
| 20 | Verify "OG" PS↔OD name mapping when next active | 1 | 2 | 50% | 1 | **1.0** |
| 21 | Full TypeScript migration | 5 | 4 | 60% | 20 | **0.6** |

---

### 1. `font-display: swap` for Barlow font
- **What:** Add `font-display: swap` and `<link rel="preconnect">` to the Google Fonts import to avoid layout shift on first load.
- **Why it's #1:** Every page load, near-zero effort, and directly helps Core Web Vitals (CLS) — which ties into the SEO/GEO growth work.

### 2. Mobile touch target audit
- **What:** Verify button and list row heights are ≥44px on small screens. `MatchCard` rows and `SearchBar` buttons may need padding bumps below 375px.
- **Note:** Confidence is 60% because this is an audit — outcome (and any follow-up effort) is unknown until done.

### 3. VOD pre-fetch in background
- **What:** When a user clicks a game row, start resolving the VOD before the drawer finishes opening. Currently the "Finding VOD…" spinner only starts after the drawer is open.

### 4. Add Sentry error monitoring
- **Files:** `api/_shared.js`, all handler files, `vite.config.js`
- **What:** `npm install @sentry/node @sentry/vite-plugin`. Initialize in `_shared.js` (server) and `src/main.jsx` (browser). Replace `trackError()` Redis telemetry with `Sentry.captureException()`. Set up a Sentry project alert for error rate spikes.
- **Why:** The homegrown Redis error list (`monitor:errors:{date}`, capped at 100, 3-day TTL) has no alerting, no stack traces, and no release tracking. You only see errors if you actively check the KV key. Sentry free tier: 5,000 errors/month.
- **Risk:** Low — additive. `trackError()` can be removed after Sentry is verified working.
- **Dependencies:** Requires Sentry account + `SENTRY_DSN` env var.

### 5. `seriesMatchMap` can overwrite (not merge) on colliding null/0/undefined `seriesId` keys
- **What:** Spotted during the 2026-07-11 `buildSeriesGroups` fix. `App.jsx`'s `seriesMatchMap[g.seriesId] = ids` uses each game's raw `seriesId` as the object key. If two *unrelated* series both contain an orphan game with `seriesId` null/0/undefined (JS coerces all to the same string key), the later-processed group silently overwrites the earlier one's entry — the earlier match's game-switcher would resolve to the wrong series' sibling list. Pre-existing risk (the old naive per-game groupBy had the same key collision, just merged via `push` into one array instead of overwriting) — not introduced by the 2026-07-11 fix, but worth closing. Fix: key `seriesMatchMap` by each game's own `id` instead of its `seriesId`, pointing at the merged group's id list, so unrelated orphan games never share a key.

### 5. Duplicated `HeroIcon` + `LGM_WINDOW_S` across live-series-companion files
- **What:** Flagged in the Phase 2 review (2026-07-16). (1) `HeroIcon` (the 20px hero-icon `<img>` with cloudflare CDN URL + onError fallback) is duplicated near-identically in `src/components/SeriesLivePulse.jsx` and `src/components/SeriesGameDraftStrip.jsx` — extract to one shared component (e.g. `src/components/HeroIcon.jsx`) and import in both. (2) `const LGM_WINDOW_S = 900` is duplicated verbatim in `api/_handlers/liveSeriesGames.js` and `api/_handlers/liveGamePulse.js` (both must match `findOdMatchByTime`'s hard-coded 900s window) — export it from one place (or from `_shared.js` next to `findOdMatchByTime`) so the two can't drift. Neither is a bug; both are cleanup, but the `LGM_WINDOW_S` duplication is a real drift risk since it's actively-developed code.

### 7. Batch push-subscriber KV reads in `sendPushNotificationsForMatches`
- **What:** `api/live-matches.js` `sendPushNotificationsForMatches()` does sequential per-team / per-user `kv.get()` calls inside nested loops (`push:team:*`, `push:sent:*`, `push:sub:*`). This runs on the `?cron=1` capture path, now firing every 10 min. Fine at today's subscriber count, but it scales linearly with subscribers and is the most likely cause of a future `maxDuration` timeout on that path (a stopgap `maxDuration: 30` was added Jun 20). A timeout here risks the whole capture cron, not just push delivery. Replace the per-user gets with `kv.mget()` batches.

### 8. Remove dead "Multiple channels were live" copy in MatchDrawer
- **What:** `MatchDrawer.jsx` renders "Multiple channels were live. Try each one to find this match." when `allVods.length > 1`, but no code path produces more than one `allVods` entry: `findTwitchVod` returns at most one, the stored-replay path returns exactly one, and the 2026-07-11 stream-picker work deliberately kept multi-language streams in a separate `otherStreams` field. The copy block is unreachable.

### 9. `GoldGraph`'s event-jump URL builder mis-parses a bare-digit `?t=` timestamp
- **What:** Spotted during the 2026-07-20 Kick-primary-promotion review. `GoldGraph.jsx`'s `buildEventUrl(vodUrl, eventTimeSecs)` reads the existing `?t=` param and regexes out an `XhYmZs`-suffixed duration (Twitch's format). `api/pipeline/_vod-urls.js` can also produce a manually-timestamped YouTube `main`/`others` entry (`kind: 'start_point'`) whose `?t=` is a bare digit count (e.g. `?t=827`, no unit suffix) — the admin VOD-URL tool writes these. For that shape, the regex fails to match any suffix, `baseSecs` silently defaults to `0`, and the resulting Roshan/rax-marker WATCH link lands at `eventTimeSecs` into the VOD instead of `827 + eventTimeSecs` — wrong point, no error shown.
- **Pre-existing, not introduced by the Kick fix:** this path was already reachable before 2026-07-20 (a non-expired start-point main was never source-gated), just apparently never hit in practice. The Kick change didn't touch `GoldGraph.jsx` or this parsing.
- **Fix:** extend `buildEventUrl`'s regex to also accept a bare digit `?t=` value (treat it as raw seconds), or normalize both `_vod-urls.js` and the admin tool to always emit the `XhYmZs` suffixed form.

### 8. `aria-describedby` on search errors
- **What:** Associate the error message ("Failed to load matches") with the search form using `aria-describedby` for screen reader users.

### 10. Shared `Sheet`/`Drawer` wrapper for `LiveSeriesSheet` + `MatchDrawer`
- **Files:** `src/components/LiveSeriesSheet.jsx`, `src/components/MatchDrawer.jsx`
- **What:** Spotted 2026-07-18 while fixing the G1-tap-through-during-G2-live homepage flash (see `CONTEXT.md`'s `LiveSeriesSheet.jsx` entry). The two components independently hand-code an identical backdrop (`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity`) + sliding panel (`fixed top-0 right-0 z-50 ... animate-slide-in`, same `role="dialog"`/`aria-modal`/Escape-to-close wiring) with only width classes differing. No shared wrapper exists anywhere in `src/components/`. Extract a `Sheet.jsx` (backdrop + panel + Escape handler + focus-ring dismiss button) that both render their content into.
- **Why it's not higher:** Pure DRY/maintainability — no correctness bug today, and the two panels' animate-in-only (no animate-out) behavior would need to be preserved exactly during extraction.
- **Risk:** Low — additive extraction, both call sites get visually identical output if done carefully. Worth doing before a third sheet-style overlay gets hand-coded a third time.

### 11. Replace O(n²) series merge with union-find
- **Files:** `src/utils.js` (`groupIntoSeries`, third pass, lines 163–190)
- **What:** The `while(mergedAny) + break outer` restart loop is O(n²·m) in the worst case. Replace with a path-compressed union-find (disjoint set union) that finds merge candidates in a single pass: O(n²) one pass to build the merge set + O(n·α(n)) for union operations ≈ effectively O(n²) total but with no restart penalty.
- **Why it's not higher:** At current scale (~50–100 matches per page) this is negligible — Impact is capped at 2 until scale changes. At 10x scale (500+ matches in a tournament view + multi-page load-more), revisit — the restart loop starts accumulating and Impact should be re-scored upward.
- **Risk:** Medium — the series merge algorithm is subtle and has existing tests. Must keep all current test cases passing. Run `vitest run` before and after.
- **Dependencies:** None — isolated to `src/utils.js`.

### 12. Sticky "Now Watching" panel
- **What:** Keep the match detail panel (currently a drawer) sticky below the header on scroll so Watch / Summary actions stay visible while browsing the match list.

### 13. App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.

### 13. Guard against unmemoized-hook-driven infinite fetch loops on internal/admin pages
- **What:** Root-caused 2026-07-19 while diagnosing a Fluid Active CPU spike on Jun 21 (~38 min in one day vs. a ~5–7 min/day baseline — 75% of the Hobby plan's 4h/month budget was consumed by the time this was investigated). `AdminVodUrlsPage.jsx`'s `useAdminToken()` returned `save`/`clear` without `useCallback` before commit `67652354` (2026-06-21), so `load`'s `useCallback([clear])` got a new identity every render, retriggering the `useEffect([token, days, load])` — an unthrottled fetch loop against `/api/pipeline?type=vod-urls` (a Supabase query grouping up to 5,000 rows) for ~11 hours while the tab was open. Already fixed same-day, but `react-hooks/exhaustive-deps` (enabled at `recommended` in `eslint.config.js`) doesn't catch this class of bug — it verifies listed deps are complete, not that a custom hook's *returned* functions are stable. Add either (a) a small circuit breaker / minimum-interval guard on admin-page polling fetches, or (b) an audit of other custom hooks returning callbacks (grep for hook results used inside another hook's dependency array) to confirm none share this footgun.
- **Why it's not higher:** Dev-only surface (hidden, token-gated admin page, never linked from the product) — no customer impact. Scored on cost/reliability risk alone: the Hobby-plan Fluid CPU budget is a hard metered cap, this class of bug has no alerting today, and it would only be caught by manually checking the Vercel usage dashboard — same way this one was.

### 15. URL query-param rewrite boilerplate duplicated four times in App.jsx
- **What:** Flagged in the `?live=` URL-persistence review (2026-07-17). The `new URLSearchParams(window.location.search)` → mutate → `window.history.replaceState(null, '', pathname + '?' + qs + hash)` pattern is hand-rolled in four places: the manage-teams effect, the `?m=` push-landing strip effect, `handleSelectLiveMatch` (sets `?live=`), and `closeLiveSeriesSheet` (clears `?live=`). A small shared `setUrlParam(key, value)` / `removeUrlParam(key)` helper would remove the duplication. Purely a simplification — no correctness issue in any of the four call sites.

### 16. verify-prod od-consistency check miscalibrated for round-robin group stages
- **What:** `scripts/verify-prod.mjs`'s od-consistency check (`maxExpected = effectiveSeries * 5`) uses `finishedSeries` from the bracket API as the fallback denominator when `totalStandingWins <= finishedSeries * 3`. For a BO2 round-robin group stage (e.g. EWC 2026 Group A), `finishedSeries` (bracket-only) stayed at 3 all day while the actual completed-game count climbed to 18 as more round-robin series finished — the bracket API doesn't track round-robin completions the way it tracks elimination-bracket ones, so the denominator never grows with real progress. Failed a 2026-07-07 deploy verification for reasons unrelated to that deploy (confirmed: the deploy's actual target — 4 previously-unmatched EWC series — was independently verified archived correctly via direct `match_stream_history` inspection). Needs a group-stage-aware denominator (e.g. count distinct series_id in OD's own game list) instead of relying on the bracket API for formats that don't use single-elimination brackets.

### 17. Recent / popular search suggestions
- **What:** Show up to 5 recent searches (localStorage) and a few suggested queries ("Team Liquid", "DreamLeague") in the search overlay before the user types anything.

### 17. "Has VOD" filter
- **What:** Post-search filter chip to narrow results to games that have a confirmed VOD link. Complements the existing All/BO1/BO3/BO5 series type filter.

### 17. Move push subscriptions from KV to Supabase
- **What:** Design a `push_subscriptions` table in Supabase: `(id UUID PK, user_id TEXT UNIQUE, endpoint TEXT, p256dh TEXT, auth TEXT, teams TEXT[], updated_at TIMESTAMPTZ)`. Migrate the push-subscribe write path in `live-matches.js` to Supabase upsert. Migrate the notification send path to query Supabase by team name instead of KV `push:team:{name}` index.
- **Expected benefit:** Proper relational data model. No more 30-day TTL expiry silently deleting subscriptions. Queryable: you can count subscribers per team, identify expired subscriptions, and analyze notification delivery rates.
- **Risk:** Medium — requires a migration of existing KV subscriptions, a new Supabase table, and updating both the subscribe and send paths. Supabase is already integrated (articles table), so no new credentials needed.
- **Dependencies:** Server-derived userId fix — **done** (see Completed Archive). Unblocked.
- **Sequence:** Design schema → dual-write (KV + Supabase) → verify parity → cut over read path to Supabase → deprecate KV push keys.

### 20. Verify "OG" PS↔OD name mapping when next active
- **What:** 2026-07-07 tier-1 team-name scrub (see `CONTEXT.md` `TEAM_NAME_ALIAS_GROUPS`) couldn't confirm PandaScore's team search for "OG" — their 2-char name makes PS's search return noise, so their real PS team id was never found. Revisit once OG has a live/recent match to check both providers' actual match-time naming — add to `TEAM_NAME_ALIAS_GROUPS` only if a real divergence shows up.
- **Note:** Confidence is 50% and this is opportunistic — do it whenever OG next plays, don't go looking for a reason to schedule it.

### 21. Full TypeScript migration
- **What:** Phase 1 (jsconfig + checkJs, 1 week): enable `checkJs: true`, fix all implicit any errors in `_shared.js` and `api.js`. Phase 2 (rename to .ts, 1–2 weeks): start with `_shared.ts`, `_kv.ts`, then API handlers, then React components. Phase 3: CI enforcement (`tsc --noEmit` in GitHub Actions).
- **Expected benefit:** Compiles away an entire category of bugs (wrong property name, null not handled, wrong function signature). Required for sustainable multi-engineer development. Makes the PS↔OD bridge contract machine-checkable. Enables IDE autocomplete on the complex PandaScore and OpenDota object shapes.
- **Risk:** Medium — edge middleware (`middleware.js`) has edge runtime constraints that limit which Node.js types are available. React 19 is fully TypeScript-compatible. Vercel serverless functions support TypeScript natively.
- **Dependencies:** JSDoc phase — **done** (see Completed Archive). Unblocked, but this is still the largest single item in the backlog by effort, which is why it scores last despite high Reach/Impact.
- **Sequence:** jsconfig + checkJs → fix errors → rename to .ts file by file (start with leaf files that have no imports, work inward) → enforce in CI.

---

## Completed Archive

~~`fetchMatchSummary` still fetches OpenDota directly from browser~~ ✅ Done (2026-07-19) — `api/summarize.js` now fetches OpenDota server-side (`getMatchData()`, mirrors `getHeroNames()`'s fail-open pattern); client `fetchMatchSummary(matchId)` POSTs `{ matchId }` instead of the full `matchData` blob. Same fix pattern as the `?mode=heroes-proxy` fix.
~~Shorten twitch-vod miss TTL for very recent matches~~ ✅ Done — 5-min TTL for matches in last 24h, 30-min for older; both miss paths in `match-streams.js` updated.
~~Sync `findLeague` test copy with production implementation~~ ✅ Done
~~Remove dead `rawUrl` fallback in LiveMatchRow~~ ✅ Done
~~Extract `getSeriesLabel()` to `_shared.js`~~ ✅ Done
~~Extract KV singleton to `api/_kv.js`~~ ✅ Done
~~[SECURITY] Add security response headers to vercel.json~~ ✅ Done (commit 8cc3e69)
~~[SECURITY] Fix analytics-chat password comparison — timingSafeEqual~~ ✅ Done (commit 8cc3e69)
~~[RELIABILITY] Add distributed lock to draft-posts.js (cron dedup)~~ ✅ Done (commit 8cc3e69)
~~[RELIABILITY] Add TTL to module-level `_premiumLeagueIds` in-memory cache~~ ✅ Done (commit 468936e)
~~[RELIABILITY] Fix `getHeroNames()` in summarize.js — add KV cache + timeout~~ ✅ Done (commit 468936e)
~~[CORRECTNESS] Remove duplicate `PERMANENT_TIER1_NAMES` in tournaments.js~~ ✅ Done (commit 468936e)
~~[SECURITY] Restrict CORS on sensitive endpoints~~ ✅ Done — `setCorsHeaders()` in `_shared.js`; `twitch-token`, `summarize`, `analytics-chat`, `pipeline` restricted to `https://spectateesports.live`; `live-matches` and `tournaments` stay `*`.
~~[SECURITY] Rate-limit LLM and expensive endpoints~~ ✅ Done — `rateLimitByIp()` in `_shared.js`, 10 req/min on `summarize` and `analytics-chat`. Watchability still unthrottled.
~~[SECURITY] Rate-limit watchability endpoint~~ ✅ Done — 20 req/min on cache-miss path in `handleWatchability`
~~[SECURITY] Move analytics-chat password to request header~~ ✅ Done — header primary, body fallback; `AnalyticsPage.jsx` and `AnalyticsChat.jsx` updated
~~[SECURITY] Add Permissions-Policy header to vercel.json~~ ✅ Done
~~[RELIABILITY] Log KV lock contention in auto-tweet cron~~ ✅ Done
~~[DX] Add Vercel function count guard to GitHub Actions CI~~ ✅ Done (`.github/workflows/check-limits.yml`)
~~[SECURITY] Push subscription userId must be server-derived, not client-provided~~ ✅ Done — `api/live-matches.js` now derives `userId = HMAC-SHA256(VAPID_PRIVATE_KEY, endpoint).slice(0,32)` server-side; client no longer sends or controls userId; `src/utils/push.js` localStorage UUID logic removed.
~~[SECURITY] Proxy Twitch Helix API calls server-side; don't send OAuth token to browser~~ ✅ Done — `?mode=twitch-vod` added to `match-streams.js` with server-side Helix calls and dual KV caching (channel UID 30d, VOD result 24h/30min); `?mode=twitch-token` removed; `src/api.js findTwitchVod()` is now a thin proxy wrapper.
~~[ARCHITECTURE] Extract tournaments.js handlers into `api/_handlers/` modules~~ ✅ Done — `api/tournaments.js` reduced to 156-line router; 17 handler files + 2 shared utility files created under `api/_handlers/`.
~~[OBSERVABILITY] Structured logging with request correlation IDs~~ ✅ Done — `createLogger(endpoint)` factory in `_shared.js`; all handler files migrated to structured JSON logs with per-request correlation IDs.
~~[PERFORMANCE] Per-route service worker caching strategies~~ ✅ Done — `src/sw.js` now uses per-route NetworkFirst/CacheFirst strategies with `ExpirationPlugin` TTLs matched to data volatility.
~~[CORRECTNESS] Input validation layer for query parameters~~ ✅ Done — `validateId()` and `validateEnum()` in `_shared.js`; applied to `match-streams.js`, `matchStats.js`, `matchIndicators.js`, `liveSeriesGames.js`, `tournament-detail.js`.
~~[SECURITY] Content-Security-Policy header~~ ✅ Done — `Content-Security-Policy-Report-Only` header added to `vercel.json`; covers all known first- and third-party origins; report-only mode for 2-week observation before enforcement.
~~[MAINTAINABILITY] Move `_x-accounts.js` team/tournament handles to KV~~ ✅ Done — `refreshHandles()` reads `x-accounts:handles:v1` from KV with 1h in-memory cache; static constants remain as fallback; admin `POST ?type=update-handles` in `draft-posts.js` gated by `CRON_SECRET`.
~~[PERFORMANCE] Pre-warm match stats on completed card visibility~~ ✅ Done — `IntersectionObserver` in `MatchCard.jsx` pre-fetches `match-indicators` for completed-game cards 300px before they enter view.
~~[CORRECTNESS] JSDoc type annotations for shared data shapes~~ ✅ Done — `@typedef` blocks for `PSMatch`, `ODMatch`, `SeriesGame`, `SeriesGroup`, `StreamResult`, `GameIndicators` added to `api/_shared.js`; `jsconfig.json` created with `checkJs: true`.
~~"1win Team" PS↔OD name mapping~~ ✅ Done (2026-07-15) — confirmed live: PandaScore names the org "1win" (EWC 2026 match id 1565904), OpenDota's team_id 8291895 still carries per-match `radiant_name`/`dire_name` "Tundra Esports" (pre-June-2026-roster-swap identity, OD ties team_id to Steam group continuity, not branding). No substring relationship, so added `['1win', 'tundraesports']` to `TEAM_NAME_ALIAS_GROUPS` in `src/teamMatching.js`. Surfaced by a favorites-highlighting bug report (team followed via its OD name didn't highlight its PS-sourced upcoming fixture).
~~Match-drawer game switcher groups by raw seriesId, unlike groupIntoSeries~~ ✅ Done (2026-07-11) — reported live via a PTime vs Nigma Galaxy (EWC 2026) BO2 that OD split across two series_ids; the drawer showed only game 1 with no switcher. Extracted the null/split-seriesId merge passes out of `groupIntoSeries` into exported `buildSeriesGroups(matches)` (returns the pre-sort, pre-trim seriesMap); `groupIntoSeries` now calls it before its sort + drop-oldest-incomplete trim. `App.jsx`'s `seriesMatchMap` is now built from `buildSeriesGroups`, keyed per-game by each game's own raw `seriesId` (not the merged group id) so the existing `selectedMatch.seriesId` lookup still hits. Regression tests added in `utils.test.js`.

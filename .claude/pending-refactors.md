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
| 2 | `GoldGraph` event-jump URL mis-parses a bare-digit `?t=` timestamp | 2 | 3 | 80% | 0.5 | **9.6** |
| 3 | Expand touch targets on icon buttons nested in clickable rows | 4 | 2 | 80% | 1 | **6.4** |
| 3 | VOD pre-fetch in background | 4 | 2 | 80% | 1 | **6.4** |
| 5 | Add Sentry error monitoring | 5 | 4 | 90% | 3 | **6.0** |
| 6 | Batch push-subscriber KV reads in `sendPushNotificationsForMatches` | 4 | 4 | 80% | 3 | **4.3** |
| 7 | Replace O(n²) series merge with union-find | 5 | 2 | 90% | 3 | **3.0** |
| 8 | Sticky "Now Watching" panel | 4 | 3 | 70% | 3 | **2.8** |
| 9 | App.jsx state machine for async clusters (`useReducer`) | 3 | 3 | 70% | 3 | **2.1** |
| 9 | Guard against unmemoized-hook-driven infinite fetch loops on admin pages | 1 | 3 | 70% | 1 | **2.1** |
| 11 | URL query-param rewrite boilerplate (4x in App.jsx) | 2 | 1 | 100% | 1 | **2.0** |
| 12 | verify-prod od-consistency check miscalibrated for round-robin | 2 | 3 | 90% | 3 | **1.8** |
| 13 | Recent / popular search suggestions | 3 | 2 | 60% | 3 | **1.2** |
| 13 | "Has VOD" filter | 3 | 2 | 60% | 3 | **1.2** |
| 13 | Move push subscriptions from KV to Supabase | 3 | 4 | 80% | 8 | **1.2** |
| 16 | Verify "OG" PS↔OD name mapping when next active | 1 | 2 | 50% | 1 | **1.0** |
| 17 | Full TypeScript migration | 5 | 4 | 60% | 20 | **0.6** |

---

### 1. `font-display: swap` for Barlow font
- **What:** Add `font-display: swap` and `<link rel="preconnect">` to the Google Fonts import to avoid layout shift on first load.
- **Why it's #1:** Every page load, near-zero effort, and directly helps Core Web Vitals (CLS) — which ties into the SEO/GEO growth work.

### 2. `GoldGraph`'s event-jump URL builder mis-parses a bare-digit `?t=` timestamp
- **What:** Spotted during the 2026-07-20 Kick-primary-promotion review. `GoldGraph.jsx`'s `buildEventUrl(vodUrl, eventTimeSecs)` reads the existing `?t=` param and regexes out an `XhYmZs`-suffixed duration (Twitch's format). `api/pipeline/_vod-urls.js` can also produce a manually-timestamped YouTube `main`/`others` entry (`kind: 'start_point'`) whose `?t=` is a bare digit count (e.g. `?t=827`, no unit suffix) — the admin VOD-URL tool writes these. For that shape, the regex fails to match any suffix, `baseSecs` silently defaults to `0`, and the resulting Roshan/rax-marker WATCH link lands at `eventTimeSecs` into the VOD instead of `827 + eventTimeSecs` — wrong point, no error shown.
- **Pre-existing, not introduced by the Kick fix:** this path was already reachable before 2026-07-20 (a non-expired start-point main was never source-gated), just apparently never hit in practice. The Kick change didn't touch `GoldGraph.jsx` or this parsing.
- **Fix:** extend `buildEventUrl`'s regex to also accept a bare digit `?t=` value (treat it as raw seconds), or normalize both `_vod-urls.js` and the admin tool to always emit the `XhYmZs` suffixed form.

### 3. Expand touch targets on icon buttons nested in clickable rows
- **What:** Outcome of the 2026-07-20 mobile touch-target audit (the audit itself is closed — see the archive). Every remaining sub-44px control falls into one shape: a small icon button that sits *inside* a larger clickable row and calls `e.stopPropagation()`. Confirmed offenders: `LiveMatchRow.jsx` watch buttons (`w-7 h-7` = 28px, and the two `sm:hidden` ones are mobile-only by definition), `CompactSeriesRow.jsx` watch buttons (28px), `MatchCard.jsx` follow stars (`p-0.5` + `w-3.5` = 18px), `MatchDrawer.jsx` follow stars (`p-1` + `w-4` = 24px), `TournamentHub.jsx` + `TournamentDetail.jsx` format-info "i" badges (`w-3.5 h-3.5` = 14px).
- **Why it wasn't fixed in the audit pass:** the obvious fix (grow the box, or add a `before:` pseudo-element hit area) makes the child steal taps from the row it sits in — a fan aiming at the row to open the drawer would hit Watch instead. That is a worse regression than the small target. Fixing this properly needs a design decision about the row anatomy (e.g. give the row a fixed ≥56px height so a 44px child fits without overlap, or move the action out of the row), which is why it is its own scored item rather than a loose end.
- **Not offenders (verified 2026-07-20, don't re-audit these):** `MatchCard` game rows (`min-h-[44px]`), `BottomTabBar` tabs (`min-h-[56px]`), `SettingsSheet` rows (`min-h-[44px]`), `SearchBar` input + submit + both clear buttons (fixed 2026-07-20), `StreamPicker` rows (`min-h-[44px]`).

### 3. VOD pre-fetch in background
- **What:** When a user clicks a game row, start resolving the VOD before the drawer finishes opening. Currently the "Finding VOD…" spinner only starts after the drawer is open.
- **2026-07-20 attempt reverted — read before retrying.** A first pass (5-min TTL promise cache around `resolveMatchStreams` + sibling pre-warm on drawer open) was built, then reverted on independent review, for two separate reasons:
  1. **Governance:** `resolveMatchStreams` is the entry point to the LOCKED VOD Replay System (`.claude/claude_instructions_template.md`). The owner had not pre-approved a change there; asked mid-session, the owner chose to defer rather than approve blind. **Any future attempt needs owner sign-off on the specific diff before it lands, not after.**
  2. **Correctness, found by the independent reviewer before that governance question was even raised** — keep these in mind for the next attempt, they are not solved by simply re-applying the old diff:
     - A cache entry keyed only by `match.id` silently ignores that `resolveMatchStreams`'s result depends on `allMatches` too (sibling set determines `preferredChannel`). `handleLoadMore` / `handleSearchLoadMore` / a feed refresh can grow `allMatches` mid-session; a 5-min-old cache entry computed from a smaller sibling set can serve a strictly worse ("No VOD found") result than a fresh resolve would. Key needs to account for this, or the TTL needs to be short enough that it doesn't matter, or the cache needs invalidating on `allMatches` growth.
     - Pull-to-refresh (`usePullToRefresh` / `loadMatches`) doesn't clear the cache — it's the user's only recovery gesture for a bad VOD result, and a module-level cache surviving a refresh defeats it.
     - `handleSelectMatch` has no request-token / staleness guard on `setSelectedMatch`, unlike every other async-then-setState path in this codebase (`MatchDrawer`'s `cancelled` flag, `statsMatchId` guard, `liveReplayTokenRef`). Cache + prefetch make "click A (slow, cold), click B (instant, warm)" the common case instead of the rare one, so a stale A response landing after B commits and clobbering `selectedMatch` back to A becomes a real risk, not a theoretical one — add the same token-guard pattern before shipping this.
     - Sibling prefetch fired the full resolution chain (Supabase read + stream-map fetch + Helix VOD lookup) for every sibling on every drawer open, gated on nothing — not on the switcher being visible, not on a hover/dwell signal, no cancellation on dismiss. For a BO5 that's up to 4 extra chains per open, unconditionally. If prefetch ships, gate it on some intent signal (hover/touchstart per the original item title, or at minimum only prefetch the adjacent game, not all siblings) rather than firing eagerly on every open.
  - Analytics (`replay_source`) moving out of `resolveMatchStreams` into the caller is fine on its own and can be kept in a future attempt — it was the cache/prefetch mechanics that were the problem, not the analytics relocation.

### 5. Add Sentry error monitoring
- **Files:** `api/_shared.js`, all handler files, `vite.config.js`
- **What:** `npm install @sentry/node @sentry/vite-plugin`. Initialize in `_shared.js` (server) and `src/main.jsx` (browser). Replace `trackError()` Redis telemetry with `Sentry.captureException()`. Set up a Sentry project alert for error rate spikes.
- **Why:** The homegrown Redis error list (`monitor:errors:{date}`, capped at 100, 3-day TTL) has no alerting, no stack traces, and no release tracking. You only see errors if you actively check the KV key. Sentry free tier: 5,000 errors/month.
- **Risk:** Low — additive. `trackError()` can be removed after Sentry is verified working.
- **Dependencies:** Requires Sentry account + `SENTRY_DSN` env var.

### 6. Batch push-subscriber KV reads in `sendPushNotificationsForMatches`
- **What:** `api/live-matches.js` `sendPushNotificationsForMatches()` does sequential per-team / per-user `kv.get()` calls inside nested loops (`push:team:*`, `push:sent:*`, `push:sub:*`). This runs on the `?cron=1` capture path, now firing every 10 min. Fine at today's subscriber count, but it scales linearly with subscribers and is the most likely cause of a future `maxDuration` timeout on that path (a stopgap `maxDuration: 30` was added Jun 20). A timeout here risks the whole capture cron, not just push delivery. Replace the per-user gets with `kv.mget()` batches.

### 7. Replace O(n²) series merge with union-find
- **Files:** `src/utils.js` (`groupIntoSeries`, third pass, lines 163–190)
- **What:** The `while(mergedAny) + break outer` restart loop is O(n²·m) in the worst case. Replace with a path-compressed union-find (disjoint set union) that finds merge candidates in a single pass: O(n²) one pass to build the merge set + O(n·α(n)) for union operations ≈ effectively O(n²) total but with no restart penalty.
- **Why it's not higher:** At current scale (~50–100 matches per page) this is negligible — Impact is capped at 2 until scale changes. At 10x scale (500+ matches in a tournament view + multi-page load-more), revisit — the restart loop starts accumulating and Impact should be re-scored upward.
- **Risk:** Medium — the series merge algorithm is subtle and has existing tests. Must keep all current test cases passing. Run `vitest run` before and after.
- **Dependencies:** None — isolated to `src/utils.js`.

### 8. Sticky "Now Watching" panel
- **What:** Keep the match detail panel (currently a drawer) sticky below the header on scroll so Watch / Summary actions stay visible while browsing the match list.

### 9. App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.

### 9. Guard against unmemoized-hook-driven infinite fetch loops on internal/admin pages
- **What:** Root-caused 2026-07-19 while diagnosing a Fluid Active CPU spike on Jun 21 (~38 min in one day vs. a ~5–7 min/day baseline — 75% of the Hobby plan's 4h/month budget was consumed by the time this was investigated). `AdminVodUrlsPage.jsx`'s `useAdminToken()` returned `save`/`clear` without `useCallback` before commit `67652354` (2026-06-21), so `load`'s `useCallback([clear])` got a new identity every render, retriggering the `useEffect([token, days, load])` — an unthrottled fetch loop against `/api/pipeline?type=vod-urls` (a Supabase query grouping up to 5,000 rows) for ~11 hours while the tab was open. Already fixed same-day, but `react-hooks/exhaustive-deps` (enabled at `recommended` in `eslint.config.js`) doesn't catch this class of bug — it verifies listed deps are complete, not that a custom hook's *returned* functions are stable. Add either (a) a small circuit breaker / minimum-interval guard on admin-page polling fetches, or (b) an audit of other custom hooks returning callbacks (grep for hook results used inside another hook's dependency array) to confirm none share this footgun.
- **Why it's not higher:** Dev-only surface (hidden, token-gated admin page, never linked from the product) — no customer impact. Scored on cost/reliability risk alone: the Hobby-plan Fluid CPU budget is a hard metered cap, this class of bug has no alerting today, and it would only be caught by manually checking the Vercel usage dashboard — same way this one was.

### 11. URL query-param rewrite boilerplate duplicated four times in App.jsx
- **What:** Flagged in the `?live=` URL-persistence review (2026-07-17). The `new URLSearchParams(window.location.search)` → mutate → `window.history.replaceState(null, '', pathname + '?' + qs + hash)` pattern is hand-rolled in four places: the manage-teams effect, the `?m=` push-landing strip effect, `handleSelectLiveMatch` (sets `?live=`), and `closeLiveSeriesSheet` (clears `?live=`). A small shared `setUrlParam(key, value)` / `removeUrlParam(key)` helper would remove the duplication. Purely a simplification — no correctness issue in any of the four call sites.

### 12. verify-prod od-consistency check miscalibrated for round-robin group stages
- **What:** `scripts/verify-prod.mjs`'s od-consistency check (`maxExpected = effectiveSeries * 5`) uses `finishedSeries` from the bracket API as the fallback denominator when `totalStandingWins <= finishedSeries * 3`. For a BO2 round-robin group stage (e.g. EWC 2026 Group A), `finishedSeries` (bracket-only) stayed at 3 all day while the actual completed-game count climbed to 18 as more round-robin series finished — the bracket API doesn't track round-robin completions the way it tracks elimination-bracket ones, so the denominator never grows with real progress. Failed a 2026-07-07 deploy verification for reasons unrelated to that deploy (confirmed: the deploy's actual target — 4 previously-unmatched EWC series — was independently verified archived correctly via direct `match_stream_history` inspection). Needs a group-stage-aware denominator (e.g. count distinct series_id in OD's own game list) instead of relying on the bracket API for formats that don't use single-elimination brackets.

### 13. Recent / popular search suggestions
- **What:** Show up to 5 recent searches (localStorage) and a few suggested queries ("Team Liquid", "DreamLeague") in the search overlay before the user types anything.

### 13. "Has VOD" filter
- **What:** Post-search filter chip to narrow results to games that have a confirmed VOD link. Complements the existing All/BO1/BO3/BO5 series type filter.

### 13. Move push subscriptions from KV to Supabase
- **What:** Design a `push_subscriptions` table in Supabase: `(id UUID PK, user_id TEXT UNIQUE, endpoint TEXT, p256dh TEXT, auth TEXT, teams TEXT[], updated_at TIMESTAMPTZ)`. Migrate the push-subscribe write path in `live-matches.js` to Supabase upsert. Migrate the notification send path to query Supabase by team name instead of KV `push:team:{name}` index.
- **Expected benefit:** Proper relational data model. No more 30-day TTL expiry silently deleting subscriptions. Queryable: you can count subscribers per team, identify expired subscriptions, and analyze notification delivery rates.
- **Risk:** Medium — requires a migration of existing KV subscriptions, a new Supabase table, and updating both the subscribe and send paths. Supabase is already integrated (articles table), so no new credentials needed.
- **Dependencies:** Server-derived userId fix — **done** (see Completed Archive). Unblocked.
- **Sequence:** Design schema → dual-write (KV + Supabase) → verify parity → cut over read path to Supabase → deprecate KV push keys.

### 16. Verify "OG" PS↔OD name mapping when next active
- **What:** 2026-07-07 tier-1 team-name scrub (see `CONTEXT.md` `TEAM_NAME_ALIAS_GROUPS`) couldn't confirm PandaScore's team search for "OG" — their 2-char name makes PS's search return noise, so their real PS team id was never found. Revisit once OG has a live/recent match to check both providers' actual match-time naming — add to `TEAM_NAME_ALIAS_GROUPS` only if a real divergence shows up.
- **Note:** Confidence is 50% and this is opportunistic — do it whenever OG next plays, don't go looking for a reason to schedule it.

### 17. Full TypeScript migration
- **What:** Phase 1 (jsconfig + checkJs, 1 week): enable `checkJs: true`, fix all implicit any errors in `_shared.js` and `api.js`. Phase 2 (rename to .ts, 1–2 weeks): start with `_shared.ts`, `_kv.ts`, then API handlers, then React components. Phase 3: CI enforcement (`tsc --noEmit` in GitHub Actions).
- **Expected benefit:** Compiles away an entire category of bugs (wrong property name, null not handled, wrong function signature). Required for sustainable multi-engineer development. Makes the PS↔OD bridge contract machine-checkable. Enables IDE autocomplete on the complex PandaScore and OpenDota object shapes.
- **Risk:** Medium — edge middleware (`middleware.js`) has edge runtime constraints that limit which Node.js types are available. React 19 is fully TypeScript-compatible. Vercel serverless functions support TypeScript natively.
- **Dependencies:** JSDoc phase — **done** (see Completed Archive). Unblocked, but this is still the largest single item in the backlog by effort, which is why it scores last despite high Reach/Impact.
- **Sequence:** jsconfig + checkJs → fix errors → rename to .ts file by file (start with leaf files that have no imports, work inward) → enforce in CI.

---

## Completed Archive

~~Mobile touch target audit~~ ✅ Done (2026-07-20) — audited every `<button>`/`<a>` in `src/` against the 44px floor. `MatchCard` rows, `BottomTabBar`, `SettingsSheet` rows and `StreamPicker` rows already passed (the item's guess about `MatchCard` was wrong). `SearchBar`'s two clear buttons genuinely failed: the full-size one (absolutely positioned, no layout cost) grown to `w-11 h-11`; the compact one (inline in a tight header row) grown via `min-h-[44px]` + `px-2.5` only — DESIGN_GUIDELINES specifies a min-*height* floor, not min-width, and matching width to height there would have narrowed the search input. Remaining failures are all icon-buttons nested inside clickable rows, split out as its own scored item (#3) because fixing them needs a row-anatomy design decision, not padding.
~~`seriesMatchMap` can overwrite on colliding null/0/undefined `seriesId` keys~~ ✅ Done (2026-07-20) — `App.jsx`'s `seriesMatchMap` is now keyed by each game's own `id` instead of its raw `seriesId`, so two orphan games from unrelated series can no longer collide on one key. Both `seriesGames` and the `seriesMatches` prop now derive from a single `selectedSeriesIds` lookup. A secondary `seriesIdToIds` index (truthy seriesId only, so it can't reintroduce the null/0/undefined collision) was added as a fallback for the id-primary lookup: `fetchAppMatchFromOpenDota` (shared-URL / live-series-replay open paths) returns a standalone match that is never inserted into `allMatches`, so its own id can never be a key in the primary map even though its siblings are — independent review caught that the id-only version silently dropped the game switcher on that path, which the seriesId fallback restores. Regression tests added in `utils.test.js` for both the collision fix and the fallback.
~~Duplicated `HeroIcon` + `LGM_WINDOW_S`~~ ✅ Done (2026-07-20) — `src/components/HeroIcon.jsx` extracted and used by both `SeriesGameDraftStrip` and `SeriesLivePulse` (size, placeholder tint, and error-fallback mode are props, since the two call sites legitimately differ on all three). `LGM_WINDOW_S` hoisted to `api/_shared.js` as `OD_MATCH_TIME_WINDOW_S` and consumed by `findOdMatchByTime` itself, so the matcher and its two pre-filtering callers now read one constant instead of three hand-copied literals.
~~Remove dead "Multiple channels were live" copy in MatchDrawer~~ ✅ Done (2026-07-20) — unreachable `allVods.length > 1` block deleted along with its now-single-child wrapper `<div>`; a comment records why `allVods` is capped at one entry so it doesn't get re-added.
~~`aria-describedby` on search errors~~ ✅ Done (2026-07-20) — `HomeFeed` exports `FEED_ERROR_ID` and stamps it on the load-error message; `App.jsx` passes `errorId={error ? FEED_ERROR_ID : undefined}` to `SearchBar`, which already supported the prop but had never been given it by any caller. Only wired while an error is live, so the reference is never dangling.
~~Shared `Sheet`/`Drawer` wrapper for `LiveSeriesSheet` + `MatchDrawer`~~ ✅ Done (2026-07-20) — `src/components/Sheet.jsx` owns the backdrop, the sliding panel, and the Escape handler; `LiveSeriesSheet` and both of `MatchDrawer`'s return paths render into it, passing only a width and an aria-label. Verified visually identical via `git diff -w`. Each sheet's header and close button stayed with the caller on purpose — the two style their close affordance differently and unifying them is a design call, not a DRY cleanup. `focus-ring` added to both close buttons; a dead `drawerRef` was dropped.

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
~~Match-drawer game switcher groups by raw seriesId, unlike groupIntoSeries~~ ✅ Done (2026-07-11) — reported live via a PTime vs Nigma Galaxy (EWC 2026) BO2 that OD split across two series_ids; the drawer showed only game 1 with no switcher. Extracted the null/split-seriesId merge passes out of `groupIntoSeries` into exported `buildSeriesGroups(matches)` (returns the pre-sort, pre-trim seriesMap); `groupIntoSeries` now calls it before its sort + drop-oldest-incomplete trim. `App.jsx`'s `seriesMatchMap` was originally keyed per-game by each game's own raw `seriesId` so `selectedMatch.seriesId` lookups hit — **superseded 2026-07-20, see below: that keying had a null/0/undefined collision bug of its own.** Regression tests added in `utils.test.js`.

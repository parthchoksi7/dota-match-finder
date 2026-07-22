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
| 5 | VOD pre-fetch in background | 4 | 2 | 80% | 1 | **6.4** |
| 7 | Add Sentry error monitoring | 5 | 4 | 90% | 3 | **6.0** |
| 8 | Batch push-subscriber KV reads in `sendPushNotificationsForMatches` | 4 | 4 | 80% | 3 | **4.3** |
| 21 | Dead `FormatTooltip` component in `TournamentHub.jsx` | 1 | 1 | 90% | 0.25 | **3.6** |
| 13 | URL query-param rewrite boilerplate (4x in App.jsx) | 2 | 1 | 100% | 1 | **2.0** |
| 14 | verify-prod od-consistency check miscalibrated for round-robin | 2 | 3 | 90% | 3 | **1.8** |
| 15 | Extract shared floating tooltip/popover component | 3 | 2 | 70% | 3 | **1.4** |
| 16 | Recent / popular search suggestions | 3 | 2 | 60% | 3 | **1.2** |
| 16 | "Has VOD" filter | 3 | 2 | 60% | 3 | **1.2** |
| 16 | Move push subscriptions from KV to Supabase | 3 | 4 | 80% | 8 | **1.2** |
| 19 | Verify "OG" PS↔OD name mapping when next active | 1 | 2 | 50% | 1 | **1.0** |
| 20 | Full TypeScript migration | 5 | 4 | 60% | 20 | **0.6** |

---

### 1. `font-display: swap` for Barlow font
- **What:** Add `font-display: swap` and `<link rel="preconnect">` to the Google Fonts import to avoid layout shift on first load.
- **Why it's #1:** Every page load, near-zero effort, and directly helps Core Web Vitals (CLS) — which ties into the SEO/GEO growth work.

### 5. VOD pre-fetch in background
- **What:** When a user clicks a game row, start resolving the VOD before the drawer finishes opening. Currently the "Finding VOD…" spinner only starts after the drawer is open.
- **2026-07-20 attempt reverted — read before retrying.** A first pass (5-min TTL promise cache around `resolveMatchStreams` + sibling pre-warm on drawer open) was built, then reverted on independent review, for two separate reasons:
  1. **Governance:** `resolveMatchStreams` is the entry point to the LOCKED VOD Replay System (`.claude/claude_instructions_template.md`). The owner had not pre-approved a change there; asked mid-session, the owner chose to defer rather than approve blind. **Any future attempt needs owner sign-off on the specific diff before it lands, not after.**
  2. **Correctness, found by the independent reviewer before that governance question was even raised.**
- **2026-07-21 attempt — implemented, awaiting owner sign-off on the diff before it's considered landed.** `src/vodPrefetchCache.js` (new file) wraps the unchanged `resolveMatchStreams` in a client-side promise cache; `App.jsx` calls it from `handleSelectMatch` and from `onMouseEnter`/`onTouchStart` on the game-switcher chips. All 3 previously-identified correctness gaps addressed in this pass:
     - Cache entries are invalidated once `allMatches.length` has grown past what was recorded at write time (sibling-set growth can only make a stale entry worse, never better).
     - `clearVodPrefetchCache()` is called from `refreshAll` (pull-to-refresh's handler), so a refresh always gets a clean slate.
     - `selectMatchTokenRef` (same pattern as the existing `liveReplayTokenRef`) guards every `setSelectedMatch` call following an async resolution — bumped in `handleSelectMatch`, `dismissPanel`, `handleSearch`, and `handleClearSearch` — so a stale in-flight resolution from a superseded/dismissed selection can no longer clobber `selectedMatch`.
     - Sibling prefetch is gated on hover/touchstart on a game-switcher chip (not fired unconditionally for every sibling on drawer open), and skips the already-selected game.
  - Regression tests: `src/__tests__/vod-prefetch-cache.test.js` (9 cases covering cache hits, `allMatches`-growth invalidation, TTL expiry, rejected-resolution eviction, and pull-to-refresh clearing).
  - Analytics (`replay_source`) stayed inside `resolveMatchStreams`, unchanged.

### 7. Add Sentry error monitoring
- **Files:** `api/_shared.js`, all handler files, `vite.config.js`
- **What:** `npm install @sentry/node @sentry/vite-plugin`. Initialize in `_shared.js` (server) and `src/main.jsx` (browser). Replace `trackError()` Redis telemetry with `Sentry.captureException()`. Set up a Sentry project alert for error rate spikes.
- **Why:** The homegrown Redis error list (`monitor:errors:{date}`, capped at 100, 3-day TTL) has no alerting, no stack traces, and no release tracking. You only see errors if you actively check the KV key. Sentry free tier: 5,000 errors/month.
- **Risk:** Low — additive. `trackError()` can be removed after Sentry is verified working.
- **Dependencies:** Requires Sentry account + `SENTRY_DSN` env var.

### 8. Batch push-subscriber KV reads in `sendPushNotificationsForMatches`
- **What:** `api/live-matches.js` `sendPushNotificationsForMatches()` does sequential per-team / per-user `kv.get()` calls inside nested loops (`push:team:*`, `push:sent:*`, `push:sub:*`). This runs on the `?cron=1` capture path, now firing every 10 min. Fine at today's subscriber count, but it scales linearly with subscribers and is the most likely cause of a future `maxDuration` timeout on that path (a stopgap `maxDuration: 30` was added Jun 20). A timeout here risks the whole capture cron, not just push delivery. Replace the per-user gets with `kv.mget()` batches.

### 21. Dead `FormatTooltip` component in `TournamentHub.jsx`
- **What:** Found while fixing pending-refactors #5 (touch targets) — `FormatTooltip` (`TournamentHub.jsx:33`, a format-info "i" badge + tooltip, sibling to `TournamentDetail.jsx`'s live `StageInfoTooltip`) is declared but never rendered anywhere in the file (confirmed via `grep -n "FormatTooltip" TournamentHub.jsx` — only the declaration itself matches). Not caught by ESLint's `no-unused-vars`, which doesn't flag unreferenced top-level function declarations the way it flags unused variables. Its touch-target sizing was fixed for consistency alongside the live `StageInfoTooltip` (in case it gets wired up later), but that fix currently has no live effect since nothing renders it.
- **Fix:** either wire it up somewhere in `TournamentHub.jsx` (find the format label it was presumably meant to annotate) or delete it outright.

### 13. URL query-param rewrite boilerplate duplicated four times in App.jsx
- **What:** Flagged in the `?live=` URL-persistence review (2026-07-17). The `new URLSearchParams(window.location.search)` → mutate → `window.history.replaceState(null, '', pathname + '?' + qs + hash)` pattern is hand-rolled in four places: the manage-teams effect, the `?m=` push-landing strip effect, `handleSelectLiveMatch` (sets `?live=`), and `closeLiveSeriesSheet` (clears `?live=`). A small shared `setUrlParam(key, value)` / `removeUrlParam(key)` helper would remove the duplication. Purely a simplification — no correctness issue in any of the four call sites.

### 14. verify-prod od-consistency check miscalibrated for round-robin group stages
- **What:** `scripts/verify-prod.mjs`'s od-consistency check (`maxExpected = effectiveSeries * 5`) uses `finishedSeries` from the bracket API as the fallback denominator when `totalStandingWins <= finishedSeries * 3`. For a BO2 round-robin group stage (e.g. EWC 2026 Group A), `finishedSeries` (bracket-only) stayed at 3 all day while the actual completed-game count climbed to 18 as more round-robin series finished — the bracket API doesn't track round-robin completions the way it tracks elimination-bracket ones, so the denominator never grows with real progress. Failed a 2026-07-07 deploy verification for reasons unrelated to that deploy (confirmed: the deploy's actual target — 4 previously-unmatched EWC series — was independently verified archived correctly via direct `match_stream_history` inspection). Needs a group-stage-aware denominator (e.g. count distinct series_id in OD's own game list) instead of relying on the bracket API for formats that don't use single-elimination brackets.

### 15. Extract shared floating tooltip/popover component
- **What:** Found via the 2026-07-21 design consistency audit (full writeup: `.claude/design-consistency-audit-2026-07.md`). At least 9 call sites hand-roll their own floating tooltip/popover instead of sharing one: `ItemSlot.jsx:86`, `PlayerStatsSection.jsx:55`, `PlayerStatsSection.jsx:99`, `GameIndicators.jsx:34`, `LiveGoldGraph.jsx:229`, `GoldGraph.jsx:484`, `GoldGraph.jsx:637`, `TournamentHub.jsx:73`, `TournamentDetail.jsx:253`. They split into two unreconciled families: a dark-only family (`bg-gray-900`/`bg-gray-950`, no theme awareness) with inconsistent radius (`rounded-md` vs `rounded` vs `rounded-lg`) and shadow (`shadow-xl` vs `shadow-lg` vs `shadow-2xl`) between members; and a theme-aware "roster card" family (`TournamentHub.jsx` and `TournamentDetail.jsx`) that is otherwise a near-identical copy-paste of each other except for a hardcoded width (`w-64` vs `w-72`).
- **Why it happened:** `Sheet.jsx`'s own header comment documents this exact failure mode occurring once already — `MatchDrawer` and `LiveSeriesSheet` independently hand-coded a byte-identical backdrop/panel before it was extracted (see the "Unify the match-sheet shell" entry in Completed Archive). The tooltip layer is the same pattern repeating one level down.
- **Fix:** Extract a `FloatingTooltip`/`Popover` component covering position-clamping, theme-aware background, and a single radius/shadow pair; migrate the 9 call sites.
- **Why it's not higher:** No user-facing bug today — purely a maintenance/drift risk that compounds the longer it sits.

### 16. Recent / popular search suggestions
- **What:** Show up to 5 recent searches (localStorage) and a few suggested queries ("Team Liquid", "DreamLeague") in the search overlay before the user types anything.

### 16. "Has VOD" filter
- **What:** Post-search filter chip to narrow results to games that have a confirmed VOD link. Complements the existing All/BO1/BO3/BO5 series type filter.

### 16. Move push subscriptions from KV to Supabase
- **What:** Design a `push_subscriptions` table in Supabase: `(id UUID PK, user_id TEXT UNIQUE, endpoint TEXT, p256dh TEXT, auth TEXT, teams TEXT[], updated_at TIMESTAMPTZ)`. Migrate the push-subscribe write path in `live-matches.js` to Supabase upsert. Migrate the notification send path to query Supabase by team name instead of KV `push:team:{name}` index.
- **Expected benefit:** Proper relational data model. No more 30-day TTL expiry silently deleting subscriptions. Queryable: you can count subscribers per team, identify expired subscriptions, and analyze notification delivery rates.
- **Risk:** Medium — requires a migration of existing KV subscriptions, a new Supabase table, and updating both the subscribe and send paths. Supabase is already integrated (articles table), so no new credentials needed.
- **Dependencies:** Server-derived userId fix — **done** (see Completed Archive). Unblocked.
- **Sequence:** Design schema → dual-write (KV + Supabase) → verify parity → cut over read path to Supabase → deprecate KV push keys.

### 19. Verify "OG" PS↔OD name mapping when next active
- **What:** 2026-07-07 tier-1 team-name scrub (see `CONTEXT.md` `TEAM_NAME_ALIAS_GROUPS`) couldn't confirm PandaScore's team search for "OG" — their 2-char name makes PS's search return noise, so their real PS team id was never found. Revisit once OG has a live/recent match to check both providers' actual match-time naming — add to `TEAM_NAME_ALIAS_GROUPS` only if a real divergence shows up.
- **Note:** Confidence is 50% and this is opportunistic — do it whenever OG next plays, don't go looking for a reason to schedule it.

### 20. Full TypeScript migration
- **What:** Phase 1 (jsconfig + checkJs, 1 week): enable `checkJs: true`, fix all implicit any errors in `_shared.js` and `api.js`. Phase 2 (rename to .ts, 1–2 weeks): start with `_shared.ts`, `_kv.ts`, then API handlers, then React components. Phase 3: CI enforcement (`tsc --noEmit` in GitHub Actions).
- **Expected benefit:** Compiles away an entire category of bugs (wrong property name, null not handled, wrong function signature). Required for sustainable multi-engineer development. Makes the PS↔OD bridge contract machine-checkable. Enables IDE autocomplete on the complex PandaScore and OpenDota object shapes.
- **Risk:** Medium — edge middleware (`middleware.js`) has edge runtime constraints that limit which Node.js types are available. React 19 is fully TypeScript-compatible. Vercel serverless functions support TypeScript natively.
- **Dependencies:** JSDoc phase — **done** (see Completed Archive). Unblocked, but this is still the largest single item in the backlog by effort, which is why it scores last despite high Reach/Impact.
- **Sequence:** jsconfig + checkJs → fix errors → rename to .ts file by file (start with leaf files that have no imports, work inward) → enforce in CI.

---

## Completed Archive

~~`GoldGraph`'s event-jump URL builder mis-parses a bare-digit `?t=` timestamp~~ ✅ Done (2026-07-21) — `buildEventUrl` now detects a pure-digit `?t=` value and treats it as raw seconds instead of falling through the `XhYmZs` regex to a silent `baseSecs = 0`. Regression tests in `__tests__/gold-graph-event-url.test.js`.
~~Yellow "Champion" label conflicts with the reserved-color rule~~ ✅ Done (2026-07-21) — recolored all three (`TournamentCard.jsx`, `TournamentDetail.jsx`, `TournamentHub.jsx`) from `text-yellow-600 dark:text-yellow-400` to `text-amber-600 dark:text-amber-400`, matching the existing Grand Final trophy-badge convention. `DESIGN_GUIDELINES.md` updated: added an explicit "Personal / highlighted" amber palette row and a note on the yellow-400 rule documenting the resolution.
~~Unify the match-sheet shell between `MatchDrawer` and `LiveSeriesSheet`~~ ✅ Done (2026-07-21) — `Sheet.jsx` now exports canonical `SHEET_WIDTH` (`sm:w-[480px] lg:w-[520px]`) and `SHEET_PADDING` (`px-4 sm:px-5`) constants; both sheets, plus `SeriesLivePulse.jsx`'s internal padding, now import and use them instead of hardcoding their own values. `MatchDrawer`'s `GoldGraph` full-bleed wrapper and `GoldGraph.jsx`'s own header padding updated to track `SHEET_PADDING` at each breakpoint (`-ml-4 sm:-ml-5` / `pl-4 sm:pl-5`) so the bleed still lands on the true panel edge. `DESIGN_GUIDELINES.md` updated with the shared-constant contract and the corrected (previously stale) bleed-margin documentation.
~~Expand touch targets on icon buttons nested in clickable rows~~ ✅ Done (2026-07-21) — direction chosen: fixed-height row + real (non-pseudo-element) padding growth, so the enlarged hit area is honest layout space, not an invisible overlay. `LiveMatchRow`/`CompactSeriesRow` watch/replay buttons grown `w-7 h-7`→`w-11 h-11` with their rows' `min-h` bumped to match (desktop untouched via `sm:` overrides); `MatchCard`/`MatchDrawer` follow stars grown via `p-[15px]`/`p-[14px]` (icon glyph size unchanged); `TournamentHub`/`TournamentDetail` info badges restructured into an outer 44px `<button>` wrapping a small `aria-hidden` visual circle, using `group`/`group-hover:` to preserve the hover state. Caught and fixed a real regression along the way: the wider watch buttons started overlapping `LiveMatchRow`/`CompactSeriesRow`'s centered format-label (its `max-w` reservation assumed the old 28px size) — both now compute a wider reservation (dynamically, for `LiveMatchRow`'s 1-vs-2-button case). Verified visually at 375px/900px, light/dark, via a temporary local preview route (not committed).
~~Replace O(n²) series merge with union-find~~ ✅ Done (2026-07-21) — `buildSeriesGroups`'s third pass replaced with a path-compressed union-find over the numeric series-stub entries: one forward pass evaluates each pair once against its root's *current* aggregate (so growth-tightened constraints are still respected), no restart-the-whole-scan penalty. Union always keeps the smaller original index as root, preserving the old "earliest entry is canonical" id behavior. All 116 existing `utils.test.js` cases pass unchanged, including the 3-way split-series merge and the max-games-capacity guard.
~~Sticky "Now Watching" panel~~ ✅ Done (2026-07-21) — scoped to a sticky mini status bar (not a full persistent side panel — the RICE Effort=3 estimate didn't support a bigger rearchitecture, and the existing Sheet/drawer overlay pattern needed to stay untouched). New `NowWatchingBar.jsx`, mounted in `App.jsx` below `SiteHeader`: snapshots the resolved `selectedMatch` into `lastViewedMatch` when the drawer closes (`dismissPanel`), shows a compact "Now Viewing" row + Watch button (reads the already-resolved `allVods[0]`, never re-resolves) + dismiss. `CONTEXT.md`, `DESIGN_GUIDELINES.md`, `AboutPage.jsx`, `ReleaseNotesPage.jsx` updated.
~~App.jsx state machine for async clusters~~ ✅ Done (2026-07-21) — xPosts cluster (the specified pilot) converted from 7 separate `useState` calls to one `useReducer` (`xPostsReducer`/`initialXPostsState`, actions `open`/`success`/`error`/`close`). summary and redditPosts clusters intentionally left as-is — pilot only, per the item's own instruction to start with xPosts before deciding whether to extend the pattern.
~~Guard against unmemoized-hook-driven infinite fetch loops on internal/admin pages~~ ✅ Done (2026-07-21) — took option (b), audited every custom hook in `src/` for the returned-callback-instability footgun (only 4 hooks exist total). Found a live near-miss: `AdminCoveragePage.jsx`'s `useAdminToken()` had the exact pre-fix shape (`save`/`clear` not wrapped in `useCallback`) plus a `load` `useCallback` that referenced `clear` without listing it as a dependency — one `exhaustive-deps`-driven "fix" away from reproducing the Jun 21 incident. Fixed to match the already-corrected `AdminVodUrlsPage.jsx` pattern. No other admin page or hook shared the footgun.

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

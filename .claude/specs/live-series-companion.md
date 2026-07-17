# Live Series Companion — Feature Spec

**Status:** Phase 0 DEPLOYED (commit `3c26cb0`) — table created, `setup-qstash` run (5 schedules incl. `od-live-capture` `*/15`), verify-prod green. Phase 1 core built and **gated behind `spectate-owner`** (owner-only preview) for owner verification before public launch; non-owners see today's sheet byte-for-byte. Independent review clean; two edge-case fixes applied. Per the Owner-Only rule, NOT in About/Release Notes/CONTEXT until it graduates to public.

**Phase 1 build (owner-gated):** `src/components/SeriesGameDraftStrip.jsx` (new, glanceable 5v5 hero-icon strip), `LiveSeriesSheet.jsx` (owner branch: summary card w/ draft strip + result + whole-row tap → MatchDrawer; `!isOwner` branch unchanged), `src/api.js` `fetchLiveSeriesGameIds` (resolver call to patch missing ids), `App.jsx` passes `isOwner`. Enhanced (commit `16e28fb`, 2026-07-16) per a product/eng review from a fan's perspective: draft strip now shows in spoiler-free (pre-game, not a spoiler); `SeriesGameIndicators.jsx` added (Rampage/Rapier/swing/comeback chips, reusing `fetchMatchIndicators` + `GameIndicators`); series stakes line (`bracketRound`) in the header. A per-game kill score was prototyped and dropped — `match-stats` has no radiant/dire→named-winner attribution, so it would've been ambiguous next to a swapped-sides winner name.

**Phase 2 build (owner-gated, 2026-07-16):** live pulse for the CURRENTLY RUNNING game — gold lead, kill score, live draft. `live_game_map` gained `radiant_hero_ids`/`dire_hero_ids` (integer[], split from OD `/live` `players[].hero_id` by `team`); `liveOdCapture.js` populates them every capture. New `?mode=live-game-pulse` handler (`api/_handlers/liveGamePulse.js`) resolves the running game the same fuzzy way as the finished-game resolver's `live_game_map` fallback, returns telemetry, never writes anywhere (read-only). `liveSeriesGames.js` refactored to export `fetchPsMatchDetail()` so both handlers share the hardened PS-fetch (own try/catch + 4s timeout) instead of duplicating it. Frontend: `SeriesLivePulse.jsx` self-polls every 20s while the sheet is open on a running game; kill score/gold lead spoiler-gated, live draft shown always (same pre-game rule as the finished-game strip). Kill score is unambiguous here (unlike the dropped Phase-1 attempt) because there's no named "winner" yet — it's labeled by side, and `live_game_map` already carries the real `radiant_name`/`dire_name` for that exact row.

Deferred until owner approves the look: "Just Ended" entry-point generalization, DESIGN_GUIDELINES pattern entries for the companion card + pulse, and (on public launch) removing the flag + About/Release Notes.
**Authors:** PM × Design × Engineering (collaborative spec)
**Date:** 2026-07-15 (Phase 0a + 0b built 2026-07-16)

**Build progress:**
- **Phase 0a — DONE (local, not yet deployed):** `scripts/create-live-game-map.sql` (table), `api/_handlers/liveOdCapture.js` + `?mode=od-live-capture` on `api/tournaments.js` (OD `/live` capture, KV-lock throttled), `scripts/setup-qstash-schedules.mjs` (+`od-live-capture` */15 backstop). **Independent Explore review: 0 bugs.** One finding reconciled — filter captures all professional-league games (not just tier-1) because `/live` lacks league names; docs corrected + rationale added (fuzzy hits never backfilled, so extra rows are inert).
- **Phase 0b — DONE (local, not yet deployed):** enhanced `api/_handlers/liveSeriesGames.js` resolver (chain: PS `external_identifier` → KV → `match_stream_history` → `live_game_map` via `findOdMatchByTime`; returns `{ games:[{position,matchId}], gameIds }`; KV backfilled only for authoritative hits); client capture ping in `App.jsx` `fetchLiveData`. Verified: syntax, module-graph import, `findOdMatchByTime` integration (correct id among decoy, draft-delay window, null out-of-window), lint (0 new problems), 1134 tests pass.
- **Phase 1 — TODO:** `SeriesCompanionSheet` UI (glanceable draft/result cards for both live & just-ended series; frontend calls the 0b resolver to patch unresolved `matchId`s; tap-through to `MatchDrawer`; spoiler gating).
- **Not verified anywhere (needs live env + created table):** actual Supabase upsert/read, KV lock under real concurrency, end-to-end resolution against a real live series.

**Locked decisions (owner, 2026-07-15):**
- **Scope for first build = Phase 0 + Phase 1.** Phase 2 (live pulse) is a fast-follow, out of the first release.
- **matchId capture is fully isolated from the LOCKED VOD system.** The capture writes a new `live_game_map` table; `api/live-matches.js` stream-cache writes are NOT modified. No locked-zone approval needed.
- **⚠️ Vercel Hobby-plan function limit: currently 12/12 (at the cap).** No new top-level `api/*.js` allowed — it would fail the deploy. All Phase 0 backend goes in as **new `?mode=` handlers on `api/tournaments.js`** with implementations in `api/_handlers/*.js` (helpers, not counted as functions). This is the established pattern (`match-stats`, `recent-completed`, `live-series-games` are all modes today).
- **Companion covers BOTH live and "Just Ended" series** (one shared component; two entry points).
- **Capture cadence = client-driven 2-min heartbeat (0 QStash cost) + one */15 backstop.** A flat */2 QStash cron is impossible on the free plan (already 768/1000 msgs/day; */2 = +720). Total stays 864/1000/day, 5/10 schedules.
**Grounding:** `CONTEXT.md` (PS↔OD data connection), `DESIGN_GUIDELINES.md`, `.claude/pm_instructions.md`, empirical OD `/api/live` schema (verified 2026-07-15)

---

## 0. TL;DR — Decision Summary

**The ask:** When a series is in progress (e.g. 1-0 BO3, Game 2 live), let a fan click into the series and see the completed game's info — not have to wait for the series to end.

**The core insight:** The per-game OpenDota data *already exists mid-series*. Nothing "unlocks" at series end — three deliberate gates hide it, and the one existing escape hatch (the "Replay" button) is fragile and mislabeled. This is a **wiring + reliability + UX** problem, not a data-availability problem.

**Three gates that produce "only after the series ends":**
1. Completed-results feed filters on `isSeriesComplete` — an ongoing series' finished games are in memory but hidden (`src/App.jsx:374`, `HomeFeed.jsx:84`).
2. `MatchDrawer` hard-skips OpenDota stats for any live/PS-sourced game via `match._fromPandaScore` (`MatchDrawer.jsx:89`, `:572`).
3. `LiveSeriesSheet` — the component you actually see when clicking a live series — is stats-less; it only shows winner + duration + a "Replay" button gated on `game.matchId` (`LiveSeriesSheet.jsx:99`).

**Phased scope (recommended):**

| Phase | Name | What ships | Effort | Risk |
|---|---|---|---|---|
| **0** | matchId reliability | Dual-source OD match-id capture (`/live` + Supabase fallback read) so finished games reliably know their OD id mid-series | S–M | Low (touches locked zone — owner approval) |
| **1** | Completed-game companion (MVP) | Open a live series → each finished game shows a glanceable summary (draft heroes + result + key events) and taps through to the full existing `MatchDrawer` (draft, gold graph, player stats). Reframe "Replay" → "Game N · Stats & Replay". Spoiler-safe. | M | Low |
| **2** | Live game pulse | The *currently live* game shows live gold lead, kill score, live draft — from OD `/live` (`radiant_lead`, scores, `players[].hero_id`). Optional 2b: full live gold graph via Steam `GetRealtimeStats`. | M–L | Medium (new ingestion, integrity/spoiler care) |

**Verdict: Build Phase 0 + Phase 1 together as the MVP. Design Phase 2 in, but ship it as a fast-follow.** Phase 1 without Phase 0 just makes the "missing stats" gap more visible, so they ship as one unit.

---

# PART I — PRODUCT (PM lens)

## Feature Summary
A "companion" view for in-progress series that surfaces the full information of already-completed games (draft, final stats, gold graph, notable events) while the next game is still being played, and — as a fast-follow — a live pulse of the in-progress game itself.

## User Problem
A Dota fan tuning into a BO3 at 1-0 with Game 2 live has an immediate, recurring job-to-be-done: **"What happened in Game 1 that I missed, and how did we get here?"** Today the product forces them to either (a) leave the live context and go to Dotabuff/OpenDota, or (b) wait until the entire series concludes for our own stats to appear. Both break the live-viewing session. The literal request ("show G1 data mid-series") is the correct root problem, not a symptom.

## Product Goals
- **User:** answer "what happened so far in this series" without leaving Spectate or waiting for series end.
- **Business:** increase live-session depth and dwell time; convert the live surface from a launcher into a destination; create a reason to open Spectate *during* a series, not just after.
- **Strategic:** competitors (Liquipedia, Dotabuff) make you leave the live context to inspect a finished game. An inline "series-so-far" companion is a differentiated live surface and a retention hook.

## User Personas Affected
- **The mid-series joiner** (primary) — arrives after G1; wants the catch-up. Highest-value, highest-frequency.
- **The second-screen fan** — watching the stream, wants draft/net-worth context on their phone in parallel.
- **The hardcore analyst** — wants G1's full stats/gold graph immediately, not at series end.
- **The spoiler-averse fan** — has NOT seen G1 yet and is about to; must never be spoiled. This persona is a *constraint*, not a beneficiary — handled via spoiler-free mode.

## Detailed Requirements
**Phase 1 (MVP):**
1. Opening an in-progress series shows one row per game: finished games and the live game.
2. Each finished game row shows a glanceable summary: game number, winner (spoiler-gated), duration, the two drafts as hero icons, and any notable-event indicators (Rampage, Rapier, 20k swing, mega comeback) already available via `fetchMatchIndicators`.
3. Tapping a finished game row opens the full existing `MatchDrawer` for that game with complete OpenDota stats (draft, gold graph, player stats, VOD) — reusing the current escape-hatch path (`handleSelectMatchId`) which already produces a non-`_fromPandaScore` match object.
4. If a finished game's OD id is unresolved, the row still shows the result but is clearly marked "stats indexing…" and is non-blocking.
5. Full spoiler-free compliance: winners, drafts, scores, and event indicators all hidden in spoiler-free mode; the row still opens (to watch), consistent with the existing "Reveal score" pattern.

**Phase 2 (fast-follow):**
6. The live game row shows a live pulse: current gold lead (direction + magnitude), kill score, and the live draft — all sourced from OD `/live`, respecting the tournament broadcast delay, hidden in spoiler-free mode.

## Edge Cases (product)
- G1 finished but OpenDota hasn't indexed it yet (lag from ~1–2 min up to 30–90 min for `/promatches`) → "stats indexing" state, never a broken/empty drawer.
- matchId never resolves (qualifier with no stream, `/live` didn't chart it, cold caches) → result-only row, gracefully degraded.
- Series completes while the companion is open → the same games remain viewable; no jarring re-mount.
- BO2 (draw-capable) and BO5 (up to 4 finished games while live) formats.
- Two providers disagree on series score (PS vs OD) → PS drives the live view; OD drives per-game stats. Don't blend.
- Live game paused / reconnect → `/live` `game_time` stalls; show last-known with a stale affordance.
- Spoiler conflict: fan opened the sheet to check G1 but hasn't seen it → spoiler-free must be airtight.
- Overlap with the "Just Ended" feed — a game can appear in both; ensure no duplicate/contradictory UI.

## Analytics & Tracking
- `live_series_companion_open` (existing `live_series_sheet_open` can be reused/renamed) — {teams, tournament, format, finishedGames, hasUnresolvedIds}.
- `live_series_game_expand` — {matchId, gamePosition, resolved}.
- `live_series_stats_open` (drawer opened from companion) — {matchId, gamePosition, source}.
- `live_series_pulse_view` (Phase 2) — {psMatchId}.
- Reliability funnel: % of finished games in an open companion that had a resolved OD id (the Phase 0 success metric).
- KPIs: companion open rate off live rows, finished-game→drawer CTR, dwell time in live sessions, share of drawer opens that come from a live (vs completed) context.

## Risks & Dependencies
- **Locked VOD system:** Phase 0 touches the mapping writes in `api/live-matches.js` (`cacheRunningStreams`, `live:game:` keys), which are inside the LOCKED zone per `CLAUDE.md`. Requires explicit owner approval; must not alter the `stream:match:` VOD anchor writes.
- **OpenDota reliability:** unauthenticated, rate-limited. Both `/live` and `/matches/{id}` can fail or lag. Every path must degrade gracefully.
- **Spoiler risk** is the load-bearing product risk — a single accidental reveal (winner in a row, hero in a draft, gold lead in the pulse) destroys value for the spoiler-averse joiner.
- **Integrity/delay:** live telemetry must never lead the official broadcast. OD `/live` already carries the DotaTV `delay` (empirically 300s); we honor it and never show data ahead of it.

## MVP Recommendation
**Phase 0 + Phase 1, shipped together.** This delivers the exact ask (see G1 mid-series) with the reliability to make it feel dependable, reusing `MatchDrawer` so the "deep" experience is free. Defer Phase 2.

## Future Enhancements
- Live gold graph + per-player net worth via Steam `GetRealtimeStats` (`server_steam_id` from `/live`).
- "Series story" AI summary of the games-so-far (extends existing `summarize` pipeline).
- Win-probability / momentum from live telemetry.
- A public, server-rendered `/series/...` URL as a durable citation target (see AI discoverability).

## AI + Search Discoverability
Assessed honestly against `.claude/ai_discoverability.md`:
- **New public route?** No. The companion is state on the live surface; live series states are transient and not citation targets.
- **New entity type?** No — reuses existing match/series/team entities. Completed games already have SEO match URLs (`/match/...-{matchId}`).
- **Bare-HTML crawlable content?** N/A — live, JS-driven, ephemeral.
- **`llms.txt` / `llms-full.txt`?** No change for Phases 0–2.
- **New endpoint mode?** Phase 0 may add an OD-`/live` capture mode (internal, not a public content route) — no Machine-Readable-Endpoints entry needed.
- **Future opportunity:** a server-rendered `/series/{...}` "series so far" page *would* be a durable citation target — noted under Future Enhancements, explicitly out of scope now.

## Open Questions (product)
1. Is live telemetry (Phase 2) desired in v1, or strictly a fast-follow?
2. Should the companion also cover the "Just Ended" state (series finished <15 min ago) or only strictly-live series?
3. Default stance: does the live pulse (Phase 2) show by default, or is it opt-in behind a tap even outside spoiler-free mode?

---

# PART II — DESIGN (UX lens)

## Problem Framing
The user's real job is **catch-up under time pressure inside a live session**. The current `LiveSeriesSheet` is a launcher, not a companion — it answers "can I replay a game?" not "what happened?". Reframe it into a **series scoreboard + per-game catch-up surface**.

## Viewer Psychology
At 11pm watching a live BO3, the mid-series joiner feels *behind*. They want to close the gap in seconds, glance-first: who won G1, what was drafted, was it a stomp or a nail-biter. They fear two things — missing context, and being spoiled on a game they haven't watched yet. The design must make catch-up feel instant and make spoiler-safety obvious and trustworthy.

## UX Goals (ranked)
1. Make "what happened so far" answerable in **one glance** (result + draft + tension signal) without opening anything.
2. One tap from glance → full stats (drawer), zero new navigation concepts.
3. Airtight spoiler-free behavior — never leak a result, draft, or lead.
4. Graceful, honest states when data is missing/indexing — never a broken drawer.
5. Feel native to the existing sheet/drawer system — no new visual language.

## Information Hierarchy (per finished-game row)
1. **What** — Game N, the two teams' drafts (hero icons).
2. **Result/Status** — winner (color-coded, spoiler-gated), duration.
3. **Context** — notable-event indicators (Rampage/Rapier/swing/comeback chips).
4. **Action** — whole row taps to open full stats & replay.

The live game row sits last, always, with the pulsing-red LIVE treatment; in Phase 2 it carries the live pulse (gold lead + kills + live draft).

## Interaction Model
- **Entry:** tap a live series (existing `handleSelectLiveMatch` → `selectedLiveSeries`).
- **Sheet:** right-side slide-in sheet (existing signature motion), full-width on mobile, `sm:w-[400px]` on desktop — unchanged shell.
- **Rows:** finished games render as **tappable summary cards** (not a thin row + tiny button). Whole row is the touch target (`min-h-[44px]`), tap → `MatchDrawer` for that game.
- **Draft preview:** a compact horizontal strip of 5v5 hero icons per finished game (reuse hero-icon rendering from `DraftDisplay`/`PlayerStatsSection`). This is the single highest-value glance signal we can add.
- **Exit:** Escape / backdrop / close (existing).
- **Nav depth:** unchanged — companion → drawer is the same one-level-deep pattern already in use.

## Mobile Experience (375px first)
- Sheet is full-width. Each finished-game card is a two-line block: line 1 = `G1 · WINNER · 38m` (winner spoiler-gated); line 2 = two draft rows of 5 hero icons (Radiant / Dire), icons `w-5 h-5` compact variant. Event indicator chips inline on line 1, right-aligned, `w-5 h-5` compact variant per `GameIndicators`.
- Entire card is the tap target; no small buttons to miss with a thumb.
- Live game card pinned at the bottom with the LIVE pill; Phase 2 pulse stacks beneath it (gold lead bar + `K–K` score).
- At 11pm one-handed: glance the drafts, tap once for the deep dive. No horizontal scrolling inside rows.

## Desktop Enhancements
- Same 400px sheet; hover raises the card (`hover:bg-gray-50 dark:hover:bg-gray-800/50`).
- Hero-icon tooltips (existing `group`/`group-hover` pattern) name the hero on hover.
- Keyboard: rows are focusable, Enter opens the drawer; Escape closes (existing).

## Visual System Decisions (grounded in `DESIGN_GUIDELINES.md`)
- **Reuse, don't invent.** Draft icons = the hero-icon + `ItemSlot`/`GameIndicators` patterns already specced. Event chips = the **compact GameIndicators variant** (`w-5 h-5 rounded-full`, reserved indicator hues). Winner/loser color = existing winner (`text-gray-900 dark:text-white`) / loser (`text-gray-400 dark:text-gray-500`) rule.
- **Color discipline:** red only for the LIVE pulse dot/label; purple only on the watch/replay affordance; no new colors. Phase 2 gold-lead uses the existing GoldGraph green/red side semantics (Radiant `#22c55e` / Dire `#ef4444`), not a new palette.
- **Typography:** `G1` in display font black; winner in display font; duration/labels tertiary uppercase tracking-widest; all numerics `tabular-nums`.
- **Motion:** none added. The drawer slide-in remains the only signature motion; `animate-pulse` only on the genuine LIVE indicator.
- **New pattern to add to `DESIGN_GUIDELINES.md`:** "Live series companion — finished-game summary card" (draft strip + result + indicators, whole-row tap). Propose as an addition, not a one-off.

## State Handling (full checklist)
- **Loading:** skeleton draft strip (10 `animate-pulse` hero-icon squares) + a result bar, per finished game.
- **Skeleton:** mirrors card shape (icons + one text bar), varied widths.
- **Empty:** a series with zero finished games shouldn't open the companion at all (guard exists: `handleSelectLiveMatch` requires a finished game).
- **Delayed/stale:** OD id resolved but stats not yet parsed → open drawer shows existing "Gold data unavailable" / "Stats pending" states (already specced). Live pulse stale (`game_time` frozen) → dim + "updated Xs ago".
- **Spoiler-free:** winners → hidden ("Game N"), drafts → hidden or generic, indicators → hidden (per existing rule "GameIndicators never render in spoiler-free"), scores/pulse → hidden; row still opens; a "Reveal" affordance consistent with the drawer's "Reveal score".
- **Error:** OD `/matches/{id}` fails on drawer open → existing drawer error handling; companion row itself never hard-errors.
- **Partial data:** some finished games resolved, others not → per-row independence; resolved rows fully functional, unresolved show "stats indexing".
- **Reconnect (Phase 2):** live pulse resumes on next `/live` poll; no error UI for a transient gap.
- **Offline/PWA:** companion is live-data-dependent → show the standard stale/last-known state; don't fabricate.

## Accessibility
- Sheet: `role="dialog" aria-modal="true"` (exists). Rows: `role="button"`, focusable, Enter/Space activate, descriptive `aria-label` (`"Game 1, <winner> won in 38 minutes, view stats"` — or spoiler-safe variant).
- Hero icons: `alt`/`aria-label` with hero name; decorative-only in spoiler-free.
- Contrast: winner/loser and indicator hues already meet the system's contrast rules; verify indicator chips on the sheet's `dark:bg-gray-950`.
- Reduced motion: no new motion; LIVE pulse respects existing conventions.

## Edge Cases (design)
- Very long team names in the winner line → truncate as one unit (existing rule), never wrap into the draft strip.
- 10 hero icons on a 375px row → fixed `w-5 h-5` + `gap-0.5`, two rows of 5, never horizontal scroll.
- BO5 with 4 finished games → sheet scrolls vertically (existing `overflow-y-auto`); live row stays pinned conceptually at the end.
- Series flips to complete mid-view → no layout thrash; the completed state is a superset of what's shown.

## Risks (design)
- Cramming full stats into the 400px sheet would duplicate `MatchDrawer` and violate "don't repeat information across sections" — **mitigated by glance-in-sheet, deep-in-drawer.**
- Draft-strip spoiler leakage is the highest design risk — spoiler-free gating must be tested per-element, not per-sheet.

## Future Evolution
The summary-card pattern generalizes to a completed-series recap and to a potential public `/series` page. Designing the draft strip as a reusable sub-component keeps that door open. Don't build the live gold graph into the sheet now, but leave vertical room in the live-game card for the Phase 2 pulse.

## Implementation Handoff (components)
- **Extend:** `src/components/LiveSeriesSheet.jsx` — replace the thin finished-game row with the summary card (draft strip + indicators + whole-row tap).
- **Reuse:** hero-icon rendering and `GameIndicators` (compact variant); `fetchMatchIndicators` (`src/api.js`) already caches indicators per session; `MatchDrawer` unchanged as the deep view.
- **Data:** finished-game draft needs each game's OD `matchId` (Phase 0) → `fetchMatchStats`/OD `/matches/{id}` (as `DraftDisplay.jsx:70` already does) or a lighter picks-only fetch.
- **New DESIGN_GUIDELINES entry:** "Live series companion — finished-game summary card".

---

# PART III — ENGINEERING (CTO lens)

## Architecture Overview — two data planes, reconciled by match id
- **Live plane (PandaScore):** `api/live-matches.js` → series shape via `mapMatch`/`mapGames` (`:65`). Per game `matchId = external_identifier` (`:80`), present only while `status==='running'`.
- **Stats plane (OpenDota):** `api/_handlers/matchStats.js:59` (`/matches/{id}`), `DraftDisplay.jsx:70`. Rich per-game data, keyed by OD match id.
- **The bridge:** the OD match id. Everything hinges on reliably knowing it for a finished game *mid-series*.

## Phase 0 — matchId reliability (the enabler)
**Problem:** `external_identifier` is cleared when a game ends; recovery today is a single KV read of `live:game:{psId}:{pos}` written only during the running window (`live-matches.js:189`, enrichment `:814-833`). If no poll/cron observed the game running (GHA cron throttling — see memory `project_gha_cron_throttling.md`), the id is lost and the companion has no stats path.

**Solution — a resolver chain, most-reliable first:**
1. **Live `external_identifier`** while running → `live:game:` KV (existing, unchanged).
2. **Supabase fallback read** — `match_stream_history` already persists `od_match_id` keyed with `ps_match_id` + `game_position` (`live-matches.js:199,206`). Add a fallback lookup in the finished-game enrichment: if the KV `mget` misses, `select od_match_id from match_stream_history where ps_match_id=? and game_position=?`. **Read-only — does not touch the locked stream-cache writes.** Covers any game that had a stream.
3. **OD `/live` dual-source capture (new)** — poll `https://api.opendota.com/api/live`; for each PS live series whose running/finished games lack a resolved id, team-match a `/live` entry via the canonical helpers (`teamPairMatch`/`findBestPsMatch` in `api/_shared.js` — **never a new matcher**, per memory `feedback_ps_od_matching`) and write the id to `live:game:`. `/live` exposes `match_id` **and** `series_id` independently of PandaScore, so this has a different failure mode than the PS field (charts tier-1 games reliably; misses only obscure lobbies). Write-once semantics; **must not write `stream:match:`** (VOD anchor stays PS-only and locked).
4. **`findOdMatchByTime` against `/promatches`** (existing, `_tournamentUtils.js:549`) — last resort; laggy (30–90 min), useful late-series / BO5, unreliable within the first hour.

**Where the `/live` capture runs (function-budget-safe):** implemented as `api/_handlers/liveOdCapture.js`, dispatched via **`api/tournaments.js?mode=od-live-capture`** — a new *mode*, not a new Vercel function (the app is at 12/12 on Hobby). It reads OD `/live`, team-matches entries to PS live series via the canonical `api/_shared.js` helpers (`teamPairMatch`/`findBestPsMatch`), and writes `live_game_map`. It **never** touches `cacheRunningStreams`, `live:game:` KV, or `stream:match:` — full isolation from the LOCKED zone.

**Trigger & rate-budget (locked 2026-07-15):** "every 2 min during the live window" is delivered **client-driven, not via a flat QStash cron** — a flat */2 schedule = 720 msgs/day and the QStash free plan (1,000/day, 10 schedules) is already at **768/day across 4 schedules** (only ~232/day headroom; even a flat */5 would bust it). Design:
- **Primary — client heartbeat (0 QStash cost):** the app already polls `/api/live-matches` every 2 min while open. When that poll returns ≥1 live tier-1 series, the client fires a fire-and-forget `mode=od-live-capture` ping. This is precisely 2-min cadence during active viewing, scaling to zero when nobody watches.
- **Server-side dedupe lock:** `capture:od-live:lock` (`nx:true`, ~110s TTL) — every invocation (client pings from N tabs *and* the backstop) collapses to **one** OD `/live` fetch per ~2 min, protecting OpenDota's rate limit and Vercel invocation budget. Lock-held invocations early-exit after a single cheap KV GET.
- **Backstop — one QStash schedule at */15** (`od-live-capture`, **96 msgs/day → 864/day total, 5/10 schedules — within free limits**): guarantees no-user coverage for games that run with nobody watching, alongside the existing */15 `stream-capture` (PS side) and the `findOdMatchByTime` fallback.
- **Provisioned via `scripts/setup-qstash-schedules.mjs`** — add the one */15 entry there; update its budget comment (currently `768/day` → `864/day`).

**Resolver (function-budget-safe):** extend the existing `api/_handlers/liveSeriesGames.js` (already a `?mode=live-series-games` handler) so an unresolved finished game resolves its OD id via `live_game_map` → `match_stream_history` (read) → `findOdMatchByTime`. The frontend calls this for any finished game the live feed returned without a `matchId`. No new function; possibly no new mode.

**New table (shape refined at build time):** `live_game_map(od_match_id[unique], od_series_id, radiant_name, dire_name, start_time, league_id, radiant_lead, radiant_score, dire_score, server_steam_id, game_time, captured_at, first_seen_at)` — an **OpenDota-keyed snapshot**, NOT the originally-sketched `(ps_match_id, game_position, …)`. Why the change: OD `/live` exposes the OpenDota `match_id`/`series_id` but not PandaScore's match id or game position, so keying on the PS side would force re-fetching PS live data (duplicating locked `live-matches.js` logic). Instead the capture stores OD-side rows shaped exactly for `findOdMatchByTime(odMatches, beginAtUnix, psOpponents)` (`start_time` = `/live activate_time`), and the resolver (Phase 0b) does the PS↔OD correlation on demand against a fresh, small candidate set — reusing the canonical matcher unchanged. The `radiant_lead`/scores/`server_steam_id` columns are free Phase-2 (live pulse) fodder. Schema: `scripts/create-live-game-map.sql` (run once in Supabase SQL editor). Not overloading `match_stream_history` (whose rows require `streams_json`), so stream-less qualifier games are mapped too.

**Locked-system note:** with the mode-router + `live_game_map` design, **no locked-zone write is modified** — `api/live-matches.js` stream-cache writes and `stream:match:` are untouched. The existing finished-game KV enrichment (`:814-833`) stays as-is; the new resolver is an additive, read-only fallback path invoked from the frontend/handler layer.

## Phase 1 — completed-game companion (MVP)
Mostly frontend; the escape-hatch already produces full stats.
0. **Shared component + two entry points:** generalize `LiveSeriesSheet` into a `SeriesCompanionSheet` used by BOTH (a) live series (`handleSelectLiveMatch` → `selectedLiveSeries`) and (b) "Just Ended" PS series (feed card click, `justEndedSeries`). Both pass `{ games[] }`; unresolved (`_tempId` / `_fromPandaScore`) games render result-only + "stats indexing" until the resolver fills the id.
1. **Feed enrichment:** for any finished game the live/just-ended feed returned without a `matchId`, call the resolver (`live-series-games` handler extended with `live_game_map → match_stream_history → findOdMatchByTime`) to fill it — no change to the locked `:814-833` KV enrichment.
2. **Summary cards:** for each finished game with a `matchId`, fetch picks (via `fetchMatchStats`/OD `/matches/{id}`, as `DraftDisplay.jsx:70` does) and render the draft strip + indicators (`fetchMatchIndicators`). Cache per session (both fetchers already have module-level caches).
3. **Tap → drawer:** reuse `handleLiveSeriesReplay`→`handleSelectMatchId` (`App.jsx:805,772`), which builds a **non-`_fromPandaScore`** match object, so `MatchDrawer` renders full stats (draft, `GoldGraph`, `PlayerStatsSection`) with **no change to the `_fromPandaScore` gate** (`MatchDrawer.jsx:89,572`).
4. **Copy/affordance:** reframe the purple "Replay" affordance to communicate stats + replay; keep it purple (watch action) per the color rule.
5. **Spoiler-free:** gate winner, draft strip, indicators, and (Phase 2) pulse — reuse existing spoiler patterns.

**No change required to:** `MatchDrawer` stats gates (the drawer already works for OD-sourced matches), `isSeriesComplete`, the completed-results feed.

## Phase 2 — live game pulse
Source: OD `/live` (confirmed fields — `radiant_lead` gold lead, `radiant_score`/`dire_score` kills, `players[].hero_id` live draft, `game_time`, `delay`, `server_steam_id`, `is_watch_eligible`).
- Match the live game to its `/live` entry (same team-name helpers) and render a pulse under the live-game card: gold-lead bar (side-colored), `K–K`, live draft icons. Honor `delay`; hide entirely in spoiler-free.
- **2b (future):** Steam `GetRealtimeStats?server_steam_id=…` for the full live gold graph + per-player net worth. Needs a Steam API key, `server_steam_id` polling, and its own rate-limit/caching strategy — separate ingestion, out of MVP.

## Data Model / APIs (real files)
- Read: OD `/api/live`, OD `/api/matches/{id}` (via `api/_handlers/matchStats.js` proxy or `fetchMatchStats`), PS live (`api/live-matches.js`).
- KV: `live:game:{psId}:{pos}` (id mapping), `format:match:{id}` (existing). **Not** `stream:match:` (locked VOD anchor).
- Supabase: `match_stream_history` (read for fallback; optional new `live_game_map` for durable stream-less mapping).
- Helpers: `teamPairMatch`, `findBestPsMatch`, `normalizeTeamName`, `findOdMatchByTime` (`api/_shared.js`) — reuse, never fork.

## Risks & Failure Modes (engineering)
- **OD `/live` outage / rate limit** → capture chain falls back to KV/Supabase/time-match; companion degrades to result-only rows. Cache `/live` responses; don't hammer.
- **Wrong-match risk** in team-name matching → mitigated by using the canonical bidirectional-substring + score-fallback helpers and the ±time windows; never exact-equality.
- **Race:** game transitions running→finished between polls → `live:game:` write must have fired during the running window; `/live` capture and Supabase fallback are the safety nets.
- **Locked zone regressions** → Phase 0 write changes go through the locked-system review; add tests around id-recovery that assert `stream:match:` writes are untouched.

## QA Scenarios
- BO3 1-0, G2 live: open companion → G1 shows draft + result + indicators; tap → full drawer with gold graph.
- Same, but G1 OD id unresolved (simulate KV miss + no Supabase row) → "stats indexing", no crash; then resolves via `/live` capture on next poll.
- Spoiler-free ON → no winner, no draft, no indicators, no pulse; row still opens; "Reveal" works.
- BO5 2-1, G4 live → three finished-game cards, correct drafts each, live row pinned.
- Series completes while open → no layout thrash; drawer still opens.
- `/live` returns wrong-team fuzzy candidate → asserts no mis-mapping (unit test on the matcher path).
- Regression: `stream:match:` VOD anchor and `findTwitchVod` behavior unchanged (locked-system guard tests).

## Rollout
1. Phase 0 behind the existing live cron; verify id-resolution rate climbs (analytics funnel) with no VOD regressions.
2. Phase 1 frontend behind the companion; monitor finished-game→drawer CTR and error rates.
3. Phase 2 as a fast-follow once Phase 0 resolution rate is proven and integrity/delay handling is verified against a live event.

---

## Shared Decision Log (where PM × Design × Eng converged)
- **Glance-in-sheet, deep-in-drawer** (Design + Eng): avoids duplicating `MatchDrawer` in a 400px sheet and reuses the whole stats stack for free. PM accepts: the drawer is the deep experience; the sheet is catch-up.
- **Phase 0 before/with Phase 1** (Eng + PM): reliability is the actual root cause; shipping Phase 1 alone would expose more "missing stats" gaps.
- **Spoiler-free is a per-element gate, not per-sheet** (Design + PM): the spoiler-averse joiner is a hard constraint; every revealed element (winner, draft, indicator, pulse) is independently gated and tested.
- **Reuse canonical matchers only** (Eng, per memory): all PS↔OD matching goes through `_shared.js` helpers.
- **Locked VOD system boundary** (Eng + owner): Phase 0 mapping writes need owner approval; VOD `stream:match:` writes are never touched.

## Open Questions (for owner before build)
1. ~~Phase 2 in v1 or fast-follow?~~ **RESOLVED: Phase 0 + 1 first; Phase 2 is a fast-follow.**
2. ~~Locked-zone approval / capture location?~~ **RESOLVED: fully isolated — new `?mode=` handlers on `api/tournaments.js` + new `live_game_map` table; no locked write touched; no new Vercel function (12/12 cap).**
3. ~~New `live_game_map` table now or defer?~~ **RESOLVED: build the table now (covers stream-less qualifiers).**
4. ~~Cover "Just Ended" series or strictly live?~~ **RESOLVED: cover "Just Ended" (recent-completed / `justEndedSeries`) with the SAME companion.** One shared companion component serves both entry points — live series (`handleSelectLiveMatch` → `selectedLiveSeries`) and just-ended PS series (feed card click). Both pass a `series` with `games[]`; the resolver chain fills unresolved ids identically. This also means the companion must handle `_fromPandaScore` / `_tempId` games gracefully (result-only + "stats indexing" until resolved).
5. ~~QStash cadence for `od-live-capture`?~~ **RESOLVED: client-driven 2-min heartbeat (0 QStash cost) + one */15 backstop schedule (96/day). Server-side KV lock throttles the real OD `/live` fetch to ~once/2min. Total QStash 864/1000 day, 5/10 schedules — within free limits.**

_All open questions resolved. Spec is build-ready._

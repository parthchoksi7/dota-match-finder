# Live Story — Remaining Scope & Roadmap

**Status:** Active planning reference — prioritized.
**Last consolidated:** 2026-07-26
**Companion doc:** `live-story-shipped.md` (everything already live). Full technical grounding for the shipped foundation this roadmap builds on: `CONTEXT.md`.
**Independent corroboration (2026-07-26):** a fan-need discovery pass (`/dota_pm`, "list your unmet needs as a Tier-1 fan") independently surfaced Priority 1, 2a, 2b, and three Priority-3 items (Roshan timer, live event markers, public pick'em) below as top unmet needs — external validation, not new information, except where noted inline. Everything that pass surfaced outside Live Story's scope is tracked in `.claude/product-backlog.md` instead, to keep one canonical home per item.

This replaces the remaining-scope content that was spread across `live-story.md` (§R3/R4), `live-story-v1.1-remaining-scope.md`, `live-story-v1.1-implementation-plan.md`, and `live-story-r4-implementation-plan.md`'s unfinished phases. Those files are deleted; what was still actionable in them is preserved below.

---

## Priority 1 — R4 Phase D: Tower Map UI — SHIPPED AND PUBLIC (2026-07-31)

**BUILT 2026-07-25 as a text row, REDESIGNED 2026-07-26 into a schematic SVG map, CORRECTED + RESTYLED 2026-07-27, swapped to a real texture 2026-07-28, tower coordinates corrected 2026-07-29, PUBLIC LAUNCH 2026-07-31 (commit `507e2b5`).** See `CONTEXT.md`'s Phase D entry for the full build history (the tower-ordering bug, the texture swap, the coordinate-correction process) and `live-story-shipped.md` for the consolidated shipped record — this feature is no longer awaiting anything to go live. `DotaMinimap.jsx` renders a tower map directly under the score row, above `LiveGoldGraph`, gated only by `showLiveStory` (spoiler-free hides it, same rule as momentum/stakes/graph) — the `isOwner &&` frontend gate and the entire `isOwner` prop chain (`App.jsx` → `LiveSeriesSheet.jsx` → `SeriesLivePulse.jsx`) were dropped/removed as dead code in the public-launch commit. The API-side `owner=1` check in `liveGamePulse.js` was intentionally left in place, unchanged — harmless, since `SeriesLivePulse.jsx`'s only caller of `fetchLiveGamePulse` has always hardcoded `owner=1` regardless of the actual viewer, so the server was already returning `objectives` to every request before the frontend flip. Visual spec: `DESIGN_GUIDELINES.md` "Tower map." Tests: `src/__tests__/dota-minimap.test.jsx`, `src/__tests__/series-live-pulse-objectives.test.jsx`.

**The "unknown data" constraint is load-bearing, not cosmetic.** The map draws exactly 18 tower markers (9 per side) and nothing else — no barracks, tier-4/"base" tower, or Ancient marker exists anywhere in `DotaMinimap.jsx`'s code, under any input. A caption ("Towers only — barracks, base towers & Ancient status unknown") renders unconditionally alongside the map — same guard clause covers both, so there's no way for the map to show without it. This property must be preserved in any future touch to this component; it's the reason showing a partial map is honest rather than misleading.

**Genuinely still open (small, not launch-blocking — this is why the item isn't archived to `live-story-shipped.md` yet):**
- **GA4 events never shipped** — `live_map_state_shown` ({ confidence }) and `live_map_state_omitted` (the key decoder-reliability proxy; watch this after any Dota patch — a step-change means the bit layout moved and Phase B needs re-running) still don't exist anywhere in the codebase (confirmed by grep, 2026-08-01). The `omitted` event still needs the design decision noted originally: today "not owner" (moot now), "low confidence," and "draft phase" are all indistinguishable from the client's point of view — the field is just absent in all three cases.
- **About page entry missing.** `AboutPage.jsx`'s "Live Series Companion" copy block was not updated for the tower map — it describes the net-worth graph, momentum, kill score, and draft, but never the tower map. Release Notes, by contrast, **is** done (`ReleaseNotesPage.jsx`, "July 31, 2026 — Live tower map is now visible to everyone").
- Real 400px mobile viewport check on an actual live game — status unconfirmed; verify before considering this fully closed.
- A real minimap texture is already shipped (`public/dota-minimap-7.40.webp`, 2026-07-28) — one patch behind current (7.40 vs 7.41d), accepted risk since 7.41 was a hero/item patch, not a map-terrain rework.

**Effort:** M (the redesign added a new component + a decoder shape change). **Risk:** Low — the main risk (implying knowledge of barracks/Ancient we don't have) was the most rigorously tested and reviewed part of the build; residual work above is analytics/documentation completeness, not correctness.

---

## Priority 2 — R3 vs. the row-level "heating up" badge (owner call — genuinely close tradeoff)

Two competing candidates for the next *new* feature (as opposed to Priority 1, which shipped and went fully public 2026-07-31). Not mutually exclusive, but worth sequencing deliberately rather than starting both.

### 2a. R3 — AI "Catch Me Up" line (fully speced, build-ready)

A 1–2 sentence, spoiler-aware, hedged narrative of the running game (draft-derived win conditions + net-worth trajectory + game phase), generated by Claude Haiku.

**Why it's ready:** its own stated precondition — "prove the live pipeline before layering probabilistic AI on it" — is satisfied; the pipeline has been public and battle-tested since 2026-07-18. Full implementation plan already exists in detail (architecture decision, phases, file list, risk log) — nothing here needs re-speccing, only re-reading before the next session picks it up.

**Key implementation decisions already made:**
- **Not a new endpoint.** Add `type: 'live-catch-up'` to the existing `api/summarize.js` dispatch (reuses its API-key check, rate limiting, error handling, `getHeroNames()`) rather than a new `?mode=` handler that re-resolves PS↔OD correlation the pulse already did.
- Client passes the **already-resolved `od_match_id`** (held in React state from the 20s pulse poll) — no second resolver, no second Supabase window-scan.
- Structured-facts-only input (hero names, draft, net-worth trajectory, kill score, game_time) — no free text, no scraping. Low temperature. Prompt forbids predicting a winner or inventing events not in the payload.
- Server-cached per `(od_match_id, game_time bucket)` — bucket = `Math.floor(gameTime / 150)` (2.5 min), server-derived (not client-computed) so boundaries stay authoritative. Cache key `live-catch-up:v1:{odMatchId}:{bucket}`, TTL ~300s.
- **New kill-switch infrastructure required** — this codebase has no existing feature-flag mechanism anywhere. A KV key (e.g. `feature:live-catch-up:enabled`), fail-open on absence, single write of `'off'` disables instantly with no deploy. Worth generalizing into a small `isFeatureEnabled(key)` helper in `_shared.js` since this is unlikely to be the last AI-on-live-data feature.
- **Dedicated rate-limit bucket** (`rateLimitByIp(req, kv, 'live-catch-up', N)`), not the shared `'summarize'` bucket — an open live sheet auto-refetching every 2.5 min would otherwise compete with the same IP's post-game-summary quota.
- Draft phase (`game_time < 0`) → `{ line: null }` immediately, no fetch, no Anthropic call, no cache write.
- Owner-gated launch (only new owner-gated surface in this plan — R1/R2 are already public).

**Open question, never answered:** cost estimate at realistic concurrent-open-live-sheet counts during a tournament window. Get a rough number (concurrent sheets × 1 generation per 2.5-min bucket × Haiku cost) before flipping public — cheap in principle, but nobody has actually run the math yet.

**Effort:** M. **Risk:** Medium — first LLM-generated text next to *live* (not post-game) data; mitigated by the hedging/kill-switch/owner-gate design above, which mirrors a launch pattern this team has now executed three times successfully.

### 2b. Row-level "heating up" / "close game" badge (NOT speced — commission a PM pass first)

Per the original spec's own words, this is the strongest discovery-layer play: it helps a fan pick *which* of 2–3 simultaneous live tier-1 games to open, which nothing inside the companion sheet (R1/R2/R3/R4) can do — those only enrich a game already opened.

**Why it's not further along:** it's architecturally distinct from everything above — it means joining live telemetry (`live_game_map`/`live_game_gold`) into `live-matches.js`'s row rendering, the first time live telemetry crosses from the companion sheet into the ambient feed. Data-freshness-for-a-list-of-N-rows is a different problem than data-freshness-for-one-open-sheet, and deserves its own product spec rather than being bolted onto this roadmap.

**Corroborated by fan-need research (2026-07-26):** independently identified as the top unmet need for a fan managing multiple simultaneous live games (cross-referenced, not duplicated, in `.claude/product-backlog.md`). One clarification worth carrying into the eventual spec: the per-game telemetry itself (`radiant_lead`/`radiant_score`/`dire_score`/`game_time`/`building_state`) is *already* captured for every live tier-1 game by the existing capture cron, not just the one game a fan has an open sheet for — so the "new architectural surface" is specifically the cross-game query + new feed-row UI, not new data collection.

**Recommendation carried forward unchanged:** commission a dedicated PM spec for this before any engineering plan is written, in parallel with or immediately after whichever of R3/R4-Phase-D ships next. Don't build it blind off a paragraph of prior reasoning.

**SPEC DONE 2026-07-30 → `.claude/specs/live-worth-watching-signal-spec.md`. BUILT OWNER-ONLY 2026-08-01, PUBLIC 2026-08-03** (ahead of the spec's original Aug 8–10 target — see the spec's own updated Status line for what was and wasn't validated before the flip). Three findings from the spec pass change the framing recorded above and should be read before anyone starts: (1) the existing `computeMomentum` bands do **not** partition a feed — `AHEAD` fires on 72% of live observations, `EVEN` on 5–11% after minute 25 — so the spec's three states are `CLOSE` / *no badge* / `ONE-SIDED`, and `FAR_AHEAD` (95.7% decided, n=83 games) is the only statistically strong band we have; (2) band state changes **4.5 times per game** on average, so hysteresis + a dwell requirement are mandatory, not polish; (3) **≥2 simultaneous live feed rows occur only 26% of live time overall — and just 5% during 1win Essence II + EPL Masters**, the window this roadmap assumed would serve as the rehearsal. Live rehearsal of the multi-row case is therefore not available before TI; the spec substitutes a replay harness over existing `live_game_gold` history. TI 2026's Swiss group stage (13–16 Aug, verified) is the real payoff window, now observed live from Day 1 rather than only from the original 8–10 Aug flip date.

**A pre-build critique pass (`/dota_data_scientist` + `/dota_analyst` + `/dota_pm`, 2026-08-01) found and fixed three logic gaps (peak-reset-on-sign-flip, a time-scaled SWINGING peak floor, and confirmed — not newly discovered — the calibration/pipeline mismatch already flagged in the spec) and two product gaps (the recessive ONE-SIDED treatment is now suppressed for a followed team's row and for any Grand Final/decider game, since a lopsided score in either is still appointment viewing).** Full detail in the spec's own "Pre-build critique" section. `R0`'s threshold fix shipped in the same pass (`src/utils/momentum.js`, now exported so the badge and the momentum band can never disagree on the same lead).

**Effort:** M–L (new architectural surface). **Risk:** design risk (needs its own product thinking), not build risk. Now downgraded to: needs an owner observation window before the public-flip decision, not a build-risk question.

---

## Priority 3 — Backlog (no forcing function yet, don't build blind)

None of these have a specific trigger pulling them forward. Revisit if a specific need arises (a stakeholder ask, a competitive gap, or a natural dependency from something above).

- **Trained live win-probability model** — replace the qualitative momentum bands (`EVEN`/`AHEAD`/`FAR_AHEAD`) with a real model once enough labeled live→final data exists.
- **Per-player net worth bars** via Steam `GetRealtimeStats` — new third-party dependency, new ingestion; `server_steam_id` is already captured and ready for this.
- **Notable-event markers on the live graph** — reuse the existing post-game indicator detection (Roshan/Rampage/Rapier/teamfight) as live markers on `LiveGoldGraph`, the way `GoldGraph` already does post-game.
- **Roshan / Aegis timers** — inferred, harder; not directly exposed by `/live`. Investigate feasibility separately. Best untried lead (2026-07-26): the per-player net-worth bullet above already has `server_steam_id` captured and unused — worth checking whether Valve's `GetRealtimeStats` exposes Roshan state via that same path before assuming this needs a wholly new data source. Unconfirmed either way — public API docs don't settle it, and nobody on this project has spiked it yet.
- **Public live pick'em** — the pre-match prediction poll is owner-only today; a public live "who wins?" is a retention hook, deserves its own spec.
- **Feed live telemetry into the durable post-match `/match/:id` + AI-intelligence page** — the citation-asset play ("the game broke open when the second rax fell at 38:00" as an evergreen, citable fact). Ties into the AI-match-intelligence work; not urgent since the raw data (`live_game_gold`, decoded objectives) already accrues and isn't going anywhere.
- **"Gold" vs. "Net Worth" label reconciliation** — the live surface says Net Worth, the post-game `GoldGraph` still says Gold. Small, cosmetic, low priority; revisit only if it causes real user confusion.
- **The R4 "extra" 2-bit field** (bits 9-10/25-26 of `building_state`) — unexplained, doesn't correlate with any known event, asymmetric between sides. Pure curiosity; not worth investigation time unless a future need for ancient/tier-4 state resurfaces it.

---

## Adjacent tech debt (not a feature, but Live-Story-owned data)

- **`live_game_gold` and `live_game_map`'s documented retention prunes (48h / 30d) have never actually been implemented** — both tables grow unbounded today. Was deliberately left alone while the R4 decode dataset was being collected (pruning would have deleted the corpus that cracked Phase B); that constraint is gone now that Phase B is resolved, but the prune still doesn't exist. Worth a `.claude/pending-refactors.md` entry if it isn't already causing a real cost.

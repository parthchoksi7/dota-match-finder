# Live Story — Remaining Scope & Roadmap

**Status:** Active planning reference — prioritized.
**Last consolidated:** 2026-07-26
**Companion doc:** `live-story-shipped.md` (everything already live). Full technical grounding for the shipped foundation this roadmap builds on: `CONTEXT.md`.
**Independent corroboration (2026-07-26):** a fan-need discovery pass (`/dota_pm`, "list your unmet needs as a Tier-1 fan") independently surfaced Priority 1, 2a, 2b, and three Priority-3 items (Roshan timer, live event markers, public pick'em) below as top unmet needs — external validation, not new information, except where noted inline. Everything that pass surfaced outside Live Story's scope is tracked in `.claude/product-backlog.md` instead, to keep one canonical home per item.

This replaces the remaining-scope content that was spread across `live-story.md` (§R3/R4), `live-story-v1.1-remaining-scope.md`, `live-story-v1.1-implementation-plan.md`, and `live-story-r4-implementation-plan.md`'s unfinished phases. Those files are deleted; what was still actionable in them is preserved below.

---

## Priority 1 — R4 Phase D: Tower Map UI

**BUILT 2026-07-25 as a text row, REDESIGNED 2026-07-26 into a schematic SVG map — owner-gated only, awaiting owner verification before public launch.** `DotaMinimap.jsx` (new component) renders a tower map directly under the momentum band, above `LiveGoldGraph`, when `isOwner && showLiveStory && pulse.objectives` — same three-way gate as the original text row. `isOwner` is a frontend prop threaded `App.jsx` → `LiveSeriesSheet.jsx` → `SeriesLivePulse.jsx`, layered on top of the API's existing owner gate (defense-in-depth, not the only thing preventing public visibility). The decoder (`api/_buildingState.js`) was widened the same day from an aggregate `{rt, dt}` to per-lane `{radiant: [top,mid,bot], dire: [top,mid,bot]}` so the map knows which lane, not just a total. Visual spec: `DESIGN_GUIDELINES.md` "Tower map." Tests: `src/__tests__/dota-minimap.test.jsx`, `src/__tests__/series-live-pulse-objectives.test.jsx`.

**Why the redesign:** the owner reviewed the shipped text row and asked for an actual map visualization, referencing a Dota minimap with building markers. Two follow-up owner challenges during the build were taken seriously and re-verified rather than dismissed: (1) whether barracks state is really undecodable — re-confirmed via a wider empirical re-check (see `CONTEXT.md`, "Re-verification 2026-07-26"); (2) whether a real Valve map texture could be sourced — no reliable/licensed path found, so the map is a hand-drawn SVG schematic, not a texture.

**The "unknown data" constraint is load-bearing, not cosmetic.** The map draws exactly 18 tower markers (9 per side) and nothing else — no barracks, tier-4/"base" tower, or Ancient marker exists anywhere in `DotaMinimap.jsx`'s code, under any input. A caption ("Towers only — barracks, base towers & Ancient status unknown") renders unconditionally alongside the map — same guard clause covers both, so there's no way for the map to show without it. Any future touch to this component must preserve that property; it's the reason showing a partial map is honest rather than misleading.

**Gate before going public:** EWC 2026 Tier-1 freeze must lift (or explicit owner approval during the freeze tail) — per the standing freeze-discipline rule, never flip a public UI flag mid-Tier-1-event. Verify on a real live game in owner mode first (that's the point of this build).

**Going public is a one-line change** — drop the `isOwner &&` in `SeriesLivePulse.jsx` (the API's own `isOwner` gate in `liveGamePulse.js` also needs dropping at the same time, or the field never reaches non-owners regardless of the frontend flag) — not a redesign.

**Still not done, needed before the public flip:**
- GA4 events: `live_map_state_shown` ({ confidence }), `live_map_state_omitted` (the key decoder-reliability proxy — watch this after any Dota patch, a step-change means the bit layout moved and Phase B needs re-running). Deliberately skipped so far — not needed for owner-only verification, and the `omitted` event in particular needs a design decision about how the client would even distinguish "not owner" from "low confidence" from "draft phase" (today they're all indistinguishable — the field is just absent).
- About page + Release Notes entries (skip while owner-gated, per the Owner-Only Features convention in `.claude/claude_instructions_template.md` — add both at the same time as the public flip).
- Real 400px mobile viewport check on an actual live game (per the deployment checklist) — not yet done against production data, only unit-tested. Worth a specific look now given the map is a bigger visual element than the text row was.
- A real minimap texture, if a licensed/reliable source is ever found — the schematic is a deliberate substitution, not the end state, if that constraint changes.

**Effort:** M (up from S — the redesign added a new component + a decoder shape change). **Risk:** Low-Medium — the main risk (implying knowledge of barracks/Ancient we don't have) is the thing most rigorously tested and reviewed; residual risk is mainly visual/UX polish, not correctness.

---

## Priority 2 — R3 vs. the row-level "heating up" badge (owner call — genuinely close tradeoff)

Two competing candidates for the next *new* feature (as opposed to Priority 1, which is finishing an already-shipped one). Not mutually exclusive, but worth sequencing deliberately rather than starting both.

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

**Effort:** M–L (new architectural surface). **Risk:** design risk (needs its own product thinking), not build risk.

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

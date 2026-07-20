# Live Story v1.1 (R3 AI Catch Me Up) + R4 Verification Spike — Implementation Plan

**Status:** Ready for build
**Last Updated:** 2026-07-19
**Spec:** `.claude/specs/live-story.md` §R3 / §Data Requirements / §Edge Cases / §Risks (read first). Product plan: `.claude/specs/live-story-v1.1-remaining-scope.md`.
**Scope of this plan:** R3 (AI "Catch Me Up" line) as **Live Story v1.1**, plus an independent **R4 prerequisite spike** (empirical `building_state` bit-layout verification — investigation only, no feature build). The row-level "heating up" badge is explicitly excluded per the product plan; it needs its own spec before any engineering plan is written for it.

---

## Architecture deviation from the original spec — read this first

`live-story.md` §Technical Considerations proposed R3 as a new `?mode=live-catch-up&id=<psMatchId>` handler under `api/tournaments.js` that independently re-resolves the running game via `findOdMatchByTime`, the same way `liveGamePulse.js` does.

**Recommend instead:** add `type: 'live-catch-up'` to the existing `api/summarize.js` dispatch (it already branches on `req.body.type === 'tournament'` vs. the default match-summary path), and have the client pass the **already-resolved `od_match_id`** — which the frontend already holds as `pulse.matchId` from the 20s pulse poll (`fetchLiveGamePulse`, confirmed in `SeriesLivePulse.jsx`) — instead of re-deriving the PS↔OD correlation server-side from a `psMatchId`.

**Why this is better, not just different:**
1. **Every Anthropic call in this codebase already lives in `summarize.js`** — API-key presence check, `rateLimitByIp`, `trackError`, the `data.content?.[0]?.text` response-shape guard, `getHeroNames()`. Putting a second LLM call in `tournaments.js` duplicates all of that or forks it.
2. **The resolution already happened.** The pulse poll resolved `psMatchId → od_match_id` at most 20s ago and the browser is holding the answer. Re-resolving independently means a second Supabase read + a second `findOdMatchByTime` call per bucket-change, for data already in React state — pure waste, and a second place the resolution logic can silently drift from the pulse's.
3. **No new trust boundary.** `POST /api/summarize` already accepts an arbitrary client-supplied `matchId` with zero server-side authorization today, protected only by `rateLimitByIp`. Accepting a client-supplied `odMatchId` here is the same pattern, not a new one — and the server still independently fetches `live_game_map`/`live_game_gold` by that id rather than trusting any client-supplied *stats* (lead, score, draft). The client only ever tells the server *which game*, never *what happened in it*.
4. Satisfies "no new Vercel function" either way (`summarize.js` is already one of the 12).

This is a recommendation the team should sign off on before Phase A starts — it's a real deviation from the written spec — but everything below assumes it, because re-deriving a second resolver is strictly worse on every axis and the spec's own resolver-reuse language ("the graph/summary describe whatever game the pulse resolved, so they can never disagree") is actually **strengthened** by literally sharing the resolved id instead of re-resolving it.

---

## Guiding constraints

1. **Structured-facts-only input** — hero names, draft, current + trajectory of gold lead, kill score, `game_time`. No free text, no scraping (spec).
2. **Low temperature; prompt forbids predicting a winner and forbids inventing events not in the payload** (spec).
3. **Server-cached per `(od_match_id, game_time bucket)`, ~2–3 min bucket** — generated only on demand for an open sheet, never for every `/live` game (spec).
4. **Kill switch, no deploy required.** This is genuinely new infrastructure — grepped the repo, there is no existing feature-flag/kill-switch mechanism anywhere (`api/`, `src/`). Design it from scratch here; it becomes the reusable pattern for the next AI-on-live-data feature too.
5. **Owner-gated launch, then public** — same mechanism as R1/R2 and the companion (`spectate-owner` / `isOwner`), for the same reason: this is the *first* LLM-generated text sitting next to live (not post-game) data, and the verification window is what caught real bugs the last three times this pattern was used.
6. **Never touch the LOCKED VOD system** (`cacheRunningStreams`, `live:game:` KV, `stream:match:`). R3/R4 touch none of it — confirmed no proposed change is anywhere near those write paths.
7. R4 here is **investigation only** — it produces a verified bit-layout (or a documented "not viable"), not a shipped feature. Building the R4 UI is a separate, later plan.

---

## Phase 0 — R4 verification spike (independent, runs in parallel with Phase A/B)

**Goal:** determine whether OD `/live`'s `building_state` is decodable, and if so, its exact bit layout — *before* committing engineering time to the R4 feature.

**Key insight for the methodology:** the codebase already reads the **post-game** equivalents (`barracks_status_radiant`/`dire` in `api/_watchability.js:46`, `api/_handlers/matchIndicators.js:72`) but only ever as `=== 0` checks — the per-bit layout has never been decoded in-house, so there's no existing internal reference to copy, only public documentation to treat as an unverified hypothesis (exactly the posture that burned the team before on `team === 0/1`, hence the empirical-verification requirement). OpenDota's post-game `tower_status_radiant/dire` and `barracks_status_radiant/dire` fields DO have a widely-documented community bit layout (per building, per lane). The live `building_state` field's layout relative to those is unconfirmed.

**Method — diff live snapshots against known post-game truth:**
1. Add `building_state` (and `spectators`, cheap to grab alongside it) to the existing `live_game_map` capture in `liveOdCapture.js` — one extra field on the row already being written every ~110s. Additive column, no read path changes, no behavior change for anyone. Migration mirrors the 2026-07-19 player-names migration already documented in `CONTEXT.md` (add columns, update the upsert payload).
2. Let it accrete for a handful of live tier-1 games across a normal broadcast day.
3. For each game that has since completed and been indexed by OD `/matches/{id}`, pull that match's `tower_status_radiant/dire` + `barracks_status_radiant/dire` (final, known-shape) and diff bit-for-bit against the **last captured live `building_state`** for that `od_match_id`. Where the live and post-game bit patterns agree in structure, that confirms the mapping; where they don't, the live field needs a different decode or isn't viable.
4. Cross-check at least one game where a mid-game tower fell during the capture window (not just the final state) by comparing two consecutive `building_state` captures and confirming exactly the expected bit(s) flipped.

**Acceptance:** produce either (a) a confirmed bit-layout, written up as a `CONTEXT.md` addendum the same way the `team === 0/1` finding was documented, or (b) an explicit "not viable" verdict with the reason (e.g., field absent from `/live` responses, or bit pattern doesn't correlate cleanly). Either outcome unblocks the *next* decision on R4 — this phase's job is removing the unknown, not shipping UI.

**Rollback:** trivial — it's one additive column and a read-only analysis pass. No behavior changes for any existing consumer of `live_game_map`.

**Effort:** S (mostly waiting for data to accrete + a short analysis pass, not code volume).

---

## Phase A — Backend: `live-catch-up` generation

**A1. Kill switch (new infra).** A KV key, e.g. `feature:live-catch-up:enabled` — **fail-open on absence** (unset = enabled) so the feature doesn't need a manual ON write to launch, and a single write of `'off'` disables it instantly without a deploy. Checked at the top of the handler; a `'off'` value short-circuits to `{ line: null }` before any Supabase read or Anthropic call (so the kill switch also caps cost, not just correctness).

**A2. `type: 'live-catch-up'` branch in `api/summarize.js`.** Request: `POST /api/summarize { type: 'live-catch-up', odMatchId, gameTime }`. Server derives the cache bucket itself from `gameTime` (`Math.floor(gameTime / 150)`, 2.5 min buckets) rather than trusting a client-computed bucket — cheap, and keeps bucket boundaries authoritative server-side.
- `gameTime < 0` (draft phase) → return `{ line: null }` immediately, no fetch, no cache write, no Anthropic call — mirrors R1/R2's draft-phase suppression and avoids ever paying for a draft-phase generation.
- Fetch structured facts **server-side**, never trust client-supplied stats: latest `live_game_map` row by `od_match_id` (draft/hero-id arrays, player names, lead, score) + a short recent window of `live_game_gold` (for the "trajectory" input R3 calls for — reuse the existing `shapeGoldHistory` shaping logic from `api/_handlers/liveGamePulse.js`, export it if it isn't already, rather than re-deriving the same dedup/cap logic a second time — per the standing "search for existing logic first" rule). Hero-name resolution reuses `summarize.js`'s own already-present `getHeroNames()` — no new fetch.
- Cache key: `live-catch-up:v1:{odMatchId}:{bucket}`, TTL ~300s (a bit over one bucket width) — bounds KV storage growth automatically without an explicit cleanup job.
- Prompt (draft skeleton, not final copy): structured JSON of `{ radiant_name, dire_name, draft: [...], radiant_lead, radiant_score, dire_score, game_time, recent_trend }`, instructions enforcing 1–2 sentences, hedged language for any inferred swing ("suggests," "appears to," never asserted as fact), an explicit forbidden-list (no winner prediction, no events not present in the payload, no markdown), matching the tone discipline already established in `computeMomentum`'s "state, not fate" vocabulary (`src/utils/momentum.js`) — R3's copy should read like the same analyst voice, not a different persona.
- Rate limiting: **use a dedicated `rateLimitByIp(req, kv, 'live-catch-up', N)` key, not the shared `'summarize'` bucket.** Flagged explicitly below under Risks — sharing the bucket would let an open live sheet's auto-fetch-on-bucket-change compete with a user's post-game summary requests for the same 10/min quota.

**A3. Model call.** Reuse the exact `fetch('https://api.anthropic.com/v1/messages', ...)` shape already in `summarize.js` (Haiku, low `max_tokens` — this is 1–2 sentences, budget ~100), same error handling (`response.ok` check, `data.content?.[0]?.text` guard).

**Acceptance:** `POST /api/summarize { type: 'live-catch-up', odMatchId: <known live id>, gameTime: <n> }` returns a 1–2 sentence hedged line; a second call within the same bucket is served from KV (verify via log/latency); a call with `gameTime: -60` returns `{ line: null }` with no Anthropic call made (check logs/billing, not just the response); flipping the kill-switch KV value to `'off'` makes every subsequent call return `{ line: null }` immediately.

**Rollback:** flip the kill switch; if that's insufficient, revert the `type` branch — nothing else in `summarize.js` is touched.

---

## Phase B — Frontend integration (behind `spectate-owner`)

**B1. `fetchLiveCatchUp(odMatchId, gameTime)`** in `src/api.js`, mirroring `fetchLiveGamePulse`'s shape (`try/catch` → `null` on any failure, never throws).

**B2. Wire into `SeriesLivePulse.jsx`.** Compute `currentBucket = Math.floor(pulse.gameTime / 150)`; fetch on first mount of a running game and again only when `currentBucket` changes (not every 20s poll) — a `useEffect` keyed on `[pulse?.matchId, currentBucket]`. Render placement per the spec's ordering (§UX/UI Considerations): stakes chip → momentum band → gold graph → **AI catch-up line** → score row → live draft. Muted secondary text, italic, timestamped ("as of MM:SS" using `gameTime`, reusing `formatClock` already exported from this file).
- **Spoiler-free:** suppressed under the same `showLiveStory = !spoilerFree` gate already governing stakes/momentum/graph — no new gating logic needed, just include the line in that existing conditional block.
- **Retain-last-known interaction:** the line should follow the same `nextPulseState` retain-on-stale-poll behavior already governing the rest of the block, not flicker independently — simplest is to key the catch-up line's lifetime off the same `pulse` object identity/staleness rather than giving it a separate stale timer.
- **Owner gate for launch:** an additional `isOwner &&` on just this line (not the whole `showLiveStory` block, since R1/R2 are already public) — the *only* new owner-gated surface in this plan, removed once verified, matching exactly how Phase C's Live Story surfaces were gated and then opened.
- **Loading/error state:** render nothing while loading and on any fetch failure (no spinner, no error text) — the rest of the block is unaffected either way, per the spec's "line omitted, rest of sheet intact" requirement.

**Acceptance:** with the owner flag on, open a live mid-game series → a hedged 1–2 sentence line appears within a few seconds, updates roughly every 2–3 min (not every 20s poll), disappears entirely in spoiler-free mode alongside momentum/graph, and a forced backend failure (kill switch off) leaves the rest of the sheet fully intact with no layout hole.

**Rollback:** remove the owner-gated block; Phase A stays inert (nothing calls it).

---

## Phase C — Telemetry, QA, launch

**C1. Analytics** (`trackEvent`, from spec): `live_catch_up_view` (line shown), `live_catch_up_generated` (server-side cache miss, i.e. an actual generation — vs. served-from-cache, to measure cost). Server: log generation latency and the kill-switch state per run.

**C2. QA matrix** (spec §QA + this plan's additions):
- Happy: mid-game with a lead → hedged line describing draft/trend without predicting a winner; draft phase → no line, no error.
- Failure: Anthropic call fails/times out → line omitted, rest of sheet intact; kill switch off → same; Supabase read for facts fails → line omitted (never a broken component).
- Correctness: bucket math doesn't refetch on every 20s poll (verify via network tab — should be ~1 request per 2.5 min per open sheet, not one per 20s); sides swapped across BO3 games still attribute correctly (reuses the same `radiant_name`/`dire_name` the pulse already resolved, so this should be structurally guaranteed, not just spot-checked).
- Regression: R1/R2 surfaces (graph, momentum, stakes) unchanged; no write path touches `live:game:`/`stream:match:`/`cacheRunningStreams`.
- Cost/rate-limit: confirm the dedicated `live-catch-up` rate-limit bucket doesn't starve legitimate post-game `/api/summarize` usage and vice versa.
- Mobile 400px viewport (per `feedback_deployment_checklist` memory): line wraps without breaking the sheet width, no horizontal scroll.

**C3. Deploy** — follow `.claude/claude_instructions_template.md` checklist in full; independent code review (re-read every modified file via Explore, per `feedback_code_review` memory); verify on a real live game behind the owner flag; **explicitly ask "ready to deploy?"** before flipping the flag public (per `feedback_deployment_checklist` memory — never self-authorize).

**C4. Docs** — update `CONTEXT.md` (Live Story section: new `live-catch-up` type on `summarize.js`, the kill-switch mechanism, cache-bucket design) and `README.md`/`CONTEXT.md` Environment Variables section only if a new env var is introduced (none anticipated — `ANTHROPIC_API_KEY` already exists).

---

## Sequencing & dependencies

```
Phase 0 (R4 spike, independent)  ─┐
                                   ├─►  (no dependency between them)
Phase A (backend, R3)  ──►  Phase B (frontend, flagged)  ──►  Phase C (QA + public)
```

Phase 0 has zero dependency on A/B/C and can run fully in parallel — assign it separately if there's engineering capacity to parallelize. A/B/C are strictly sequential like the R1/R2 plan before it.

## Files touched

| File | Change |
|---|---|
| `scripts/create-live-game-map.sql` (or a new migration file, per house convention) | **R4 spike:** add `building_state`, `spectators` columns |
| `api/_handlers/liveOdCapture.js` | **R4 spike:** capture the two new fields alongside the existing upsert |
| `api/summarize.js` | **R3:** new `type: 'live-catch-up'` branch — kill-switch check, bucket-cached generation, reuses `getHeroNames()` |
| `api/_handlers/liveGamePulse.js` | none — `shapeGoldHistory` already exported (`:37`), just imported by the new branch |
| `src/api.js` | **R3:** new `fetchLiveCatchUp(odMatchId, gameTime)` |
| `src/components/SeriesLivePulse.jsx` | **R3:** bucket-change fetch effect, render the line, owner-gate, spoiler-free gate |
| `__tests__/summarize-handler.test.js` | **R3:** unit tests for the new branch — bucket math, kill switch, draft-phase suppression |
| `src/__tests__/…` | **R3:** bucket-change-triggers-fetch behavior in `SeriesLivePulse` |
| `CONTEXT.md` | document both additions |

## Explicitly out of scope (this plan)

The row-level "heating up" badge (needs its own product spec per `live-story-v1.1-remaining-scope.md` — architecturally distinct, joins live telemetry into the ambient feed for the first time). The R4 *feature* itself (this plan only covers the verification spike). Win-probability model, per-player net worth, event markers on the live graph, Roshan/Aegis timers, public live pick'em, spectator-count UI (spectator count is captured in the R4 spike as a freebie, but not surfaced anywhere yet).

---

## Risks & sequencing issues the product plan didn't anticipate

1. **Rate-limit bucket collision.** If `live-catch-up` shares the existing `'summarize'` rate-limit key, an open live sheet auto-refetching every 2–3 min competes with the same IP's post-game-summary quota (10/min). Low probability of actually colliding in practice, but free to avoid — use a separate `rateLimitByIp(..., 'live-catch-up', N)` key (Phase A2 above).
2. **Kill switch is genuinely new infrastructure**, not a reuse of an existing pattern — budget real design/testing time for it (Phase A1), and consider whether it's worth generalizing slightly now (a tiny `isFeatureEnabled(key)` helper in `_shared.js`) since this is very likely not the last AI-on-live-data feature this team ships.
3. **Cost isn't estimated anywhere yet** (flagged in the product plan's Open Questions but not answered) — before launch, get a rough number: concurrent open live sheets during a tournament window × 1 generation per ~2.5 min bucket × Haiku per-call cost. This plan doesn't block on it, but Phase C shouldn't flip the public flag without it.
4. **Server-derived bucket vs. client-driven fetch timing could drift.** If the client's `useEffect` recomputes `currentBucket` from a `pulse.gameTime` that's itself retained-last-known (per the existing `nextPulseState` staleness logic), a stalled `gameTime` during a real game pause means the client never asks for a new bucket even though wall-clock time has moved on — this is actually *correct* behavior (a paused game has no new story to tell) but worth an explicit QA case (C2) rather than assuming it "just works."
5. **`shapeGoldHistory` reuse (A2) — confirmed already exported** (`api/_handlers/liveGamePulse.js:37`), so this is a straightforward cross-file import, not a prerequisite change. No action needed beyond the import itself.

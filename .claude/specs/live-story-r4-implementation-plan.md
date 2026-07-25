# Live Story R4 — Objective / Map State — Implementation Plan

**Status:** Phase A shipped. **Phase B (R4.0 decode gate) RESOLVED 2026-07-24** — tower-count decode confirmed (46/47 exact both sides against real ground truth); barracks confirmed NOT decodable, so **Phase E is cut**. **Phase C (decoder + read API) SHIPPED 2026-07-24** — `api/_buildingState.js` + owner-payload-gated `pulse.objectives`, see CONTEXT.md "R4 Phase C". Phase D (frontend `ObjectiveRow`) is next; still gated behind the EWC freeze lifting + `spectate-owner`. See the R4.0 finding in `CONTEXT.md` (search "R4.0 decode spike") for the verified bit layout and formula.
**Last Updated:** 2026-07-24
**Spec:** `.claude/specs/live-story-r4-objective-map-state.md` (read first — R4.0 gate, R4.1 MVP, R4.2 decode-gated, R4.3 polish; MVP = R4.0 + R4.1).
**Format basis:** `.claude/specs/live-story-implementation-plan.md` (the R1/R2 plan this team executed cleanly).
**Scope:** R4.0 (verification gate, DONE) + R4.1 (tower readout + spectators) as R4 v1. R4.2 (barracks) is **cut** — R4.0 found barracks are not represented in `building_state`. R4.3 excluded.

---

## Architecture decisions (sign off before Phase C) — read first

Three calls the product spec left open, decided here with rationale:

### D1. The decoder lives SERVER-SIDE, as a pure exported function, and returns a *decoded object* in the pulse payload — not the raw bitmask for the client to decode.

Decision: a pure `decodeBuildingState(mask)` in a new `api/_buildingState.js` helper (not a Vercel function — a `_`-prefixed shared lib like `_shared.js`/`_watchability.js`), imported by `liveGamePulse.js`. The pulse returns `pulse.objectives = { rt, dt, rr?, dr?, confidence }` (or omits it), never the raw int.

Why server-side, not client-side (the "smaller payload" argument is wrong here):
- **The confidence gate must be authoritative and single-sourced.** After a patch shifts the bit layout, a stale client bundle would silently decode wrong with no way to hot-fix; a server decoder is fixed in one deploy for every client.
- **The pulse is already KV-cached server-side (15s).** Decoding server-side means the decoded object is cached with the rest of the payload — N concurrent viewers share one decode. Client-side decoding re-runs per client per poll (trivial cost, but architecturally backwards).
- **Consistency with the existing pulse contract.** The pulse already returns *ready-to-render* telemetry (`radiantLead`, `radiantScore`, `radiantHeroIds`…), never raw upstream fields for the client to post-process. Shipping a raw `building_state` int and asking the client to do domain bit-math would be the *only* place the client does Dota-rules math — a wart, not a pattern.
- **Payload size is a wash or better:** `{rt:9,dt:4,confidence:"high"}` is ~35 bytes vs. a raw int plus decoder code shipped in every bundle.

### D2. `building_state` is a `bigint` column, read back as a JS `Number`.

The verified live sample (`16187530`) fits in int32, and the towers+ancient hypothesis maxes at `2^24-1` (~16.7M, well within int32). **But** if the hypothesis is wrong (barracks included) or a future patch widens the mask, the value could grow toward 34 bits (~1.7e10), exceeding int32. `bigint` costs 4 extra bytes and removes the risk. Reading it back is safe: postgrest returns it as a JS number, and any value under 2^53 (we're nowhere near — max 34 bits) is exact in JS — no `BigInt` gymnastics needed. `spectators` is a plain `integer` (max realistic ~2M). Document the 2^53 ceiling assumption in the decoder.

### D3. During the owner-verification window, `objectives` is PAYLOAD-gated behind `owner=1` — reusing the exact mechanism the `history` field already uses.

R1/R2's stakes/momentum were computed *client-side* from already-public pulse fields, so no payload gating was needed. R4's objectives are computed *server-side*, so they'd otherwise be in every public payload the moment Phase C ships — serving unlaunched decoded data publicly (visible in the network tab) even with no UI rendering it. The `history` field faced this exact situation and chose payload-gating (`resolvePulse(pandaId, isOwner)` only attaches `history` when `isOwner`; cache key carries an `:owner` suffix). **R4 objectives follow that precedent**: attach `objectives` only when `isOwner` during the window; to go public, drop the `isOwner` guard (return always) — a one-line change, after which the cache key's `:owner` suffix becomes inert for it, exactly as CONTEXT.md already documents for `history`.

---

## Guiding constraints

1. **Prove the decode before any UI.** No decoder ships until R4.0 empirically verifies the bit layout against real completed games. Docs are a hypothesis to test, not a spec to implement (the `team === 0/1` precedent).
2. **Freeze discipline (EWC is live now).** Phase A (capture) is additive-column-only, no UI, no behavior change → freeze-safe, ship now to harvest the EWC verification corpus. Everything user-visible (Phases C/D) waits for the freeze to lift or hides behind `spectate-owner`. Never flip the public flag mid-Tier-1.
3. **Omit-on-low-confidence.** Silence beats a wrong "9 towers" or a false "MEGA CREEPS." The confidence gate is authoritative and server-side.
4. **Never touch the LOCKED VOD cache** (`cacheRunningStreams`, `live:game:` KV, `stream:match:`). R4 is additive columns on `live_game_map` + read-only decode, exactly like the hero-id/player-name migrations.
5. **No new Vercel function** (12-cap) — R4 rides `?mode=live-game-pulse` and adds one `_`-prefixed shared lib (not counted).
6. ~~**R4.2 is conditional, not committed**~~ **R4.2 is cut** — R4.0 (2026-07-24) confirmed barracks are NOT in `building_state` (see CONTEXT.md). This constraint held; the condition resolved negative.

---

## Phase A — Capture (freeze-safe, ship now)

**Goal:** `live_game_map` accretes the raw `building_state` + `spectators` per live game, building the R4.0 verification corpus during EWC.

**A1. Migration** — `scripts/create-live-game-map.sql`, append an idempotent block mirroring the 2026-07-19 player-names migration:
```sql
alter table live_game_map add column if not exists building_state bigint;
alter table live_game_map add column if not exists spectators integer;
```
No new grants needed (the existing `service_role` table grant covers new columns). **Run in the Supabase SQL editor BEFORE A2 deploys** — see the deploy-order hazard below.

**A2. Capture** — `api/_handlers/liveOdCapture.js`, `mapLiveGamesToRows()`: add two fields to each row, mirroring the existing `radiant_lead`/`game_time` guards:
```js
building_state: Number.isFinite(g.building_state) ? g.building_state : null,
spectators:     Number.isFinite(g.spectators)     ? g.spectators     : null,
```
Store raw; **no decode at capture** (store-raw-filter-at-read, the table's convention). No change to `toGoldRows()` — `building_state` does NOT go on `live_game_gold` (see the timeseries note in Phase B; we deliberately keep the live feature on the latest snapshot and use a standalone poller for the flip-check).

**⚠️ Deploy-order hazard (same class as the 2026-07-19 migration, per CONTEXT.md):** the upsert payload references the new columns unconditionally, so if A2 deploys before A1's migration runs, Postgrest rejects the **entire** `live_game_map` upsert (not just the new fields) — breaking the already-shipped, already-public pulse/companion/graph. Migration first, always. Add a one-line deploy note to the PR.

**Acceptance:** after the migration + a few `?mode=od-live-capture` runs against live EWC games, `select od_match_id, game_time, building_state, spectators from live_game_map where building_state is not null` shows populated non-null values in the plausible range. Zero effect on the pulse (it doesn't select these columns yet). Companion/graph unchanged.

**Rollback:** revert A2 (capture reverts to today); columns sit inert and nullable. No behavior change either way.

---

## Phase B — R4.0 verification spike (produces the layout OR the "not viable" verdict)

**RESOLVED 2026-07-24.** Full finding + verified formula in `CONTEXT.md` (search "R4.0 decode spike"). Summary: tower-count decode confirmed (`standingTowers = clamp(4 - raw, 0, 3)` per lane, 46/47 exact on both sides against real `building_kill` ground truth across 47 games / 885 points); barracks confirmed **not** decodable from `building_state` (direct disproof, not absence of evidence — see CONTEXT.md). **Phase C is unblocked; Phase E is cut.**

The methodology that actually worked differed from the plan below: B1's originally-planned aggregate popcount/subset-diff against `live_game_map`'s latest-snapshot rows produced only an inconclusive signal (2026-07-20 attempt). The crack came from diffing the *dense per-game timeseries* that had been passively accreting in `live_game_gold` since 2026-07-21 (see CONTEXT.md's `live_game_gold` entry) against exact per-lane `building_kill` timestamps — a per-lane, per-lane-bit correlation, not an aggregate count. B2 (live flip-confirmation via `--watch`) was effectively superseded by this — the passive timeseries already contains the flip data B2 was designed to manually collect. The original B1–B3 plan is kept below for the historical record; treat CONTEXT.md as authoritative over it.

**Goal (original):** a confirmed `building_state` bit-layout (written to CONTEXT.md as decoder constants) or an explicit partial/negative verdict. **Hard gate for Phases C/D/E.**

**B1. Static bulk diff (uses the Phase A corpus)** — `scripts/verify-building-state.mjs` (new; mirrors the existing one-off `scripts/probe-od-match.mjs`):
- Pull completed games that have a captured `building_state` in `live_game_map` (Supabase read), filter to those OD has since indexed.
- For each, fetch OD `/matches/{id}` and read the known-shape post-game `tower_status_radiant/dire` (11-bit) + `barracks_status_radiant/dire` (6-bit).
- **Methodology — monotonic-subset matching, NOT exact equality.** Critical subtlety: `live_game_map` is UPSERT (latest snapshot only), and a game leaves `/live` when its ancient falls — so the last captured `building_state` is ~60–110s *before* true game end and may miss buildings that fell in the final push. Buildings only ever get destroyed, so *standing(post-game-final) ⊆ standing(last-live-capture)*. The correct bit→building mapping is the one where, for every game, the post-game standing set is a **subset** of the live-capture standing set under that mapping (with near-equality on games whose last capture was close to game end). This subset invariant is falsifiable and robust to the capture-lag gap; exact equality would produce false negatives on every game.
- Concretely: test the hypothesis "`building_state` = towers + ancient, no barracks" by (a) confirming `popcount(building_state)` tracks total standing towers+ancients (both sides) within the lag tolerance, and (b) finding the bit-position permutation that reproduces `tower_status_radiant | tower_status_dire` (shifted) as a superset. Report which hypothesis holds across N games and the exact bit offsets.
- **Output:** a table (game, popcount, post-game standing count, subset-holds?) + the winning bit-map, or "no consistent mapping / barracks absent."

**B2. Dynamic flip confirmation (targeted, standalone — does NOT use Supabase)** — same `verify-building-state.mjs`, a `--watch <od_match_id>` mode: poll OD `/live` directly every ~30s on one live EWC game, log `{ game_time, building_state, bin }` to stdout/JSON. Watch a tower fall on the stream and confirm exactly the expected bit flips between two consecutive snapshots. This is the check `live_game_map`'s upsert cannot provide (it overwrites), and it's why the poller reads `/live` directly rather than the table.

**B3. Deliverable** — a CONTEXT.md addendum with the verified constants (bit positions per building, max valid mask, building count) formatted like the `team === 0/1` finding, OR an explicit verdict: e.g. "towers+ancient decodable at offsets X; **barracks NOT present** → R4.2 cut from live." This deliverable *is* the gate: Phase C cannot start without it.

**Acceptance:** the subset invariant holds across ≥5 completed EWC games under a single bit-map, AND one live flip is confirmed bit-exact. If neither holds, R4 stops at "spectators-only" (see Phase D note). **Met and exceeded** — 47 games, not 5; exact-match rate 46/47 both sides, not just a subset invariant.

**Rollback:** N/A (analysis only, no shipped code).

---

## Phase C — Decoder + read API (post-freeze / behind owner gate)

**SHIPPED 2026-07-24.** Full detail in `CONTEXT.md` ("R4 Phase C"). `spectators` from the original C2 text below was deliberately NOT wired up — that call was already made and reversed on 2026-07-20 (see the R4.0 finding); Phase C doesn't reopen it, tower objectives only. One real bug caught in independent review before shipping: `building_state` is a `bigint` column and needs `Number(...)` coercion (PostgREST can string-serialize bigints) — a first pass omitted it, which would have silently kept `objectives` permanently low-confidence with no error. Fixed + regression-tested.

**Goal (original):** the pulse returns a trustworthy decoded `objectives` object, owner-gated during verification.

**C1. Pure decoder** — `api/_buildingState.js` (new shared lib):
```js
// Constants from the R4.0 (Phase B) verified layout, confirmed 2026-07-24 — NOT from docs.
// See CONTEXT.md "R4.0 decode spike" for the corpus (47 games/885 points) and match rate (46/47).
export function decodeBuildingState(mask) -> {
  rt, dt,            // standing tower count per lane-summed side: clamp(4 - raw, 0, 3) per lane, summed/reported per lane
  // rr, dr (rax) OMITTED — Phase B directly disproved barracks are represented in this field
  // (same raw ceiling reached with 0 vs 2 barracks destroyed in the same game — not just unresolved, ruled out).
  confidence: 'high' | 'low'
}
```
**Bit layout (verified):** side A (Radiant) = bits `0-2`/`3-5`/`6-8` (top/mid/bot lane counters); side B (Dire) = bits `16-18`/`19-21`/`22-24`, mirrored +16. Bits `9-10`/`25-26` are an unidentified "extra" field per side — do not decode them (doesn't correlate with any known event; see CONTEXT.md); leaving them unread is safe since they don't overlap the lane bits.

**Confidence gate (`'low'` → caller omits `objectives` entirely):**
- `mask` null / 0 / non-finite → low.
- `mask` exceeds the verified max valid mask (`2^maxBits - 1`) → low. **This is the patch-safety net:** if a patch widens/shifts the layout, the value overflows the known mask and the decoder fails safe to omit rather than render garbage.
- decoded standing-count out of range (> the building maximum, or an impossible per-side split) → low.
- Note: ancient/tier-4s still standing is EXPECTED (the game leaves `/live` when the ancient falls), so "ancient up" is never itself a low-confidence signal.
- **New from the crack:** a lone/single-corroboration reading is the one confirmed failure mode (the corpus's single miss was a 1-sample game with an implausible first-poll value) — the confidence gate should treat a `building_state` read with no prior reading to corroborate it as lower-confidence, not treat every reading as independently trustworthy.
- Pure + unit-tested against the real captured samples Phase B collected (house pattern — `computeMomentum`, `mapLiveGamesToRows`, `computePoints` are all pure+tested).

**C2. Read** — `api/_handlers/liveGamePulse.js`, in `resolvePulse()`:
- Add `building_state, spectators` to the `.select(...)` column list.
- `pulse.spectators = row.spectators ?? null` (public, no decode, always returned — a plain int can't be "wrong").
- `pulse.objectives`: **payload-gated behind `isOwner` during the window** (D3), attached only when `isOwner` and `decodeBuildingState(row.building_state).confidence === 'high'`. Wrap in its own try/catch like the `history` enrichment (a decode/read hiccup must never turn a resolved pulse into `{pulse:null}`).
- Cache interaction: `objectives` rides the existing 15s pulse cache under the `:owner`-suffixed key (unchanged mechanism). Building state changes on the order of minutes; 15s staleness is negligible against the ~60–110s capture floor — no new cache concern.

**C3. Client fetch flag** — `src/api.js` `fetchLiveGamePulse` already sends `owner=1` unconditionally (per CONTEXT.md, an inert leftover that's now load-bearing again) — so `objectives` will reach owners with no client change. **Confirmed 2026-07-24**: `SeriesLivePulse.jsx:135` calls `fetchLiveGamePulse(psMatchId, true)`, hardcoded — zero client changes were needed.

**Acceptance:** `GET /api/tournaments?mode=live-game-pulse&id=<psId>&owner=1` on a live game returns `pulse.objectives` with plausible tower counts + `pulse.spectators`; the same call without `owner=1` returns neither `objectives` (gated) — `spectators` may still return (it's public). A low-confidence mask returns no `objectives`. Non-owner public pulse is byte-identical to today except `spectators`.

**Rollback:** stop attaching `objectives`/`spectators` (client renders nothing); remove the `.select` additions. Decoder lib sits unused.

---

## Phase D — Frontend objective row (behind `spectate-owner`, then public)

**Goal:** the objective row renders under the momentum band; spoiler-safe; omit-on-low-confidence.

**D1. `ObjectiveRow`** — a new element in `src/components/SeriesLivePulse.jsx` (small enough to inline like the stakes/momentum blocks; extract to its own file only if it grows). Placement: **directly under the momentum band, above `<LiveGoldGraph>`** (spec §UX hierarchy). One line, `tabular-nums`, green Radiant / red Dire per the `GoldGraph` convention (reuse, no new palette), uppercase micro-label. Renders only when `pulse.objectives` is present (server already gated confidence + owner). Spectator micro-stat right-aligned, muted, from `pulse.spectators`.
- **Spoiler-free:** include the row inside the existing `showLiveStory = !spoilerFree` block — objectives + spectators both suppressed in spoiler-free, draft unaffected (spec §Spoiler Policy). No new gate.
- **Owner launch gate:** since `objectives` is payload-gated to owners during the window (D3/C2), no *additional* frontend owner flag is needed — a non-owner simply never receives `objectives` and the row is absent. Going public = dropping the server-side `isOwner` guard (C2). Clean single-switch launch, same as history.
- **Retain-last-known:** the row keys off the same `pulse` object the block already retains via `nextPulseState` — no separate stale timer. On a stale/failed poll the whole block (row included) retains-then-clears per the existing 90s bound; on genuine game transition it clears with everything else. No new logic.

**D2. `aria-label`** summarizing state ("Objectives: {teamA} 9 towers, {teamB} 4 towers"), never icon-only. Real device 400px check (one line, no horizontal scroll) per `feedback_deployment_checklist`.

**Acceptance:** owner + live mid-game → objective row shows plausible tower counts attributed to the correct named teams (verify against the stream), spectator count plausible, hidden entirely in spoiler-free (draft persists), absent on draft-phase and on low-confidence games, and a forced failed poll does not blank it independently of the rest of the block. Non-owner sees no row.

**Rollback:** remove the `ObjectiveRow` render; Phases A–C stay inert.

**Spectators-only fallback:** if Phase B returns "not viable" (no reliable tower decode), Phase D still ships the **spectator count alone** (zero decode risk) as the R4 v1 deliverable — a real discovery signal, and the objective readout waits for a future data source. This keeps R4 shippable even on a negative spike.

---

## Phase E — Barracks / mega-creeps — CUT (Phase B disproved barracks presence, 2026-07-24)

**Does not run.** R4.0 didn't just fail to find barracks bits — it directly disproved them: in match `8907114935`, the top lane hit `building_state`'s max value with zero barracks destroyed while the mid lane hit the same max value with both barracks destroyed (see CONTEXT.md). A `Rax 6·2` readout / `MEGA CREEPS` chip cannot be built from this field. Barracks state remains a post-game-only enrichment via `barracks_status_radiant/dire` for the future `/match/:id`; R4 v1 ships tower + spectators only, as the spec's "strong hypothesis" anticipated.

---

## Phase F — Telemetry, QA, launch

**F1. Analytics** (`trackEvent`, spec §Analytics): `live_map_state_shown` ({ has_rax, confidence }), `live_map_state_omitted` (decoder returned low — the key reliability proxy), `live_spectators_shown` ({ bucketed count }). Server: log the confidence distribution per capture and the raw `building_state` on low-confidence decodes (in-app only, no Log Drains per `project_vercel_plan`).

**F2. QA matrix** (spec §QA + this plan):
- Happy: mid-game tower split → correct counts, correct named-team attribution (sides-swapped BO3 game attributes to the right team — inherits the pulse's resolution, structurally guaranteed); spectators plausible; draft phase → no row.
- Failure: `building_state` null/0 → omitted; low-confidence mask → omitted + `live_map_state_omitted` fires; no `/live` coverage → existing "watch the broadcast" fallback.
- Correctness: decoder unit tests pass against Phase B's real samples incl. a mid-game flip; **patch-safety** — feed a mask exceeding the max valid mask and assert the decoder returns low-confidence (omit), not garbage.
- Regression: R1/R2 (graph, momentum, stakes, score, draft) unchanged; **no write path touches `live:game:`/`stream:match:`/`cacheRunningStreams`** (VOD-lock guard); finished-game rows + tap-through unchanged; migration-before-deploy verified (the whole-upsert-breaks hazard).
- Spoiler: spoiler-free hides objectives + spectators, shows draft, flips instantly.
- Perf/mobile: pulse payload with `objectives` stays small; multi-tab capture lock holds to one OD fetch/window; real 400px viewport, one line, no horizontal scroll.

**F3. Deploy** — follow `.claude/claude_instructions_template.md` in full; independent Explore review re-reading every modified file (`feedback_code_review`); verify on a real live game behind the owner gate; **explicitly ask "ready to deploy?"** before dropping the owner guard to go public (`feedback_deployment_checklist`) — and confirm the EWC freeze has lifted (or the owner explicitly approves an owner-gated-only ship during the freeze tail).

**F4. Docs** — CONTEXT.md (the R4.0 bit-layout addendum from Phase B; `building_state`/`spectators` columns; `objectives`/`spectators` on the pulse; the decoder lib); a `DESIGN_GUIDELINES.md` "objective/map-state row" entry (hand visual detail to `/ux-design`).

---

## Sequencing & dependencies

```
Phase A (capture, freeze-safe, SHIP NOW during EWC)  ── DONE 2026-07-19
        │  accretes the corpus
        ▼
Phase B (R4.0 spike)  ── HARD GATE ──┐  ── RESOLVED 2026-07-24 (via the live_game_gold timeseries, not the originally-planned static/watch approach)
        │  tower decode confirmed (46/47 exact); barracks confirmed absent
        ▼                                                                  │
Phase C (decoder + read, owner-payload-gated)  ── SHIPPED 2026-07-24       │
        ▼                                                                  │
Phase D (objective row UI, owner→public)  ← NEXT                           │
        │
        ╳  Phase E (barracks) — CUT, B disproved barracks presence
        ▼
Phase F (telemetry, QA, public launch — after EWC freeze lifts)
```

- **A is independently shippable now** and de-risks everything (proves capture + builds the verification dataset during the best-possible window). Done.
- **B is the hard gate** — no decoder/UI without its verdict. Resolved; see CONTEXT.md for the finding.
- C→D→F are sequential and now unblocked. E is cut, not merely deferred.
- Every phase is independently revertible; A–C are invisible to non-owners until D drops the gate.

## Files touched

| File | Change | Phase |
|---|---|---|
| `scripts/create-live-game-map.sql` | append additive `building_state bigint` + `spectators integer` migration | A |
| `api/_handlers/liveOdCapture.js` | store raw `building_state`/`spectators` in `mapLiveGamesToRows()` + upsert | A |
| `scripts/verify-building-state.mjs` | **new** — static subset-diff (Supabase corpus vs OD `/matches/{id}`) + `--watch` live flip-check | B |
| `CONTEXT.md` | R4.0 verified bit-layout addendum (or verdict); later, the R4 feature writeup | B, F |
| `api/_buildingState.js` | **new** — pure `decodeBuildingState(mask)` + confidence gate, from Phase B constants | C |
| `api/_handlers/liveGamePulse.js` | `.select` the two columns; attach `spectators` (public) + `objectives` (owner-gated) in `resolvePulse` | C |
| `src/components/SeriesLivePulse.jsx` | `ObjectiveRow` under the momentum band; spoiler gate; spectators micro-stat | D |
| `__tests__/live-od-capture.test.js` | extend for the two new captured fields | A |
| `__tests__/building-state.test.js` | **new** — decoder + confidence-gate unit tests vs real Phase-B samples | C |
| `__tests__/live-game-pulse-*.test.js` | owner-gate + payload-shape for `objectives`/`spectators` | C |
| `src/__tests__/series-live-pulse.test.js` | objective-row render/omit/spoiler snapshots | D |
| `DESIGN_GUIDELINES.md` | objective/map-state row entry (with `/ux-design`) | F |

## Explicitly out of scope

R4.3 (per-lane map, `THRONE EXPOSED`/high-ground drama flags). R4.2/barracks — cut, Phase B confirmed absent (not a hedge anymore). The row-level "heating up" badge on `LiveMatchRow` (separate spec — joins live telemetry into the ambient feed). Win-probability, per-player net worth, Roshan/Aegis state (not in `/live`). The downstream `/match/:id` objective enrichment (durable citation play — future).

---

## Risks & sequencing issues the product plan didn't anticipate

1. **`live_game_map` is upsert-only → there is no `building_state` timeseries. RESOLVED THE OPPOSITE WAY this section originally recommended.** The spec's R4.0 "cross-check ≥1 game where a tower fell during the capture window" can't be done from `live_game_map` (each capture overwrites the row). This section originally said: split the spike into a static latest-snapshot diff plus a standalone `--watch` poller, and explicitly **"do NOT fix this by appending `building_state` to `live_game_gold`."** That call was reversed on 2026-07-21 — `building_state` *was* added to `live_game_gold`'s per-capture append (see CONTEXT.md) — and it's precisely that passive timeseries (885 points/47 games by 07-24, accreted from ordinary traffic with zero extra effort) that cracked the decode, where the originally-planned static/watch approach had stalled at "inconclusive." Lesson for future spikes in this codebase: prefer riding an existing append-only table over building bespoke one-off collection tooling, even when the immediate feature doesn't need the timeseries itself.

2. **The static diff must use monotonic-subset matching, not exact equality.** Because the last live capture precedes true game-end by ~60–110s (the game leaves `/live` when the ancient falls) and buildings only ever fall, the post-game standing set is a *subset* of the last-capture standing set — never guaranteed equal. A verification script that expects `live_final == post_game_final` would false-negative on essentially every game. The subset invariant is the correct, falsifiable test. (Detailed in B1.)

3. **Deploy-order hazard is more dangerous here than the spec implies.** Adding the columns to the capture upsert means deploying A2 before A1's migration breaks the **entire** `live_game_map` upsert — taking down the already-public pulse/companion/graph, not just the new fields (exact class CONTEXT.md documents for the 2026-07-19 migration). Must be a hard checklist item: migration first, verify columns exist, then deploy. During the EWC freeze this is the one thing that could turn a "freeze-safe" change unsafe if sequenced wrong.

4. **Payload-gating vs. frontend-gating for the owner window is a real decision the spec glossed.** R1/R2 were client-computed from public fields, so "owner-gate then remove it" was a pure frontend flip. R4's objectives are server-computed, so absent an explicit choice they'd leak into every public payload the instant Phase C ships. The plan reuses the `history` field's payload-gating (D3) for airtight parity — but this needs sign-off, because it means `resolvePulse` grows a second owner-gated field and the tests must assert `objectives` never reaches a non-owner payload (mirror `live-game-pulse-owner-gate.test.js`).

5. **Patch fragility needs an explicit fail-safe, not just "verify once."** A Dota gameplay patch can add/move a building and silently shift the bitmask — the decoder verified today could render garbage next month. The confidence gate's "exceeds max valid mask → omit" rule (C1) is the automated fail-safe, and `live_map_state_omitted` telemetry (F1) is the smoke alarm: a step-change in its rate after a patch = the layout moved, re-run Phase B. Call this out in F1 so it's monitored, not discovered by a user seeing "11 towers" on a base race.

6. **`spectators` is the cheap, unconditional win — don't let it be hostage to the decode.** It has zero decode risk and real discovery value, yet the spec bundles it into R4.1 alongside the risky tower decode. The plan deliberately makes `spectators` public + always-returned (C2) and independently renderable (D1), so even a fully negative Phase B still ships a real feature (Phase D spectators-only fallback). Ship the guaranteed value regardless of how the decode gamble resolves.

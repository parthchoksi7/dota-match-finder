# Live Story R4 — Objective / Map State — Product Specification

**Status:** Draft — Ready for engineering plan (/cto)
**Last Updated:** 2026-07-19
**Author:** Product (Dota-native PM, via `.claude/skills/dota_pm` + `.claude/pm_instructions.md`)
**Predecessor:** `.claude/specs/live-story.md` (R1+R2 shipped & public 2026-07-18). This is the R4 slice, promoted ahead of R3 (AI Catch Me Up) by owner decision 2026-07-19. R3 is explicitly deferred and NOT in this spec.
**Product framing basis:** `.claude/specs/live-story-v1.1-remaining-scope.md` §Candidate C.

---

## Session-verified facts (2026-07-19, do not treat as assumptions)

- **OD `/live` carries `building_state`** — confirmed present on a live league game this session: an integer bitmask, sample value `16187530` = `0b111101110000000010001010` (24 significant bits). This is the load-bearing feasibility fact for the whole feature: the field exists and is a per-building bitmask, as the spec assumed.
- **OD `/live` carries `spectators`** — confirmed present (sample `976`). A plain integer, zero decode risk.
- **Calendar:** **Esports World Cup 2026 (EWC) is LIVE right now** (100 of the last ~120 pro matches, most recent ~4h ago). We are inside a Tier-1 feature-freeze window. TI season is downstream. This drives the timing recommendation below.
- **In-house precedent:** the codebase reads the *post-game* `barracks_status_radiant/dire` and `tower_status_radiant/dire` fields, but ONLY as `=== 0` checks (`api/_watchability.js:46`, `api/_handlers/matchIndicators.js:72`). The per-bit layout has never been decoded in-house. The *live* `building_state` bit layout is unverified and MUST be empirically confirmed before any decoder ships (same rigor as the `team === 0/1` draft-side confirmation, 2026-07-16).

**Strong hypothesis the spike must resolve (NOT a fact):** 24 significant bits ≈ 12 buildings/side (11 towers + 1 ancient) with **no barracks** in this field. If true, "mega creeps / rax down" is **not derivable from `building_state` alone** and would need `barracks_status` (only in the post-game payload, absent from `/live`). This single unknown determines R4's ceiling — see §Data Feasibility and §Detailed Requirements (R4.2 gate).

---

# Feature Summary

R4 adds a compact **objective / map-state readout** to the currently-running-game block of the Live Series Companion (`SeriesLivePulse.jsx`), answering the one question net worth structurally cannot: **"how close is this game to actually ending?"** Net worth measures resource advantage; it says nothing about whether anyone's base is cracking. A +12k lead at 40:00 with all towers standing is a farming stalemate; a +8k lead with two lanes of barracks down is nearly over. R4 surfaces the tower (and, if the decode spike allows, barracks) state that carries that information, plus a live spectator count as a discovery/hype signal — all sourced from the OD `/live` `building_state` + `spectators` fields we already fetch every ~60–110s but currently discard.

It is a self-contained enrichment of the existing running-game block. It adds no new route, rides the existing 20s pulse payload, is fully spoiler-gated under the existing `showLiveStory = !spoilerFree` rule, and never touches the LOCKED VOD stream cache.

---

# User Problem

Net worth is a **necessary but wildly insufficient** signal for "is this game worth watching / is it about to end." The already-shipped net-worth graph (R1) and momentum band (R2) answer "who's ahead and by how much." They do not answer the question every mid-game joiner and every channel-surfer actually has: **is this close to concluding, or does it have 20 minutes left?**

Concretely, the gap R4 fills:

- **Gold lies about closeness.** Dota's comeback mechanics (buyback, Aegis, Rapier, mega creeps) mean a large *late* lead can still mean a 15-minute game — OR a game that ends in the next teamfight. The differentiator is **map state**: has the leader cracked high ground and taken barracks, or are they still farming behind uncracked tier-3s? A fan reads "+12k" and cannot tell these apart. That's the whole reason R4 exists (it's the "corrective to the graph's blind spot," per the pressure-test revision in `live-story.md`, "not just polish").
- **The discovery decision.** A channel-surfer with three live games open wants the one that's *about to pop off*, not the 55-minute farm simulator or the already-decided stomp. "9 towers vs 4, barracks threatened" + "42k spectators" is a far sharper "watch THIS one" signal than a gold number.

Root-cause check: the literal request ("show objective state") is not a symptom — it is a direct attack on the true root problem the entire Live Story feature targets (**the cost of joining a Dota game in progress**), addressing the specific dimension R1/R2 left uncovered.

---

# Product Goals

**User goals**
- Answer "how close is this game to ending" in one glance, without reading the stream's minimap or knowing how to read a Dota map.
- Give the discovery/channel-surfer a decisive "which live game is the one" signal (map pressure + spectator count).
- Translate the abstract net-worth number into concrete stakes ("their base is cracking") for the fan who can't yet read map state themselves.

**Business goals**
- Deepen the "Dota intelligence platform" positioning ahead of TI — objective-state literacy is analyst-grade context no schedule/score aggregator offers.
- Increase companion dwell time and (secondarily) live-row → companion CTR by making the in-sheet read more decision-useful.
- Harvest a captured objective-state timeseries that later enriches the durable post-match `/match/:id` and AI-intelligence pages (a citation asset, same downstream play as the net-worth capture).

---

# User Personas Affected

Serves the running-game block's existing audience, weighted differently than R1/R2:

- **The returning/casual fan (primary).** Can't read a Dota minimap; "+12k" is meaningless to them as a closeness signal. "9 towers vs 4, rax down" translates it. Highest comprehension value.
- **The channel-surfer / discovery user (primary).** Map pressure + spectator count is the sharpest in-sheet "watch this one" signal — the same discovery leverage a future row-badge would give, delivered inside the sheet now.
- **The hardcore fan / second-screener (secondary).** Knows map state matters more than gold, and respects a product that shows it — but is often already watching the stream where they see the map. Value is glance-convenience, not new information.
- **The spoiler-avoider (protected, not served).** Map state reveals who's winning even harder than the score does; fully suppressed in spoiler-free.
- **Not served:** the pub player who doesn't watch pro (no relevance to their own games).

---

# Segment Impact

| Segment | Reach | Intensity | Notes |
|---|---|---|---|
| Casual Fan | High | High | The comprehension unlock — turns an unreadable gold number into "the base is cracking." R4's headline segment. |
| Lapsed Fan | High | High | Same re-onboarding value; "is this close to over" is a top-3 question on return. Peaks at TI. |
| Channel-surfer / Discovery | High | Medium-High | Map pressure + spectator count = decisive "which of 3 games" signal, in-sheet. |
| Hardcore Follower | Medium | Medium | Respects it; often already sees the map on stream. Convenience, not new info. |
| VOD-first / Spoiler-avoider | (protected) | — | Fully suppressed in spoiler-free; a hard constraint, not a beneficiary. |
| Pub player (non-watcher) | Low | Low | Out of scope. |

A feature for casual + lapsed + discovery, at high intensity — a genuinely focused audience, not "everyone."

---

# Fan Calendar Timing

**We are inside a Tier-1 feature-freeze window right now (EWC 2026 live, verified this session).** That splits R4's shipping into two calendar-distinct halves, and the split is favorable:

1. **Spike's data-capture half is freeze-safe and should start NOW.** Adding `building_state` + `spectators` to the existing `live_game_map` capture is an additive column + one field on a row already being written — zero read-path change, zero UI, zero behavior change for any existing consumer. This is squarely in the "safe during live tournaments" class (`.claude/pending-refactors.md` reference). And **EWC being live is the best possible verification dataset** — real Tier-1 games are streaming *this week*, generating exactly the live `building_state` snapshots the decode spike needs to diff against post-game truth. Starting capture during the freeze *accelerates* the feature; it doesn't risk the event.
2. **Decoder + UI ship after the freeze, targeting pre-TI.** The visible feature (decoder, chips, spoiler-gating) waits until EWC concludes — or lands behind the `spectate-owner` flag during the tail of EWC for verification, mirroring how R1/R2 and the companion launched. **Build for the trough (post-EWC), launch for the peak (TI).** TI is the calendar-leverage moment: casual + lapsed fans return in force, and "how close is this to ending" is exactly the question a re-onboarding fan asks — R4 hardened before TI is R4 landing when its primary segments are most present.

**Freeze-window rule for this spec:** capture-only changes may ship during EWC; anything user-visible (decoder output, chips) waits for the freeze to lift or hides behind the owner flag. Never flip the public flag mid-Tier-1-event.

---

# Spoiler Policy

Clean — R4 slots into the existing companion spoiler rule with no new policy surface:

- **Hidden in spoiler-free:** the tower/barracks readout, any derived drama flag, and (debatably — see below) the spectator count. Map state reveals who's winning *harder* than the score does (a 3-tower-vs-9 split with rax down is an unambiguous "this team is losing"), so it must be suppressed exactly like the score, momentum band, and net-worth graph already are. Gate: the existing `showLiveStory = !spoilerFree` conditional in `SeriesLivePulse.jsx` — no new gating logic.
- **Never hidden:** the live draft (pre-outcome, not a spoiler — unchanged rule).
- **Spectator count — open question, lean toward hiding:** a raw "42k watching" arguably doesn't reveal *who's* winning, so it could survive spoiler-free as a pure hype signal. But a spectator spike often correlates with a decisive moment, and the safest posture for a spoiler-avoider is airtight. **Recommendation: include spectator count in the spoiler-gated block for v1** (suppress it in spoiler-free); revisit exposing it spoiler-free only if there's demand. Spoiler-safety is toxic-waste-grade; we don't get clever with it on v1.
- **Reveal control:** identical to the existing surfaces — spoiler-free is a per-element gate; the draft still renders, everything else collapses cleanly with no layout hole. No new "reveal" affordance needed beyond what the block already has.

---

# Data Feasibility

**Provider:** OpenDota `/live` (the same feed the capture already reads). Freshness: ~60–110s (the existing `capture:od-live:lock` cadence — one snapshot covers all live games). This is a **coarse snapshot, not real-time**: a tower that falls between two captures is invisible for up to ~110s. Acceptable and consistent with R1's documented coarseness; the existing "as of MM:SS" timestamp sets the expectation.

**What's confirmed available (this session):** `building_state` (integer bitmask, present), `spectators` (integer, present). Both ride the existing `/live` game object — no new fetch, no new provider, no new rate-limit surface.

**The one decode unknown that sets R4's ceiling:** whether `building_state`'s bits include barracks, or only towers + ancient.
- The 24-significant-bit sample suggests **towers + ancient only, no barracks** (11 towers + 1 ancient = 12/side × 2 = 24). If confirmed, the **highest-value slice — barracks / mega-creeps — is not derivable from `/live` at all** (post-game `barracks_status` is absent from the live feed). That does not kill R4; it means the MVP is tower-based ("9 towers vs 4," "high ground threatened" via tier-3/tier-4 bits) and the mega-creeps flag is either dropped for live or sourced differently later.
- **This must be resolved empirically before any decoder ships** (§R4.0). Do NOT infer the bit layout from OpenDota community docs alone — that's the exact posture that necessitated the `team === 0/1` verification. The docs are a hypothesis to test, not a spec to implement.

**Provider-reliability posture (per `pm_instructions` §4):** assume OD `/live` is unreliable and incomplete. Not every Tier-1 game appears in `/live` (some broadcasts are YouTube-only; `/live` coverage is independent of that). Every R4 surface degrades to *absent* — when we don't have (or can't confidently decode) the data, we render **nothing** for the objective row, never a wrong or broken chip. Silence beats a false "MEGA CREEPS."

---

# Detailed Requirements

Scope is split into a mandatory gate + three shippable slices. **MVP = R4.0 (gate) + R4.1.** R4.2 is decode-gated. R4.3 is polish.

## R4.0 — `building_state` decode verification (mandatory gate, ships no UI)

- Add `building_state` + `spectators` to the existing `live_game_map` capture (additive columns; freeze-safe; see Calendar Timing). Store the raw integer — decode at read, not capture ("store raw, filter at read," the table's existing convention).
- Let it accrete across several live Tier-1 games (EWC provides these now).
- For each game that has since completed and been indexed by OD `/matches/{id}`, diff the **last captured live `building_state`** bit-for-bit against that match's known-shape post-game `tower_status_radiant/dire` + `barracks_status_radiant/dire`. Confirm which bits map to which buildings, and critically **whether barracks are represented at all**.
- Cross-check ≥1 game where a tower fell *during* the capture window (two consecutive captures) and confirm exactly the expected bit flipped.
- **Deliverable:** a confirmed bit-layout written up as a `CONTEXT.md` addendum (same as the `team === 0/1` finding), OR an explicit "not viable / partial" verdict (e.g., "towers decodable, barracks absent"). Either outcome hard-gates what R4.1–R4.3 can promise.

## R4.1 — Tower-count objective readout + spectator count (MVP, must-have)

- A single compact **objective row** in the running-game block: per-side standing-tower count (e.g. `Towers 9 · 4`, green Radiant / red Dire), derived from the verified `building_state` decode (R4.0). If the spike proves tier granularity is reliable, a "high ground threatened" state when a side has lost all tier-3s in a lane is a strong within-R4.1 add; if only a raw count is reliable, ship the count alone.
- **Live spectator count** as a hype/discovery signal (e.g. `42.1k watching`) — zero decode risk, high discovery value, near-free. Included in R4.1 because it's the cheapest high-value element in the whole feature.
- **Attribution to named teams** via the resolved game's `radiant_name`/`dire_name` — never series header order (same swap-safe rule as R1's lead color).
- **Omit-on-low-confidence:** if the decode confidence for a given payload is low (bit count implausible, value out of range, or the field is missing), render nothing for the tower readout — never a guessed count. The spectator count is independent and can still render if present.
- **Draft phase (`game_time < 0`):** no objective row (no buildings contested yet); spectator count may still show.
- **Spoiler-free:** whole objective row suppressed under the existing gate.

## R4.2 — Barracks / mega-creeps state (decode-gated, high-value-if-viable)

- IF R4.0 confirms barracks bits are in `building_state`: add a barracks readout (e.g. `Rax 6 · 2`) and the terminal `MEGA CREEPS` flag when a side has lost all six. This is the single highest-value "how close to ending" signal in Dota — but also the highest-stakes decode (a wrong "MEGA CREEPS" is a trust-destroying factual error).
- IF R4.0 confirms barracks are NOT in `/live`: R4.2 is **cut from the live surface** for v1. Document the finding; barracks state becomes a post-game-only enrichment (already available via `barracks_status` once OD indexes) feeding the durable `/match/:id`, not the live sheet. Do not fabricate a live barracks readout from an unreliable inference.
- Every flag in R4.2 is omit-on-low-confidence, same as R4.1.

## R4.3 — Derived drama flags + per-lane map (polish, later)

- Higher-confidence-required derived flags: `THRONE EXPOSED` (both tier-4s down), `HIGH GROUND` pressure, per-lane building map. Highest visual polish, lowest priority, most decode-sensitive.
- Only pursue once R4.1 (and R4.2 if viable) are proven live and the decode has held across many games without a false flag.

## Cross-cutting requirements

- All R4 surfaces live **inside** the running-game section of `SeriesLivePulse.jsx`; finished-game rows above are unchanged.
- R4 fields ride the **existing** 20s pulse payload (`?mode=live-game-pulse`) — no new fetch, no new mode, no new function file (Vercel 12-function cap; `live-game-pulse` already exists).
- No writes to the LOCKED VOD stream cache (`cacheRunningStreams`, `live:game:` KV, `stream:match:`). The new columns are additive to `live_game_map`, exactly like the hero-id and player-name migrations before them.
- The `building_state` **decoder is a pure, unit-tested function** (house pattern — `computePoints`, `computeMomentum`, `mapLiveGamesToRows` are all pure + tested), with the verified bit-layout encoded as documented constants, and an explicit confidence check that returns "unknown" rather than guessing.

---

# UX / UI Considerations

**Placement & hierarchy** — the running-game block today is (top→bottom): stakes chip → momentum band + `as of MM:SS` → net-worth graph → score row + lead badges → live draft. R4 adds **one compact objective row**, placed **directly under the momentum band, above the net-worth graph**. Rationale: momentum band answers "who's ahead (net worth)"; the objective row answers "how close to ending (map)." They are the two complementary *state reads* and belong adjacent, before the graph (which is the *history* of the net-worth read). This keeps all three "state" signals grouped and the block scannable top-to-bottom as: stakes → net-worth state → map state → net-worth history → raw numbers → draft.

**The objective row itself (one line, no wrap on 400px):**
- Left: tower pips/count per side — `Towers 9·4`, the numbers `tabular-nums`, green Radiant / red Dire per the `GoldGraph` color convention (reuse, no new palette). Optional tier-3/high-ground state as a small chip when reliable.
- Right (when R4.2 viable): `Rax 6·2` or a `MEGA CREEPS` chip; when not viable, omit entirely.
- Spectator count: a muted secondary micro-stat, right-aligned (e.g. `42.1k watching` with a small eye/viewer glyph), tertiary weight — it's flavor, not a primary read.
- Micro-label: `OBJECTIVES` or `MAP` in the existing uppercase tracking-widest tertiary style.

**Anti-clutter discipline:** ONE row. The block is already dense (stakes, momentum, graph, score, draft). If both towers and barracks are shown, they share the single row (`Towers 9·4 · Rax 6·2`), not two rows. Resist the urge to render a full lane map inline (that's R4.3, and probably a hover/expand, not always-on).

**States**
- *Loading:* the objective row is absent until the first pulse resolves it; no skeleton needed (it's a secondary read, not the block's spine).
- *Draft phase:* no objective row; spectator count may show.
- *Low decode confidence:* objective row omitted (spectator count independent). Never a guessed/partial readout.
- *No `/live` coverage:* whole live block already collapses to the existing "watch the broadcast" fallback — R4 adds nothing new here.
- *Post-game transition:* freezes on last value then unmounts with the block (existing behavior); never flickers to a wrong empty state.
- *Spoiler-free:* whole row suppressed; collapses cleanly, no layout hole.

**Mobile (primary viewport, 400px sheet):** the row must fit without horizontal scroll — this is why it's one line and why counts are compact (`9·4`, not `9 towers standing`). Real-device viewport check per `feedback_deployment_checklist`.

**Accessibility:** the row is real text with an `aria-label` summarizing state ("Objectives: Team A 9 towers, Team B 4 towers, Team B barracks threatened") — never icon-only. Spectator count reads as text.

**Design system:** per `DESIGN_GUIDELINES.md` and the Sofascore/ESPN/HLTV density bar — reuse the existing pulse micro-label + tabular-nums + green/red side convention. No new colors, no new motion. Read the guidelines before touching any className. Propose a `DESIGN_GUIDELINES.md` addition ("Live series companion — objective/map-state row") rather than a one-off. Hand the visual detail to `/ux-design`.

---

# Technical Considerations

*(High-level only — the /cto owns the engineering plan.)*

- **Capture:** add `building_state` (int) + `spectators` (int) to `mapLiveGamesToRows()` output and the `live_game_map` upsert payload in `api/_handlers/liveOdCapture.js`, plus the two columns in `scripts/create-live-game-map.sql` (additive migration, mirror the 2026-07-19 player-names migration). Store raw; no decode at capture.
- **Read:** extend `?mode=live-game-pulse` (`liveGamePulse.js`) to select the two new columns and return the *decoded* objective state + raw spectator count in the existing pulse payload. Decode happens server-side via a pure decoder so the client renders trusted output, OR decode client-side from the raw int — /cto's call, but the decoder must be pure + unit-tested wherever it lives.
- **Resolution:** unchanged — R4 describes whatever game the pulse already resolved (`findOdMatchByTime`), so it can never disagree with the numbers already shown.
- **Decoder:** the crux. A pure function `decodeBuildingState(bitmask) -> { radiantTowers, direTowers, radiantRax?, direRax?, confidence }` with the R4.0-verified bit constants and an explicit confidence gate (return low confidence rather than guess). Unit-tested against the real captured samples the spike collects.
- **No new function file** (12-cap); no LOCKED-zone writes; `service_role` reads only.

---

# Data Requirements

| Data | Source | Freshness | Reliability / Notes |
|---|---|---|---|
| Building state (towers ± rax) | OD `/live` `building_state` bitmask (new capture) | ~60–110s | **Bit layout must be empirically verified (R4.0).** Confirmed present this session; decode unknown. Coarse snapshot. |
| Spectator count | OD `/live` `spectators` (new capture) | ~60–110s | Plain int, zero decode risk. Confirmed present (`976`). |
| Resolved running game id + team names | Existing `live_game_map` + pulse resolver (unchanged) | ~60–110s | Reused; R4 inherits the pulse's resolution, can't disagree with it. |
| Post-game `tower_status`/`barracks_status` (verification only) | OD `/matches/{id}` | 30–90 min lag | Used ONLY by the R4.0 spike to validate the live decode; not a live dependency. |

**Retention:** `building_state`/`spectators` live on `live_game_map` (30d retention, unchanged) — no new high-insert table (unlike `live_game_gold`). No new retention policy needed.

---

# Edge Cases

- **Draft phase (`game_time < 0`):** no buildings contested → suppress the tower/rax readout; spectator count may show.
- **`building_state` missing or 0 on a live game:** render nothing (omit-on-low-confidence), not "0 towers."
- **Decode confidence low** (bit count implausible for a given payload): omit the readout rather than show a wrong count/flag. Silence > wrong (the spec's explicit rule).
- **Barracks not in the field** (strong hypothesis): R4.2 cut from live; document; no fabricated rax readout.
- **Tower falls between captures:** invisible for up to ~110s → readout lags; the "as of MM:SS" timestamp covers the expectation. Never claim real-time.
- **Sides swap between games of a series:** objective state is per-`od_match_id`, attributed via that game's `radiant_name`/`dire_name` — correct by construction (same as R1).
- **Pauses / reconnects:** `building_state` frozen (no buildings change) → readout plateaus, correct. A game dropping from `/live` → whole block collapses (existing).
- **Spectator count absent/zero** on a real game: omit the spectator micro-stat; don't show "0 watching."
- **Wrong-game correlation:** guarded by the pulse's mandatory both-team-names match; R4 inherits it.
- **Spoiler-free toggled mid-session:** objective row suppresses/reveals instantly with the other Live Story surfaces; draft persists.
- **Post-game transition with sheet open:** objective row freezes then unmounts with the block; never flickers to a wrong empty state.
- **Series concludes, sheet stays open:** running game → null, block moves to finished list (existing); objective row never persists onto the wrong game.

---

# Analytics & Tracking

**New GA4 events (`trackEvent`):**
- `live_map_state_shown` — objective row rendered (props: `has_rax` bool, `confidence`).
- `live_map_state_omitted` — decode confidence too low to render (measures decoder reliability in the wild — a key R4.0-success proxy).
- `live_spectators_shown` — spectator count rendered (prop: bucketed count).

**Server-side:** log decode confidence distribution per capture run and the `building_state` raw value on low-confidence decodes (so the decoder can be tuned against real misses without Vercel Log Drains, per `project_vercel_plan`).

**KPIs / success metrics:**
- Objective-row render rate = % of live opens with a running game where the decode was confident enough to render (the R4.0 → production success signal; target high after the spike hardens the layout).
- `live_map_state_omitted` rate (failure metric — should be low and stable; a spike means the decode broke, e.g. a new building added in a patch).
- Companion dwell time / poll-count per open (shared Live Story engagement proxy — R4 should hold or lift it).
- Directional: does adding the objective row correlate with higher companion → VOD replay CTR (the moat metric)?

---

# QA Scenarios

**Happy paths**
- Mid-game with towers down on one side → row shows `Towers 9·4` (+ rax if viable), attributed to the right named teams, numbers match what the stream shows.
- Spectator count renders and is plausible (thousands, not a raw socket number).
- Draft phase → no objective row, spectator count may show, no error.

**Failure paths**
- `building_state` missing/0 → row omitted, rest of block intact.
- Decode confidence low → row omitted, `live_map_state_omitted` fires, no guessed readout.
- No `/live` coverage → existing "watch the broadcast" fallback, R4 adds nothing broken.

**Correctness / regression**
- Sides swapped across a BO3 → each game attributes tower/rax counts to the correct named team (inherits the pulse's resolution).
- Decoder unit tests pass against the real captured samples from R4.0 (including a mid-game tower-fall diff).
- Spoiler-free ON → objective row + spectators hidden, draft shown; toggling flips instantly.
- No write path touches `live:game:`/`stream:match:`/`cacheRunningStreams` (VOD-lock regression).
- Finished-game rows + tap-through unchanged.

**Performance / real-time**
- Pulse payload with R4 fields stays small (two ints + a decoded object).
- Multi-tab: capture lock holds to one OD fetch/window; no divergence.
- Mobile 400px: objective row fits on one line, no horizontal scroll (real device).

**Cross-browser:** text/number rendering identical Chrome/Safari/Firefox.

---

# Risks & Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| `building_state` bit layout decoded wrong → false readout ("MEGA CREEPS" that isn't) | **High** | R4.0 empirical verification gate BEFORE any decoder ships; omit-on-low-confidence; decoder is pure + unit-tested against real samples; `live_map_state_omitted` telemetry to catch drift. |
| Barracks not in `building_state` → highest-value slice (mega creeps) not live-viable | Medium | Hypothesis tested in R4.0; if confirmed, cut R4.2 from live and route barracks to post-game `/match/:id`; ship tower-based MVP regardless. |
| Patch adds/removes a building → bit layout shifts, decoder silently wrong | Medium | Confidence check (implausible bit count → omit) fails safe on a layout change; monitor `live_map_state_omitted` for a step-change after any patch. |
| Capture coarseness (~110s) undersamples a fast base race | Low | Documented; "as of MM:SS" timestamp; never claim real-time. |
| Clutter in an already-dense block | Low-Medium | One-row discipline; place adjacent to momentum band; hand visual detail to `/ux-design`. |
| Shipping UI during the EWC freeze | Medium | Capture-only during freeze; UI behind owner flag or post-freeze; never flip public mid-Tier-1. |
| Accidental coupling to LOCKED VOD cache | High if it happens | Additive columns only; mandatory reviewer check; VOD-lock regression QA. |

**Dependencies:** OD `/live` (capture — already integrated), OD `/matches/{id}` (R4.0 verification only), Supabase `live_game_map` (additive columns), the existing pulse resolver. No new third-party dependency. Hand-offs: `/cto` (engineering plan + where the decoder lives), `/ux-design` (objective-row visual spec + `DESIGN_GUIDELINES.md` entry), and `/dota_data_scientist` if the decode confidence heuristic needs statistical validation against the captured sample set.

---

# MVP Recommendation

**Ship R4.0 (decode-verification gate) + R4.1 (tower-count readout + spectator count) as R4 v1**, behind `spectate-owner` first, then public — mirroring exactly how R1/R2 and the companion launched.

Rationale: R4.1 delivers the deterministic core of "how close to ending" (tower state) plus the near-free discovery signal (spectators), reuses the entire existing capture → pulse → render pipeline, and adds only two additive columns and one pure decoder. It requires **no** new table, **no** new fetch, **no** new route, **no** new function. R4.2 (barracks/mega-creeps) is the higher-value but decode-gated slice — its viability is a *finding* of R4.0, not an assumption, so it cannot be committed as MVP. R4.3 is polish.

**Sequence the calendar (from §Fan Calendar Timing):** start the R4.0 capture NOW during EWC (freeze-safe, best dataset); ship the R4.1 decoder + UI post-EWC/pre-TI so it's hardened when casual + lapsed fans return for TI.

**Explicitly out of R4 v1:** barracks/mega-creeps *if* not decodable from `/live` (R4.2), per-lane map + drama flags (R4.3), the row-level "heating up" badge on `LiveMatchRow` (separate spec — architecturally distinct, joins live telemetry into the ambient feed), win-probability, per-player net worth.

---

# Future Enhancements

- **Barracks / mega-creeps on the live surface** if a later source makes it reliable (R4.2 revived).
- **Per-lane building map + drama flags** (`THRONE EXPOSED`, high-ground pressure) — R4.3.
- **Objective-state timeseries → durable post-match `/match/:id` + AI-intelligence page** — the citation-asset play (same downstream win as the net-worth capture); "the game was decided when the second rax fell at 38:00" is an evergreen, citable fact.
- **Spectator-count as a discovery signal on `LiveMatchRow`** — feeds the future "heating up" row badge (separate spec).
- **Objective markers on the net-worth graph** — a tower/rax fall as a marker on the R1 graph (post-game `GoldGraph` already does event markers; live would reuse the pattern once objective capture is proven).
- **Roshan / Aegis state** — not in `/live`; harder; investigate separately.

---

# Suggested Engineering Approach

*(High-level direction only — /cto owns the plan.)*

1. **DB:** add `building_state bigint`, `spectators integer` columns to `live_game_map` via an additive migration in `scripts/create-live-game-map.sql` (mirror the 2026-07-19 player-names migration + its grant/sequence-grant discipline). Run once in Supabase SQL editor before the capture code deploys.
2. **Capture:** in `mapLiveGamesToRows()` / the upsert payload in `liveOdCapture.js`, store the raw `building_state` + `spectators` per game. No decode at capture. (Freeze-safe — ship during EWC to harvest the spike dataset.)
3. **Spike (R4.0):** offline analysis diffing captured live `building_state` against post-game `tower_status`/`barracks_status` for completed EWC games; produce the verified bit-layout constants (or the "barracks absent" verdict). Document in `CONTEXT.md`.
4. **Decoder:** pure, unit-tested `decodeBuildingState(mask)` with the verified constants + explicit confidence gate. Tested against the real captured samples.
5. **Read:** extend `liveGamePulse.js` to select the two columns and return decoded objective state + raw spectator count in the existing pulse payload.
6. **Frontend:** an `ObjectiveRow` element inside `SeriesLivePulse.jsx`, under the momentum band; gated by the existing `showLiveStory`; omit-on-low-confidence; owner-flag for launch.
7. **Tests + docs:** decoder unit tests (house pattern); snapshot the omit/draft/spoiler states; update `CONTEXT.md` + a `DESIGN_GUIDELINES.md` objective-row entry.

---

# AI + Search Discoverability

Per `.claude/ai_discoverability.md`:

- **New public route?** No. R4 lives inside the companion on the non-canonical `?live=<id>` param; live telemetry is transient, deliberately kept out of the index (consistent with the live-surface posture in `live-story.md`). No `middleware.js` handler, no JSON-LD.
- **New entity type?** No — enriches the existing *match/series* entity while live.
- **Bare-HTML crawler visibility?** None expected or desired — JS-gated, transient, real-time.
- **`public/llms.txt` / `llms-full.txt` updates?** None. R4 adds fields to the existing `private, no-store` `live-game-pulse` read — not an LLM-consumption endpoint, not added to Machine-Readable Endpoints.
- **New API mode?** No — rides the existing `?mode=live-game-pulse`.
- **Knowledge-graph / citation target?** Not the live surface. **The durable win:** the captured objective-state timeseries later enriches the evergreen post-match `/match/:id` + AI-intelligence page (which *are* citation targets) — "the game broke open when the second set of barracks fell at 38:00" is a citable, evergreen fact. That downstream enrichment is where R4's data becomes discoverable, noted under Future Enhancements, out of scope for the live surface now.

---

# Open Questions

1. **Barracks in `building_state`?** — the single ceiling-setting unknown. Resolved by R4.0; everything R4.2 promises depends on the answer. (Strong hypothesis: no. Must verify.)
2. **Spectator count in spoiler-free?** — lean hide for v1 (§Spoiler Policy). Confirm we're OK suppressing a signal that arguably doesn't reveal the winner, in exchange for airtight spoiler-safety.
3. **Decode server-side or client-side?** — /cto's call; either way the decoder is pure + unit-tested. Server-side keeps the client dumb and the confidence gate authoritative; client-side keeps the pulse payload one field smaller.
4. **Confidence heuristic** — what exactly makes a decode "low confidence" (implausible set-bit count? a value exceeding the max valid mask?). Needs a concrete rule from R4.0's findings; possibly a `/dota_data_scientist` validation pass against the captured sample set.
5. **"High ground threatened" in R4.1 or R4.3?** — depends on whether R4.0 proves tier-3 granularity is as reliable as raw count. If yes, it's a cheap high-value add to R4.1; if not, it waits for R4.3.
6. **Owner-flag launch during EWC tail vs. wait for post-EWC?** — confirm the freeze-window handling (capture now, UI behind flag or after freeze).

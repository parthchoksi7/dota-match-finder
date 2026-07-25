# Live Story — Shipped Feature Record

**Status:** Historical reference. Everything below is live in production. This file replaces `live-series-companion.md`, `live-story.md`, `live-story-implementation-plan.md`, and the shipped portions of `live-story-v1.1-remaining-scope.md` / `live-story-v1.1-implementation-plan.md` / `live-story-r4-objective-map-state.md` / `live-story-r4-implementation-plan.md` — those 7 files are consolidated here and in the companion `live-story-roadmap.md` (remaining/prioritized work), then deleted.
**Last consolidated:** 2026-07-25
**Full technical detail for anything below lives in `CONTEXT.md`** (search the bolded feature name) and in git history — this file is a compact index, not a re-derivation. Don't fork detail back into this file; update `CONTEXT.md` when behavior changes and leave this as a dated pointer.

---

## Foundation — Live Series Companion (Phases 0–2)

**Shipped and public since 2026-07-17.** Let a fan open an in-progress series and see per-game stats instead of waiting for it to end.

- **Phase 0 — matchId reliability.** Dual-source OpenDota match-id capture: `live_game_map` table + `?mode=od-live-capture` (KV-lock throttled, `*/15` QStash backstop) closes the gap where PandaScore's `external_identifier` goes null once a game ends but before OpenDota indexes it.
- **Phase 1 — completed-game companion.** Each finished game in an open series shows a glanceable draft strip, result, and notable-event indicators (Rampage/Rapier/swing/comeback), tapping through to the full `MatchDrawer`.
- **Phase 2 — live pulse (foundation).** The currently-running game shows gold lead, kill score, and live draft, resolved via `?mode=live-game-pulse` (`api/_handlers/liveGamePulse.js`) — the same handler R1–R4 below all extend.

Owner-gated verification window caught a wrong PandaScore route, missing Supabase grants, a wrong-side gold-lead color, and a URL-restore double-fire bug before public launch — this launch pattern (owner-flag verify → public flip) repeats for every surface below.

---

## Live Story R1 + R2 — Net-Worth Graph & Momentum

**Shipped and public since 2026-07-18.** Upgrades the running-game block from a snapshot scoreboard into a live narrative surface.

- **R1 — Live net-worth graph.** `LiveGoldGraph.jsx`, fed by the `live_game_gold` append-only timeseries table (captured every ~60–110s alongside the existing `live_game_map` upsert). **Shipped beyond spec** — the original spec called for a static line only; what shipped has interactive hover/touch-scrub, a time-scaled x-axis, and snap-to-captured-point tooltips.
- **R2 — Momentum band + series stakes.** `computeMomentum`/`computeStakes` (`src/utils/momentum.js`, pure + unit-tested) — "state, not fate" vocabulary (`EVEN` / `{TEAM} Ahead` / `{TEAM} Far Ahead`), thresholds widen with game time since the same lead means different things early vs. late. Stakes chip: `Decider` / `Match Point · {TEAM}` for BO3/BO5.
- Retain-last-known/bounded staleness (`nextPulseState`, 90s bound) so a single failed 20s poll doesn't flicker the whole live block.
- Surface says **"Net Worth,"** not "Gold" (the post-game `GoldGraph` still says "Gold" — accepted, unreconciled divergence).

---

## Live Story R4 — Objective / Map State (Phases A–C)

Full finding detail: `CONTEXT.md`, search "R4.0 decode spike" and "R4 Phase C."

- **Phase A — Capture (2026-07-19).** `building_state` + `spectators` added to `live_game_map` (additive columns, no decode at capture).
- **Phase B — Decode verification gate (2026-07-24).** `building_state`'s bit layout was cracked: two 9-bit per-side blocks (bits 0-8 / 16-24), each three independent 3-bit per-lane tower counters. `standingTowers = clamp(4 - raw, 0, 3)` scores **46/47 exact matches on both sides** against real OpenDota `building_kill` ground truth (47 games / 885 timeseries points, accreted passively in `live_game_gold` since Phase A). The crack came from that passive timeseries, not the original static/`--watch` spike design (see `CONTEXT.md`'s risk-log entry for the reversed recommendation that made this possible).
- **Barracks confirmed NOT decodable** from this field — a direct disproof (same raw ceiling value with 0 vs. 2 barracks destroyed across two lanes of the same game), not just an unresolved signal.
- **Phase C — Decoder + read API (2026-07-24).** `api/_buildingState.js` (pure `decodeBuildingState`) wired into `liveGamePulse.js` as `pulse.objectives = { rt, dt }`, gated behind `isOwner` the same way `pulse.history` already is. No UI reads it yet.
- **R4.2 / Phase E (barracks readout, mega-creeps flag) is CUT** — not deferred, confirmed not buildable from this data source. Barracks stay a post-game-only enrichment via `barracks_status_radiant/dire`.
- **Known open curiosity, not blocking:** a 2-bit "extra" field per side (bits 9-10 / 25-26) doesn't correlate with any known event and is asymmetric between sides. Doesn't overlap the tower-count bits.
- `spectators` was tried as a UI signal and reverted the same day (2026-07-20) — OpenDota's live count is DotaTV-only and misrepresents the real (Twitch/Kick/YouTube-majority) audience. Not part of this feature.

---

## Recurring lessons worth keeping in view

These patterns showed up more than once across this feature's build and are likely to recur:

- **Owner-payload-gating, not just frontend-gating, for server-computed live fields.** `history` and `objectives` are both computed server-side and would otherwise leak into every public payload the instant the backend ships — gate the attachment itself (`if (isOwner) pulse.x = ...`), not just the UI that renders it.
- **`bigint` Supabase columns need explicit `Number(...)` coercion at the read site** (PostgREST can string-serialize them) — caught once already for `od_match_id`-class columns, caught again for `building_state` in Phase C review.
- **JS `1 << i` / bitwise ops overflow past bit 31** — use `Math.floor(n / 2**i) % 2` for any field that might exceed 31 significant bits.
- **Prefer riding an existing append-only table over building bespoke one-off collection tooling** — the `live_game_gold` timeseries cracked the R4 decode passively; the purpose-built `--watch` spike script did not.
- **Never touch the LOCKED VOD cache** (`cacheRunningStreams`, `live:game:` KV, `stream:match:`) — every phase above is additive/read-only and independent of it, verified in review each time.

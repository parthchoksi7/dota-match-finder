# Live Story — Remaining Scope Product Plan (v1.1 / v1.2 / Backlog)

**Status:** Draft — Not yet in development
**Last Updated:** 2026-07-19
**Author:** Product (AI-assisted, via `.claude/pm_instructions.md`)
**Predecessors:** `.claude/specs/live-series-companion.md` (shipped 2026-07-17, DONE), `.claude/specs/live-story.md` + `.claude/specs/live-story-implementation-plan.md` (R1+R2 shipped 2026-07-18, DONE — see corrected status headers on both)

---

## 0. TL;DR — Evaluation + Decision Summary

**What's actually built, across all three spec files in `.claude/specs/`:**

| Spec | Scope | Status |
|---|---|---|
| `live-series-companion.md` | Phases 0–2: matchId reliability, completed-game companion, live pulse (gold lead, kill score, live draft) | ✅ **DONE, public since 2026-07-17.** Nothing remaining. |
| `live-story.md` + `live-story-implementation-plan.md` | R1 (live net-worth graph), R2 (momentum + stakes) | ✅ **DONE, public since 2026-07-18** (commits `feab37b`→`4cea723`). Shipped **beyond** spec: v1 explicitly said "no hover, no event markers," but the shipped `LiveGoldGraph` has interactive hover/touch-scrub with a time-scaled axis and snap-to-captured-point tooltips. |
| `live-story.md` | R3 (AI "Catch Me Up" line) | ❌ **Not started.** No `live-catch-up` mode, no live variant of `summarize.js`. |
| `live-story.md` | R4 (objective/map state) | ❌ **Not started.** No `building_state` capture or decode anywhere. |
| `live-story.md` "Future Enhancements" | Row-level "heating up" badge, win-prob model, per-player net worth, event markers, Roshan/Aegis timers, public pick'em, spectator count, feed into `/match/:id` | ❌ **Not started** (backlog, not committed scope). |

**Correction made to the two stale spec files:** both `live-story.md` and `live-story-implementation-plan.md` still had "Draft — Not yet in development" / "Ready for build" headers despite R1+R2 being live in production for a day. Headers corrected to point here; original bodies kept as historical record (matches how `live-series-companion.md` already handles its own history).

**This document's job:** propose what ships next, now that the live data pipeline (the biggest technical risk in the original spec) is proven in production.

---

## 1. What changed since the original R3/R4 sequencing was written

The original `live-story.md` sequenced R3 (AI) after R1+R2 specifically to "layer probabilistic AI once the live pipeline is proven" (spec §Resolved Decisions #3). That pipeline is now proven: `live_game_gold` has been accreting in production for two days, the correlation/resolver path (`findOdMatchByTime`) is battle-tested by the public graph and momentum band, and the retain-last-known/staleness handling has already survived real game transitions. **The stated precondition for R3 is satisfied.**

Separately, the spec's own "Future Enhancements" section calls the row-level "heating up" badge on `LiveMatchRow` the **"highest-leverage next step after v1"** — higher leverage than anything inside the companion sheet, because it drives the *discovery* decision (which of 3 live games to open) rather than enriching a game a user already opened. That claim wasn't weighed against R3/R4 in the original sequencing because it was written as a "future" item, not a competing v1.1 candidate. It should be weighed now.

---

## 2. Candidate scope for what ships next

### Candidate A — R3: AI "Catch Me Up" line
Already fully speced in `live-story.md` (§R3, §Data Requirements, §Edge Cases, §Risks) — structured-facts-only input to Claude Haiku via `summarize.js`, server-cached per `(od_match_id, game_time bucket)`, kill-switch flag, winner-prediction forbidden, spoiler-gated, owner-flagged launch. Nothing in that detail needs to change; it's build-ready as written.

- **User value:** answers "what's the story so far" in prose — the one question the graph/momentum/draft don't answer. Completes the four-question framing from the spec's Feature Summary.
- **Effort:** M. New `?mode=live-catch-up` handler, a live variant of the existing `summarize.js` prompt path, a cache table or KV bucket, a kill switch.
- **Risk:** the only genuinely new risk in this whole remaining-scope list — hallucination/quality on partial live data, and it's the first LLM-generated text placed next to live (not post-game) data. Mitigated exactly as speced: structured-only input, low temp, hedged language, kill switch, owner-gated verification window (same launch pattern as R1/R2 and the companion before it — this house has now done this launch dance three times successfully).
- **Cost:** bounded — on-demand for open sheets only, 2–3 min cache bucket, Haiku (cheap). Needs a cost/volume estimate at typical concurrent-live-sheet counts before launch (not in the original spec — flag as open question below).

### Candidate B — Row-level "heating up" badge (pulled forward from Future Enhancements)
Not speced in detail anywhere yet — the original spec explicitly deferred it ("needs live telemetry joined into `live-matches.js` — separate spec"). This document does not attempt to fully spec it (that violates root-cause-first: it deserves its own PM pass), but flags it as the strongest competing claim on "what ships next."

- **User value:** per the spec's own words, this is discovery-layer leverage — it helps a fan pick which live game to open, which the in-sheet R1/R2/R3 surfaces cannot do (they only enrich a game already opened). Given SpectateEsports routinely has 2–3+ tier-1 games live simultaneously during tournament windows, this may have a larger reach than R3 despite being simpler.
- **Effort:** M–L, and structurally different work: it means joining live telemetry (`live_game_map`/`live_game_gold`) into `live-matches.js`'s row rendering — the first time live telemetry crosses from the companion sheet into the ambient feed. That's new architectural surface, not an extension of `SeriesLivePulse`, and deserves its own spec (data-freshness-for-a-list-of-N-rows is a different problem than data-freshness-for-one-open-sheet).
- **Recommendation:** don't build blind. If the owner wants to prioritize discovery over in-sheet depth, commission a dedicated PM spec for this next (it is explicitly out of this plan's scope to design it here).

### Candidate C — R4: Objective / map state
Fully speced (`live-story.md` §R4, §Edge Cases, §Data Requirements). Blocked on an empirical prerequisite the spec itself calls out: **`building_state` bit-layout must be verified against real live payloads before any decode ships** (same rigor the team already applied to confirm `team === 0/1` for draft sides on 2026-07-16). That verification is a half-day-or-less investigative task, independent of deciding whether to build the feature.
- **User value:** answers "how close is this to ending" better than net worth alone (spec's own framing — net worth ignores map control). Real but secondary to R3's "what's the story."
- **Effort:** S for the verification spike; S–M for the feature once bit layout is confirmed (mirrors the R1/R2 capture→read→render pattern already proven twice).
- **Recommendation:** run the verification spike opportunistically (cheap, de-risks a future decision) even if R4 itself doesn't ship next.

### Explicitly not proposed for the next increment
Win-probability model, per-player net worth (Steam `GetRealtimeStats` — new third-party dependency, new ingestion), event markers on the live graph, Roshan/Aegis timers, public live pick'em, spectator-count signal, feeding live telemetry into the durable post-match page. All remain valid backlog per the original spec's "Future Enhancements" — none has a forcing function to move up yet.

---

## 3. MVP Recommendation

**Ship R3 (AI Catch Me Up) as Live Story v1.1**, using the existing spec detail as-is (it's already build-ready), because:
1. Its stated precondition (proven live pipeline) is now met.
2. It completes the original four-question framing the whole Live Story feature was pitched on — R1/R2/R3/R4 map 1:1 to "how did we get here / is it worth watching / what's the story / how close to ending," and R3 is the one still missing that a user would notice as an absence while reading the sheet top to bottom.
3. It reuses proven plumbing end-to-end (`summarize.js`, `findOdMatchByTime`, the `?mode=` router, the owner-gate launch pattern) — lowest engineering risk of the three candidates despite being the first LLM-on-live-data feature.

**Run the R4 `building_state` verification spike in parallel** (cheap, unblocks a future decision without committing to build R4 yet).

**Do not build the row-level "heating up" badge (Candidate B) inside this increment.** Its leverage argument is real and worth taking seriously, but it's architecturally distinct (crosses telemetry into the ambient feed, not just the sheet) and deserves its own product spec rather than being bolted onto this plan. Recommend commissioning that spec next, in parallel with or immediately after v1.1 ships.

---

## 4. Open Questions (for owner)

1. **R3 cost estimate:** what's the expected concurrent-open-live-sheet count during a tournament window, and does Haiku-per-2–3-min-bucket stay trivially cheap at that volume? (Original spec flagged cost as "Low" without a number — worth a rough estimate before committing.)
2. **R3 vs. Candidate B priority:** does the owner agree R3 ships next, or is the discovery-layer leverage of the row badge (Candidate B) compelling enough to commission that spec first instead? This plan recommends R3 first but the tradeoff is genuinely close.
3. **R4 timing:** run the `building_state` verification spike now (low cost, informs a later call) or defer entirely until after v1.1 ships?
4. **Divergent "Gold" vs. "Net Worth" labeling** (noted as an accepted tradeoff in `CONTEXT.md`): still fine to leave unreconciled, or worth a small pass now that the live surface has had a public day to prove itself?

---

*Engineering implementation plan for the approved scope: see the `/cto`-produced plan that follows this document.*

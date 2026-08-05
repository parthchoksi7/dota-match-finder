# Live Story Event Feed — Product Specification

**Owner:** dota_pm (with dota_data_scientist + dota_analyst input inline)
**Depends on:** `.claude/specs/live-ingestion-investigation.md` (technical mechanism, validated 2026-08-05), `.claude/specs/live-event-feed-mvp-spec.md` (original MVP scope)
**Date:** 2026-08-05
**Status:** Spec only. This document is the decision-ready product layer on top of the two docs above — it does not repeat their technical detail, it makes the product calls the technical investigation left open, and pressure-tests scope against the fan segments and the calendar.

---

# Feature Summary

"Live Story" turns the existing `LiveSeriesSheet`/`SeriesLivePulse` companion from a **state** surface (score, gold lead, draft) into a **narrative** surface: a spoiler-gated, confidence-labeled ticker of `TowerDestroyed`, `HeroKilled`, `RoshanKilled`, and marquee `ItemPurchased` events, sourced from Valve's free `GetLiveLeagueGames` endpoint (§2.E of the investigation doc), polled every 10s, zero new infrastructure. It answers the one question the current companion cannot: **"what just happened?"** — the causal layer underneath the gold graph that already ships.

---

# User Problem

A fan who opens `LiveSeriesSheet` mid-game sees the *result of* the story (score, net worth) but not the story itself. The gold graph shows a line moving; it never says why it moved. Today the only way to find out is to tab to the actual broadcast — at which point the companion has failed its one job, which is letting someone follow a match **without** dedicating a screen to it. This is not a new problem invented for this spec: it is the same "second-screen" job every other Live Series Companion feature (net-worth lead, live draft, kill score) already serves — Live Story is the missing piece that makes those numbers legible as a story instead of a scoreboard.

---

# Product Goals

- **Business:** increase session frequency and dwell time inside live tournament windows specifically — the highest-leverage retention lever available before TI 2026 (2026-08-13 Day 1).
- **User:** answer "what just happened" in under 2 seconds of glancing, without spoiling anyone who has opted into Spoiler-Free Mode.
- **Strategic:** this is a data-source moat, not a UI moat. `GetLiveLeagueGames` isn't in PandaScore, Strafe, rdy.gg, or STRATZ's product surface (confirmed: PandaScore supplies zero in-game telemetry, per the investigation doc's 33-call-site audit; STRATZ's own live path is dead per `project_stratz_api_access`). No competitor in `COMPETITIVE_RESEARCH.md` currently shows *why* a live game's score is what it is. First mover here compounds — every week of real usage data (which event types actually get engagement) widens the gap.

---

# User Personas Affected

See Segment Impact below for the full breakdown against SpectateEsports's six named fan segments — this is not a feature "for everyone."

---

# Segment Impact

| Segment | Reach × Intensity | Why |
|---|---|---|
| **Hardcore Follower** | High reach, medium intensity | Already knows what a Roshan kill or tower loss means without narration — this segment's win is *speed* and *density*, not explanation. They'll use it as a compressed log while a stream plays elsewhere. Churns if it's slower or laggier than just watching. |
| **Casual Fan** | Medium reach, high intensity | This is the segment the feature exists for. A plain-text "Tower destroyed — bot lane, tier 2" is legible with zero Dota literacy; it's the difference between "the gold graph moved" (meaningless to them) and "something happened" (a hook). |
| **Lapsed Fan** | Low reach at MVP (owner-gated), designed to matter at TI | This segment's whole ask is "catch me up fast." A ticker is a natural on-ramp during TI's group stage when they're re-engaging cold. Not reachable until the feature graduates past owner-gating — flag this as a scoping tension, see MVP Recommendation. |
| **Regional Fan** | Neutral | Event text (team names, hero-level facts) is language-agnostic by construction; no localization lift, no localization gap either. |
| **Pub Player Who Doesn't Watch Pro** | Not served | This segment's bridge problem (own-game relevance) is untouched by a pro-match event feed. Correctly out of scope — don't let this spec's success metrics get diluted by trying to serve this segment too. |
| **VOD-First / Timezone-Shifted Fan** | Zero reach *by design*, but highest risk if the spoiler gate is wrong | This segment never sees the feature live (spoiler delay + Spoiler-Free Mode both apply), but a bug here is the segment most damaged by one — see Spoiler Policy. |

**Read:** this is a Casual-Fan-primary, Hardcore-secondary feature. It should not be scored against Lapsed or Regional reach at MVP — those are TI-era upside, not MVP justification.

---

# Fan Calendar Timing

- **TI 2026 Day 1 is 2026-08-13.** That is 8 days from this document's date. A net-new, unvalidated live data pipeline shipping *during* group stage is the exact scenario `.claude/pending-refactors.md`'s "feature freeze during live Tier 1 tournaments" rule exists to prevent — TI is the single highest-stakes, highest-traffic window of the year, and it is also the tournament where `GetLiveLeagueGames` was *not* the one validated against (validation match was Games of the Future 2026). **Recommendation: owner-only validation now through TI group stage, public graduation only after live-fire validation against real TI matches with an established false-positive rate on `TowerDestroyed`/`RoshanKilled` bit-decoding (E12, unresolved per the investigation doc §6.4).**
- **Do not gate the public launch decision on a calendar date — gate it on the bit-layout decode (E12) being verified.** Shipping unverified tower/barracks bitmask decoding into a public feed during TI, then discovering the bit layout was wrong, is worse than not shipping at all: it's the exact "an inferred event stated as fact, later contradicted by the VOD" trust failure the MVP spec's Viewer Psychology section already names as costing trust in *every other number on the page*, not just this feature.
- **Post-TI trough (roster shuffle season) is when this earns its "moat" framing**, not during TI. TI drives one-time trial; the trough is where "Spectate is the only place that tells you what happened, not just what the score is" either sticks as a habit or doesn't. Plan the public-graduation marketing push for the post-TI period, not the TI peak itself — everyone's attention is already maximally captured during TI regardless of what ships.
- **Net-new poller must ship and soak *before* group stage starts**, even in owner-only mode — an untested poller failing silently during TI's actual peak traffic is a worse outcome than shipping a week late.

---

# Spoiler Policy

This is the single highest-risk dimension of the whole feature — restated as policy, not just as a technical gate:

- **What it reveals:** discrete, named events (`TowerDestroyed`, `HeroKilled`, `RoshanKilled`, marquee `ItemPurchased`) tied to an in-engine `game_time`.
- **What it hides:** any event whose `game_time` falls inside the tournament's real `stream_delay_s` (per-game, from `GetLiveLeagueGames` itself — not a guessed constant, per investigation §2.E) of the newest observed `game_time`. This is a **stricter** rule than the existing `LiveGoldGraph`/net-worth surfaces, which show current state; an event ticker showing a Roshan kill 30 seconds *before* the broadcast reaches it is actively worse than a stale number, because it's legible as a spoiler even to someone not trying to compute one.
- **Who controls the reveal:** the existing Spoiler-Free Mode toggle, with **no separate opt-in** for this feature — a fan who is spoiler-free for score is definitionally spoiler-free for "the enemy took Roshan," and a second, feature-specific toggle would just be a second place to get the default wrong. Reuse the `scoreRevealed`/"Reveal score" button pattern `SeriesLivePulse.jsx` already has (2026-07-31) rather than inventing new gating UI.
- **Non-negotiable:** confidence-labeled events (`inferred`, `uncertain`) must never render indistinguishably from `exact` ones in the UI — this is a UX requirement, not just a data-model one, and should be a hard line item in the /ux-design pass, not left implicit.
- **Owner-gating during the validation window is itself a spoiler-safety mechanism**, not just a QA convenience — it means a wrong call is caught by the one person who already knows the outcome, before any spoiler-sensitive fan sees it.

---

# Detailed Requirements

1. **Scope: exactly four event types at MVP** — `TowerDestroyed`, `HeroKilled`, `RoshanKilled`, `ItemPurchased` (marquee items only — BKB, Aghanim's-class, Radiance-class; not every consumable). This matches the existing MVP spec; this document does not expand it. Ability tracking, teamfight clustering, and buyback inference are explicitly **not** MVP (see Future Enhancements) — each adds surface area without adding "what just happened" legibility for the Casual Fan this feature is built for.
2. **Tier-1 only**, reusing the existing tier-1 filter (`isTier1`/`isTier1ByName`) — do not create a second tier-1 rule (repo convention, `feedback_reuse_existing_logic`).
3. **10s poll, fixed cadence**, no adaptive logic — confirmed at ~9% of daily Steam Web API quota even continuous (investigation §4.1).
4. **Owner-gated at launch** (`?owner=1`), same staged-rollout pattern as the live gold graph and objectives readout.
5. **Hard spoiler-delay gate** using the tournament's real `stream_delay_s`, integrated with existing Spoiler-Free Mode (see Spoiler Policy above — this is the one requirement that cannot slip).
6. **Confidence labeling is user-visible**, not just a schema column — `RoshanKilled`'s kill itself is `exact`, team attribution is `inferred`; `HeroKilled` killer attribution under concurrent deaths is `inferred`; `TowerDestroyed`/`BarracksDestroyed` stay `uncertain` in the UI until E12 (bitmask decode) is verified against a real game with real tower losses.
7. **Dota-analyst read on event prioritization (the ordering that matters for "what just happened," not just what's technically easiest):**
   - `RoshanKilled` is the single highest-arousal event in the four — it's a resource swing (aegis, buyback denial potential) *and* a narrative beat ("who's setting up the next fight") simultaneously. It should visually lead the ticker when present, not just append chronologically.
   - `HeroKilled` matters far more as a **multi-kill/teamfight cluster** than as an individual death — a lone death mid-farm is noise to a glancing viewer; three deaths in 20 seconds is the actual "something happened" moment. MVP doesn't build teamfight clustering (per Future Enhancements), but the ticker's *display* should visually group same-tick/near-tick `HeroKilled` events rather than listing them as five identical flat rows — this is a display-layer cheap win, not a new derivation.
   - `TowerDestroyed` matters most as a **rate signal, not an event count** — a team losing its second tier-2 tower in ten minutes is a collapse in progress; the same tower lost at minute 45 in an otherwise even game is much lower-arousal. Do not treat all tower losses as equal-weight ticker rows if there's any display budget to differentiate (color/size by tier, per the existing `tower_state`/`barracks_state` split).
   - `ItemPurchased` is the weakest of the four for "story" value and the one most worth cutting first under time pressure — a BKB purchase explains a *subsequent* fight's outcome but isn't itself a moment. Keep it, but don't let it compete visually with the other three.
8. **Data-scientist read on momentum framing:** if this ticker is ever paired with (or read alongside) the existing net-worth lead / momentum band on `SeriesLivePulse`, be aware that `momentum.js`'s lead-magnitude thresholds are known miscalibrated as a flat scale (`project_momentum_bands_feed_calibration`: a 5-8k lead is 92% decided by minute 12 but only 64% by minute 60 — lead significance is a function of game time, not lead size alone). Do not let a Live Story event ("Roshan taken") get visually paired with a static "commanding lead" framing computed off the miscalibrated thresholds — that's a compounding-inaccuracy risk this feature would inherit, not cause, but should not make worse. This is a flag for whoever eventually recalibrates `momentum.js`, not a blocker for Live Story's own ship.
9. **Real limitation to design around, stated in product terms:** `ItemPurchased` cannot see backpack or neutral-item-slot moves (6-slot API limit, investigation §2.E/§6.4) — a real purchase can silently never appear. Do not present the item ticker as complete; frame it internally and in any owner-facing QA notes as "marquee slot-visible purchases," not "all purchases."

---

# UX / UI Considerations

Handed to `/ux-design` as a dependent spec — do not treat the bullets below as final UI, they're the product constraints that spec must satisfy:

- Ticker lives inside the existing `LiveSeriesSheet`/`SeriesLivePulse` live-game view, below the net-worth lead and above (or interleaved with) the live draft — it is the causal layer under state, so it should sit visually adjacent to the state it explains (net worth), not bolted on as an unrelated panel.
- Must visually distinguish `exact` vs `inferred` vs `uncertain` confidence without a second reading — a color/icon system, not a hover tooltip a glancing second-screen viewer will never trigger.
- Must group near-simultaneous `HeroKilled` events (teamfight-adjacent) rather than flat-listing (see Detailed Requirements §7).
- Roshan events need visual priority over the other three types.
- Reuses the existing "Reveal score" spoiler-gate button pattern (2026-07-31) — no new spoiler-toggle UI.
- **Direct ask into the /ux-design pass this document accompanies:** the live-match side sheet (`LiveSeriesSheet`/`SeriesLivePulse`) has already had two rounds of deliberate consistency work pulling it toward `MatchDrawer`'s visual vocabulary (2026-07-30, 2026-07-31 — shared header order, shared score-digit treatment, shared close glyph, shared sheet host). Live Story should extend that convergence, not fork a third visual language: if `MatchDrawer` ever grows a "what happened" surface (e.g. from OpenDota's post-game `objectives[]`), the live ticker and that surface should look like the same component in two time states, live and completed — this is the natural product argument for the requested side-sheet parity work.

---

# Technical Considerations

Full detail lives in `.claude/specs/live-ingestion-investigation.md` — not repeated here. Product-relevant callouts:

- **Zero new infrastructure** — Vercel + QStash + Supabase, same stack as every other capture job. This materially changes the calculus vs. the original brief's assumption that "own live ingestion" meant a new server; it doesn't.
- **New standalone poll handler**, not an extension of `liveOdCapture.js` — no shared OpenDota dependency to piggyback on. Product implication: this is a genuinely separable rollout — it can ship, break, or roll back independently of the existing gold-graph pipeline.
- **Team-name correlation to PandaScore is direct string match**, validated byte-identical in one real match — but "validated once" is not "proven robust across TI's 16-team, multi-region roster." Reuse `TEAM_NICKNAMES`/`canonicalTeamName` (`src/teamMatching.js`) as the fallback, per the investigation doc — do not treat the byte-identical result as a guarantee that holds for every team name PandaScore has ever emitted.
- **E12 (tower/barracks bitmask decode) is an open technical unknown that blocks `TowerDestroyed` from being labeled `exact`.** This is the one item in the technical doc that should gate the public-launch decision, not the calendar (see Fan Calendar Timing).

---

# Data Requirements

- **Source:** `IDOTA2Match_570/GetLiveLeagueGames/v1`, free Steam Web API key, single global poll (investigation §2.E).
- **Freshness:** 10s poll cadence; real per-tournament `stream_delay_s` returned directly (not a guessed constant) — this is a genuine product upgrade over the original design (aegis-inference, guessed 120s delay).
- **Reliability:** `scoreboard` present on 39/40 games tested, independent of spectator count — the 1 miss looked like a between-games gap, not systematic. Team-name join validated byte-identical once.
- **Known gaps:** no backpack/neutral item visibility (6-slot schema); `RunePickedUp`/`SmokeUsed`/`WardPlaced` not derivable at all from this source — these remain Tier 3 (GC/GOTV) territory and should not silently creep into MVP scope creep discussions.

---

# Edge Cases

Beyond the reliability table already in the investigation doc (§5.2), product-level edge cases:

- **A match Live Story is actively narrating gets cut off by the spoiler gate mid-event** (e.g. a Roshan kill just occurred but sits inside the delay window) — the UI must show *that something is pending* without showing *what*, so the ticker doesn't look broken/frozen to a spoiler-off fan who is allowed to see it once the delay clears. A silent gap reads as a bug; a "story continues shortly" placeholder does not.
- **Team-name correlation fails for a specific match** (rebrand, alias miss) — the live-game continues to show state (score, gold) as it does today, but Live Story silently has zero events for that match rather than degrading the whole companion. Fail this feature open-to-absent, never closed-to-broken.
- **A tier-1 game that PandaScore lists as `running` never appears with a `scoreboard`** in `GetLiveLeagueGames` (the ~1/40 miss case, or a genuinely non-matching game) — ticker shows nothing, not an error state; the rest of `SeriesLivePulse` is unaffected.
- **TI-scale concurrency** (up to ~8 concurrent tier-1 games in group stage) — confirmed not an API-quota risk (§4.1), but is a **display** question: does a fan watching Series A ever see Series B's events bleed through? Must be strictly per-`od_match_id` scoped, no cross-match leakage, enforced at the query layer not just the UI layer.

---

# Analytics & Tracking

- `live_story_event_shown { event_type, confidence, seriesId }` — per-event-type engagement, the data this feature needs to earn its post-MVP graduation.
- `live_story_ticker_view` — did the sheet render the ticker at all (distinguishes "no events yet" from "feature not reached").
- Reuse existing `spoiler_reveal`-style event naming conventions rather than inventing a parallel taxonomy.
- **The metric that actually matters for the graduation decision:** does session dwell time on `LiveSeriesSheet` increase for matches with ≥1 Live Story event shown, vs. matches with none, controlling for match duration? This is the number that turns "cool feature" into "ship past owner-gating."

---

# QA Scenarios

- Owner-only validation against **at least 3 real tier-1 matches across different tournaments** before TI group stage — the one validation match so far (Games of the Future 2026) is not enough to trust team-name correlation or bitmask decoding at TI scale/roster diversity.
- Explicit test: a tower loss during owner validation, cross-checked post-game against OpenDota's `objectives[]` `building_kill` events, to close out E12 before allowing `TowerDestroyed` out of `uncertain`.
- Explicit test: spoiler-free mode ON, confirm zero event leakage inside the delay window, confirm the "pending" placeholder (not silence, not a raw event) renders correctly.
- Explicit test: two concurrent tier-1 matches open in two browser tabs, confirm no event bleed-through between them.

---

# Risks & Dependencies

- **E12 (bitmask decode unverified)** is the single largest technical risk carried into this product decision — see Fan Calendar Timing and Technical Considerations.
- **Depends on PandaScore `matches/running` for correlation** — an existing, already-relied-upon dependency, not a new one, but worth naming: if PandaScore's own feed is degraded, Live Story has no team names to correlate against even if `GetLiveLeagueGames` itself is healthy.
- **Trust risk compounds sitewide**, not just locally — per the MVP spec's own Viewer Psychology section, a wrong inferred event stated as fact costs trust in every other number on the page, not just this feature. This is the argument for keeping confidence-labeling non-negotiable rather than a "nice to have if there's time."

---

# MVP Recommendation

**Ship owner-gated now, hold public graduation until two conditions are both met:** (1) E12 bitmask decode verified against a real tower loss, and (2) at least 3 real tier-1 matches validated end-to-end, ideally including one from TI 2026 group stage itself once it starts (2026-08-13). Do not graduate to public purely on a calendar date — graduate on those two conditions. This is stricter than the original MVP spec's framing but is the direct consequence of E12 still being open and TI being 8 days out.

Four event types, exactly as scoped in the existing MVP spec — do not expand at MVP, do not cut below four (Roshan alone would answer too little; all four together is still a small, achievable scope).

---

# Future Enhancements

- **Teamfight clustering** (≥3 `HeroKilled` in a 20s window) — explicitly deferred at MVP (per the existing MVP spec's event catalogue), but the highest-value near-term addition once the four base events are validated, since multi-kill clusters are the actual high-arousal moment per the analyst read in Detailed Requirements §7.
- **Buyback inference** — `uncertain` confidence at best without GOTV; do not ship without dedicated validation, and possibly never ship as anything above `uncertain`.
- **Cross-match "what just happened" homepage feed** — the `live_events (captured_at desc)` index already exists for this in the technical schema (investigation §6.5) even though no UI consumes it yet. This is the natural TI-era escalation: a single feed of "just happened across all live tier-1 games" serves the Lapsed Fan segment this MVP explicitly does not reach.
- **Tier 3 (GC/GOTV) events** (`RunePickedUp`, `SmokeUsed`, `WardPlaced`) — not derivable from the Tier 1 mechanism at all; a real future capability but roughly 100× the engineering/ops cost per the investigation doc, and should be justified by a specific product need Tier 1 demonstrably can't serve, not pursued speculatively.

---

# Suggested Engineering Approach

High-level only — full architecture is `.claude/specs/live-ingestion-investigation.md` §7:

1. New standalone poll handler (e.g. `api/_handlers/liveEventCapture.js`), QStash-scheduled, independent of `liveOdCapture.js`.
2. Pure event-differ functions, unit-tested against the real fixtures already saved at `__tests__/fixtures/get-live-league-games/`.
3. `live_games`/`live_events`/`live_state_snapshots` schema exactly as specified in the investigation doc §6.2 — do not re-derive.
4. Read API adds a `mode=live-events` (or similar) branch to the existing tournaments API surface, applying the spoiler-delay gate server-side (never trust a client-side-only gate for spoiler safety, per the existing Spoiler-Free Mode crawler invariant precedent).
5. Frontend: extend `SeriesLivePulse.jsx`, per the `/ux-design` spec this document hands off to.

---

# AI + Search Discoverability

- **No new public route at MVP** (owner-gated, lives inside the existing `LiveSeriesSheet`). No middleware/JSON-LD work needed yet.
- **No new entity type** — events are sub-match-level facts, not a new crawlable entity.
- **Nothing changes for bare-HTML crawlers at MVP** — this is a client-polled, owner-gated surface with no SSR content.
- **`llms.txt`/`llms-full.txt`: no change needed until/unless this graduates to public and gets a durable per-match "what happened" summary surface** (e.g. the Future Enhancements cross-match feed) — live event tickers are transient by nature and a poor `llms.txt` citation target; a post-game derived summary (events → prose) would be the discoverability-relevant artifact, and is out of scope for this spec.
- **Revisit this section when/if graduation to public happens** — a public live-events feed on a stable per-match URL could become a real citation target ("what happened in Team A vs Team B, minute by minute") and should get a fresh AI-discoverability pass at that point, not retrofitted after the fact.

---

# Open Questions

1. Who validates the 3+ real-match owner QA pass before TI, and on what schedule given TI Day 1 is 2026-08-13?
2. Does the teamfight-clustering display grouping (Detailed Requirements §7) belong in this MVP's UX pass or is it genuinely a fast-follow — recommend fast-follow, but flag for `/ux-design` to confirm no extra plumbing is needed to leave room for it.
3. What is the actual go/no-go owner reviewing E12 against — is "cross-checked against OpenDota's `objectives[]` once" sufficient, or does this need N independent tower losses before trusting the bit layout?
4. Should `RoshanKilled` team-attribution (inferred) be shown at all before it's more reliable, or should MVP show "Roshan taken" without a team name until that's solved — leaning toward the latter as the more honest default; needs an explicit call before UX work locks the layout.

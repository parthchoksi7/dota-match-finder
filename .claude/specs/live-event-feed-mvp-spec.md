# Live Event Feed (Tier 1 / GetRealtimeStats) — Product Specification

**Status:** Spec only. No code written. Gated on open questions below + STEAM_API_KEY acquisition.
**Depends on:** `.claude/specs/live-ingestion-investigation.md` (full technical investigation — read first)
**Date:** 2026-08-04

---

# Feature Summary

A live, in-engine "what just happened" ticker for tier-1 Dota 2 matches, surfaced inside the existing `LiveSeriesSheet`. Sourced from Valve's free, official (but undocumented) Steam Web API `GetRealtimeStats` endpoint, polled every 10s for tier-1 games already tracked in `live_game_map`. Four event types at MVP: `TowerDestroyed`, `HeroKilled`, `RoshanKilled` (inferred), `ItemPurchased` (marquee items only). Owner-gated (`?owner=1`), same staged-rollout pattern as the existing live gold graph and objectives readout. Hard spoiler-delay gate integrated with Spoiler-Free Mode. Zero new infrastructure — extends `captureOdLiveOnce()`.

---

# User Problem

A viewer who opens `LiveSeriesSheet` mid-game today sees score, an owner-only gold graph, live draft, and a building-state bitmask that can't even resolve barracks (`api/_buildingState.js`). There is no answer to the single most natural question a second-screen viewer asks when checking in on a match between other tabs: **"what just happened?"** The gold graph shows *who's ahead*; it never shows *why*. To find out, the user has to tab over to the actual Twitch broadcast — at which point the companion tool has failed at its one job, which is to let someone follow a match *without* dedicating a screen to it.

**Root problem, stated precisely: Spectate answers "what's the state" but not "what's the story."**

---

# Root Cause Analysis

This isn't a demand problem — it's a data problem that was, until this week, unsolved. Every live telemetry field the site has today (OpenDota `/api/live`) is a raw state snapshot (score, gold, picks), not an eventized signal. There was no cheap, ToS-clean path to discrete "this happened" events. The investigation resolved that: `GetRealtimeStats` is free, sanctioned, and the one blocking field it needs — `server_steam_id` — is *already* captured in `live_game_map` by `liveOdCapture.js`. The feature was blocked on infrastructure that, as of this investigation, already exists.

---

# Viewer Psychology

- **Second-screen behavior dominates Spectate's actual usage.** Most sessions happen while something else has the user's primary attention. A short, exact ticker ("Tower destroyed — bot lane, tier 2", "Roshan taken by Team X") is a glanceable hook that pulls the user *back toward* the primary broadcast, not a substitute for it. This is retention-positive, not Twitch-competitive.
- **Roshan and multi-kills are peak-arousal moments** in Dota fandom — the events Reddit and X spike around in real time. Being fast (even at a 2-3 minute delay) with a plain-text signal for these creates a habit loop: "check Spectate, something might be happening."
- **Spoiler sensitivity is the direct counterweight**, and it's not symmetric — a fan who deliberately stays spoiler-free is *actively harmed*, not just unserved, by an accurate real-time feed. This is why the delay gate is a hard invariant, not a nice-to-have: it's the difference between strengthening the existing Spoiler-Free promise and quietly breaking it for the exact users who trust it most.
- **Uncertainty aversion compounds across the whole site.** An inferred event stated as fact (e.g., a confidently wrong kill attribution) that's later contradicted by the VOD doesn't just cost trust in this feature — it costs trust in every other number on the page. `confidence` must be a real, surfaced concept, not an internal implementation detail.

---

# Product Goals

- **Business:** increase session frequency during live tournament windows — give users a reason to re-open Spectate mid-match instead of only at match start/end.
- **User:** answer "what just happened" in under 2 seconds of glancing, without spoiling anyone who's opted out of spoilers.
- **Strategic:** this is the seed of a genuinely differentiated "Live Story" layer. No PandaScore-consumer competitor can build this cheaply — these events simply aren't in PandaScore's data (confirmed in the investigation doc's audit of all 33 PandaScore call sites in this repo). It's a moat built on a data source competitors haven't looked at.

---

# Personas Affected

| Persona | Effect |
|---|---|
| Casual second-screener (primary) | Gets the "what just happened" hook this spec exists for. |
| Hardcore fan watching the live stream | Sees this feed *behind* the broadcast by design — if the delay gate is wrong, it actively spoils what they're about to see on stream. |
| Spoiler-free / async viewer | Must be fully shielded — this is the persona a bug here damages worst. |
| Site owner (you) | Sole audience at MVP launch. Owner-gating doubles as staged rollout and as the QA mechanism — you validate against a real broadcast before anyone else sees a wrong call. |

---

# First Principles Analysis

- **What's the actual atomic unit of Dota watchability?** Not "score" — objective changes and fights. Score (gold lead) is a *lagging* indicator; an event feed is the *leading* indicator that explains it. This reframes the feature: it's not a nice-to-have ticker, it's the missing causal layer under the gold graph that already shipped.
- **Does this need full fidelity (GC/GOTV) to deliver the value?** No — investigated and explicitly rejected. Towers and kills, the two objects fans track second-to-second, are exactly the two event types the differ derives at `exact` confidence from the cheap path. Runes/smokes/wards — the fidelity only GOTV adds — are analyst-tier detail, not casual-hook material. Tier 1 isn't a compromise; it's the correctly-scoped answer to the psychology actually driving demand.
- **What's the smallest thing that's true?** A confidence-labeled, delay-respecting, small-event-type feed. Ability tracking, teamfight clustering, buyback inference all add surface area without adding to the "what just happened" answer a glancing viewer wants.
- **Second-order effect to plan for:** once a "what just happened" feed exists, users will notice gaps or misses in a way they never noticed a raw gold number being slightly stale. This baseline-expectation shift is the strongest argument for a full owner-only validation window (TI 2026) before any public exposure — see MVP Recommendation.

---

# Detailed Requirements

1. **Scope:** tier-1 live games only (reuses the existing tier-1 filter already applied everywhere else in the codebase — do not create a second tier-1 rule).
2. **Poll cadence:** fixed 10s at MVP. No adaptive logic yet (deferred to Future Enhancements) — Steam Web API quota headroom at realistic tier-1 concurrency doesn't require it (see investigation doc §4.1).
3. **Event types (exactly four):**
   - `TowerDestroyed` — exact, includes lane + tier.
   - `HeroKilled` — exact on the death, attribution `inferred` when >1 kill lands in one poll tick.
   - `RoshanKilled` — `inferred` via aegis-item appearance in a player's `items[]` (open question below on whether this ships in v1 — see Open Questions).
   - `ItemPurchased` — marquee items only: BKB, Blink Dagger, Aghanim's Scepter, Radiance, Divine Rapier, Refresher Orb, Octarine Core, Shiva's Guard.
4. **Correlation:** reuse `findOdMatchByTime()` from `api/_shared.js` for PS↔OD binding — **do not** write a second matching algorithm (per `feedback_ps_od_matching`, `feedback_reuse_existing_logic`).
5. **Spoiler gate:** server-side, hard suppression of any event whose `game_time` is within `broadcast_delay_s` (default 120s, per-tournament tunable) of the newest observed `game_time` for that match. Enforced at the read endpoint, never client-only.
6. **Owner gating:** identical pattern to `resolvePulse`'s `isOwner` gate in `liveGamePulse.js` — the event feed is an additional owner-only payload field, not a separate endpoint.
7. **Fail-open everywhere:** every new failure mode (Steam API error, quota exhaustion, missing `server_steam_id`, Supabase write failure) degrades to "no feed," never to a broken sheet. Matches the codebase's existing universal convention.

---

# UX / UI Considerations

- **Placement:** new section inside `LiveSeriesSheet`, positioned near the existing live draft/score block; owner-only gold graph and objectives readout stay where they are.
- **Format:** vertical ticker, most-recent-first, short single-line strings ("🏗️ Tower destroyed — Radiant bot T2" style, icon TBD per `DESIGN_GUIDELINES.md`).
- **Empty state:** explicit "No major events yet" — a silently blank section during a genuinely quiet game reads as broken, not calm.
- **Loading state:** skeleton rows, matching the density/pattern of existing skeleton loaders elsewhere on the site.
- **Error state:** section disappears entirely on pipeline failure — never a visible error to a non-owner, matches site-wide convention.
- **Confidence surfacing:** `inferred` events (Roshan, ambiguous kill attribution) get a subtle, honest visual cue (e.g., a small "likely" tag or tooltip) — not a scary disclaimer, not silence. The goal is that a rare wrong call reads as "the site flagged its own uncertainty," not "the site lied."
- **Spoiler-Free Mode:** when active, the **entire section is hidden**, not shown-but-delayed. Even a 3-minute-old event is still a spoiler to someone who wants zero information before watching. This must be enforced as a hard rule, not a client-side default that a user could accidentally leave off.
- **Icon buttons:** if any interactive affordance is added (e.g., future "jump to VOD" button), follow the existing convention — purple icon buttons are always `w-7 h-7`, never the 44px touch-target floor (`feedback_icon_button_sizing` — this has been re-broken twice already; check sibling buttons' sizes before adding a new one).
- **Mobile:** `LiveSeriesSheet` is already used on mobile — ticker rows must stay single-line at narrow width; no layout shift on new-event insertion.

---

# Technical Considerations

- **Pipeline:** extends `captureOdLiveOnce()` in `api/_handlers/liveOdCapture.js` — after its existing `live_game_map` upsert, fan out `GetRealtimeStats` calls for tier-1-matched, currently-live games. Reuses the existing `LOCK_TTL_S` KV throttle so cadence stays centrally controlled regardless of caller count.
- **New env var:** `STEAM_API_KEY` — not currently present in `.env` (confirmed; current keys are `PANDASCORE_TOKEN`, `VITE_ANTHROPIC_API_KEY`, `VITE_TWITCH_CLIENT_ID/SECRET`).
- **Differ:** pure functions, `(prevSnapshot, nextSnapshot) → Event[]`, no I/O — must be unit-testable against recorded fixture snapshots, since a live TI game can't be summoned on demand for debugging.
- **Storage:** three new Supabase tables (`live_games`, `live_events`, `live_state_snapshots`) per the full schema in the investigation doc §6 — not restated here to avoid drift between two copies of the same DDL.
- **Snapshot cache:** previous per-match snapshot in Upstash KV (already provisioned), ~200KB/match, short TTL.
- **Read path:** new `?mode=live-events` handler on `api/tournaments.js`, following the existing `_handlers/` convention — applies the spoiler-delay gate server-side before the response ever reaches the client.
- **No new infrastructure:** no new server, no new deploy target, no change to Vercel/Supabase/Upstash topology.
- **Locked-subsystem boundary:** this touches `liveOdCapture.js`/`liveGamePulse.js`, which are adjacent to (but not part of) the LOCKED VOD Replay System. Must be strictly additive — no changes to existing `live_game_map` write shape, `live:game:` KV keys, or `stream:match:` cache.

---

# Data Requirements

- **Source:** `IDOTA2MatchStats_570/GetRealtimeStats/v1` — free, official, undocumented. No published SLA.
- **Freshness:** governed by the 10s poll interval *and* by the DotaTV broadcast delay itself, which is unknown and per-tournament (organizers can set up to 15 minutes under the DotaTV License) — this must be **measured against a real broadcast**, not assumed, before shipping the default `broadcast_delay_s`.
- **Reliability:** no contractual guarantee. Mitigated entirely by fail-open behavior — if the endpoint goes away, the feed disappears and the rest of the product is unaffected.
- **Volume/retention:** ~800 derived event rows and ~200KB per tier-1 game (investigation doc §4.4). Requires a retention policy (90-day rolling delete) shipped **with** the MVP, not after — Supabase free tier is 500MB and other live-tier tables already occupy part of it.

---

# AI + Search Discoverability

- **New public route?** No, at MVP (owner-gated, embedded in the existing match/series view). At any future public rollout: still no *new* route — this is a section within an existing match page, not a new page.
- **New entity type?** No. Event rows are attributes of an existing match/game entity, not first-class crawlable entities — they're the opposite of the durable, citable content this site otherwise optimizes for.
- **Bare-HTML crawler visibility:** **explicitly none, by design.** This is live, ephemeral, spoiler-sensitive data. SSR-rendering it would let a crawler snapshot leak spoilers into a search result cache — actively harmful, not just low-value. Recommend hard-excluding this feature from `middleware.js` SSR paths.
- **`llms.txt` / `llms-full.txt`:** no changes required — nothing here is durable enough to be worth an LLM citing.
- **Knowledge graph:** no new entity relationships created.
- **Long-term citation target?** No, and that's correct — this feature explicitly trades AI-discoverability for real-time engagement, which is the right tradeoff for genuinely transient, spoiler-sensitive content. Worth stating plainly so it isn't flagged as a gap in a future discoverability audit.

---

# Edge Cases

- Match abandoned mid-game (no winner) — feed should terminate cleanly, not hang polling a dead `server_steam_id`.
- `GetRealtimeStats` returns 403/429 mid-tournament (quota exhausted or key revoked) — feed disappears; alert fires; site unaffected.
- `server_steam_id` present in `live_game_map` but the endpoint 404s for it (game already ended server-side) — treat as end-of-game, not an error.
- Game paused — `game_time` freezes; differ must not misinterpret a frozen tick as "nothing happened" vs. "genuinely nothing happened."
- Item-diff noise: backpack/stash/courier movement misread as a new purchase — must be suppressed via the known-consumable list + first-appearance-only rule (investigation doc §6.4).
- Concurrent kills in one poll tick — ambiguous attribution; emit both `HeroKilled` events as `inferred` with `killer_slot: null` rather than guessing.
- Aegis-inference false positive/negative on the second Roshan or cheese pickup — flagged as an explicit unknown (E7 in the investigation doc); may be reason to hold `RoshanKilled` out of v1 (see Open Questions).
- Broadcast delay varies by tournament and is currently unmeasured — the default 120s could be wrong in either direction for a given event.
- Multi-tab sync — two tabs on the same series must share the KV-cached feed, not double the Steam API call rate (mirrors the existing `PULSE_CACHE_TTL_S` pattern in `liveGamePulse.js`).
- Stale cache after a match ends — feed must stop updating and clearly read as "final," not silently freeze mid-sentence.
- Spoiler-Free Mode toggled mid-session — feed section must react immediately (hide/show), not require a reload.
- Post-tournament dead zone (no live tier-1 game for weeks) — confirm zero wasted polling and zero spurious errors logged during quiet periods.

---

# Analytics & Tracking

- **GA4 events:** `live_event_feed_view` (sheet opened with a non-empty feed), `live_event_feed_scroll`, `owner_feed_error` (internal-only, for owner-gated debugging).
- **Success metrics:** session frequency during live tournament windows (before/after), average `LiveSeriesSheet` dwell time with feed present vs. absent, return-to-tab rate following a Roshan/tower event ping (if/when notifications extend to this).
- **Operational metrics:** Steam Web API daily call count vs. the 100k/day cap, surfaced on the existing `?mode=monitor` endpoint; per-game event-emission rate (a live game emitting zero events for 5+ minutes is a differ health signal, not evidence of a quiet game).
- **Failure metrics:** % of live-game-minutes where the feed is stale (no update in >60s).
- **Manual tracking during validation window:** false-positive rate on `TowerDestroyed`/`HeroKilled` against post-game OpenDota-parsed data (this *is* Experiment E3 from the investigation doc — track it as a real metric, not a one-off check).

---

# QA Scenarios

- **Happy path:** live tier-1 game running → correct tower/kill/Roshan/item events appear within ~10-20s of the real in-game moment, correctly delay-gated against the broadcast.
- **Failure path:** Steam key revoked or rate-limited mid-tournament → feed disappears cleanly; rest of `LiveSeriesSheet` completely unaffected.
- **Regression risk:** any change to `liveOdCapture.js`/`liveGamePulse.js` must be strictly additive — verify existing `live_game_map`/`live_game_gold` write shapes and the locked VOD stream cache are byte-for-byte unchanged.
- **Multi-tab:** two tabs on the same live series — confirm shared KV cache, confirm Steam API call count doesn't scale with tab count.
- **Mobile Safari/Chrome:** ticker renders at narrow width with no layout shift on new-event append.
- **Spoiler-Free toggle:** confirm the feed section fully disappears, not just softens or delays further.
- **Post-tournament quiet period:** confirm zero errors, zero wasted API calls, clean dormancy.
- **Accuracy validation (the actual gate for public rollout):** for one complete live game, diff every derived event against OpenDota's post-game parsed data — target zero false positives on towers and kills specifically (this is E3, restated as a QA gate rather than a one-time experiment).

---

# Risks & Dependencies

| Risk | Level | Note |
|---|---|---|
| `GetRealtimeStats` is undocumented, no SLA | Medium | No documented breaking change in years; mitigated by fail-open design. |
| Derived events are wrong (kill attribution, item-diff noise, aegis inference) | **Medium-High** | The single biggest threat to user trust in this feature specifically — see Viewer Psychology. |
| Spoiling the broadcast via an incorrect/absent delay gate | **High** | The single biggest product risk in the whole investigation. Must be validated live, not assumed. |
| Supabase 500MB free tier exhausted | Medium | Mitigated by shipping the 90-day retention policy with the MVP, not after. |
| Steam Web API 100k/day cap | Low | Real operating point is ~30% of quota at realistic tier-1 concurrency. |
| **External dependency:** a `STEAM_API_KEY` must be obtained | **Blocking** | Tied to a Steam account; free, but requires a human action before any validation or build work can start. |
| **External dependency:** a live tier-1 game to validate against | **Blocking** | TI 2026 begins 2026-08-13 — the nearest realistic validation window. |

---

# MVP Recommendation

Ship exactly the scope in **Detailed Requirements** above: 10s fixed cadence, four event types (pending the Roshan/item open questions below), owner-gated, hard server-side spoiler-delay gate. Do **not** add adaptive cadence, ability/level tracking, teamfight clustering, or buyback inference at MVP — each adds surface area without strengthening the core "what just happened" hook.

**Sequencing (unchanged from the investigation doc, restated as the build plan):**
1. Obtain `STEAM_API_KEY`.
2. Run the blocking validation experiments (E1: does the endpoint return real tier-1 data; E2: measured broadcast delay; E3: derived-event accuracy against post-game parsed data) against a real live game.
3. If validation passes → build the differ, schema, and read endpoint, land the UI behind the owner flag.
4. Validate owner-only through a full live tournament — TI 2026 is the natural window.
5. Only after a clean accuracy result does public rollout become a real decision, not a default.

---

# Future Enhancements

- Adaptive poll cadence keyed to live-game count (deferred — not needed at current concurrency, per investigation doc §4.1).
- Ability/level-up tracking, buyback inference (with explicit uncertainty UI), teamfight clustering.
- Linking each event to its corresponding VOD timestamp once a match resolves ("jump to this Roshan on the VOD") — high-value, natural extension of the existing VOD system, but must remain strictly read-only with respect to the **LOCKED** VOD Replay System.
- A cross-match "what's happening right now" homepage module surfacing the single most exciting live event across concurrent tier-1 games — only worth building once real concurrency (measured: 26% of live time has simultaneous tier-1 rows, 5% on an ordinary event day) supports the slot being non-empty often enough to earn its place.
- User-configurable spoiler protection level, once public.

---

# Suggested Engineering Approach

High-level direction only — no production code yet, per PM process:

1. Extend `captureOdLiveOnce()` to fan out `GetRealtimeStats` calls for tier-1-matched live games after its existing `live_game_map` upsert.
2. Write the differ as a standalone, pure, unit-tested module — fixture-driven, since live data can't be summoned on demand.
3. Apply the Supabase migration for `live_games` / `live_events` / `live_state_snapshots` (schema already fully specified in the investigation doc §6 — do not re-derive it).
4. Add a `?mode=live-events` handler to `api/tournaments.js` following the existing `_handlers/` pattern, applying the spoiler-delay gate server-side.
5. Add the owner-gated ticker section to `LiveSeriesSheet.jsx`, following the existing `isOwner` pattern used by the gold graph/objectives readout.

---

# Open Questions

1. **Who owns the `STEAM_API_KEY`?** It's tied to a Steam account. Worth a dedicated/throwaway account for hygiene, even though the Web API itself is explicitly ToS-sanctioned (unlike the GC/GOTV path, which this key is *not* used for).
2. **What's the correct `broadcast_delay_s`?** The doc defaults to 120s but flags it as unmeasured. Do we validate this *before* writing the differ (blocking), or ship a conservative default and tighten later?
3. **What's the actual bar for public rollout?** "One clean TI 2026" is proposed — is that sufficient, or does this need a harder, numeric threshold (e.g., N tournaments with zero false-positive towers/kills)?
4. **Does `RoshanKilled` ship in v1 at all?** It's the single highest-emotional-value event *and* the shakiest confidence class (inferred, dependent on aegis-inference reliability that's explicitly unvalidated — E7). Option: hold it out of the true MVP and add it once aegis-inference is confirmed against real data.
5. **Does `ItemPurchased` earn its place in v1?** It's the least differentiated of the four event types — arguably the lowest fan-value — and carries the most noise-handling complexity (item-diff false positives, E6). Worth considering a 3-event-type MVP (`TowerDestroyed`, `HeroKilled`, and either `RoshanKilled` *or* `ItemPurchased`, not both) to keep the true first ship as tight as possible.

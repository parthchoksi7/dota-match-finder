# Live Event Feed (Tier 1 / GetLiveLeagueGames) — Product Specification

**Status:** Spec only. No code written. Mechanism empirically validated 2026-08-05 — see update below.
**Depends on:** `.claude/specs/live-ingestion-investigation.md` (full technical investigation — read first, especially its 2026-08-05 validation update at the top)
**Date:** 2026-08-04 (spec), corrected 2026-08-05

---

## 2026-08-05 correction — read this first

This spec was originally written around `GetRealtimeStats` + `server_steam_id` sourced from `live_game_map`. **That mechanism doesn't work** for tier-1 league games — validated against 5+ live matches (see the investigation doc). The actual data source is `IDOTA2Match_570/GetLiveLeagueGames/v1`, which returns a full per-player scoreboard for every live league game in a single call, needs no `server_steam_id`, and correlates to PandaScore by a direct team-name match (confirmed byte-identical in testing). This is simpler than the original design, not just different — no OpenDota dependency, no discovery-pool gating problem, no per-game lookup chain.

Every section below is corrected in place. The product thinking (user problem, psychology, goals, personas, UX) is unchanged — only the technical mechanism moved.

---

# Feature Summary

A live, in-engine "what just happened" ticker for tier-1 Dota 2 matches, surfaced inside the existing `LiveSeriesSheet`. Sourced from Valve's free, official (but undocumented) Steam Web API `GetLiveLeagueGames` endpoint, polled every 10s — one global call covers every live league game at once, no per-match lookup. Four event types at MVP: `TowerDestroyed`, `HeroKilled`, `RoshanKilled` (now a **direct** signal, not inferred), `ItemPurchased` (marquee items only). Owner-gated (`?owner=1`), same staged-rollout pattern as the existing live gold graph and objectives readout. Hard spoiler-delay gate integrated with Spoiler-Free Mode, using the tournament's actual `stream_delay_s` rather than a guessed constant. Zero new infrastructure — a small standalone poll handler, no dependency on `liveOdCapture.js` or OpenDota.

---

# User Problem

A viewer who opens `LiveSeriesSheet` mid-game today sees score, an owner-only gold graph, live draft, and a building-state bitmask that can't even resolve barracks (`api/_buildingState.js`). There is no answer to the single most natural question a second-screen viewer asks when checking in on a match between other tabs: **"what just happened?"** The gold graph shows *who's ahead*; it never shows *why*. To find out, the user has to tab over to the actual Twitch broadcast — at which point the companion tool has failed at its one job, which is to let someone follow a match *without* dedicating a screen to it.

**Root problem, stated precisely: Spectate answers "what's the state" but not "what's the story."**

---

# Root Cause Analysis

This isn't a demand problem — it's a data problem that was, until this week, unsolved. Every live telemetry field the site has today (OpenDota `/api/live`) is a raw state snapshot (score, gold, picks), not an eventized signal. There was no cheap, ToS-clean path to discrete "this happened" events. The investigation resolved that — and after an initial dead end (`GetRealtimeStats` requires an ID from Valve's own curated live-viewership pool, which never contains off-broadcast league games), the actual answer turned out to be simpler: `GetLiveLeagueGames` already carries the full scoreboard for essentially every live league game, no extra discovery step needed. The feature was blocked on a data source that, as of 2026-08-05, is confirmed to exist and work.

---

# Viewer Psychology

*(unchanged — the psychology doesn't depend on which Steam endpoint supplies the data)*

- **Second-screen behavior dominates Spectate's actual usage.** Most sessions happen while something else has the user's primary attention. A short, exact ticker ("Tower destroyed — bot lane, tier 2", "Roshan taken by Team X") is a glanceable hook that pulls the user *back toward* the primary broadcast, not a substitute for it. This is retention-positive, not Twitch-competitive.
- **Roshan and multi-kills are peak-arousal moments** in Dota fandom — the events Reddit and X spike around in real time. Being fast (even at a 2-3 minute delay) with a plain-text signal for these creates a habit loop: "check Spectate, something might be happening." This is now backed by a **direct** Roshan-kill signal rather than an inference, which strengthens the case for leading with this event type.
- **Spoiler sensitivity is the direct counterweight**, and it's not symmetric — a fan who deliberately stays spoiler-free is *actively harmed*, not just unserved, by an accurate real-time feed. This is why the delay gate is a hard invariant, not a nice-to-have: it's the difference between strengthening the existing Spoiler-Free promise and quietly breaking it for the exact users who trust it most.
- **Uncertainty aversion compounds across the whole site.** An inferred event stated as fact (e.g., a confidently wrong kill attribution) that's later contradicted by the VOD doesn't just cost trust in this feature — it costs trust in every other number on the page. `confidence` must be a real, surfaced concept, not an internal implementation detail. (Roshan itself no longer needs this hedge — see Detailed Requirements.)

---

# Product Goals

- **Business:** increase session frequency during live tournament windows — give users a reason to re-open Spectate mid-match instead of only at match start/end.
- **User:** answer "what just happened" in under 2 seconds of glancing, without spoiling anyone who's opted out of spoilers.
- **Strategic:** this is the seed of a genuinely differentiated "Live Story" layer. No PandaScore-consumer competitor can build this cheaply — these events simply aren't in PandaScore's data (confirmed in the investigation doc's audit of all 33 PandaScore call sites in this repo). It's a moat built on a data source competitors haven't looked at, now confirmed to work rather than just theorized.

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
- **Does this need full fidelity (GC/GOTV) to deliver the value?** No — investigated and explicitly rejected, and now more clearly so: towers, kills, *and Roshan* (previously the weakest link, now a direct field) are all derivable from the cheap path at real confidence. Runes/smokes/wards — the fidelity only GOTV adds — are analyst-tier detail, not casual-hook material. Tier 1 isn't a compromise; it's the correctly-scoped answer to the psychology actually driving demand.
- **What's the smallest thing that's true?** A confidence-labeled, delay-respecting, small-event-type feed. Ability tracking, teamfight clustering, buyback inference all add surface area without adding to the "what just happened" answer a glancing viewer wants.
- **Second-order effect to plan for:** once a "what just happened" feed exists, users will notice gaps or misses in a way they never noticed a raw gold number being slightly stale. This baseline-expectation shift is the strongest argument for a full owner-only validation window (TI 2026) before any public exposure — see MVP Recommendation.

---

# Detailed Requirements

1. **Scope:** tier-1 live games only (reuses the existing tier-1 filter already applied everywhere else in the codebase — do not create a second tier-1 rule).
2. **Poll cadence:** fixed 10s at MVP. No adaptive logic needed — confirmed the single global `GetLiveLeagueGames` poll uses ~9% of the daily Steam Web API quota even run continuously, regardless of how many games are live (investigation doc §4.1, corrected).
3. **Event types (exactly four):**
   - `TowerDestroyed` — exact once the `tower_state` bitmask layout is decoded and cross-checked (open engineering item, not a product open question — see investigation doc E12).
   - `HeroKilled` — exact on the death, attribution `inferred` when >1 kill lands in one poll tick.
   - `RoshanKilled` — **now `exact` on the kill itself**, via a direct `roshan_respawn_timer` field (corrected 2026-08-05 — previously planned as aegis-inferred). Team attribution remains `inferred`.
   - `ItemPurchased` — marquee items only: BKB, Blink Dagger, Aghanim's Scepter, Radiance, Divine Rapier, Refresher Orb, Octarine Core, Shiva's Guard. **Caveat, new:** the source schema only exposes 6 item slots (`item0`-`item5`) — no backpack or neutral-item slot. A marquee item purchased directly into backpack/neutral won't be observed. Acceptable for MVP scope (these items are usually kept in the main inventory), but a known gap, not a hidden one.
4. **Correlation:** direct team-name match between `GetLiveLeagueGames`' `radiant_team.team_name`/`dire_team.team_name` and PandaScore's live opponent names — confirmed byte-identical in testing, no fuzzy matching needed for the common case. For the mismatch case (rebrands, aliases), reuse `TEAM_NICKNAMES`/`canonicalTeamName` from `src/teamMatching.js` — **do not** write a second matching algorithm (per `feedback_ps_od_matching`, `feedback_reuse_existing_logic`).
5. **Spoiler gate:** server-side, hard suppression of any event outside the delay window. The delay itself is now `stream_delay_s`, returned **directly per game** by `GetLiveLeagueGames` — no guessed 120s default, no manual measurement required. Enforced at the read endpoint, never client-only.
6. **Owner gating:** identical pattern to `resolvePulse`'s `isOwner` gate in `liveGamePulse.js` — the event feed is an additional owner-only payload field, not a separate endpoint.
7. **Fail-open everywhere:** every failure mode (Steam API error, quota exhaustion, a game's `scoreboard` transiently missing, Supabase write failure) degrades to "no feed," never to a broken sheet. Matches the codebase's existing universal convention.

---

# UX / UI Considerations

*(unchanged from the original — none of this depended on the specific Steam endpoint)*

- **Placement:** new section inside `LiveSeriesSheet`, positioned near the existing live draft/score block; owner-only gold graph and objectives readout stay where they are.
- **Format:** vertical ticker, most-recent-first, short single-line strings ("🏗️ Tower destroyed — Radiant bot T2" style, icon TBD per `DESIGN_GUIDELINES.md`).
- **Empty state:** explicit "No major events yet" — a silently blank section during a genuinely quiet game reads as broken, not calm.
- **Loading state:** skeleton rows, matching the density/pattern of existing skeleton loaders elsewhere on the site.
- **Error state:** section disappears entirely on pipeline failure — never a visible error to a non-owner, matches site-wide convention.
- **Confidence surfacing:** `inferred` events (Roshan **team attribution** — the kill itself is now `exact`; ambiguous kill attribution) get a subtle, honest visual cue (e.g., a small "likely" tag or tooltip) — not a scary disclaimer, not silence. The goal is that a rare wrong call reads as "the site flagged its own uncertainty," not "the site lied."
- **Spoiler-Free Mode:** when active, the **entire section is hidden**, not shown-but-delayed. Even a 3-minute-old event is still a spoiler to someone who wants zero information before watching. This must be enforced as a hard rule, not a client-side default that a user could accidentally leave off.
- **Icon buttons:** if any interactive affordance is added (e.g., future "jump to VOD" button), follow the existing convention — purple icon buttons are always `w-7 h-7`, never the 44px touch-target floor (`feedback_icon_button_sizing` — this has been re-broken twice already; check sibling buttons' sizes before adding a new one).
- **Mobile:** `LiveSeriesSheet` is already used on mobile — ticker rows must stay single-line at narrow width; no layout shift on new-event insertion.

---

# Technical Considerations

- **Pipeline:** a new, **standalone** poll handler — not an extension of `captureOdLiveOnce()`/`liveOdCapture.js` as originally planned, since the corrected mechanism has no OpenDota dependency to piggyback on. One `GetLiveLeagueGames` call per poll tick covers every live league game; the differ then filters to tier-1 matches after correlation. Same KV-lock throttle pattern (`LOCK_TTL_S`-style) as the existing capture jobs, for cadence control.
- **`STEAM_API_KEY`:** already obtained and confirmed working (2026-08-05) — added to `.env.local`. No longer a blocker.
- **Differ:** pure functions, `(prevPoll, nextPoll) → Event[]`, no I/O — unit-testable against real recorded fixture snapshots already captured at `__tests__/fixtures/get-live-league-games/` (a genuine live match, two polls ~30s apart, real kill/item/level deltas).
- **Storage:** three Supabase tables (`live_games`, `live_events`, `live_state_snapshots`) per the schema in the investigation doc §6 — `server_steam_id` is now optional metadata, not a required join key; `od_match_id` (= Valve's real `match_id` from `GetLiveLeagueGames`, same ID space OpenDota uses) remains the primary key.
- **Snapshot cache:** the previous poll's full response (all games at once — a single KV key, not one per match) in Upstash KV, short TTL.
- **Read path:** new `?mode=live-events` handler on `api/tournaments.js`, following the existing `_handlers/` convention — applies the spoiler-delay gate server-side using each game's actual `stream_delay_s`.
- **No new infrastructure:** no new server, no new deploy target, no change to Vercel/Supabase/Upstash topology.
- **Locked-subsystem boundary — relaxed vs. the original plan:** the corrected pipeline **doesn't touch** `liveOdCapture.js`/`liveGamePulse.js` at all (no shared OpenDota dependency), which removes the original regression-risk surface against those files entirely. It remains adjacent to, but independent of, the LOCKED VOD Replay System — no write path near `live:game:`/`stream:match:` KV keys either way.

---

# Data Requirements

- **Source:** `IDOTA2Match_570/GetLiveLeagueGames/v1` — free, official, undocumented. No published SLA, but more widely used by third-party trackers historically than `GetRealtimeStats` was.
- **Freshness:** governed by the 10s poll interval *and* by the DotaTV broadcast delay, which is **no longer unknown** — `stream_delay_s` is returned directly per game in the same response (observed both 120s and 900s live, confirming it genuinely varies by tournament).
- **Reliability:** no contractual guarantee. Mitigated entirely by fail-open behavior — if the endpoint goes away, the feed disappears and the rest of the product is unaffected.
- **Volume/retention:** ~800 derived event rows and ~200KB per tier-1 game (investigation doc §4.4) — the payload-size math is essentially unchanged even though the fetch mechanism is simpler. Requires a retention policy (90-day rolling delete) shipped **with** the MVP, not after — Supabase free tier is 500MB and other live-tier tables already occupy part of it.

---

# AI + Search Discoverability

*(unchanged — none of this depended on the specific Steam endpoint)*

- **New public route?** No, at MVP (owner-gated, embedded in the existing match/series view). At any future public rollout: still no *new* route — this is a section within an existing match page, not a new page.
- **New entity type?** No. Event rows are attributes of an existing match/game entity, not first-class crawlable entities — they're the opposite of the durable, citable content this site otherwise optimizes for.
- **Bare-HTML crawler visibility:** **explicitly none, by design.** This is live, ephemeral, spoiler-sensitive data. SSR-rendering it would let a crawler snapshot leak spoilers into a search result cache — actively harmful, not just low-value. Recommend hard-excluding this feature from `middleware.js` SSR paths.
- **`llms.txt` / `llms-full.txt`:** no changes required — nothing here is durable enough to be worth an LLM citing.
- **Knowledge graph:** no new entity relationships created.
- **Long-term citation target?** No, and that's correct — this feature explicitly trades AI-discoverability for real-time engagement, which is the right tradeoff for genuinely transient, spoiler-sensitive content. Worth stating plainly so it isn't flagged as a gap in a future discoverability audit.

---

# Edge Cases

- Match abandoned mid-game (no winner) — the game simply disappears from the next `GetLiveLeagueGames` poll; feed should terminate cleanly on that transition, not hang waiting for a `game_state` field this source doesn't expose the same way the old plan assumed.
- `GetLiveLeagueGames` returns 403/429 mid-tournament (quota exhausted or key revoked) — feed disappears; alert fires; site unaffected. (Quota exhaustion is now a much less realistic scenario given ~9% real usage — investigation doc §4.1.)
- A game is listed but its `scoreboard` field is transiently missing (~1/40 observed, likely a between-games timing gap) — skip that game for one tick, don't drop the match, retry next poll.
- Game paused — `scoreboard.duration` freezes; differ must not misinterpret a frozen tick as "nothing happened" vs. "genuinely nothing happened."
- Item-diff noise: **worse than originally scoped** — the 6-slot item schema (`item0`-`item5`) means items in backpack/neutral slots are invisible to this data entirely, on top of the original in-scope slots reshuffling without a purchase. Must be suppressed via the known-consumable list + first-appearance-only rule (investigation doc §6.4), with the added caveat that some real backpack/neutral purchases will simply never be seen.
- Concurrent kills in one poll tick — ambiguous attribution; emit both `HeroKilled` events as `inferred` with `killer_slot: null` rather than guessing.
- `tower_state`/`barracks_state` bitmask layout is unverified — do not ship `TowerDestroyed`/`BarracksDestroyed` as `exact` until decoded and cross-checked against post-game OpenDota data (investigation doc E12). This is a build-blocking engineering task, not a runtime edge case, but it gates whether the event type ships at all.
- Ability↔player mapping — `abilities[]` are team-level arrays, not nested per-player like items; a decode pass via hero-kit cross-reference (`odota/dotaconstants`) is needed before `AbilityLearned` (a Future Enhancement, not MVP scope) can ship reliably.
- Multi-tab sync — two tabs on the same series must share the KV-cached feed, not double the Steam API call rate (mirrors the existing `PULSE_CACHE_TTL_S` pattern in `liveGamePulse.js`).
- Stale cache after a match ends — feed must stop updating and clearly read as "final," not silently freeze mid-sentence.
- Spoiler-Free Mode toggled mid-session — feed section must react immediately (hide/show), not require a reload.
- Post-tournament dead zone (no live tier-1 game for weeks) — confirm zero wasted polling and zero spurious errors logged during quiet periods.

---

# Analytics & Tracking

- **GA4 events:** `live_event_feed_view` (sheet opened with a non-empty feed), `live_event_feed_scroll`, `owner_feed_error` (internal-only, for owner-gated debugging).
- **Success metrics:** session frequency during live tournament windows (before/after), average `LiveSeriesSheet` dwell time with feed present vs. absent, return-to-tab rate following a Roshan/tower event ping (if/when notifications extend to this).
- **Operational metrics:** Steam Web API daily call count vs. the 100k/day cap, surfaced on the existing `?mode=monitor` endpoint (now a much less pressing metric given ~9% real usage); per-game event-emission rate (a live game emitting zero events for 5+ minutes is a differ health signal, not evidence of a quiet game).
- **Failure metrics:** % of live-game-minutes where the feed is stale (no update in >60s).
- **Manual tracking during validation window:** false-positive rate on `TowerDestroyed`/`HeroKilled` against post-game OpenDota-parsed data (this *is* Experiment E3 from the investigation doc — track it as a real metric, not a one-off check), plus verification of the `tower_state`/`barracks_state` bit decode (E12) and ability↔player mapping (E13) specifically, since those are new engineering unknowns introduced by the corrected source.

---

# QA Scenarios

- **Happy path:** live tier-1 game running → correct tower/kill/Roshan/item events appear within ~10-20s of the real in-game moment, correctly delay-gated against the broadcast's actual `stream_delay_s`.
- **Failure path:** Steam key revoked or rate-limited mid-tournament → feed disappears cleanly; rest of `LiveSeriesSheet` completely unaffected.
- **Regression risk:** **lowered vs. the original plan** — the corrected pipeline doesn't touch `liveOdCapture.js`/`liveGamePulse.js` at all, so there's no shared-file regression surface against `live_game_map`/`live_game_gold`/the locked VOD stream cache to verify.
- **Multi-tab:** two tabs on the same live series — confirm shared KV cache, confirm Steam API call count doesn't scale with tab count.
- **Mobile Safari/Chrome:** ticker renders at narrow width with no layout shift on new-event append.
- **Spoiler-Free toggle:** confirm the feed section fully disappears, not just softens or delays further.
- **Post-tournament quiet period:** confirm zero errors, zero wasted API calls, clean dormancy.
- **Accuracy validation (the actual gate for public rollout):** for one complete live game, diff every derived event against OpenDota's post-game parsed data — target zero false positives on towers and kills specifically (E3), plus confirm the `tower_state`/`barracks_state` bit decode (E12) is correct against that same game's real building losses.

---

# Risks & Dependencies

| Risk | Level | Note |
|---|---|---|
| `GetLiveLeagueGames` is undocumented, no SLA | Medium | No documented breaking change in years; more widely relied-upon by third-party trackers than `GetRealtimeStats` was. Mitigated by fail-open design. |
| Derived events are wrong (kill attribution, item-diff noise, bitmask decode, ability mapping) | **Medium-High** | The single biggest threat to user trust in this feature specifically — see Viewer Psychology. Two *new* sub-risks vs. the original plan: unverified `tower_state`/`barracks_state` bit layout (E12), and team-level (not per-player) ability arrays needing a cross-reference decode (E13). Roshan risk is *lower* now — it's a direct field, not an inference. |
| Spoiling the broadcast via an incorrect/absent delay gate | **High** | The single biggest product risk in the whole investigation. **Lower than originally assessed** — `stream_delay_s` is now a real per-game value from the source itself, not a guessed constant that needed separate validation. |
| Supabase 500MB free tier exhausted | Medium | Mitigated by shipping the 90-day retention policy with the MVP, not after. |
| Steam Web API 100k/day cap | **Very Low** (downgraded) | Single global poll → ~9% of quota at continuous 10s cadence, independent of concurrency. |
| ~~External dependency: obtain `STEAM_API_KEY`~~ | **Resolved** | Key obtained and confirmed working 2026-08-05. |
| **External dependency:** a live tier-1 game to validate against | Partially resolved | Core mechanism already validated live against a real match (`Yakult Brothers vs PlayTime`). Remaining validation (E3 accuracy, E12 bitmask decode, E13 ability mapping) still needs at least one more live game with real tower/barracks losses and ability usage to fully confirm — TI 2026 (2026-08-13) remains the natural full-scale window. |

---

# MVP Recommendation

Ship exactly the scope in **Detailed Requirements** above: 10s fixed cadence, four event types, owner-gated, hard server-side spoiler-delay gate using the source's real `stream_delay_s`. Do **not** add adaptive cadence (confirmed unnecessary — §4.1), ability/level tracking, teamfight clustering, or buyback inference at MVP — each adds surface area without strengthening the core "what just happened" hook.

**Sequencing (updated 2026-08-05):**
1. ~~Obtain `STEAM_API_KEY`~~ — done.
2. ~~Run E1 (endpoint returns real data), E2 (measured broadcast delay)~~ — **done**, against a real live match. Mechanism confirmed; delay comes directly from the source, no manual measurement needed.
3. Build the differ, schema, and read endpoint against the real fixtures already captured (`__tests__/fixtures/get-live-league-games/`) — this can start now, without waiting for another live match.
4. Resolve E12 (bitmask decode) and E13 (ability↔player mapping) against the next live match with real tower losses — needed before `TowerDestroyed`/`BarracksDestroyed` can ship as `exact`.
5. Run E3 (accuracy against post-game OpenDota data) and land the UI behind the owner flag.
6. Validate owner-only through a full live tournament — TI 2026 is the natural window.
7. Only after a clean accuracy result does public rollout become a real decision, not a default.

---

# Future Enhancements

- Adaptive poll cadence — explicitly **not needed** even at TI-scale concurrency given §4.1's corrected math (single global poll, ~9% of quota). Removing this from the roadmap entirely rather than just deferring it.
- Ability/level-up tracking (now gated on E13's ability↔player mapping decode), buyback inference (with explicit uncertainty UI), teamfight clustering.
- Linking each event to its corresponding VOD timestamp once a match resolves ("jump to this Roshan on the VOD") — high-value, natural extension of the existing VOD system, but must remain strictly read-only with respect to the **LOCKED** VOD Replay System.
- A cross-match "what's happening right now" homepage module surfacing the single most exciting live event across concurrent tier-1 games — only worth building once real concurrency (measured: 26% of live time has simultaneous tier-1 rows, 5% on an ordinary event day) supports the slot being non-empty often enough to earn its place.
- User-configurable spoiler protection level, once public.

---

# Suggested Engineering Approach

High-level direction only — no production code yet, per PM process:

1. Build a new, standalone poll handler (not an extension of `captureOdLiveOnce()` — the corrected mechanism has no OpenDota dependency to attach to) that calls `GetLiveLeagueGames` once per tick and correlates results to PandaScore's live matches by team name.
2. Write the differ as a standalone, pure, unit-tested module against the real fixtures already captured (`__tests__/fixtures/get-live-league-games/yakult-vs-playtime-t0.json` / `-t1.json`) — this can start immediately, no live match required.
3. Apply the Supabase migration for `live_games` / `live_events` / `live_state_snapshots` (schema in the investigation doc §6, `server_steam_id` now optional).
4. Add a `?mode=live-events` handler to `api/tournaments.js` following the existing `_handlers/` pattern, applying the spoiler-delay gate server-side using each game's real `stream_delay_s`.
5. Add the owner-gated ticker section to `LiveSeriesSheet.jsx`, following the existing `isOwner` pattern used by the gold graph/objectives readout.
6. Before shipping `TowerDestroyed`/`BarracksDestroyed` as `exact`, decode and verify the `tower_state`/`barracks_state` bit layout against a real game with real building losses (E12).

---

# Open Questions

1. ~~Who owns the `STEAM_API_KEY`?~~ **Resolved** — obtained and working.
2. ~~What's the correct `broadcast_delay_s`?~~ **Resolved** — it's not a constant to guess; `stream_delay_s` comes directly from the source per game.
3. **What's the actual bar for public rollout?** "One clean TI 2026" is proposed — is that sufficient, or does this need a harder, numeric threshold (e.g., N tournaments with zero false-positive towers/kills)?
4. ~~Does `RoshanKilled` ship in v1 at all?~~ **Largely resolved** — the kill signal itself is now direct/`exact`, removing the original reliability concern. Open sub-question: is `inferred` team-attribution good enough for v1, or should Roshan ship kill-only (no team name) until attribution logic is validated?
5. **Does `ItemPurchased` earn its place in v1?** Still an open question, and arguably a *stronger* one now — the 6-slot visibility limit (no backpack/neutral) means it's both the least differentiated event type and now has a real, structural blind spot on top of the original diff-noise concern. Worth reconsidering a 3-event-type MVP (`TowerDestroyed`, `HeroKilled`, `RoshanKilled`) and treating `ItemPurchased` as a fast-follow once the 6-slot limitation's real-world impact is measured (E14 in the investigation doc).
6. **New question:** given `TowerDestroyed`/`BarracksDestroyed` now depend on an unverified bitmask decode (E12), should the true MVP ship with just `HeroKilled` + `RoshanKilled` (both already `exact` or near-`exact` with no further decode work needed), and add towers once E12 is confirmed? This would let the feed ship *before* the next live match with real building losses, rather than waiting on it.

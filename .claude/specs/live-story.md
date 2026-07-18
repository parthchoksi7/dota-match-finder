# Spectate Esports — Live Story (Tier 1) Product Specification

**Status:** Draft — Not yet in development
**Last Updated:** 2026-07-17
**Author:** Product (AI-assisted, via `.claude/pm_instructions.md`)
**Scope:** Tier 1 "Live Story" — enrich the in-progress live experience inside the Live Series Companion
**Predecessor:** `.claude/specs/live-series-companion.md` (shipped 2026-07-17). Live Story is the direct sequel: the companion answers *"what's the current score"*; Live Story answers *"what's the story, and is this worth watching right now."*

## Resolved Decisions

| # | Question | Decision | Implication |
|---|---|---|---|
| 1 | Where does the live gold history come from? | Our own append-only capture from OD `/live` snapshots. OD `/matches/{id}.radiant_gold_adv` (full per-minute) only exists *after* the 30–90 min indexing lag. | New `live_game_gold` append table; live graph is coarse (~1 point / capture) and starts from *first capture*, not min 0. Post-game graph stays complete via existing `GoldGraph`. |
| 2 | Reuse or rebuild the graph? | Reuse `GoldGraph`'s pure `computePoints()` + SVG scaffolding in a new lightweight `LiveGoldGraph`. | No new charting primitive. |
| 3 | AI "catch me up" — MVP or fast-follow? | Fast-follow (v1.1), not MVP. Ship the deterministic visual (graph + momentum read) first; layer probabilistic AI once the live pipeline is proven. | Sequences quality/hallucination risk after the data pipeline is battle-tested live. |
| 4 | Launch gating | Behind `spectate-owner` flag first, same as the companion did today, then public. | An owner-only verification window catches live-data edge cases before wide release. |
| 5 | Spoiler-free behavior | Graph values, momentum read, and AI line are all *hidden* in spoiler-free (they reveal who's winning); live draft still renders. | Consistent with the existing companion rule (draft is pre-outcome, not a spoiler). |
| 6 | New indexable routes? | None. Live telemetry is transient; the companion stays on the non-canonical `?live=<id>` param. Durable value flows into the eventual post-match `/match/:id` + AI-intelligence page, not a live URL. | No middleware/JSON-LD/sitemap/llms.txt changes for the live surface. |

---

# Feature Summary

**Live Story** upgrades the Live Series Companion's running-game section from a *snapshot scoreboard* (current gold lead, kill score, draft) into a *narrative + second-screen surface* that answers the four questions a fan actually has when they land on a live Dota game mid-flight:

1. **How did we get here?** — a live gold-advantage graph (comeback vs. wire-to-wire lead).
2. **Is this worth watching right now?** — a momentum/closeness read ("Even game, 32:00" vs. "TS commanding").
3. **What's the story so far?** — an AI "catch me up" line (1–2 sentences, spoiler-aware). *(v1.1)*
4. **How close is this to ending?** — objective/map state (towers & barracks fallen). *(v1.2)*

It is a self-contained enrichment of the existing `SeriesLivePulse` inside `LiveSeriesSheet`. It adds no new user-facing route, reuses the existing 20s poll and `findOdMatchByTime` resolver, and never touches the LOCKED VOD stream cache.

---

# User Problem

**The single biggest friction in watching pro Dota is mid-game onboarding.** Games run 35–45 minutes. A fan who tunes in at minute 28 — or who is deciding *which* of three live games to open — has zero context: who's ahead, whether it was always that way, whether it's decided, and whether it's even worth their time.

Today the companion shows a *number* (gold lead +12k). It does not answer:

- Was +12k a steady lead or a violent comeback? (the shape, not the value)
- Is +12k at 25:00 basically over, or is a Rapier/buyback swing live? (contextualizing the stat)
- What happened before I got here — a Roshan, a wipe, a rax? (the narrative)
- Of the three live games, which one is the nail-biter? (the discovery decision)

**Nobody serves this well.** STRATZ has the telemetry but no narrative or VOD; Twitch has the stream but no catch-up layer; Liquipedia/GGScore have neither. This is the defensible extension of the moat we already own (companion + timestamped VOD deep links + AI summaries).

Root-cause check: the literal request ("enrich the live experience") is a symptom. The root problem is **the cost of joining a Dota game in progress**. Live Story attacks that cost directly.

---

# Product Goals

**User goals**
- Reconstruct a live game's story in <10 seconds, without leaving the page or scrubbing a stream.
- Decide whether a live game is worth watching before committing.
- Keep our tab open as a second screen *alongside* the Twitch stream.

**Business goals**
- Increase dwell time and poll-session length on the companion (engagement proxy).
- Increase live-row → companion CTR (discovery), and companion → VOD replay CTR (existing moat).
- Deepen the "Dota intelligence platform" positioning ahead of TI season, differentiating from pure schedule/score aggregators.
- Produce telemetry (gold trajectory, momentum) that later enriches the durable post-match `/match/:id` and AI-intelligence pages — a citation asset, not just a live toy.

---

# User Personas Affected

- **The returning/casual fan (primary).** Tunes in mid-game, low mental model, needs "catch me up" + "is it over." Highest value.
- **The channel-surfer / discovery user.** Has 3 live games, wants the best one *now*. Served by momentum read (in-sheet MVP) and the future row-level "heating up" badge.
- **The hardcore fan / second-screener (secondary).** Already watching the stream; wants the data layer the broadcast doesn't overlay (gold trajectory, objective state). Served by graph + map state.
- **The spoiler-avoider.** Browsing live results but intends to watch later — fully protected by spoiler-free (all Live Story surfaces suppressed except draft).
- **Not served / out of scope:** bettors (no odds, deliberate — competitive-integrity and regulatory surface we are not entering), analysts wanting per-player granularity (future: Steam GetRealtimeStats).

---

# Detailed Requirements

Scope is split into three shippable increments. **MVP = R1 + R2.** R3 = fast-follow. R4 = should-have.

## R1 — Live Gold Graph (MVP, must-have)

- Inside `SeriesLivePulse` (running-game section of `LiveSeriesSheet`), render a compact gold-advantage graph for the currently running game.
- Data is the *live* timeseries we capture from OD `/live` (see Data Requirements), resolved to the running game via the existing `findOdMatchByTime` correlation (same guard as the pulse: both team names required).
- Reuse `GoldGraph`'s pure `computePoints()` and SVG viewBox scaffolding; a new `LiveGoldGraph` component drops the post-game event-marker fetch and the interactive hover for v1 (line + zero baseline + current-lead label only).
- Attribution: the lead sign is mapped to a **named team** using that game's `radiant_name`/`dire_name` — never the series header's team order (sides swap game to game; this is the exact bug class already fixed for the gold-lead color).
- Color convention identical to `GoldGraph`/pulse: green above the zero line (Radiant ahead), red below (Dire ahead).
- **Draft-phase state** (`game_time < 0`): no graph; show the existing draft strip only.
- **Partial-history state:** if our first capture of this game was after min 0, the graph begins where our capture began. Label the x-origin honestly ("since X: YY") rather than implying min 0. This is expected and acceptable for live (post-game graph is complete).

## R2 — Momentum / Closeness Read (MVP, must-have)

- A single deterministic, heuristic band shown above/with the graph, e.g. `EVEN · 32:00`, `TS COMMANDING`, `COMEBACK BREWING`.
- Input signals (all already captured or derivable): current `radiant_lead` magnitude, `game_time`, and the recent slope of the gold timeseries (last N snapshots). Optional later: kill-score deltas, building events.
- **Explicitly NOT a win-probability model.** v1 is qualitative bands with published thresholds (documented in code), to avoid overpromising an accuracy we can't defend vs. STRATZ. A trained model is a Future Enhancement.
- Timestamped ("as of 24:00") so it never reads as stale-but-authoritative.

## R3 — AI "Catch Me Up" Line (fast-follow, v1.1)

- 1–2 sentence, neutral, spoiler-aware narrative of the running game, generated by Claude Haiku via the existing `summarize.js` plumbing (extended for live/partial input).
- **Structured-facts-only input:** hero names (resolved, never IDs), draft, current + trajectory of gold lead, kill score, `game_time`, and any notable indicators already detected. No free-form scraping. Low temperature. Tight prompt that forbids predicting a winner and forbids inventing events not in the payload.
- **Server-cached** per `(od_match_id, game_time bucket)` (~2–3 min bucket) so cost and contradiction risk are bounded; generated **only on demand for an open sheet**, never for every `/live` game.
- Timestamped ("as of 24:00"). Hidden entirely in spoiler-free.
- Kill-switch: a server flag can disable generation instantly (returns null → UI omits the line) without a deploy.

## R4 — Objective / Map State (should-have, v1.2)

- Decode OD `/live` `building_state` (a bitmask of standing buildings) into a compact per-side readout: towers destroyed, barracks fallen (melee/ranged), "high ground threatened" / "mega creeps" flags.
- Answers "how close is this to ending" better than gold alone.
- **Gated on empirical bit-layout verification** (same rigor used to confirm `team === 0/1` for draft sides on 2026-07-16). Do not ship a decoder inferred from docs alone.
- MVP-within-R4: even just "towers: R 3 / D 6, barracks intact" is high value; full lane map can follow.

## Cross-cutting requirements

- All Live Story surfaces live **inside** the running-game section of `SeriesLivePulse`; the finished-game rows above are unchanged.
- Everything rides the existing 20s poll (`?mode=od-live-capture` nudge → pulse read). The graph history is returned in the *same* pulse payload (no second fetch). The AI line polls on a slower cadence (fetch on open + refresh on `game_time` bucket change).
- No new Vercel function file — all new reads are `?mode=` variants under `api/tournaments.js` (house pattern; 12-function cap).
- No writes to the LOCKED VOD stream cache (`cacheRunningStreams`, `live:game:` KV, `stream:match:`). The new append table is independent, exactly like `live_game_map`.

---

# UX / UI Considerations

**Placement & hierarchy** (top → bottom of the running-game block):
1. `G{n} · LIVE` header (exists).
2. Momentum read band (R2) + `as of MM:SS`.
3. Gold graph (R1), compact (~two SVG rows tall), zero baseline visible, current lead label anchored right.
4. AI catch-up line (R3), muted secondary text, italic, timestamped.
5. Score row + gold-lead badges (exists).
6. Live draft strip (exists).
7. Objective/map state (R4), compact chip row.

**States**
- *Loading:* graph shows a skeleton line; momentum read shows a neutral placeholder; never a spinner that implies error.
- *Draft phase:* draft strip only; a "Drafting" chip instead of graph/momentum.
- *Empty (no OD `/live` coverage):* the whole live block already collapses (pulse returns null). Add a gentle "Live stats unavailable — watch the broadcast" affordance with the existing Watch button, so the fan isn't dead-ended.
- *Partial history:* graph renders from first-capture with an honest x-origin label.
- *Post-game transition:* when the running game ends, the block gracefully moves into the finished-games list (existing behavior); the live graph freezes on its last value during the brief transition, never flickers to empty.
- *Spoiler-free:* graph, momentum, AI line all suppressed; draft renders; no layout hole (collapse cleanly).

**Mobile:** the sheet is `w-full` on mobile; the graph must fit the 400px sheet width and scale down without horizontal scroll. Momentum band wraps gracefully. This is the primary viewport — design mobile-first.

**Accessibility:** graph gets an `aria-label` summarizing the trend ("Gold advantage, TS +12k at 24 minutes, trending up"); momentum band is real text, not an icon-only signal; AI line is plain readable text. Respect `prefers-reduced-motion` (no animated draw-on).

**Delight, restrained:** the value here is clarity, not chrome. Resist adding motion/celebration to a live game a fan may be spoiler-sensitive about. One tasteful thing: the momentum band color-shifts with the read (neutral gray → warm when "close/late").

**Design system:** per `DESIGN_GUIDELINES.md` and the Sofascore/ESPN/HLTV bar — dense, legible, tabular-nums for numbers, uppercase micro-labels consistent with the existing pulse. Read the guidelines before touching any className.

---

# Technical Considerations

**Capture (write path).** Extend `api/_handlers/liveOdCapture.js`:
- Keep the existing upsert into `live_game_map` (identity + latest telemetry) unchanged.
- **Also** insert one row per capture into a new append-only `live_game_gold` table: `{ od_match_id, game_time, radiant_lead, radiant_score, dire_score, captured_at }`. Insert-only — never upsert (that's the whole point; upsert is what erases history today).
- Single-writer safety: the existing `capture:od-live:lock` KV lock (~110s TTL) already guarantees one writer per window, so appends never race.
- R4: also capture `building_state` (and optionally `spectators`) onto `live_game_map`.

**Read path (all new modes under `api/tournaments.js`, `Cache-Control: private, no-store`):**
- Extend `?mode=live-game-pulse` (`liveGamePulse.js`) to also return `history: [{ t, lead, rk, dk }]` for the resolved running game — query `live_game_gold` by the resolved `od_match_id`, ordered by `game_time`. One fetch feeds pulse + graph.
- New `?mode=live-catch-up&id=<psMatchId>` (R3): resolves the running game the same way, then returns a server-cached Haiku line.
- R4 fields ride the existing pulse payload.

**Resolution.** Reuse `findOdMatchByTime(shapeLiveGameMapRows(...), beginAtUnix, opponents)` exactly as the pulse does — both team names required, ±900s window. The graph/summary describe whatever game the pulse resolved, so they can never disagree with the numbers shown.

**Polling & freshness.** Graph history rides the existing 20s pulse poll (payload stays small — a 45-min game at ~110s cadence is ~24 points). AI line fetched on open + on `game_time` bucket change (~2–3 min), not every 20s. Capture cadence (~110s) is the true resolution limit of the live graph — a swing between two snapshots is invisible until the next capture; this is a known, acceptable coarseness (documented in UI via the timestamp).

**Reuse inventory:** `GoldGraph.computePoints` (pure, unit-tested), `GoldGraph` SVG constants, `summarize.js` trim + hero-name resolution + Haiku call, `fetchHeroes`, `SeriesScoreRow`, `findOdMatchByTime`, `shapeLiveGameMapRows`, `trackEvent`.

**No new function file** (Vercel 12-function cap): all reads are `?mode=` multiplexed. Follow the house `?mode=` pattern already used by `live-game-pulse` / `live-series-games` / `od-live-capture`.

**Isolation guarantee:** the new `live_game_gold` table and the `building_state` field are display-only, read via `service_role`, and independent of the LOCKED VOD cache. `.claude/claude_instructions_template.md`'s VOD-lock section is not in play here — but the reviewer must confirm no capture change accidentally touches `live:game:` / `stream:match:`.

---

# Data Requirements

| Data | Source | Freshness | Reliability / Notes |
|---|---|---|---|
| Live gold timeseries | New `live_game_gold` append table, from OD `/live` snapshots | ~110s cadence, live | Coarse; starts at first capture, not min 0. Independent of VOD cache. |
| Current gold lead / kills / draft / game_time | Existing `live_game_map` (unchanged) | ~110s | Already in production via the companion. |
| Hero names | OD `/heroes`, KV-cached 7d (existing) | Static | Reused by summary + draft strips. |
| Building state (R4) | OD `/live` `building_state` bitmask (new capture) | ~110s | Bit layout must be empirically verified before shipping. |
| Spectator count (R4/future) | OD `/live` `spectators` (new capture) | ~110s | Nice-to-have hype signal. |
| AI catch-up line (R3) | Claude Haiku via `summarize.js`, server-cached | ~2–3 min bucket | Structured-facts-only input; kill-switch flag. |
| Full per-minute gold (post-game) | OD `/matches/{id}.radiant_gold_adv` | 30–90 min lag | NOT used live; powers the complete post-game `GoldGraph` only. |

**Retention:** `live_game_gold` is only useful during and shortly after a live game — prune aggressively (recommend >48h, vs. `live_game_map`'s 30d), to bound growth of a high-insert-rate table. Insert index on `(od_match_id, game_time)`.

**Provider reliability posture (per `pm_instructions` §4):** assume OD `/live` is unreliable. Not every tier-1 game appears in `/live` (VOD system is Twitch-anchored; some broadcasts are YouTube-only, and OD `/live` coverage is independent of that). Every Live Story surface must degrade to "unavailable, watch the broadcast" — never a broken/empty component, never a blocking spinner.

---

# Edge Cases

- **Draft phase (`game_time < 0`):** no gold yet → suppress graph/momentum, show draft only.
- **Pauses / technical timeouts:** `game_time` freezes, gold flat → graph plateaus. Don't let the momentum read misinterpret a paused plateau as "stable game"; detect flat `game_time` across snapshots and label "Paused" if possible.
- **Reconnects / game drops from `/live`:** snapshot gaps → graph gaps. Render as a gap or thin interpolation; never crash; freeze last-known on total loss.
- **OD `/live` doesn't carry the game at all:** pulse already returns null → whole live block collapses. Add the "watch the broadcast" fallback so the fan isn't dead-ended.
- **Wrong-game correlation:** `findOdMatchByTime` could bind an unrelated game → guarded by mandatory both-team-names (already enforced). Graph/summary inherit the same resolved id, so they can't disagree with the numbers.
- **Sides swap between games:** timeseries is per-`od_match_id` (per game) → correct; attribution uses that game's `radiant_name`/`dire_name`, not series header order.
- **Series concludes with sheet left open:** running game → null; game moves to finished list; live graph freezes then unmounts cleanly; sheet never auto-closes (existing rule).
- **Partial/late first capture:** graph starts mid-game → honest x-origin label; do not imply min 0.
- **AI line staleness/contradiction:** short cache bucket (~2–3 min) + timestamp; prompt forbids winner prediction so a swing can't make it "wrong," only "as-of."
- **AI hallucination on sparse early data:** structured-only input + low temp + "only describe events present in payload"; kill-switch.
- **Multi-tab:** many tabs poll → capture throttled by KV lock; append single-writer; reads are idempotent. No divergence.
- **Spoiler-free toggle mid-session:** all Live Story surfaces must react immediately to the flag (suppress graph/momentum/AI), draft persists.
- **Timezone/clock:** all live times are `game_time` (in-game seconds), not wall-clock → no timezone surface. The "as of" label uses `game_time`, not local time.
- **Capture-cadence undersampling:** a rax/wipe between two snapshots is invisible until the next capture → acceptable; the timestamp sets expectation. Do not claim real-time.
- **`building_state` bit ambiguity (R4):** if decode confidence is low for a given payload, omit the map chip rather than show a wrong "mega creeps."

---

# Analytics & Tracking

**New GA4 events** (`trackEvent`):
- `live_story_view` — companion opened with a running game present (fires once per open).
- `live_graph_render` — live graph successfully rendered (with `points` count, `partial_history` bool).
- `live_momentum_shown` — momentum band displayed (with `band` value).
- `live_catch_up_view` — AI line displayed to user (R3).
- `live_catch_up_generated` — server-side generation occurred (cache miss) vs. served-from-cache (measures cost).
- `live_map_state_shown` — objective chips rendered (R4).
- `live_unavailable_fallback` — "watch the broadcast" fallback shown (measures OD `/live` coverage gaps).

**KPIs / success metrics:**
- Median companion dwell time and poll-count per open (primary engagement proxy) — target a lift vs. pre-Live-Story baseline.
- % of live opens that stay >60s.
- Live-row → companion CTR (rises further once the future row "heating up" badge ships).
- Companion → VOD replay CTR (moat metric — should hold or rise).
- AI catch-up read-rate and generate-vs-cache ratio (quality + cost).

**Failure metrics:** `live_unavailable_fallback` rate (coverage), AI kill-switch activations, graph render errors.

**Observability:** the capture already logs counts; add a log line for `live_game_gold` insert count per run and AI generate latency/cost. Per `project_vercel_plan` memory, monitoring stays in-app (no Vercel Log Drains on the free plan).

---

# QA Scenarios

**Happy paths**
- Open companion on a 25:00 running game with a lead → graph shows trajectory, momentum reads correctly, numbers match pulse.
- Comeback game (lead crossed zero) → graph visibly crosses the baseline; momentum reads "comeback."
- Draft phase → draft only, no graph, no error.

**Failure paths**
- OD `/live` omits the game → clean "watch the broadcast" fallback, no broken component.
- Supabase read error → block collapses, pulse still degrades gracefully.
- AI generation fails/times out → line omitted, rest of sheet intact.
- AI kill-switch on → no line, no layout hole.

**Correctness / regression**
- Sides swapped across games of a BO3 → each game's graph attributes the lead to the right named team.
- Spoiler-free ON → graph/momentum/AI hidden, draft shown; toggling live flips instantly.
- Finished-game rows and tap-through-to-drawer unchanged (regression guard on the companion).
- No write path touches `live:game:` / `stream:match:` / `cacheRunningStreams` (VOD-lock regression).

**Performance / real-time**
- 20s poll payload with `history` stays small (<~2KB for a 45-min game).
- Multi-tab: capture lock holds to one OD fetch per window; append count == expected.
- Mobile 400px sheet: graph fits, no horizontal scroll (real device viewport per `feedback_deployment_checklist`).

**Cross-browser:** SVG graph renders identically Chrome/Safari/Firefox; `prefers-reduced-motion` honored.

---

# Risks & Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| OD `/live` coverage gaps (not all tier-1 games) | High | Graceful "watch the broadcast" fallback; never block; instrument `live_unavailable_fallback`. |
| AI hallucination / quality on partial live data (R3) | High | Structured-only input, low temp, winner-prediction forbidden, server cache, kill-switch, owner-flag launch. |
| `building_state` decode incorrectness (R4) | Medium | Empirical bit-mapping verification gate before ship; omit-on-low-confidence. |
| `live_game_gold` table growth (high insert rate) | Medium | 48h prune, tight index, insert-only (no read-modify-write). |
| Capture cadence (~110s) undersamples swings | Low | Documented coarseness + "as of" timestamp; never claim real-time. |
| Cost of AI generation at scale | Low | On-demand-for-open-sheets only + cache bucket + Haiku (cheap). |
| Accidental coupling to the LOCKED VOD cache | High if it happens | Independent table; mandatory reviewer check; covered by regression QA. |

**Dependencies:** OD `/live` (capture), Supabase (`live_game_gold`), Claude Haiku (R3), the existing companion + `findOdMatchByTime` resolver, `GoldGraph` reuse. No new third-party dependency introduced.

---

# MVP Recommendation

**Ship R1 + R2 as Live Story v1**, behind the `spectate-owner` flag first, then public — mirroring exactly how the companion launched today (owner window catches live-data edge cases, then wide release).

Rationale: R1+R2 are fully self-contained inside the existing companion sheet, reuse `GoldGraph` + the existing poll + resolver, and require only **one** new backend primitive (the `live_game_gold` append table + one extra insert in the existing capture). They deliver the deterministic core of the "catch me up / second screen" value with the lowest risk. R3 (AI) and R4 (map state) layer on top once the live data pipeline is proven, sequencing the probabilistic/uncertain work *after* the deterministic foundation.

**Explicitly out of MVP:** AI line (v1.1), objective/map state (v1.2), the row-level "heating up" badge (needs a live-telemetry join into `live-matches.js` — separate spec), win-probability model, per-player net worth.

---

# Future Enhancements

- **Row-level "heating up" / "close game" badge** on `LiveMatchRow` — the discovery play; needs live telemetry joined into `live-matches.js` (the row today only has PandaScore series data). Highest-leverage next step after v1.
- **Trained live win-probability** (STRATZ parity) — replace the qualitative momentum bands with a real model once we have enough labeled live→final data.
- **Per-player net worth bars** via Steam `GetRealtimeStats` using the `server_steam_id` already stored (schema calls this "Phase 2b").
- **Notable-event markers on the live graph** — reuse the existing indicator detection (Roshan/Rampage/Rapier/teamfight) as live markers, as `GoldGraph` already does post-game.
- **Roshan / Aegis timers** — inferred, harder (not directly in `/live`); investigate feasibility.
- **Public live pick'em** — the pre-match prediction poll is owner-only today; a public live "who wins?" is a retention hook (separate spec).
- **Spectator-count hype signal** and **stakes framing** ("elimination game") — small, high-flavor adds.
- **Feed live telemetry into the durable post-match `/match/:id` + AI-intelligence page** — the citation-asset play (ties into `ai-match-intelligence-spec.md`).

---

# Suggested Engineering Approach

*High-level direction only — not implementation.*

1. **DB:** add `scripts/create-live-game-gold.sql` — append-only table + `service_role` grants (mirror `live_game_map`'s grant + sequence-grant pattern) + `(od_match_id, game_time)` index + a prune comment (48h). Run once in Supabase SQL editor.
2. **Capture:** in `liveOdCapture.js`, after the existing `live_game_map` upsert, `insert` one `live_game_gold` row per running game per run (guard on `game_time != null`). R4: add `building_state` (+`spectators`) to the `live_game_map` upsert payload and schema.
3. **Read:** extend `liveGamePulse.js` to also query `live_game_gold` for the resolved `od_match_id` and return `history` in the pulse payload. R3: add `?mode=live-catch-up` handler that resolves the running game, then calls a live variant of the `summarize.js` path (server-cached per `(od_match_id, game_time bucket)`, kill-switch flag).
4. **Frontend:** new `LiveGoldGraph` reusing `GoldGraph.computePoints` + SVG constants (line + baseline + label; no hover/markers v1). New momentum-read helper (pure, unit-testable, published thresholds). Wire both into `SeriesLivePulse` above the score row; gate all by `spoilerFree`. R3: fetch + render the AI line on open / game_time-bucket change.
5. **Tests:** unit-test the momentum-band function and the `building_state` decoder (R4) as pure functions (house pattern — `computePoints`, `mapLiveGamesToRows`, `formatGoldMagnitude` are all already unit-tested). Snapshot the empty/draft/partial states.
6. **Docs:** update `CONTEXT.md` (Live Series Companion section → note Live Story additions, new table, new modes), and per `.claude/pending-refactors.md` conventions log any deferred cleanup.

---

# AI + Search Discoverability

Per `.claude/ai_discoverability.md`:

- **New public route?** No. Live Story lives inside the companion on the non-canonical `?live=<id>` param. No middleware handler or JSON-LD needed. (A live, mid-flight game is deliberately kept out of the index — consistent with the non-Tier-1 noindex posture; live scores are transient, not citable facts.)
- **New entity type?** No. It enriches the existing *match/series* entity while it's live.
- **Bare-HTML crawler visibility?** None expected or desired — this is JS-gated, transient, real-time data. Nothing goes in the server-rendered root div for the live surface.
- **`public/llms.txt` / `llms-full.txt` updates?** None. The new `?mode=` reads are `private, no-store` live endpoints (like `live-game-pulse`) — **not** added to the Machine-Readable Endpoints section; they are not for LLM consumption.
- **New API modes?** Yes (`live-catch-up`; `history` field on `live-game-pulse`) — but private/no-store, so no discoverability surface.
- **Knowledge-graph relationship?** Not directly for the live surface. **The durable win:** the captured gold trajectory + momentum can later enrich the evergreen post-match `/match/:id` and the AI-intelligence page, which *are* citation targets — that's where this data becomes discoverable, not live.
- **Long-term citation target?** Not the live surface itself; yes for the downstream post-match artifacts it feeds.

---

# Open Questions

1. **Capture cadence:** is ~110s live-graph resolution acceptable, or do we tighten the lock TTL for games with an open sheet (better graph, more OD load)? *(Recommend: accept 110s for v1; revisit if users complain the graph feels laggy.)*
2. **AI launch gating:** owner-flag first for R3, same as the companion? *(Recommend: yes.)*
3. **`building_state` investment:** commit to the empirical bit-mapping session now (R4 in this effort) or defer to a later spec? *(Recommend: defer to v1.2; keep MVP focused.)*
4. **Momentum read:** ship heuristic bands only, or is a real win-prob model in scope soon? *(Recommend: bands now; model is a Future Enhancement.)*
5. **Retention window** for `live_game_gold`: 48h vs. longer if we want to reuse it post-game before OD indexes? *(Recommend: 48h; post-game uses complete OD `radiant_gold_adv`.)*
6. **Partial-history labeling:** exact copy for the "graph starts mid-game" x-origin — needs a design pass so it reads as honest, not broken.

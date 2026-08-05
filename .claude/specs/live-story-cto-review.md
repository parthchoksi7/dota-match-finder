# CTO Review — Live Story Event Feed

**Reviewing:** `.claude/specs/live-story-product-spec.md`, `.claude/specs/live-ingestion-investigation.md`, `.claude/specs/live-event-feed-mvp-spec.md`
**Date:** 2026-08-05
**Verdict up front: the data-source finding is real and good. The free-tier operating model around it has one claim that doesn't survive contact with the actual account state, and one architectural detail that needs to be pinned down before anyone writes code. Neither is fatal. Both are fixable in under a day. Fix them before TI, not during it.**

---

> **⚠️ Corrected 2026-08-05, same day, after re-reading `liveGamePulse.js`/`liveOdCapture.js`.** Gaps 1 and 2 below were both written on the assumption that Live Story would need its own QStash schedule. **It doesn't.** The codebase already implements viewer-driven capture with a KV lock as the rate limiter — see the "Correction" section at the end of this document, which supersedes Gap 2 entirely and re-frames Gap 1. Gaps 3–6 are unaffected and stand as written.

## Gap 1 (re-framed — see Correction): "fixed 10s poll" is not achievable with the described trigger mechanism

Every document in this chain — investigation §4.1, §7.1, §8; the product spec's Detailed Requirements #3 — states the poll cadence as "fixed 10s, ~9% of the 100k/day Steam quota." The 9%-of-quota math is correct. What's missing is *what actually fires the poll every 10 seconds.*

The stated trigger is "the existing dual trigger: client ambient poll (free) + QStash `*/1` backstop for no-user windows" (investigation §7.1, component 9). Two problems with that sentence:

1. **QStash cron syntax has no sub-minute resolution.** `*/1 * * * *` is once per minute, not once per 10 seconds. QStash cannot deliver a 10s backstop at all — the fastest QStash can trigger this ingestion is 60s. That's fine as a *backstop* (matches the existing `od-live-capture` pattern), but it means the "no-user window" cadence is 60s, not 10s, and nothing in these docs says that explicitly.
2. **The client ambient poll that's supposed to cover the gap runs at 40s today.** `SeriesLivePulse.jsx` self-polls every 40s (CONTEXT.md, Live Series Companion section, widened from 20s on 2026-08-02 — deliberately, to reduce load). Nothing in the Live Story spec proposes changing that, and changing it back down conflicts with the exact decision that widened it. If Live Story's client-side poll rides the existing 40s cycle, the *achievable* cadence with a user actively watching is 40s, not 10s — call it what it is.

None of this breaks the architecture — a differ that runs every 40-60s instead of every 10s is still well inside Steam's quota and still answers "what just happened" fast enough for a second-screen viewer (nobody notices a Roshan kill logged 35s late instead of 5s late). But **the spoiler-delay-gate math implicitly assumes the freshest possible snapshot**, and a looser poll interval means events can sit un-ingested for up to a full cadence window before the delay gate even starts counting against them. Not dangerous, but the actual number should be written down and tested against, not asserted as 10s when nothing in the trigger design delivers 10s.

**Fix:** either (a) state the real cadence as 40-60s and re-derive the "definition of done" false-positive testing against that interval, or (b) if 10s is actually required for the product bet, add a dedicated fast client-side poll specific to Live Story (decoupled from `SeriesLivePulse`'s 40s cycle) — which is fine for cost (client reads hit a shared KV-cached snapshot, not a fresh Steam call per client, so this doesn't multiply Steam API usage) but needs to be named as a new thing, not implied to already exist.

---

## Gap 2 (real, blocking): the QStash backstop as designed does not fit in the remaining free-tier budget

`scripts/setup-qstash-schedules.mjs` already runs 5 schedules totaling **864 of the free plan's 1,000 messages/day** (the script's own comment does this math: `4 × 4/hr + 1 × 20/hr = 864/day`). That's 86% of the daily message budget already spent, on capability that predates this feature.

Adding a 6th schedule as this feature's backstop, at the same `*/15` cadence as four of the existing five, adds another 96 messages/day → **960/1,000, a 4% margin.** That's *technically* within budget, but:

- It leaves no room for any other future schedule (push, warm-streams enhancements, anything) without a QStash Pro upgrade.
- If the backstop is instead specified at a faster cadence to compensate for Gap 1's coverage gap during no-user windows (say `*/5`), that's 288/day, pushing total to **1,152/day — over the free cap**, and QStash will start dropping or rejecting schedule invocations, silently degrading the *existing* five schedules' reliability, not just the new one. That is exactly the class of failure `project_gha_cron_throttling` already burned this project on once (crons firing unreliably), just on a different provider.

**Fix:** if a QStash backstop is added, it must be `*/15` or slower, and the 960/1,000 number needs to be written down as the new operating ceiling before anyone adds a 7th schedule for anything else, ever. This is a one-line addition to `setup-qstash-schedules.mjs`'s existing budget comment, not a redesign — but it has to actually be added, because right now none of the three specs mention QStash message budget at all.

---

## Gap 3 (non-blocking, but confirm before writing code): the new handler must not become a 13th Vercel function

`api/` currently has exactly **12 top-level (non-underscore) files** — `analytics-chat.js`, `draft-posts.js`, `live-matches.js`, `match-streams.js`, `news.js`, `og.js`, `pipeline.js`, `sitemap.js`, `summarize.js`, `tournament-detail.js`, `tournaments.js`, `upcoming-matches.js` — which is **the Hobby plan's function ceiling, already maxed, already documented as a live constraint** in CONTEXT.md for the tournament-hub and calendar features ("merged to stay within 12-function Vercel limit").

The investigation doc's own diagram names the new component `api/_handlers/liveEventCapture.js` (§7.1) — correctly underscore-prefixed, meaning it's meant to be *imported by* one of the 12 existing top-level files (most naturally a new `?mode=` branch on `api/tournaments.js`, matching every other recent addition — calendar, watchability, tournament-heroes all did this). That's the right call and it's already implied correctly. Flagging it explicitly here only because it's a one-character mistake (a stray top-level file instead of an `_handlers/` one) away from breaking the deploy outright, and nothing in the product spec's Suggested Engineering Approach says "add a `?mode=` branch, do not add a 13th file" in so many words.

---

## Gap 4 (real, needs a number attached): Supabase 500MB headroom is unknown, not "~6 weeks"

Investigation §4.4 estimates the free tier fills in ~6 weeks *of Live Story's own writes alone*, assuming an empty database. It isn't empty: `live_game_map`, `live_game_gold`, `match_stream_history`, and (as of 2026-08-03) `push_subscriptions` all already write to this same 500MB budget, and none of their current sizes are stated anywhere in these three documents. "~6 weeks" is a number for a database that doesn't exist. **Before this ships, run `SELECT pg_total_relation_size(...)` (or the Supabase dashboard's storage panel) on the existing tables and subtract from 500MB to get the real remaining budget** — it could be 6 weeks, it could be 6 days, nobody currently knows. The mitigation list (tier-1 filter, 90-day retention, no raw snapshots) is the right list regardless of the number, but "ship the retention policy with the MVP, not after" (§9.1) needs to be enforced as a hard launch blocker, not a recommendation, given the actual headroom is unverified.

---

## Gap 5 (already correctly identified in the docs — restating because it's the one that can't slip): E12

Both the investigation doc and the product spec already flag `tower_state`/`barracks_state` bit-layout decoding as unresolved and blocking for `TowerDestroyed`/`BarracksDestroyed` at `exact` confidence. Agreeing with that call, not finding a new gap — but attaching the TI deadline math explicitly: **TI 2026 Day 1 is 2026-08-13, 8 days from this review.** If E12 isn't closed by then, the correct move is to ship the MVP publicly-owner-gated-only with `TowerDestroyed` labeled `uncertain` through TI, not to rush a decode under tournament pressure and risk shipping a wrong "exact" tower call live, during the single highest-traffic week of the year, to the one person (the owner) who's supposed to be the safety net for exactly this kind of error. Don't let calendar pressure become an excuse to skip the cross-check against OpenDota's `objectives[]` that both docs already call for.

---

## Gap 6 (minor, worth naming): no Log Drains means the differ is a black box mid-incident

`project_vercel_plan` already establishes Log Drains are unavailable on the free plan and monitoring must be in-app only — investigation §5.4 already designs for this (call counter, per-game poll-age, event-emission-rate canary). One thing missing from that list: **if the differ produces a wrong event during TI and the owner needs to know *why* (which snapshot pair produced it), there's currently no proposed surface for inspecting raw before/after snapshots after the fact** — only aggregate health metrics. Recommend the `?mode=monitor` extension also expose the last N raw snapshot-pairs for whichever games are currently live (small, bounded, KV-cached — cheap), so a wrong call during the TI validation window can be root-caused from the admin surface instead of requiring a redeploy with ad-hoc logging.

---

## What's NOT a gap — pushing back on over-caution

- **The $0/mo claim holds.** Steam Web API quota, Vercel, Supabase compute, and Upstash are all genuinely unaffected by this feature at MVP scale, once Gaps 2 and 4 are quantified rather than assumed.
- **Not replacing PandaScore is the right call**, and the licensing/stream-URL argument in §9.3 is sound — don't relitigate this.
- **Rejecting Tier 3 (GC/GOTV) is correct** — no public prior art, real ban risk, disproportionate effort. Nothing here changes that.

---

---

# Correction (2026-08-05, same day) — two owner challenges, both correct

## A. No new QStash schedule is needed. Gap 2 is void.

Gap 2 assumed Live Story needs its own schedule. It doesn't — the codebase already implements **viewer-driven capture with a KV lock as the rate limiter**, which is the adaptive cadence the specs claimed was unnecessary:

1. `SeriesLivePulse.jsx` polls `?mode=live-game-pulse` every 40s while a fan has the sheet open.
2. On a pulse-cache miss (15s TTL), [liveGamePulse.js:203](api/_handlers/liveGamePulse.js#L203) calls `captureOdLiveOnce()` server-side.
3. That takes `capture:od-live:lock` with `nx:true, ex:60` — **at most one upstream fetch per 60s regardless of viewer count.** [liveOdCapture.js:47](api/_handlers/liveOdCapture.js#L47): *"the TTL IS the cadence whenever a caller polls faster than it."*
4. QStash `od-live-capture */15` is only a no-user backstop.

Live Story fits this better than the OD path does: `GetLiveLeagueGames` is a single global call with **no per-series correlation work on read**. Give it its own lock; because it runs at ~9% of quota even continuously, its TTL can be **shorter than 60s** (20–30s is free). The binding constraint becomes the 40s client poll, which was deliberately widened for CPU budget and should not be touched.

**QStash stays at 864/1000. Gap 1's cadence answer: ~40s with a viewer, 15 min without.**

**The one real asymmetry to note:** a no-viewer gap is cosmetic for gold history (a hole in a line) but **permanent for events** — the differ needs consecutive snapshots and there is no backfill endpoint, so an unwatched Roshan kill is lost, not delayed. At owner-gated MVP the only consumer *is* a viewer, so this is deferrable to public graduation.

### A2. Rejected variant: dynamic QStash tiering (1 min with a user / 2 min live / 15 min idle)

Proposed and rejected for three reasons, recorded so it isn't re-proposed:

1. **QStash crons are static.** Re-provisioning a schedule at runtime is stateful, racy under concurrent invocations, and can strand the system on the fast tier if a flip fails.
2. **The budget doesn't allow it.** Free tier 1000/day, 864 already committed → **136/day remaining**. 1 min = 1,440/day; 2 min = 720/day; 15 min = 96/day. A TI day with ~12h live costs 408/day (2-min tier) or 768/day (1-min tier) → 1,272 or 1,632 total. Both exceed the cap *during TI*, risking drops on stream-capture / warm-streams / push-scan.
3. **A 2-minute poll produces unusable event resolution.** The differ reads consecutive snapshots, so a 2-min interval yields the net delta over two minutes — kills 10→14 with no way to tell one teamfight from four scattered kills, and no per-event game time. Poll interval *is* event resolution. There is no useful middle tier: either a viewer is present (good resolution) or nobody is (accept the gap).

**Adopted instead — the same three tiers, with presence rather than cron expressing them:**

| Situation | Trigger | Effective cadence | New QStash cost |
|---|---|---|---|
| Live game + user on site | client 40s poll → KV lock TTL | ~30–40s | 0 |
| Live game, no user | existing `od-live-capture */15` | 15 min | 0 |
| No live game | same schedule, handler no-ops after one cheap check | 15 min | 0 |

Implementation: **fold the `GetLiveLeagueGames` poll into the existing `od-live-capture` handler** rather than adding a 6th schedule. QStash stays at 864/1000.

## B. Single-source the data. The new API is a strict superset — with three caveats the docs get wrong.

Verified directly against `__tests__/fixtures/get-live-league-games/`. Everything the live sheet renders today from OpenDota is in `GetLiveLeagueGames`, several fields better:

| Live surface today (OD `/live`) | `GetLiveLeagueGames` |
|---|---|
| Kill score | `scoreboard.{radiant,dire}.score` |
| Net-worth lead | per-player `net_worth` — **better than OD's single aggregate** |
| Game clock | `scoreboard.duration` |
| Live draft | `picks[]` + `players[].hero_id` |
| Live player IGNs | **`game.players[].name`** — present, contrary to an earlier read |
| Tower state | `tower_state` **+ `barracks_state`**, per team — `api/_buildingState.js` cannot resolve barracks at all |
| Gold history | rebuildable from snapshots |
| *(none today)* | `roshan_respawn_timer`, per-player KDA/CS/GPM/XPM/items/levels/positions, `stream_delay_s`, `series_type`, series wins |

Single-sourcing removes the two-clocks problem, the duelling tower bitmasks, and the PS↔OD correlation dependency on the live display path — the three worst findings in the UX spec.

**Corrections to the investigation doc, measured from the fixtures:**
- **`radiant_team.team_name` is present on only 20/40 games**, not universally. The byte-identical match was validated on one game and generalised. PandaScore remains the display-name source (already the rule — `resolveRadiantSide` never renders OD names); Valve names are for correlation only.
- **`stream_delay_s` takes four values in a single poll: `[10, 120, 300, 900]`**, not the two documented. 10s is effectively real-time; 900s is 15 minutes. The UX spec's ≥600s suppression rule applies to real tournaments.
- **`scoreboard` is present on 37/40**, not the documented 39/40.
- **Two team encodings coexist in one response:** `game.players[].team` is `0/1/2` (2 = caster; 12 entries, not 10), while the `live_events` schema specs `check (team in (2,3))` as "2=Radiant, 3=Dire". Mixing them maps Radiant onto a broadcaster slot.

**Sequencing — agree with the principle, stage the execution:**
1. **Now:** build Live Story single-sourced. It must never read OpenDota.
2. **After TI, after E12 closes:** migrate score/draft/net-worth/minimap to the same source, retiring the divergence.
3. **Do not migrate the minimap before E12.** It is public and working off OD today; repointing it at the unverified `tower_state` decode trades a working public surface for an unverified one, 8 days before TI.
4. **`live_game_map` capture stays regardless.** It is one of two independent OD-match-id capture sources feeding the **LOCKED VOD replay system**. `GetLiveLeagueGames` returns `match_id` in the same ID space and could eventually be a better source — but that is a locked-subsystem change requiring explicit owner approval per `CLAUDE.md`.

---

## Recommendation

**Build.** The mechanism is validated, the cost model is sound once two numbers get attached to it (QStash headroom, Supabase headroom), and the risk list is already unusually honest for a spec at this stage. **Before writing code:** (1) pick and document the real poll cadence given QStash's 60s floor and the existing 40s client poll, (2) add the QStash message-budget line to `setup-qstash-schedules.mjs`'s existing comment before adding a 6th schedule, (3) run the Supabase storage query to get a real headroom number instead of the "~6 weeks from empty" estimate. None of these change the architecture. All three are the difference between a plan that looks done and a plan that's actually accountable to the free-tier constraints it claims to respect.

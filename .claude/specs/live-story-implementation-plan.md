# Live Story (Tier 1) — Implementation Plan

**Status:** Ready for build — MVP scope
**Last Updated:** 2026-07-17
**Spec:** `.claude/specs/live-story.md` (read it first, incl. the "Pressure-Test Revisions" block, which this plan implements)
**Scope of this plan:** **MVP = R1 (live net-worth graph) + R2 (momentum read + series stakes).** R3 (AI catch-up) and R4 (objective state) are deferred and out of this plan.

---

## Guiding constraints (from the pressure test)

1. **Prove the data pipeline before any UI.** Ship capture + verify rows accrue on a real live game before writing a pixel.
2. **Never touch the LOCKED VOD cache** (`cacheRunningStreams`, `live:game:` KV, `stream:match:`). The new table + capture path are additive and independent, exactly like `live_game_map`.
3. **No new Vercel function** — all reads stay `?mode=` multiplexed under `api/tournaments.js` (12-function cap).
4. **Every surface degrades gracefully** — OD `/live` gaps → "watch the broadcast", never a broken/empty component.
5. **Admin/owner-only for the whole verification window**, then public — mirror the companion's launch (2026-07-17). The gate is the existing `spectate-owner` owner flag (`isOwner` in `src/App.jsx`), not the `/admin/*` token pages (those are the editorial pipeline). Phase A is silent backend capture of public OD `/live` data — nothing user-facing to gate; the owner gate lands on the read/UI (Phase B/C). Decision for Phase B: also gate the new `history` field so it's returned only to owners during the window (pass an owner signal from the client), so the not-yet-launched data isn't served publicly via the API even though no UI renders it yet.
6. **Momentum is inference, facts are facts** — net-worth graph/score = primary weight; momentum/stakes = secondary. Never let inference read as fact.

---

## Phase A — Data pipeline (ship silently, no UI)

**Goal:** `live_game_gold` accretes one net-worth point per capture per live game.

**A1. New table** — `scripts/create-live-game-gold.sql` (run once in Supabase SQL editor)
```
create table if not exists live_game_gold (
  id           bigserial primary key,
  od_match_id  bigint  not null,
  game_time    integer not null,          -- in-game seconds; x-axis
  radiant_lead integer,                   -- net-worth diff (radiant positive)
  radiant_score integer,                  -- kills, for slope/context
  dire_score    integer,
  captured_at  timestamptz not null default now(),
  constraint live_game_gold_uniq unique (od_match_id, game_time)  -- dedup + pause-safe
);
create index if not exists idx_lgg_match on live_game_gold (od_match_id, game_time);
grant select, insert, update, delete on public.live_game_gold to service_role;
grant usage, select on sequence live_game_gold_id_seq to service_role;
-- Retention: prune aggressively — only useful live + shortly after.
--   delete from live_game_gold where captured_at < now() - interval '48 hours';
```
- Mirror `live_game_map`'s explicit grant + **sequence grant** (the silent 42501 trap documented in `create-live-game-map.sql`).

**A2. Capture append** — `api/_handlers/liveOdCapture.js`
- After the existing `live_game_map` upsert, build gold rows from the same `mapLiveGamesToRows` output: `{ od_match_id, game_time, radiant_lead, radiant_score, dire_score }` for every game with `game_time != null`.
- `insert(...).onConflict('od_match_id,game_time').ignoreDuplicates()` (or Supabase `upsert(..., { onConflict: 'od_match_id,game_time', ignoreDuplicates: true })`). Insert-only — **never** overwrite (history is the point).
- Keep it inside the existing lock-guarded run (single-writer). Log the insert count alongside the existing capture log.
- **Do not** change the `live_game_map` upsert.

**Acceptance:** open a live tier-1 game in prod (or run `?mode=od-live-capture` a few times), then `select count(*), min(game_time), max(game_time) from live_game_gold where od_match_id = <id>` shows an increasing series. No effect on the companion.

**Rollback:** drop the insert (capture reverts to today); table is inert.

---

## Phase B — Read API (extend the existing pulse)

**Goal:** the existing 20s pulse poll returns the graph history too, cached for concurrency.

**B1. History in the pulse payload** — `api/_handlers/liveGamePulse.js`
- After resolving `od_match_id` (unchanged `findOdMatchByTime` path), query `live_game_gold` where `od_match_id = hit.match_id` order by `game_time asc`.
- Server-side: dedup by `game_time` (keep max `captured_at`), filter `game_time >= 0 && radiant_lead != null`, cap to a sane max (e.g. last 60 points).
- Return `history: [{ t, lead, rk, dk }]` **inside** the existing `pulse` object → `fetchLiveGamePulse` in `src/api.js` needs **no change** (it already returns `data.pulse`).

**B2. Concurrency cache** — wrap the whole resolved pulse (incl. history) in a ~12–15s KV cache keyed by `psMatchId`.
- The correlation + two Supabase reads currently run uncached per client per poll; this collapses N viewers → ~1 resolve/window.
- Keep the client `Cache-Control: private, no-store` (this is our own KV, not a browser/CDN cache).
- Cache the `{ pulse: null }` result too (short TTL) so "no live game" doesn't hammer the resolver.

**Acceptance:** `GET /api/tournaments?mode=live-game-pulse&id=<psId>` returns `pulse.history` with an increasing `t` series; a second immediate call is served from KV (log/inspect).

**Rollback:** stop returning `history` (client simply renders no graph); remove the cache wrapper.

---

## Phase C — Frontend (behind `spectate-owner`)

**Goal:** graph + momentum + stakes render inside the running-game block; spoiler-safe; no flicker.

**C1. Pure momentum helper** — `src/utils/momentum.js` (new, unit-tested)
```
// state, not fate — game-time-relative, net-worth-aware
computeMomentum({ radiantLead, gameTime, radiantName, direName }) -> {
  band: 'EVEN' | 'AHEAD' | 'FAR_AHEAD',
  leaderName: string | null,   // named team, from radiant/dire name by lead sign
  leadColor: string,           // green Radiant / red Dire (GoldGraph convention)
}
// thresholds widen with gameTime: FAR_AHEAD requires lead > f(gameTime),
// where f grows over the game (e.g. ~8k early tapering expectation later).
// Documented, conservative, no predictive language.

// series stakes — free from PS data already on `match`
computeStakes({ seriesScore, winsRequired }) -> {
  kind: 'DECIDER' | 'MATCH_POINT' | null, leaderName?: string
}
```
- Both pure → straightforward unit tests (house pattern: `computePoints`, `formatGoldMagnitude`, `mapLiveGamesToRows` are all unit-tested).

**C2. Live graph** — `src/components/LiveGoldGraph.jsx` (new)
- Reuse `GoldGraph`'s exported pure `computePoints()` + viewBox constants. v1 = line + zero baseline + right-anchored current-lead label. **No** hover, **no** event markers (those are R3/R4).
- Attribute lead to the named team via `radiant_name`/`dire_name` of the resolved game — never series header order.
- `aria-label` summarizing trend (e.g., "Net worth: TS +12k at 24 min, trending up"). Respect `prefers-reduced-motion` (no draw-on animation).
- Empty/1-point/partial states: render nothing (draft) or a from-first-capture line with an honest x-origin.

**C3. Wire into the pulse** — `src/components/SeriesLivePulse.jsx`
- **Retain-last-known fix (required):** stop clearing on null polls. Keep the last non-null `pulse` in state; only the parent unmounting the block (genuine game-end, driven by the ambient feed) removes it. Prevents the graph/section flicker on a transient failed poll.
- Render order (top→bottom): stakes chip (if any) → momentum band + `as of MM:SS` → `LiveGoldGraph` → existing score row + lead badges → existing live draft strip.
- **Spoiler-free:** graph, momentum, stakes all suppressed (they reveal who's winning); draft still renders — unchanged rule. Collapse cleanly, no layout hole.
- Label the metric **NET WORTH** (not "gold") in this live surface.

**C4. Pass stakes context** — `src/components/LiveSeriesSheet.jsx` / `App.jsx`
- The sheet already holds the PS `match` (has `seriesScore`, `currentGame`). Pass `seriesScore` + derived `winsRequired` down so `computeStakes` can run. No new fetch.

**C5. Flag gate** — render Live Story surfaces only when the `spectate-owner` flag is on (same mechanism the companion used for its verification window). One flip to go public.

**Acceptance:** with the flag on, open a live mid-game series → graph draws the trajectory, momentum reads sensibly at both 15:00 and 45:00 (game-time-relative), "DECIDER · 1–1" shows on a 1-1 BO3 game 3, spoiler-free hides all three but keeps the draft, and a forced failed poll does **not** blank the section.

---

## Phase D — Telemetry, QA, launch

**D1. Analytics** (`trackEvent`): `live_story_view`, `live_graph_render` (with `points`, `partial_history`), `live_momentum_shown` (with `band`), `live_stakes_shown` (with `kind`). Server: log `live_game_gold` insert count/run and pulse cache hit/miss.

**D2. QA matrix** (from spec §QA + pressure test):
- Happy: mid-game lead, comeback (graph crosses zero), draft phase (no graph, no error).
- Failure: OD `/live` omits game → "watch the broadcast"; Supabase error → block degrades; forced null poll → **no flicker** (retain-last-known).
- Correctness: sides swapped across BO3 games attribute lead to the right named team; spoiler-free hides graph/momentum/stakes, shows draft; **decider/match-point** logic correct for BO3 1-1, 2-1, and BO5 2-2.
- Regression: finished-game rows + tap-through-to-drawer unchanged; **no** write path touches `live:game:`/`stream:match:`/`cacheRunningStreams`.
- Perf/concurrency: pulse KV cache collapses concurrent resolves; payload with `history` stays small; **real mobile 400px viewport** (per `feedback_deployment_checklist`) — graph fits, no horizontal scroll.

**D3. Deploy** — follow `.claude/claude_instructions_template.md` checklist in full, run independent code review (re-read every modified file via Explore, per `feedback_code_review`), verify on a real live game behind the flag, then **explicitly ask "ready to deploy?"** before flipping `spectate-owner` → public.

**D4. Docs** — update `CONTEXT.md` (Live Series Companion → Live Story additions, `live_game_gold` table, `history` on `live-game-pulse`, momentum/stakes). Add the 48h prune to whatever runs the `live_game_map` prune.

---

## Sequencing & dependencies

```
A (data, silent)  ──►  B (read + cache)  ──►  C (UI, flagged)  ──►  D (QA + public)
```
- A is independently shippable and de-risks the whole feature (proves live net-worth capture works before any UI).
- B depends on A having data. C depends on B's payload. D gates the public flip.
- Each phase is independently revertible. A and B are invisible to users until C's flag turns on.

## Files touched (MVP)

| File | Change |
|---|---|
| `scripts/create-live-game-gold.sql` | **new** — append table + grants + unique constraint |
| `api/_handlers/liveOdCapture.js` | append gold rows after the existing upsert |
| `api/_handlers/liveGamePulse.js` | return `history`; add ~15s KV cache on resolved payload |
| `src/utils/momentum.js` | **new** — pure `computeMomentum` + `computeStakes` |
| `src/components/LiveGoldGraph.jsx` | **new** — reuse `GoldGraph.computePoints` |
| `src/components/SeriesLivePulse.jsx` | render graph/momentum/stakes; retain-last-known; spoiler gating; NET WORTH label |
| `src/components/LiveSeriesSheet.jsx` / `src/App.jsx` | pass series-score/stakes context; flag gate |
| `__tests__/…` | unit tests for `computeMomentum`/`computeStakes`; state snapshots |
| `CONTEXT.md` | document the additions |

## Explicitly out of scope (this plan)

R3 AI catch-up · R4 objective/map state · row-level "heating up" badge (needs live telemetry joined into `live-matches.js` — separate spec) · win-probability model · per-player net worth · event markers on the live graph.

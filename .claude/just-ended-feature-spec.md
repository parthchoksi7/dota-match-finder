# "Just Ended" Feature — Design Spec & Research Findings

## Problem

When a series ends, PandaScore removes it from `/matches/running` within ~1 minute. OpenDota indexes the games with a lag of 30min–2h+. During that gap the completed series is invisible on the site — not in the live section (PS dropped it) and not in the results feed (OD hasn't indexed it yet). Users who just watched the match end refresh and see nothing.

---

## Empirical Research (Aurora vs Tundra Esports, DreamLeague S29, 2026-05-22)

Live test conducted during an actual series. Key measurements:

### PS `/matches/running` behavior
- Match **disappeared within ~1 minute** of the final game ending (confirmed by polling at 1-min intervals: present at 14:15, gone at 14:16)
- **No grace period** — it's gone immediately once the series is finished
- `external_identifier` was **never populated** for this match on the bulk running endpoint — not during G1 (finished), not during G2 (running), not ever. The field was simply absent from the game objects.

### `external_identifier` — full picture
| Endpoint | Behavior |
|---|---|
| `/dota2/matches/running` (bulk) | Field absent entirely for this match |
| `/matches/{id}` (individual) | `null` for both finished and running games |
| `/dota2/matches/past` (bulk) | `null` for all finished games |

**Critical insight (from code comment in `api/tournaments.js:744`):**
> `external_identifier` "requires OD to have already indexed the match — defeating the purpose of this fallback"

PS gets the value FROM OD/Steam. It can only appear on PS after OD has it. Therefore it's useless as a bridge.

**Note on existing `live:game:` KV entries:** 60 entries exist in KV (from matches 1487827–1487833, May 19). Those were written when PS was still populating `external_identifier` on the running endpoint. As of May 22, it is no longer present. The `live:game:` KV strategy is currently broken for new matches.

### PS `/matches/past` behavior
- `sort=-end_at` is **broken** — match-level `end_at` is `null` for most matches, so sorting returns random old data
- `range[end_at]=${ago8h},${now}` **works correctly** — finds the match within ~1 minute of it ending using the match-level `end_at` which IS populated
- Returns full metadata: team names, series score, per-game winner, game durations, `begin_at` per game
- `external_identifier` is `null` on all finished games (as above)

### OD indexing lag
- G1 (started ~11:59 UTC): was in OD promatches at 14:18 (139 min after game start)
- G2 (ended 14:18 UTC): still not in OD at 14:47 (29+ min after series end, still counting)
- OD team name: `"Aurora Gaming"` vs PS `"Aurora"` — bidirectional substring handles it correctly

### `findOdMatchByTime()` ±5min window is too tight
- PS `begin_at` for G1: `2026-05-22T19:06:10Z` (Unix 1779476770)
- OD `start_time` for the same game: `2026-05-22T18:59:06Z` (Unix 1779476346)
- **Difference: 7 minutes 4 seconds** — exceeds the current ±5min window, so the match is missed
- Root cause: PS records `begin_at` as when the series/match was scheduled; OD records actual in-engine game start (after drafting). Draft phase is typically 5–10 minutes.
- **Fix: expand `findOdMatchByTime()` window from ±5min to ±15min.** This covers the draft phase while remaining tight enough to avoid false matches between back-to-back series (which are typically ≥30min apart).

### `/matches/past` non-tier-1 noise
The `range[end_at]` query returned non-pro matches mixed in (e.g. `Recrent Team vs SoloTeam`). Tier filtering must be applied server-side before caching.

---

## The Existing Backend (`?mode=recent-completed`)

`api/tournaments.js` already has `fetchRecentCompleted()` doing:
1. Queries `/matches/past?sort=-end_at&page[size]=50&range[end_at]=${ago8h},${now}`
2. Resolves OD match IDs: first via `live:game:` KV (unreliable now), then `findOdMatchByTime()` (real path)
3. Marks unresolved games `_tempId: true` with synthetic ID `_ps-{matchId}-{position}`
4. Caches 5 min under `dota2:recent_completed_v2`

**The backend is mostly correct. The bugs were entirely in the frontend.**

---

## Why It Was Removed — The Two Bugs

### Bug 1: Same series showing up twice
Root cause: PS games were injected into `allMatches`. `groupIntoSeries` then grouped by team names — matching both the PS series and the OD series. Either two separate cards appeared for the same match, or they merged into one inflated card.

PS `seriesId` = PS match ID (e.g. `1487839`). OD `series_id` = completely different numbering system. `groupIntoSeries` doesn't know they're the same series.

### Bug 2: BO3 showing 3-2 (2 OD games + 3 PS games)
Root cause: same PS/OD mixing. OD had indexed 2 games. PS had all 3. Dedup failed (required all games to be in OD, not any). All 5 "games" ended up in the same series card. Score was computed across 5 games → 3-2.

---

## The Fix

### One rule eliminates both bugs:

> **PS "just ended" data lives in a separate state variable (`justEndedSeries`) and NEVER touches `allMatches`.**

`allMatches` = OD promatches only, always. `justEndedSeries` = PS recent-completed only. They never share an array. `groupIntoSeries` only sees `allMatches`.

### Dedup logic — series level, not game level

```js
const odMatchIds = new Set(allMatches.map(m => String(m.id)))

const visible = justEndedSeries.filter(entry => {
  // Primary: has resolved OD IDs → hide if ANY is in OD feed
  const resolved = entry.games.map(g => g.id).filter(id => !id.startsWith('_ps-'))
  if (resolved.length > 0) {
    return !resolved.some(id => odMatchIds.has(id))
  }
  // Fallback: all _tempId → hide if OD has matching team+time series
  return !odHasMatchingSeriesByTeamAndTime(allMatches, entry)
})
```

**Use `any`, not `all`.** Once the first game from this PS series appears in OD, retire the whole PS entry. OD groups by `series_id` so the remaining games follow within minutes anyway.

**Fallback dedup** (all `_tempId`, no resolved IDs): bidirectional substring team name match + game `begin_at` within ±1h. Same `teamsMatch()` logic from `api/_shared.js`.

### What "Just Ended" shows

| Data | Source | Available? |
|---|---|---|
| Team names | PS `opponents` | ✅ Always |
| Series score | PS `results` via `getSeriesScore()` | ✅ Always |
| Tournament name | PS `league` + `serie` | ✅ Always |
| Series format label | PS `match_type` | ✅ Always |
| Bracket round | PS `name` via `parseBracketRound()` | ✅ Always |
| Series winner | PS `results` + `winsRequired()` | ✅ Always |
| Per-game winner | PS `g.winner.id` → opponent lookup | ✅ Always |
| Per-game duration | PS `g.length` (seconds) | ✅ Always |
| Per-game OD match ID | `live:game:` KV or `findOdMatchByTime()` | ⚠️ After OD indexes |
| Draft / gold graph / VOD | OD only | ❌ Until OD indexes |

**`_tempId` games** render as a muted "Replay loading..." placeholder — not a game row. No drawer opens from them.

**Score and game data** come exclusively from PS. Never recalculate from a mixed array.

### Frontend polling
- Poll `?mode=recent-completed` every 5 minutes (data changes slowly)
- On each poll, run dedup against current `allMatches` and update `justEndedSeries`
- The section disappears naturally as OD indexes the series

---

## Remaining Edge Cases

| Case | Behavior |
|---|---|
| BO3 ends 2-0 (G3 `not_started`) | `fetchRecentCompleted` filters `g.status === 'finished'` — G3 excluded. Shows 2 games correctly. |
| BO2 draw (1-1) | Both games show. Series winner null. Score "1-1". PS marks complete correctly. |
| Series canceled | 0 finished games → excluded from `recent-completed`. Never appears. |
| All `_tempId` (ext_id never came, cron miss) | Shows PS result. No replay buttons. Dedup via team+time fallback. Expires after 8h window. |
| OD never indexes | Rare for tier-1. Entry expires when it falls outside the `ago8h` window. Acceptable. |
| OD indexes G1 but not G2 yet | Dedup fires on G1 → PS entry hidden. User sees partial OD series (1 game). Better than mixing. |
| Back-to-back series same teams | `findOdMatchByTime()` uses ±5min window on `begin_at`. Well-separated series don't collide. |
| Non-tier-1 noise in `range[end_at]` | Must apply `isTier1Match || isTier1ByName` filter in `fetchRecentCompleted` before caching. |
| `sort=-end_at` broken | Already handled — use `range[end_at]` not `sort`. Do not re-add sort. |

---

## Backend Checklist Before Re-Enabling Frontend

1. **Confirm tier filtering** is applied in `fetchRecentCompleted` before caching — filter out non-tier-1 noise from `range[end_at]` results
2. **Expand `findOdMatchByTime()` window from ±5min to ±15min** — confirmed 7min 4sec gap between PS `begin_at` and OD `start_time` on DreamLeague S29. Draft phase accounts for this divergence.
3. **Confirm `findOdMatchByTime()` is the primary resolution path** (not `live:game:` KV) since ext_id is no longer reliable
4. **Confirm `_tempId` games are excluded from any score/win counting** in the response shape
5. **TTL**: 5-min KV cache is fine. 8-hour `ago8h` window is correct.

---

## Open Question (being measured)

**How long does OD take to index after a game ends?**
- G2 of Aurora vs Tundra ended 14:18 UTC on 2026-05-22
- Still not indexed at 14:47 (29+ minutes)
- G1 was indexed ~139 minutes after it started; unknown how long after it ended
- This number determines how long "Just Ended" entries are typically visible to users

---

## Implementation Notes

- **No new PS API calls needed** — `fetchRecentCompleted` already queries the right endpoint
- **No new Vercel functions** — merged into `api/tournaments.js` already
- **No new KV keys** — `dota2:recent_completed_v2` already exists
- **Frontend work only**: new `justEndedSeries` state, new section in `HomeFeed`, dedup logic
- **Design**: "Just Ended" section sits between Live and Upcoming in the feed. No pulsing red dot (that's live). Small clock/hourglass icon or simply a gray "Just Ended" label. Disappears once OD covers it.

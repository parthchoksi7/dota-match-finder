# Valve `GetLiveLeagueGames` — Complete Data Point Audit

**Date:** 2026-08-06
**Method:** empirical, against real data — three independent captures (two committed fixture pairs from 2026-08-05, one fresh live poll on 2026-08-06, 44 games) plus real OpenDota post-game ground truth for two finished matches this system captured live. No field below is asserted from documentation; Valve publishes none for this endpoint.
**Schema stability:** all 99 distinct field paths identical across all three captures — zero new fields, zero missing fields. The schema below is complete as of this date, not a partial listing.

This is the field-by-field companion to `.claude/specs/live-ingestion-investigation.md` (mechanism/architecture) and `.claude/specs/live-story-product-spec.md` (product scope). Code lives in `api/_liveStoryDiff.js`; tests in `__tests__/live-story-diff.test.js`.

---

## How to read this

- **Verified** — checked against real, independently-sourced ground truth (OpenDota's own `/api/live` feed, or its post-game parsed `objectives[]`/`buyback_log`), not just observed to exist.
- **Confirmed present, not independently cross-checked** — the field is real and its values look plausible, but nothing outside Valve's own response has confirmed its meaning.
- **Wired into the differ** — actually consumed by `diffGame()`/`diffSnapshots()` today, shipping in the live event stream.
- **Built, tested, not wired** — a working, tested capability exists (same pattern as `decodeTowerBit` before its cross-check landed) but is not part of the differ's live output; using it is a separate product-scope decision.

---

## Top-level game fields

| Field | Status | Notes |
|---|---|---|
| `match_id` | **Verified** | Same ID space as OpenDota's `match_id` — confirmed by OD's own independent `/api/live` feed reporting the identical id for a real match it discovered separately, not from anything we told it. |
| `league_id` | Confirmed present | Numeric Steam league id. Not the same as PandaScore's league id — no direct join exists; team-name correlation is the join key (`teamPairMatch`). |
| `league_node_id` | Confirmed present | Observed `0` on every game checked (44/44). Likely bracket-position metadata that's simply unused for these leagues — not confirmed to ever be non-zero. |
| `lobby_id` | Confirmed present | Large Steam lobby id (`~2.9e16` range). No known use for this product. |
| `series_type` | Confirmed present, **meaning not independently verified** | Observed values `{0, 1, 3}` across live data. Commonly documented elsewhere as 0=none, 1=Bo3, 2=Bo5 — but `2` was never observed and `3` was, which doesn't fit that mapping. **Do not hardcode a series_type→format mapping without a dedicated cross-check against PandaScore's own known Bo1/Bo3/Bo5 for the same series.** |
| `radiant_series_wins` / `dire_series_wins` | Confirmed present | Present and plausible (0/1 observed in a live Bo3). Redundant with PandaScore's own series score, which is the trusted source everywhere else in this codebase — do not use these as a second source of series score. |
| `spectators` | Confirmed present | Range observed: 0-2 in a live sample of tier-mixed leagues. This is the count that gates `GetRealtimeStats`/`GetTopLiveGame` (investigation doc §2.E) — confirms why that path fails for tier-1 games specifically. |
| `stream_delay_s` | **Verified** | Matches OpenDota's own `delay` field exactly for the same match (900 both sources, cross-checked live). Values observed: `10, 120, 300, 900` — a real, variable, per-tournament setting, not a guessable constant. |
| `radiant_team` / `dire_team` | **Verified** | `.team_name` confirmed exact-match against both PandaScore and OD's independent feed for real matches. Present on only ~50% of ALL live league games (most are low-tier/regional with no team block at all) — but resolved successfully in every tier-1 correlation attempted (2/2 real series). `.team_id` — Steam team id, no cross-reference attempted. `.team_logo` — Steam UGC file id; **0 on ~8% of teams observed** (3/38 in one sample) — not always usable as an image source, must handle the zero/absent case. `.complete` — boolean, meaning not independently confirmed; plausible guess is "full 5-player roster known," not tested against a case where it's false with a real gap. |
| `players[]` (top-level, distinct from `scoreboard.*.players[]`) | **Verified** | The ONLY place live IGNs (`name`) appear — `scoreboard` players carry telemetry but no name. **12 entries for a 10-player game**: `team` is `0`=Radiant, `1`=Dire, `2`=broadcaster/caster (not the same encoding as everywhere else in this codebase — normalized at the boundary in `indexPlayerNames`). Confirmed against OD's independent feed: all 10 non-caster `account_id`+`hero_id` pairs matched exactly. |

---

## `scoreboard` (per-game, not per-side)

| Field | Status | Notes |
|---|---|---|
| `duration` | **Verified, wired** | A **float** (e.g. `1263.36669921875`), not an int — always floored before use (`toGameTime`) or the natural key's dedupe breaks. Confirmed strictly monotonic across real ticks; never observed to go backwards outside a pause. |
| `roshan_respawn_timer` | **Verified, wired** | Direct field, not aegis-inferred. Fired correctly on a real 0→nonzero transition in live testing. Does **not** name which team got the kill — team attribution stays `null` by design (see `RoshanKilled` below). |

---

## `scoreboard.{radiant,dire}` (per-side)

| Field | Status | Notes |
|---|---|---|
| `score` | **Verified, wired** | Kill count. Deltas matched derived `HeroKilled` counts exactly across real ticks — zero surprises. |
| `tower_state` | **Verified (structure + naming), wired** | 11-bit bitmask (9 lane towers + 2 tier-4). Layout is lane-major (`bit = laneIndex*3 + tierIndex`), proven structurally from 146 real observed states (0/1,314 constraint violations vs. 36 for the competing hypothesis), and lane **naming** now confirmed on 2 independently-validated real matches (see `crossCheckBuildingEvents` results below) — the strongest-verified field in this entire audit after `duration`/`score`. |
| `barracks_state` | **Verified (structure + naming), wired** | 6-bit bitmask (3 lanes × melee/ranged). Same lane-major layout, same two-match confirmation. **Not derivable from OpenDota's separate live `building_state` field at all** (a pre-existing, already-proven fact — see `api/_buildingState.js`'s header comment: "the same raw ceiling value occurred with 0 barracks destroyed in one lane and 2 destroyed in another lane of the same game," a direct disproof). It IS derivable from OD's post-game `objectives[]` (`melee_rax`/`range_rax` keys) — confirmed against two real matches. |
| `abilities[]` (`{ability_id, ability_level}`, team-level array) | **Verified (E13), built+tested, not wired** | See the dedicated E13 section below. |
| `bans[]` (`{hero_id}`) | Confirmed present, unused | Full ban list per side. Never touched by the differ. Real, usable data point for a live draft surface — see Product Opportunities below. |
| `picks[]` (`{hero_id}`) | Confirmed present, unused | Same hero_id set as top-level `players[].hero_id` for that side (verified: `{28,101,96,27,46}` in `picks` == `{96,27,46,101,28}` in `players`, different order) — but `picks[]` is likely **pick-order**, not player-slot-order, making it a genuinely different, currently-unused signal: draft sequence. Never touched by the differ. |
| `players[]` (5 per side, telemetry) | See below | |

---

## `scoreboard.{side}.players[]` — per-player telemetry (12 fields)

| Field | Status | Notes |
|---|---|---|
| `player_slot` | **Verified, wired** | Radiant 0-4, Dire 128-132. Used as the primary join key across ticks (`pairPlayers`). |
| `account_id` | **Verified, wired** | Confirmed matching OD's independent feed exactly. |
| `hero_id` | **Verified, wired** | Same. |
| `level` | **Verified, wired** | HeroLevelUp source (not currently emitted as a distinct event type, but the raw field is diffed for other purposes). |
| `kills` / `death` / `assists` | **Verified, wired** | `kills`/`death` drive `HeroKilled` derivation and attribution; deltas matched real score changes exactly. `assists` unused by the differ. |
| `last_hits` / `denies` | Confirmed present, unused | Plausible values observed (0-300+ range). Never touched by the differ — a real, available data point for a future last-hit-efficiency display. |
| `gold` | **Verified** | Current liquid (spendable) gold. Confirmed distinct from and much smaller than `net_worth` in real data (e.g. gold 245 vs. net_worth 10,530 for the same player) — semantics match expectation. Used in buyback candidate detection (see below). |
| `net_worth` | **Verified, wired** | Total economic value. Growth rate across real ticks matched each player's own `gold_per_min` stat — internally consistent. Summed per side for the net-worth-lead comparison in the admin `compare` panel. |
| `gold_per_min` / `xp_per_min` | Confirmed present, unused | Plausible values, cross-checked once against observed net-worth growth rate (consistent). Never touched by the differ. |
| `item0`..`item5` | **Verified, wired** | 6 slots only — **confirmed empirically, not inferred**: zero `backpack_*` or neutral-item field exists anywhere in the 99-field schema, across three independent captures. Set-based diffing (never index-based) after confirming real item-slot reshuffling in live data (hero 18: `[1,172,63,116,252,36]`→`[1,172,36,116,252,63]`, ids 63/36 swapped slots with no purchase). Empty slot = `-1`. |
| `respawn_timer` | **Verified (E-buyback), built+tested, not wired** | See Buyback section below. |
| `position_x` / `position_y` | Confirmed present, plausible | Range observed: **-8,288 to +8,288** roughly (real: -8275 to +8218), matching the known Dota 2 map's coordinate bounds. Never touched by the differ — live hero-position rendering was explicitly out of scope for this MVP. |
| `ultimate_state` | **Verified, NEW finding, not wired** | Empirically decoded as a **bitmask**: bit 0 (value 1) = ultimate unlocked, bit 1 (value 2) = off cooldown. Tested against 394 real player-tick observations: excluding the trivial `state=0` (not-yet-unlocked) case, **193/194 (99.5%)** consistent with `(state & 2) == (cooldown == 0)`. One violation (likely a single-tick snapshot-timing artifact). **A previously-undocumented, immediately-usable "ultimate is up" signal** — nothing on the current site (either data pipeline) exposes this. |
| `ultimate_cooldown` | **Verified, NEW finding, not wired** | Seconds remaining. Corroborates the `ultimate_state` decode above. |

---

## E12 — Building bit layout: final status

**Structure:** proven (146 states, 0/1,314 violations, see the investigation doc).
**Lane naming:** confirmed on **2 independently-validated real matches**, by two different methods:

| Match | Method | Result |
|---|---|---|
| `8931981851` (RE.Arise vs No Hoodwink, EPL Masters S1) | Single diffed event vs. OD `objectives[]` | 1/1 `TowerDestroyed` confirmed (team, lane, tier all agreed; 31s discovery-lag, within tolerance) |
| `8930594356` | **State-consistency check** — every bit in the raw captured `tower_state`/`barracks_state` (not a diff) cross-referenced against OD's cumulative `objectives[]` history up to that game_time | **32/32 bit positions agreed** (9 lane towers + 1 tier-4 pair-count + 6 barracks, ×2 sides) |

**Tier-4 towers — found and fixed 2026-08-06.** OD's key for a tier-4 (base-guardian) tower kill is the **bare** `npc_dota_badguys_tower4` — no lane suffix, unlike tier 1-3. The original `parseOdBuildingObjective` regex required a lane suffix and silently returned `null` for every tier-4 kill, meaning a real tier-4 `TowerDestroyed` could never show `confirmed` even when matching ground truth existed. Fixed; verified against 2 real tier-4 kills in the same match (both produced the identical key string `npc_dota_badguys_tower4` — **OD's own combat log does not distinguish which of the two tier-4 towers fell, only that one did**, a hard ceiling on what this crosscheck can ever verify for tier 4, not a gap in the parser).

**Running count toward the public-graduation bar (3+ independently-validated matches, per the investigation doc):** effectively **2 of 3**, with match 2 validated by a stronger method than match 1. `laneVerified` stays `false` in code until a third match closes it — the bar is about accumulated confidence, not a box to check.

---

## E13 — Ability → player attribution: verified 2026-08-06, feasible

The original investigation doc flagged this as an unknown-difficulty "decode pass." Measured against real live data (44 games, 64 side-instances, 940 raw ability entries):

| Step | Result |
|---|---|
| Naive attribution (hero's own innate `abilities[]` list only) | 29.9% resolved |
| + excluding 10 confirmed-universal ability ids (Glyph/Scan/Roshan-capture/Dota-Plus-cosmetic/generic-stat-talent — each appeared **exactly once per side-instance** regardless of hero composition, the empirical tell) | |
| + including each hero's **talent tree** (`special_bonus_*`), not just innate abilities | **99.1% uniquely attributed, 0.3% collision, 0.6% unattributed** (347 relevant entries) |

Zero cross-hero collisions in the raw pass (940/940) — when an id resolves to a hero at all, it has never resolved to more than one. Implemented as `buildAbilityOwnerSets()` / `attributeAbility()` in `api/_liveStoryDiff.js`, tested, **not wired into the live event stream** — `AbilityLearned` was explicitly out of the original MVP scope, and adding it is a product decision, not a data-availability question. The universal-ability-id list (`UNIVERSAL_ABILITY_IDS`) is empirically derived, not documented anywhere by Valve or OpenDota; re-derive it (via the "exactly once per side-instance" test) if a patch changes the generic ability slots.

---

## Buyback detection: verified 2026-08-06, genuinely `uncertain` — not a gap, a structural ceiling

Heuristic (from the original spec): `respawn_timer` resets from positive to `0` with a large `gold` drop, `death` count unchanged in the same tick.

Tested against 6 real candidates surfaced by this exact heuristic on the two live-captured fixture pairs, cross-checked against OD's real `buyback_log` for those same matches once parsed:

| Result | Count |
|---|---|
| Confirmed real buyback (matched OD's `buyback_log` exactly, including one player with 2 separate buybacks) | 3 |
| Confirmed false positive (OD's `buyback_log` was empty for that player) | 1 |
| Still unparsed by OD as of this writing | 2 |

**75% empirical precision on the checked sample.** The false positive's cause is structural, not fixable by tuning thresholds: a **natural respawn** (timer simply expires) produces the identical signature — `respawn_timer` positive→0, `death` unchanged — as a buyback. At the sparse poll cadence that produced the false positive (a multi-minute gap), a coincidental expensive purchase landing in the same window is common enough to matter. Implemented as `detectBuybackCandidate()`, tested, **never returns `exact` confidence by design** — matches the original spec's own caution exactly, now backed by a real number instead of a guess. Re-measuring precision at the tighter ~30-40s cadence this pipeline runs at when a viewer has the page open (vs. the sparse manual-testing gaps that produced this sample) is the natural next validation step before considering this for any user-facing surface.

---

## Teamfight clustering: verified 2026-08-06 — a display-layer capability, not a new data point

Not sourced from any new Valve field — pure grouping of `HeroKilled` events the differ already emits, by `gameTime` proximity (default 20s window, chained across hops). Implemented as `clusterTeamfights()`, tested against both a synthetic case and the real 5-kill batch from the hand-validated Yakult match. Honesty caveat carried in the code: at sparse poll cadence, multiple kills discovered in one diff tick already share one `gameTime` (the discovery time, not each kill's real moment) — clustering on that value in that regime re-groups what a wide diff already batched together, not true sub-second simultaneity. Becomes more meaningful as capture cadence tightens (now automatic via the `od-live-capture` piggyback, ~15 min unattended / ~30-40s when a viewer is present).

---

## Not attempted / out of scope

- **`RunePickedUp`, `SmokeUsed`, `WardPlaced`** — confirmed **not derivable** from this data source at all (no field carries this information, structurally, not a gap to close). Tier 3 (GC/GOTV) territory per the investigation doc.
- **`series_type`'s exact meaning** — flagged above as unverified; needs a dedicated cross-check against PandaScore's known series format before any code depends on it.
- **`league_node_id`, `lobby_id`** — present, no known product use, not investigated further.
- **Position data (`position_x`/`position_y`) as a live minimap/heatmap** — confirmed plausible and available, no rendering work attempted.

---

## Product opportunities surfaced by this audit (not built, flagging for future scoping)

1. **"Ultimate is up" indicator** — `ultimate_state`/`ultimate_cooldown`, verified 99.5% reliable, currently unused by either data pipeline on the site. Cheapest new signal in this entire audit to ship, if in scope.
2. **Live ban list** — `bans[]`, real and unused. Pairs naturally with the existing live pick display.
3. **Draft pick order** — `picks[]`'s ordering (distinct from `players[]`'s slot-ordering) is a real, unused signal for "who picked/banned first," which speaks directly to the "draft is content" principle already established for this product.
4. **Last-hit/deny efficiency** — `last_hits`/`denies`, real and unused, standard esports-broadcast-style stat.

None of these are scoped or built — recorded here because this audit surfaced their existence and basic viability, and losing that context would mean re-discovering it later.

# Live "Worth Watching" Signal on Feed Rows — Product Specification

Roadmap item: `.claude/specs/live-story-roadmap.md` **Priority 2b** ("Row-level 'heating up' / 'close game' badge — NOT speced, commission a PM pass first"). Cross-referenced in `.claude/product-backlog.md` line 9.
Status: **spec drafted 2026-07-30. BUILT AND SHIPPED OWNER-ONLY 2026-08-01, FLIPPED PUBLIC
2026-08-03** — ahead of the timeline's own "Aug 8–10" target below (owner decision, made without
completing the full owner-observation window this spec originally called for). The
threshold/pipeline calibration caveat (post-game `radiant_gold_adv` proxy vs. live `radiant_lead`
— Finding 3b) was open at flip time; it was **re-validated against real `live_game_gold` data and
closed 2026-08-03** — see "Post-flip re-validation" immediately after the critique below. The
result corroborated the original post-game calibration; no threshold changes were made.
Shares its data source with the Live Series Companion pulse (`live_game_map`) and the live-score push (`sendScorePings`).

## Pre-build critique (2026-08-01) — findings and fixes applied before shipping

Before implementation, the badge logic was stress-tested through three lenses (`/dota_data_scientist`,
`/dota_analyst`, `/dota_pm`) specifically looking for edge cases where R1's math or R1–R7's product
framing would mislabel a real game. Three logic gaps were found and fixed in `src/utils/liveSignal.js`;
two product-level gaps were fixed at the render site (`src/components/LiveMatchRow.jsx`); one
calibration risk was confirmed already-known and left as an open pre-public-flip requirement
(unchanged from this spec's own "Data Requirements" section).

**Logic fixes (`src/utils/liveSignal.js`):**
1. **Peak-reset-on-sign-flip.** The spec's literal retracement formula (`1 − currentLeadOnPeakSide
   / peak`) was never defined for what happens when the lead fully reverses sides — computed
   naively, a full reversal produces retracement > 1 forever, against a peak that no longer
   describes the current leader. `advancePeak()` now resets the peak to the new leader's own
   reading the instant the lead's sign flips, so retracement always describes the CURRENT leader's
   own drawdown.
2. **Time-scaled peak floor.** The flat 5,000 floor for a qualifying SWINGING peak is a real edge
   at minute 15 but statistical noise by minute 70+, where net worth totals (and single-fight
   swings) are far larger. `peakFloor(gameTime)` now scales with `evenThreshold` the same way the
   CLOSE/ONE_SIDED boundaries already do.
3. **Threshold/pipeline mismatch — confirmed, not newly fixable at the time.** The calibration corpus used
   post-game `radiant_gold_adv` (smoother) as a stand-in for the noisier live `radiant_lead` field.
   This was already flagged in "Data Requirements" as a pre-public-flip requirement
   ("re-validate against `live_game_gold`"); the critique corroborates it independently. **Closed
   2026-08-03 — see "Post-flip re-validation" below.**

**Product fixes (`src/components/LiveMatchRow.jsx`), both scoped to ONE_SIDED only — CLOSE/SWINGING
are a positive read and are never suppressed:**
4. **Followed-team exemption.** A partisan fan watching their own team behind is often MORE
   invested, not less — the recessive "deprioritize this row" treatment never renders on a row for
   a team the viewer follows (`isFollowedMatch`).
5. **Grand Final / decider exemption.** A lopsided net-worth gap in a Grand Final or a BO3/BO5
   decider is still appointment viewing (career-defining performances, tournament narrative
   closure) — `isGrandFinal(bracketRound)` or `computeStakes(...).kind === 'DECIDER'` suppresses
   ONE_SIDED there regardless of the gold state.

**Findings surfaced but deliberately NOT built against (documented, not silently dropped):**
- The badge is net-worth-only and structurally cannot see Roshan/Aegis timing, buyback state, BKB
  availability, or draft-implied win conditions (e.g. a hyper-scaling draft intentionally ceding
  early net worth). A team that is gold-behind but map/tempo-ahead — often the most watchable kind
  of Dota — will read ONE_SIDED. This is the same "we cannot detect a genuinely boring close game"
  class of accepted risk already logged in "Risks & Dependencies," just the mirror case; the kill
  criterion (CLOSE-row CTR ≥ 1.3×) is the intended backstop, not a logic fix.
- At tournament scale, ~4 in 5 CLOSE-flagged games will not be subjectively great (Finding 5's own
  4.1% base rate). The owner-only phase's real acceptance test is therefore **subjective agreement
  against games actually watched**, not just the replay-harness transition-count targets already
  in "QA Scenarios" — track this manually during the observation window before any public-flip
  decision.
- Given `resolveLiveSignals` sits inside the same shared-KV-cache regeneration every caller reads
  (`dota2:live_matches_v5`), the owner gate is enforced at RESPONSE time
  (`stripSignalForResponse`), not at attachment time — a deliberate deviation from the
  attachment-time pattern `api/_handlers/liveGamePulse.js` uses, because that endpoint partitions
  its cache per-owner and this one does not. Attachment-time gating here would leak the field to
  every public caller for the rest of a cache window whenever an owner's request happened to win
  the regen race. See the code comment on `handler()`'s `isOwner` line in `api/live-matches.js`.

## Post-flip re-validation (2026-08-03) — Finding 3b closed

The public flip (2026-08-03) shipped ahead of re-validating thresholds against real live
`radiant_lead` data. This section closes that gap: computed this session, not recalled, against
`live_game_gold` (this codebase's own production capture table, live since 2026-07-17, no prune
job ever implemented — see `scripts/create-live-game-gold.sql` — which is incidentally why enough
history existed to run this at all).

**Method.** Pulled every `live_game_gold` row (4,623 rows / 321 games, 2026-07-18 → 2026-08-03),
joined against real outcomes (`radiant_win`) and league names via OpenDota's `/api/explorer` SQL
endpoint, filtered to this repo's own `PERMANENT_TIER1_NAMES` (dropped 85 of 308 resolvable games —
Boris Invitational, Asgard Championship — that OD's `/live` sweep captures but that would never
actually reach a production feed row). Left with **183 tier-1 games with ≥5 captured snapshots**
(2,993 (game, minute) observations). Unlike the original post-game corpus (uniform per-minute
`radiant_gold_adv` from OpenDota's clean post-match parse), this is the actual noisy, irregularly-
spaced signal the shipped code reads in production — real ~60–120s capture gaps, real network
blips, real games that stopped being captured mid-way when no one was watching.

**Result 1 — replaying the actual shipped state machine (`nextSignalState`, full hysteresis +
dwell), not just snapshot buckets:** of the 183 games, 116 triggered `ONE_SIDED` at least once.
The leading side at that moment went on to win **111/116 = 95.7%** — 5 wrong calls. The original
spec's Finding 3 (post-game data) found 78/83 = 94% (5 wrong calls, on a smaller game count).
Statistically indistinguishable, same wrong-call rate.

**Result 2 — aggregate three-band calibration (current thresholds, live `radiant_lead`, tier-1
only, minute 8+):**

| Band | share (live) | P(leader wins), live | P(leader wins), original post-game corpus |
|---|---|---|---|
| `EVEN` | 21.6% | 52.5% | 53.2% |
| `AHEAD` | 56.1% | 71.8% | 75.0% |
| `FAR_AHEAD` | 22.3% | 95.1% | 95.9% |

All three within ~1–4 points of the original calibration. Broken out by game phase (8–25 / 25–45 /
45+ min) to specifically check for the failure mode a noisy live feed could cause — thresholds
drifting badly at one phase but not another — `FAR_AHEAD` held 92–97% "decided" and `EVEN` held
50–57% "coin flip" at every phase, with no systematic drift late-game where net worth (and
single-fight swings) are largest and the ramp matters most.

**Conclusion: the live/post-game pipeline mismatch flagged in Finding 3b does not materially
change the calibration story.** No threshold changes made in `momentum.js` or `liveSignal.js` as a
result. Caveat carried forward honestly: this corpus is ~18× smaller than the original (183 vs.
3,230 games), so individual lead × time-bucket cells are thin (some n=1–2) — this closes the
*aggregate* calibration risk, not a claim that every fine-grained cell is precisely pinned down.
The `feature:live-signal` KV kill switch remains the backstop if real-world behavior still
surprises the owner during TI 2026.

---

# Feature Summary

A single, three-state signal on live feed rows (`LiveMatchRow`) telling a fan, at a glance and without opening
anything, whether the game currently running inside that series is **still undecided**, **ordinary**, or
**effectively decided**.

Everything shipped in Live Story so far (R1 momentum band, R2 stakes chip, R4 tower map, the net-worth graph)
enriches a game the fan has *already chosen to open*. Nothing in the product helps them choose. This is the
first live-telemetry surface that crosses from the companion sheet into the ambient feed.

**Three visual states: positive (`SWINGING` or `CLOSE`) / no badge / negative (`ONE-SIDED`).** The "no badge"
middle state is deliberate and is the single most important design decision in this spec — see the evidence
below. A prerequisite change (R0) also fixes two miscalibrated thresholds in already-shipped `momentum.js`.

---

# What The Data Actually Says

This section exists because the roadmap's stated scope ("existing `computeMomentum` thresholds, three states")
does not survive contact with real data. Everything below was computed this session, not recalled.

**Method (revised 2026-07-31 — corpus enlarged 31×).** OpenDota's `/api/explorer` SQL endpoint returns
`radiant_gold_adv` in bulk, which removes the per-match fetch bottleneck of the first pass. Corpus is now
**N = 3,230 tier-1 games / 130,469 (game, minute) observations**, leagues matched against this repo's own
`PERMANENT_TIER1_NAMES` (DreamLeague, ESL One, PGL, BLAST, TI, Riyadh Masters, 1win Essence, EWC, EPL Masters),
qualifiers excluded, **restricted to 2025-02-16 → 2026-07-31** so the calibration reflects the modern game rather
than a decade of patch history. 1,518 games run past 40 min, 586 past 50, 227 past 60 — enough to calibrate the
late game, which the first pass could not. Band logic replicated **verbatim** from `src/utils/momentum.js`.

### Finding 1 — the existing three bands do not partition a feed

Pooled over every (game, minute) observation from minute 8 to game end (107,859 observations, 3,230 games):

| Band | Share of observations | P(this side eventually wins) |
|---|---|---|
| `EVEN` (\|lead\| ≤ 1,000) | 14.1% (n = 15,261) | 53.2% |
| `AHEAD` | 68.7% (n = 74,134) | 75.0% |
| `FAR_AHEAD` | 17.1% (n = 18,464) | 95.9% |

`AHEAD` fires on **72% of everything**. A badge that shows on three of four live rows is not a signal, it is
wallpaper. This is the reason the middle state must be *no badge*.

### Finding 2 — `EVEN` is nearly extinct exactly when the fan needs it

Share of still-running games reading `EVEN` at each minute:

| Minute | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 50 | 60 |
|---|---|---|---|---|---|---|---|---|---|---|
| `EVEN` share | 71% | 36% | 20% | 14% | 9% | 6% | 5% | 4% | 5% | 7% |
| games still live (N) | 3230 | 3230 | 3230 | 3210 | 3087 | 2759 | 2158 | 1520 | 586 | 227 |

At minute 5, 71% of games are "even" — because every game is even during laning. That is noise, not signal, and
it is why the badge needs a **minimum game-time gate**. From minute 25 on, a strict `EVEN` badge fires on 4–9% of
rows. It would be invisible in practice.

**Consequence:** the `CLOSE` state must use a *time-scaled* band with hysteresis, not the raw flat
`EVEN_THRESHOLD` — see Finding 3b, which shows this collapse is an artifact of the threshold, not of the games.

### Finding 3 — `FAR_AHEAD` is the only statistically strong signal we have, and it is a negative one

- 83 of 104 games (80%) hit `FAR_AHEAD` at least once.
- Of those 83, the first side to reach `FAR_AHEAD` went on to **lose in only 5 cases (6%)**.
- Pooled P(win | `FAR_AHEAD`) = 95.7%.

"This game is effectively decided" is the most reliable and most actionable thing this product can tell a fan
scanning a live feed. It is also the state with the strongest evidence behind it. That is a real, if slightly
counter-intuitive, product conclusion: **the highest-confidence recommendation we can make is a
de-recommendation.**

### Finding 3b — BOTH thresholds in `momentum.js` are miscalibrated, in opposite directions

This is a bug in **shipped code** (the companion sheet's momentum band), not just a constraint on the new badge.

`EVEN_THRESHOLD` is a **flat 1,000 at every game time**, while `farAheadThreshold` ramps but **stops ramping at
40 minutes**. Dota does not stop changing at 40 minutes — buyback, Aegis, Rapier and mega creeps make late leads
progressively more reversible, so both boundaries should keep widening.

P(the currently-leading side wins), by game time × net-worth lead (N = 3,230 games; every cell below n ≥ 180):

| min | 0–1k | 1–2.5k | 2.5–5k | 5–8k | 8–12k | 12–18k | 18k+ |
|---|---|---|---|---|---|---|---|
| 10–14 | 55% | 64% | 79% | **92%** | 99% | — | — |
| 20–24 | 52% | 59% | 72% | 85% | 95% | 99% | 100% |
| 30–34 | 50% | 59% | 68% | 78% | 89% | 95% | 99% |
| 40–44 | 51% | 52% | 62% | 69% | 79% | 88% | 98% |
| 50–59 | 50% | 54% | 60% | 68% | 73% | 79% | 89% |
| 60–90 | 50% | 54% | 57% | **64%** | 62% | 70% | 87% |

**A 5–8k lead is 92% decided at minute 12 and 64% — barely better than a coin flip — at minute 60.** The current
code calls both "AHEAD" and applies the identical `EVEN` test (flat 1,000) to both. At 60+ minutes, the 5–8k and
8–12k bands are statistically indistinguishable (64% vs 62%); you need **18k+** to reach the confidence that 8k
buys at minute 12.

Empirical iso-probability contours vs. what the code currently does:

| min | P=60% ("still a coin flip") | code's `EVEN` | P=90% ("decided") | code's `farAheadThreshold` |
|---|---|---|---|---|
| 12 | 700 | 1,000 | 5,700 | 8,700 |
| 22 | 1,700 | 1,000 | 7,300 | 10,950 |
| 32 | 1,900 | 1,000 | 9,300 | 13,200 |
| 42 | 3,600 | 1,000 | 15,700 | 15,000 |
| 54 | 3,800 | 1,000 | 24,800 | 15,000 |
| 66 | 4,300 | 1,000 | — | 15,000 |

Two distinct defects:

1. **`EVEN` is too tight, increasingly so** — 1.7× too tight at 22 min, **3.8× too tight at 54 min**. This is the
   direct cause of Finding 2 ("`EVEN` is extinct after minute 25"): the band did not disappear because games stop
   being close, it disappeared because the yardstick never grew.
2. **`farAheadThreshold` is too loose early and far too tight late** — it demands 8,700 at minute 12 when 5,700
   already means 90% decided (under-flagging), then still says 15,000 at minute 60 when the real boundary is
   ~25,000 (**over-flagging: it calls games "Far Ahead" that are only ~70–79% decided**). Because the ramp is
   frozen after 40 minutes, the error grows without bound in exactly the games that matter most — the 50–70
   minute epics.

**Proposed replacements** (both keep ramping to 65 min; same readable linear-ramp style as the existing code):

```
evenThreshold(gameTime)    ≈  500 +  60 × min(gameTimeMin, 65)      //   500 →  4,400
decidedThreshold(gameTime) ≈ 5000 + 400 × (min(gameTimeMin, 60) − 10)  // 5,000 → 25,000
```

Validated over all 107,859 observations from minute 8:

| | `EVEN` share | P(win\|EVEN) | `AHEAD` share | `DECIDED` share | P(win\|DECIDED) |
|---|---|---|---|---|---|
| Current code | 14.1% | 53.2% | 68.7% | 17.1% | 95.9% |
| **Proposed** | **22.3%** | **54.7%** | **61.0%** | 16.7% | **97.5%** |

**Both bands get better at once.** `EVEN` nearly doubles in coverage while staying a genuine coin flip (54.7%),
and `DECIDED` gets *more* accurate (95.9% → 97.5%) at a slightly smaller share. `AHEAD` — the wallpaper band —
shrinks. The late-game rescue is the headline: `EVEN` share at 50–59 min goes from 5% to 20%, and at 60–90 min
from 6% to 24%.

**This should be fixed in `momentum.js` regardless of whether the feed badge ships**, since the companion sheet
currently tells a fan "Team X Far Ahead" at 15k in a 60-minute game — a call the data says is only ~70% right.

### Finding 4 — the badge will flicker badly without hysteresis

Mean band transitions per game (minute 8 → end, evaluated once per minute), N = 3,230:

| Thresholds | mean transitions/game | games with ≥ 4 |
|---|---|---|
| Current | 4.34 | 53% |
| Proposed (Finding 3b) | 4.61 | 58% |

On a feed that repaints every 2 minutes with no user action, that is a label mutating under the fan's eyes
several times per game. Hysteresis and a dwell requirement are **mandatory**, not polish.

Note the direction: the proposed time-scaled thresholds make churn slightly **worse**, not better — a wider
`EVEN` band means more boundary crossings. Fixing the calibration and adding hysteresis are therefore two
separate obligations, and neither substitutes for the other.

### Finding 5 (revised on the 31× corpus) — an **event** read beats a **state** read, and it is computable today

Replicating `api/_watchability.js`'s `scoreGame()` over all 3,230 games (minus `mega_comeback`, which needs
`barracks_status`): **132 games (4.1%)** scored ≥ 3. That is 132 positives, not 8 — enough to actually test
candidate in-flight signals, which the first pass could not.

P(final watchability ≥ 3), flagged vs unflagged:

| Signal (all computable live today) | Fires on | Lift @ min 25 | @ min 30 | @ min 40 |
|---|---|---|---|---|
| **Comeback in progress** — lead retraced ≥ 40% from a ≥ 5k peak | 6% → 22% | **3.98×** (n=179) | **3.56×** (n=281) | **4.07×** (n=339) |
| `EVEN` under the *proposed* time-scaled threshold | 17% → 15% | 2.06× (n=522) | 1.76× (n=425) | 2.46× (n=223) |
| `EVEN` + lead peaked ≥ 6k earlier ("fought back to level") | 1% → 9% | 3.18× (n=30) | 3.60× (n=68) | 3.39× (n=131) |
| Lead already flipped ≥ 1× (5k rule) | 33% → 53% | 1.80× (n=1018) | 2.49× (n=1096) | 3.59× (n=812) |
| Kill pace ≥ 1.2/min *(proxy — uses final kills, so optimistic)* | ~50% | 1.15× | 1.26× | 1.65× |

Three conclusions:

1. **The best signal is an event, not a state.** "The lead has collapsed from its peak" (3.6–4.1× lift, stable
   across every minute bucket, well-powered) beats "the lead is small right now" (1.8–2.5×). Intuitive in
   hindsight: a fan wants to know *something is happening*, not that a number is small.
2. **It needs no new data.** Retracement is computed entirely from `live_game_gold`'s per-game lead history,
   which is already captured for every live tier-1 game and has never been pruned.
3. **Time-scaling `EVEN` (Finding 3b) is what gave the state read any lift at all.** At the flat 1,000 threshold
   the same test showed no usable signal; the properly-scaled band reaches 2.0–2.5×.

**What still cannot be claimed.** Base rate is 4.1%, so even a 4× lift means ~16–20% of flagged games end up
"good+" — **four in five do not.** This is a tilt, not a promise. And the target variable is this repo's own
watchability heuristic, which is a proxy for "was it worth watching," not ground truth. So the copy rule from the
first pass stands unchanged: **present-tense state/event reads only, never a prediction of entertainment value**,
matching the "state, not fate" rule that already governs `computeMomentum`.

### Finding 5b — full inventory of what live telemetry actually exists

Fetched and enumerated directly from OpenDota `/api/live` this session, rather than assumed.

**Available and already captured into `live_game_map`:**

| Field | Used today? |
|---|---|
| `radiant_lead` (net worth diff) | Yes — momentum band |
| `radiant_score` / `dire_score` (team kills) | Yes — score row. **Kill *pace* unused** |
| `game_time` | Yes |
| `building_state` | Decoded to per-lane tower counts (owner-gated map). **Tower differential unused as a signal** |
| `radiant_hero_ids` / `dire_hero_ids` / player names | Yes — draft strip |
| `spectators` | **Captured, never used** |
| `server_steam_id` | **Captured, never used** |

**Available in `live_game_gold`:** the full per-game lead trajectory. **This is the single most valuable unused
asset in the system** — it is what makes Finding 5's winning signal possible, and nothing currently reads it
except the owner-gated graph.

**In `/api/live` but not captured:**
- `delay` — the broadcast delay Valve applies, observed at **120 s or 900 s** depending on the event. See the
  spoiler note below; this one matters.
- `sort_score` — **a dead end. It is exactly `13000 + spectators` (r = 1.000, n = 9 live league games).** Not a
  watchability ranking despite the name. Recorded so nobody spends time on it.
- `average_mmr`, `is_watch_eligible`, `team_id_*`, `lobby_id`, `activate_time`, `deactivate_time`.

**NOT available live at all — the answer to "do we have Roshan / Rapier / teamfight / mega creeps":**

| Signal | Live? | Why |
|---|---|---|
| Gold swing / comeback | **Yes** | Derivable from `live_game_gold` history — see Finding 5 |
| Roshan / Aegis timer | **No** | Absent from the `/live` payload entirely |
| Divine Rapier | **No** | `players[]` carries only `account_id, hero_id, team_slot, team` — no items, no gold, no KDA |
| Rampage | **No** | Needs `multi_kills`; per-player stats absent |
| Mega creeps | **No** | Needs `barracks_status`; `building_state` cannot decode barracks (already disproved in this repo, R4.0 spike) |
| Teamfight detection | **No** | Post-game only |

Every one of those except gold swing is a **post-game-only** indicator, which is why they live in
`fetchMatchIndicators` and not the live pulse.

**The one open door:** Valve's `GetRealtimeStats`, reachable via the `server_steam_id` we already capture. Tested
this session — it returns HTTP 403 without a Steam Web API key, which this repo does not have and does not
reference in `CONTEXT.md` or `README.md`. **DATA NOT AVAILABLE:** I could not verify what it returns, and will not
assert it from recall. Getting a free key and issuing one request is a ~30-minute spike that would settle
`live-story-roadmap.md`'s Priority-3 Roshan question and its per-player net-worth question in one go. Worth doing
— but **not on this feature's critical path**, and not before TI.

### Finding 5c — PandaScore: the rich live data exists, but it is plan-gated, not missing

Probed with the real token this session. The 403-vs-404 split is the whole story:

**HTTP 403 "Access Denied" — the endpoint exists, our plan does not include it:**

| Endpoint | What it is |
|---|---|
| `/dota2/games/{id}/frames` | PandaScore's live per-game timeline product |
| `/dota2/games/{id}` | Per-game detail |
| `/dota2/matches/{id}/players/stats` | Per-player match stats |
| `/dota2/teams/{id}/stats` | Team form / historical stats |

**HTTP 404 — not a route on this API at all:** `/dota2/games/{id}/events`, `/dota2/matches/{id}` (direct),
`/dota2/matches/{id}/incidents`, `/dota2/tournaments/{id}/standings`, `/tournaments/{id}/brackets`,
`/tournaments/{id}/teams`, `/series/{id}`. This matches the plan limitation already documented in `CONTEXT.md`
(use `filter[id]` on the collection routes instead — verified working, returns 200).

**And PandaScore flags live support per tournament.** Of the 100 most recent Dota tournaments, `live_supported`
is **true on 14 — 9 tier-S and 5 tier-A**, including DreamLeague Season 29 and PGL Wallachia Seasons 7–8. The
tournament used for this probe (1win Essence II, tier-A) reports `live: {supported: false}`, which is why its
games would have no frame data even with plan access.

**Strategic read:** the richest live Dota telemetry available anywhere — richer than OpenDota `/live`, which has
no per-player gold/items/KDA at all — is **one commercial upgrade away, for precisely the tier-S events this
product exists to cover.** That is a pricing conversation, not an engineering problem. **I could not inspect the
`frames` schema (403), so nothing in this spec assumes what it contains** — validating that is step one of any
such conversation, and it should not gate the MVP.

### Finding 5d — free context fields we already fetch and throw away

`mapMatch()` keeps ~10 fields off the running-match payload. These are in the same response, cost **zero**
additional requests, and are currently discarded:

| Field | Value for a "worth watching" signal |
|---|---|
| `tournament.tier` (`s`/`a`/`b`/`c`/`d`) | Used for *filtering* today, never for *ranking*. A tier-S game outranks a tier-A game. |
| `tournament.type` (`offline`/`online`/`online/offline`) | LAN vs online — a genuine stakes difference (17 of 100 recent tournaments are offline) |
| `tournament.has_bracket` | Elimination bracket vs round-robin group — "someone goes home" stakes |
| `tournament.prizepool` | Magnitude of stakes |
| `tournament.region` (`EEU`, `ASIA`, …) | **Directly serves the Regional Fan segment**, which this spec currently lists as unserved |
| `game_advantage` | Series advantage (e.g. upper-bracket team starts 1-0) |
| `rescheduled` / `original_scheduled_at` | Delay detection — "this started 2h late" |
| `forfeit` / `draw` | BO2 draws, which `computeStakes` already has to reason about |
| `opponents[].opponent.image_url` / `dark_mode_image_url` / `acronym` | Team logos — UI, not signal, but free |

**Why this matters more than it looks.** All of it is **pre-match context, available before a game starts** —
so it works in exactly the three windows where the telemetry badge is structurally blind: the draft phase, the
first 8 minutes (R2's gate), and between games in a series. Telemetry and stakes context are complements, not
alternatives. It is also **spoiler-free by construction** (nothing about the running game's outcome), which
means it could render even in spoiler-free mode where the telemetry badge cannot.

This is a strong candidate for the first post-MVP iteration; it is deliberately **not** folded into MVP, because
"which of these live games is closest" and "which of these tournaments matters most" are different questions and
conflating them into one badge would reintroduce the wallpaper problem of Finding 1.

### Finding 5e — draft-phase prediction: tested, not usable

Tested whether aggregate hero pro-win-rate differential at end of draft predicts the winner, using OpenDota
`heroStats` (`pro_pick`/`pro_win`/`pro_ban`, free, no key) against 1,481 tier-1 drafts pulled via explorer SQL.

**It does not survive contact with the data — because the data is too thin.** `heroStats`' pro fields cover only
~1,299 total pro picks across all heroes; **just 27 of 127 heroes have ≥ 20 picks**, so only **30 of 1,481
drafts** could be scored with adequate hero coverage. Accuracy on those 30 was 66.7%, which at N = 30 has a
confidence interval spanning the coin flip — **SMALL SAMPLE, no conclusion**, per this project's own rule.

**Do not build a draft signal on `heroStats`.** A viable version would need a hero win-rate table built from our
own match corpus with proper train/test separation, which is a separate project, not a field to read.

**Broadcast-delay spoiler risk (flagged, unresolved).** `delay` was 900 s on several observed league games. I
attempted to determine whether OpenDota's `/live` values are already delayed by that amount; the test is
confounded by draft length and in-game pauses (which only inflate the measured offset), but the *minimum*
observed offset was ~245 s on a `delay = 900` game — which is too small for the data to be carrying a 15-minute
delay. **That suggests the site may be showing game state up to 15 minutes ahead of what a fan watching the
official stream can see.** Confidence: MEDIUM, test confounded. This affects **already-shipped surfaces** (live
score row, tab title, score push), not just this badge. Cheap definitive check: sample one live game every 30 s
and compare `game_time` progression against wall clock. Worth doing before TI regardless of this feature.

### Finding 6 — the fan usually has no choice to make, and the named rehearsal window is the worst case

Simultaneous **live feed rows** (series-level, which is what `LiveMatchRow` actually renders), measured over
2026-07-07 → 2026-07-30, 128 tier-1 series:

| Window | 1 live row | 2 live rows | 3 live rows | **≥2 rows** |
|---|---|---|---|---|
| All tier-1 (EWC + EPL Masters + 1win Essence) | 74% of live time | 14% | 12% | **26%** |
| Esports World Cup 2026 alone (big multi-stage LAN) | 45% | 27% | 28% | **55%** |
| **EPL Masters + 1win Essence II** (the roadmap's rehearsal window) | **95%** | 5% | 0% | **5%** |

Two consequences, both of which change the plan:

1. **The rehearsal plan as written does not work.** The tournaments named as the pre-launch rehearsal window have
   two live rows only **5% of live time**. You cannot rehearse a multi-row discovery badge on a feed that is
   almost always one row long. A replay-based rehearsal harness is required instead (see QA Scenarios).
2. **The badge must earn its place at N = 1.** For ~74% of live time there is nothing to choose between. If the
   badge is only valuable as a chooser, it is dead weight three-quarters of the time. This is precisely why
   `ONE-SIDED` matters — at N = 1 the question is not "which?" but "is this still worth opening at all?", and
   that is the state the data supports best.

### Data-quality caveats (stated, not buried)

- `radiant_gold_adv` (post-game, per-minute) is a **proxy** for `live_game_map.radiant_lead` (OpenDota `/live`
  net-worth diff). Conceptually the same quantity, different pipeline and different sampling cadence.
  **Re-verified against real `live_game_gold` history 2026-08-03** (after the flip, not before —
  see "Post-flip re-validation") — corroborated within noise, no threshold changes needed.
- Pooled observations are autocorrelated within a game. n = 3,609 is not 3,609 independent trials; the honest
  unit is **N = 104 games**.
- 1win Essence II contributes only n = 10 games. EWC coverage is partial (157 of its games fell inside the
  400-row `proMatches` cap), so EWC concurrency is likely **understated**, not overstated.
- Concurrency is measured on OpenDota-indexed games only; a tier-1 series PandaScore shows live but OpenDota
  never indexed is invisible to this measurement.

---

# User Problem

A fan lands on the homepage during a tournament window. Today the live feed tells them **who** is playing, the
series score, and which game number is running. It tells them nothing about whether any of it is worth their next
hour.

Two distinct failures:

- **N ≥ 2 (26% of live time, 55% during a big LAN):** the fan picks a row essentially at random — team-name
  recognition or feed order — and has a ~1-in-7 chance of landing on a game that is already decided
  (`FAR_AHEAD` share = 14.1%).
- **N = 1 (74% of live time):** the fan has no way to tell an active 40-minute slugfest from a 20-minute
  formality. The cost of guessing wrong is a wasted click *and* a wasted stream load — and for a **Casual** or
  **Lapsed** fan, one bad first impression is the whole relationship.

The competing products do not solve this. Liquipedia gives schedule, not state. Twitch's directory ranks by
concurrent viewers, which is a popularity signal, not a watchability one. Stratz/Dotabuff are player-analytics
surfaces, not spectator ones. **"Which live game is worth watching right now" is unowned territory, and it sits
exactly on Spectate's spectator-experience moat.**

---

# Product Goals

**User goal.** Answer "is this worth opening?" in under one second, from the feed, without a click.

**Business goals.**
- Raise click-through on live rows, and specifically raise the *quality* of those clicks (fewer opens that
  bounce within seconds).
- Convert the ambient feed from a schedule into a recommendation surface — the first step toward ranked live
  discovery, which is a compounding moat asset rather than a one-event feature.
- Land it before TI 2026's Swiss group stage, the single highest-parallelism, highest-lapsed-fan-return window
  of the year.

**Explicit non-goals.**
- Not a win-probability model. (`live-story-roadmap.md` Priority 3 owns that.)
- Not a prediction of entertainment value — Finding 5 says we cannot support that claim.
- Not a reordering of the feed in MVP (see Future Enhancements for why that is deliberately deferred).

---

# User Personas Affected

| Persona | Benefit |
|---|---|
| Hardcore follower | Primary. Multi-game triage is a job they perform several times per tournament day. |
| Casual fan | High. "Is this worth an hour" is their explicit question; they lack the net-worth literacy to answer it themselves. |
| Lapsed fan | Highest calendar leverage. Returns at TI, faces a Swiss round with several parallel BO3s, and has no context at all. |
| Regional fan | Neutral. Signal is language- and region-agnostic. |
| VOD-first / timezone-shifted | **Actively ignored.** Live-only surface, and spoiler-free mode suppresses it entirely. |
| Pub player who doesn't watch pro | Ignored. |

---

# Segment Impact

| Segment | Reach | Intensity | Recurrence |
|---|---|---|---|
| Hardcore follower | Medium (small but daily-active) | High — this is a job they already do badly, manually | Several times per tournament day |
| Casual fan | High | High — removes the main reason they bounce off a live feed | Per session, event-driven |
| Lapsed fan | Highest addressable | Very high at TI, zero otherwise | Once or twice a year, but decisive |
| Regional fan | Medium | Low | Incidental |
| VOD-first | — | — | Deliberately excluded |
| Pub player | — | — | Deliberately excluded |

The feature is strongest for the segment that is hardest to serve (lapsed) and cheapest to lose. That is the
strategic argument for shipping it before TI rather than after.

---

# Fan Calendar Timing

**Verified this session:**

- **The International 2026 (TI15):** "Road to The International" Swiss group stage **13–16 August**, best-of-three,
  16 teams cut to 8; Main Event playoffs **20–23 August**, Shanghai Oriental Sports Center; base prize pool
  $1.6M. *(Confidence: MEDIUM — Liquipedia returns 403 to automated fetches, so this comes from secondary
  aggregators. Re-verify the group-stage format on Liquipedia manually before build; the BO3 detail matters,
  see Data Feasibility.)*
- **Currently live (2026-07-30/31):** EPL Masters 2026 (BO3, OpenDota `series_type = 1`) and 1win Essence II
  (**BO2**, `series_type = 3`, corroborated by Liquipedia's own "(Bo2)" match labels), 1win Essence II running
  through at least 2 August.
- **Esports World Cup 2026:** concluded, present in the recent `proMatches` window.

**Why the calendar makes this urgent and why the Aug 8 target is right — for a different reason than stated.**

A 16-team Swiss group stage pairs teams by record and runs rounds in parallel: TI 13–16 August is the highest
simultaneous-live-row window of the entire year, and it is also when lapsed fans return. This feature has more
leverage in those four days than in the rest of the calendar combined.

But the roadmap's rationale — "must land by Aug 8 to leave a rehearsal window on 1win Essence / EPL Masters" —
rests on an assumption Finding 6 disproves. Those events give **5% multi-row live time**. The Aug 8 date is
still correct; the rehearsal it buys is not.

**Hard gates:**

1. **Public flip must land 8–10 August**, i.e. before TI group stage opens on the 13th. The standing
   freeze-discipline rule (`.claude/claude_instructions_template.md`, and the same gate applied to R4 Phase D)
   forbids flipping a public UI flag mid-Tier-1-event. If 10 August slips, the flip waits until **after 23
   August** — which forfeits the entire reason for building it now.
2. **Owner-gated build complete and verified on live data by ~4 August**, leaving 4–6 days of owner-mode
   observation across real games.
3. Rehearsal comes from the **replay harness** (QA Scenarios), not from waiting for live concurrency.

**Post-TI value.** Unlike a TI-only feature, this compounds: it is the first ranked-discovery primitive, and the
`live:signal:` state machine it introduces is reusable by every later live-discovery surface. It does not expire
on 23 August.

---

# Spoiler Policy

The badge reveals game state. It gets a policy, not a footnote.

**What it reveals:** that the running game is close, ordinary, or one-sided. It does **not** name the leading
side, show a number, or say anything about the series.

**Rules:**

1. **Fully suppressed in spoiler-free mode — all three states, no exceptions.** Same rule as `showLiveStory`
   (`SeriesLivePulse.jsx`: `const showLiveStory = !spoilerFree`). This is not negotiable and is not a
   configurable sub-preference. A row that already hides its series score behind the `?·?` curtain cannot
   coherently carry "ONE-SIDED" beside it.
2. **The badge is scoped to the running game only, never the series.** `ONE-SIDED` on Game 3 of a 1–1 BO3 says
   nothing about who wins the series. Copy must not drift toward series framing.
3. **No leading-team attribution on the feed row.** The companion sheet's momentum band names the leader
   (`{team} Far Ahead`) because the fan opted in by opening it. The feed row is ambient and unopted — it gets
   the unattributed state only. This is a deliberate divergence from `computeMomentum`'s output shape, and the
   reason the badge cannot just render `momentum.leaderName`.
4. **`ONE-SIDED` is a state, not a verdict.** Never "Over", "Decided", "Done", or "Stomp". A 6% reversal rate is
   small but real, and it produces the best content in Dota — the copy must not make the product look foolish
   the one time in sixteen it happens.
5. **New spoiler surface acknowledged as a cost.** Per the prioritization rubric, this feature adds a spoiler
   surface; rule 1 is what pays for it.

---

# Data Feasibility

**Source.** `live_game_map` (Supabase), written by `api/_handlers/liveOdCapture.js` from OpenDota `/api/live`.
Fields needed: `radiant_lead`, `game_time`, `start_time`, `radiant_name`, `dire_name`, `od_match_id`.

**Already collected for every live game, not just opened ones.** `/api/live` is a global snapshot; the capture is
not per-sheet. The roadmap already noted this. Confirmed in code: `liveOdCapture.js` filters to league games with
a real match id and both team names, with no per-series scoping.

**Freshness budget (worst case, honest):**

| Stage | Lag |
|---|---|
| OD `/live` capture cadence (`LOCK_TTL_S = 60`, floored by trigger rate) | ~60 s with a live sheet open; ~120 s on the ambient poll alone; `*/15` QStash backstop in a no-user window |
| `dota2:live_matches_*` KV cache | up to 120 s |
| Client ambient poll (`App.jsx`) | up to 120 s |
| **Total** | typical ~2–3 min, worst ~5–6 min |

**Why that is acceptable here, and would not be for a different feature.** The hysteresis design (Finding 4)
already requires a state to persist 2–4 minutes before the badge changes. A signal that is *by construction* a
sustained state cannot be meaningfully damaged by 2–3 minutes of staleness. The flicker fix and the staleness
tolerance are the same property. **This argument does not transfer to any future real-time surface (kill feeds,
Roshan timers) — those would need a different data path.**

**Correlation risk.** PandaScore series → OpenDota game correlation uses `findOdMatchByTime()` with a ±900 s
window and both team names. Same machinery as the live-score push. A series that fails to correlate simply gets
no badge — never a guessed one, and never another game's state. Same fail-closed rule as `sendScorePings`
("an unresolved game stays unresolved rather than risking another series' score").

**Known gaps that produce no badge (all acceptable):**
- Draft phase (`game_time < 0`) — nothing to read yet.
- Between games in a series — no running game, no badge.
- YouTube-only broadcasts — irrelevant here; this depends on OpenDota, not Twitch (unlike the VOD system).
- Games OpenDota `/live` does not carry.

**`computeStakes` reality check.** `computeStakes` returns `{ kind: null }` for BO1 **and BO2**. 1win Essence II
is BO2 — so on one of the two rehearsal tournaments, stakes contributes literally nothing. EPL Masters is BO3, so
stakes works there, and TI's group stage is reported as BO3 (verify). **Stakes is therefore excluded from MVP**
(see MVP Recommendation) — it is format-dependent, silent on a large share of live rows, and orthogonal to the
question the badge answers.

---

# Detailed Requirements

## R0 — Fix `momentum.js`'s thresholds first (prerequisite, ships independently)

Per Finding 3b, replace both boundaries with time-scaled ramps that keep widening past 40 minutes:

```
evenThreshold(gameTime)    =  500 +  60 × clamp(gameTimeMin, 0, 65)     //   500 →  4,400
decidedThreshold(gameTime) = 5000 + 400 × (clamp(gameTimeMin, 10, 60) − 10)  // 5,000 → 25,000
```

Both replace module-private constants and **must be exported** so `liveSignal.js` imports rather than duplicates
them. This is a **behavior change to a shipped surface** (the companion sheet's momentum band) and should ship as
its own reviewable change ahead of the badge, with `momentum.test.js` updated to assert the new contours.

## R1 — Three visual states, four conditions

| State | Meaning | Enter | Exit |
|---|---|---|---|
| **Positive** — `SWINGING` | Lead has collapsed ≥ 40% from a ≥ 5k peak (Finding 5, best signal, 3.6–4.1× lift) | retracement ≥ 0.40 | retracement < 0.25, or peak re-taken |
| **Positive** — `CLOSE` | Neither side has separated | \|lead\| ≤ `evenThreshold(gameTime)` | \|lead\| > 1.6 × `evenThreshold(gameTime)` |
| *(none)* | Ordinary competitive game | default | — |
| **Negative** — `ONE-SIDED` | One side has separated decisively | \|lead\| > `decidedThreshold(gameTime)` | \|lead\| < 0.8 × `decidedThreshold(gameTime)` |

- `SWINGING` and `CLOSE` **share one visual treatment** (see UX) and differ only in label — so the design is
  still one badge with three *visual* states (positive / nothing / negative), while using the better-evidenced
  condition whenever it applies.
- **`SWINGING` outranks `CLOSE`** when both fire; they overlap heavily (their intersection is the highest-lift
  cell measured, 3.2–3.6×) and the event framing is the more informative one.
- Retracement is computed from `live_game_gold` history: track the running peak \|lead\| and its side, then
  `retracement = 1 − (currentLeadOnPeakSide / peak)`. Requires ≥ 5k peak so a 400→200 wobble never qualifies.
- Asymmetric enter/exit values are the hysteresis band, and exist solely to answer Finding 4.

## R2 — Minimum game time

No badge before `MIN_GAME_TIME_S = 480` (8 minutes). Directly justified by Finding 2: at minute 5, 72% of games
read even, which is laning-phase noise with zero discriminating power.

## R3 — Dwell requirement, asymmetric by design

- `ONE-SIDED` requires **2 consecutive observations** of the raw condition before it renders (~4 min).
  Rationale: 6% of far-ahead games reverse. Be slow to tell a fan a game is finished.
- `CLOSE` requires **1 observation**. Rationale: "come watch this" is cheap to be wrong about, and being late is
  the worse failure — a close game may not stay close for four minutes.
- Once a state is entered, it holds until its exit condition is met (not until a single contrary reading).

## R4 — One badge, never two

A row shows at most one badge. The states are mutually exclusive by construction. No stacking with stakes,
indicators, or anything else added later.

## R5 — Feed-row scope only

MVP renders in `LiveMatchRow` only. Not `CompactSeriesRow` (completed series — `WatchBadge` already owns that
job post-game), not `UpcomingMatchRow` (no game running), not inside `LiveSeriesSheet` (the momentum band
already answers this with more detail for an opened game).

## R6 — Spoiler-free suppression

Per Spoiler Policy rule 1. Implemented at the render site, and the field is still present in the API response
(the API has no notion of the client's spoiler preference — same pattern as `seriesScore`).

## R7 — Kill switch

The badge must be disableable **without a deploy**. `feature:live-signal:enabled` KV key, fail-open on absence,
single write of `'off'` to disable. See Suggested Engineering Approach — this builds the `isFeatureEnabled()`
helper that `live-story-roadmap.md` §2a (R3 Catch Me Up) also requires.

---

# UX / UI Considerations

## Information hierarchy — the badge's visual weight *is* the ranking

The row's sub-row currently renders a centered group: `● G3 · Upper Bracket Final`. The badge joins that group.

| State | Treatment | Rationale |
|---|---|---|
| `SWINGING` / `CLOSE` | `text-red-500`, `text-[10px] font-bold uppercase tracking-wide` | Red is the system's live-state color (`DESIGN_GUIDELINES.md`), and this is a live-state fact. It reads as part of the existing red live cluster (pulse dot + `G3`) rather than introducing a fourth hue. **Both positive conditions share this treatment** — the fan's decision is identical ("open this one"); only the reason differs. |
| *(none)* | nothing rendered | Finding 1. Absence carries meaning. |
| `ONE-SIDED` | `text-gray-500 dark:text-gray-500`, same size/weight | **Deliberately recessive.** The message is "deprioritize this row"; low contrast *is* the message. |

A fan scanning four live rows sees one red `CLOSE`, two plain, one grayed `ONE-SIDED`. The hierarchy is legible
pre-attentively, with no legend and no new color token.

**Do not use purple** (reserved for watch/VOD), **do not use amber/yellow** (reserved for followed teams and
Grand Final), and do not introduce a flame/fire glyph — decorative, and it would imply the predictive claim
Finding 5 says we cannot make.

## Copy

- `CLOSE` — present tense, factual, verifiable at render time.
- `ONE-SIDED` — present tense, non-judgmental, non-predictive.

Rejected: "Heating Up" (implies a derivative we have not validated), "Must Watch" (collides with the post-game
`WatchBadge` vocabulary and makes the predictive claim), "Over"/"Decided"/"Stomp" (violates the "state, not fate"
rule that already governs `computeMomentum`).

## Mobile (375px first)

`LiveMatchRow`'s sub-row label is absolutely centered with a `max-w` reservation that already scales with the
mobile watch-button count (1 or 2 × 44px). Adding a third token to `G3 · Upper Bracket Final` risks overflow at
375px.

**Rule: the badge wins, `bracketRound` yields.** When a badge is present and the viewport is below `sm:`, drop
`bracketRound` from the sub-row. Of the three tokens it is the least actionable — the tournament card header
above already establishes the event context. Order becomes `● G3 · CLOSE`. This is a concrete, testable layout
rule, not a "it should fit" hope.

Desktop keeps all three: `● G3 · Upper Bracket Final · CLOSE`.

## Accessibility

- The badge is real text, not a color-only cue.
- **Contrast:** `text-gray-400` (#9ca3af) on white is ~2.6:1 and fails WCAG AA at 10px. Use `text-gray-500`
  (#6b7280, ~4.8:1 on white) in **both** light and dark modes for `ONE-SIDED`. `text-red-500` on both surfaces
  already passes at this weight elsewhere in the row.
- Screen readers: the badge needs context, since "CLOSE" alone is ambiguous (it reads as a verb). Provide an
  `aria-label` on the badge span: `"Current game is close"` / `"Current game is one-sided"`.
- No animation. The pulsing dot already present is the row's single motion element; a second would violate the
  one-signature-motion rule.

## State handling

| State | Behavior |
|---|---|
| Loading / first paint | No badge. Never a skeleton — a 10px label does not deserve a placeholder, and a shimmering badge implies data that may never arrive. |
| Empty (no telemetry) | No badge. Indistinguishable from "ordinary game" by design; this is honest, since we genuinely do not know. |
| Stale (capture gap) | No badge once the underlying row's `game_time` is older than `STALE_MAX_S` (see Edge Cases). Silently drops rather than showing a frozen state. |
| Spoiler-free | Suppressed entirely. |
| Error (Supabase/KV down) | `signal` absent from the response; feed renders exactly as it does today. Must never fail the response. |
| Partial (some series correlate, some don't) | Per-row. Some rows badged, some not — normal and expected. |
| Offline / PWA | Cached payload renders its last-known badge. Acceptable: the whole payload is equally stale, and the badge is no staler than the score beside it. |

## Transitions

When a badge appears, disappears, or changes on a poll-driven repaint: **no animation, no layout shift.** The
sub-row already has a fixed `min-h`. The dwell requirement (R3) makes changes rare enough that a fan will
rarely witness one mid-scan.

---

# Technical Considerations

## The batched cross-game query already exists — reuse it, do not rebuild it

This is the single most important engineering instruction in this spec, and it is backed by two standing project
rules (`feedback_reuse_existing_logic`, `feedback_ps_od_matching`).

`api/live-matches.js` already contains the exact pipeline, written for the live-score push and already
unit-tested:

- `collectRunningGames(rawMatches)` (~line 417, exported, pure) — the running game of each PS series, with both
  opponent names.
- One batched `live_game_map` range query over the union `[min(startedAt) − 900, max(startedAt) + 900]` window
  (~lines 481–490).
- `correlateLiveScores(runningGames, rows)` (~line 441, exported, pure) — correlates via the canonical
  `findOdMatchByTime()`.

**Extract the query into a shared `resolveRunningPulses(rawMatches, log)` and call it from both
`sendScorePings()` and the new response-path enrichment.** Under no circumstances write a second PS↔OD matcher.

## Where the computation belongs — response path, not cron

**Decision: enrich on the normal (client-poll) response path, inside the KV cache regeneration.**

Rejected alternatives:

- *Compute in the `cron=1` path and stash it.* The capture cron is `*/15`. A 15-minute-old "is this game close"
  read is worse than no read.
- *A separate `?mode=live-signal` endpoint.* Adds a second client poll for a two-word label. The dwell design
  (R3) means sub-2-minute freshness has no value, so the extra round trip buys nothing. Reject.
- *Client-side computation from an exposed raw lead.* Would put the raw net-worth number in the feed payload,
  creating a spoiler surface far larger than the badge itself, and would put hysteresis state in per-client
  memory where it resets on every navigation. Reject.

## Hysteresis state persistence

The dwell/hysteresis machine needs memory across cache regenerations (the handler is stateless and the payload
is regenerated from scratch every ~2 min).

- Key: `live:signal:{seriesId}`
- Value: `{ state, raw, streak, since, peak, peakSide }`
- TTL: 4 h (matches `SCORE_SIGNATURE_TTL_S` — a per-game signature only needs to outlive one game)
- Access: one pipelined `mget` for all live series, one pipelined write. **Two KV round trips per cache
  regeneration — once per ~2 minutes globally, not per user.**

The 2-minute cache regeneration is the natural observation tick. `ONE-SIDED`'s 2-observation dwell therefore
lands at ~4 minutes; `CLOSE`'s 1-observation dwell is immediate on the next regeneration.

**`SWINGING` needs no extra query.** The obvious implementation reads `live_game_gold` history to find the peak
lead — a second Supabase query per series, which would be the most expensive thing in this feature. Don't. The
running peak accumulates in the KV state above (`peak`, `peakSide`) from the same 2-minute observations already
being made, so retracement costs zero additional I/O.

Accepted degradation: on a cold start (key expired, or deploy landed mid-game) the peak begins from "now", so an
already-in-progress comeback is missed until a fresh peak forms. It fails toward **no badge, never a false one** —
and a cold start mid-game is precisely when we have no standing to claim a comeback anyway.

## Failure isolation

The entire enrichment sits in one `try/catch`. Any failure — Supabase, KV, correlation, the pure helpers —
results in `signal` being absent and the feed rendering exactly as today. Same discipline as `sendScorePings`
("its failure can't fail the capture"). The live feed is the product's highest-traffic surface and is about to
carry TI; a discovery nicety must never be able to take it down.

## Cache key

Bump `dota2:live_matches_v4` → `dota2:live_matches_v5`. Per `CONTEXT.md`'s standing rule ("Live match KV cache
must be busted after deploying new fields"), a key bump is preferred over `?bust=1` here because it is atomic
across regions and cannot be half-applied.

## New pure module

`src/utils/liveSignal.js` — zero React, zero browser-only imports, so `api/live-matches.js` can import it
directly. Same cross-boundary rule already established by `src/utils/liveScore.js`, `src/seriesLogic.js`, and
`src/teamMatching.js`.

Exports (all constants exported so tests derive expectations from the real values rather than duplicating magic
numbers — the drift hazard `liveGamePulse.js` documents from experience):

- `MIN_GAME_TIME_S`, `CLOSE_ENTER`, `CLOSE_EXIT`, `ONE_SIDED_EXIT_FACTOR`, `ONE_SIDED_DWELL`, `STALE_MAX_S`
- `rawSignal({ radiantLead, gameTime })` → `'CLOSE' | 'NEUTRAL' | 'ONE_SIDED' | null`
- `applyHysteresis(raw, prior, nowSec)` → `{ state, raw, streak, since }`

Both pure, both fully unit-testable without network, KV, or React.

---

# Data Requirements

| Need | Source | Freshness | Reliability |
|---|---|---|---|
| Running game's net-worth lead | `live_game_map.radiant_lead` | ~60–120 s | High when correlated; absent otherwise |
| In-game clock | `live_game_map.game_time` | same row | High |
| PS series ↔ OD game correlation | `findOdMatchByTime()` + both team names | resolve-time | Fail-closed; no badge on failure |
| Prior hysteresis state | KV `live:signal:{seriesId}` | 4 h TTL | Fail-open (missing prior = cold start, `streak = 1`) |

No new table, no new column, no new capture, no new third-party dependency, no schema migration.

**Threshold re-validation:** rerun the Finding 1/2/3 analysis against `live_game_gold` history for real
production games (the table has never been pruned and holds full per-game series), replacing the
`radiant_gold_adv` proxy with the exact production signal. **Done 2026-08-03** (after, not before, the
public flip) — see "Post-flip re-validation." Result corroborated the original calibration.

---

# Edge Cases

| Case | Behavior |
|---|---|
| Draft phase (`game_time < 0`) | No badge. Gated before any threshold math. |
| `game_time` between 0 and 480 s | No badge (R2). |
| Between games in a series | No running game → no badge. Any stale prior state is not rendered. |
| Series has no correlated OD row | No badge. Never inferred, never carried over from a previous game. |
| Two live series correlate to the same OD game | `findOdMatchByTime()` disambiguates on both team names. If ambiguity survives, badge neither — a wrong badge is worse than none. |
| Game paused (long pauses are routine in tier-1) | `game_time` freezes; `radiant_lead` freezes. State holds. Correct behavior: a paused game genuinely has not changed. |
| Capture gap / OpenDota `/live` outage | Row's `captured_at` ages. Suppress the badge once the read is older than `STALE_MAX_S` (recommend **600 s** — 5× the worst normal cadence, so it fires only on real outages). |
| Game ends mid-cache-window | PandaScore drops the game to `finished`; `collectRunningGames` skips it. No badge. |
| Series ends | Row leaves the live feed entirely. `live:signal:` key expires on its own TTL. |
| Massive lead reversal (mega comeback) | Exit condition (0.8 ×) fires and the badge clears within one observation. Correct — and this is the 6% case the copy was written to survive. |
| Clock/timezone | `game_time` is in-game seconds, not wall clock. No timezone exposure anywhere in this feature. |
| Multi-tab | Each tab polls independently; hysteresis state is server-side, so all tabs agree. This is a benefit of the server-side design. |
| Spoiler-free toggled mid-session | Badge disappears/reappears on the next render. No refetch needed — the field is already in state. |
| `radiant_lead` is `null` (row captured pre-migration or mid-draft) | `rawSignal` returns `null`. No badge. |
| Feature flag set to `'off'` | Enrichment skipped entirely; no Supabase query, no KV reads. |

---

# Analytics & Tracking

**The one dimension that matters: `liveRowCount`.** Finding 6 says the feature's value is concentrated in the
26% of live time with ≥2 rows. Every event must carry the number of live rows visible, or the results will be
uninterpretable.

| Event | Payload | Fires |
|---|---|---|
| `live_signal_shown` | `{ state, seriesId, tournament, liveRowCount }` | Once per (seriesId, state) transition per session — **not per render**, or the 2-minute poll will flood it |
| `live_signal_click` | `{ state, seriesId, tournament, liveRowCount, rowPosition }` | On live-row click; `state` is `'none'` when unbadged |
| `live_signal_resolved` | `{ total, close, oneSided, neutral, unresolved }` | Server-side log line per cache regeneration |

`live_signal_resolved.unresolved` is the **correlation-reliability proxy** — the analogue of
`live_map_state_omitted` for the tower map. A step change means PS↔OD correlation broke; watch it after any
PandaScore behavior change.

## Success metric and pre-registered kill criterion

**Primary:** CTR on live rows carrying `CLOSE` vs. rows carrying no badge, **restricted to sessions where
`liveRowCount ≥ 2`**. That is the only clean test of the feature's stated job.

**Secondary:** CTR on `ONE-SIDED` rows should be *lower* than unbadged rows. If it is not, the badge is not being
read at all, and the visual treatment has failed.

**Tertiary:** live-row clicks per live session (does the badge increase exploration, or focus it?).

**Kill criterion, agreed before launch:** if `CLOSE`-row CTR is not ≥ **1.3×** unbadged-row CTR at
`liveRowCount ≥ 2` by the end of TI (23 August), remove the badge. Pre-registering this matters because
Finding 5 means we are shipping on a plausible mechanism, not on validated predictive power — so the launch is
itself the experiment, and it needs a stopping rule written down before the results are in.

---

# QA Scenarios

## The replay harness (highest-value item here — do this first)

`live_game_gold` holds complete per-game net-worth history for every live game captured since the Live Story
build, and **its documented 48 h prune has never been implemented** (`live-story-roadmap.md`, "Adjacent tech
debt"), so the full corpus is sitting in the table right now.

Build a test that replays that history through `rawSignal()` + `applyHysteresis()` at the real capture cadence
and asserts, per game: state-transition count, time-to-first-badge, and time spent in each state. This gives
hundreds of real games of rehearsal **without waiting for live concurrency** — which Finding 6 says will not
arrive before Aug 8. It also directly re-validates the thresholds against production data rather than the
`radiant_gold_adv` proxy.

**A one-off version of exactly this replay was run manually 2026-08-03** (see "Post-flip re-validation" —
`nextSignalState` replayed over 183 tier-1 `live_game_gold` games, 95.7% correct `ONE_SIDED` calls). That
closed the calibration risk but was an ad-hoc script, not a persisted test — turning it into a real
`__tests__/live-signal-replay.test.js` (fixture: a handful of real games' `(game_time, radiant_lead)`
series + their outcome) is still open as a regression guard, so a future threshold tweak can't silently
break what was just validated.

Concrete acceptance targets, derived from Finding 4 (baseline 4.5 transitions/game, 58% of games ≥ 4):
- **Mean badge transitions per game ≤ 2.0**
- **≤ 10% of games with ≥ 3 transitions**

If hysteresis does not achieve that, tune `CLOSE_EXIT` / `ONE_SIDED_EXIT_FACTOR` / dwell before shipping.

## Unit tests (`src/__tests__/live-signal.test.js`)

- `rawSignal` returns `null` for `gameTime < MIN_GAME_TIME_S`, `gameTime < 0`, non-finite `radiantLead`.
- The 0.8× exit factor produces genuine hysteresis: a lead oscillating across `farAheadThreshold` does not
  oscillate the state.
- `CLOSE` enters on 1 observation; `ONE_SIDED` requires 2.
- A `null` prior (cold start) behaves as `streak = 1`, never throws.
- Constants imported from `momentum.js` are the same objects, not copies (guards against threshold drift).

## Integration tests (`__tests__/live-matches-signal.test.js`)

- A Supabase failure yields a response identical to today's, with no `signal` key anywhere.
- A KV failure yields badges computed with cold-start dwell (degraded, not broken).
- Only ONE `live_game_map` query is issued for N running series (assert call count — this is the "batched"
  requirement, and it is the thing most likely to silently regress).
- `feature:live-signal:enabled = 'off'` skips the query entirely.

## Component tests (`src/__tests__/live-match-row-signal.test.jsx`)

- `spoilerFree` suppresses all three states.
- Below `sm:`, `bracketRound` yields to the badge; above `sm:`, both render.
- `aria-label` present and state-appropriate.
- No badge renders when `signal` is absent or `'NEUTRAL'`.

## Manual QA (deployment checklist)

- **Real 400px mobile viewport on a live game** — mandatory per the deployment checklist and per the R4 Phase D
  precedent, which found a real visual bug no test caught.
- Light + dark, both states, with and without followed-team amber treatment (amber row + red badge is the
  contrast case most likely to look wrong).
- A followed-team row that is also `ONE-SIDED` — amber row background, gray badge. Verify legibility.
- Mocked 4-row live feed showing all three states simultaneously (the multi-row visual case that live rehearsal
  will not provide).

---

# Risks & Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| **Predictive claim is unvalidated** (Finding 5) | High | Copy is a present-tense state read, never a prediction. Pre-registered kill criterion. |
| **Badge flicker** (Finding 4) | High | Hysteresis + dwell + replay-harness acceptance targets. |
| **Cannot rehearse multi-row before TI** (Finding 6) | High | Replay harness + mocked 4-row viewport QA. Accept that live multi-row rehearsal will be thin. |
| **Thresholds derived from a proxy metric** | ~~Medium~~ Closed 2026-08-03 | Re-validated against real `live_game_gold` data (183 tier-1 games, see "Post-flip re-validation") — corroborated the original calibration within noise. KV kill switch (`feature:live-signal`) remains the backstop. |
| **Touches the highest-traffic endpoint right before TI** | Medium | Full failure isolation; KV kill switch (only remaining gate — the owner gate was removed at the public flip). |
| **Extra Supabase query on the hot path** | Low | One batched range query per ~2-min cache regeneration, not per request. Already the proven pattern in `sendScorePings`. |
| **Correlation failures leave rows unbadged** | Low | Fail-closed by design. Monitor `live_signal_resolved.unresolved`. |
| **TI 2026 group format unverified** (BO3 per secondary sources) | Low for MVP | Stakes is excluded from MVP, so a BO2 group stage would not change the build. Verify anyway. |
| **A "close" badge on a genuinely boring close game** | Low | Two evenly-farming teams doing nothing is a real failure mode we cannot detect from net worth alone. Accepted; kill criterion catches it if it dominates. |

**Dependencies:** none external. No new table, migration, provider, cron, or env var. `farAheadThreshold` must be
exported from `momentum.js` (trivial, no behavior change). `isFeatureEnabled()` is new but small, and
`live-story-roadmap.md` §2a already requires it independently.

---

# MVP Recommendation

**Build:**
0. **(prerequisite, ships separately)** R0 — time-scaled `evenThreshold` / `decidedThreshold` in
   `src/utils/momentum.js`, exported, with `momentum.test.js` updated. Fixes a live miscalibration in the
   companion sheet regardless of whether the badge ships.
1. `src/utils/liveSignal.js` — pure state machine, thresholds imported from `momentum.js`, retracement tracked
   via KV peak (no extra query).
2. `resolveRunningPulses()` extracted from `sendScorePings()`; both callers share it.
3. Response-path enrichment in `api/live-matches.js` with KV hysteresis state, full failure isolation, KV key
   bump to `_v5`.
4. `isFeatureEnabled()` in `api/_shared.js` + `feature:live-signal:enabled`.
5. Badge render in `LiveMatchRow` — three states, mobile `bracketRound` yield rule, spoiler-free suppression.
6. Replay harness + the unit/integration/component tests above.
7. GA4 events with `liveRowCount` on every one.
8. `DESIGN_GUIDELINES.md` badge pattern entry; `CONTEXT.md` feature entry; `public/llms-full.txt` schema update.

**Explicitly excluded from MVP:**
- **Series stakes on the row.** Format-dependent (silent on every BO1/BO2 — including 1win Essence II), and it
  answers a different question. Revisit after the badge's CTR data exists.
- **Feed reordering.** Highest-value follow-on, highest-risk change. Reordering rows under a scrolling thumb is a
  known mobile UX failure, and doing it on a 2-minute poll would move a row out from under a fan's finger. Needs
  its own design pass.
- **Kill-pace / high-kills signal.** Cheap (`radiant_score`/`dire_score` already ride the same row) but the
  weakest thing measured — 1.15–1.65× lift, and that is an *optimistic* figure since the test used final kill
  totals rather than in-flight pace. Not worth a state.
- **Naive "swing in the last 5 minutes."** Fires on 38–64% of games by minute 30 and showed no lift in the first
  pass. The *retracement-from-peak* formulation (R1 `SWINGING`) is the version that works; do not substitute the
  simpler one.
- **Roshan timer, Rapier, Rampage, mega creeps, teamfight markers.** Finding 5b: none exist in the live feed.
  Blocked on a Steam Web API key + a `GetRealtimeStats` spike, which is deliberately off this feature's path.
- **The badge on `CompactSeriesRow` / `UpcomingMatchRow`.** No running game to read.

**Effort:** M. The hard architectural work (batched cross-game correlation) is already built and tested; the new
work is a small pure module, a KV state machine, one render site, and the test harness.

**Timeline:**

| Date | Milestone |
|---|---|
| Aug 1 | Build + owner-gated deploy |
| **Aug 3** | **Public flip (actual — ahead of the Aug 8–10 target; threshold re-validation on `live_game_gold` not completed first, see Status)** |
| Aug 13–23 | TI 2026: observe, do not touch (freeze) |
| Aug 24 | Evaluate against the pre-registered kill criterion |

---

# Future Enhancements

1. **Stakes context from fields we already fetch** (Finding 5d) — `tournament.tier`, `type` (LAN vs online),
   `has_bracket` (elimination), `prizepool`, `region`. Zero new requests, **spoiler-free**, and it covers the
   draft phase / first 8 minutes / between-games windows where telemetry is blind. Strongest and cheapest
   follow-on. Must be a separate surface from the telemetry badge, not merged into it.
2. **Ranked live feed** — sort live rows by signal when `liveRowCount ≥ 2`. The obvious next step and the real
   prize; needs its own spec for the scroll-stability problem.
3. **Kill-pace as a second dimension** — evaluate via the replay harness before speccing.
4. **PandaScore plan upgrade for `/games/{id}/frames`** (Finding 5c) — per-player live telemetry for tier-S
   events, currently 403. A commercial decision, not an engineering one. Validate the schema before paying.
3. **Trained live win-probability model** (`live-story-roadmap.md` Priority 3) — this feature produces the
   labeled live→final dataset that model needs. Every badge computed is a training row.
4. **Signal in the live-score push** — "this one's close" as a re-entry hook. Opt-in only; the push catalog's
   spoiler discipline applies.
5. **Signal in the PWA badge / tab title** — probably not. Those surfaces are about *your* teams, not
   discovery.
6. **Cross-tournament "best game right now"** — the natural endpoint of this line of work, and genuinely
   defensible territory no competitor occupies.

Design constraint to preserve: keep `liveSignal.js` pure and its state vocabulary open. A fourth state must be
addable without touching the transport, the KV shape, or the render site's structure.

---

# Suggested Engineering Approach

*(Direction only — no production code in this spec.)*

**Phase 1 — pure core.** `src/utils/liveSignal.js`. Export `farAheadThreshold` from `momentum.js` and import it
rather than reimplementing the ramp. Full unit coverage before anything touches the API.

**Phase 2 — replay harness.** Drive Phase 1 over real `live_game_gold` history. Tune constants until the
transition-count targets are met. **Do this before writing the API integration** — the constants are the risky
part, not the plumbing.

**Phase 3 — shared resolver.** Extract `resolveRunningPulses(rawMatches, log)` from `sendScorePings()`. Verify
the push path is behaviorally unchanged (its existing tests should pass untouched). No new PS↔OD matching.

**Phase 4 — API enrichment.** Response path only, inside cache regeneration. `mget` priors → apply hysteresis →
attach `signal` to each mapped match → pipelined write-back. One `try/catch` around the whole thing. Bump the KV
key. Gate on `isFeatureEnabled('live-signal')`.

**Phase 5 — render.** `LiveMatchRow` sub-row, three states, mobile yield rule, `aria-label`, spoiler-free
suppression, GA4 events.

**Phase 6 — docs.** `DESIGN_GUIDELINES.md` (new badge pattern), `CONTEXT.md` (feature + the `_v5` key bump),
`public/llms-full.txt` (response-schema field), Release Notes + About page **at the same time as the public
flip**, per the Owner-Only Features convention.

---

# AI + Search Discoverability

Assessed against `.claude/ai_discoverability.md`. This feature falls under **"New data field exposed in the UI"**,
not "new public route" or "new entity type" — so most of the checklist does not apply, and saying so explicitly
is the point of this section.

- **New public route?** No. Enriches an existing row on `/`. No `middleware.js` matcher, handler, canonical, OG
  tag, or JSON-LD change.
- **New entity type?** No. No new URL pattern, no new node in the knowledge graph.
- **Bare-HTML crawler content?** **Nothing, deliberately.** The signal is transient live state with a ~2-minute
  half-life. Injecting it into the server-rendered root div or the homepage `WebSite` schema would publish a
  claim that is false within minutes and would degrade, not strengthen, the site's factual authority. This is a
  deliberate exclusion, recorded so a future discoverability audit does not read it as an oversight.
- **New API endpoint or mode?** No. One additive optional field on an existing response — no entry needed in the
  Machine-Readable Endpoints section.
- **`public/llms.txt`?** No change. The live-matches endpoint is already listed (line 206).
- **`public/llms-full.txt`?** **Yes — required.** The `GET /api/live-matches` response schema (line 231) must gain:
  `"signal": "string | null ('CLOSE' | 'ONE_SIDED') — state of the currently running game; absent when no
  running game correlates, during the draft phase, or before 8 minutes of game time"`. This is the one mandatory
  discoverability deliverable, and it genuinely helps: an agent reading the schema learns the field can be
  absent, which is the thing most likely to be mishandled.
- **Entity relationships strengthened?** Marginally — it enriches the match↔broadcast relationship with a live
  quality dimension. Not enough to claim as a benefit.
- **Long-term citation target?** **No, and it should not become one.** Durable per-match narrative belongs on
  `/match/:id` via the post-game path already tracked in `live-story-roadmap.md` Priority 3 ("feed live telemetry
  into the durable post-match page"). That is the citation play; this is not.

---

# Open Questions

1. **`ONE-SIDED` — ship it or not?** It is the state with the strongest evidence (95.7%, n = 83 games) and the
   most actionable one, but it is also the one that tells a fan *not* to watch. Do we want a product that
   actively de-recommends? **My recommendation: yes** — a recommender that never says no is not trusted, and
   the data supports this state far better than the other. But it is an owner call about product voice, and it
   is the one decision in this spec I would not make unilaterally.
2. ~~`CLOSE_ENTER` at 1,000 or wider?~~ **Answered by Finding 3b.** Neither — it must be time-scaled. The
   replacement ramp roughly doubles `EVEN` coverage (14.1% → 22.3%) while *keeping* it a genuine coin flip
   (53.2% → 54.7%), and simultaneously makes `DECIDED` more accurate. Remaining sub-question: cap the `EVEN`
   ramp at 65 min, or let it keep growing? Only 227 games in the corpus run past 60 min, so the tail is thin.
3. **Kill criterion at 1.3×** — is that the right bar, and is 23 August the right date, given TI will dominate
   the sample?
4. **Should the badge appear in `LiveSeriesSheet` for consistency?** I say no (the momentum band already answers
   this with more detail for an opened game), but the 2026-07-30 consistency audit found real drift between the
   sheet and the drawer, so this is worth an explicit decision rather than an omission.
5. **Does `live_game_gold`'s never-implemented prune need to happen before or after this?** The harness *depends*
   on that unpruned history existing. Recommend explicitly deferring the prune until after this ships, and
   noting the dependency in `.claude/pending-refactors.md` so nobody deletes the corpus mid-build — the same
   mistake this project already avoided once during the R4 decode work.
6. **Verify TI 2026's group-stage format on Liquipedia manually** (403s to automated fetches). Does not block
   MVP, since stakes is excluded — but it determines whether stakes is worth adding in the first iteration after.
7. **Broadcast delay (Finding 5b) — is the site 15 minutes ahead of the stream?** This is the one question here
   that could affect *already-shipped* surfaces, not just this feature. Recommend running the 30-second-sampling
   check before TI independently of this build. If the answer is "yes, we're ahead," it is a spoiler problem for
   the live score row, tab title and score push, and this badge inherits it.
8. **Get a Steam Web API key and spike `GetRealtimeStats`** (~30 min). Would settle the Roshan-timer and
   per-player-net-worth questions that `live-story-roadmap.md` Priority 3 has carried unresolved. Explicitly
   **not** on this feature's critical path and **not** before TI — but it is the only door to the event-class
   signals (Roshan, Rapier, mega creeps) that do not exist in OpenDota's live feed at all.
9. **Is `SWINGING` worth the added state, or does it over-complicate the MVP?** It is the best-evidenced signal
   found (3.6–4.1× lift, well-powered) and costs no extra I/O, which argues yes. Against: it adds a second
   positive condition and a peak-tracking state to a feature whose main risk is already complexity under a TI
   deadline. A defensible descope is to ship `CLOSE`/`ONE-SIDED` only and add `SWINGING` in the first iteration.

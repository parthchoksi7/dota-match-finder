# STRATZ API — Access Audit

**Status:** Audit complete 2026-08-01. No integration built. Backlog item: `.claude/product-backlog.md` #23.
**Related:** `.claude/specs/live-worth-watching-signal-spec.md` (Findings 5b–5e cover the OpenDota/PandaScore side of the same question), `.claude/specs/live-story-roadmap.md` Priority 3 (Roshan timer, trained win-probability model — both partly answered here).

Everything below was **empirically verified this session against the live API with a real token**, not read from documentation. Where a claim could not be verified, it says so.

---

## Connection facts

- Endpoint: `https://api.stratz.com/graphql` (POST)
- Auth: `Authorization: Bearer $STRATZ_TOKEN` — token is in `.env.local` (gitignored), **never** commit it
- **`User-Agent: STRATZ_API` is mandatory on every request.** Verified that Node's `fetch` actually transmits a custom UA (echoed back by a test service) — this is not a header you can set and forget without checking, since some HTTP clients silently drop it.
- Rate limits observed on the current token: **150/min · 1,500/hour · 15,000/day**, returned in `x-ratelimit-*` response headers.
- Current patch reported by `constants`: **7.40b**

---

## What works (verified with real responses)

| Root | Notes |
|---|---|
| `match(id:)` | Full post-game match incl. per-player `imp`, `position`, `role`, `award` |
| `player(steamAccountId:)` | Profile, match counts |
| `team(teamId:)` / `teams(teamIds:[])` | `teams` takes `teamIds`, **not** `request` |
| `league(id:)` / `leagues(request:)` | `LeagueRequestType` filters: `leagueIds`, `tiers`, `hasLiveMatches`, `leagueEnded`, `isFutureLeague`, date ranges, `orderBy`, `take`, `skip` |
| `heroStats` | `winHour/Day/Week/Month`, `matchUp`, `heroVsHeroMatchup`, `laneOutcome`, `itemFullPurchase`, `itemStartingPurchase`, `itemBootPurchase`, `itemNeutral`, `talent`, `banDay`, `rampages`, `guide` |
| `constants` | Heroes, items, abilities, game versions |
| `plus` / `vendor` / `yogurt` | Roots reachable; subfields need specific args, not explored |

`LeagueTier` enum: `UNSET, AMATEUR, PROFESSIONAL, MINOR, MAJOR, INTERNATIONAL, DPC_QUALIFIER, DPC_LEAGUE_QUALIFIER, DPC_LEAGUE, DPC_LEAGUE_FINALS`

---

## Genuinely new vs. OpenDota + PandaScore

These are the only reasons to integrate at all — everything else we already have.

### 1. `match.players[].imp` — Impact score
STRATZ's proprietary per-player impact metric. **No equivalent in OpenDota or PandaScore.** Verified sample: `{"name":"hahaxd","imp":3,"position":"POSITION_2","role":"CORE","award":"MVP"}`.

**Methodology (confirmed 2026-08-02 via STRATZ's own knowledge base + Medium post, not inferred):** scale is **-100 to +100**, with **0 as a fair baseline** — every player starts at 0 regardless of draft advantage or rank, so the score measures *how much their performance moved their team's win probability*, not an absolute "good/bad" judgment. Positive = increased their team's win probability; negative = decreased it. Computed by a neural network over ~22 per-hero stat inputs (plus team composition and rank as context), evaluated at each minute of the game. **Known limitation: calculated over roughly the first 90% of the game**, so a genuine late-game comeback play won't fully register. Sources: [STRATZ Knowledge Base — How is IMP calculated](https://stratz.com/knowledge-base/General/How%20is%20IMP%20calculated), [STRATZ Medium — IMP: Decoding Your Performance](https://medium.com/stratz/imp-decoding-your-performance-c251dcb42b93).

**`award` enum (confirmed live 2026-08-01, not just the one MVP sample):** `NONE` (no award — the common case), `MVP`, `TOP_CORE`, `TOP_SUPPORT`. Product decision: only `MVP` is surfaced in the UI; `TOP_CORE`/`TOP_SUPPORT` are treated the same as `NONE` (no badge) to keep the trophy scoped to one per-match distinction.

### 2. `position` (POSITION_1–5) and `role` (CORE / LIGHT_SUPPORT / HARD_SUPPORT)
**Directly restores a deleted feature.** `CONTEXT.md` records under Known Issues: *"Role detection (Carry/Mid/Off/Support) is removed - OpenDota `lane_role` field is unreliable."* STRATZ classifies position and role properly. This is the single highest-confidence win in the audit, because the product already wanted it and gave up on it for data-quality reasons that no longer apply.

### 3. `match.players[].award` — per-match MVP
No equivalent anywhere else in the stack.

### 4. `match.players[].playbackData` — per-player event timelines
Fields: `killEvents`, `deathEvents`, `assistEvents`, `csEvents`, `goldEvents`, `experienceEvents`, `playerUpdatePositionEvents` (map positions over time), `playerUpdateGoldEvents`, `playerUpdateLevelEvents`, `playerUpdateHealthEvents`, `playerUpdateBattleEvents`, `abilityLearnEvents`, `abilityUsedEvents`, `abilityActiveLists`, `itemUsedEvents`.

OpenDota gives team-level `radiant_gold_adv` only. **Teamfight detection is derivable** from clustered kill/death timing — one of the signals previously assessed as unavailable in `live-worth-watching-signal-spec.md` Finding 5b.

### 5. Fills two PandaScore plan gaps
- **`team.winCount` / `lossCount` / `isPro`** and **`team.heroPickBan`** (draft tendencies, args `HeroPickBanRequestType!`) — PandaScore **403s** `/dota2/teams/{id}/stats`
- **`league.series`** — series grouping with `BEST_OF_THREE`/`BEST_OF_FIVE` and per-team win counts. PandaScore **404s** `/dota2/series/{id}` on our plan. *(Subject to the indexing gap below.)*

### 6. `heroStats` depth
Orders of magnitude deeper than OpenDota's (which carries only ~1,299 total pro picks — see spec Finding 5e). Filterable by `bracketIds`, `positionIds`, `regionIds`, `gameModeIds`.

**Important limitation:** these are **bracket-scoped (pub) stats, not pro-scoped** — no league filter was found on `winMonth`. So this does *not* directly enable a pro-draft model. `heroVsHeroMatchup` and `laneOutcome` remain better draft primitives than anything currently available.

---

## What is denied or empty

### `live { match }` / `live { matches }` → **null / zero rows**
The headline negative. Tested against 4 live **league** matches and 4 live **pub** matches sourced from OpenDota `/api/live` at the same moment OpenDota reported **100 live games**. Every one returned `null`; `live { matches }` with no limit returned 0 rows.

- **No GraphQL error is raised** — it fails silently rather than returning a permission error.
- Null for pubs as well as league matches **rules out league-coverage** as the explanation.
- `isRedisOnline: true` and `steamApiDetail.isOnline: true`, so the general pipeline is up.
- Could **not** definitively separate "token not entitled" from "live ingestion down", because `stratz.status.rabbitDetail` — which holds the `matchLive` queue health — is admin-gated and returns null for us.
- Entitlement is the more likely read, since a production consumer (`dotabod/backend`, `packages/dota/src/stratz/livematch.ts`) depends on this exact query shape.

**The live schema, if access is ever granted** (from `TheAmazingLooser/STRATZ_Models`, generated by introspection — schema only, never observed carrying data on our token):
- `liveWinRateValues { time winRate }` — live win-probability time series
- `playbackData.roshanEvents { time isAlive respawnTimer }` — the Roshan timer (`live-story-roadmap.md` Priority 3)
- `playbackData.buildingEvents { time type isAlive isRadiant npcId positionX positionY }` — **barracks state**, which `building_state` provably cannot decode (R4.0 disproof)
- Per-player live: `networth`, `gold`, K/D/A, `itemId0..5` (→ live Rapier detection), `respawnTimer`, `ultimateCooldown`, `impPerMinute`, `position`

### Other denials
- **`matches(ids:[])`** (batch fetch) → `"User is not an admin."` Singular `match(id:)` works fine — so the loss is batching, which matters for cost at scale.
- **`stratz.status.rabbitDetail`** → null (admin-gated).

---

## The coverage gap that limits everything league-level

**Current 2026 tier-1 leagues are not indexed at league level.** `league(id:)` returns **null** for:

| Valve league id | Event | `league(id:)` |
|---|---|---|
| 20009 | 1win Essence II | **NOT INDEXED** |
| 20026 | (live, tier-1) | **NOT INDEXED** |
| 19917 | (live, tier-1) | **NOT INDEXED** |
| 18324 | The International 2025 | ✅ `INTERNATIONAL`, prizePool 1600000 |

So `league.standings`, `league.tables`, `league.nodeGroups` (brackets) and `league.series` are unavailable **for exactly the events the product covers**, even though the fields exist and work on older majors.

**But match-level data resolves for those same matches.** `match(id:)` on games from those leagues returns duration, winner, and 10 players with `imp`/`position`/`role` — with `leagueId` populated but the `league` object null.

**Practical rule:** treat match-level and hero-level data as usable today; treat `league.*` and `live` as unavailable until re-verified for the specific event.

---

## Recommendation

**Do not build against `live` or `league.*`.** The usable-today value is **post-game match enrichment** — role/position labels, MVP, and impact scores on `MatchDrawer` and `/match/:id`. Those are durable, citable facts (good for the AI-discoverability strategy in `.claude/ai_discoverability.md`), unlike live state which expires in minutes.

This audit does **not** change the T1.1 live-badge spec: that feature needs live telemetry, and STRATZ live is empty for us.

**Open action:** a token upgrade request drafted at `.claude/stratz-api-request.md` (local-only) asks specifically for `live` root access, noting that it fails silently rather than erroring. STRATZ expects visible attribution / referral from heavier users — treat that as a requirement, not a nicety, if access is granted.

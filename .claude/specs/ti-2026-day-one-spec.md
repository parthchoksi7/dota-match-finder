# TI 2026 — Day One Product Strategy & Spec

**Written:** 2026-07-29 (T‑15 days to TI). **Lenses:** `/dota_pm`, `/cto`, `/ux-design`, `/dota_data_scientist`, `/dota_analyst`.
**Status:** Strategy + prioritized plan. Tier‑1 items still need their own implementation specs where noted.
**Grounding:** `CONTEXT.md`, `COMPETITIVE_RESEARCH.md`, `.claude/pending-refactors.md`, `.claude/product-backlog.md`, `.claude/specs/live-story-roadmap.md`, `DESIGN_GUIDELINES.md`.

---

## 0. The question, reframed

The ask: *"On day 1 of TI, what should Spectate look like so everyone only talks about it and wants to use it all the time?"*

That conflates two problems, and the binding constraint is the second one:

- **(a) Product:** what surface makes Spectate indispensable during TI?
- **(b) Distribution:** how does anyone find out it exists?

Evidence that (b) binds: Spectate's own r/DotA2 launch posts scored **13** and **75** points. A single novel free Dota tool ("I built a tool to find out who pressed the Glyph in your matches") scored **1,814 points / 242 comments**. The community is not short of appetite for tools — it is short of a *reason to talk about this one*.

So Day 1 needs **one inherently shareable hero surface** plus **flawless fundamentals** on the two jobs Spectate already owns. Not a feature list.

---

## 1. Facts verified this session

Separated into FACTS (fetched 2026-07-29) and ASSUMPTIONS (structural knowledge). Nothing below is from training recall.

### Event
| Fact | Source |
|---|---|
| TI 2026: **Aug 13–23, 2026**, Shanghai, Oriental Sports Center. 15th edition. First TI in China since 2019. | Liquipedia, GosuGamers |
| **Group stage Aug 13–16; break Aug 17–19; playoffs Aug 20–23** | Liquipedia, GosuGamers |
| Group stage = **16 teams, Swiss, 5 rounds, all BO3, 8 series per round** | Liquipedia TI 2026 Group Stage |
| **~4 series run concurrently** (TI 2025 pattern: R1 had 4 matches at 10:00 CEST, then staggered waves) | Liquipedia TI 2025 Group Stage |
| Top 3 direct to playoffs; 4th–13th into an elimination round (5× BO3) for the remaining 5 playoff slots | Liquipedia |
| Playoffs: double elim, BO3, **Grand Final BO5** | Liquipedia |
| Base prize pool **$1.6M**, no Battle Pass; compendium may top it up | dota2.com, r/DotA2 (849 pts) |
| **Produced by PGL**, Valve-sponsored | GosuGamers |
| Broadcast: multi-language across Twitch, YouTube, **Bilibili, Douyu, Huya**, Kick, Facebook. Valve running a broadcast-license RFP. **Specific channels not announced as of 2026-07-29.** | Liquipedia, dota2.com |
| **Daily match start times NOT announced** as of 2026-07-29 (Liquipedia group-stage schedule = TBD) | Liquipedia |
| **TI 2026 Compendium had not shipped as of ~2026-07-29.** Datamined date July 17 slipped; a claimed July 24 date passed; July 23's drop was Dark Carnival content, not TI. | Escorenews, teamsmurf, r/DotA2 |
| Latest gameplay patch: **7.41 (2026-03-24)**, with 7.41d ~2026-06-05. No pre-TI balance patch confirmed. | OpenDota `/constants/patch` |
| Last event before TI: **1win Essence S2, Jul 30 – Aug 5**. EPL Masters S1 runs to **Aug 12**. | production `/api/tournaments?mode=series` |

### Our own data pipeline (production, fetched live)
- TI 2026 is **already in the PandaScore series feed**: serie id `10828`, `tier: "s"`, `2026-08-12T22:00Z → 2026-08-23T22:00Z`.
- **All 16 teams with full 5-player rosters already resolve** from `expected_roster`: Team Liquid, OG, LGD Gaming, Team Spirit, Vici Gaming, Xtreme Gaming, Nigma Galaxy, Team Falcons, Aurora, Team Yandex, GamerLegion, Team Resilience, TEAM VISION, HULIGANI, BoomBoys, Iron Wing.
- **Only one stage exists** (`Group Stage`, id 21545). No Playoffs/Elimination stage; no standings; `prizePool: null`.
- `/tournament/the-international-2026-10828` **already renders SSR** with correct title, description, `FAQPage` + `SportsEvent` JSON-LD, no noindex. SEO foundation is in place.
- **OpenDota `/leagues` has only the TI 2026 *qualifiers***, registered `tier: professional` — which discovery rule 1 deliberately excludes. The main-event league does not exist yet.
- `'The International'` **is** present in `PERMANENT_TIER1_NAMES` (`api/_shared.js:617`) and `TIER1_NAME_PATTERNS_SSR` (`middleware.js:187`), so discovery rule 2 and the noindex gate should pass on league-name substring. **Verify on day 1** — this is the single point of failure for TI appearing at all.
- `TOURNAMENT_FORMAT_CONFIGS` (`src/utils.js:662`) has exactly one entry (`blast-slam`). No TI entry ⇒ no format badge, no advancement ladder.

---

## 2. What the research actually says fans need

Sourced from r/DotA2 via `old.reddit.com` HTML scraping (JSON endpoints 403 to us; the script is in the session scratchpad). Scores are real.

### Finding 1 — Spoilers are the community's hardest taboo, and **VOD length is itself a spoiler**
r/DotA2's own convention is to title threads **"`<Spoiler>` has been eliminated from TI 2025"** — two such threads at **1,369 pts / 413 comments** and **1,066 / 285**. The subreddit has institutionalised spoiler avoidance.

From "Dota2 VOD spoilers..... WHY?":
- *"Rewatching dota matches is a minefield and I lose all interest, when I know the result."* (18)
- *"I get a lot of matches ruined when it's 1-0 in a best of 3 with only ~1 hour left of the video — you already know who won. I wish they would extend the videos."* (9)
- *"Zero interest in games where the result is forced upon you before you click the link."* (3)

**Product consequence:** the remaining-runtime leak is a spoiler vector nobody has designed around. Spectate's timestamped deep link to a specific game's start is the only mechanism in the market that sidesteps it — *provided* no surrounding UI reveals series length, game count, or duration. `MatchDrawer` already hides "Game 1 of 3" in spoiler-free mode; that rule must extend to every TI surface, including the Catch-Up rail below.

### Finding 2 — On day 1 a fan faces 4 simultaneous tier-S BO3s and can watch one
This is the defining structural fact of TI's group stage and **no product on the market answers it.** Liquipedia/BLAST.tv/rdy.gg/GosuGamers tell you *what* is on; none tell you *which is worth your next 40 minutes*.

This is exactly `live-story-roadmap.md` Priority 2b (row-level "heating up" badge), independently corroborated by the 2026-07-26 fan-need pass as the top unmet need for multi-game fans. The roadmap notes the telemetry (`radiant_lead`, kill scores, `game_time`, `building_state`) **is already captured for every live tier-1 game**, not just an open sheet — so this is a cross-game query + feed-row UI problem, not a new data-collection problem.

### Finding 3 — TI 2026's timezone makes the VOD-first segment the primary audience
Shanghai is UTC+8. TI 2025 was Hamburg (UTC+2) — friendly to Dota's largest audience (WEU/EEU). A Shanghai morning start puts the group stage roughly **04:00–14:00 CEST** and **22:00–08:00 US Eastern**.

*(ASSUMPTION, flagged: exact start times are unannounced. The direction is certain — Shanghai is +6h on CEST, +12/13h on US Eastern — the precise block is not.)*

**Product consequence:** the largest chunk of the audience will be asleep or at work for live group-stage play. TI 2026 will be the most VOD-shifted, most spoiler-sensitive TI in years. That is a direct tailwind for Spectate's existing moat and it argues for making the asynchronous catch-up path a *first-class* Day-1 surface, not a fallback.

### Finding 4 — Swiss stakes are the emotional engine, and the community's own analysis of it failed publicly
Top comment on "This was the best TI since 2019" (1,503 pts): *"the swiss group stage is so fun, Everything is on the line, winning is all that matters. Top Teams last yr got kicked out because of it."* (482)

Meanwhile "I ran 1,000,000+ simulations for TI14 Swiss" hit **431 pts / 118 comments** — and the comments dismantled it: column sums inconsistent with available slots, AI-generated framing, results not matching the author's own picks. Recurring requests in that thread: *"Could you please just post screenshot of your predictions screen? I'm very confused how to use this data"* and *"Im not good with Charts can someone give me a Picture of end result?"*

**Two consequences.** (1) Demand for Swiss advancement context is proven and supply is bad. (2) **If we ship probabilities, the math must be right and legible, or r/DotA2 will do to us what it did to that poster.** Prefer deterministic, checkable stakes ("loser drops to 0-2, elimination range") over modelled win probabilities. This is a `/dota_data_scientist` red line: no published probability without a verifiable derivation.

Format confusion is a recurring genre in its own right: "SWISS format need to be FIXED", "This Swiss format is perfect but I would make one change", "The swiss format in dream league s27 has a major flaw", "I don't know what this EWC format is, but I think I might hate it."

### Finding 5 — Valve has stepped back; the in-client companion layer is thin this year
PGL produces TI 2026. Fan sentiment: *"Valve not being involved makes it feel super less premium."* The compendium — which historically carries in-client predictions and fantasy — **had not shipped as of ~Jul 29**, after two missed datamined/rumoured dates, with visible community frustration.

Fantasy/pick'em engagement is enormous when it exists: "Fantasy League Guide 2025: Road to The International" **959 pts / 364 comments**; "Dota 2 TI Fantasy — Extremely Simple Guide" **852 / 97**.

**This is a real vacuum — and I still recommend not filling it.** See §5.

### Finding 6 — Our own validated moat, in a fan's words
From the BLAST Slam launch post (75 pts):
- *"the amount of times ive wanted to watch a specific game but just said screw it because scrubbing through 6+ hours sounds like a nightmare is way too high. the timestamped twitch links alone are a game changer… being able to jump to the exact moment someone got that rampage or when the game actually turned around beats watching the whole thing unfold"* (12)
- *"If I can add a suggestion, I would have masked the score by default, cause I don't wanna the spoilers if I haven't watch the game yet"* (6) — already actioned; spoiler-free now defaults ON for new visitors.

### Finding 7 — PGL enforces VOD copyright aggressively
"PGL strikes my YouTube for rules that don't apply — now they have 10 days to prove it in court" — **1,018 pts / 126 comments**. PGL produces TI 2026.

**Consequence:** deep-linking to official Twitch/YouTube VODs (what we do) is safe. Rehosting, clipping, mirroring, or embedding-with-ads is not. Do not add any clip-capture feature for TI.

---

## 3. Competitive position for TI (extends `COMPETITIVE_RESEARCH.md`)

Two competitors are **missing from the current matrix** and should be added:

| Product | TI 2026 offering (verified 2026-07-29) | Threat |
|---|---|---|
| **BLAST.tv** (`blast.tv/dota/tournaments/the-international-2026`) | TI hub with dates, bracket section, all 16 teams, news, **its own Dota Fantasy product**, accounts/login. No live scores yet; FAQ says broadcast channels unannounced. | **High** on fantasy/hub. They are a broadcaster-grade brand with accounts. Do not compete on fantasy. |
| **rdy.gg** (`rdy.gg/en/dota2/tournaments/117076`) | Full schedule, live results, brackets for all three stages, live standings, per-team map win rates, most-picked heroes, prize breakdown, rosters + player pages, live streams, highlights, filters. | **High** on schedule/standings/stats. They will out-cover us on breadth. |
| Liquipedia | Authoritative TI 2026 + Group Stage pages, all stream links across 7 platforms. Under construction, TBD-heavy. | Reference layer, not a product. |
| Valve in-client | TI tab exists (real-time API-backed); predictions/fantasy gated behind an unshipped compendium. | **Latent.** Could land any day and own predictions. |
| Stratz / Dotabuff | Post-game analytics. No VOD linking, no spectator layer. | Complementary. |

**Where we win, stated as a positioning sentence:**

> **Spectate tells you which TI game to watch right now — and if you were asleep, it gets you to the exact moment without spoiling it.**

Nobody else in the table does either half. Everything in the Day-1 plan must serve that sentence or get cut.

**Where we lose if we try:** schedule/bracket breadth (rdy.gg, Liquipedia), fantasy (BLAST.tv, Valve), stats depth (Stratz), news volume (GosuGamers).

---

## 4. Segment impact (reach × intensity)

| Segment | Reach at TI | Intensity | What they need | Served? |
|---|---|---|---|---|
| **VOD-first / timezone-shifted** (EU/CIS mornings, NA overnight) | **Very high** — TI in China | **Extreme** — spoiler protection *is* the product | Spoiler-safe catch-up; jump to the exact game | **Primary target** |
| **Hardcore follower** | High | High — 4 concurrent games, every round | Which of these 4? Live depth. | **Primary target** |
| **Lapsed fan** returning for TI | **Largest** absolute | Medium-high | Who are these 16 teams, who's good, what's at stake | Partially (rosters, hub) |
| **Casual fan** | High | Medium | "Why does this match matter" | Partially (stakes line) |
| **Regional fan** (CN/RU/ES/PT/SEA) | High, TI in China | Medium-high | Their language stream first-class | Shipped (Preferred Stream Language) — **but Bilibili/Douyu/Huya unverified** |
| **Pub player who doesn't watch pro** | Large | Low at TI | Meta relevance | **Deliberately ignored this cycle** |

---

## 5. What Day 1 looks like — the product picture

10:00 local, Aug 13. Four TI series live. A fan opens spectateesports.live on a phone.

### 5.1 TI Mode — a site state, not a new page
While TI is running, the site collapses around it:
- Header carries one orientation line: **`TI 2026 · Day 1 · Round 1`**.
- TI live series pin above everything else; non-TI live/upcoming demote below a divider.
- Everything reverts automatically when TI ends. No new route, no new nav item, no code path that can strand the site in TI mode after Aug 23.

*Why a state and not a page:* a page needs discovery. The homepage already has the traffic; the TI hub already exists for search. Rebuilding a hub costs the window and duplicates rdy.gg.

### 5.2 The hero: cross-game "worth watching" signal on each live row
**Status: shipped and public** (built owner-only 2026-08-01, flipped public 2026-08-03 — see `live-worth-watching-signal-spec.md`). The one thing nobody else has. Per live TI row, a compact badge derived from telemetry we already capture:
- **CLOSE** — net-worth lead inside the momentum band's `EVEN` threshold at this game time.
- **SWING** — lead crossed sides, or shrank by a large margin since the last capture.
- **DECIDER / MATCH POINT** — series stakes (`computeStakes` already produces this).
- No badge when the game is in draft, when data is stale beyond the bound, or when spoiler-free is on and the badge would leak state.

Reuse `computeMomentum` / `computeStakes` (`src/utils/momentum.js`, pure + unit-tested) rather than inventing thresholds. This is `live-story-roadmap.md` 2b; the roadmap explicitly says **commission a PM spec before an engineering plan** — TI is the forcing function, and the spec must be written before code.

**Spoiler policy:** the badge is *state, not outcome* — the same "state, not fate" vocabulary R2 already established. But CLOSE/SWING still leak game state, so in spoiler-free mode the badge must be suppressed exactly the way the tab title is (unconditionally, per the Glanceable Live Score precedent — a passive surface the fan never opted into).

### 5.3 Swiss stakes on every TI row
Deterministic, no model: **"Loser drops to 0-2 — elimination range."** Computed from the stage standings + Swiss round number. Cheap, checkable, and it targets the emotion fans named themselves (Finding 4).

Hard constraint from Finding 4: **no published win probabilities.** If it can't be derived from standings arithmetic that a reader can verify in their head, it doesn't ship.

### 5.4 The Catch-Up rail — "While you were asleep"
For the primary segment. A rail at the top of the feed when a fan's last visit predates completed TI series:
- One line of orientation: *"8 series finished. 3 worth your time."*
- Per series: teams, tournament round, **watchability rating**, and one tap to the **timestamped VOD at game start**.
- **Zero result leakage** by construction: no score, no series length, no game count, no duration, no winner. `WatchBadge`'s rating is outcome-adjacent but not outcome-revealing (it already ships alongside spoiler-free mode).

This is `product-backlog.md` #1 (lapsed-fan recap) narrowed from an ambiguous "one screen" to a shape that is buildable in 15 days out of parts that already exist: `WatchBadge`, `fetchMatchStreams`/`findTwitchVod`, `CompactSeriesRow`, spoiler-free rules.

**Honesty requirement:** OpenDota `/promatches` lags 30–90+ min. The rail must say *"more games still processing"* rather than implying it is complete. A fan who trusts a "you're caught up" claim and then finds a missing series loses trust permanently.

### 5.5 TI hub answers "how does Swiss work"
Add `TOURNAMENT_FORMAT_CONFIGS['the-international']` with the group stage (Swiss, BO3, 16 teams, advancement: Top 3 → Playoffs, 4th–13th → Elimination Round, 14th–16th → Eliminated), the elimination round, and playoffs (Double Elim, BO3, GF BO5). This lights up the existing `StageFormatBadge` + `AdvancementLadder` and the standings advance/eliminate zones. Hours of work; directly answers a recurring community confusion.

### 5.6 Fundamentals that must simply be true
- Spoiler-free defaults ON for new visitors — TI brings a flood of them. Verify the `hasPriorFootprint()` migration guard and the first-run nudge under real TI traffic.
- Preferred stream language promotes correctly for a China-hosted, 7-platform broadcast.
- Live companion (game switcher, net-worth graph, live draft, momentum, stakes) works on TI's BO3s.
- Push: starting-soon / live / replay-ready for followed teams.
- Tower map: flip public (see §6, Tier 2).

---

## 6. The plan — 15 days, RICE-informed, freeze-disciplined

**Calendar reality.** There is no clean freeze window: EPL Masters S1 runs to Aug 12, 1win Essence S2 Jul 30–Aug 5. Both are lower-stakes than TI, so treat them as the **rehearsal**, not an obstacle. **Hard code freeze Aug 11.** Nothing risky ships after that; the standing rule against flipping public UI flags mid-Tier-1-event applies with full force from Aug 12.

### Tier 0 — Day-1 blockers (verification + debt, not features)

| # | Item | Why it's Tier 0 | Effort |
|---|---|---|---|
| T0.1 | **Verify TI stream attribution the moment TI matches enter PandaScore** (~Aug 12–13) | The **EWC 2026 precedent is exact**: PandaScore marked EWC's YouTube stream `official:true` and the real EWC Twitch broadcasts `official:false`, so `getTwitchStreams()` skipped them and **no VOD was cached**. If TI repeats it, the entire replay moat silently fails on the biggest day of the year. Have the `OFFICIAL_TWITCH_ALLOWLIST` pattern ready to extend (it's already in `pending-refactors.md` as an EWC-scoped temporary). | 0.5d + monitoring |
| T0.2 | **Verify PS↔OD team-name mapping for all 16 TI teams** | PandaScore names include **BoomBoys, Team Yandex, Iron Wing, HULIGANI, TEAM VISION, Aurora** — several are rebrands. Repo precedent: 1win↔"Tundra Esports" needed a `TEAM_NAME_ALIAS_GROUPS` entry in `src/teamMatching.js`. A miss breaks followed-team highlighting, VOD resolution, live-companion correlation, and push for that team. **Use `teamPairMatch`/`findBestPsMatch` from `api/_shared.js`** — never a new matcher. | 1d |
| T0.3 | **Verify OpenDota's TI main-event league name + tier on day 1** | OD currently has only the *qualifiers*, at `tier: professional` — which discovery rule 1 excludes. The main league doesn't exist yet. We pass via the `'The International'` name rule, but if OD's league name diverges, TI matches vanish from Latest Results **and match pages get noindexed**. | 0.25d (a check + contingency) |
| T0.4 | **Mount `ErrorBoundary`** (`pending-refactors` #23, RICE **21.6**) | `src/ErrorBoundary.jsx` is complete and **never rendered**. Today an uncaught render error = blank white page. Do not enter the highest-traffic week of the year with that. | 0.25d |
| T0.5 | **`font-display: swap` + preconnect** (#1, RICE **18.0**) | Every first load; TI is exactly when first loads spike. CLS/Core Web Vitals. | 0.5d |
| T0.6 | **Batch push-subscriber KV reads** (#8, RICE **4.3**) | The only refactor with day-1 blast radius: `sendPushNotificationsForMatches()`'s nested per-user `kv.get()` runs **on the stream-capture cron**. A `maxDuration` timeout there takes down VOD binding, not just push. Subscriber count spikes at TI. | 3d |
| T0.7 | **Live-pulse load model** (see §8) | 8 concurrent games × many open sheets × 20s polling, each hitting Supabase. This is the top unmodelled technical risk. Needs a number and a mitigation before Aug 13. | 1d analysis |

### Tier 1 — the hero
| # | Item | Notes |
|---|---|---|
| T1.1 | **Cross-game live "worth watching" signal on feed rows** | **DONE** — spec written (`live-worth-watching-signal-spec.md`), built owner-only 2026-08-01, flipped public 2026-08-03 (ahead of the original Aug 8 target). `live-story-roadmap.md` 2b. |

### Tier 2 — cheap, high-leverage
| # | Item | Effort |
|---|---|---|
| T2.1 | `TOURNAMENT_FORMAT_CONFIGS['the-international']` + `getTournamentFormatKey` branch | 0.25d |
| T2.2 | TI Mode (pin TI, header orientation line, auto-revert) | 1d |
| T2.3 | Swiss stakes line on TI live/upcoming rows | 1d |
| T2.4 | Catch-Up rail, TI-scoped | 2–3d |
| T2.5 | **Tower map public flip** — built, owner-gated, one-line flip. **The EWC freeze gate has lifted** (EWC 2026 shows `completed` in the production feed). Still needs: GA4 events, About/Release-Notes entries, real 400px mobile check on a live game. | 0.5d + verification |

### Tier 3 — explicitly NOT before TI
- **R3 AI "catch me up" line on live games.** Medium risk, first LLM text next to *live* data, and the roadmap's own open question — cost at realistic concurrent-sheet counts — has never been answered. Debuting an LLM surface on TI day 1 is the wrong risk at the wrong moment.
- **Public pick'em / fantasy.** See §7.
- Roshan/Aegis timers, per-player net worth (new Steam dependency), TypeScript migration, push→Supabase, `live_game_gold`/`live_game_map` retention prunes.

---

## 7. What I'd kill, and why

**Kill: a TI pick'em / fantasy product.** This is the most tempting item in the research — 959- and 852-point fantasy guides, and a genuine Valve vacuum (§Finding 5). Kill it anyway:
1. **Valve may land the compendium any day.** Predictions and fantasy are historically its content. Building into a competitor's core feature on their release schedule is a losing trade.
2. **BLAST.tv already ships Dota fantasy** with accounts we don't have.
3. **It needs identity.** Spectate is deliberately localStorage-only, no auth, no server user state. A pick'em without accounts is a toy; with accounts it's a new subsystem in 15 days.
4. **It's a new spoiler surface** with no spoiler policy — an automatic cost under our own prioritization rules.
5. **The math risk is real.** Finding 4 shows exactly what r/DotA2 does to a public Dota model with inconsistent numbers.
6. **Zero moat contribution.** It doesn't compound into the spectator-experience layer.

**Kill: broad schedule/bracket/standings expansion.** rdy.gg already ships live standings, per-team map win rates, most-picked heroes, player pages, filters. Liquipedia is authoritative. Competing on breadth in 15 days loses and dilutes the positioning sentence.

**Kill: anything that captures, clips, or rehosts video.** PGL produces TI 2026 and has an active copyright-enforcement posture (1,018-pt thread). Deep links only.

---

## 8. Engineering risk register (`/cto`)

| Risk | Severity | Mitigation |
|---|---|---|
| **PandaScore mislabels TI's official Twitch stream** (EWC precedent) | **Critical** — kills the replay moat on day 1 | T0.1: verify at first TI match; allowlist pattern pre-staged |
| **Live-pulse Supabase load.** `liveGamePulse` is read per open sheet every 20s. 4–8 concurrent TI games × unknown concurrent sheets = unmodelled Supabase/Upstash read volume on the free/low tier. | **High** | T0.7. Options: server-cache the pulse per `(od_match_id, ~20s bucket)` in KV so N sheets on one game cost one read; widen the poll interval during TI; degrade to last-known via the existing bounded-staleness path (`nextPulseState`, 90s) |
| **PS↔OD name mismatch on rebranded TI teams** | High | T0.2, using existing `_shared.js` helpers |
| **OpenDota main-event league tier/name divergence** ⇒ matches missing + match pages noindexed | High | T0.3 |
| **Uncaught render error = white page** | High | T0.4 |
| **Push cron timeout takes down stream capture** | High | T0.6 |
| **PandaScore hasn't created playoff/elimination stages** (only `Group Stage` exists today) | Medium | Documented PS behavior; sibling-stage fetch will pick them up. Verify Aug 17–19 during the break, before playoffs |
| **OpenDota `/promatches` 30–90min lag** ⇒ Catch-Up rail incomplete | Medium | Explicit "still processing" state; never claim completeness |
| **No Vercel Log Drains** (free plan) | Medium | In-app monitoring only. **Finish the Sentry setup** — the code is wired but `SENTRY_DSN`/`VITE_SENTRY_DSN` and the alert rule are still manual TODOs in `pending-refactors.md`. Do this before Aug 11. |
| **Chinese platforms (Bilibili/Douyu/Huya) in `streams_list`** | Low-Medium | `normalizeAllStreams` is language/platform-agnostic; verify the picker renders them sanely and that no non-Twitch source gets branded as a timestamped VOD |
| **KV cache busting after deploy** | Low | Documented: `/api/live-matches?bust=1` after any new field |

**Deployment discipline:** per the standing rule, re-read `.claude/claude_instructions_template.md` in full before each push, run the full checklist including a real mobile viewport, use an independent Explore-subagent code review over every modified file, and **ask before deploying** — no self-authorization. That applies to every item above, and doubly in the Aug 11–23 window.

---

## 9. Data feasibility (`/dota_data_scientist`)

| Surface | Provider | Freshness | Confidence |
|---|---|---|---|
| TI series/teams/rosters | PandaScore `expected_roster` | Available now, 16/16 teams | **HIGH** — fetched live |
| Live game state (net-worth lead, kills, game time, towers) | OpenDota `/live` → `live_game_map` / `live_game_gold` | ~60–110s capture; 20s client poll | **HIGH** — public since 2026-07-18 |
| Swiss standings | PandaScore `/tournaments/{id}/standings` | Empty until the event starts | **MEDIUM** — untested for TI's Swiss stage |
| Completed-game detail, drafts, gold graphs | OpenDota `/matches/{id}` | 30–90+ min lag | **HIGH** on content, **LOW** on immediacy |
| VOD resolution | PandaScore streams → Twitch Helix | Minutes-to-hours after series end | **HIGH** *conditional on T0.1* |
| Tower state | `building_state` decoder | 46/47 exact vs OD ground truth (47 games / 885 points) | **HIGH** for towers; barracks/Ancient **NOT decodable** (disproved) |
| Advancement probabilities | — | — | **NOT SHIPPING.** No model, no published probability. Deterministic stakes only. |

**Statistical discipline for anything published during TI:** report N with every statistic; N<10 maps = raw observation only, no conclusion; N<20 = flag SMALL SAMPLE, LOW confidence cap. TI group stage gives each team **5 series / ~10–15 maps** — that is *below* the threshold for any team-form conclusion. Do not let editorial or UI copy assert form trends off TI group-stage data alone.

---

## 10. Storylines worth decoding on Day 1 (`/dota_analyst`)

Structural, verifiable framings — **not** roster claims. Standing repo rule: never name a current roster from memory; link Liquipedia.

- **15th TI; first in China since 2019.** Home-crowd dynamics for the Chinese entrants; a China-hosted TI is its own narrative frame. (FACT)
- **China's standing is itself the story.** An r/DotA2 thread this month — "TI 2026 Might Be China's Last Chance to Prove It Can Still Compete at Dota's Summit" (151 pts / 35 comments) — shows the community has already chosen this frame. Three Chinese teams are in the field (Xtreme Gaming, Vici Gaming, Team Resilience per the PandaScore roster fetch). (FACT: field; ASSUMPTION: narrative weight)
- **Defending champion.** Search results indicate Team Falcons won TI 2025, beating Xtreme Gaming in the final — and both are in the TI 2026 field. **Verify against Liquipedia before publishing this anywhere**; it is single-sourced here. (MEDIUM confidence)
- **Swiss elimination pressure.** 4th–13th all play an elimination round; only the top 3 are safe. Every round-3-onward series has explicit knockout consequences — this is the stakes engine and it is what fans said they loved (Finding 4). (FACT)
- **Patch staleness.** 7.41 is from March 2026, 7.41d from June. No pre-TI balance patch is confirmed. A mature, well-solved meta favours preparation and depth over surprise — and if Valve *does* drop a patch before Aug 13, the pre-built patch-explainer pipeline (`product-backlog.md` #3) becomes the highest-value content asset of the year overnight. (FACT + conditional)
- **What most viewers will miss on Day 1:** in a 5-round Swiss with BO3s, the *draft* carries more weight than in a long round-robin — there is no time to be counter-drafted twice and recover. Drafts are the thing casual viewers most need decoded, and `DraftDisplay` already renders them spoiler-safely (pre-outcome, so it shows even in spoiler-free mode).

---

## 11. Distribution — the part that actually decides "everyone talks about it"

The product will not spread on its own. The evidence is unambiguous: novel tool = 1,814 pts; "I built a site" = 13–75 pts.

1. **Post the feature, not the site.** One artifact: *"I built a live meter for which of the 4 TI games is actually worth watching right now"* — with a screenshot of four real concurrent games ranked. Post during Round 1, Day 1, when the pain is live and everyone feels it simultaneously.
2. **The daily "while you were asleep" recap is repeatable content for 11 straight days** — spoiler-safe by construction, and the existing bare-domain URL rule (no `https://`) already applies to X posts.
3. **Watch-party and co-stream communities are the real channel.** EU TI watch-party threads exist on r/DotA2 right now. A spoiler-safe catch-up link is precisely what a watch-party organiser shares with people who couldn't make the 04:00 start.
4. **Keep the automation owner-only.** Auto-tweet, digest, and polls are deterministic-template, owner-gated. That is the right posture for TI — nothing can misfire publicly during the event.
5. **Spoiler-safe sharing is a differentiator worth naming.** The `?spoilers=off` share-link builder already exists. "Share this without spoiling it" is a claim no competitor can make, and r/DotA2's own `<Spoiler>` title convention proves the community will recognise the value instantly.

---

## 12. Metrics

**Day-1 success (Aug 13):**
- Zero P0 incidents: no blank-page render error, no missed TI VOD binding, no TI matches absent from the feed.
- ≥1 TI series' replay resolves to a timestamped VOD within 2h of series end.
- Watchability badge renders on ≥3 of 4 concurrent series with non-stale data.

**Engagement (Aug 13–23):**
- New-visitor share (TI is an acquisition peak).
- `watchability_computed` → replay-click conversion on the Catch-Up rail.
- Live-companion open rate per live TI series; sheet dwell time.
- Push opt-in rate and `push_opened` rate for TI series.
- Spoiler-free retention: what share of new visitors keep it on (`spoiler_nudge_action`).

**The retention metric that actually matters (Aug 24 – Sep):** returning-visitor rate in the **post-TI trough**. Peaks acquire; troughs retain. A TI that spikes traffic and retains nobody is a failure with good-looking charts.

**New GA4 events needed:** `ti_mode_active`, `watchability_badge_shown {state}`, `watchability_badge_click {state}`, `catchup_rail_shown {series_count}`, `catchup_rail_click {position, rating}`, `swiss_stakes_shown`, plus the two owed by the tower map (`live_map_state_shown`, `live_map_state_omitted`).

---

## 13. AI + search discoverability

Per `.claude/ai_discoverability.md`, applied to what's new here:
- **No new public routes.** TI Mode is a homepage state; the Catch-Up rail is a feed section; the TI hub already exists at `/tournament/the-international-2026-10828` with `FAQPage` + `SportsEvent` JSON-LD, verified rendering today.
- **New entity relationships:** the TI format config connects `The International 2026` → its stages → advancement outcomes. Worth surfacing in the SSR FAQ ("How does TI 2026's group stage work?" / "How many teams advance?") — that is a high-probability LLM citation target and directly answers the recurring Swiss confusion.
- **Durable citation assets:** individual TI match pages (`/match/...`) are the evergreen assets. Live badges are transient and should not be crawler-visible. The crawler invariant holds: spoiler-free is client-only; SSR always carries real scores.
- **`llms.txt` / `llms-full.txt`:** add a TI 2026 entry (dates, venue, format, 16 teams, stage structure) and any new API mode from T1.1.
- **IndexNow:** already pings for recent matches and live tournament hubs — TI match pages will be picked up automatically.

---

## 14. Owner decisions (resolved 2026-07-29)

1. **Both ship. Badge is the headline.** The cross-game "worth watching" badge (§5.2 / T1.1) is the Day-1 hero and gets priority polish + the distribution push (§11). The Catch-Up rail (§5.4) still ships as a Tier 2 item — full scope, just not the feature the launch post is built around.
2. **No pick'em/fantasy for TI.** §7's kill stands — confirmed, not overridden.
3. **Aug 11 hard freeze — approved.**
4. **Tower map public flip** — owner reviewing on PPV (pre-production verification) the day before flipping. Not yet flipped; T2.5 stays open until then.
5. **Sentry env vars + alert rule** — owner handling directly, outside this workstream. Drop from the engineering task list below; T0 risk register (§8) still flags it as open until confirmed done.

### Sequencing consequence of "both, badge headline"

Both T1.1 (badge) and T2.4 (Catch-Up rail) now compete for the same Aug 8 pre-freeze landing window. Recommended split:
- **T1.1 gets the PM spec first** (per `live-story-roadmap.md`'s own requirement) and first engineering slot — target landed + rehearsed by **Aug 6**, leaving 2 days of margin before the Aug 8 target and a full week before freeze.
- **T2.4 follows immediately after**, built from parts that already exist (`WatchBadge`, `fetchMatchStreams`, `CompactSeriesRow`) — lower engineering risk, so it can absorb schedule slip better than the badge can. Target **Aug 10**, one day inside the freeze.
- If either slips, **the badge keeps its slot and the rail is what gives** — it's the Tier 2 item, and its parts are stable/tested already, so a late land is lower-risk than a late land on the new cross-game query.

---

## 15. Open questions

- Exact TI daily start times (unannounced as of 2026-07-29) — determines how sharp the timezone/VOD argument is, and when the Catch-Up rail should surface.
- Does the compendium ship before Aug 13, and does it carry predictions/fantasy? If yes, §7's kill decision is retroactively validated; if it slips past TI, revisit pick'em **after** TI, not during.
- Will PandaScore populate `external_identifier` for TI main-event games? (It is always null on TI *qualifiers*.) The warm-streams cron covers the gap either way, but it changes how fast replays bind.
- Concurrent-open-live-sheet count at TI scale — the input to T0.7 that nobody has measured.
- Does Valve/PGL restrict VOD availability or geo-gate the Chinese platform streams?

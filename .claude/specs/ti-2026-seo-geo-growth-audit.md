# TI 2026 — SEO/GEO Growth Audit & Distribution Plan

**Written:** 2026-08-04 (T-9 days to TI 2026). **Lens:** `/growth`.
**Status:** Critical audit + prioritized plan. Complements `.claude/specs/ti-2026-day-one-spec.md` (product/engineering) — does not duplicate it.
**Grounding:** Live curl checks against spectateesports.live (robots.txt, sitemap.xml, llms.txt, llms-full.txt, TI tournament page SSR), live web search for competitive SERP presence, `.claude/ai_discoverability.md`, `.claude/pending-refactors.md`, `CONTEXT.md`, prior SEO/GEO audit memory (2026-07-10).

---

## Objective

Win the highest-value, highest-competition 10 days of the Dota 2 calendar. TI 2026 runs **Aug 13–23** (Shanghai, Swiss group stage Aug 13–16, playoffs Aug 20–23) — 9 days from this audit, and the codebase's own hard freeze is **Aug 11**, leaving a **7-day engineering window** and an unlimited content/outreach window. The goal isn't "have a TI page" — it's to convert TI's search and social spike into people who bookmark spectateesports.live and come back after TI ends.

The existing `ti-2026-day-one-spec.md` (written 2026-07-29) is an excellent product/engineering plan — the worth-watching badge, TI Mode pinning, Swiss stakes line, and format config are shipped or scheduled and correctly prioritized. What that spec does not do is a critical, adversarial SEO/GEO audit or an off-site distribution plan beyond one Reddit launch post. That's the gap this document fills.

---

## Audience

| Segment | TI-specific behavior |
|---|---|
| **Search-first newcomer** ("TI 2026 schedule", "how to watch TI 2026") | Zero brand awareness, pure intent-match. Currently **losing outright** — see Growth Opportunity. |
| **VOD-first/timezone-shifted fan** | Already Spectate's stated core segment. Shanghai UTC+8 makes this the largest TI 2026 audience. |
| **AI-assistant user** (asks ChatGPT/Perplexity where to watch TI VODs with timestamps) | Currently unaddressed with TI-specific facts — `llms.txt` has zero TI 2026 dates/venue/format as of this audit. |
| **Reddit/community lurker during TI** | Reads r/DotA2 megathreads, day-of recap threads, watch-party organizer posts. |

---

## Growth Opportunity — the hard truth first

Live searches for the exact queries a TI newcomer types return **spectateesports.live in zero results**.

Query *"TI 2026 dota 2 bracket schedule live scores"* → `ti2026-ph.org` (exact-match throwaway domain), `ggscore.com`, `strafe.com`, `sportsbrackets.net`, `dota2tileague.com`, `boostmatch.gg`. A `site:spectateesports.live "the international 2026"` search returned **nothing**.

**This is the central finding: the product roadmap is TI-ready; the discoverability layer is not battle-tested, and the competitive field already includes disposable exact-match-domain microsites built solely to rank for this one event.** Nine days is not enough to out-rank Liquipedia or rdy.gg on breadth (correctly killed in the existing spec). It is enough to close specific, fixable technical gaps and seed off-site presence that a 7-day code freeze can't touch, because none of it is code.

---

## Strategic Rationale

1. **You cannot win on breadth.** rdy.gg and Liquipedia already out-cover on schedule/bracket/stats depth (per the existing spec, §3). Competing there burns runway you don't have.
2. **The real, unclaimed wedge is spoiler-safe, timestamped VOD access.** Nobody else in the SERP owns this intent. It maps to durable long-tail queries ("TI 2026 [team] vs [team] VOD replay", "watch TI 2026 without spoilers") a throwaway bracket-tracker domain has no reason to build for.
3. **The Aug 11 freeze doesn't apply to content, submissions, or outreach.** Everything below that isn't literally "fix the sitemap" or "add an llms.txt entry" can happen Aug 12–23, inside the tournament, without touching the code freeze.

---

## Recommended Approach

**Track A — Close technical/content gaps before Aug 11.** Not on the engineering spec's T0–T2 list, won't compete with it for dev time — mostly content/data edits, not app code.

**Track B — Off-site distribution and content velocity for Aug 12–23**, unconstrained by the freeze, where the actual traffic-capture opportunity lives once the product surfaces (badge, catch-up rail) are already live.

---

## Content Ideas

Ranked by search-intent match to verified competitor SERP presence:

1. **"How to watch TI 2026" explainer** — broadcast platforms (Twitch/YouTube/Bilibili/Douyu/Huya per the spec's research), Shanghai time-zone conversion table for EU/NA/SEA, direct pitch for spoiler-free mode. Can rank starting *today*, not Aug 13 — write this week.
2. **Daily spoiler-safe recap articles, one per tournament day (Aug 13–23)** — "TI 2026 Day 1: what happened (no scores)". Feeds the Catch-Up rail concept editorially, gives Google/Bing fresh dated content daily (freshness currently forfeited entirely — editorial pipeline dormant per `llms.txt`, last referenced article is BLAST Slam VII), and is a natural home for timestamped-VOD links.
3. **"TI 2026 compendium: why there isn't one, and what to check instead"** — the existing spec's Finding 5 notes the compendium hasn't shipped and fans are frustrated. That frustration is generating unowned search volume ("TI 2026 compendium") a fast, honest explainer can capture cheaply.
4. **Pre-built, instant-publish "Who won TI 2026?" page**, written and staged *now*, populated the moment the Grand Final ends (Aug 23). The single highest-spike query of the entire event — treat it like a news outlet's Super Bowl live blog: the draft exists before the game does.
5. **"TI 2026 Swiss stage explained"** as a standalone, indexable article, not just the in-app FAQ. The FAQ JSON-LD on the tournament page is good but bound to that page's authority; a dedicated explainer can also target evergreen "swiss format dota 2" volume. Same deterministic, no-probability content policy the spec already mandates (Finding 4).

---

## Distribution Plan

Adds the SEO/GEO layer the existing spec's product-launch post doesn't cover — does not duplicate the worth-watching-badge Reddit post, which is correctly scoped there.

- **Reddit, SEO-shaped, not launch-shaped:** in each day's official r/DotA2 match-discussion thread, a genuinely useful top-level comment linking the specific timestamped VOD once ready — not a launch post, a utility comment. Reddit threads are increasingly used as LLM grounding sources (Google SGE and OpenAI both have Reddit data arrangements) — a useful, upvoted comment is now also a GEO play, not just a traffic play.
- **Bing Webmaster Tools registration** — flagged as an open manual TODO since the 2026-07-10 audit, still not done. Bing indexes power Copilot and are a documented input to several AI-answer pipelines. Zero cost, 15 minutes, still not done.
- **IndexNow verification for TI URLs specifically** — confirm the TI tournament page and each day's editorial recap actually gets pinged. Don't assume; verify it fires for `/tournament/the-international-2026-10828` and new `/articles/*` on day one.
- **Caster/co-streamer outreach** — a handful of DMs to known Dota co-streamers/analysts offering the timestamped-VOD link as a resource for their own prep. One caster mentioning the tool on a panel or in a video description is worth more than a paid placement and costs nothing but time.
- **Directory/community listing sweep** — r/DotA2's wiki/sidebar resources, relevant Discord `#useful-links`-style channels. Low-glamour, real backlinks, zero engineering cost.

---

## SEO / GEO Opportunities

Concrete, verified-live gaps, in priority order:

| # | Gap | Evidence | Fix effort |
|---|---|---|---|
| 1 | `llms.txt`/`llms-full.txt` have **no TI 2026 dates/venue/format/prize-pool entry** — confirmed live, only historical TI1–14 data and generic team bios | Live curl, this audit | Trivial — text edit; already scoped as a TODO in the existing spec's §13, just not executed |
| 2 | **Sitemap duplicate-URL defect still live** — `articles?tournament=esports-world-cup-2026` appears 3× | Live curl: `grep -c` returns 3 | Trivial — same defect flagged in the 2026-07-10 audit, unfixed in 25 days |
| 3 | **Bing Webmaster Tools never registered** | Flagged 2026-07-10, still open | 15 min, manual, zero code |
| 4 | **Editorial pipeline dormant for TI** — no article referencing TI 2026 exists anywhere in `llms.txt`/`llms-full.txt`, last referenced article is BLAST Slam VII | Live curl | Content work, not engineering — start now |
| 5 | **No Google News sitemap** — zero shot at Top Stories placement for "who won TI 2026" on Grand Final day, the single largest spike | Known defect since 2026-07-10, still open | Medium — evaluate Google News Publisher Center eligibility this week; if unattainable in time, compensate with IndexNow speed instead |
| 6 | **Live competitive absence** — zero appearance for head-term TI 2026 queries against exact-match-domain competitors | Verified live via search, this audit | Not fixable by Aug 13; the wedge (spoiler-safe timestamped VODs) is the realistic path, not head-term competition |

---

## Community Strategy

- Treat the daily TI thread on r/DotA2 as a service surface, not a promo surface — the subreddit is at its most vigilant about self-promotion during the event.
- Watch-party organizers are a distinct, findable audience (the existing spec's research found active EU watch-party threads) — a spoiler-safe recap link is precisely what an organizer shares with people who missed the 4am start. Seek these threads out directly.
- Don't build pick'em/fantasy (correctly killed in the existing spec) — but do write about its absence, since search demand is real and currently unclaimed by anyone honest about the gap.

---

## Growth Loops

```
Newcomer searches "how to watch TI 2026" or "TI 2026 [team] VOD"
  → lands on explainer or match page
  → discovers timestamped-VOD jump (the only thing in market that does this)
  → shares the spoiler-safe link with a watch-party group or in a Reddit thread
  → new users arrive via that link, already primed on the value prop
  → TI ends → daily recap habit (built during the event) is the retention hook into September
```

The loop's weak link is the first arrow — today, it doesn't fire because the site isn't in the SERP for the query. Track A exists to fix exactly that link.

---

## Experiments

| Hypothesis | Test | Success | Failure |
|---|---|---|---|
| A dedicated "how to watch TI 2026" page indexes and ranks fast enough to matter | Publish by Aug 6, monitor GSC impressions daily | Impressions for TI-adjacent queries by Aug 12 | No impressions by Aug 12 → deprioritize further head-term content, lean fully into VOD long-tail |
| Daily spoiler-safe recap articles drive new-visitor share | Publish Day 1–3 recaps, track new-visitor % and referral source | Measurable new-visitor lift attributable to article referral/search | Flat → cut to every-other-day, redirect effort to the Reddit utility-comment tactic |
| Utility comments (not launch posts) in daily r/DotA2 threads drive qualified clicks | Post 3 test comments across Days 1–3, track click-through via UTM | Positive CTR without downvotes/removal | Removed/downvoted → stop, the subreddit read it as promotion despite the utility framing |

---

## Metrics

Owned by growth, additive to the existing spec's product metrics (§12 there already covers badge/catch-up-rail engagement — not duplicated here):
- Non-brand organic impressions/clicks for TI-adjacent queries (GSC), daily Aug 6–23
- New-visitor share and traffic source mix during Aug 13–23
- Referral clicks from Reddit (UTM-tagged)
- **Aug 24–Sep retention of TI-acquired visitors** — the number that actually matters, and it's explicitly called out as the real success metric in the existing spec too (§12: "a TI that spikes and retains nobody is a failure with good-looking charts"). Growth's job is making sure the acquisition side of that equation is as large as possible so retention has something to work with.

---

## Risks

- **Time is the binding constraint.** 9 days total, 7 before freeze. Track A must be done by Aug 11 or it doesn't ship until mid-tournament, losing the pre-event indexing window entirely.
- **Editorial cadence is a real commitment, not a checkbox.** A daily-recap promise that lapses after 2 days (as happened post-BLAST Slam VII, per `llms.txt`) is worse than not promising it — it signals abandonment to both readers and crawlers.
- **Reddit backfires if the utility framing reads as promotion.** The subreddit is unforgiving of this; test small before scaling (see Experiments).
- **Competing on head terms is very likely a loss regardless of effort.** Exact-match-domain microsites and rdy.gg/Liquipedia will win "TI 2026 bracket" outright. Don't let that failure mode absorb effort that belongs on the VOD long-tail wedge, which is winnable.

---

## Priority Ranking

1. Fix `llms.txt`/`llms-full.txt` TI 2026 entry (trivial, direct GEO impact)
2. Fix sitemap duplicate-URL defect (trivial, crawl-budget hygiene during peak week)
3. Register Bing Webmaster Tools (trivial, unblocks a real channel)
4. Publish "how to watch TI 2026" page this week
5. Commit to and staff the daily spoiler-safe recap cadence for Aug 13–23
6. Pre-build the "Who won TI 2026?" instant-publish page
7. Reddit utility-comment experiment (Days 1–3, evaluate before scaling)
8. Caster/co-streamer outreach (low cost, asynchronous, can run any time)
9. Google News sitemap feasibility check (medium effort — evaluate this week, execute only if realistic before Aug 13)

---

## Next Actions

- Today/tomorrow: items 1–3 above (all trivial, zero code-freeze risk)
- By Aug 6: "how to watch TI 2026" page live
- By Aug 8: daily-recap staffing plan confirmed (who writes it, what time it publishes each day)
- By Aug 11: "Who won TI 2026?" template staged and ready, Google News feasibility decided
- Aug 12–13: Bing/IndexNow verification pass on live TI URLs, first Reddit utility-comment test
- Aug 13–23: run the recap cadence, monitor the Experiments table daily, don't let engagement dashboards distract from the Aug 24+ retention number

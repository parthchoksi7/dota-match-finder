# Dota Match Finder — Competitive Research

## Summary
No competitor combines timestamped VOD deep links with AI match summaries. That is the core moat of Dota Match Finder.

---

## Direct Competitors (VOD & Match Finding)

### 1. GGScore.com
- **What it does:** Multi-esport platform with a dedicated Dota 2 VOD section showing past tournament games with stream links
- **Data source:** Unknown, likely PandaScore or internal scraping
- **Strengths:** Broad game coverage, clean UI, match history
- **Weaknesses:** No timestamped deep links, no AI, requires manual VOD scrubbing, not Dota-focused
- **Verdict:** Closest direct competitor but misses the core feature

### 2. Liquipedia
- **What it does:** Community wiki with match pages, draft details, and VOD links where available
- **Data source:** Community maintained (manual updates)
- **Strengths:** Most authoritative Dota esports resource, deep tournament history, trusted brand
- **Weaknesses:** Manually updated, no automated timestamps, no AI, requires multi-page navigation to find a match
- **Verdict:** The gold standard for information but not a product — a wiki

### 3. joinDOTA
- **What it does:** Dota-focused platform for finding streams and VODs for past tournaments
- **Data source:** Community + manual curation
- **Strengths:** Dota-only focus, passionate community
- **Weaknesses:** No timestamping, no AI, manually maintained, aging product
- **Verdict:** Dota-focused but no automation or intelligence

### 4. Strafe.com
- **What it does:** Well-funded multi-esport hub covering Dota 2, CS2, Valorant, LoL and more with live scores, schedules, tournament brackets, news and stats
- **Data source:** PandaScore (primary), founded in Stockholm in 2014
- **Strengths:** Live scores, real-time match tracking, tournament brackets, match calendar, mobile app, multi-game reach, news and editorial, well-funded
- **Weaknesses:** No timestamped VOD deep links, no AI summaries, Dota is just one of many games (less depth)
- **Verdict:** Biggest and best-resourced competitor but has never solved the VOD timestamp problem

### 5. GosuGamers
- **What it does:** Esports news and coverage site with a dedicated Dota 2 VODs section
- **Data source:** Manual curation + community
- **Strengths:** Long-standing brand, editorial content, VOD listings
- **Weaknesses:** No timestamps, no AI, mostly a news site not a tool
- **Verdict:** Media competitor, not a product competitor

---

## Indirect Competitors (Stats & Analysis)

### 6. STRATZ
- **What it does:** AI-powered Dota 2 stats platform with match predictions, draft analysis, personalized data visualizations, and an MVP metric called IMP
- **Data source:** Valve's official Dota 2 API + own parsing
- **Strengths:** Best-in-class Dota stats, AI predictions, draft analysis, beautiful visualizations, GraphQL API
- **Weaknesses:** No VOD linking whatsoever, stats-only product
- **Verdict:** The smartest stats tool in Dota but completely different use case — complementary not competing

### 7. Dotabuff
- **What it does:** Longest-standing Dota stats site — player profiles, hero meta, match history
- **Data source:** OpenDota / Valve API
- **Strengths:** Trusted brand, large user base, deep player stats
- **Weaknesses:** No VOD linking, no AI, pro match coverage is limited
- **Verdict:** Player-focused stats tool, not a pro match viewer tool

### 8. Esports Charts
- **What it does:** Esports analytics and viewership data platform — tracks peak viewers, hours watched, tournament audience metrics
- **Data source:** Twitch/YouTube/streaming platform APIs + proprietary data
- **Strengths:** Viewership analytics, sponsor insights
- **Weaknesses:** Analytics only, no match finding, no VOD linking, no AI
- **Verdict:** Different audience (sponsors, teams, analysts) — not a fan tool

---

## Data Provider Landscape (B2B, Not Direct Competitors)

These are the companies that power other products' data — not direct competitors but worth knowing:

| Provider | What They Offer | Notable Clients |
|---|---|---|
| **PandaScore** | Real-time esports stats + odds API for Dota 2, LoL, CS2 | Strafe, betting operators |
| **GRID** | Official game server data via publisher partnerships for Dota 2 + CS2, free for developers | Broadcasters, analysts |
| **Abios** | Esports data + widgets for 20 titles including Dota 2 | Media, fantasy, betting |
| **GameScorekeeper** | Esports data for media, fantasy, and betting | Global media companies |
| **OpenDota** | Free open-source Dota 2 match data API | Us, Dotabuff, developers |
| **STRATZ API** | GraphQL Dota 2 data API with pro match + draft data | Developers |

**Note:** GRID offers free access to Dota 2 official data for developers and pre-revenue startups — worth applying for as our data improves.

---

## Competitive Matrix

| Feature | Dota Match Finder | Strafe | Liquipedia | GGScore | STRATZ |
|---|---|---|---|---|---|
| Timestamped VOD deep links | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI match summary | ✅ | ❌ | ❌ | ❌ | ❌ |
| Search by team/tournament | ✅ | ✅ | ✅ | ✅ | ❌ |
| Series score grouping | ✅ | ✅ | ✅ | ✅ | ❌ |
| Live scores | ❌ | ✅ | ✅ | ✅ | ❌ |
| Tournament brackets | ❌ | ✅ | ✅ | ✅ | ❌ |
| Draft analysis | ❌ | ❌ | ✅ | ❌ | ✅ |
| Player stats | ❌ | ✅ | ✅ | ✅ | ✅ |
| Dota-only focus | ✅ | ❌ | ✅ | ❌ | ✅ |
| Free, no login | ✅ | ✅ | ✅ | ✅ | ✅ |
| Automated (no manual updates) | ✅ | ✅ | ❌ | Partial | ✅ |

---

## Our Moat

**Nobody has built timestamped VOD deep links + AI match summaries.** Every competitor either:
- Links to a VOD but makes you scrub through it manually (GGScore, Liquipedia, GosuGamers)
- Has great stats but no VOD access (STRATZ, Dotabuff)
- Covers schedules and scores but not replay discovery (Strafe)

The gap we fill: *You watched the schedule. You missed the match. Now find it and understand what happened — in two clicks.*

## Biggest Threats
1. **Strafe** could add VOD timestamps if they prioritize it — they have the resources
2. **Liquipedia** already has VOD links, they could automate timestamps
3. **STRATZ** could add VOD linking to complement their existing AI features

None of them have done it yet. That's the window.
# Spectate Esports — Project Context

## What It Does
Spectate Esports is a pro Dota 2 match viewer. Users search for a team or tournament, see recent series results, and get a direct Twitch VOD link timestamped to the exact game. It also shows the full draft (picks, bans, player stats) and generates an AI match summary. The homepage shows live matches (with series scores and completed game chips), upcoming scheduled matches, and a Tournament Hub with standings, schedule, and format info.

Live at: https://spectateesports.live
GitHub: https://github.com/parthchoksi7/dota-match-finder

---

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Deployment**: Vercel (with Edge Middleware for OG tags + path-based routing)
- **Backend**: Vercel serverless functions (`/api/`)
- **Data**: OpenDota API (match data), Twitch API (VOD links), PandaScore API (live/upcoming/tournament data)
- **Cache**: Upstash Redis (KV) for live/upcoming/tournament caching
- **AI**: Anthropic Claude Haiku via `/api/summarize.js`
- **Analytics**: Vercel Analytics with custom events + Google Analytics (GA4)

---

## Key Files

### Frontend
- `src/App.jsx` - Main app, state management, search, load more, drawer, spoiler-free toggle, slug URL generation
- `src/main.jsx` - Entry point; path-based routing: `/about` -> AboutPage, `/release-notes` -> ReleaseNotesPage, else App
- `src/api.js` - All API calls: OpenDota, Twitch VOD search, hero fetching, match summaries
- `src/components/MatchDrawer.jsx` - Slide-in drawer showing match details, VOD links, draft, AI summary
- `src/components/DraftDisplay.jsx` - Hero picks, bans, player names, KDA
- `src/components/MatchList.jsx` - Search results list grouped into series
- `src/components/LatestMatches.jsx` - Homepage latest results with styled header and tournament change dividers
- `src/components/UpcomingMatches.jsx` - Live Now + Upcoming Matches sections (separate bordered boxes, polls every 2 min)
- `src/components/MatchCard.jsx` - Individual series card with expand/collapse
- `src/components/SearchBar.jsx` - Search input (no suggestions)
- `src/components/SiteHeader.jsx` - Shared site header used by all pages; manages theme toggle; accepts optional `spoilerFree`/`onSpoilerToggle` props for homepage
- `src/components/TournamentHub.jsx` - Tournament section with Overview/Standings/Schedule tabs, format badge, event stage pipeline, bracket view
- `src/components/WatchBadge.jsx` - Watchability badge component
- `src/pages/AboutPage.jsx` - React About page (served at `/about`)
- `src/pages/ReleaseNotesPage.jsx` - React Release Notes page (served at `/release-notes`)
- `src/utils.js` - Series grouping logic (`groupIntoSeries`, `isSeriesComplete`)

### Backend (Vercel Serverless)
- `api/summarize.js` - Generates AI match summary using Claude Haiku
- `api/twitch-token.js` - Handles Twitch OAuth client credentials flow
- `api/live-matches.js` - Fetches live Dota 2 matches from PandaScore; cached in KV for 2 min
- `api/upcoming-matches.js` - Fetches upcoming matches (next 72h) from PandaScore; cached in KV
- `api/tournament-detail.js` - Fetches tournament standings, bracket, and sibling stages from PandaScore; cached in KV for 3 min
- `api/sitemap.js` - Generates `/sitemap.xml` with slug URLs for recent Tier 1 matches; cached at edge for 1h
- `api/watchability.js` - Watchability scoring logic
- `api/og.js` - OG image/metadata generation for share card URLs
- `api/tournaments.js` - Tournament data endpoint
- `api/match-streams.js` - Looks up KV store for matchId → Twitch channel mappings; used to resolve exact VOD channel

### Config
- `vercel.json` - Rewrites: `/sitemap.xml` -> `/api/sitemap`, `/match/:matchId` -> `/`, `/about` -> `/`, `/release-notes` -> `/`
- `middleware.js` - Edge middleware: intercepts `/match/*` requests, injects per-match OG meta tags server-side

---

## Environment Variables (Vercel)
- `VITE_TWITCH_CLIENT_ID` - Twitch app client ID
- `TWITCH_CLIENT_SECRET` - Twitch app client secret (server only)
- `ANTHROPIC_API_KEY` - Claude API key for AI summaries
- `PANDASCORE_TOKEN` - PandaScore API token for live/upcoming/tournament data
- `KV_REST_API_URL` - Upstash Redis REST URL
- `KV_REST_API_TOKEN` - Upstash Redis REST token

---

## Core Features

### Match Discovery
- Fetches pro matches from OpenDota `/promatches` endpoint
- Filters to Tier 1 tournaments only using keyword list in `api.js`
- Paginates by fetching until 20 Tier 1 matches found per page
- Groups individual games into series (BO1/BO3/BO5)
- Search filters `allMatches` live so load more updates results automatically

### SEO Match URLs & Sitemap
- Match URLs use keyword-rich slugs: `/match/team-spirit-vs-gaimin-gladiators-dreamleague-s23-{matchId}`
- `slugify()` and `getMatchSlug()` in `App.jsx` generate the slug from team names, tournament, and match ID
- Match ID always at the end of the slug for reliable extraction: `pathname.match(/^\/match\/.*?(\d+)\/?$/)`
- Old hash URLs (`#match-{id}`) and numeric URLs (`/match/{id}`) still work - backwards-compatible
- `middleware.js` injects per-match OG meta tags (title, description, og:image) for social sharing and SEO
- `api/sitemap.js` generates a full XML sitemap with slug URLs for all recent Tier 1 matches

### Live Matches (PandaScore)
- `api/live-matches.js` calls PandaScore `/dota2/matches/running`
- Filters to Tier 1 tournaments, maps each match to `{id, teamA, teamB, tournament, seriesLabel, seriesScore, currentGame, games, streams}`
- `seriesScore` - derived from `m.results` (per-team win counts mapped by team ID)
- `currentGame` - position of the game with `status === 'running'`
- `games` - array of `{position, status, winnerName, matchId}` where `matchId` is `external_identifier` (OpenDota match ID)
- Cached in Upstash Redis for 2 minutes; bust cache via `?bust=1`
- Frontend: scoreboard layout (TeamA | score centered | TeamB), pulsing G{n} indicator, completed game chips
- Completed game chips are clickable - calls `handleSelectMatchId(matchId)` to open the match drawer
- Spoiler-free mode: hides series score (shows "vs"), hides winner names in chips, disables team dimming

### Upcoming Matches (PandaScore)
- `api/upcoming-matches.js` fetches next 72h of scheduled matches
- Displayed with scheduled time in user's local timezone
- Searchable by team or tournament name (shared search bar with live section)
- Shows first 2 by default, "Show N more" button to expand all
- Stream buttons (Twitch) shown when available

### Tournament Hub (PandaScore)
- `api/tournament-detail.js` fetches from 3 PandaScore endpoints in parallel:
  - `/tournaments/{id}` - tournament metadata (teams, `has_bracket`, `serie_id`)
  - `/tournaments/{id}/standings` - W-L table
  - `/tournaments/{id}/brackets` - flat match list named "Round N: ..."
- Also fetches sibling stages via `?filter[serie_id]={id}` to show the full event pipeline
- Format inference (`inferFormat()`): `has_bracket: false` + "Group Stage" name -> Swiss; `has_bracket: true` + "Playoffs" -> Double Elimination
- Cached under `dota2:tournament_detail_v3:{id}` for 3 minutes (changes during live matches)
- TournamentHub UI has 3 tabs: Overview | Standings | Schedule
  - **Overview**: format badge (e.g. "Swiss - 5R"), event stage pipeline (Group Stage -> Playoffs), `FormatTooltip` explaining each format
  - **Standings**: W-L table with advancing/eliminated zone indicators
  - **Schedule**: matches grouped by round; live matches pulse, finished show scores, upcoming show kickoff time
- `FormatTooltip` uses `position: fixed` + `getBoundingClientRect()` to escape overflow:hidden parent containers
- Multi-stage switcher appears when multiple stages of the same event are running simultaneously

### VOD Linking
- Searches multiple Twitch channels simultaneously using `Promise.allSettled`
- Returns ALL matching channels (not just first hit) - shown as multiple watch buttons
- Channels tracked: ESL Main, ESL Ember, ESL Storm, ESL Earth, BTS, PGL, WePlay, DreamLeague, and more
- **Stream mapping (timestamp-based)**: while a match is live with exactly 1 tracked English stream, `api/live-matches.js` writes `stream:ts:{roundedBeginAt}` → channel to KV (14-day TTL). Key is `begin_at` unix timestamp rounded to 5 min.
- PandaScore's `external_identifier` (OpenDota match ID) is never populated, so matching is done by timestamp instead
- `api/match-streams.js` supports `?ts=` param: tries rounded ±1 bucket (±5 min) to absorb drift between PandaScore `begin_at` and OpenDota `start_time`
- On drawer open, `fetchMatchStreams(matchId, startTime)` is called; `streamMap[startTime]` is used as `preferredChannel` if found
- When `preferredChannel` is set, only that channel is searched (single result); otherwise falls back to full group search
- When multiple streams were live, an inline note explains the ambiguity

### Draft Display
- Fetches full match data from OpenDota `/matches/{id}`
- Shows hero picks per team with player pro names (`p.name || p.personaname`)
- Shows bans grouped by team with strikethrough styling
- Hero names fetched from OpenDota `/heroes` endpoint with in-memory cache

### AI Summary
- Sends trimmed match data to `/api/summarize` -> Claude Haiku
- Hero IDs resolved to names before sending to prevent hallucinations
- Pro player names used (`p.name` field from OpenDota)
- Output format: DRAFT ANALYSIS (with Draft Winner) / STRATEGY / MVP / HIGHLIGHT
- Plain text only, no markdown
- Cached in localStorage by match ID

### Share Links & OG Cards
- Clicking a match updates URL to slug path `/match/teamA-vs-teamB-tournament-{id}`
- On page load, slug is parsed and drawer auto-opens
- Falls back to fetching match directly from OpenDota if not in loaded batch (`handleSelectMatchId`)
- `api/og.js` generates OG metadata/PNG images for social share previews
- `middleware.js` (Vercel Edge) intercepts `/match/*` requests and injects correct title + OG tags

### Spoiler-Free Mode
- Toggle in `App.jsx` - passed as `spoilerFree` prop to `UpcomingMatches` and `MatchCard`
- In live section: hides series score, winner names in game chips, disables team dimming
- In latest results: hides game outcomes in `MatchCard`

### Latest Results UI
- Styled section header (matches Live Now / Upcoming header style)
- Date dividers: "Today", "Yesterday", or "Mar 7" labels between groups of matches from different days

### Static Pages (React)
- About page at `/about` - served by `src/pages/AboutPage.jsx` via Vercel rewrite + path routing in `main.jsx`
- Release Notes at `/release-notes` - served by `src/pages/ReleaseNotesPage.jsx` via same pattern
- Both pages use `SiteHeader` (shared component) — identical header across all pages
- Old `.html` files in `public/` are superseded but not deleted

---

## Known Issues / Limitations
- Role detection (Carry/Mid/Off/Support) is removed - OpenDota `lane_role` field is unreliable
- VOD channel selection is best-effort when multiple streams were live simultaneously; resolved automatically for single-stream matches via KV mapping
- Twitch VODs expire after 60 days - old matches will show "No VOD found"
- Search only searches already-loaded matches - user must click "Load more matches" to expand search
- Live match KV cache must be busted after deploying new fields: `/api/live-matches?bust=1`
- Tournament bracket parsing relies on PandaScore naming format "Round N: ..." - may break if format changes

---

## Tier 1 Tournament Keywords (in `api.js` and `api/live-matches.js`)
```
dreamleague, esl one, esl challenger, pgl wallachia, pgl, beyond the summit,
weplay, starladder, the international, blast slam, blast, fissure, ewc,
esports world cup, riyadh masters
```

---

## Recurring Patterns

### Fix Scripts
Due to a known issue where Claude's XML responses strip opening `<a` anchor tags, file edits are done via Python scripts rather than direct paste. Pattern:
```python
code = '''...full file content...'''
with open('src/components/MatchDrawer.jsx', 'w') as f:
    f.write(code)
```

### Adding New Features
1. Data changes -> `src/api.js` or relevant `api/*.js` serverless function
2. UI changes -> relevant component
3. State/flow changes -> `src/App.jsx`
4. AI prompt changes -> `api/summarize.js`
5. Static page changes -> `src/pages/AboutPage.jsx` or `src/pages/ReleaseNotesPage.jsx`

### Cache Busting (KV)
- Live matches: `https://spectateesports.live/api/live-matches?bust=1`
- Upcoming matches: `https://spectateesports.live/api/upcoming-matches?bust=1`
- Tournament detail: `https://spectateesports.live/api/tournament-detail?id={id}&bust=1`

---

## Backlog / Future Ideas

### Other Ideas
- Hero images from Valve CDN using hero key
- Team logos (no reliable free API - OpenDota has partial coverage)
- Role labels (Carry/Mid/Off/Support) - needs better detection logic
- Mobile bottom sheet optimization
- Expand beyond Dota 2 to other esports (CS2, LoL, Valorant)

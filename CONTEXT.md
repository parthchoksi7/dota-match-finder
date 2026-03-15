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
- `src/pages/Tournaments.jsx` - Tournament list page at `/tournaments`; fetches from `/api/series-list`; shows live/upcoming/completed sections; fires `tournament_list_view` GA4 event
- `src/pages/TournamentDetail.jsx` - Tournament detail page at `/tournament/:seriesId`; fetches from `/api/series-detail`; shows header, AI summary, teams+rosters, stages+standings, VOD search links
- `src/components/TournamentBar.jsx` - Compact homepage bar (below search) showing live tournaments with pulse dot and upcoming with countdown; fetches from `/api/series-list`; max 3 items
- `src/components/TournamentCard.jsx` - Card used on /tournaments list page; shows status badge, date range, prize pool, stage pills
- `src/components/TeamRoster.jsx` - Collapsible team card showing logo, region badge, qualification status, player list with nationality flags
- `src/components/RegionBreakdown.jsx` - Region summary pills (WEU/EEU/CN/SEA/NA/SA) for teams section
- `src/components/StageTimeline.jsx` - Horizontal timeline of tournament sub-stages; highlights active stage in red
- `src/utils/regions.js` - Country code to Dota 2 region mapping; `getRegion(code)`, `getRegionColor(region)`, `groupTeamsByRegion(teams)`, `getRegionSummary(teams)`
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
- `src/components/TournamentHub.jsx` - Tournament section with Overview/Standings/Schedule/Heroes tabs, format badge, event stage pipeline, horizontal bracket tree, stage switcher
- `src/components/XPostsModal.jsx` - Modal for displaying AI-generated X/Twitter posts per game in a series, plus series summary and downloadable result image
- `src/components/WatchBadge.jsx` - Watchability badge component
- `src/pages/AboutPage.jsx` - React About page (served at `/about`)
- `src/pages/ReleaseNotesPage.jsx` - React Release Notes page (served at `/release-notes`)
- `src/utils.js` - Series grouping logic (`groupIntoSeries`, `isSeriesComplete`)

### Backend (Vercel Serverless)
- `api/series-list.js` - Fetches Dota 2 series (live, upcoming, past) from PandaScore; filters to Tier 1; cached 1h in KV under `tournaments:dota2:series_list_v1`. Returns `{ live, upcoming, completed }` arrays for the /tournaments page and TournamentBar.
- `api/series-detail.js` - Fetches a single series by ID, then fetches rosters and standings for each tournament sub-stage in parallel; cached 30min under `tournament:detail:series:{id}`. Accepts `?id=` param.
- `api/tournament-summary.js` - Generates AI tournament summary via Claude Haiku; cached 24h (30 days for completed) under `tournament:summary:{id}`. POST with `{ seriesId, name, leagueName, status, beginAt, endAt, prizePool, teams, stages }`.
- `api/summarize.js` - Generates AI match summary using Claude Haiku
- `api/twitch-token.js` - Handles Twitch OAuth client credentials flow
- `api/live-matches.js` - Fetches live Dota 2 matches from PandaScore; cached in KV for 2 min
- `api/upcoming-matches.js` - Fetches upcoming matches (next 72h) from PandaScore; cached in KV
- `api/tournament-detail.js` - Fetches tournament standings, bracket, and sibling stages from PandaScore; cached in KV for 3 min
- `api/tournament-heroes.js` - Aggregates hero pick/ban stats across all finished tournament games via OpenDota. Step 1: looks up the tournament serie name from PandaScore if not passed by the frontend. Step 2: searches OpenDota `/api/leagues` (9000+ leagues, cached 24h as `opendota:leagues_v1`) using token overlap matching to find the right league. Step 3: fetches `/api/leagues/{leagueid}/matches` then full match details in batches of 10 via `/api/matches/{id}` to get picks_bans. Hero IDs resolved to names via `/api/heroes` (cached 24h as `opendota:hero_map_v1`). Cached in KV for 3h under `dota2:tournament_heroes_v7:{id}`. PandaScore does not expose picks_bans on any accessible endpoint (the /dota2/games list endpoint does not exist; embedded games in /matches omit picks_bans; /matches/{id}/games requires a higher-tier plan).
- `api/draft-posts.js` - Generates per-game X/Twitter posts using Claude Haiku; varied tone per game (opener/momentum/decider); posts kept under 220 chars to fit a VOD URL
- `api/og-series.js` - Renders a 1200x630 series result image (winner, score, tournament, format) using satori + resvg; used in X posts modal as a downloadable PNG
- `api/match-streams.js` - KV lookup endpoint that returns the stored stream channel for a batch of OpenDota match IDs; used to resolve exact VOD channel before Twitch search
- `api/sitemap.js` - Generates `/sitemap.xml` with slug URLs for recent Tier 1 matches; cached at edge for 1h
- `api/watchability.js` - Watchability scoring logic
- `api/og.js` - OG image/metadata generation for share card URLs
- `api/tournaments.js` - Tournament data endpoint
- `api/match-streams.js` - Looks up KV store for matchId → Twitch channel mappings; used to resolve exact VOD channel

### Config
- `vercel.json` - Rewrites: `/sitemap.xml` -> `/api/sitemap`, `/match/:matchId` -> `/`, `/about` -> `/`, `/release-notes` -> `/`, `/tournaments` -> `/`, `/tournament/:seriesId` -> `/`
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

### Tournament Hub Pages (NEW - Mar 2026)
- Separate from the existing TournamentHub component (which lives on the homepage)
- Three new routes: `/tournaments` (series list), `/tournament/:seriesId` (series detail)
- Uses PandaScore **series** endpoints (`/dota2/series/running`, `/dota2/series/upcoming`, `/dota2/series/past`) - different from the existing TournamentHub which uses **tournament** (sub-stage) endpoints
- `api/series-list.js` returns series-level objects (not individual tournament stages); each series has `tournaments[]` array for sub-stages
- `api/series-detail.js` fetches rosters via `/tournaments/{id}/rosters` and standings via `/tournaments/{id}/standings` for each sub-stage
- Routing follows same pattern as AboutPage/ReleaseNotesPage - path check in `main.jsx`, Vercel rewrite to `/` in `vercel.json`
- Cache keys: `tournaments:dota2:series_list_v1` (1h), `tournament:detail:series:{id}` (30min), `tournament:summary:{id}` (24h / 30d for completed)
- GA4 events: `tournament_list_view`, `tournament_card_click`, `tournament_detail_view`, `tournament_team_click`, `tournament_stage_click`, `tournament_summary_view`, `tournament_stream_click`, `tournament_bar_click`
- TournamentBar appears on homepage below search bar when not in search mode; shows max 3 items (live first, then upcoming with countdown)
- Country-to-region mapping in `src/utils/regions.js` covers WEU, EEU, CN, SEA, NA, SA, ANZ, ME regions

### Tournament Hub (PandaScore)
- `api/tournament-detail.js` fetches from 3 PandaScore endpoints in parallel:
  - `/tournaments/{id}` - tournament metadata (teams, `has_bracket`, `serie_id`)
  - `/tournaments/{id}/standings` - W-L table
  - `/tournaments/{id}/brackets` - flat match list named "Round N: ..."
- Also fetches sibling stages via `?filter[serie_id]={id}` to show the full event pipeline
- Format inference (`inferFormat()`): `has_bracket: false` + "Group Stage" name -> Swiss; `has_bracket: true` + "Playoffs" -> Double Elimination
- Cached under `dota2:tournament_detail_v3:{id}` for 3 minutes (changes during live matches)
- TournamentHub UI has 4 tabs: Overview | Standings | Schedule | Heroes
  - **Overview** (ongoing): format badge + date range + round/team count at the top (always visible), then Live Now (running matches with pulsing dot). Stage switcher and Up Next / Standings snapshot are intentionally hidden on the Overview tab to reduce noise.
  - **Overview** (upcoming): shows other upcoming tournaments (Also coming up list).
  - **Standings**: W-L table with advancing/eliminated zone indicators. Always visible in the tab bar regardless of stage format. When the active stage is a bracket/elimination format, shows "No standings for bracket stages." with a shortcut to switch to the group stage (if one exists).
  - **Schedule**: bracket view; round column headers always show canonical labels (Round 1, Quarterfinal, Semifinal, Final) regardless of whether matches are TBD
  - **Heroes**: pick/ban frequency table for the tournament, sorted by contested (picks + bans). Shows picks, win%, bans, and P+B per hero. Fetched lazily on tab click via OpenDota API (see `api/tournament-heroes.js`). Shows top 25 heroes by default; a "Show all N heroes" button below the table expands to reveal all. Stage switcher is hidden on this tab (hero stats are tournament-wide, not stage-specific). Table uses `table-fixed` layout with truncated hero names and `overflow-x-auto` on the tab bar to avoid horizontal overflow clipping on mobile.
- `FormatTooltip` uses `position: fixed` + `getBoundingClientRect()` to escape overflow:hidden parent containers
- Multi-stage switcher appears when multiple stages of the same event are running simultaneously; hidden on Overview and Heroes tabs where stage context is irrelevant
- Bracket round labels are normalized in `parseBracketPosition()` (api/tournament-detail.js): "Semifinal 2" -> "Semifinal", "Upper Bracket Quarterfinal 1" -> "Quarterfinal", etc. Labels always render even when all matches in a round are still TBD.

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
- Draft data (picks/bans) is isolated from game results before sending to prevent the AI mixing up hero attributions with outcomes
- Pro player names used (`p.name` field from OpenDota)
- Output format: DRAFT ANALYSIS (with Draft Winner) / STRATEGY / MVP / HIGHLIGHT
- Plain text only, no markdown
- Cached in localStorage by match ID

### My Teams Follow System
- Users can follow/unfollow teams by clicking the star icon next to any team name on a match card
- Followed teams are stored in `localStorage` under the key `followedTeams` as a JSON array of team name strings
- `getFollowedTeams()` and `setFollowedTeams()` helpers in `src/utils.js` handle read/write with silent failure (e.g. incognito mode)
- `MyTeamsSection` component (`src/components/MyTeamsSection.jsx`) renders above `LatestMatches` on the homepage, filtered to completed series involving followed teams
- `ManageTeamsModal` (`src/components/ManageTeamsModal.jsx`) opens from the "Manage" link in the My Teams section header; lists followed teams with unfollow X buttons
- The modal shows a notice: followed teams are browser-only and will not persist across incognito, other browsers, or other devices
- No backend, no auth, no server state - entirely localStorage-based
- Spoiler-free mode is respected in the My Teams section the same way as the main list
- GA4 events: `follow_team`, `unfollow_team` (team_name param), `my_teams_section_view` (once per page load), `my_teams_vod_click` (match_id, team_name), `manage_teams_open`
- Star buttons are rendered only when `followedTeams` and `onToggleFollow` props are provided to MatchCard; silently absent otherwise
- MatchCard header uses `div[role="button"]` with keyboard handlers instead of `<button>` to allow nested `<button>` elements (the star follow buttons); the keydown handler guards against child button keypresses via `e.target !== e.currentTarget`

### X Posts
- "Draft X Posts" button appears on completed series cards (owner-only, gated by localStorage flag)
- Calls `api/draft-posts.js` (Claude Haiku) to generate one post per game with varied tone: opener, momentum shift, decider
- Each post is kept under 220 chars so a VOD URL fits within X's 280-char limit; no hashtags
- `XPostsModal` shows posts with individual copy buttons plus a series summary section at the top
- Series summary includes an AI-generated recap post and a downloadable 1200x630 result image from `api/og-series.js`
- All VOD links include UTM tags (`utm_source=twitter, utm_medium=social, utm_campaign=game-recap, utm_content=game-N`)
- Series link uses `utm_campaign=series-recap`

### Share Links & OG Cards
- Clicking a match updates URL to slug path `/match/teamA-vs-teamB-tournament-{id}`
- On page load, slug is parsed and drawer auto-opens
- Falls back to fetching match directly from OpenDota if not in loaded batch (`handleSelectMatchId`)
- `api/og.js` generates OG metadata/PNG images for social share previews
- `middleware.js` (Vercel Edge) intercepts `/match/*` requests and injects correct title + OG tags

### Spoiler-Free Mode
- Toggle in `App.jsx` - passed as `spoilerFree` prop to `UpcomingMatches`, `MatchCard`, `DraftDisplay`, and `MatchDrawer`
- In live section: hides series score, winner names in game chips, disables team dimming
- In latest results (`MatchCard`):
  - Hides series score (shows "? - ?")
  - Hides BO label (BO3/BO5) - format reveals series length
  - Hides game count in collapsed view ("X games") - replaced with "Click to expand"
  - Hides per-game winner in expanded list (shows "Hidden")
- In match drawer (`MatchDrawer`): game label shows "Game 1" not "Game 1 of 3" - series length is a spoiler
- In draft breakdown (`DraftDisplay`): hides KDA stats (kills/deaths/assists) for all players
- Reddit VOD post drafts only include game 1 data so the AI does not reference "Game 3" in generated content

### Latest Results UI
- Floating section label above the card (no internal header bar); gray left-border accent (`border-gray-400`)
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
- Tournament heroes: `https://spectateesports.live/api/tournament-heroes?id={id}&bust=1`

---

## Design System

A `DESIGN_GUIDELINES.md` file lives at the repo root. Claude should read it before making any UI change. It covers:
- Typography scale (Barlow Condensed for display, Barlow for body; 3 levels only)
- Color palette and token usage (red = accent/CTA only, purple = watch actions only)
- Spacing scale and component patterns (cards, buttons, tabs, loading states, empty states)
- Motion rules (drawer slide-in is the signature animation; no competing animations)
- Information hierarchy within components (What -> Result -> Context -> Actions)

### MatchCard visual hierarchy (updated Mar 13, 2026)
- Winner team name: `font-black` matching winning score weight; size `text-base sm:text-xl`
- Loser team name: `font-bold` with `text-gray-400 dark:text-gray-500` (muted but readable)
- Score separator: de-emphasized to `text-base font-medium text-gray-300 dark:text-gray-700`
- Duration in game rows: `tabular-nums text-gray-600 dark:text-gray-400`

### SiteHeader (updated Mar 13, 2026)
- X social icon removed from header (social follow is not a header-level action)
- Decorative vertical divider removed
- Tagline hidden on mobile (`hidden sm:block`) to reduce header height on small screens
- Nav link gap tightened to `gap-3 sm:gap-4`

### Homepage section labels (updated Mar 14, 2026)
- All 5 homepage sections (Live Tournament, Live Now, Upcoming Matches, My Teams, Latest Results) use floating `<h2>` labels rendered above the card border, replacing the previous internal gray header bars
- Each label has a `border-l-2` left-accent stripe: `border-red-500` for live, `border-blue-500` for upcoming, `border-amber-500` for My Teams, `border-gray-400` for Latest Results
- Documented in `DESIGN_GUIDELINES.md` under "Section labels"

### TournamentHub navigation (updated Mar 13, 2026)
- Tab bar (Overview/Standings/Schedule/Heroes) converted to segmented control: `inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5` container, active tab gets `bg-white dark:bg-gray-800` fill
- Tournament switcher (multi-tournament underline row) unchanged - uses underline pattern
- League organizer label: `getLeagueLabel(name)` helper extracts organizer from tournament name, shown as `text-xs uppercase tracking-[4px] text-red-500` eyebrow above tournament display name. Recognized: DreamLeague, ESL, PGL, BLAST, WePlay, Riyadh Masters, The International, Beyond The Summit
- Bracket round column labels turn `text-red-500` with a pulse dot when any match in that round is `status === 'running'`
- Live match card border: `border-red-500/80` (was /50)

---

## Backlog / Future Ideas

### Other Ideas
- Hero images from Valve CDN using hero key
- Team logos (no reliable free API - OpenDota has partial coverage)
- Role labels (Carry/Mid/Off/Support) - needs better detection logic
- Mobile bottom sheet optimization
- Expand beyond Dota 2 to other esports (CS2, LoL, Valorant)

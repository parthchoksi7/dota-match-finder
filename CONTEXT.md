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
- **Analytics**: Vercel Analytics with custom events + Google Analytics (GA4) + BigQuery export
- **Analytics AI**: Claude Sonnet via `/api/analytics-chat.js` with BigQuery tool use for live GA4 data queries

---

## Key Files

### Frontend
- `src/pages/Tournaments.jsx` - Tournament list page at `/tournaments`; fetches from `/api/series-list`; shows live/upcoming/completed sections; fires `tournament_list_view` GA4 event
- `src/pages/TournamentDetail.jsx` - Tournament detail page at `/tournament/:seriesId`; fetches from `/api/series-detail`; shows header, AI summary, teams+rosters, stages+standings, VOD search links
- `src/components/SearchSuggestions.jsx` - Replaces TournamentBar below the search bar on the homepage. Shows two sections: (1) **Recent** — last 5 searches from `localStorage` key `dota-recent-searches`, with individual × remove buttons and a "Clear all" action; (2) **Suggestions** — live tournament (red pulse dot + "Live" badge) followed by unique winning teams from the most recent completed matches (trophy icon, tournament sublabel). Clicking any item fires the search and saves to recents. Exports `addRecentSearch(query)` called by `App.jsx handleSearch` to persist every search automatically. Only renders when at least one section has items.
- `src/components/TournamentCard.jsx` - Card used on /tournaments list page; shows status badge, date range, prize pool, stage pills
- `src/components/TeamRoster.jsx` - Collapsible team card showing logo, region badge, qualification status, player list with nationality flags
- `src/components/RegionBreakdown.jsx` - Region summary pills (WEU/EEU/CN/SEA/NA/SA) for teams section
- `src/components/StageTimeline.jsx` - Horizontal timeline of tournament sub-stages; highlights active stage in red
- `src/utils/regions.js` - Country code to Dota 2 region mapping; `getRegion(code)`, `getRegionColor(region)`, `groupTeamsByRegion(teams)`, `getRegionSummary(teams)`
- `src/App.jsx` - Main app, state management, search, load more, drawer, spoiler-free toggle, slug URL generation
- `src/main.jsx` - Entry point; path-based routing: `/about` -> AboutPage, `/release-notes` -> ReleaseNotesPage, `/calendar` -> Calendar, `/preview` -> PreviewPage, else App
- `src/api.js` - All API calls: OpenDota, Twitch VOD search, hero fetching, match summaries
- `src/components/MatchDrawer.jsx` - Slide-in drawer showing match details, VOD links, draft, AI summary. Accepts optional `gameSwitcher` prop (any React node) rendered in a thin row between the header and the scrollable content area. Used by `/preview` to show in-drawer G1/G2/G3 game tabs; homepage never passes this prop so behaviour is unchanged.
- `src/components/DraftDisplay.jsx` - Hero picks, bans, player names, KDA
- `src/components/MatchList.jsx` - Search results list grouped into series
- `src/components/LatestMatches.jsx` - Homepage latest results with styled header and tournament change dividers
- `src/components/UpcomingMatches.jsx` - Live Now + Upcoming Matches sections (separate bordered boxes, polls every 2 min). Live Now heading shows a right-aligned match count when >1 matches are live.
- `src/components/MatchCard.jsx` - Individual series card with expand/collapse; each game row shows "Match Details" CTA (opens drawer with VOD, draft, AI summary); fires `game_click` + `card_vod_click` GA4 events on game row click; unplayed slots hidden in normal mode, shown as interactive placeholders in spoiler-free mode
- `src/components/SearchBar.jsx` - Search input. Exposes `{ focus(), setValue(v) }` via `useImperativeHandle` ref so parent can populate the input when a suggestion is clicked.
- `src/components/SiteHeader.jsx` - Shared site header used by all pages; manages theme toggle; accepts optional `spoilerFree`/`onSpoilerToggle` props for homepage
- `src/components/TournamentHub.jsx` - Tournament section with Overview/Standings/Schedule/Heroes tabs, format badge, event stage pipeline, horizontal bracket tree, stage switcher. When `ongoing.length > 1`: shows a horizontally-scrollable chip bar above the hub for switching between live tournaments; chips use adaptive labels via `getTabLabel()` — same org → region abbreviations (WEU/EEU/CN/SEA/NA/SA), different orgs → league names (ESL/PGL/DreamLeague), mixed → "League Region"; first tournament is pre-selected (no explicit state needed); section header shows "Live Tournaments" + inline count badge. Fires `tournament_hub_region_select` GA4 event on chip click. `extractRegion(name)` and `getLeagueLabel(name)` helpers drive the adaptive label logic.
- `src/components/XPostsModal.jsx` - Modal for displaying AI-generated X/Twitter posts per game in a series, plus series summary and downloadable result image
- `src/components/WatchBadge.jsx` - Watchability badge component
- `src/pages/PreviewPage.jsx` - **Internal** design preview at `/preview`; NOT indexed (disallowed in robots.txt); supports dark/light mode via Tailwind `dark:` variants throughout (toggled by header sun/moon button, persisted to localStorage key `"theme"` same as homepage), state-sectioned feed (Live Now / Coming Up / Results by date), abbreviated tournament names, followed-team amber accent, mobile bottom nav. Fetches same data as homepage: `/api/live-matches`, `/api/upcoming-matches`, `fetchProMatches`. Intentionally diverges from DESIGN_GUIDELINES (flat list rows, large display typography) as a design exploration. Follow/manage teams fully wired: star icons on hover next to team names, ManageTeamsModal accessible from header star button, persisted to localStorage. Starred-only filter toggle in Results header (amber pill) hides non-followed-team matches. Series-centric drawer: clicking a ResultCard opens the series (not a specific game), defaulting to the deciding game (last played non-unplayed game). `handleOpenSeries(series)` sets `selectedSeries` + `selectedGameIndex` state and calls `handleSelectMatch` on the deciding game. `handleSwitchGame(game, idx)` switches the active game inside the open drawer (reloads VOD + clears summary for the new game). `MatchDrawer` receives a `gameSwitcher` node (G1/G2/G3 tab buttons) rendered below its header when the series has multiple games. In non-spoiler mode each tab shows the game number + winner name (e.g. "G1 Parivision"); in spoiler mode shows only "G1 / G2 / G3". G1/G2/G3 chips on ResultCard are passive `<span>` status badges (green checkmark if that game has a winner in non-spoiler mode); not clickable. `abbrevTournament` keeps the event-specific identifier - strips year/stage suffix and takes first 2 words (e.g. "BLAST Slam 2026 - Group Stage" -> "BLAST Slam", "PGL Wallachia Season 8" -> "PGL Wallachia").
- `src/pages/AnalyticsPage.jsx` - **Private** analytics chat page at `/analytics`; password-gated; NOT indexed by Google; NOT in sitemap; checks `ANALYTICS_PASSWORD` via `/api/analytics-chat?mode=auth`
- `src/components/AnalyticsChat.jsx` - Chat UI for the analytics page; passes password in each request; supports suggested questions and conversation history
- `src/pages/AboutPage.jsx` - React About page (served at `/about`)
- `src/pages/ReleaseNotesPage.jsx` - React Release Notes page (served at `/release-notes`)
- `src/pages/Calendar.jsx` - Calendar feed builder at `/calendar`; team selector with slug autocomplete, generated URL, match preview, tournament feed list with Add to Calendar buttons; fires `calendar_page_view`, `calendar_team_select`, `calendar_team_remove`, `calendar_subscribe_modal_open` GA4 events
- `src/components/CalendarSubscribeModal.jsx` - Modal with subscription URL + Copy button + per-platform instructions accordion (Google, Apple, Outlook); fires `calendar_url_copy` GA4 event
- `src/utils/icsGenerator.js` - Client-side ICS utility: `generateCalendar()`, `generateMatchEvent()`, `generateTournamentEvent()`, `formatDateUTC()`, `formatDateOnly()`
- `src/utils.js` - Series grouping logic (`groupIntoSeries`, `isSeriesComplete`, `winsRequiredForSeries` — all exported); OpenDota `series_type` values: 0=BO1, 1=BO3, 2=BO5, **3=BO2** (undocumented); BO2 draws (1-1 after 2 games) are explicitly marked complete; `getSeriesLabel` maps seriesType 3 → "BO2"; `trackEvent` (dual Vercel + GA4 tracking) — always import this from utils, never redefine locally in components; `toTitleCase(str)` — capitalizes first letter of each word, used for display-layer tournament name formatting (applied in TournamentHub, PreviewPage pills, TournamentBar, Calendar)
- `src/components/CopyButton.jsx` - Shared copy-to-clipboard button with "Copied!" confirmation state; used by `XPostsModal` and `RedditPostsModal`

### Backend (Vercel Serverless)
- `api/series-list.js` - Fetches Dota 2 series (live, upcoming, past) from PandaScore; filters to Tier 1; cached 1h in KV under `tournaments:dota2:series_list_v1`. Returns `{ live, upcoming, completed }` arrays for the /tournaments page and TournamentBar.
- `api/series-detail.js` - Fetches a single series by ID, then fetches rosters and standings for each tournament sub-stage in parallel; cached 30min under `tournament:detail:series:{id}`. Accepts `?id=` param.
- `api/tournament-summary.js` - Generates AI tournament summary via Claude Haiku; cached 24h (30 days for completed) under `tournament:summary:{id}`. POST with `{ seriesId, name, leagueName, status, beginAt, endAt, prizePool, teams, stages }`.
- `api/summarize.js` - Generates AI match summary using Claude Haiku
- `api/twitch-token.js` - Handles Twitch OAuth client credentials flow
- `api/live-matches.js` - Fetches live Dota 2 matches from PandaScore; cached in KV for 2 min
- `api/upcoming-matches.js` - Fetches upcoming matches (next 72h) from PandaScore; cached in KV. Uses `getTwitchStreams` from `_shared.js` (respects `main:true` flag from `streams_list`). `getSeriesLabel` handles both legacy `match_type` values (`"best_of_3"`) and the newer `"best_of"` + `number_of_games` format.
- `api/tournament-detail.js` - Fetches tournament standings, bracket, and sibling stages from PandaScore; cached in KV for 3 min
- `api/tournament-heroes.js` - Aggregates hero pick/ban stats across all finished tournament games via OpenDota. Step 1: looks up the tournament serie name from PandaScore if not passed by the frontend. Step 2: searches OpenDota `/api/leagues` (9000+ leagues, cached 24h as `opendota:leagues_v1`) using token overlap matching to find the right league. Step 3: fetches `/api/leagues/{leagueid}/matches` then full match details in batches of 10 via `/api/matches/{id}` to get picks_bans. Hero IDs resolved to names via `/api/heroes` (cached 24h as `opendota:hero_map_v1`). Cached in KV for 3h under `dota2:tournament_heroes_v7:{id}`. PandaScore does not expose picks_bans on any accessible endpoint (the /dota2/games list endpoint does not exist; embedded games in /matches omit picks_bans; /matches/{id}/games requires a higher-tier plan).
- `api/draft-posts.js` - Two modes: (1) **cron** (`{ type: "cron" }`): owner-only auto-tweet system triggered by GitHub Actions every 30 min — fetches OpenDota promatches, filters Tier 1, posts per-game X threads and series summary tweets via Twitter OAuth 1.0a, deduplicates via Redis KV; (2) **manual** (`{ type: "x" }` or `{ type: "reddit" }`): generates per-game X posts or Reddit VOD roundup posts on demand for a given series; posts kept under 220 chars to fit a VOD URL
- `api/match-streams.js` - Stream channel lookup for a batch of OpenDota match IDs. Lookup order: (1) KV `stream:match:{id}` fast path; (2) PandaScore fuzzy match - queries `/dota2/matches` with a +/-1h time window around `?ts=` and fuzzy-matches `?radiantTeam=`/`?direTeam=` against PandaScore opponent names, caches result to KV; (3) ts fallback - reads `stream:ts:{bucket}` (now a JSON array of all channels active in that window) and returns them as `_candidates` for the frontend to narrow Twitch VOD search. Stream filter accepts any official Twitch URL regardless of language (English preferred, then any language) - previously English-only filter silently dropped Chinese/CIS qualifier streams. Logs all PandaScore streams on fuzzy match for diagnosability.
- `api/analytics-chat.js` - Merged analytics endpoint with 3 modes: `?mode=auth` (POST password check -> 200/401), `?mode=query` (direct BigQuery query for pageviews/top_pages/top_events/countries/custom SQL), default POST (Claude Sonnet chat with `query_analytics` tool use; agentic loop up to 5 tool calls per message; requires password in request body). Merged from 3 separate files to stay within the 12-function Vercel limit.
- `api/sitemap.js` - Generates `/sitemap.xml` with slug URLs for recent Tier 1 matches; cached at edge for 1h
- `api/watchability.js` - Watchability scoring logic
- `api/og.js` - OG image/metadata generation for share card URLs. Also handles series result images via `?mode=series` (1200x630 PNG with winner, score, tournament, format using satori + resvg; used in X posts modal as downloadable PNG). Merged from `og.js` + `og-series.js` to stay within the 12-function Vercel limit.
- `api/tournaments.js` - Multi-mode tournament endpoint. Default: sub-stage list for TournamentHub. `?mode=series`: series list for /tournaments page. `?mode=tier1-leagues`: returns `{ names: string[] }` — PandaScore tier S/A league names (e.g. "DreamLeague", "ESL One") used by `src/api.js` to filter OpenDota promatches. Fetches running+upcoming+past 30 tournaments from PandaScore, filters to tier S/A, extracts unique `t.league.name` values (min 4 chars). KV-cached 2h under `dota2:tier1_league_names_v1`; supports `?bust=1`. Never caches empty result. `?mode=grand-finals`: Grand Final OpenDota match IDs. `?mode=calendar-team&teams=slug1,slug2`: .ics team calendar feed (resolves slugs, fetches running+upcoming+past 7d matches, caches 30min under `calendar:matches:{sorted_slugs}`). `?mode=calendar-tournament&series={id}`: .ics tournament feed (all-day VEVENT for series + match VEVENTs, caches 30min under `calendar:series:{id}`). Both calendar modes return `text/calendar` not JSON. PandaScore does not support `filter[tier]` on any endpoint (returns 400). All tier filtering is done client-side after fetching with large page sizes (50-100). IMPORTANT: tier field locations differ by object type - tournament objects (`/dota2/tournaments/*`) have tier on `t.tier` directly; series objects (`/dota2/series/*`) have NO tier field at all (always null) - tier for series is derived by cross-referencing the tournament objects via `serie_id` sets (`tier1RunningSerieIds`, `tier1UpcomingSerieIds`, `tier1PastSerieIds`).
- `api/match-streams.js` - See description above
- `api/_shared.js` - **Shared utility module** (NOT a serverless function; Vercel ignores `_` prefixed files). Exports: `TIER1_LEAGUE_KEYWORDS` (string array — single source of truth for the league-name override: `['dreamleague', 'pgl', 'esl one', 'blast', 'weplay', 'the international']`); `isTier1ByFields(tier, leagueName)` (core tier-1 decision — accepts tier 's'/'a' OR a league name that matches a known top-tier brand; handles misclassified qualifier stages of major events); `isTier1(match)` (adapter for match objects — delegates to `isTier1ByFields` with `match.tournament.tier || match.league.tier` and `match.league.name`; IMPORTANT: match objects from `/dota2/matches/*` carry tier on `match.tournament.tier`, NOT `match.league.tier` which is always null); `buildPremiumLeagueIds(leagues)` (pure, returns a `Set` of OpenDota premium+professional league IDs); `getPremiumLeagueIds()` (async, cached). Also exports `getTwitchStreams(streamsList, leagueName, serieName)` used by `upcoming-matches.js`, `live-matches.js`, and `match-streams.js`; filters to official Twitch streams, prefers English but falls back to any language so regional qualifiers (China/CIS) are not silently dropped. `tournaments.js` imports `isTier1ByFields` and uses it in a local one-liner `isTier1(t) { return isTier1ByFields(t?.tier, t?.league?.name) }` for tournament objects. PandaScore tier field locations by object type: matches=`match.tournament.tier`, tournaments=`t.tier`, series=always null (derive from tournament objects).

### Config
- `vercel.json` - Rewrites: `/sitemap.xml` -> `/api/sitemap`, `/match/:matchId` -> `/`, `/about` -> `/`, `/release-notes` -> `/`, `/tournaments` -> `/`, `/tournament/:seriesId` -> `/`, `/calendar` -> `/`, `/analytics` -> `/`, `/preview` -> `/` (internal design preview, disallowed in robots.txt)
- `middleware.js` - Edge middleware: intercepts `/match/*` requests, injects per-match OG meta tags server-side

---

## Environment Variables (Vercel)
- `VITE_TWITCH_CLIENT_ID` - Twitch app client ID
- `TWITCH_CLIENT_SECRET` - Twitch app client secret (server only)
- `ANTHROPIC_API_KEY` - Claude API key for AI summaries
- `PANDASCORE_TOKEN` - PandaScore API token for live/upcoming/tournament data
- `KV_REST_API_URL` - Upstash Redis REST URL
- `KV_REST_API_TOKEN` - Upstash Redis REST token
- `GOOGLE_CREDENTIALS` - Service account JSON (minified, single line) for BigQuery access (project: spectate-esports)
- `GA4_BIGQUERY_DATASET` - BigQuery dataset name for GA4 export (e.g. `analytics_526697998`)
- `ANALYTICS_PASSWORD` - Password to access the private `/analytics` chat page

---

## Core Features

### Match Discovery
- Fetches pro matches from OpenDota `/promatches` endpoint
- Filters using a two-tier strategy (primary → fallback):
  1. **Primary (PandaScore names)**: `fetchTier1LeagueNames()` fetches `api/tournaments?mode=tier1-leagues` — returns tier S/A league names (e.g. "DreamLeague", "ESL One", "PGL") from PandaScore. `matchesTier1Names(m.league_name, tier1Names)` does case-insensitive substring match. These names are always substrings of OpenDota `league_name` values (e.g. "DreamLeague Season 25"). Names < 4 chars are skipped to avoid accidental broad matches.
  2. **Fallback (OpenDota premium IDs)**: used only when `matchesTier1Names` returns `null` (PandaScore names unavailable). `fetchPremiumLeagueIds()` fetches `/api/leagues` and filters to `tier === 'premium'` or `'professional'` leagues. Both fetches run in parallel with the promatches request and are cached per session.
- Groups individual games into series (BO1/BO2/BO3/BO5) — OpenDota series_type 3 = BO2 (undocumented); BO2 draws (1-1) are also explicitly marked complete
- Search filters `allMatches` live so load more updates results automatically

### SEO Match URLs & Sitemap
- Match URLs use keyword-rich slugs: `/match/team-spirit-vs-gaimin-gladiators-dreamleague-s23-{matchId}`
- `slugify()` and `getMatchSlug()` in `App.jsx` generate the slug from team names, tournament, and match ID
- Match ID always at the end of the slug for reliable extraction: `pathname.match(/^\/match\/.*?(\d+)\/?$/)`
- Old hash URLs (`#match-{id}`) and numeric URLs (`/match/{id}`) still work - backwards-compatible
- `middleware.js` injects per-match OG meta tags (title, description, og:image) for social sharing and SEO
- `api/sitemap.js` generates a full XML sitemap with slug URLs for all recent premium-tier matches

### Live Matches (PandaScore)
- `api/live-matches.js` calls PandaScore `/dota2/matches/running`
- Filters to tier-S and tier-A tournaments using `isTier1(m) || isTier1ByName(m, names)`. Primary: checks `match.tournament.tier`. Fallback: checks `match.league.name` against a merged names array: KV-cached tier1 names plus `PERMANENT_TIER1_NAMES` (hardcoded in `_shared.js`). The hardcoded list ensures DreamLeague, ESL One, PGL, etc. always pass even when KV is cold (e.g. fresh Redis flush). This matters for qualifier matches where PandaScore sets `tournament.tier = "c"` despite being a tier1 organizer event. Maps each match to `{id, teamA, teamB, tournament, seriesLabel, seriesScore, currentGame, games, streams}`
- `seriesScore` - derived from `m.results` (per-team win counts mapped by team ID)
- `currentGame` - position of the game with `status === 'running'`
- `games` - array of `{position, status, winnerName, matchId}` where `matchId` is `external_identifier` (OpenDota match ID)
- Cached in Upstash Redis for 2 minutes; bust cache via `?bust=1`
- Frontend: scoreboard layout (TeamA | score centered | TeamB), pulsing G{n} indicator, completed game chips
- Completed game chips are clickable - calls `handleSelectMatchId(matchId)` to open the match drawer
- Spoiler-free mode: hides series score (shows "vs"), hides winner names in chips, disables team dimming

### Upcoming Matches (PandaScore)
- `api/upcoming-matches.js` fetches next 72h of scheduled matches; tier-filters using same `isTier1(m) || isTier1ByName(m, names)` pattern as live-matches (same fallback for newly-created series with no tier assigned)
- Displayed with scheduled time in user's local timezone
- Searchable by team or tournament name (shared search bar with live section)
- Shows first 2 by default, "Show N more" button to expand all
- Stream buttons (Twitch) shown when available

### Tournament Hub Pages (NEW - Mar 2026)
- Separate from the existing TournamentHub component (which lives on the homepage)
- Two routes: `/tournaments` (series list), `/tournament/:seriesId` (series detail)
- Uses PandaScore **series** endpoints (`/dota2/series/running`, `/dota2/series/upcoming`, `/dota2/series/past`) - different from the existing TournamentHub which uses **tournament** (sub-stage) endpoints
- Series list mode lives in `api/tournaments.js` behind `?mode=series` query param (merged to stay within 12-function Vercel limit)
- Series detail mode lives in `api/tournament-detail.js` behind `?series=1` query param (same reason)
- AI tournament summaries live in `api/summarize.js` behind `type: 'tournament'` in POST body
- Upcoming tournaments: `/dota2/series/upcoming` is often empty because PandaScore creates series records late. A fallback fetches `/dota2/tournaments/upcoming?filter[tier]=s`, groups by `serie_id`, and synthesizes series-like entries for any not already in the running list
- Rosters and standings: `fetchSeriesRosters` uses the Dota 2-specific endpoint `/dota2/tournaments/{id}/rosters` (not the generic `/tournaments/{id}/rosters` - the generic endpoint returns team metadata only with no `players` array). Both functions use `Array.isArray()` guards (PandaScore can return non-array objects). If rosters are empty (common for upcoming events where lineups are unconfirmed), teams are built from standings as a fallback - team names and logos appear immediately, player rosters show "Roster unavailable" until PandaScore publishes them.
- Winner display: `serie.winner` field (type === 'Team') shown as champion on cards and detail page header
- Routing follows same pattern as AboutPage/ReleaseNotesPage - path check in `main.jsx`, Vercel rewrite to `/` in `vercel.json`
- Cache keys: `tournaments:dota2:series_list_v4` (1h), `tournament:detail:series:v6:{id}` (30min, or 30d for completed events WITH player data — skips 30d TTL if rosters came back empty so it retries), `tournament:summary:{id}` (24h / 30d for completed)
- GA4 events: `tournament_list_view`, `tournament_card_click`, `tournament_detail_view`, `tournament_team_click`, `tournament_stage_click`, `tournament_summary_view`, `tournament_stream_click`, `tournament_bar_click`, `tournament_back_click`, `tournament_liquipedia_click`, `tournament_find_vods_click`, `tournament_teams_toggle`, `tournament_stages_toggle`
- TournamentBar and Tournaments nav link are temporarily hidden until upcoming tournament data is confirmed reliable
- Country-to-region mapping in `src/utils/regions.js` covers WEU, EEU, CN, SEA, NA, SA, ANZ, ME regions

### Tournament Hub (PandaScore)
- `api/tournament-detail.js` fetches from 3 PandaScore endpoints in parallel:
  - `/tournaments/{id}` - tournament metadata (teams, `has_bracket`, `serie_id`)
  - `/tournaments/{id}/standings` - W-L table
  - `/tournaments/{id}/brackets` - flat match list named "Round N: ..."
- Also fetches sibling stages via running/upcoming/past status endpoints all filtered by `serie_id` to show full event pipeline including not-yet-started stages (e.g. upcoming Playoffs)
- Format inference (`inferFormat()`): checks tournament **name first** before `has_bracket`. If the name contains "group", it is always treated as Swiss/Group Stage regardless of `has_bracket` (PandaScore sometimes sets `has_bracket: true` on group stages). Then: `has_bracket: true` + "Playoffs" name -> Double Elimination; `has_bracket: true` otherwise -> Bracket.
- Cached under `dota2:tournament_detail_v3:{id}` for 3 minutes (changes during live matches)
- TournamentHub UI has 4 tabs: Overview | Standings | Schedule | Heroes
  - **Overview** (ongoing): format badge + date range + round/team count at the top (always visible), then Live Now (running matches with pulsing dot). Stage switcher and Up Next / Standings snapshot are intentionally hidden on the Overview tab to reduce noise.
  - **Overview** (upcoming): shows other upcoming tournaments (Also coming up list).
  - **Standings**: W-L table with advancing/eliminated zone indicators. Always visible in the tab bar regardless of stage format. When the active stage is a bracket/elimination format, shows "No standings for bracket stages." with a shortcut to switch to the group stage (if one exists).
  - **Schedule**: bracket view; round column headers always show canonical labels (Round 1, Quarterfinal, Semifinal, Final) regardless of whether matches are TBD
  - **Heroes**: pick/ban frequency table for the tournament, sorted by contested (picks + bans). Shows picks, win%, bans, and P+B per hero. Fetched lazily on tab click via OpenDota API (see `api/tournament-heroes.js`). Shows top 25 heroes by default; a "Show all N heroes" button below the table expands to reveal all. Stage switcher is hidden on this tab (hero stats are tournament-wide, not stage-specific). Table uses `table-fixed` layout with truncated hero names and `overflow-x-auto` on the tab bar to avoid horizontal overflow clipping on mobile.
- `FormatTooltip` uses `position: fixed` + `getBoundingClientRect()` to escape overflow:hidden parent containers
- The top tournament switcher (GROUP A / GROUP B tabs above the card) has been removed - it was redundant because the stage picker inside Standings/Schedule tabs already handles stage navigation
- Bracket round labels are normalized in `parseBracketPosition()` (api/tournament-detail.js): "Semifinal 2" -> "Semifinal", "Upper Bracket Quarterfinal 1" -> "Quarterfinal", etc. If a name looks like a team matchup (contains " vs " with no round keywords), the label is cleared to prevent PandaScore match names like "Tundra vs RNX" from appearing as section headers. `BracketFlatView` only renders the round header `<p>` when `label` is truthy.
- **Completed fallback (Mar 2026)**: `api/tournaments.js` default mode now fetches `/tournaments/past` and returns up to 3 recently completed tier-1 tournaments as `completed[]`. TournamentHub uses priority: running > upcoming > recently completed. When showing a completed event, the label reads "Recently Completed" with a gray border accent. This ensures the hub is never empty during breaks between events. Cache key bumped to `dota2:tournament_list_v4`.
- **Nav links (Mar 2026)**: "Tournaments" link added to SiteHeader top nav. "View all tournaments" footer link added inside TournamentHub card. Both link to `/tournaments`.
- **Card background (Apr 2026)**: `<section>` wrapper now has explicit `bg-white dark:bg-gray-950` so the segmented tab control (`dark:bg-gray-900`) and active tab (`dark:bg-gray-800`) have clear contrast on both homepage and /preview.

### VOD Linking
- PandaScore is the authoritative source for which Twitch channel streamed a match
- **Stream mapping (server-side cron)**: `api/live-matches.js?cron=1` is called every 30 min by GitHub Actions. It fetches running matches from PandaScore and writes `stream:match:{gameMatchId}` (nx:true - write-once) and `stream:ts:{roundedBeginAt}` (JSON array of active channels) to KV (14-day TTL). Cron runs are authenticated via `CRON_SECRET` header.
- On drawer open, `fetchMatchStreams(matchIds, startTime, radiantTeam, direTeam)` is called with all sibling game IDs and team names
- `match-streams.js` resolves channels in order: (1) KV fast path `stream:match:{id}`; (2) PandaScore fuzzy match (±1h time window + team name substring matching) - accepts any official Twitch stream (any language), preferring English; (3) ts bucket fallback - returns `_candidates` array of all channels active in that 5-min window
- `findTwitchVod` in `src/api.js` uses the resolved channel exclusively: if `preferredChannel` is set (from PandaScore), only that channel is searched on Twitch - **no fallback to other channels**. This prevents returning a wrong VOD from an unrelated stream active at the same time (e.g. ESL streaming DreamLeague while a BLAST match was running). If the VOD is not yet on that channel, or if no `preferredChannel` is available, "No VOD found" is returned. The `_candidates` ts-bucket array is still returned by the backend but is no longer acted on by the frontend - in multi-channel qualifier blocks it reliably pointed to concurrent matches on shared ESL sub-channels.
- `VOD_CHANNEL_LABELS` in `src/api.js` maps known channel handles to display names (ESL, PGL, BLAST, BTS, WePlay, etc.) for the Watch button labels
- `stream:ts:{bucket}` stores a JSON array of all channels active in that 5-min window; `cacheRunningStreams` writes the full array per bucket to avoid last-write-wins collisions

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

### Auto-Tweet (Owner Only — NOT Public)
- **This is an owner-only background feature. It must never be exposed in the UI or triggered by users.**
- A GitHub Actions cron (`.github/workflows/auto-tweet.yml`) runs every 30 minutes and POSTs to `/api/draft-posts` with `{ type: "cron" }`, authenticated via `CRON_SECRET`
- `runAutoTweet()` in `api/draft-posts.js` fetches recent pro matches from OpenDota `/api/promatches`, filters to premium-tier leagues (via `getPremiumLeagueIds()` from `api/_shared.js`), groups into series, and posts per-game tweets as a thread on X (Twitter)
- Per-game tweets reply to the previous game tweet to form a thread; the series summary tweet replies to the last game tweet to close the thread
- Series summary tweet includes a 1200x630 OG image generated via `api/og.js?mode=series`
- Redis (KV) is used to track which match IDs have already been tweeted (`auto-tweet:game:{matchId}`, `auto-tweet:series:{seriesKey}`) to prevent duplicate posts — keys expire after 30 days
- `MAX_PER_RUN = 5` caps tweets per cron execution
- Tweet text is generated by Claude Haiku via `callClaude()` — game tweets under 200 chars, series summary under 180 chars before link, no hashtags
- Game tweet prompt uses a social media manager persona with a **rotating opening angle** keyed to `gameNumber % 6`: (1) series implications, (2) loser focus, (3) bold hot take, (4) question for fans, (5) in-game moment (aegis/throne/comeback), (6) winner's team identity/reputation — this prevents any two games in the same series from having the same structure; duration is explicitly banned as an opener (can appear later in the tweet); never start with winner's name; banned generic win verbs (dominated/demolished/steamrolled etc.); natural Dota 2 vocabulary only where it fits; 1 emoji allowed if it adds energy; **series format context is explicitly passed** (BO1/BO2/BO3/BO5) so Claude doesn't use incorrect language — BO2 context explicitly bans: "decider", "Game 3", "series trophy", "clinch the series", "forces a decider", "decide it all", and explains that a 1-1 draw is a valid final result; **actual running series score after each game is passed** (e.g. "Aurora 2 – Falcons 0") so Claude never guesses the wrong score; BO2 detected via OpenDota `series_type: 3` (primary) or 1-1 draw after 2 games (fallback)
- Series tweet prompt uses same persona; first line must be exactly "{winner} {score} {loser}" with no changes; commentary frames the narrative (upset? dominant run? close fight?) using Dota 2 scene context; X handles for both teams and the tournament are appended automatically after the link (e.g. `@TundraEsports @TeamLiquid @ESLDota2`) using `TEAM_HANDLES` and `TOURNAMENT_HANDLES` lookup maps in `api/draft-posts.js` — add/update handles there as teams join the scene; only series tweets get mentions, not per-game tweets
- **BO2 draw series tweets**: `seriesComplete()` handles the 1-1 draw case — a BO2 with 2 games played and each team winning exactly 1 game is marked complete (maxWins=1 is not enough on its own, so the draw check is explicit). For draw series, `makeSeriesTweet` uses a separate prompt: first line is `"{team1} 1-1 {team2}"`, narrative frames it as a contested split with no winner — no "won against" language
- Game duration is formatted as `"{N} minutes"` (e.g. "53 minutes") — OpenDota `duration` field is in seconds
- Series score is always `"{winnerWins}-{loserWins}"` (e.g. "2-0") — both teams are initialized to 0 wins before counting so 2-0 sweeps don't produce a partial score
- Twitter auth uses OAuth 1.0a (API Key, API Secret, Access Token, Access Token Secret) — app must have **Read and Write** permissions; tokens must be regenerated after changing permissions
- Required env vars: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`

### X Posts
- "Draft X Posts" button appears on completed series cards (owner-only, gated by localStorage flag)
- Calls `api/draft-posts.js` (Claude Haiku, `type: "x"`) to generate one post per game with rotating angle (series implications, loser focus, bold take, fan question, in-game moment, team identity)
- Each post is kept under 220 chars so a VOD URL fits within X's 280-char limit; no hashtags
- `XPostsModal` shows posts with individual copy buttons plus a series summary section at the top
- Series summary includes an AI-generated recap post and a downloadable 1200x630 result image from `api/og.js?mode=series`
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
  - Unplayed game slots (e.g. Game 3 in a 2-0 BO3) are shown as interactive placeholders in spoiler-free mode, and hidden entirely in normal mode
- In match drawer (`MatchDrawer`): game label shows "Game 1" not "Game 1 of 3" - series length is a spoiler
- In draft breakdown (`DraftDisplay`): hides KDA stats (kills/deaths/assists) for all players
- Reddit VOD post drafts only include game 1 data so the AI does not reference "Game 3" in generated content

### Search and Filter
- Search input in `SearchBar.jsx` submits via form `onSubmit`; fires the `search` GA4 event with `{ query: <search text> }` param (tracked in `SearchBar.jsx`)
- Clearing the search via the X button calls `onClearSearch()` and fires `search_clear` GA4 event
- Filtering is done client-side in `App.jsx`: `allMatches` is filtered by the search query against team names and tournament name (case-insensitive substring match)
- Load More loads additional pages from OpenDota and appends to `allMatches`; search re-filters automatically since it reads from the full `allMatches` array
- Searching also filters `UpcomingMatches` (passed as `searchQuery` prop) against live/upcoming match team names
- **Recent searches**: every search is saved to `localStorage` key `dota-recent-searches` (up to 5, deduped, original case) via `addRecentSearch()` in `App.jsx handleSearch`. Displayed in `SearchSuggestions` below the search bar.
- **Suggestion clicks**: `handleSuggestionSelect(query)` in `App.jsx` calls `searchInputRef.current?.setValue(query)` (populates the SearchBar input) then `handleSearch(query)`. Fires `suggestion_click` GA4 event.

### Theme Toggle
- Dark/light mode stored in `localStorage` under key `"theme"`; default is `"dark"`
- Managed in `SiteHeader.jsx` via `useState` initializer reading from `localStorage`
- Toggles `dark` class on `document.documentElement` via `useEffect`
- Theme toggle fires `theme_toggle` GA4 event with the new theme value

### Watchability Badge
- `WatchBadge` component (`src/components/WatchBadge.jsx`) shown on each series card
- Fetches score from `api/watchability.js` (POST with `seriesId` and `matchIds`)
- Client-side decider bonus: if the series went to a deciding game, score is bumped by +1 (capped at 5)
- Ratings: `must_watch` (5), `good` (4), `average` (3), `skip` (1-2) — "skip" badges are not shown
- Signals: `gold_comeback`, `mega_comeback`, `back_and_forth`, `high_kills`, `good_duration`, `series_decider`
- In-memory cache (`memCache`) prevents re-fetching on re-renders; no localStorage/KV caching
- Fires `watchability_computed` GA4 event with rating, seriesId, and tournament
- `seriesWentToDecider()` pure function: true when both teams each have (winsRequired - 1) wins

### Calendar Feed Subscriptions (Mar 2026)
- Three .ics modes merged into `api/tournaments.js`:
  - `?mode=calendar-all` - All running + upcoming Dota 2 tournaments. Fetches all series and all matches in 4 parallel API calls. New matches (playoffs etc.) appear automatically on the next cache refresh (30min). Cache key: `calendar:all`.
  - `?mode=calendar-team&teams=slug1,slug2` - Team-specific feed; accepts comma-separated PandaScore slugs
  - `?mode=calendar-tournament&series={id}` - Single-series feed (legacy; the all-tournaments feed is preferred)
- Team feed: resolves each slug to a team ID, fetches running + upcoming + past 7d matches, deduplicates, generates VCALENDAR with match VEVENTs
- Tournament/all feed: generates one all-day VEVENT (TRANSP:TRANSPARENT) per series for the date range + individual match VEVENTs
- Series banner event duration: uses `series.end_at` if set; falls back to latest match `end_at` derived from the fetched matches; then falls back to `begin_at` (single day)
- Calendar display name format: `icalSeriesDisplayName()` strips 4-digit year and formats as `{League} {ShortName} - Dota 2` (e.g. "ESL Birmingham - Dota 2")
- Match event duration: Bo1=1h, Bo3=2h, Bo5=3h. Matches with no `begin_at` are skipped.
- All times in UTC format (YYYYMMDDTHHMMSSZ); calendar apps convert to local timezone automatically
- Caching: match data cached 30min in KV (`calendar:all`, `calendar:matches:{sorted_slugs}`, `calendar:series:{id}`), team ID lookups cached 24h (`calendar:team_id:{slug}`). All modes support `?bust=1` to clear cache.
- Response headers: `Content-Type: text/calendar`, `Cache-Control: public, max-age=1800`
- `/calendar` page: "All Tournaments" featured card at top of Tournament section with helper text + Subscribe button; individual per-tournament list below as secondary option; team selector with autocomplete + match preview
- `CalendarSubscribeModal`: reusable modal with URL copy button, collapsible platform instructions (Google/Apple/Outlook)
- `MyTeamsSection`: "Calendar" button in header opens subscribe modal pre-filled with followed team slugs
- `SiteHeader`: "Calendar" nav link added between Tournaments and About
- GA4 events: `calendar_page_view`, `calendar_subscribe_modal_open` (source: `all_tournaments` | `tournament` | `calendar_page`), `calendar_url_copy` (feed_type), `calendar_team_select` (team_name), `calendar_team_remove` (team_name)
- Team name to PandaScore slug mapping: `CAL_SLUG_ALIASES` in `api/tournaments.js` and `teamNameToSlug` helper in `MyTeamsSection.jsx`
- Calendar modes are merged into `api/tournaments.js` to stay within the 12-function Vercel Hobby plan limit

### Grand Final Card Highlighting (Mar 2026)
- Grand Final series are visually distinct in LatestMatches and MyTeamsSection: amber/gold border, warm background tint, trophy badge in the card header
- Detection is a two-step OR: (1) tournament name contains "grand final" (works for PandaScore-sourced names), (2) any game.id is in a Set of OpenDota match IDs sourced from PandaScore
- `api/tournaments.js` handles `?mode=grand-finals`: fetches `/dota2/matches/past?sort=-end_at&page[size]=100` from PandaScore, filters for `m.tournament.name` containing "grand final", extracts `game.external_identifier` (= OpenDota match_id), caches in KV 1h under `dota2:grand_final_match_ids_v1`
- Merged into `api/tournaments.js` (not a separate file) to stay within 12-function Vercel limit
- `fetchGrandFinalMatchIds()` in `src/api.js` calls `/api/tournaments?mode=grand-finals`
- App.jsx loads the IDs on startup alongside match feed; passes `grandFinalMatchIds` (Set) to LatestMatches and MyTeamsSection
- Fails open: empty set on PandaScore error; string detection still works as fallback
- Cache bust: `/api/tournaments?mode=grand-finals&bust=1`

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
- VOD channel selection relies on PandaScore fuzzy match. If no match is found (e.g. qualifier series where PandaScore has no `external_identifier` and team names don't fuzzy-match), "No VOD found" is shown. The ts-bucket fallback is no longer used for VOD search - it was returning VODs from concurrent matches on shared channels.
- Twitch VODs expire after 60 days - old matches will show "No VOD found"
- Search only searches already-loaded matches - user must click "Load more matches" to expand search
- `fetchPremiumLeagueIds` in `src/api.js` now fails gracefully (returns empty Set) when OpenDota `/leagues` is down, so the homepage still loads via the PandaScore tier1 name filter
- Live match KV cache must be busted after deploying new fields: `/api/live-matches?bust=1`
- Tournament bracket parsing relies on PandaScore naming conventions ("Round N", "Upper Bracket Semifinal", etc.) for proper round labels. If PandaScore changes naming, rounds fall back to generic "Round N" numbering. Match-named rounds (e.g. "Tundra vs RNX") are detected and shown with no section header.
- PandaScore plan limitation: `GET /dota2/series/{id}` and `GET /dota2/series/{id}/matches` return 404/validation errors on the current plan tier. Use `filter[id]` on `/dota2/series/running|upcoming|past` and `filter[serie_id]` on `/dota2/matches/running|upcoming|past` instead (pattern used in `tournament-detail.js` and `calendar-tournament` mode)

---

## Tier Filtering Strategy

Tournaments are filtered using the tier fields exposed by each data source. No hardcoded name lists.

| Data source | Object type | Tier field | Values accepted |
|---|---|---|---|
| PandaScore `/dota2/matches/*` | match | `match.league.tier` | `'s'`, `'a'` |
| PandaScore `/dota2/tournaments/*` | tournament | `t.tier` (direct, NOT `t.league.tier` which is always null) | `'s'`, `'a'` |
| PandaScore `/dota2/series/*` | series | `series.tier` (direct) | `'s'`, `'a'` |
| OpenDota (leagues/promatches) | league | `league.tier` | `'premium'` (equiv S), `'professional'` (equiv A) |

**PandaScore tier S** = elite international LANs (TI, DreamLeague, ESL One, PGL, BLAST, Riyadh Masters, Premier Series, ...).
**PandaScore tier A** = second-tier professional events (ESL Challenger, regional circuits, ...).
**OpenDota premium** = Valve-sponsored DPC events; equivalent of PandaScore tier S.
**OpenDota professional** = second-tier pro events; equivalent of PandaScore tier A.

Key exports in `api/_shared.js`:
- `isTier1(match)` - checks `match.tournament.tier` (primary field for match objects) then `match.league.tier` for 's' or 'a'
- `isTier1ByName(match, tier1Names)` - **fallback** for when PandaScore hasn't assigned a tier to a newly-created series yet. Checks `match.league.name` against the cached tier1 names array (same list used by `matchesTier1Names`). Used in `live-matches.js` and `upcoming-matches.js` as `isTier1(m) || isTier1ByName(m, names)`. Names are fetched from KV under `KV_TIER1_NAMES_KEY`.
- `KV_TIER1_NAMES_KEY` - exported constant `'dota2:tier1_league_names_v1'` so all consumers read from the same KV key
- `PERMANENT_TIER1_NAMES` - exported hardcoded list of tier1 organizer names (DreamLeague, ESL One, PGL, BLAST, etc.); merged into `names` in `live-matches.js` so tier filtering never depends on KV being warm
- `buildPremiumLeagueIds(leagues)` - pure function; builds a `Set<leagueid>` of premium+professional OpenDota leagues
- `getPremiumLeagueIds()` - async; fetches `/api/leagues`, caches result in memory

Key exports in `src/utils.js`:
- `matchesTier1Names(leagueName, tier1Names)` - returns `true` if leagueName contains any PandaScore tier name, `false` if it doesn't, `null` if the list is empty/all-short (signals fallback to OpenDota premium IDs). Min name length guard: names < 4 chars are skipped. Called in `fetchProMatches` to filter OpenDota matches.

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
- Typography scale (system/Helvetica for homepage; 3 levels only)
- Color palette and token usage (red = accent/CTA only, purple = watch actions only)
- Spacing scale and component patterns (cards, buttons, tabs, loading states, empty states)
- Motion rules (drawer slide-in is the signature animation; no competing animations)
- Information hierarchy within components (What -> Result -> Context -> Actions)

Note: `/preview` (`PreviewPage.jsx`) intentionally diverges from DESIGN_GUIDELINES. It is a dark-only design exploration using flat rows and large display typography. Changes to `/preview` components are exempt from DESIGN_GUIDELINES review. Changes to all other pages/components must follow it.

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

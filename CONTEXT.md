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
- **Cache**: Upstash Redis (KV) for live/upcoming/tournament caching; news articles cached 30min under `news:articles:dota2:v1`
- **News**: Multi-source aggregation via `api/news.js` — Steam Community RSS (official), Steam News JSON API (aggregates third-party feeds), Liquipedia MediaWiki API (roster/transfer news), and Currents API (editorial coverage); RSS fallbacks for PCGamesN and Dot Esports; no AI generation
- **AI**: Anthropic Claude Haiku via `/api/summarize.js`
- **Analytics**: Vercel Analytics (pageview/event tracking) + Vercel Speed Insights (Core Web Vitals / Real Experience Score) + Google Analytics (GA4) + BigQuery export
- **Analytics AI**: Claude Sonnet via `/api/analytics-chat.js` with BigQuery tool use for live GA4 data queries

---

## Key Files

### Frontend
- `src/pages/Tournaments.jsx` - Tournament list page at `/tournaments`; fetches from `/api/tournaments?mode=series`; shows live/upcoming/completed sections; fires `tournament_list_view` GA4 event
- `src/pages/TournamentDetail.jsx` - Tournament detail page at `/tournament/:seriesId`; fetches from `api/tournament-detail.js` (with `?series=1` flag); shows header, AI summary, teams+rosters, stages+standings, VOD search links
- `src/components/SearchSuggestions.jsx` - Replaces TournamentBar below the search bar on the homepage. Renders a single flex-wrap row of compact keyword chips (rounded-full border). Suggestion chips come first in this order: live tournament (red pulse dot + organizer name - first word of `leagueName`, e.g. "PGL", "ESL", "1Win"), then unique winning teams from the most recent completed matches (max 5 chips total). Recent searches (up to 5, stored in `localStorage` key `dota-recent-searches`) follow the suggestions, each with a clock icon + × remove button. Clicking any chip fires the search. Exports `addRecentSearch(query)` called by `App.jsx handleSearch` to persist every search automatically.
- `src/components/TournamentCard.jsx` - Card used on /tournaments list page; shows status badge, date range, prize pool, stage pills
- `src/components/TeamRoster.jsx` - Collapsible team card showing logo, region badge, qualification status, player list with nationality flags
- `src/components/RegionBreakdown.jsx` - Region summary pills (WEU/EEU/CN/SEA/NA/SA) for teams section
- `src/components/StageTimeline.jsx` - Horizontal timeline of tournament sub-stages; highlights active stage in red
- `src/utils/regions.js` - Country code to Dota 2 region mapping; `getRegion(code)`, `getRegionColor(region)`, `groupTeamsByRegion(teams)`, `getRegionSummary(teams)`
- `src/App.jsx` - Main app, state management, search, load more, drawer, spoiler-free toggle, slug URL generation. Fetches live/upcoming data from `/api/live-matches` and `/api/upcoming-matches` on mount and polls every 2 min. Also fetches `/api/tournaments?mode=recent-completed` every 5 min (`fetchJustEnded`) to populate `justEndedSeries` — PS-sourced series that finished recently but aren't yet in the OD feed. Dedup logic (`buildVisibleJustEnded`) hides a PS entry once any of its resolved OD match IDs appear in `allMatches`, falling back to team-name+time matching for fully-unresolved (`_tempId`) entries. `lastPsGamesRef` caches the last fetched PS games so the dedup re-runs immediately whenever `allMatches` changes (not just on the next 5-min poll) — closing the window where a newly-indexed OD match shows in both Results and Just Ended simultaneously. Renders a sticky live banner below the header when matches are in progress. Non-search homepage renders: CalendarNudge → HomeFeed. No separate MyTeamsSection or TournamentHub chips — both are integrated into HomeFeed. `tournamentIdMap` (Map&lt;name, id&gt;) built from `/api/tournaments` (ongoing + upcoming + completed) and passed to HomeFeed for inline hub expansion. Search is a full-screen overlay toggled by `searchOpen` state; the search icon in SiteHeader opens it. `?q=` URL param sets the query and also calls `setSearchOpen(true)` on mount. `handleOpenSeries` always opens `series.games[0]` (Game 1) -- this ensures the PandaScore stream lookup uses G1's startTime (closest to the series `begin_at`), which maximises VOD link reliability on first open.
- `src/main.jsx` - Entry point; path-based routing: `/about` -> AboutPage, `/release-notes` -> ReleaseNotesPage, `/calendar` -> Calendar, else App
- `src/api.js` - All API calls: OpenDota, Twitch VOD search, hero fetching, match summaries. `fetchMatchStats(matchId)` fetches end-game stats for a single match from `/api/tournaments?mode=match-stats&id={matchId}` — returns `{ radiantGoldAdv, players, events, itemNames, firstBloodTime, roshanKills }` or null on failure. `firstBloodTime` is seconds (integer, e.g. 83 → displayed as "1:23"); `roshanKills` is the count of Roshan kills derived from OpenDota `objectives[]`. Both are cached under KV key `stats:match:v4:{matchId}`. `events` is an array of `{ type: 'rapier'|'rampage'|'roshan', team: 'radiant'|'dire', player?: string, time: number, index?: number }` sorted by time ascending — `player` is set for rapier/rampage, `index` (1-based) is set for roshan. Module-level `_statsCache` Map prevents redundant fetches on drawer re-opens (same pattern as `_indicatorsCache`). `fetchTournamentPlayers(tournamentId, serieName, isCompleted)` fetches `/api/tournaments?mode=tournament-players&id={id}&name={name}` — returns `{ stats: { kills, deaths, assists, netWorth, gpm }, gameCount, league }` where each stat is a top-5 sorted array of `{ accountId, playerName, heroId, teamName, matchId, radiantName, direName, value, rank, gamesPlayed }`. Module-level `_tournamentPlayersCache` Map keyed by tournament ID. `fetchMatchIndicators(matchIds)` fetches game indicators (rapier/gold swing/mega comeback/rampage) from `/api/tournaments?mode=match-indicators&ids=...`; results are cached in a module-level `Map` for the browser session so repeated calls (series row mounts, card expands, drawer opens) hit memory instead of the network. `fetchProMatches()` fetches completed matches exclusively from OpenDota promatches. PandaScore is not used as a data source for completed matches — OpenDota is authoritative. Completed matches appear once OpenDota indexes them (typically 30min to several hours after a series ends). **Pagination boundary guard**: handled entirely by `groupIntoSeries` in `HomeFeed.jsx` (operates on the full accumulated `allMatches` state, not per-page). The oldest incomplete series is dropped from the combined dataset; it reappears correctly once the user navigates to that date and the auto-load fetches the next page. There is deliberately NO per-page guard in `fetchProMatches` — a per-page guard caused a permanent data-loss bug where later games of a cross-page BO3 (e.g. games 2+3 on page N, game 1 on page N+1) were dropped from `allMatches` and never recovered. **Team name normalization**: `TEAM_NAME_MAP` constant maps OpenDota abbreviations to canonical names (e.g. `'BB' → 'BetBoom Team'`); applied when constructing match objects so display, stream fuzzy-matching, and follow logic all see the same string.
- `src/components/MatchDrawer.jsx` - Slide-in drawer showing match details, VOD links, draft, AI summary. Header shows `{match.date} · {formatDuration(match.duration)}` (total minutes, e.g. "58m"). Score section is split into two rows: (1) names row — `flex justify-between` with left cluster `[radiant name (truncate, text-base)] [indicators] [star]` and right cluster `[star] [indicators] [dire name (truncate, text-right)]` — single line, no separator, no flex-wrap; (2) score row — centered `text-4xl` numbers only. `drawerIndicatorSets` (rapier/goldSwing/megaComeback/rampage Sets) is derived from `gameIndicators` via `useMemo` before the early returns. Accepts `gameSwitcher` prop (any React node) rendered in a row below the header. On the homepage, `App.jsx` builds a G1/G2/G3 segmented control from `seriesMatchMap` and passes it as `gameSwitcher`; each chip shows the game number plus the winning team name (e.g. "G1 Nigma Galaxy") in muted tertiary text; winner names are hidden when `spoilerFree` is true; clicking a chip calls `handleSelectMatch` to switch games. Active chip = `selectedMatch?.id`. Only shown for multi-game series. Follow star buttons for both teams appear inline next to team names in the score row (never in CompactSeriesRow). Props: `followedTeams`, `onToggleFollow` passed from App.jsx. Draft section is collapsible (chevron toggle, starts expanded, resets to expanded on match change). Gold advantage graph (`GoldGraph`) renders below draft in a `border-t` section — hidden when `spoilerFree` or `match._fromPandaScore`. Stats are fetched via `fetchMatchStats` in a `useEffect` on `match.id`; `matchStats` and `statsLoading` state drive the graph loading/data states. `match_stats_view` GA event fires when stats load successfully.
- `src/components/GoldGraph.jsx` - Custom SVG gold advantage chart. Props: `radiantGoldAdv: number[]` (per-minute array from OpenDota), `radiantName: string`, `direName: string`, `loading?: boolean`, `events?: Event[]`, `vodUrl?: string`. Uses two `<path>` elements with `<clipPath>` to render green fill above the zero line (radiant ahead) and red fill below (dire ahead) — no chart library. `computePoints(data)` is exported for unit tests; it maps the array to SVG `{x, y}` coordinates using viewBox constants (VW=480, VH=160, PL=4, PR=4, PT=10, PB=22, CW=472, CH=128, MID=74). PL/PR are minimal stroke-buffer only — no labels inside the SVG. **Layout**: GoldGraph returns a React fragment: (1) an HTML header row (`flex justify-between px-5 mb-1.5`) showing RADIANT label (green), current gold diff in advantage color, and DIRE label (red); (2) the SVG wrapper div. In MatchDrawer, GoldGraph is wrapped in `-mx-5` so the SVG is full-bleed to the drawer panel edges; the header row's `px-5` realigns its text with other drawer content. **Scrubbing interaction**: hover anywhere on the chart (desktop) or drag horizontally (mobile) to see the gold advantage at any minute. Desktop: `onMouseMove` on the `<svg>` element → dashed vertical crosshair line + colored dot on the gold line + floating tooltip near cursor showing `"23m · +8.3k RADIANT"`; `onMouseLeave` dismisses. **Desktop hover tooltip** uses `position: fixed` anchored to `hoverViewport` state (clientX/clientY from mousemove) — `left: Math.max(8, Math.min(window.innerWidth - 210, clientX - 80))` — escapes drawer's `overflow-x-hidden` so it never clips at screen edges. Mobile: imperative `addEventListener('touchmove', ..., { passive: false })` with direction-intent detection (5px threshold) — horizontal drag captures input and calls `preventDefault()` to block drawer scroll; vertical swipe falls through to normal scroll; tooltip renders as a fixed strip at `absolute top-0 inset-x-0` so the finger never occludes it; lingers 600ms after `touchend`. `hoverSourceRef` ('mouse'|'touch') determines which tooltip variant renders. Event markers take priority: hovering a marker shows the event tooltip instead of the minute tooltip. GA events: `gold_chart_scrub` (source: 'mouse'|'touch') fires once per scrub session via `hasTrackedScrubRef`; `gold_graph_marker_click` ({type, team}) fires on VOD-jump click. **Interactive event markers**: three types — `roshan` (Aegis shield `RoshanSvg`), `rampage` (skull `RampageSvg`), `rapier` (sword `RapierSvg`) — all from `GameIndicators.jsx`. Icons use `currentColor`; marker color = the **side** that triggered the event (#22c55e Radiant, #ef4444 Dire) regardless of event type, so a Dire Roshan during Radiant's gold lead renders a red shield in the green band. Each marker is a `<g className="gold-graph-marker">` with a 24-unit transparent hit circle and an optional focus ring (active state). Z-ordering: inactive markers rendered first, active last. Vertical dashed ruler at active marker's x. **Event marker tooltip** (inline-styled dark card): icon · event label · subject · minute · "WATCH" in amber if VOD available. `position: fixed` is mandatory — `position: absolute` is clipped by the drawer's `overflow-x-hidden` scroll container (MatchDrawer line 232) and its `overflow-hidden` panel. A `useLayoutEffect` on `activeEvent` reads `svgRef.current.getBoundingClientRect()` to convert SVG coords to viewport pixels, reads `tooltipRef.current.offsetWidth` for the rendered width, then clamps `left` to `[8px, window.innerWidth - tipWidth - 8px]`. Tooltip starts at `left: -9999` (invisible) until the effect runs synchronously before paint — no visible snap. Flip direction (`(activeEvent.x - PL) / CW > 0.45`) determines which side of the marker to anchor. **Interaction model**: markers use `onPointerEnter`/`onPointerLeave` filtered to `e.pointerType === 'mouse'` — NOT `onMouseEnter`/`onMouseLeave`. Mobile browsers synthesize mouse events before `click`, so `onMouseEnter` would set `activeEvent` before `onClick` fires, causing first-tap to open the VOD link immediately. Mobile is two-tap: first `onClick` (activeEvent null) shows tooltip; second `onClick` (activeEvent.markerIdx === i) opens link. The `<svg>` element has `onClick={() => setActiveEvent(null)}` for tap-away dismiss. Click calls `buildEventUrl(vodUrl, event.time)` (parses `?t=` Twitch offset, adds event seconds) and opens new tab. Loading state: fragment with spacer + 160px `animate-pulse` skeleton. Empty/unavailable state (fewer than 2 data points): 160px div — "Gold data unavailable". Time axis labels every 5 minutes. Spoiler-free and PandaScore guards are applied by the parent (MatchDrawer).
- `src/components/ItemSlot.jsx` - Single item icon slot. Props: `itemId: number`, `itemNames: { [id]: name }`, `size?: 'sm' | 'md'`. If itemId is 0 or the name is not in the map, renders a gray empty-slot placeholder. Otherwise renders `<img src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/items/{name}_lg.png" />` with `loading="lazy"` and an `onError` fallback to the empty placeholder. Sizes: sm = `w-5 h-5`, md = `w-6 h-6` (default). CDN base: `cdn.cloudflare.steamstatic.com` (not `cdn.dota2.com` which is stale).
- `src/components/PlayerStatsSection.jsx` - End-game player stats panel. Props: `players` (from `matchStats`), `itemNames`, `radiantName`, `direName`, `loading`. Calls `fetchHeroes()` internally on mount (module-cached, no extra network hit after first call) to resolve `heroId → heroKey` for CDN icon URLs. Players are split into Radiant and Dire groups, sorted by `netWorth` descending within each team. Per-player row: 24px hero icon + truncated player name + right-aligned networth + 6x `<ItemSlot>` + proportional networth bar (green for Radiant, red for Dire). Loading state: 5 skeleton rows per team. Team group headers use `text-green-600 dark:text-green-500` (Radiant) and `text-red-600 dark:text-red-500` (Dire).
- `src/components/DraftDisplay.jsx` - Hero picks, bans, player names, KDA
- `src/components/MatchList.jsx` - Search results list grouped into series
- `src/components/HomeFeed.jsx` - **Main homepage feed.** Mobile-first. Props: `liveMatches`, `upcomingMatches`, `allMatches`, `justEndedSeries`, `onSelectMatch`, `onSelectSeries`, `spoilerFree`, `followedTeams`, `onToggleFollow`, `error`, `onRetry`, `onSelectMatchId`, `tournamentIdMap`, `onLoadMore`, `loadingMore`, `hasMore`. Internal state: `activeDate`, `expandedTournamentName`. No collapse/expand of match rows -- all rows always visible. Tournament card header is a full-width button that expands TournamentHub inline (above match rows) or navigates to /tournaments if no hub ID found. A "My Teams" amber card appears at the very top of the date feed when followed teams have matches on the active date. Followed-team rows in all states (live/upcoming/completed) get amber left border and are sorted to the top within their card. DateStrip receives `onLoadEarlier={null}` and `loadingEarlier={loadingMore}`. **Windowed date strip**: `availableDates` useMemo builds the full chronological list: past days (from completed series) → Today → Tomorrow → all future days with scheduled upcoming matches (labeled "May 24", "May 25", etc. via `toLocaleDateString`). `visibleDates` useMemo slices `availableDates` to always show exactly 1 previous day (with matches) + the selected date + all future dates — never shows the full list. A `useEffect` auto-calls `onLoadMore()` whenever the selected date is at index 0 in `availableDates` and `hasMore` is true, looping on each `availableDates` update until a previous day exists. Date switching itself does not call `onLoadMore()` directly. All tournament cards render as a single flat sorted list (live first, then upcoming, then by recency) -- there are no separate "Live Now / Results / Coming Up" section headers. Within each card, section dividers (pulsing red "Live", blue "Upcoming", gray "Results") appear between content groups only when the card contains matches in two or more states; single-state cards have no divider. The card header shows a pulsing "Live" badge when any live matches are present. **Tournament name normalization**: `normKey()` inside `tournamentCards` useMemo normalizes names before grouping -- lowercases, expands `S{N}` abbreviations to `season {N}` (e.g. "DreamLeague S29" and "DreamLeague Season 29" both become "dreamleague season 29"), and strips punctuation. This merges PandaScore live/upcoming names with OpenDota results names into one card. The PandaScore display name is always preferred (live/upcoming iterated first). Fires `tournament_hub_expand`, `calendar_icon_click` GA events.
- `src/components/LiveMatchRow.jsx` - Compact live match row inside HomeFeed tournament cards. Props: `match` (PandaScore shape: `teamA`, `teamB`, `seriesScore`, `currentGame`, `streams`, `youtubeStream`, `tournament`), `onSelectMatchId`, `onSelectLiveMatch`, `spoilerFree`, `isFollowedMatch`. Grid: team-a | 80px score | team-b | Watch buttons. Watch buttons: Twitch (purple, `bg-purple-700`) and YouTube (red, `bg-red-600`) stacked in the 4th column via `flex-col gap-1`. Each: `sm:hidden` icon-only on mobile; `hidden sm:inline-flex` full text pill on desktop; column hidden entirely when neither stream exists. Row is clickable when `hasScore && onSelectLiveMatch` — calls `onSelectLiveMatch(match.id)` (PandaScore ID) to open `LiveSeriesSheet` when at least one game is finished. Always has red left border (`border-l-red-500`); amber border if `isFollowedMatch`. Pulsing `G{n}` indicator below score when `match.currentGame` is set. Fires `live_match_watch` and `live_match_watch_youtube` GA events.
- `src/components/UpcomingMatchRow.jsx` - Compact upcoming match row inside HomeFeed tournament cards. Props: `match`, `isFollowedMatch`, `spoilerFree`. Two-line layout: line 1 is "TEAM A vs TEAM B" (never truncates on mobile), line 2 is the countdown time string in blue. Stream pill is `hidden sm:block` (desktop only). Amber left border when `isFollowedMatch`. Fires `upcoming_stream_click` GA event.
- `src/components/LiveSeriesSheet.jsx` - Lightweight side sheet shown when a user clicks a live match row that has at least one completed game. Props: `match` (PS shape), `onDismiss`, `onReplay(odMatchId)`, `spoilerFree`. Shows one row per finished game: G{n} | winner name | duration | ▶ Replay button (purple). Running game shows a pulsing "Live" indicator row. Replay button calls `onReplay(game.matchId)` which closes the sheet then calls `handleSelectMatchId` → opens full OD `MatchDrawer`. Winner names, duration, and Replay button are all hidden in `spoilerFree` mode. Does NOT apply to BO1 matches (no score means `isClickable` is false in `LiveMatchRow`). Follows `MatchDrawer` z-index pattern (`z-40` backdrop, `z-50` sheet, `animate-slide-in`). Closes on Escape or backdrop click.
- `src/components/LatestMatches.jsx` - Kept on disk but no longer used on the homepage (replaced by HomeFeed). Still reference-quality for the tournament-grouped compact row pattern.
- `src/components/DateStrip.jsx` - Filled pill track date selector (Sofascore style). Props: `dates`, `activeDate`, `onChange`, `onLoadEarlier`, `loadingEarlier`. Left slot: when `loadingEarlier && !onLoadEarlier`, shows a shimmer placeholder pill (`w-14 h-7 animate-pulse`) — used by HomeFeed during auto-fetch. Legacy chevron button rendered only when `onLoadEarlier` is explicitly passed (backwards compat). Right of the left slot: `flex-1 overflow-x-auto` pill track. Active date = `bg-white dark:bg-gray-800 shadow-sm text-gray-900 dark:text-white rounded-full`; inactive = plain gray text, no fill. Auto-scrolls the active pill into center on mount via `useRef` + `scrollIntoView({ behavior: 'instant', inline: 'center' })`. Hidden when `dates` is empty. Fires `date_strip_click` GA event per pill.
- `src/components/CompactSeriesRow.jsx` - Livescore-style series result with responsive dual layout. Props: `series`, `onSelectGame`, `onSelectSeries`, `spoilerFree`, `followedTeams`, `onToggleFollow`, `isGrandFinal`, `isFollowedMatch`, `bracketRound`. **Mobile (`sm:hidden`)**: Sofascore-style stacked layout - Radiant row (team name + TeamIndicators icons + right-aligned score), Dire row (same), meta row (series format label + play button). **Desktop (`hidden sm:grid`)**: 4-column grid: team-a+icons | score block | icons+team-b | replay button. Indicators are per-team: rapierTeams/goldSwingTeams/megaComebackTeams/rampageTeams Sets built by iterating `series.games` and mapping `radiantHasRapier`/`direHasRapier`/`goldSwingWinner`/`megaComebackWinner`/`radiantHasRampage`/`direHasRampage` to actual team names. No follow star buttons in the row - stars are exclusively in the match drawer. Winner name is `font-black text-white`; loser is muted gray. Grand Final OR followed-match rows get `border-l-2 border-l-amber-500` left accent. `bracketRound` (e.g. "Grand Final", "Upper Bracket Final") renders below the row in `text-[10px] uppercase tracking-widest` style, matching `LiveMatchRow` and `UpcomingMatchRow`. Fires `compact_row_click` and `compact_replay_click` GA events.
- `src/components/UpcomingMatches.jsx` - Live Now + Upcoming Matches sections (separate bordered boxes, polls every 2 min). Live Now heading shows a right-aligned match count when >1 matches are live.
- `src/components/MatchCard.jsx` - Individual series card with expand/collapse; collapsed state shows a purple "Watch Replay" button that opens the drawer directly on Game 1 without expanding the card (passes `_skipExpand: true` flag, fires `watch_replay_click` GA4 event); each game row shows "Match Details" CTA (opens drawer with VOD, draft, AI summary); fires `game_click` + `card_vod_click` GA4 events on game row click; unplayed slots hidden in normal mode, shown as interactive placeholders in spoiler-free mode
- `src/components/SearchBar.jsx` - Search input. Exposes `{ focus(), setValue(v), getQuery() }` via ref. Accepts `compact` boolean prop: when true, renders a borderless single-line input (no submit button, Enter-to-search only, inline × clear) suitable for the search overlay. Default (non-compact) mode shows the full bordered input + red Search button.
- `src/components/SiteHeader.jsx` - Shared site header used by all pages. Minimal first-principles design (May 2026 redesign): logo-only on mobile (wordmark/tagline hidden below `sm:`), full logo + wordmark + tagline on desktop. Tournaments text link desktop-only (`hidden md:inline`). News text link desktop-only (`hidden md:inline-flex`) — shows a small sky-500 dot when `hasUnreadNews()` returns true (new articles since last `/news` visit). Spoiler-free toggle when `onSpoilerToggle` prop is passed. Settings cog button (`hidden md:inline-flex`) desktop-only - on mobile the More tab in BottomTabBar is the sole entry point to SettingsSheet. Renders `<SettingsSheet />` so the sheet is available wherever the header is. Fires `news_unread_indicator_shown` GA event on mount when unread dot is visible.
- `src/components/SettingsSheet.jsx` - Slide-up sheet (mobile) / dropdown panel (desktop) with grouped settings: Display (Spoiler, Theme), Stay updated (Calendar feeds, Live match alerts, Install as app), Info (About, What's New). Manages theme state internally via `localStorage['theme']`. Triggered by `window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT))` from any component. Closes on Escape, backdrop click, or close button. Exports `SETTINGS_OPEN_EVENT`. Spoiler row only shown when `onSpoilerToggle` prop is passed (homepage state). **Live match alerts row**: shown in "Stay updated" when `isPushSupported() && pushPermission !== 'denied'`; shows "Enable →" when permission is `'default'` (clicking calls `subscribeToPush` with teams read from `localStorage['my-teams']`); shows "On" when `'granted'`. Reads `my-teams` from localStorage so the Settings sheet can trigger push subscribe without receiving `followedTeams` as a prop.
- `src/components/BottomTabBar.jsx` - Fixed-bottom tab bar shown on mobile only (`md:hidden`). Three tabs: Home (`/`), Tournaments (`/tournaments`), News (`/news`), More (dispatches `SETTINGS_OPEN_EVENT`). Active state: `text-red-500`. News tab shows a small sky-500 dot when `hasUnreadNews()` returns true and the tab is not active. Active tab determined by `window.location.pathname` (works because the app uses full-page navigation, not client-side routing). Includes safe-area inset padding for iPhone notch. Fires `bottom_nav_tap` GA event with `destination` field.
- `src/components/SiteFooter.jsx` - Shared footer: About link, What's New link, brand line ("Spectate Esports · Data via OpenDota, PandaScore & Twitch · Updates every few minutes"). Replaces the per-page inline footers that existed before May 2026.
- `src/components/GameIndicators.jsx` - Icon indicator chip component for notable in-game events. Four indicators: Divine Rapier (red, sword icon), 20K+ Gold Swing (amber, zigzag chart icon), Mega Creep Comeback (violet, lightning bolt icon), Rampage (orange, skull icon — a player got a 5-kill streak). Two variants: `compact` (icon-only 20x20 circle chip with colored background, for series rows and game rows) and `full` (icon + text label pill, for the match drawer). Each chip has a hover tooltip via `group/indicator` scoped Tailwind hover. Returns null when `!indicators` or no active indicators. Never rendered in spoiler-free mode.
- `src/components/TournamentHub.jsx` - Tournament section with Info/Standings/Schedule/Stats/Videos tabs, format badge, event stage pipeline, horizontal bracket tree, stage switcher. The **Stats tab** (formerly "Heroes") contains a HEROES | PLAYERS sub-toggle (`statsView` state: `'heroes'` | `'players'`). Heroes view: existing hero pick/ban table. Players view: per-stat leaderboard (KILLS · DEATHS · ASSISTS · NET WORTH · GPM) loaded by `fetchTournamentPlayers()`. `activeStat` state drives which top-5 list renders client-side (no re-fetch on chip switch). Player rows show rank · hero icon (Valve CDN) · player name · team · games played · stat value; clicking a row calls `onSelectMatchId(entry.matchId)`. Hero icons for the Players view loaded via `fetchHeroes()`, stored in `heroMap` local state. Players data cached in `_tournamentPlayersCache` by tournament ID — only one fetch per tab open. Stats tab uses `gamesPlayed` per row so viewers can contextualize total-stat leaders who played more games. Accepts `hideStatusLabel` prop: when true, hides the status label row and the header "Add to Calendar" button entirely. Fires `tournament_players_row_click` GA event on player row click. Fires `calendar_subscribe_modal_open` with `source: 'tournament_hub_header'` or `'tournament_hub_card'`. Adaptive chip bar for multi-tournament live views via `getTabLabel()`. Fires `tournament_hub_region_select` on chip click.
- `src/components/XPostsModal.jsx` - Modal for displaying AI-generated X/Twitter posts per game in a series, plus series summary and downloadable result image
- `src/components/WatchBadge.jsx` - Watchability badge component
- `src/pages/AnalyticsPage.jsx` - (already documented below)
- `src/pages/AnalyticsPage.jsx` - **Private** analytics chat page at `/analytics`; password-gated; NOT indexed by Google; NOT in sitemap; checks `ANALYTICS_PASSWORD` via `/api/analytics-chat?mode=auth`
- `src/components/AnalyticsChat.jsx` - Chat UI for the analytics page; passes password in each request; supports suggested questions and conversation history
- `src/pages/AboutPage.jsx` - React About page (served at `/about`)
- `src/pages/ReleaseNotesPage.jsx` - React Release Notes page (served at `/release-notes`)
- `src/pages/Calendar.jsx` - Calendar feed builder at `/calendar`; team selector with slug autocomplete, generated URL, match preview, tournament feed list with Add to Calendar buttons; fires `calendar_page_view`, `calendar_team_select`, `calendar_team_remove`, `calendar_subscribe_modal_open` GA4 events
- `src/components/CalendarSubscribeModal.jsx` - Modal for calendar subscription. Primary CTA: three one-click provider buttons — "Add to Google Calendar" (opens calendar.google.com with webcal:// cid param), "Add to Apple Calendar" (navigates to webcal:// URL, triggers OS protocol handler), "Add to Outlook" (opens outlook.live.com/calendar/0/addfromweb). URL construction: `webcalUrl = url.replace(/^https:\/\//, 'webcal://')`, Google encodes webcalUrl as `cid` param. Secondary: "Or copy URL manually" (read-only input + Copy button). Tertiary: "Manual setup instructions" accordion (Google, Apple, Outlook steps). Fires `calendar_provider_click` (provider, feed_type, source) and `calendar_url_copy` GA4 events.
- `src/utils/icsGenerator.js` - Client-side ICS utility: `generateCalendar()`, `generateMatchEvent()`, `generateTournamentEvent()`, `formatDateUTC()`, `formatDateOnly()`
- `src/utils.js` - Series grouping logic (`groupIntoSeries`, `isSeriesComplete`, `winsRequiredForSeries` — all exported); OpenDota `series_type` values: 0=BO1, 1=BO3, 2=BO5, **3=BO2** (undocumented); BO2 draws (1-1 after 2 games) are explicitly marked complete; **null series_id merge**: `groupIntoSeries` does a second pass to merge games with `series_id: null` into an existing numbered series when teams + tournament match and start times are within 12h — handles the case where OpenDota returns the final game of a BO3 without a series_id; `getSeriesLabel` maps seriesType 3 → "BO2"; `trackEvent` (dual Vercel + GA4 tracking) — always import this from utils, never redefine locally in components; `toTitleCase(str)` — capitalizes first letter of each word, used for display-layer tournament name formatting (applied in TournamentHub, TournamentBar, Calendar); `getLeagueLabel(name)` — extracts short org label from a tournament name (DreamLeague/ESL/PGL/BLAST/WePlay/Riyadh Masters/The International/Beyond The Summit), used by LatestMatches and TournamentHub for org eyebrow labels; `formatDuration(isoTimeStr)` — converts "H:MM" ISO time string to total minutes (e.g. "1:23" → "83m"); always shows total minutes, never "1h 23m"
- `src/components/CopyButton.jsx` - Shared copy-to-clipboard button with "Copied!" confirmation state; used by `XPostsModal` and `RedditPostsModal`

### Backend (Vercel Serverless)
- `api/summarize.js` - Generates AI match summaries (Claude Haiku) and AI tournament summaries. Match mode: default POST with match data. Tournament mode: POST with `{ type: 'tournament', seriesId, name, leagueName, status, beginAt, endAt, prizePool, teams, stages }`; cached 24h (30 days for completed) under `tournament:summary:{id}`.
- `api/live-matches.js` - Fetches live Dota 2 matches from PandaScore; cached in KV for 2 min. `getSeriesScore(m)` reads raw per-team win counts from `m.results[].score`; `winsRequired(matchType, numberOfGames)` caps each score at the series maximum (BO3→2, BO5→3, etc.) before returning the string — without this cap PandaScore reports all games played (e.g. 3-0 for a BO3 sweep) instead of the series wins needed (2-0).
- `api/upcoming-matches.js` - Fetches upcoming matches (next 72h) from PandaScore; cached in KV. Uses `getTwitchStreams` from `_shared.js` (respects `main:true` flag from `streams_list`). `getSeriesLabel` handles both legacy `match_type` values (`"best_of_3"`) and the newer `"best_of"` + `number_of_games` format. **TBD opponent handling**: all matches passing the tier filter are included regardless of how many opponents are known — TBD vs TBD slots (empty opponents array) and one-known-one-TBD slots are both valid fixture entries. `mapMatch` fills any missing slot as `'TBD'`; the dedup loop guards against null opponents with `(m.opponents || [])`. **PandaScore duplicate deduplication**: after tier-filtering, matches are deduplicated by `(sorted opponent IDs | scheduled_at)` fingerprint, keeping the highest match ID (most recently created) when PandaScore creates two separate records for the same fixture (observed with DreamLeague S29: rescheduled or corrected matches left stale entries with different IDs and slightly different team/tournament name metadata).
- `api/tournament-detail.js` - Fetches tournament standings, bracket, and sibling stages from PandaScore; cached in KV for 3 min (key: `dota2:tournament_detail_v4:{id}`). Stage sort order: "Group X" stages always sort alphabetically by letter (A before B) regardless of start date; all other stages sort by start date then name. **Bracket parsing**: both the non-series handler and the `?series=1` handler share `parseRawBracket()` — canceled bracket entries are filtered before grouping to prevent phantom rounds (PandaScore creates placeholder entries when fixtures are TBD, then cancels them once the real pairing is set).
- `api/tournament-heroes.js` - Aggregates hero pick/ban stats across all finished tournament games via OpenDota. Step 1: looks up the tournament serie name from PandaScore if not passed by the frontend. Step 2: searches OpenDota `/api/leagues` (9000+ leagues, cached 24h as `opendota:leagues_v1`) using `findLeague()` from `_shared.js` to find the right league. Step 3: fetches `/api/leagues/{leagueid}/matches` then full match details in batches of 10 via `/api/matches/{id}` to get picks_bans. Hero IDs resolved to names via `/api/heroes` (cached 24h as `opendota:hero_map_v1`). Cached in KV for 3h under `dota2:tournament_heroes_v7:{id}`. PandaScore does not expose picks_bans on any accessible endpoint (the /dota2/games list endpoint does not exist; embedded games in /matches omit picks_bans; /matches/{id}/games requires a higher-tier plan).
- `api/draft-posts.js` - Two modes: (1) **cron** (`{ type: "cron" }`): owner-only auto-tweet system triggered by GitHub Actions every 30 min — fetches OpenDota promatches, filters Tier 1, posts per-game X threads and series summary tweets via Twitter OAuth 1.0a, deduplicates via Redis KV; (2) **manual** (`{ type: "x" }` or `{ type: "reddit" }`): generates per-game X posts or Reddit VOD roundup posts on demand for a given series; posts kept under 220 chars to fit a VOD URL
- `api/match-streams.js` - Stream channel lookup for a batch of OpenDota match IDs. Also serves `?mode=twitch-token` (GET): fetches a Twitch OAuth client-credentials token server-side using `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`, caches it in KV as `twitch:token:v1` with TTL = `expires_in - 3600` (~50 days), and returns `{ token, clientId }` to the frontend. The client secret never reaches the browser. Lookup order for stream IDs: (1) KV `stream:match:{id}` fast path; (2) PandaScore fuzzy match - queries `/dota2/matches` with a +/-1h time window around `?ts=` and fuzzy-matches `?radiantTeam=`/`?direTeam=` against PandaScore opponent names, caches result to KV; (3) ts fallback - reads `stream:ts:{bucket}` (now a JSON array of all channels active in that window) and returns them as `_candidates` for the frontend to narrow Twitch VOD search. Stream filter accepts any official Twitch URL regardless of language (English preferred, then any language) - previously English-only filter silently dropped Chinese/CIS qualifier streams. Logs all PandaScore streams on fuzzy match for diagnosability.
- `api/analytics-chat.js` - Merged analytics endpoint with 3 modes: `?mode=auth` (POST password check -> 200/401), `?mode=query` (direct BigQuery query for pageviews/top_pages/top_events/countries/custom SQL), default POST (Claude Sonnet chat with `query_analytics` tool use; agentic loop up to 5 tool calls per message; requires password in request body). Merged from 3 separate files to stay within the 12-function Vercel limit.
- `api/news.js` - Aggregates Dota 2 headlines from four parallel source types: (1) RSS feeds (Steam Community RSS, PCGamesN, Dot Esports) parsed with `fast-xml-parser`; (2) Steam News JSON API (`api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570`) - returns official Valve announcements plus third-party editorial, articles labeled by `feedlabel` (e.g. "PCGamesN"); (3) Liquipedia MediaWiki API - fetches `Portal:Transfers` HTML, parses transfer table rows from the last 7 days, constructs synthetic articles per transfer (title: "Player joins Team", URL: player Liquipedia page with date fragment for unique dedup); (4) Currents API (`api.currentsapi.services/v1/search?keywords=dota+2`) - requires `CURRENTS_API_KEY` env var, silently disabled if missing, each article labeled by publisher domain. All sources run in parallel via `Promise.all`; failures are non-fatal (fall back to empty array). `categoryFilter` receives `(categories, url)` — Dot Esports uses URL-path matching (`/dota`) since their category tags are unreliable. Deduplicates by URL hash (djb2-xor); Liquipedia transfer URLs include a `#YYYY-MM-DD` fragment so multiple transfers by the same player in the same week are treated as distinct articles. Tags articles with tier-1 team/tournament entities. Caches 30min in KV under `news:articles:dota2:v1`; never caches empty results. `MAX_AGE_DAYS = 60`. Supports `?game=dota2&limit=20&category=match-result&source=steam-dota2&bust=1`. Response shape: `{ articles: Article[], meta: { sources, fetchedAt, cached, total } }`.
- `api/sitemap.js` - Generates `/sitemap.xml` with slug URLs for recent Tier 1 matches; cached at edge for 1h. Includes `/news` with priority 0.8 and daily changefreq.
- `api/og.js` - OG image/metadata generation for share card URLs. Also handles series result images via `?mode=series` (1200x630 PNG with winner, score, tournament, format using satori + resvg; used in X posts modal as downloadable PNG). Merged from `og.js` + `og-series.js` to stay within the 12-function Vercel limit.
- `api/tournaments.js` - Multi-mode tournament endpoint. Default: sub-stage list for TournamentHub. `?mode=recent-completed`: Fetches recently finished series from PandaScore (`range[end_at]` last 8h), tier-filters, resolves OD match IDs via `findOdMatchByTime()`, marks unresolved games with synthetic `_ps-{matchId}-{position}` IDs (`_tempId: true`). Each game object includes `bracketRound: parseBracketRound(m.name)` — the playoff stage label extracted from the PandaScore match name (e.g. "Grand Final", "Upper Bracket Final") using the same function as live and upcoming matches. Called by `App.jsx` (`fetchJustEnded`) every 5 min to populate `justEndedSeries` — bridging the 30–90 min gap between a series ending and OD indexing it. KV-cached 5 min under `dota2:recent_completed_v4`. `?mode=match-stats&id={matchId}`: per-player end-game stats for a single match — returns `{ radiantGoldAdv: number[], players: [{ slot, heroId, name, netWorth, items, backpackItems, kills, deaths, assists, isRadiant }], events: [{ type: 'rapier'|'rampage', team: 'radiant'|'dire', player: string, time: number }], itemNames: { [itemId]: itemName } }`. Fetches OpenDota `/matches/{id}` and `/api/constants/items` (item ID to name reverse map). Events are extracted from `purchase_log` (rapier purchases) and `kills_log` (rampages: 5 kills within 30s), sorted by time ascending. KV-cached under `stats:match:v5:{matchId}` — 7-day TTL when `radiant_gold_adv` is non-null (parsed, immutable), 30-min TTL when null (not yet parsed by OD — retried soon so gold chart appears once parsing completes); item map cached 24h under `opendota:item_map_v2`. Fails open with empty arrays/events on any OpenDota error — never poisons KV. Placed before the PANDASCORE_TOKEN check since it only calls OpenDota. Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400. `?mode=match-indicators&ids={id1,id2,...}`: fetches game indicators for one or more OpenDota match IDs. Checks KV cache (`indicators:match:v4:{id}`, 7-day TTL) first; for misses, fetches full match data from OpenDota `/matches/{id}` in parallel and computes four indicators: (1) `hasRapier`/`radiantHasRapier`/`direHasRapier` - item ID 133 in purchase log or equipped slots; (2) `hasGoldSwing`/`goldSwingWinner` - `radiant_gold_adv` array had a peak >= 20000 then the opposing team overtook; (3) `hasMegaComeback`/`megaComebackWinner` - winning team had all enemy barracks destroyed (`barracks_status_*` bitmask = 0); (4) `hasRampage`/`radiantHasRampage`/`direHasRampage` - any player has `multi_kills[5] > 0` (5-kill streak). KV writes are fire-and-forget. Returns a map of `{ [matchId]: { hasRapier, hasGoldSwing, hasMegaComeback, hasRampage, radiantHasRapier, direHasRapier, goldSwingWinner, megaComebackWinner, radiantHasRampage, direHasRampage } }`. Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400. `?mode=tournament-players&id={tournamentId}&name={serieName}`: per-tournament player performance leaderboard — top-5 players per stat (kills, deaths, assists, netWorth, gpm) across all indexed tournament games. Uses `findLeague()` to match the PandaScore name to an OpenDota league, fetches `/leagues/{leagueId}/matches` then batch-fetches full match details (10 concurrent, max 60 games, 7s time budget). Builds `allEntries` (one entry per player per game), `gamesMap` (accountId → games played count). Returns `{ stats: { kills, deaths, assists, netWorth, gpm }, gameCount, league }`. KV-cached 3h under `dota2:tournament_players_v1:{id}` (30-day TTL when `?completed=1`). Fails open with empty stat arrays on any error — never poisons KV. Placed before the PANDASCORE_TOKEN check (OpenDota only). `?mode=highlights&name={tournamentName}`: YouTube highlights for a tournament — maps the name to a channel via `YT_CHANNEL_MAP` (ESL/DreamLeague → @ESLDota2, PGL/Wallachia → @PGL_DOTA2, BLAST → @BLASTDota, WePlay → @WePlayDota, TI/Riyadh Masters/BTS → @dota2), searches YouTube Data API v3 (`search.list`, 100 quota units each), filters to last 90 days, returns `{ videos: [{videoId, title, thumbnail, publishedAt}], channelHandle }`. Cached 6h in KV under `dota2:yt_highlights:v1:{channelId}:{slugKey}`. Requires `YOUTUBE_API_KEY` env var. `?mode=watchability` (POST): watchability scoring — accepts `{ seriesId, matchIds }`, returns `{ score, rating, label, signals }`. Logic was previously in `api/watchability.js` (now renamed to `api/_watchability.js` to free a Vercel function slot for `api/news.js`). `?mode=sync-teams` (GET, requires CRON_SECRET): fetches all teams from running + upcoming tier-1 tournaments on PandaScore, merges with static TIER1_TEAMS_SERVER and existing KV list, writes to `dota2:tier1_teams_dynamic_v1` (8-day TTL, refreshed daily); list only grows. Run daily via `.github/workflows/sync-teams.yml`. `api/news.js` reads this key at ingestion time. `?mode=series`: series list for /tournaments page. `?mode=tier1-leagues`: returns `{ names: string[] }` — PandaScore tier S/A league names (e.g. "DreamLeague", "ESL One") used by `src/api.js` to filter OpenDota promatches. Fetches running+upcoming+past 30 tournaments from PandaScore, filters to tier S/A, extracts unique `t.league.name` values (min 3 chars). KV-cached 2h under `dota2:tier1_league_names_v1`; supports `?bust=1`. Never caches empty result. `?mode=premium-league-ids`: server-side proxy for OpenDota `/api/leagues` — returns `{ ids: number[] }` of premium-tier league IDs. Exists solely to avoid CORS errors when the browser called OpenDota directly; no KV caching (per-session cache in `src/api.js`). `?mode=promatches-proxy[&less_than={matchId}]`: server-side proxy for OpenDota `/api/promatches` — passes through the raw match array; supports pagination via `less_than` query param (forwarded as `less_than_match_id`). Returns `[]` on any error. Both proxy modes use no Redis and require no PandaScore token. `?mode=calendar-team&teams=slug1,slug2`: .ics team calendar feed (resolves slugs, fetches running+upcoming+past 7d matches, caches 30min under `calendar:matches:{sorted_slugs}`). `?mode=calendar-tournament&series={id}`: .ics tournament feed (all-day VEVENT for series + match VEVENTs, caches 30min under `calendar:series:{id}`). Both calendar modes return `text/calendar` not JSON. PandaScore does not support `filter[tier]` on any endpoint (returns 400). All tier filtering is done client-side after fetching with large page sizes (50-100). IMPORTANT: tier field locations differ by object type - tournament objects (`/dota2/tournaments/*`) have tier on `t.tier` directly; series objects (`/dota2/series/*`) have NO tier field at all (always null) - tier for series is derived by cross-referencing the tournament objects via `serie_id` sets (`tier1RunningSerieIds`, `tier1UpcomingSerieIds`, `tier1PastSerieIds`).
- `api/match-streams.js` - See description above
- `api/_shared.js` - **Shared utility module** (NOT a serverless function; Vercel ignores `_` prefixed files). Exports `findLeague(leagues, search)` — fuzzy-matches a PandaScore tournament name to the best OpenDota league object. Uses token-overlap (≥2 tokens required); `"season"` is a stop word; single-digit numeric tokens preserved (distinguishes Season 7 from Season 8); ties broken by preferring non-qualifier over qualifier. Used by both `tournament-heroes.js` and `tournaments.js ?mode=tournament-players`. Exports `findOdMatchByTime(odMatches, beginAtUnix, psOpponents)` — the canonical PS→OD match ID resolution function: filters OD promatches to a ±15min window (900s — expanded from ±5min because PS `begin_at` is scheduled series time while OD `start_time` is actual in-engine start after drafting, empirically 7–10 min later), returns the single candidate directly, uses bidirectional substring team name tiebreaker for collisions (`x.includes(y) || y.includes(x)`, same as `teamsMatch()` in `match-streams.js`), falls back to closest timestamp. Reads team names from both `c.radiant_name` (flat OD promatches shape) and `c.radiant_team?.name` (nested OD `/matches/{id}` shape) — both must be supported since `?mode=recent-completed` calls promatches (flat) while `?mode=match-stats` calls the full match endpoint (nested). Used by `api/tournaments.js` `?mode=recent-completed`. **Authoritative PS↔OD matching pattern**: always use this bidirectional substring logic — never create a separate algorithm. Also exports `NEWS_SOURCES` (RSS source config for `api/news.js` — Steam Dota 2 Community at `steamcommunity.com/games/dota2/rss/` (switched from `store.steampowered.com/feeds/news/app/570/` which was stale), PCGamesN at canonical `pcgamesn.com/dota-2/feed`, Dot Esports general `/feed` with URL-path filter; Dot Esports general feed may contribute 0 articles during periods of low Dota coverage since their top items are non-Dota) and `TIER1_TEAMS_SERVER` (server-side tier-1 team list for entity tagging in news — intentionally separate from frontend `TIER1_TEAMS` in `Calendar.jsx` due to different runtimes). Exports: `TIER1_LEAGUE_KEYWORDS` (string array — single source of truth for the league-name override: `['dreamleague', 'pgl', 'esl one', 'blast', 'weplay', 'the international']`); `isTier1ByFields(tier, leagueName)` (core tier-1 decision — accepts tier 's'/'a' OR a league name that matches a known top-tier brand; handles misclassified qualifier stages of major events); `isTier1(match)` (adapter for match objects — delegates to `isTier1ByFields` with `match.tournament.tier || match.league.tier` and `match.league.name`; IMPORTANT: match objects from `/dota2/matches/*` carry tier on `match.tournament.tier`, NOT `match.league.tier` which is always null); `buildPremiumLeagueIds(leagues)` (pure, returns a `Set` of OpenDota `premium`-tier league IDs only; professional tier is intentionally excluded and covered via the PandaScore name cache on the homepage filter); `getPremiumLeagueIds()` (async, cached). Also exports `getTwitchStreams(streamsList, leagueName, serieName)` used by `upcoming-matches.js`, `live-matches.js`, and `match-streams.js`; filters to official Twitch streams, prefers English (`language === 'en'`). **Language fallback logic**: when no English streams are found, the behaviour depends on event type — for international events (tournament name matches `INTL_KEYWORDS`: dreamleague/pgl/esl one/blast/weplay/the international) and `"qualifier"` is NOT in the name, returns `[]` so the static fallback mapping (hardcoded channel URLs per organizer) is used instead; for regional qualifiers (CIS, Chinese) the fallback is `allTwitchOfficial` so Russian/Chinese streams are preserved. This prevents PandaScore's bulk endpoint from returning Russian streams for international LANs when `language` metadata is missing or null. `tournaments.js` imports `isTier1ByFields` and uses it in a local one-liner `isTier1(t) { return isTier1ByFields(t?.tier, t?.league?.name) }` for tournament objects. PandaScore tier field locations by object type: matches=`match.tournament.tier`, tournaments=`t.tier`, series=always null (derive from tournament objects).

### Config
- `vercel.json` - Rewrites: `/sitemap.xml` -> `/api/sitemap`, `/match/:matchId` -> `/`, `/about` -> `/`, `/release-notes` -> `/`, `/tournaments` -> `/`, `/tournament/:seriesId` -> `/`, `/calendar` -> `/`, `/analytics` -> `/`, `/preview` -> `/` (internal design preview, disallowed in robots.txt), `/news` -> `/`
- `middleware.js` - Edge middleware: intercepts `/match/*` requests, injects per-match OG meta tags server-side
- `vite.config.js` - Vite build config; includes `vite-plugin-pwa` (`VitePWA`) for Progressive Web App support. Uses `strategies: 'injectManifest'` (not `generateSW`) so the custom `src/sw.js` service worker is used. vite-plugin-pwa injects `self.__WB_MANIFEST` into it at build time. Generates `dist/sw.js`, `dist/manifest.webmanifest`, and `dist/registerSW.js` on every build. `registerType: 'autoUpdate'` so the service worker silently updates when a new deploy lands. Manifest declares `pwa-192.jpg` and `pwa-512.jpg`; `theme_color` and `background_color` are `#030712` (gray-950) to match the dark surface.
- `src/sw.js` - Custom service worker. Workbox precaching via `precacheAndRoute(self.__WB_MANIFEST)`. Runtime caching: `/api/*` (NetworkFirst, 24h), PNG images (CacheFirst, 30d). The OpenDota route that was previously registered here has been removed — OpenDota calls now go through server-side proxy modes in `api/tournaments.js` to avoid CORS errors. Push event handler shows a notification with title/body/icon from the push payload. `notificationclick` handler focuses an existing window or opens a new one.

---

## Environment Variables (Vercel)
- `TWITCH_CLIENT_ID` - Twitch app client ID (server-side; returned to browser via `match-streams.js ?mode=twitch-token` so the client can call Twitch Helix API — no `VITE_` prefix needed)
- `TWITCH_CLIENT_SECRET` - Twitch app client secret (server only — never exposed to the client)
- `ANTHROPIC_API_KEY` - Claude API key for AI summaries
- `PANDASCORE_TOKEN` - PandaScore API token for live/upcoming/tournament data
- `KV_REST_API_URL` - Upstash Redis REST URL
- `KV_REST_API_TOKEN` - Upstash Redis REST token
- `VAPID_PUBLIC_KEY` - VAPID public key for Web Push (server-side, no VITE_ prefix)
- `VITE_VAPID_PUBLIC_KEY` - Same VAPID public key exposed to the frontend build
- `VAPID_PRIVATE_KEY` - VAPID private key (server-side only, never expose to client)
- `VAPID_SUBJECT` - VAPID contact URI, e.g. `mailto:admin@spectateesports.live`
- `GOOGLE_CREDENTIALS` - Service account JSON (minified, single line) for BigQuery access (project: spectate-esports)
- `GA4_BIGQUERY_DATASET` - BigQuery dataset name for GA4 export (e.g. `analytics_526697998`)
- `ANALYTICS_PASSWORD` - Password to access the private `/analytics` chat page
- `CURRENTS_API_KEY` - Currents API key for editorial news aggregation (`api/news.js`); free tier: 1,000 req/day, real-time. Silently disabled if missing — the other three news sources still run.

---

## PS ↔ OD Data Connection

This is the core mechanism that ties PandaScore's live/tournament data to OpenDota's match data (drafts, gold graphs, stats, VODs). Understanding it is essential before touching any live match, stream, or VOD logic.

### The only true linking field: `external_identifier`

Each PandaScore **game** object exposes `game.external_identifier`, which **is** the OpenDota match ID. It is mapped in `api/live-matches.js` `mapGames()`:

```js
matchId: g.external_identifier || null
```

**Critical constraint**: PandaScore only populates this field while the game is **running** (live). Once the game finishes, PandaScore clears it. Any logic that relies on this field must account for the null-after-finish behaviour.

### How the connection is persisted: KV cache during live play

Because `external_identifier` disappears after a game ends, `cacheRunningStreams()` in `api/live-matches.js` writes three KV entries while a game is live:

| KV key | Value | Written when | TTL |
|---|---|---|---|
| `live:game:{psMatchId}:{position}` | OD match ID | `game.status === 'running'` | 14 days |
| `stream:match:{odMatchId}` | Twitch channel handle | `game.status === 'running'`, `nx:true` (write-once) | 14 days |
| `format:match:{odMatchId}` | PS match_type (e.g. `"best_of_2"`) | any game in the match | 14 days |

The `live:game:` key is what allows finished games to recover their OD match ID: the normal handler does a batch `mget` of these keys and merges the IDs back into the `games` array before caching the response. The `format:match:` key allows the completed-match feed to correct OpenDota's `series_type` when it disagrees with PandaScore (e.g. DreamLeague group stage BO2s reported by OD as series_type 1 = BO3).

This caching is written by **both** the normal client-poll handler and the 30-min GitHub Actions cron (`?cron=1`). The cron runs even when no user is watching, ensuring coverage for games that start between user polls.

### Series-level: no direct ID mapping

There is **no PandaScore `serie_id` → OpenDota `series_id` mapping**. The two IDs come from completely separate systems. A series connection is derived by aggregating game-level links — once Game 1 and Game 2 each have an OD match ID, they share the same OpenDota `series_id`. This is implicit, not stored.

### Fallback: time + team name fuzzy matching

When no cached `external_identifier` exists (historical matches, qualifier series, cold KV), two fallbacks resolve the OD match:

1. **`findOdMatchByTime()`** in `api/_shared.js`: given a PS game's `begin_at` (Unix seconds) and its opponents array, filters OD promatches to a **±15 min** timestamp window (900s — PS `begin_at` is scheduled time; OD `start_time` is actual in-engine start after drafting, empirically 7–10 min later), then uses bidirectional substring team name matching to break ties. Used by `?mode=recent-completed`.

2. **`match-streams.js` PandaScore fuzzy match**: given an OD match's `start_time` and team names (`radiantTeam`/`direTeam` query params), queries PandaScore `/dota2/matches` with a **±1h** time window and runs `teamsMatch()`. If a match is found, its Twitch stream is extracted via `getTwitchStreams()` and cached to `stream:match:{odMatchId}` for future hits.

Both use the same **bidirectional substring** pattern (the `teamsMatch`/`sub` helper):
```js
x.includes(y) || y.includes(x)
```
This handles name truncation or abbreviation on either side (e.g. `"BetBoom Team"` vs `"BetBoom"`, `"Yakult Brothers"` vs `"Yakult S Brothers"`). **Never replace this with exact equality or one-directional contains.** The canonical pattern lives in `api/_shared.js` `findOdMatchByTime()` — any new PS↔OD name matching must use the same logic.

### Full resolution flow (drawer open)

```
User opens match drawer (OD match ID known)
  ↓
fetchMatchStreams(matchIds, ts, radiantTeam, direTeam)  [src/api.js]
  ↓
api/match-streams.js checks in order:
  1. KV  stream:match:{id}        — fast path (written during live play or prior fuzzy match)
  2. PandaScore fuzzy match        — ±1h time window + bidirectional team name match
     → on hit: cache result to KV, return channel
  3. ts bucket  stream:ts:{bucket} — candidate channels list (returned as _candidates;
     no longer used for VOD search — kept only for diagnostics)
```

The frontend (`findTwitchVod` in `src/api.js`) uses only `preferredChannel` from step 1 or 2 — it does **not** fall back to other channels. This prevents returning a VOD from a concurrent match on the same channel.

---

## Core Features

### Match Discovery
- Fetches pro matches from OpenDota `/promatches` endpoint
- Filter is a pure OR of two independent rules — a match is kept if EITHER passes:
  1. **OpenDota premium**: `fetchPremiumLeagueIds()` calls `/api/tournaments?mode=premium-league-ids` (server-side proxy — avoids CORS) which fetches `/api/leagues` and returns premium-tier league IDs. `premiumIds.has(m.leagueid)` returns true for premium matches. (professional tier is intentionally excluded; tier A events are covered via rule 2)
  2. **PandaScore tier S/A name match**: `fetchTier1LeagueNames()` fetches `api/tournaments?mode=tier1-leagues` — returns tier S/A league names (e.g. "DreamLeague", "ESL One", "PGL", "PGL Wallachia") from PandaScore merged with the hardcoded `PERMANENT_TIER1_NAMES` list. `matchesTier1Names(m.league_name, tier1Names)` does case-insensitive substring match. Names < 3 chars are skipped to avoid accidental broad matches (3-char names like "PGL" are allowed as generic org catch-alls). Both fetches run in parallel with the promatches request and are cached per session.
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
- Filters to tier-S and tier-A tournaments using `isTier1(m) || isTier1ByName(m, names)`. Primary: checks `match.tournament.tier`. Fallback: checks `match.league.name` against a merged names array: KV-cached tier1 names plus `PERMANENT_TIER1_NAMES` (hardcoded in `_shared.js`). The hardcoded list ensures DreamLeague, ESL One, PGL, etc. always pass even when KV is cold (e.g. fresh Redis flush). This matters for qualifier matches where PandaScore sets `tournament.tier = "c"` despite being a tier1 organizer event. Maps each match to `{id, teamA, teamB, tournament, seriesLabel, bracketRound, seriesScore, currentGame, games, streams}`
- `bracketRound` - extracted from `m.name` by stripping everything after the first `:` and applying title case (e.g. "Upper Bracket Final: PARI vs TS" → "Upper Bracket Final"). Shown in `LiveMatchRow` below the score row. KV key: `dota2:live_matches_v4`
- `seriesScore` - derived from `m.results` (per-team win counts mapped by team ID), capped by `winsRequired(m.match_type, m.number_of_games)` to prevent showing raw game totals (e.g. BO3 score is capped at 2; PandaScore can report score=3 for a BO3 sweep)
- `currentGame` - position of the game with `status === 'running'`
- `games` - array of `{position, status, winnerName, matchId, beginAt, length}` where `matchId` is `external_identifier` (OpenDota match ID). For finished games where `external_identifier` is null (only populated while a game is running), the handler does a batch `mget` of `live:game:{psMatchId}:{position}` KV keys and merges the resolved OD IDs back into the game objects.
- `youtubeStream` - first English YouTube URL from `streams_list` (rendering-layer only; `getTwitchStreams()` in `_shared.js` is not modified)
- Cached in Upstash Redis for 2 minutes; bust cache via `?bust=1`
- **Mid-series click behavior (REQ-2)**: clicking a live match row with at least one finished game opens `LiveSeriesSheet` (not `MatchDrawer` directly). `handleSelectLiveMatch` in App.jsx reads `liveMatches` state, finds the PS match, and calls `setSelectedLiveSeries(match)`. The replay button in `LiveSeriesSheet` calls `handleLiveSeriesReplay(odMatchId)` which closes the sheet then opens the full OD `MatchDrawer` via `handleSelectMatchId`. **Data routing (REQ-3)**: PS data is used ONLY while `match.status === 'running'`; once PS marks a series `finished` it no longer appears in `/dota2/matches/running` and OD is the sole data source.
- Spoiler-free mode: hides series score (shows "vs"), hides winner names in chips and LiveSeriesSheet rows, disables team dimming

### Upcoming Matches (PandaScore)
- `api/upcoming-matches.js` fetches next 72h of scheduled matches; tier-filters using same `isTier1(m) || isTier1ByName(m, names)` pattern as live-matches (same fallback for newly-created series with no tier assigned); deduplicates by `(sorted opponent IDs | scheduled_at)` fingerprint to suppress PandaScore duplicate entries. Maps each match to `{id, scheduledAt, teamA, teamB, tournament, seriesLabel, bracketRound, streams}`. `bracketRound` strips after `:` from `m.name` and applies title case; shown in `UpcomingMatchRow` below teams, above time. KV key: `dota2:upcoming_matches_v6`
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
- Rosters and standings: `fetchSeriesRosters` calls the generic `/tournaments/{id}` endpoint (not `/dota2/tournaments/{id}` — that returns 404; the game-specific endpoint was removed by PandaScore). Player data comes from `expected_roster` in the response, which is an array of `{ team, players }` objects in the same format `mapSeriesTeam` already handles. If rosters are empty (common for upcoming events), teams are built from standings as a fallback — team names and logos appear immediately, player rosters show "Roster unavailable".
- Winner display: `serie.winner` field (type === 'Team') shown as champion on cards and detail page header
- Routing follows same pattern as AboutPage/ReleaseNotesPage - path check in `main.jsx`, Vercel rewrite to `/` in `vercel.json`
- Cache keys: `tournaments:dota2:series_list_v4` (1h), `tournament:detail:series:v8:{id}` (30min, or 30d for completed events WITH player data — skips 30d TTL if rosters came back empty so it retries), `tournament:summary:{id}` (24h / 30d for completed)
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
- **Completed fallback (Mar 2026)**: `api/tournaments.js` default mode now fetches `/tournaments/past` and returns up to 3 recently completed tier-1 tournaments as `completed[]`. TournamentHub uses priority: running > upcoming > recently completed. When showing a completed event, the label reads "Recently Completed" with a gray border accent. This ensures the hub is never empty during breaks between events. Cache key is `dota2:tournament_list_v7`.
- **Duplicate live tournament fix (Apr 2026)**: When a tournament transitions from upcoming to running, `fetchTournamentStatuses` proactively merges it into `list.ongoing` while `list.upcoming` in the cached list may still hold the same entry. The main handler deduplicates `[...list.ongoing, ...list.upcoming]` by ID via `new Map(...)` so both copies never reach the client, preventing a phantom extra chip and incorrect live count.
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
- `MyTeamsSection` component (`src/components/MyTeamsSection.jsx`) is kept on disk but no longer rendered on the homepage. Followed-team matches are instead sorted to the top of their tournament cards in HomeFeed with an amber left border (`border-l-amber-500/60`). The `ManageTeamsModal` and follow/unfollow star remain fully functional.
- `ManageTeamsModal` (`src/components/ManageTeamsModal.jsx`) - Bottom sheet on mobile, centered modal on desktop. Sections: (1) "Follow a Team" search input filtered against `TIER1_TEAMS` array with onMouseDown dropdown; (2) "Following" list with × remove buttons; (3) push notification row - Toggle (iOS pill) when permission granted, "Enable" button when default, denied message with browser instructions; (4) Calendar link when teams followed. Push state: `PUSH_DISABLED_KEY = 'spectate-push-disabled'` in localStorage. Disabling push calls `subscribeToPush([])` to clear server subscription + sets flag. Re-enabling calls `subscribeToPush(followedTeams)` + removes flag. `App.jsx handleToggleFollow` checks this flag before re-subscribing when teams are added/removed.
- The modal shows a notice: followed teams are browser-only and will not persist across incognito, other browsers, or other devices
- No backend, no auth, no server state - entirely localStorage-based
- Spoiler-free mode is respected in the My Teams section the same way as the main list
- GA4 events: `follow_team`, `unfollow_team` (team_name param), `my_teams_section_view` (once per page load), `my_teams_vod_click` (match_id, team_name), `manage_teams_open`
- Star buttons are rendered only when `followedTeams` and `onToggleFollow` props are provided to MatchCard; silently absent otherwise
- MatchCard header uses `div[role="button"]` with keyboard handlers instead of `<button>` to allow nested `<button>` elements (the star follow buttons); the keydown handler guards against child button keypresses via `e.target !== e.currentTarget`

### Auto-Tweet (Owner Only — NOT Public)
- **This is an owner-only background feature. It must never be exposed in the UI or triggered by users.**
- A GitHub Actions cron (`.github/workflows/auto-tweet.yml`) runs every 30 minutes and POSTs to `/api/draft-posts` with `{ type: "cron" }`, authenticated via `CRON_SECRET`
- `runAutoTweet()` in `api/draft-posts.js` fetches recent pro matches from OpenDota `/api/promatches`, filters to tier-1 leagues (same filter the website uses: `getPremiumLeagueIds()` + `isTier1ByName()` with KV-cached PandaScore names), groups into series, and posts **one tweet per completed series** on X (Twitter)
- Tweet text is a **deterministic template** — no AI involved. Series win: `"{Winner} win {score} over {Loser}\n{Format} | {Tournament}\n{link}"`. BO2 draw: `"{Team1} and {Team2} split the series 1-1\n{Format} | {Tournament}\n{link}"`
- The link always points to the first match of the series via `seriesUrl(games[0])`
- Series tweet includes a 1200x630 OG image (team names + score) generated via `api/og.js?mode=series`
- No `@mentions` — handle tagging was removed because static maps go stale and cannot be reliably verified without manually checking each X account
- Redis (KV) is used to track which series have been tweeted (`auto-tweet:series:{seriesKey}`) to prevent duplicate posts — keys expire after 30 days
- `MAX_PER_RUN = 5` caps series tweets per cron execution
- **BO2 draw**: `seriesComplete()` handles the 1-1 draw case explicitly; `makeSeriesTweet` uses the split-series template (`isDraw=true`)
- Series score is always `"{winnerWins}-{loserWins}"` (e.g. "2-0") — both teams initialized to 0 wins before counting
- Twitter auth uses OAuth 1.0a (API Key, API Secret, Access Token, Access Token Secret) — app must have **Read and Write** permissions; tokens must be regenerated after changing permissions
- Required env vars: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `CRON_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`

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
- Three options: `"light"` | `"dark"` | `"system"`. Stored in `localStorage["theme"]`; default is `"system"` for new users.
- Managed in `SettingsSheet.jsx` via `useState` + `useEffect`. System mode listens to `window.matchMedia("(prefers-color-scheme: dark)")` and updates `document.documentElement.classList` in real time when the OS switches (e.g. scheduled dark mode). The `change` listener is cleaned up on effect re-run.
- `index.html` contains an inline script (before React loads) that reads `localStorage["theme"]` and applies `class="dark"` to `<html>` immediately, preventing a flash of wrong theme on page load/refresh. System mode in this script also checks `matchMedia("(prefers-color-scheme: dark)").matches`.
- Settings UI: 3-button segmented control (Light / Dark / System) using the standard segmented control pattern.
- Theme change fires `theme_toggle` GA4 event with `{ theme, source: 'settings_sheet' }`.

### Navigation Architecture (May 2026 redesign)

The site nav was redesigned from first principles in May 2026 because the previous additive header (3 text links + 4 icon buttons) overflowed on mobile. New rule: the header is for **orientation + state + one universal action**, not for navigation. Navigation lives elsewhere.

- **SiteHeader (every page)**: logo only on mobile (wordmark hidden below `sm:`), logo + wordmark + tagline on desktop. Tournaments text link desktop-only. News text link desktop-only — shows a sky-500 unread dot when new articles exist since last `/news` visit. Spoiler-free toggle when applicable. Settings cog desktop-only (`hidden md:inline-flex`) - mobile uses the More tab instead.
- **BottomTabBar (mobile only)**: Home / Tournaments / News / More tabs in the thumb zone. News tab shows a sky-500 unread dot when `hasUnreadNews()` returns true and the tab is inactive. `md:hidden` hides on desktop. Page main containers use `pb-20 md:pb-8` to avoid content being obscured.
- **SettingsSheet (everywhere)**: a slide-up sheet (mobile) / dropdown (desktop) holding Theme, Calendar, Install, About, What's New. Triggered via `SETTINGS_OPEN_EVENT` window event - header cog (desktop) and bottom-bar More tab (mobile) each dispatch this. Decoupled, no prop drilling.
- **SiteFooter (every page)**: shared footer with About + What's New links and the brand line. Replaces the per-page inline footers.

What was removed from the header: About, What's New (now in SiteFooter), Calendar, Install, Theme (now in SettingsSheet). These items either had once-per-user frequency or were preferences set once - they didn't earn header space.

### Watchability Badge
- `WatchBadge` component (`src/components/WatchBadge.jsx`) shown on each series card
- Fetches score from `/api/tournaments?mode=watchability` (POST with `{ seriesId, matchIds }`). Logic lives in `api/_watchability.js` (underscore-prefixed so it is not deployed as a Vercel function; imported by `api/tournaments.js`).
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
- Calendar subscription is accessible via the `/calendar` page and via `CalendarSubscribeModal` opened from the My Teams section and TournamentHub. The SiteHeader does not have a Calendar nav link (it was removed in the May 2026 header redesign; calendar now lives in SettingsSheet).
- GA4 events: `calendar_page_view`, `calendar_subscribe_modal_open` (source: `all_tournaments` | `tournament` | `calendar_page`), `calendar_url_copy` (feed_type), `calendar_team_select` (team_name), `calendar_team_remove` (team_name)
- Team name to PandaScore slug mapping: `CAL_SLUG_ALIASES` in `api/tournaments.js` and `teamNameToSlug` helper in `MyTeamsSection.jsx`
- Calendar modes are merged into `api/tournaments.js` to stay within the 12-function Vercel Hobby plan limit

### Playoff Stage Labels and Grand Final Highlighting
- Bracket stage labels (e.g. "Grand Final", "Upper Bracket Final", "Semifinal") are shown on completed match rows in `CompactSeriesRow`, matching the display already present on live (`LiveMatchRow`) and upcoming (`UpcomingMatchRow`) match rows
- The label is sourced from `parseBracketRound(m.name)` — same function used for live/upcoming — applied to each PandaScore match in `?mode=recent-completed`. Field name: `bracketRound` on each game object
- Grand Final detection: `s.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))` — regex anchored with `^` so it does NOT match "Upper Bracket Final" or "Semifinal". Detected series get amber/gold border, warm background tint, and a trophy badge in the card header
- No separate endpoint or extra fetch needed — `bracketRound` is embedded in the `?mode=recent-completed` response alongside other game fields. The old `?mode=grand-finals` endpoint has been removed.

### Latest Results UI
- Floating section label above the card (no internal header bar); gray left-border accent (`border-gray-400`)
- Date dividers: "Today", "Yesterday", or "Mar 7" labels between groups of matches from different days

### Static Pages (React)
- About page at `/about` - served by `src/pages/AboutPage.jsx` via Vercel rewrite + path routing in `main.jsx`
- Release Notes at `/release-notes` - served by `src/pages/ReleaseNotesPage.jsx` via same pattern
- Both pages use `SiteHeader` (shared component) — identical header across all pages
- Old `.html` files in `public/` are superseded but not deleted

### Progressive Web App (May 2026)
- Configured via `vite-plugin-pwa` in `vite.config.js`. Generates `dist/sw.js` (Workbox service worker), `dist/manifest.webmanifest`, and `dist/registerSW.js` on every build. `registerType: 'autoUpdate'` silently activates new versions on next page load - no user-facing update prompt.
- Manifest: `name="Spectate Esports"`, `short_name="Spectate"`, `display="standalone"`, `theme_color` and `background_color` `#030712` (gray-950 - matches the dark site surface). Icons: `/pwa-192.jpg` and `/pwa-512.jpg` (hand-designed JPGs with opaque dark backgrounds and the shield centered with safe-area padding). The 512 is also declared as `purpose: 'maskable'` for Android adaptive icons. JPEG is used (not PNG) because the icons have opaque backgrounds and JPEG compresses photographic-style art smaller; transparency is intentionally not needed - flat opaque backgrounds prevent iOS/Android from substituting white behind transparent pixels.
- Workbox precache: HTML, JS, CSS bundles only. Large images (`logo*.png` 1.7MB, `og-image.png` 340KB) explicitly excluded via `globIgnores` to keep precache small.
- Workbox runtime caching: `/api/*` (Vercel functions) -> `NetworkFirst`, 24h TTL, cache name `api-cache`. OpenDota -> `NetworkFirst`, 1h TTL, `networkTimeoutSeconds: 10` (falls back to cache after 10s, updates cache in background), cache name `opendota-cache`. PNG images -> `CacheFirst`, 30d TTL, cache name `image-cache`.
- `index.html` adds `<meta name="theme-color" content="#030712" />`. The manifest link tag is auto-injected by the plugin - do not add it manually.
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />` is REQUIRED for iOS home-screen installs. iOS Safari does NOT use the PWA manifest icons for Add to Home Screen - it uses the apple-touch-icon link tag exclusively. If this points to a transparent PNG, iOS substitutes a white background, which is why earlier versions of this PWA shipped with a broken-looking white-background icon. The file is a 180x180 PNG generated from `pwa-512.jpg` via `sips -s format png -z 180 180`. iOS caches the icon at install time and never refreshes it, so users must remove the home-screen icon and re-add it after this file changes.
- `src/components/InstallPrompt.jsx` manages the install experience per platform. Detects iOS Safari (`/safari/i` + not CriOS/Chrome), iOS Chrome (`/crios/i`), desktop (`hover: hover` + `pointer: fine`), and Android. **iOS Safari and iOS Chrome**: both auto-show the same 3-step modal guide on first visit ("Tap Share button", "Add to Home Screen", "Tap Add"). **Desktop**: manual trigger only — shows a `DesktopInstallTip` modal explaining what installing means and giving separate iPhone/Android instructions. No auto-show on desktop. **Android**: listens for `beforeinstallprompt`; shows a bottom banner with a native Install button; falls back to "Open browser menu" hint if event hasn't fired. `SettingsSheet` hides the Install row when `display-mode: standalone` (already installed). Dismiss persists to `localStorage['pwa-install-dismissed']='1'`. Exports `SHOW_EVENT = 'pwa-show-prompt'`. Fires GA events: `pwa_prompt_show` (with `platform: 'ios_safari'|'ios_chrome'|'android'|'desktop'` and `trigger: 'auto'|'manual'`), `pwa_prompt_dismiss`, `pwa_install_click`, `pwa_install_outcome`.
- `index.html` includes a `?notrack=1` URL param handler: visiting any page with `?notrack=1` sets `localStorage['notrack']='1'` before GA loads and disables GA for all future visits on that device (`window['ga-disable-G-XM3M9BCBWD'] = true`). Used by the developer to opt out of their own analytics on personal devices.
- Search bar auto-focus is guarded by `window.matchMedia('(hover: hover)').matches` — focus is only applied on pointer devices (desktop), not on touchscreens, to prevent the keyboard from popping up unexpectedly on mobile after panel dismiss or search clear.
- Verification: build with `npm run build`, serve with `npm run preview`, then in DevTools: Application -> Service Workers shows "activated and is running"; Application -> Manifest shows the app metadata; Cache Storage shows `workbox-precache-v2-...`, `api-cache`, `opendota-cache`, `image-cache` after navigation.
- **Pull to refresh** - `usePullToRefresh` hook in `src/App.jsx` detects touch gestures and calls `loadMatches()` when the user pulls down from the top of the page. Only active in standalone/PWA mode (`display-mode: standalone` or `navigator.standalone`). Uses refs (`pullingRef`, `isRefreshing`) to avoid stale closures in event handlers; state (`pullDistance`, `refreshing`) drives the UI indicator. A floating pill with a down-arrow (pull phase) or spinning arc (loading phase) appears at the top of the screen. Threshold: 72px.
- **Push notifications** - Web Push implemented for Android Chrome and iOS Safari 16.4+ (installed PWA only). Two entry points: (1) "Live match alerts" card in My Teams — shown when `pushPermission === 'default' && !pushCardDismissed`; auto-hides once enabled; can be dismissed with × (persists to `localStorage['push-card-dismissed']`); (2) "Live match alerts" row in SettingsSheet "Stay updated" — persistent status display, shows "On" when granted. Subscriptions stored in Upstash KV under `push:sub:{userId}`, `push:teams:{userId}`, `push:team:{teamName}` (reverse index). Notifications sent by the existing 2-minute cron in `live-matches.js` after detecting a live match for a subscribed team. `push:sent:{matchId}:{userId}` key (TTL 24h) deduplicates sends. Expired subscriptions (HTTP 410) are automatically pruned. Requires 4 env vars: `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Client utility in `src/utils/push.js` (isPushSupported, getPushPermission, subscribeToPush). **Auto-update on favorites change**: `handleToggleFollow` in `App.jsx` calls `subscribeToPush(next)` automatically whenever `getPushPermission() === 'granted'` -- so following or unfollowing a team immediately re-registers the updated team list with the push server without any extra user action. **"Sync to your calendar" card** in My Teams is also dismissible with × (persists to `localStorage['calendar-card-dismissed']`).

---

## Known Issues / Limitations
- **OpenDota indexing lag**: `/promatches` takes 30min to several hours to index games after a series ends. Completed matches only appear once OpenDota indexes them - there is no PandaScore fallback for completed matches.
- Role detection (Carry/Mid/Off/Support) is removed - OpenDota `lane_role` field is unreliable
- VOD channel selection relies on PandaScore fuzzy match. If no match is found (e.g. qualifier series where PandaScore has no `external_identifier` and team names don't fuzzy-match), "No VOD found" is shown. The ts-bucket fallback is no longer used for VOD search - it was returning VODs from concurrent matches on shared channels.
- Twitch VODs expire after 60 days - old matches will show "No VOD found"
- Search only searches already-loaded matches - user must click "Load more matches" to expand search
- `fetchPremiumLeagueIds` in `src/api.js` fails gracefully (returns empty Set) when OpenDota `/leagues` is down or slow — has an 8-second AbortController timeout so a slow `/leagues` response doesn't delay the full match load
- `fetchProMatches` in `src/api.js` aborts the promatches fetch after 25 seconds (was 15s, increased to tolerate slower OpenDota response times)
- **API resilience**: Error handling is scoped per section. If OpenDota is down, `LatestMatches` shows an inline error with a Retry button while `TournamentHub` and `UpcomingMatches` (PandaScore) continue to render normally. If PandaScore is down, `TournamentHub` and `UpcomingMatches` silently return null (hiding themselves) while `LatestMatches` renders historical OpenDota data normally.
- Live match KV cache must be busted after deploying new fields: `/api/live-matches?bust=1`
- Tournament bracket parsing relies on PandaScore naming conventions ("Round N", "Upper Bracket Semifinal", etc.) for proper round labels. If PandaScore changes naming, rounds fall back to generic "Round N" numbering. Match-named rounds (e.g. "Tundra vs RNX") are detected and shown with no section header.
- PandaScore plan limitation: `GET /dota2/series/{id}` and `GET /dota2/series/{id}/matches` return 404/validation errors on the current plan tier. Use `filter[id]` on `/dota2/series/running|upcoming|past` and `filter[serie_id]` on `/dota2/matches/running|upcoming|past` instead (pattern used in `tournament-detail.js` and `calendar-tournament` mode)
- `findLeague` in `api/tournament-heroes.js` uses token overlap to match a series name to an OpenDota league. Single-digit season numbers (e.g. "8") are now preserved as tokens so Season 8 is never mis-matched to Season 7. After deploying fixes to this function, bust the affected tournament's KV cache with `?bust=1`
- **`name` param construction in TournamentHub**: `tournament.serie` from PandaScore is sometimes just the suffix (e.g. `"Season 29 2026"` without the org prefix `"DreamLeague"`). The frontend combines `tournament.league` + `tournament.serie` into a full name before sending to `tournament-heroes`, using the same pattern as `buildTournamentName`: if `serie` already contains `league`, use `serie` alone; otherwise prepend `league`. This ensures `findLeague` always gets ≥2 token overlap with OpenDota's league names.

---

## Tier Filtering Strategy

Tournaments are filtered using the tier fields exposed by each data source. No hardcoded name lists.

| Data source | Object type | Tier field | Values accepted |
|---|---|---|---|
| PandaScore `/dota2/matches/*` | match | `match.league.tier` | `'s'`, `'a'` |
| PandaScore `/dota2/tournaments/*` | tournament | `t.tier` (direct, NOT `t.league.tier` which is always null) | `'s'`, `'a'` |
| PandaScore `/dota2/series/*` | series | **no tier field** — always null | derive via `tier1RunningSerieIds` / `tier1UpcomingSerieIds` / `tier1PastSerieIds` sets built from tournament objects |
| OpenDota (leagues/promatches) | league | `league.tier` | `'premium'` (equiv S), `'professional'` (equiv A) |

**PandaScore tier S** = elite international LANs (TI, DreamLeague, ESL One, PGL, BLAST, Riyadh Masters, Premier Series, ...).
**PandaScore tier A** = second-tier professional events (ESL Challenger, regional circuits, ...).
**OpenDota premium** = Valve-sponsored DPC events; equivalent of PandaScore tier S.
**OpenDota professional** = second-tier pro events; equivalent of PandaScore tier A.

Key exports in `api/_shared.js`:
- `isTier1(match)` - checks `match.tournament.tier` (primary field for match objects) then `match.league.tier` for 's' or 'a'
- `isTier1ByName(match, tier1Names)` - **fallback** for when PandaScore hasn't assigned a tier to a newly-created series yet. Checks `match.league.name` against the cached tier1 names array (same list used by `matchesTier1Names`). Used in `live-matches.js` and `upcoming-matches.js` as `isTier1(m) || isTier1ByName(m, names)`. Names are fetched from KV under `KV_TIER1_NAMES_KEY`.
- `KV_TIER1_NAMES_KEY` - exported constant `'dota2:tier1_league_names_v1'` so all consumers read from the same KV key
- `PERMANENT_TIER1_NAMES` - exported hardcoded list of tier1 organizer names (DreamLeague, ESL One, PGL, PGL Wallachia, BLAST, etc.); merged into `names` in `live-matches.js` so tier filtering never depends on KV being warm
- `buildPremiumLeagueIds(leagues)` - pure function; builds a `Set<leagueid>` of OpenDota `premium`-tier leagues only (tier A / professional events are handled via the PandaScore name cache)
- `getPremiumLeagueIds()` - async; fetches `/api/leagues`, caches result in memory

Key exports in `src/utils.js`:
- `matchesTier1Names(leagueName, tier1Names)` - returns `true` if leagueName contains any PandaScore tier name, `false` if it doesn't, `null` if the list is empty/all-short. Min name length guard: names < 3 chars are skipped. Called in `fetchProMatches` to filter OpenDota matches; the caller treats only an explicit `true` as a match, so `null` is effectively equivalent to `false` and the OpenDota premium check provides the other branch of the OR.

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

### Monitoring & Error Alerting

**`/api/tournaments?mode=monitor`** — Protected by `CRON_SECRET`. Merged into `tournaments.js` to stay within the 12-function limit. Returns a JSON health report.
- `?mode=monitor&report=1` — also calls Claude Haiku for a 2-3 sentence triage summary (used by GitHub Actions)
- `?mode=monitor` (no `report=1`) — raw stats only, no Claude call (quick manual check)
- Response fields: `error_count`, `error_count_24h`, `errors_by_endpoint`, `recent_errors`, `services`, `critical`, `summary`, `action_required`

**Error telemetry (KV)** — `trackError(endpoint, statusCode, detail)` in `_shared.js` writes to `monitor:errors:{YYYY-MM-DD}` (list, capped at 100, 3-day TTL). Called in catch blocks of: `live-matches`, `upcoming-matches`, `draft-posts`, `summarize`, `news`, `tournaments`, `tournament-detail`, `tournament-heroes`, `match-streams`.

**Alert threshold** — `critical: true` when ≥3 errors from the same endpoint in a 2h window, OR any service health probe fails.

**GitHub Actions** — `.github/workflows/log-monitor.yml` runs every 2h. Creates a GitHub Issue labeled `monitoring` when critical; comments on existing open `[Alert]` issue to deduplicate. Daily digest at 08:00 UTC only if errors exist that day.

**Cron failure alerts** — `auto-tweet.yml` and `sync-teams.yml` both have `if: failure()` steps that create `[Alert]` issues immediately on cron failure.

**Quick check**: `curl -H "Authorization: Bearer $CRON_SECRET" "https://spectateesports.live/api/tournaments?mode=monitor"`


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

### Homepage section labels (updated May 14, 2026)
- The "Live Now", "Results", and "Coming Up" global section headers have been removed. Tournament cards are now a single flat sorted list.
- Intra-card section dividers (Live / Upcoming / Results) are rendered as slim labeled bars inside each tournament card when the card has matches in two or more states. Single-state cards have no divider.
- The "My Teams" amber card at the top of the feed retains its floating `<h2>` label with `border-l-2 border-amber-500`.
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

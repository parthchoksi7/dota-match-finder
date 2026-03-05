# Spectate Esports — Project Context

## What It Does
Spectate Esports is a pro Dota 2 match viewer. Users search for a team or tournament, see recent series results, and get a direct Twitch VOD link timestamped to the exact game. It also shows the full draft (picks, bans, player stats) and generates an AI match summary.

Live at: https://spectateesports.live
GitHub: https://github.com/parthchoksi7/dota-match-finder

---

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Deployment**: Vercel
- **Backend**: Vercel serverless functions (`/api/`)
- **Data**: OpenDota API (match data), Twitch API (VOD links)
- **AI**: Anthropic Claude Haiku via `/api/summarize.js`
- **Analytics**: Vercel Analytics + Google Analytics 4 (GA4) with custom events
- **Dashboard**: Looker Studio connected to GA4

---

## Key Files

### Frontend
- `src/App.jsx` — Main app, state management, search, load more, drawer
- `src/api.js` — All API calls: OpenDota, Twitch VOD search, hero fetching, match summaries
- `src/components/MatchDrawer.jsx` — Slide-in drawer showing match details, VOD links, draft, AI summary
- `src/components/DraftDisplay.jsx` — Hero picks, bans, player names, KDA
- `src/components/MatchList.jsx` — Search results list grouped into series (no internal pagination limit)
- `src/components/LatestMatches.jsx` — Homepage match list
- `src/components/MatchCard.jsx` — Individual series card with expand/collapse and analytics tracking
- `src/components/SearchBar.jsx` — Search input with popular team shortcuts
- `src/utils.js` — Series grouping logic (`groupIntoSeries`, `isSeriesComplete`)

### Backend (Vercel Serverless)
- `api/summarize.js` — Generates AI match summary using Claude Haiku
- `api/twitch-token.js` — Handles Twitch OAuth client credentials flow

### Static Pages
- `public/about.html` — Static about page with FAQ, SEO content, theme sync with main app
- `public/favicon.png` — Cropped favicon (eye + Dota logo)
- `public/og-image.png` — 1200x630 Open Graph image for social sharing

### SEO
- `public/robots.txt` — Allows all crawlers, points to sitemap
- `public/sitemap.xml` — Includes homepage and about page
- `index.html` — Full meta tags, OG tags, Twitter Card, Google site verification, GA4 script

---

## Environment Variables (Vercel)
- `VITE_TWITCH_CLIENT_ID` — Twitch app client ID
- `TWITCH_CLIENT_SECRET` — Twitch app client secret (server only)
- `ANTHROPIC_API_KEY` — Claude API key for AI summaries

---

## Core Features

### Match Discovery
- Fetches pro matches from OpenDota `/promatches` endpoint
- Filters to Tier 1 tournaments only using keyword list in `api.js`
- Paginates by fetching until 20 Tier 1 matches found per page
- Groups individual games into series (BO1/BO3/BO5)
- Search filters `allMatches` live so load more updates results automatically
- Single "Load more matches" button handles both homepage and search results

### VOD Linking
- Searches multiple Twitch channels simultaneously using `Promise.allSettled`
- Returns ALL matching channels (not just first hit) — shown as multiple watch buttons
- Channels tracked: ESL Main, ESL Ember, ESL Storm, ESL Earth, BTS, PGL, WePlay, DreamLeague, and more
- Known limitation: cannot determine which concurrent stream has which match — user picks from all options

### Draft Display
- Fetches full match data from OpenDota `/matches/{id}`
- Shows hero picks per team with player pro names (`p.name || p.personaname`)
- Shows bans grouped by team with strikethrough styling
- Hero names fetched from OpenDota `/heroes` endpoint with in-memory cache

### AI Summary
- Sends trimmed match data to `/api/summarize` → Claude Haiku
- Hero IDs resolved to names server-side before sending to prevent hallucinations
- Pro player names used (`p.name` field from OpenDota)
- picks_bans and lane_role included in trimmed data for draft analysis
- Output format: DRAFT ANALYSIS (with Draft Winner) / STRATEGY / MVP / HIGHLIGHT
- Draft analysis based purely on picks/bans — explicitly ignores game performance
- Plain text only, no markdown
- Cached in localStorage by match ID

### Share Links
- Clicking a match updates URL to `#match-{matchId}`
- On page load, hash is read and drawer auto-opens
- Falls back to fetching match directly from OpenDota if not in loaded batch

### Drawer Details
- Shows Game X of Y label (e.g. "Game 2 of 3") in header
- VOD watch buttons are primary (purple)
- Copy VOD link and Share match are secondary underline text links
- Series score shown in drawer header

---

## Analytics

### trackEvent Helper (in App.jsx, MatchDrawer.jsx, MatchCard.jsx)
All components use a shared pattern to fire to both Vercel Analytics and GA4:
```js
function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}
```

### Events Tracked
| Event | Where | Properties |
|---|---|---|
| `series_expand` | MatchCard | tournament, radiantTeam, direTeam |
| `game_click` | MatchCard | matchId, radiantTeam, direTeam, tournament |
| `team_click` | MatchCard | team, tournament (fires twice — once per team) |
| `match_click` | App.jsx | matchId, radiantTeam, direTeam, tournament |
| `vod_click` | MatchDrawer | matchId, channel, radiantTeam, direTeam, tournament |
| `twitch_search_click` | MatchDrawer | matchId |
| `summary_click` | App.jsx | matchId, radiantTeam, direTeam, tournament |
| `copy_vod` | App.jsx | matchId |
| `share_match` | App.jsx | matchId |
| `search` | App.jsx | query |
| `load_more` | App.jsx | searchQuery |

### GA4 Custom Dimensions (registered in GA4 Admin → Custom Definitions)
- `Match ID` → parameter: `matchId`
- `Radiant Team` → parameter: `radiantTeam`
- `Dire Team` → parameter: `direTeam`
- `Tournament` → parameter: `tournament`
- `Channel` → parameter: `channel`
- `Team` → parameter: `team`

### Looker Studio Dashboard
Connected to GA4. Key reports:
- Unique/total users (Active Users, Sessions)
- Match clicks, game clicks (filter by event name)
- VOD/Copy/Share clicks (bar chart by event name)
- Popular matches (table: Match ID dimension, event count metric, filter: game_click)
- Popular teams (table: Team dimension, event count metric, filter: team_click)

---

## Known Issues / Limitations
- Role detection (Carry/Mid/Off/Support) is removed — OpenDota `lane_role` field is unreliable
- VOD channel selection is best-effort — multiple streams shown when concurrent matches exist
- Twitch VODs expire after 60 days — old matches will show "No VOD found"
- Search only searches already-loaded matches — user must click "Load more matches" to expand search
- GA4 custom dimensions only collect data from the date they were registered — no backfill

---

## Tier 1 Tournament Keywords (in `api.js`)
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

Always change `/mnt/user-data/uploads/` paths to local paths before running.

### Adding New Features
1. Data changes → `src/api.js`
2. UI changes → relevant component
3. State/flow changes → `src/App.jsx`
4. AI prompt changes → `api/summarize.js`
5. New analytics events → add `trackEvent()` call + register custom dimension in GA4

---

## Backlog / Future Ideas
- Hero images from Valve CDN using hero key
- Team logos (no reliable free API — OpenDota has partial coverage)
- Role labels (Carry/Mid/Off/Support) — needs better detection logic
- PandaScore API as replacement for OpenDota match list (cleaner Tier 1 filtering)
- Mobile bottom sheet optimization
- Liquipedia integration for upcoming matches
- Expand beyond Dota 2 to other esports (CS2, LoL, Valorant)

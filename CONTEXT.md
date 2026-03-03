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
- **Analytics**: Vercel Analytics with custom events

---

## Key Files

### Frontend
- `src/App.jsx` — Main app, state management, search, load more, drawer
- `src/api.js` — All API calls: OpenDota, Twitch VOD search, hero fetching, match summaries
- `src/components/MatchDrawer.jsx` — Slide-in drawer showing match details, VOD links, draft, AI summary
- `src/components/DraftDisplay.jsx` — Hero picks, bans, player names, KDA
- `src/components/MatchList.jsx` — Search results list grouped into series
- `src/components/LatestMatches.jsx` — Homepage match list (no internal limit)
- `src/components/MatchCard.jsx` — Individual series card with expand/collapse
- `src/components/SearchBar.jsx` — Search input with popular team shortcuts
- `src/utils.js` — Series grouping logic (`groupIntoSeries`, `isSeriesComplete`)

### Backend (Vercel Serverless)
- `api/summarize.js` — Generates AI match summary using Claude Haiku
- `api/twitch-token.js` — Handles Twitch OAuth client credentials flow

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
- Hero IDs resolved to names before sending to prevent hallucinations
- Pro player names used (`p.name` field from OpenDota)
- Output format: DRAFT ANALYSIS (with Draft Winner) / STRATEGY / MVP / HIGHLIGHT
- Plain text only, no markdown
- Cached in localStorage by match ID

### Share Links
- Clicking a match updates URL to `#match-{matchId}`
- On page load, hash is read and drawer auto-opens
- Falls back to fetching match directly from OpenDota if not in loaded batch

---

## Known Issues / Limitations
- Role detection (Carry/Mid/Off/Support) is removed — OpenDota `lane_role` field is unreliable
- VOD channel selection is best-effort — multiple streams shown when concurrent matches exist
- Twitch VODs expire after 60 days — old matches will show "No VOD found"
- Search only searches already-loaded matches — user must click "Load more matches" to expand search

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

### Adding New Features
1. Data changes → `src/api.js`
2. UI changes → relevant component
3. State/flow changes → `src/App.jsx`
4. AI prompt changes → `api/summarize.js`

---

## Backlog / Future Ideas
- Hero images from Valve CDN using hero key
- Team logos (no reliable free API — OpenDota has partial coverage)
- Role labels (Carry/Mid/Off/Support) — needs better detection logic
- PandaScore API as replacement for OpenDota match list (cleaner Tier 1 filtering)
- Mobile bottom sheet optimization
- Liquipedia integration for upcoming matches
- Expand beyond Dota 2 to other esports (CS2, LoL, Valorant)

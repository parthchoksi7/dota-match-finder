# Spectate Esports

Pro Dota 2 match viewer. Find recent results, watch VODs, see drafts, and get AI match summaries.

Live at: **https://spectateesports.live**

---

## What It Does

- Browse recent Tier 1 pro match results grouped into series (BO1/BO2/BO3/BO5)
- Watch VOD links timestamped to the exact game start via Twitch API
- View full draft (hero picks, bans, player names, KDA) from OpenDota
- Generate AI match summaries via Claude Haiku
- See live matches with series scores and per-game status
- Upcoming scheduled matches with local timezone display
- Tournament Hub with standings, bracket, schedule, and hero stats
- Follow teams to filter results and get calendar feeds
- Spoiler-free mode hides scores and winner info until you choose to reveal

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Deployment | Vercel (Hobby) |
| Match data | OpenDota API |
| Live/tournament data | PandaScore API |
| VOD search | Twitch Helix API |
| Cache | Upstash Redis (KV) |
| AI summaries | Anthropic Claude Haiku |
| Analytics | Vercel Analytics + GA4 + BigQuery |

## Project Structure

```
src/
  pages/          # Full-page views (App routes)
  components/     # Shared UI components
  api.js          # All client-side API calls
  utils.js        # Series grouping, follow teams, event tracking
api/              # Vercel serverless functions (12 max on Hobby plan)
  _shared.js      # Shared utilities (NOT deployed as a function)
public/           # Static assets
```

See [CONTEXT.md](./CONTEXT.md) for detailed architecture, feature descriptions, and known limitations.

## Local Development

```bash
npm install
npm run dev       # starts Vite dev server
```

Requires `.env.local` with:
- `VITE_TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `ANTHROPIC_API_KEY`
- `PANDASCORE_TOKEN`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## Deployment

Deployed automatically via Vercel on push to `main`. No manual steps required.

# Staleness Checklist

Tracks data in static files that can go out of date. Review these on the schedule below.

---

## Team Pages — `src/data/teams.js` + `middleware.js` (TIER1_TEAMS_SSR)

Both files must be kept in sync. `src/data/teams.js` is the source of truth; `TIER1_TEAMS_SSR` in `middleware.js` is a manually-maintained copy (edge middleware cannot import from src/).

Content source: Liquipedia (https://liquipedia.net/dota2/). Verify all TI facts against https://liquipedia.net/dota2/The_International before updating.

### Review annually (after each TI concludes, typically September/October)

- [ ] **`tiWins` arrays** — Add the new TI year to the winning organization. This is the most important update.
  - `src/data/teams.js` — add year to `tiWins` for the winning team
  - `middleware.js` — update same team's entry in `TIER1_TEAMS_SSR`
  - `public/llms.txt` — update Team Pages section (TI year in the team's line)
  - `public/llms-full.txt` — update team entry in Tier 1 Teams section AND TI Grand Finals list
  - `public/llms-full.txt` — add new Grand Final result to Historic Grand Finals section

### Review annually (start of each new competitive season)

- [ ] **Team list completeness** — Are all current Tier 1 organizations represented?
  - Rule: disbanded orgs stay in the list ONLY if they have TI wins. Otherwise remove.
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR), `api/sitemap.js` (TEAM_SLUGS), `public/llms.txt`, `public/llms-full.txt`

- [ ] **`about` and `shortDesc` text** — Is the editorial description still accurate?
  - Files affected: `src/data/teams.js`
  - Note: `middleware.js` TIER1_TEAMS_SSR only stores `shortDesc`. Update both if `shortDesc` changes.

- [ ] **`iconicPlayers` arrays** — Can be extended as new legendary players emerge. Never remove past icons.
  - Files affected: `src/data/teams.js` (middleware does not store iconicPlayers)

### Review on org-level events (as needed)

- [ ] **`disbanded: true` flag** — If an org's Dota 2 division disbands, set this flag. Keep the org only if they have TI wins; otherwise remove from the list.
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR)

- [ ] **`basedIn` field** — Has the organization moved or changed country of operation?
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR)

- [ ] **`liquipedia` URLs** — Has Liquipedia renamed the org's page? (Very rare.)
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR)

---

## Glossary Pages — `src/data/glossary.js` + `middleware.js` (GLOSSARY_TERMS_SSR)

Dota 2 game mechanics are relatively stable. Review when:
- Valve releases a major patch that fundamentally changes a mechanic (e.g., Roshan drop changes, BKB duration changes)
- A term's usage in the pro scene changes significantly

Terms most likely to need updates:
- `bkb` — duration has changed multiple times across patches
- `roshan` — drop items have changed across patches
- `buyback` — cost formula could change
- `bounty-rune` — spawn timing and value could change

Files affected: `src/data/glossary.js` and `middleware.js` (GLOSSARY_TERMS_SSR) — keep in sync.

---

## llms.txt and llms-full.txt — `public/`

- [ ] **Machine-Readable Endpoints section in llms.txt** — Add a line for every new API endpoint or mode.
- [ ] **Team TI records in llms.txt** — Update team blurbs after each TI.
- [ ] **Top Teams list in llms.txt** — Add/remove teams if the competitive landscape shifts significantly.
- [ ] **Historical tournament results in llms-full.txt** — Add each new TI Grand Final result to "Notable Historical Matches" section.

---

## What is SAFE (does not go stale)

These fields never need updating:
- `tiWins` entries for past years (historical, immutable)
- `basedIn` (very stable, only changes with major org restructuring)
- `liquipedia` URLs (Liquipedia rarely renames pages)
- Glossary definitions for fundamental game mechanics (draft, ancient, barracks, etc.)
- Historical match results (TI Grand Finals, etc.)
- API response schemas (only update when API actually changes)

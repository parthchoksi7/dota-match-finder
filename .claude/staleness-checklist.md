# Staleness Checklist

Tracks data in static files that can go out of date. Review these on the schedule below.

---

## Team Pages — `src/data/teams.js` + `middleware.js` (TIER1_TEAMS_SSR)

Both files must be kept in sync. `src/data/teams.js` is the source of truth; `TIER1_TEAMS_SSR` in `middleware.js` is a manually-maintained copy (edge middleware cannot import from src/).

### Review annually (after each TI concludes, typically September/October)

- [ ] **`tiWins` arrays** — Add the new TI year to any winning organization. This is the most important update.
  - `src/data/teams.js` — update `tiWins` array for the winning team
  - `middleware.js` — update the same team's entry in `TIER1_TEAMS_SSR`
  - `public/llms.txt` — update the team's entry in the Teams Pages section (add TI year to the blurb)
  - `public/llms-full.txt` — update the team's entry in Tier 1 Teams section

### Review annually (start of each new DPC/competitive season)

- [ ] **Team list completeness** — Are all current Tier 1 organizations represented? Remove orgs that have been consistently inactive for a full competitive year. Add new orgs if they've established themselves at Tier 1.
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR), `api/sitemap.js` (TEAM_SLUGS), `public/llms.txt`, `public/llms-full.txt`

- [ ] **`region` field** — Has any organization changed competitive region? (Very rare — teams almost never switch regions.)
  - Files affected: `src/data/teams.js`, `middleware.js` (TIER1_TEAMS_SSR)

- [ ] **`about` and `shortDesc` text** — Is the editorial description still accurate? Edit if the org's historical identity has materially changed (e.g., after a major rebrand or ownership change).
  - Files affected: `src/data/teams.js`
  - Note: `middleware.js` TIER1_TEAMS_SSR only stores `shortDesc`, not `about`. Update both if `shortDesc` changes.

### Review on org-level events (as needed)

- [ ] **`basedIn` field** — Has the organization moved or changed ownership to a different country?
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

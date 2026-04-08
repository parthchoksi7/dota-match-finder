# QA Process — Spectate Esports

This document describes how to test the app before releasing new features.

---

## Automated Tests

```bash
npm test                    # Run all tests once
npm test -- --watch         # Watch mode during development
npm test -- --coverage      # With coverage report
```

All tests must pass before pushing to production. The test suite covers:
- `__tests__/tier-filter.test.js` - Tier filtering: `isTier1` (PandaScore match objects, `league.tier === 's'` or `'a'`), `buildPremiumLeagueIds` (OpenDota `tier === 'premium'` or `'professional'` set), and `fetchByTiers` (verifies two separate fetch calls are made with individual filter values -- never comma-separated -- and that results are merged/deduplicated correctly)
- `__tests__/auto-tweet.test.js` - Auto-tweet cron: `winsNeeded`, `seriesComplete`, `seriesResult` (including BO2 draws)
- `__tests__/icsGenerator.test.js` — ICS calendar generation
- `src/__tests__/utils.test.js` — Frontend utils: `formatDuration`, `formatRelativeTime`, `getSeriesLabel`, `groupIntoSeries`, `isSeriesComplete`, `winsRequiredForSeries`, `getSeriesWins`, `trackEvent`
- `src/__tests__/my-teams.test.js` — My Teams follow/unfollow system
- `src/__tests__/grand-final-card.test.jsx` — Grand Final card highlighting
- `src/__tests__/calendar-subscribe-modal.test.jsx` — Calendar subscribe modal
- `src/__tests__/tournament-heroes.test.js` — Hero pick/ban stat helpers
- `src/__tests__/heroes-show-more.test.js` — Heroes show more/less toggle
- `src/__tests__/overview-tab.test.js` — TournamentHub Overview tab
- `src/__tests__/tournament-hub-pages.test.js` — Tournament Hub pages
- `src/__tests__/status-badge.test.jsx` — Status badge component

---

## Pre-Release Checklist

Run through this before every production deploy:

- [ ] `npm test` passes (all tests green)
- [ ] **Any new or changed API URL was manually hit against the real API** (or confirmed against official docs) before shipping. Mocked unit tests do not prove an endpoint accepts a given parameter -- a 400/404 from the real API only surfaces in production if this step is skipped. Specifically: if you add a new query parameter to a PandaScore URL, verify it works on that exact endpoint path (game-specific `/dota2/*` and generic `/tournaments?filter[videogame]=dota-2` behave differently).
- [ ] `ls api/*.js | wc -l` outputs 12 or fewer (Vercel function limit)
- [ ] All new user interactions have GA4 `trackEvent` calls — search for `onClick`, `onSubmit`, `onChange` in changed files
- [ ] `trackEvent` is imported from `../utils`, never defined locally in a component
- [ ] No new `.js` files added to `api/` without merging an existing one
- [ ] Read `DESIGN_GUIDELINES.md` if any UI was changed — verify colors, spacing, tab patterns
- [ ] `CONTEXT.md` updated with any new features or changed behavior
- [ ] `ReleaseNotesPage.jsx` updated with a new entry (date, tag, title, desc)
- [ ] If a new public route was added: add to `robots.txt` Allow list and `api/sitemap.js`

---

## Manual Test Scenarios

Run through these after any significant code change. Focus on the areas touched by the change.

### Core: Search and Match Feed

- [ ] Search a team name (e.g. "Team Liquid") — results filter correctly
- [ ] Search a tournament name (e.g. "ESL") — results filter
- [ ] Clear search with X button — all results return
- [ ] Search with no matching results — empty state shown, no crash
- [ ] Click "Load more matches" — new results append without losing search filter

### Core: Match Cards

- [ ] Expand a BO3 series (e.g. 2-1) — all 3 games shown, each has "Match Details" CTA
- [ ] Expand a 2-0 BO3 — Game 3 slot is hidden (not shown as "Not played")
- [ ] Expand a BO2 1-1 draw — both games shown, no "Game 3" slot
- [ ] Click "Match Details" on a game row — drawer opens with draft + VOD
- [ ] Follow a team (star icon) — team appears in My Teams section
- [ ] Unfollow a team — removed from My Teams section

### Core: Spoiler-Free Mode

- [ ] Toggle spoiler-free — series scores show "? - ?", winners hidden
- [ ] BO label (BO3/BO5) hidden in spoiler-free
- [ ] Game 3 slot in a 2-0 BO3 shows interactive placeholder (not hidden)
- [ ] Toggling off spoiler-free restores scores and results

### Tournament Hub

- [ ] Live tournament shows pulsing red dot
- [ ] Overview tab: format badge and date range visible
- [ ] Standings tab: W-L table renders with correct headers
- [ ] Schedule tab: bracket renders
- [ ] Stage picker in Standings/Schedule tab switches between Group A/B/Playoffs
- [ ] Heroes tab: pick/ban table loads (may take a few seconds)
- [ ] "Show all N heroes" button reveals full list

### Tournament Hub — No top stage switcher

- [ ] Confirm there are NO GROUP A / GROUP B tabs above the tournament card
- [ ] Stage switching only happens via the picker inside Standings/Schedule tabs

### BO2 Specific (critical edge cases)

- [ ] A completed BO2 1-1 draw appears in "Latest Results" (not filtered out)
- [ ] A 2-0 BO2 sweep appears in "Latest Results"
- [ ] BO2 series card shows "BO2" label (not "BO3")

### Auto-Tweet (owner only)

1. Manually trigger the GitHub Actions workflow: Actions tab → "Auto Tweet Dota 2 Results" → Run workflow
2. Check X (@SpectateDota2) within a few minutes for new tweets
3. Verify for a BO2 1-1 draw: series summary tweet posts with `"Team A 1-1 Team B"` as the first line
4. Verify no duplicate tweets for already-posted matches

---

## Before Releasing a Major Feature

For features that touch core match data, series grouping, or new API integrations:

1. **Write tests first** — add unit tests for any new pure functions before implementing
2. **Run the full test suite** — `npm test` must be green
3. **Test the critical edge cases above** manually
4. **Cache bust** any affected KV keys: e.g. `/api/live-matches?bust=1`, `/api/tournament-detail?id=X&bust=1`
5. **Check Vercel function logs** after deploy for any errors (KV failures, API errors, etc.)
6. **Verify GA events** in GA4 Realtime view by performing the action yourself

### Feature-specific extra checks

| Feature | Extra check |
|---|---|
| Series grouping changes | BO2 1-1 draw appears in Latest Results; midnight-spanning series not split |
| Tournament Hub changes | All 4 tabs render; stage picker works; no duplicate tabs |
| Auto-tweet changes | Manually trigger workflow; check @SpectateDota2 |
| Calendar changes | Subscribe URL generates; .ics downloads; events appear in calendar app |
| Search changes | Search and clear both work; query is tracked in GA4 |
| Tier filter changes | At least one known tier-S or tier-A event (e.g. DreamLeague, PGL, Premier Series, ESL Challenger) appears in live/upcoming/tournaments; a known non-pro event is absent; `/api/live-matches?bust=1` and `/api/tournaments?bust=1` return non-empty results. Any new `filter[param]=value` added to a PandaScore URL must be tested for multi-value support before using comma-separated syntax -- write a unit test that mocks `fetch` and asserts the URL contains the expected single-value parameter |

---

## Known Pre-existing Test Failures

`formatDateRange` tests in `src/__tests__/utils.test.js` are timezone-sensitive and may fail in some environments (the test uses UTC timestamps that resolve to Feb 28 instead of Mar 1 in certain timezones). These are not blocking.

# Pending Refactors

Tracked from the May 2026 deep code review. Completed items removed.

---

## Safe to do anytime (low blast radius)

### Extract `getSeriesLabel()` to `_shared.js`
- **Files:** `api/live-matches.js:25-31`, `api/upcoming-matches.js:17-24`, `api/_shared.js`
- **What:** Identical function defined in both files. Export from `_shared.js`, import in both.
- **Why deferred:** Touches `live-matches.js` which is on the hot path during live matches.
- **Effort:** Trivial | **Payoff:** Medium

### Extract KV singleton to `_shared.js`
- **Files:** All `api/*.js` files
- **What:** `new Redis({ url, token })` repeated in every serverless function. Export a shared `kv` instance from `_shared.js`.
- **Why deferred:** Wide blast radius (8+ files) even though the change is mechanical.
- **Effort:** Low | **Payoff:** Medium

### Add `STORAGE_KEYS` constant to `src/utils.js`
- **What:** All localStorage key strings (currently scattered inline across App.jsx, utils.js, SettingsSheet.jsx) collected into one exported object. Prevents silent typo-misses.
- **Effort:** Low | **Payoff:** Low-Medium

---

## Frontend refactors (no API impact)

### Extract `buildTournamentCards()` from HomeFeed
- **File:** `src/components/HomeFeed.jsx:150-222`
- **What:** The 70-line `tournamentCards` useMemo (live/upcoming/completed merging + sort) is untested business logic. Extract to a pure function in `src/utils.js` and cover with Vitest.
- **Effort:** Low | **Payoff:** Medium (testability)

### Extract `resolveMatchStreams()` from `handleSelectMatch`
- **File:** `src/App.jsx:386-428`
- **What:** The stream + VOD resolution logic inside `handleSelectMatch` is coupled to React state and untestable. Extract the data-fetching portion as a standalone async function.
- **Effort:** Low | **Payoff:** Medium (testability, readability)

---

## Medium-effort, high-payoff

### App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.
- **Effort:** Medium | **Payoff:** High (prevents impossible states, reduces reset-on-entry boilerplate)

---

## Security (schedule separately)

### Move Twitch client secret server-side
- **File:** `src/api.js:186` - `VITE_TWITCH_CLIENT_SECRET` is compiled into the browser bundle via `import.meta.env`; the secret is visible in the built JS
- **What:** Create `api/twitch-token.js` (replacing a lower-value existing function to stay within the 12-function limit, or using `_shared.js`). Move `getTwitchToken()` server-side. Frontend calls `/api/twitch-token` instead of Twitch directly. Remove `VITE_TWITCH_CLIENT_SECRET` from the client build; keep only `TWITCH_CLIENT_SECRET` as a server-only env var.
- Note: `api/twitch-token.js` does NOT currently exist — this refactor is not started.
- **Effort:** Low-Medium | **Payoff:** Critical (credential security)

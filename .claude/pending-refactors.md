# Pending Refactors

Tracked from the May 2026 deep code review. Completed items removed.

---

## Safe to do anytime (low blast radius)

### Sync `findLeague` test copy with production implementation
- **File:** `src/__tests__/tournament-heroes.test.js:14`
- **What:** The test file mirrors `findLeague` verbatim but its `tokens` helper uses `t.length > 1` without the `|| /^\d+$/.test(t)` guard that was added to the real API to preserve single-digit season numbers ("8"). Single-digit season tests would silently pass against the old logic.
- **Fix:** Update the test copy's `tokens` function to match `api/tournament-heroes.js:21` exactly, then add a test case for a single-digit season (e.g. "ESL One Season 8").
- **Effort:** Trivial | **Payoff:** Medium (test fidelity)



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


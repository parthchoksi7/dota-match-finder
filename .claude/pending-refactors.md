# Pending Refactors

Tracked from the May 2026 deep code review. Completed items removed.

---

## Safe to do anytime (low blast radius)

~~### Sync `findLeague` test copy with production implementation~~ ✅ Done
~~### Remove dead `rawUrl` fallback in LiveMatchRow~~ ✅ Done
~~### Extract `getSeriesLabel()` to `_shared.js`~~ ✅ Done

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

## Blocked on external dependency

### WhatsApp Channel auto-posting
- **Spec:** Full product spec exists in conversation history (May 2026)
- **Blocker:** Meta has no public API for posting to WhatsApp Channels (the public broadcast/Updates feature) as of May 2026. The WhatsApp Business Cloud API only covers 1:1 and template-based messaging.
- **When to revisit:** When Meta opens a Channel posting API. Monitor Meta's WhatsApp Business Platform changelog.
- **What's ready to drop in:** Caption generation (`buildWaCaption()`), image pipeline (reuses `api/og.js?mode=series`), indicator aggregation — all covered by the X auto-tweet infrastructure. The only missing piece is the actual `sendWhatsAppChannelMessage()` call.
- **Channel URL:** https://whatsapp.com/channel/0029VbD1pLaEawdlikSoLf0t

---

## API performance / correctness

### Fix tournament-heroes timeout for large tournaments
- **File:** `api/tournament-heroes.js:102-113`
- **What:** The endpoint fetches individual match details in sequential batches of 10 (up to 200 games). For DreamLeague S29 (169 games), this requires 17 batches × ~3-5s each = 50-85s total, which exceeds Vercel's function timeout (~10-30s). The first cold call returns empty JSON (truncated), so the KV cache is never populated.
- **Fix options:** (1) Add a wall-clock budget — stop fetching new batches if elapsed > 8s and return partial results; or (2) reduce max games to 50 (enough for hero stats quality); or (3) add a separate warm-cache endpoint that populates lazily in the background.
- **Discovered:** May 2026 via verify-prod od-consistency check on DreamLeague Season 29 Playoffs.
- **Effort:** Low | **Payoff:** High (Heroes tab broken for large tournaments)

---

## Medium-effort, high-payoff

### App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.
- **Effort:** Medium | **Payoff:** High (prevents impossible states, reduces reset-on-entry boilerplate)

---


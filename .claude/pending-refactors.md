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

---

## Blocked on external dependency

### WhatsApp Channel auto-posting
- **Spec:** Full product spec exists in conversation history (May 2026)
- **Blocker:** Meta has no public API for posting to WhatsApp Channels (the public broadcast/Updates feature) as of May 2026. The WhatsApp Business Cloud API only covers 1:1 and template-based messaging.
- **When to revisit:** When Meta opens a Channel posting API. Monitor Meta's WhatsApp Business Platform changelog.
- **What's ready to drop in:** Caption generation (`buildWaCaption()`), image pipeline (reuses `api/og.js?mode=series`), indicator aggregation — all covered by the X auto-tweet infrastructure. The only missing piece is the actual `sendWhatsAppChannelMessage()` call.
- **Channel URL:** https://whatsapp.com/channel/0029VbD1pLaEawdlikSoLf0t

---

## Medium-effort, high-payoff

### App.jsx state machine for async clusters
- **File:** `src/App.jsx:134-194`
- **What:** Replace the 5-state summary cluster (`summary`, `summaryMatchId`, `summaryError`, `summaryErrorMatchId`, `summaryLoading`) with a `useReducer`. Same for xPosts and redditPosts clusters.
- Start with the xPosts cluster (fully self-contained, no external callers) as a pilot.
- **Effort:** Medium | **Payoff:** High (prevents impossible states, reduces reset-on-entry boilerplate)

---


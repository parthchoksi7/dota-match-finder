# Feature Spec — "Has VOD" search filter

Backlog item: `pending-refactors.md` #16 ("Has VOD" filter, RICE 1.2).
Written 2026-07-29. Spec-before-code per `CLAUDE.md`.

# Feature Summary

A toggle chip in the search results filter row that narrows results to games with a confirmed,
watchable replay link. Sits alongside — not inside — the existing All/BO1/BO3/BO5 series-type
filter, because "has a VOD" is orthogonal to "how long was the series."

# User Problem

Search today answers "did these teams play?" It does not answer **"can I watch it?"** — the only
way to find out is to open each result's drawer one at a time and wait for the replay resolver.
For a fan who missed a series and wants to actually watch something, that's a linear scan through
results, most of which may be dead ends: VODs get deleted, muted, or were never captured at all
(YouTube-only broadcasts are structurally uncapturable — the VOD system is Twitch-anchored).

The user's intent when searching an old series is overwhelmingly *watch it*, not *read the score*.
This filter turns a browse-and-hope loop into one click.

# Product Goals

- **User:** get from "I missed that series" to "I'm watching it" without opening dead ends.
- **Business:** replay click-through is the highest-intent action on the site. Surfacing only
  watchable games should lift replay CTR on searched (as opposed to feed) sessions.
- **Secondary:** makes the VOD archive's real depth legible. We have permanent Supabase VOD rows;
  nothing in the product currently communicates that coverage exists.

# User Personas Affected

- **The catch-up fan (primary).** Missed a series in their timezone, wants the replay. Highest
  value: this is their entire workflow.
- **The archive browser.** Looking for a specific historic game (a famous comeback, a hero pick).
  Wants to skip anything unwatchable.
- **The live viewer.** Unaffected — live/upcoming games have no VOD by definition and are excluded
  when the filter is on.

# Detailed Requirements

**R1.** A `Has VOD` toggle chip renders in the search filter row, visually separated from the
series-type group (which stays single-select).

**R2.** The chip is a **toggle**, independent of the series-type filter. `Has VOD` + `BO3`
composes to "BO3 games with a replay."

**R3.** When ON, results are narrowed to games whose `od_match_id` has a confirmed replay in
`match_stream_history`, using the **existing canonical predicate** —
`!!twitch_vod_id || vod_available === true` (`buildReplayResponse` in
`api/pipeline/_vod-urls.js:185`). Do not invent a second definition of "has a VOD."

**R4.** Unplayed (upcoming/live) games are excluded whenever the filter is ON. A game with no
result cannot have a replay, so leaving them in would be noise.

**R5.** VOD status is fetched **lazily** — on first toggle-ON, not on every search. Most sessions
never touch this filter; making every search pay a round trip for it is the wrong trade.

**R6.** Status is cached client-side for the session, keyed by `od_match_id`, so re-toggling and
subsequent searches are instant and never re-request an id already known.

**R7.** While the first fetch is in flight the chip shows a spinner and is disabled. Results do
not change until status arrives (no flash of a wrongly-empty list).

**R8.** On fetch failure the chip reverts to OFF and results are left unfiltered — the honest
degradation is "filter unavailable," never "silently show fewer results than exist."

# UX / UI Considerations

- **States:** off (ghost chip) / on (filled, matching the active series-chip treatment) /
  loading (spinner, disabled) / unavailable-after-error (reverts to off).
- **Empty state:** if the filter yields zero of N results, say so and offer to clear it — a bare
  empty list reads as "search is broken" rather than "no replays for this query."
- **Placement:** same row as the series filter, after a separator, so the orthogonality is
  visible. Reuse the existing chip classes exactly; do not introduce a new chip style.
- **Purple is correct here** and is the one place this feature may use it: `DESIGN_GUIDELINES.md`
  reserves purple for watch/VOD actions, and this chip gates precisely that.
- **Touch target:** the existing chips are `px-3 py-1.5`; keep parity (this row is an established
  exception to the 44px floor already shipped).
- **Mobile:** the row already `flex-wrap`s; one more chip wraps cleanly at 375px.

# Technical Considerations

**The load-bearing constraint:** live VOD resolution (`resolveMatchStreams` → `match-streams.js`
→ Twitch Helix) is **per-match, multi-step, and LOCKED**
(`.claude/claude_instructions_template.md` §"VOD Replay System"). Resolving status for a whole
result set through that chain would mean 2N API calls per search against a rate-limited
third party, on the exact path that has broken three times.

**Therefore this feature must never call the live resolver.** It reads the *persisted* state
instead: `match_stream_history` already stores `twitch_vod_id`, `vod_offset_s`, and
`vod_available` per `od_match_id`, written by the `vod-enrich` cron. One indexed
`WHERE od_match_id IN (...)` covers an entire result set in a single query — no KV, no Helix, no
change to cache keys, TTLs, lookup order, or channel resolution.

**New endpoint mode:** `GET /api/pipeline?type=replay-status&ids=1,2,3`
→ `{ available: [<od_match_id>, ...] }`. Public and cacheable, mirroring the existing
`?type=replay` read-side handler. Returns only the ids that HAVE a replay; absence means
"no replay or not yet enriched," which the client treats identically (both are unwatchable now).

- Cap `ids` per request (200) and validate each as a numeric id — reuse `validateId`-style
  digit checking; reject the whole request on malformed input rather than silently dropping ids.
- `Cache-Control: s-maxage=300, stale-while-revalidate=86400` — VOD status is near-immutable once
  resolved, and a pending row becoming available within 5 minutes is not a real user need.
- No new Vercel function (added as a mode on the existing `pipeline.js` router; the function
  count is CI-guarded at 12).

**Client:** a new `fetchReplayStatus(ids)` in `src/api.js`. This does **not** touch
`findTwitchVod` / `fetchMatchStreams` / `resolveMatchStreams` — the locked functions in that file
are untouched; this is a new sibling on a different endpoint.

# Data Requirements

| Need | Source | Freshness |
|---|---|---|
| Per-game VOD presence | `match_stream_history.twitch_vod_id` / `vod_available` | Written by `vod-enrich` cron; permanent once resolved |
| Game identity | `od_match_id` = the client's `match.id` | Already the join key everywhere |

**Reliability:** `vod_available = null` means "unknown / not yet checked" — treated as NO for
filtering (we only promise confirmed replays). `false` means deleted/muted/never-captured and is
also NO. Only `twitch_vod_id` non-null or `vod_available === true` is YES.

**Known coverage gap (accepted, not a bug):** YouTube-only broadcasts can never have a Twitch VOD,
so they are permanently absent from filtered results. This is a property of the capture system,
not of this filter.

# Edge Cases

1. **Zero results after filtering** → explicit empty state + clear-filter affordance (R-UX).
2. **Fetch fails / 500** → chip reverts OFF, results unfiltered, no error modal (R8).
3. **Unplayed games in the result set** → excluded when ON (R4).
4. **Result set grows** via "Load more" while filter is ON → newly loaded ids have unknown status;
   fetch status for just the new ids (the cache makes this a delta request, not a refetch).
5. **Search changes while a status fetch is in flight** → the response must be merged into the
   id-keyed cache, not applied as "the current result set's status," so a late response for an
   old query can't mis-filter a new one.
6. **`ids` list exceeds the cap** → client chunks; server rejects over-cap requests.
7. **A game whose row exists but has no `ps_match_id`** → irrelevant here; we key on
   `od_match_id` only.
8. **Not-yet-enriched recent series** → correctly excluded (no confirmed VOD *yet*). The 5-min
   s-maxage means it appears within minutes of enrichment.
9. **Series split across `od_match_id`s** → filtering is per-game, which is the right grain:
   `MatchList` groups the surviving games into series itself.
10. **Duplicate ids in the request** → dedupe client-side before sending.

# Analytics & Tracking

- `vod_filter_toggle` — `{ on: bool, resultsBefore, resultsAfter, query }`. The
  before/after pair is the actual signal: it measures how much of the archive is watchable for
  real queries.
- `vod_filter_empty` — fired when the filter yields zero results; a rising rate means a coverage
  problem, not a UI problem.
- **KPIs:** replay CTR on filtered vs unfiltered search sessions (primary); filter adoption rate;
  `vod_filter_empty` rate as a VOD-coverage health metric.

# QA Scenarios

| # | Scenario | Expected |
|---|---|---|
| 1 | Search a team, toggle ON | Spinner, then only games with confirmed replays |
| 2 | Toggle ON then OFF | Original result set restored, no refetch |
| 3 | `Has VOD` + `BO3` | Intersection of both |
| 4 | Query with no replays at all | Empty state with clear-filter affordance |
| 5 | Endpoint returns 500 | Chip reverts OFF, results unfiltered, no crash |
| 6 | Toggle ON, immediately change query | No mis-filtering from the stale response |
| 7 | Load more with filter ON | Only new ids requested; existing status reused |
| 8 | Upcoming-only search (e.g. future fixtures) | Empty when ON |
| 9 | 375px viewport | Chip row wraps, targets tappable |
| 10 | Light + dark | Chip legible in both states in both themes |

# Risks & Dependencies

- **Risk (low):** depends on `vod-enrich` cron health. If enrichment stalls, the filter
  under-reports. Mitigation: `vod_filter_empty` doubles as an enrichment-health signal.
- **Risk (very low):** none of the locked VOD chain is modified — this is an additive read on a
  different endpoint against an existing table. No cache key, TTL, or lookup-order change.
- **Dependency:** `match_stream_history` (exists), `vod-enrich` (running).

# MVP Recommendation

Everything above except the analytics dashboarding. Ship the chip, the endpoint, the lazy fetch,
the empty state, and both events.

# Future Enhancements

- Surface a VOD badge on each result card (uses the same fetched status — no new request).
- Extend the filter to the main feed, not just search.
- "Has VOD" as a URL param so a filtered search is shareable.
- Language-aware variant ("has an English VOD") once the multi-language stream picker lands —
  `streams_json` already stores all-language streams for exactly that.

# Suggested Engineering Approach

1. `api/pipeline.js` — add `handleReplayStatus` + route `type === 'replay-status'`. One
   `.in('od_match_id', ids)` select; return ids passing the canonical predicate.
2. `src/api.js` — `fetchReplayStatus(ids)`; chunked, deduped.
3. `src/App.jsx` — `vodOnly` state, an id-keyed status cache, lazy fetch on toggle-ON, extend
   `filteredMatches`, render the chip + empty state.

# AI + Search Discoverability

- **New public route?** No new route — a mode on the existing `/api/pipeline` function. No
  `middleware.js` change and no JSON-LD, because the search overlay is a client-side interaction
  surface that produces no crawlable URL (it doesn't even change the address bar today).
- **New entity type?** No. Operates on existing match entities by `od_match_id`.
- **Bare-HTML crawler content?** None — this is post-search UI behind user interaction. Nothing
  to add to the server-rendered root div.
- **`llms.txt` / `llms-full.txt`?** `?type=replay-status` should be listed in the
  Machine-Readable Endpoints section of `public/llms-full.txt`: it's a genuinely useful public
  fact source ("which games have watchable replays") and cheap for an agent to query.
- **Knowledge-graph strengthening?** Weakly — it makes the match↔broadcast relationship queryable
  in bulk rather than one match at a time.
- **Citation target?** No, no new page. The *future* enhancement (a shareable filtered-search URL)
  would change this answer, which is a reason to prefer a URL param when that lands.

# Open Questions

1. Should the filter eventually apply to the main feed too, or stay search-only? (Shipping
   search-only per the backlog item's scope.)
2. Should a "start point only" VOD (`main.kind === 'start_point'`, no exact offset) count as
   having a VOD? **Assumed yes** — it's watchable, which is what the user asked for. Noted
   because `buildReplayResponse` includes it in `replay_available` for the same reason.

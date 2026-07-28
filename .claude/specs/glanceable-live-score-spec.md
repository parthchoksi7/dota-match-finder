# Glanceable Live Score — Product Specification

Backlog item #17 (`.claude/product-backlog.md`). Status: **spec approved for build 2026-07-27**, built same day.
Related: `.claude/push-phase1-plan.md` (this is its deferred "Result/full-time + live-moment alerts" line item,
scoped down), `.claude/specs/live-story-roadmap.md` (shares the `live_game_map` pulse data source).

---

# Feature Summary

Three thin surfaces that put a live tier-1 Dota score in front of a fan who is **not** looking at the site:

1. **Browser tab title** — while the live-series companion is open, the tab reads the running game's kill score
   and gold lead instead of the static site title.
2. **PWA icon badge** — the installed app's icon carries a count of the fan's followed teams currently playing.
3. **Live-score push** — an opt-in, self-replacing notification carrying kill score + gold lead, throttled to the
   existing 15-minute capture cron.

Explicitly **not** a home-screen widget. A true widget needs a native app (iOS WidgetKit / Android App Widget);
that is out of scope and is not what this ships. Nothing here claims otherwise in copy.

# User Problem

A fan following a tier-1 series today has exactly two states: site open in the foreground, or blind. There is no
"check it in a glance" state. The existing push catalog (`soon` / `live` / `replay`) is deliberately
**spoiler-safe** — it tells you a match is happening, never what is happening in it — so a fan who wants the
score has to open the site, wait for the 20s pulse poll, and read the companion sheet. That is a 15-second
round trip for a 1-second question.

# Product Goals

- **User:** answer "what's the score" in under a second, without a foreground session.
- **Business:** retention + return-visit frequency during live windows. The push is a re-entry point with a real
  deep link (`?live=<seriesId>`) into the companion sheet, not a bare homepage bounce.

# User Personas Affected

- **Hardcore fan at work / multitasking** (primary) — has the site pinned in a background tab, or the PWA
  installed. Both new surfaces target exactly this person.
- **Followed-team fan** — the badge and the push are gated on `followedTeams`; a fan with zero follows sees
  neither, by design.
- **Spoiler-free fan** — must be *actively protected*: this is the first feature in the product that puts a live
  result into a surface the fan didn't ask to look at. See "Spoiler contract" below.
- **Casual / discovery visitor** — unaffected. No new UI in the feed, no new route.

# Detailed Requirements

## R1 — Tab title (`document.title`)

- Active **only** while `SeriesLivePulse` is mounted, i.e. the live-series companion is open on the running
  game. Closing the sheet, switching to a finished-game tab, or unmounting restores the original title exactly.
- Format (truncation-first ordering — a browser tab shows ~12–18 chars):
  `{killA}-{killB} {ShortA} v {ShortB} · {Leader} +{gold}`
  e.g. `24-19 Tundra v BetBoom · Tundra +2.4k`
  - **Kill score leads** so it survives truncation to `24-19 Tundr…`.
  - The first score belongs to the first-listed name — the ordering is the attribution, so a truncated title is
    never ambiguous about whose number is whose.
  - Gold lead is last: losing it to truncation loses precision, never meaning.
  - Team names are shortened (`Tundra Esports` → `Tundra`, `Team Falcons` → `Falcons`) — org boilerplate is
    pure noise at this character budget.
- Degrades in order: no gold lead → drop the suffix; no kill score → title untouched (never a fabricated `0-0`,
  same rule as `SeriesGameScore`); spoiler-free → title untouched.
- Radiant/Dire naming comes from the pulse (`radiantName`/`direName`), not the series header — sides swap
  between games, and the score is per-side.

## R2 — PWA icon badge (Badging API)

- `navigator.setAppBadge(n)` where `n` = number of **live series involving a followed team**.
- `n === 0` → `navigator.clearAppBadge()`. Zero follows → never badged.
- Recomputed on every ambient live poll (2 min) and on any follow change.
- Feature-detected; wrapped in try/catch. A browser without the API, or an uninstalled tab where the call is a
  no-op, must never throw or log noise.
- Cleared on unmount so a client-side route change out of the homepage doesn't strand a badge.

## R3 — Live-score push (`type: 'score'`)

| Field | Value |
|---|---|
| Trigger | `cron=1` (`*/15`, QStash) — already fetches running tier-1 matches; **no new schedule, no new endpoint** |
| Opt-in | `prefs.types.score`, **default OFF** (the only type that defaults off) |
| Gate | game time ≥ 5 min, kill score present, and state changed since the last ping for this series |
| Throttle | `push:sent:score:{seriesId}:{userId}`, 14-min TTL — a cooldown, not a one-shot dedup |
| Tag | `score-{seriesId}` — constant per series, so each ping **replaces** the previous one |
| Sound | `silent: true` — an updating score is ambient, not an interrupt |
| Copy | title `Tundra 24-19 BetBoom`, body `Game 2 · BO3 1-0 · Tundra +2.4k · 32 min` |
| Destination | `/?live=<seriesId>&from=push&pt=score` → opens the live companion sheet directly |

The self-replacing tag is what makes this read as a glanceable widget rather than spam: a fan sees **one**
notification per series that keeps updating in place, not a stack of six.

## Spoiler contract

The existing rule in `buildPushPayload` — *never include a series score or winner in the title/body* — is not
being relaxed. It still holds for `soon`, `live`, and `replay`, and the tests that enforce it stay.

`score` is carved out explicitly and narrowly:
- It is the **only** type that defaults OFF. A fan gets scores pushed only after flipping a toggle whose label
  says "Live score" and whose sublabel says it carries the kill score and gold lead.
- The settings row shows an explicit warning when spoiler-free mode is on in that browser, because the two
  settings genuinely contradict each other and the fan should see that at the moment of choosing.
- The tab title respects spoiler-free unconditionally (no opt-in, no override) — it's a passive surface the fan
  never consented to.
- The badge is a **count**, not a result, so spoiler-free does not suppress it.

# UX / UI Considerations

- **No new in-app UI** except one toggle row inside the existing "Customize alerts" panel
  (`PushNotificationSettings`) — reuses the nested-settings-row pattern already documented in
  `DESIGN_GUIDELINES.md`. Nothing is added to the feed, the header, or the sheet.
- **Mobile reality check:** mobile Safari and Chrome Android do not render `document.title` in a visible tab
  strip, and an installed PWA has no title bar. R1 is therefore a desktop-browser / desktop-PWA feature. R2 and
  R3 are where mobile gets value. This is a platform constraint, not a gap to design around — do not add a
  fake in-page "title bar" to compensate.
- **Empty/loading:** the title only changes once a real pulse lands; there is no "loading" title state. Same for
  the badge (no badge until live data has arrived).

# Technical Considerations

- **No new serverless function.** The 12/12 Vercel Hobby limit is untouched: the score ping rides the existing
  `cron=1` branch of `api/live-matches.js`, and prefs ride the existing `mode=push-subscribe` merge.
- **No new QStash schedule.** Budget stays at 864/day of 1,000 across 5 of 10 schedules.
- **No new data fetch on the hot path.** `cron=1` already holds the PandaScore running-match array. The pulse
  read is **one** Supabase query for the whole batch (union time window over `live_game_map`), then per-match
  correlation through the canonical `findOdMatchByTime` — never a per-match query, and never a new PS fetch.
- **Reuse, don't reimplement.** PS↔OD correlation uses `findOdMatchByTime` + `shapeLiveGameMapRows` +
  `OD_MATCH_TIME_WINDOW_S` from the shared modules (the standing rule after the PS↔OD duplication incident).
  Gold formatting is one function shared by the server copy builder and the client tab title.
- **VOD lock respected.** Nothing here touches `cacheRunningStreams`, `stream:match:*`, `stream:ts:*`,
  `twitch:*`, `findTwitchVod`, or `resolveMatchStreams`. The score ping is an additive read + send that runs
  *after* `cacheRunningStreams` in the same handler.
- **Freshness of the pulse.** `live_game_map` is refreshed by `od-live-capture` — client-driven every ~2 min
  whenever anyone has the site open, `*/15` QStash backstop otherwise. At a 15-min ping cadence the data is at
  worst one capture cycle stale, which the body's game-clock makes self-evident.

# Data Requirements

| Field | Source | Freshness | Failure mode |
|---|---|---|---|
| `radiantScore` / `direScore` (kills) | `live_game_map` via OD `/live` | ~60–120s | null → no ping, no title |
| `radiantLead` (net worth) | same | same | null → ping/title without the gold clause |
| `gameTime` | same | same | null → treated as ineligible (can't verify the 5-min floor) |
| `radiantName` / `direName` | same | same | falls back to `Radiant`/`Dire` |
| series score / format / game no. | PandaScore running match (already in hand) | 15 min | omitted from the body |

# Edge Cases

- **Game ends between capture and ping** — the pulse still reads the last captured state; the ping is a
  snapshot, and the game clock in the body makes its age legible. The 14-min cooldown bounds repetition.
- **Between games of a BO3/BO5** — no running game resolves → no pulse → no ping and no title change (the
  previous title/notification simply stops updating rather than showing a finished game's numbers as live).
- **Series ends entirely** — the series leaves `matches/running`; no further pings. The final ping is not a
  result announcement, by design — `replay` covers the end-of-series moment, spoiler-safely.
- **Paused game / long technical break** — kill score and lead stop changing → the change-gate suppresses the
  ping. This is the gate's main real-world job.
- **PS↔OD correlation misses** (name divergence, capture gap) → no pulse → no ping. Never a guessed score.
- **Two live games in one window with similar start times** → `findOdMatchByTime` disambiguates on team names;
  an unresolvable pair stays unresolved rather than risking the wrong score in a notification.
- **Fan follows both teams in the same series** → the subscriber set is a `Set`, so one ping, not two.
- **Multi-tab** — every open tab writes the same title from the same pulse; the badge is process-global and
  idempotent, so concurrent writers converge on the same count.
- **Stale badge across sessions** — if the last tab closes mid-match, the badge persists until the app next
  runs. Known and accepted: the alternative (clearing on `visibilitychange`) would defeat the entire point of a
  glanceable badge. Documented in `CONTEXT.md` under Known Issues.
- **Spoiler-free fan enables score alerts** — allowed (explicit opt-in beats implicit preference) but warned in
  the settings row.
- **iOS not installed** — push already handled by the existing `needsIOSInstall()` gate; the score toggle sits
  inside the granted-state panel, so it is unreachable until push actually works.
- **Subscription expired (410/404)** — pruned by the existing shared `dispatchPush` path; no new handling.

# Analytics & Tracking

| Event | Where | Params |
|---|---|---|
| `push_sent` | server, existing | `type: 'score'`, `count` |
| `push_opened` | client, existing | `type: 'score'`, `matchId` (now falls back to the `?live=` id) |
| `push_prefs_type_toggle` | client, existing | `type: 'score'`, `enabled` |
| `live_tab_title_active` | client, **new** | fired once per opened series that gets a title |
| `pwa_badge_set` | client, **new** | `count` — fired only on transitions, never per poll |

KPIs: score-alert opt-in rate among granted subscribers; `score` CTR (opens ÷ sends) vs the other three types;
whether score-alert subscribers unsubscribe at a higher rate (the guardrail — if they do, the cadence is wrong).

# QA Scenarios

1. Open the companion on a running game → tab title shows score; close → original title restored exactly.
2. Same, with spoiler-free on → title never changes.
3. Follow a team that is live → installed PWA icon badges `1`; unfollow → clears.
4. Enable score alerts, wait one cron tick on a live followed series → exactly one notification; wait another →
   it **replaces** the first rather than stacking.
5. Tap a score notification → lands on the homepage with the live companion sheet open for that series.
6. Score alerts off (default) → no score notification ever, while `soon`/`live`/`replay` still fire.
7. Regression: the three existing push types still carry no score or winner (existing tests must stay green).
8. 375px mobile: nothing visual changed; the settings panel still fits with the extra toggle row.

# Risks & Dependencies

- **Notification fatigue** is the real risk, not the technology. Mitigated by: default OFF, 15-min floor,
  change-gate, self-replacing tag, silent delivery, and quiet hours (inherited).
- **`cron=1` duration.** The handler already carries a `maxDuration: 30` stopgap. The score path adds one
  Supabase query plus a per-subscriber loop that reuses the existing batched `kv.mget` fan-out. Low but non-zero;
  worth watching alongside pending-refactor #8.
- **Badging API stale state** across sessions (above).
- No new third-party dependency, no new env var, no schema change.

# MVP Recommendation

All three ship together — they are one feature from the fan's point of view, and two of the three are near-zero
cost. Ship with score alerts default OFF and watch the opt-in rate before considering any cadence change.

# Future Enhancements

- Cadence presets for score alerts (every game / big swings only).
- Fire on **notable moments** rather than the clock (Roshan, 10k swing, mega creeps) once a live event feed
  exists — today OD `/live` carries no event stream.
- Badge as unread-moments count rather than live-match count.
- A real native widget, if a native app ever exists.

# Suggested Engineering Approach

- New pure module `src/utils/liveScore.js` — no React, no browser-only imports, so **both** the client and
  `api/live-matches.js` import it (the same cross-boundary pattern as `src/seriesLogic.js`).
  Owns: `shortTeamName`, `formatGoldMagnitude` (moved here from `SeriesLivePulse.jsx`, re-exported there so
  existing imports/tests are unaffected), `formatLiveScoreTitle`, `countFollowedLive`, `scoreSignature`,
  `shouldSendScorePing`.
- `SeriesLivePulse.jsx`: a colocated `useLiveTabTitle` effect, called before the existing early return.
- `App.jsx`: one effect on `[liveMatches, followedTeams]` for the badge.
- `api/live-matches.js`: `normalizePrefs` gains `score` (default off); `buildPushPayload` gains a `score` case
  driven by `opts.pulse`; `dispatchPush` gains `payloadOpts`; a new `resolveLiveScores()` does the single
  batched Supabase read; `cron=1` calls it after `cacheRunningStreams`.
- `src/sw.js`: honour `data.silent`; keep `tag` collapsing as-is.
- `PushNotificationSettings.jsx`: one more row in the existing type-toggle list + the spoiler-free note.

# AI + Search Discoverability

- **New public route?** No. No route, no page, no crawlable surface.
- **New entity type?** No.
- **New API endpoint or mode?** No — the score ping rides the existing `cron=1` (authenticated, `Disallow`-ed
  by nature) and the existing `mode=push-subscribe`. Nothing to add to the Machine-Readable Endpoints list.
- **Bare-HTML crawler impact?** None. `document.title` is mutated client-side only, after hydration; crawlers
  and the `middleware.js` SSR path never see it. The static `<title>` in `index.html` is unchanged, so the
  indexed title for `/` is unaffected.
- **`llms.txt` / `llms-full.txt`?** No change required.
- **Knowledge-graph strengthening?** None — this is ephemeral live state, the opposite of a citation target.

# Open Questions

1. Is 15 min the right score-ping cadence, or should it move to `push-scan` (`*/3`) for a tighter loop once
   opt-in data exists? **Deferred** — start slow, loosen with evidence.
2. Should the badge count live matches or "moments you missed"? Deferred to the future-enhancement list.
3. Should a score push suppress itself while the fan demonstrably has the series open in a foreground tab?
   Technically possible via the SW's `clients.matchAll()`. **Deferred** — worth doing if CTR data suggests
   redundant pings, not before.

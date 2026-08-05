# UX Spec — Live/Completed Sheet Parity + Live Story Event Ticker

**Date:** 2026-08-05
**Baseline:** `MatchDrawer.jsx` is fixed and unchanged, as in the 2026-07-30 and 2026-07-31 passes.
**Surfaces:** `LiveSeriesSheet.jsx`, `SeriesLivePulse.jsx`, new `LiveStoryFeed` (proposed)
**Read against:** all three files in full, `DESIGN_GUIDELINES.md`, `.claude/specs/live-story-product-spec.md`

---

# Problem Framing

The request is "match the live sheet to the completed sheet." Reading both files end to end, that framing is **half right and half misleading**, and the misleading half matters more.

**The half that's right:** there are real, unclosed parity gaps, and they're smaller and more specific than a redesign. Enumerated in Information Hierarchy below — the short version is that two live sections ship with no section label at all while every single MatchDrawer section has one, the live Draft isn't collapsible while the completed Draft is, the live scroll container is missing `overscroll-y-contain`, and "Live" is stamped twice on the same screen.

**The half that's misleading, and the actual finding of this review:** the live sheet's biggest UX problem isn't that it looks different from `MatchDrawer` — it's that **it is about to display two different clocks as if they were one.** Everything currently on the live surface (score, net-worth lead, gold graph, tower minimap) is at OpenDota `/live` time. Live Story is deliberately delayed by the tournament's `stream_delay_s`, which the investigation observed at **both 120s and 900s in a single poll**. Put a 15-minutes-behind event ticker directly underneath a not-behind score of 24–19 at minute 32, and the fan doesn't read "spoiler-safe design" — they read "this site's data is broken." Worse, `project_live_telemetry_inventory` records that OD's own `delay` field may already put the site *ahead* of the broadcast, so the true gap between the two halves of this one screen is unquantified in both directions.

**Second finding, also absent from all three planning docs:** the tower minimap (`DotaMinimap`, public since 2026-07-31) and Live Story's `TowerDestroyed` events are **two independent decodes of two different providers' tower bitmasks**, rendered adjacent on the same screen. `DotaMinimap` reads OpenDota's `building_state` via `api/_buildingState.js`; Live Story reads Valve's `tower_state`/`barracks_state` from `GetLiveLeagueGames`, whose bit layout is the still-open E12 unknown. These will disagree — not hypothetically, but as a routine consequence of two providers sampling at different times through different pipelines. Two adjacent widgets contradicting each other about whether a tower is standing is a worse trust outcome than either one being absent.

**Third finding, a spec contradiction to resolve before any UI work:** the investigation doc's risk T3 says "never ship `uncertain` events." The product spec says `TowerDestroyed` stays `uncertain` in the UI until E12 is verified. Both cannot hold. Taken together they mean **the MVP ticker has three event types, not four, until E12 closes** — Roshan, kills, items. That is a scope fact the UI should be built around rather than discovered during implementation.

So the reframed job: **converge the two sheets on the specific points where they've drifted, and introduce Live Story in a way that makes its delay legible instead of confusing — because an event ticker whose relationship to the rest of the screen is ambiguous is worse than no ticker.**

---

# Viewer Psychology

The fan on this surface at 11pm has a stream in another tab or on another device. They are not reading — they are **checking**. Their session is 4 seconds long and repeats every few minutes. Three emotional facts drive every decision below:

- **They fear being spoiled and they fear being behind, simultaneously.** These pull in opposite directions and the product cannot resolve them for the fan — it can only be *legible* about which one it's optimizing for at any moment. An unlabeled delay is the failure mode: the fan can't tell whether they're seeing the present or the past, so they trust neither.
- **They are pattern-matching, not reading.** A ticker row's shape must carry its meaning before the text is parsed. This is why Roshan needs a different silhouette, not just different words.
- **A single wrong call costs more than ten right ones earn.** The product spec already says this about trust in every other number on the page. The UI consequence: **hedged and confident content must never share a visual treatment**, and anything the system isn't sure about should be absent rather than qualified — a fan skimming at speed will not read a qualifier.

---

# UX Goals

Ranked. Failure conditions stated, because they're the useful half.

1. **The fan always knows which clock they're looking at.** *Failure:* a fan sees a Roshan event and can't tell whether it just happened or happened 15 minutes ago, and stops trusting the ticker.
2. **Nothing on this screen contradicts anything else on this screen.** *Failure:* the minimap shows a tower standing while the ticker says it fell.
3. **Roshan is identifiable without reading.** *Failure:* the single highest-arousal event in Dota renders as the fifth identical gray row.
4. **The two sheets stop drifting.** *Failure:* a third visual language emerges, and the next consistency pass has three surfaces to reconcile instead of two.
5. **Spoiler-free fans see exactly what they see today.** *Failure:* a new section leaks state past the existing reveal gate.
6. **The ticker never pushes the Watch CTA below the fold on 375px.** *Failure:* a fan who opened the sheet to find the stream has to scroll past an event log to get to it — the companion failing its primary job in service of its secondary one.

---

# Information Hierarchy

## Current state, both sheets, as actually built

| Order | `MatchDrawer` (baseline) | `LiveSeriesSheet` + `SeriesLivePulse` |
|---|---|---|
| Header | tournament / date · duration / `Game N of M` pill / 🏆 | tournament / seriesLabel / **Live pill** / 🏆 |
| Switcher | `GameSwitcher`, bordered row | `GameSwitcher`, bordered row ✓ |
| — | — | **`G{n}` + second "Live" chip row** ← duplicate |
| 1 | Names + `TeamIndicators` + stars | **Stakes chip + momentum band** ← no baseline analog |
| 2 | Score + first-blood/Roshan facts | Names + stars *(no indicators — no live data, correct)* |
| 3 | **Watch Full Match Replay** | Score + net-worth/clock facts |
| 4 | **Draft** — collapsible, chevron, `aria-expanded` | **Watch Live** ✓ |
| 5 | Gold Advantage — labeled `<h3>` | Tower minimap — **no label** |
| 6 | Player Stats — labeled `<h3>` | Gold graph — **no label** |
| 7 | AI Summary — labeled | Draft — labeled, **not collapsible** |

## Concrete divergences to close (each is small and independently shippable)

1. **Two sections ship with no label.** `DotaMinimap` and `LiveGoldGraph` render bare between border-t dividers. Every `MatchDrawer` section is labeled. Add `Objectives` and `Net Worth` as `text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500` — the exact treatment `MatchDrawer` uses for Gold Advantage and Player Stats. This is the single highest scan-speed win in the whole parity list and costs two lines.
2. **Live Draft isn't collapsible.** `MatchDrawer`'s is (`draftExpanded`, chevron, `min-h-[44px]`, `aria-expanded`). Ten `DraftPickRow`s at `py-1.5` is the tallest block on the live surface, and Live Story is about to sit above it. Port the collapsible pattern verbatim — same chevron, same aria. Default expanded, matching the baseline.
3. **Missing `overscroll-y-contain`.** `MatchDrawer`'s scroll body is `overflow-y-auto overflow-x-hidden overscroll-y-contain`; `LiveSeriesSheet`'s is bare `overflow-y-auto py-2`. On iOS this lets an over-scroll chain to the page behind the sheet. A real behavioral difference, not cosmetic — and it will get worse the moment the ticker makes this container taller.
4. **"Live" appears twice** — a pill in the sheet header (`LiveSeriesSheet:166`) and again in the `G{n}` row (`:316`). `MatchDrawer` states game identity once. Keep the header pill (it describes the series), reduce the `G{n}` row to the game number alone.
5. **Body padding differs:** `MatchDrawer` `py-5`, `SeriesLivePulse` `py-3` inside a `py-2` parent plus a `py-3 pb-0` chip row. The compounding produces a visibly different top rhythm on the same sheet host. Normalize to the baseline's `py-5` at the scroll-body level and let the chip row own its own spacing.
6. **Known, already-documented orientation gap** (`LiveSeriesSheet:148-156`): a spoiler-free fan viewing a *finished* game's summary card sees no team names anywhere on screen — the header deliberately dropped them, and the card hides the winner pre-reveal. The in-code comment flags this as accepted-and-noted. It should be fixed in this pass, not carried further: show both team names neutrally (`TEAM A vs TEAM B`, no winner styling) in that card. Team names are established as non-spoiler content by `MatchDrawer`'s own contract.

## Where Live Story goes, and why not anywhere else

**After Watch Live, before the tower minimap.** Reasoning, in order of weight:

- **Not above Watch Live.** On 375px the fan who opened this sheet to find a stream must not scroll past an event log to reach it (UX Goal 6). The watch CTA is the site's core job; the ticker is the enhancement.
- **Not below the gold graph.** Buried past two visualizations, it stops functioning as a glance surface.
- **Directly above minimap + graph is the one placement that's semantically earned:** ticker says *what happened*, minimap says *where it happened*, gold graph says *what it cost*. Read top to bottom, that's a coherent causal sequence rather than three unrelated widgets — and it's the "causal layer under the gold graph" the product spec describes, expressed as layout.

## Within the ticker

Newest first. A "what just happened" surface that requires scrolling to the bottom to find the newest thing has failed its own premise. This deliberately opposes the left-to-right time axis of the gold graph directly below it, which is why **every row carries an explicit game-time stamp** — the stamp is what lets the two coexist without the fan having to hold a mental model of which direction time runs in each.

Cap at **6 rows** with a "Show all" affordance. A 60-minute game generates 100+ events; an uncapped list makes the sheet unscrollable and turns every poll into a large DOM update.

---

# Interaction Model

**Entry:** unchanged — fan taps a live match row with ≥1 finished game, `LiveSeriesSheet` opens on the running game (`App.jsx` → `handleSelectLiveMatch`). Live Story appears inline; no new entry point, no new navigation depth, no new route.

**States, in the order a fan encounters them:**

1. **Pre-first-event** (game just started, or all events still inside the delay window) — section renders with its label and a single line of copy. Not a spinner: nothing is loading, the system is deliberately waiting. Copy: `Following the broadcast · events appear ~2 min behind`, with the real `stream_delay_s` substituted. This turns the constraint into a stated promise, which is the honest framing and also the more reassuring one.
2. **Streaming** — rows accumulate newest-first, capped at 6.
3. **Tap "Show all"** — expands in place to the full list. No modal, no navigation. Collapsible back.
4. **Spoiler-free, unrevealed** — the entire section is absent, exactly like the score, minimap, and gold graph are today (`showLiveStory` gate). See State Handling for why this is *not* the same as the delay-pending state.
5. **Exit:** unchanged — ✕ or backdrop, `?live=` cleared by `closeLiveSeriesSheet`.

**No hover-dependent affordances anywhere.** Confidence, event type, and timing must all be legible on a touchscreen with no pointer. This rules out the tooltip pattern that would otherwise be the obvious home for confidence explanations — `InfoButton` (already used in `MatchDrawer`'s watch section) is acceptable for a *one-time* explanation of what confidence means, but must never be the only carrier of a per-row confidence signal.

**Tap targets:** the "Show all" toggle and the collapsible Draft header both get `min-h-[44px]`, matching `MatchDrawer`'s draft toggle. **Event rows are not interactive at MVP** — there is nothing to navigate to, and a row that looks tappable but isn't is worse than a plainly static one.

---

# Mobile Experience (375px first)

The live sheet is already the taller of the two surfaces and Live Story adds to it. Vertical budget is the binding constraint, so the mobile spec is mostly about what *doesn't* grow:

- **Ticker section at 6 rows ≈ 200px.** Each row is a single line: `[glyph] [text] [time]`, `py-1.5`, no wrapping, no avatars at MVP. A two-line row would double the section's height for no scan-speed gain.
- **The collapsible Draft (parity item 2) pays for the ticker.** Ten `DraftPickRow`s at ~44px each is ~440px; making it collapsible gives a fan who cares about events more than about the draft a way to compress the sheet. This is why the two changes ship together rather than the ticker alone.
- **Thumb zone:** the ticker sits mid-sheet, above the fold-and-a-half — reachable by scroll, and its only interactive element ("Show all") is a full-width row rather than a small target.
- **Text sizes:** row text at `text-xs`, timestamp at `text-[10px] tabular-nums`. Tabular is mandatory — a column of game times that shifts horizontally as digits change is exactly the kind of micro-noise that makes a live surface feel unstable.
- **At 11pm with a stream running:** the fan's actual interaction is *scroll to ticker, read top row, leave*. Everything above optimizes for that one motion.

---

# Desktop Enhancements

Deliberately minimal — this is a mobile-shaped surface that happens to render on desktop, and the sheet width doesn't change enough to justify a different layout.

- Row cap rises from 6 to 10 (vertical budget is not scarce).
- `sm:` type bump on row text matching the names row's existing `text-base sm:text-lg` pattern — but only if the ticker's own density survives it; if rows start feeling loose, keep `text-xs` at all breakpoints.
- No hover states beyond the standard `focus-ring` on the one interactive control. No keyboard shortcuts — this is a passive surface, and a shortcut for a read-only list is decoration.

---

# Visual System Decisions

## Why confidence cannot be a color, derived rather than asserted

`DESIGN_GUIDELINES.md` reserves purple for watch/VOD actions only and yellow for followed/favorited only. Red is live states and critical CTAs. That leaves green and amber — and **green/red are already fully spoken for on this exact surface as side attribution**: `DraftPickRow` tints green for Radiant and red for Dire, `leadColor` is green when Radiant leads and red when Dire leads, `momentum.leadColor` follows the same rule, and `GoldGraph`'s markers do too. A green "confident" badge sitting inside a ticker where green means Radiant would be actively misread.

**Therefore confidence is encoded in text presence and weight, never hue:**

- **`exact`** — normal row. No marker at all. Confidence is the default; marking it would train the fan to look for a badge that's on 90% of rows.
- **`inferred`** — the same row with a `~` prefix glyph and the qualified portion (usually the team or killer name) rendered in `text-gray-400 dark:text-gray-600` rather than full-strength. The *fact* stays confident; only the *attribution* dims. This directly matches the product spec's Roshan model: the kill is `exact`, the team is `inferred`.
- **`uncertain`** — **not rendered.** Per investigation risk T3. This is a data-layer contract, not a visual treatment.

One `InfoButton` in the section header explains the `~` once, using the existing floating-tooltip pattern from `MatchDrawer`'s watch section. It is supplementary; the visual weight difference carries the meaning without it.

## Roshan priority — amber, and why that's the system-consistent choice rather than a special case

Amber in this codebase already means *this carries stakes*: the stakes chip (`bg-amber-500/10 text-amber-600 dark:text-amber-400`), the Grand Final trophy, the elevated-importance treatments throughout. Roshan is the highest-stakes objective in Dota. So the Roshan row uses **the existing stakes-chip treatment**, not a new color: amber text, `bg-amber-500/10` row background, full-width. It gets a distinct silhouette from a filled row background where every other row is transparent — visible peripherally, before any text is read (UX Goal 3), using zero new system vocabulary.

## Teamfight grouping

Near-simultaneous kills collapse into one row: `⚔ 3 kills · 24:10–24:22`. The count is the primary signal — three-in-twelve-seconds is the "something happened" moment; three separate identical rows is noise that pushes the previous real event off the visible cap. Grouping is a display-layer concern only, no new derivation, exactly as the product spec scoped it.

## Everything else

Type sizes, spacing, and section-label treatment are the existing `MatchDrawer` values with no deviations. **One system-level inconsistency found in the baseline itself, flagged rather than propagated:** `MatchDrawer` labels Watch and AI Summary at `text-xs` but Draft, Gold Advantage, and Player Stats at `text-[10px]`. Live Story is a data section, so it takes `text-[10px]` — matching the majority and the semantically closest siblings. Worth a future cleanup pass on the baseline; not this spec's job to fix unilaterally.

**No new `DESIGN_GUIDELINES.md` pattern is required.** Every treatment above is an existing one applied to a new section — which is the point of a parity spec.

---

# State Handling

| State | Behavior |
|---|---|
| **Loading** | No spinner. The section only exists once the poll has returned; before that it is absent, matching how `SeriesLivePulse` returns early on `!pulse` today. |
| **Skeleton** | None. Skeletons imply imminent content; on a game 90 seconds in there may genuinely be no events for minutes. A skeleton here would be a lie about latency. |
| **Empty — no events yet** | `No events yet` + the delay promise line. |
| **Empty — events exist but all inside delay window** | Same line. **Deliberately indistinguishable from the above**, because distinguishing them would leak that something happened — which is precisely what the delay gate exists to prevent. This is a subtle and load-bearing decision. |
| **Delayed / stale** | Section header carries the live delay: `LIVE STORY · 2 MIN BEHIND`. **On tournaments reporting `stream_delay_s ≥ 600`, do not render the ticker at all** — a 15-minute-stale event list next to a not-stale score is a trust liability, not a feature. This is a hard recommendation and the direct answer to the two-clocks problem. |
| **Spoiler-free, unrevealed** | Entire section absent, riding the existing `showLiveStory` (`!hideScore`) gate. No separate toggle, no separate reveal button — the existing "Reveal score" control governs it, per the product spec. |
| **Error** | Section absent. Never an error row. `SeriesLivePulse` already swallows poll failures silently (`.catch(() => {})`) and retains last-known-good via `nextPulseState` — Live Story adopts identical semantics. The rest of the sheet must be unaffected, per the product spec's fail-open-to-absent rule. |
| **Partial data** | A match whose team-name correlation failed has no events. Renders as the empty state, not an error — the fan cannot distinguish "quiet game" from "correlation missed," and shouldn't have to. |
| **Reconnect** | Retain-last-known-good bounded by the existing `STALE_AFTER_MS` (90s) precedent. Beyond that the ticker clears rather than showing events that may belong to a finished game. |
| **Offline / PWA** | Workbox `NetworkFirst` on `/api/*` may serve a cached response. **Live Story rows must never render from a stale cached payload** — an event list is far more spoiler-dangerous when time-shifted than a score is. Gate rendering on payload freshness explicitly. |
| **Game transition mid-view** | `useLayoutEffect` clears `pulse` on `psMatchId` change (`SeriesLivePulse:208`) specifically to prevent a cross-series flash. Live Story state must clear in the same effect, or a previous game's events will render under the new game's header for one paint. |

---

# Performance Considerations

- **No new network cost on the client.** Events ride the existing pulse payload; the read path is a KV-cached snapshot, not a per-client Steam call.
- **DOM cost is the real risk and the 6-row cap is the mitigation.** Uncapped, a 60-minute game accumulates 100+ rows re-rendered on every poll inside a sheet that's already re-rendering names, score, minimap, graph, and ten draft rows.
- **Keys must be stable** — `(od_match_id, game_time, event_type, seq)`, the natural key the schema already defines. Index-based keys will cause full-list re-mounts every poll as newest-first insertion shifts every index.
- **No entry animation on new rows.** `DESIGN_GUIDELINES.md`'s motion section is deliberately restrictive; a ticker that animates on a 40s poll produces a jarring bulk-insert of several rows at once rather than the smooth trickle the animation implies. Static insertion reads as more trustworthy, not less polished.
- **Perceived latency:** the delay label is the strategy. A fan who knows the feed is 2 minutes behind experiences a 2-minute-old event as correct; the same event unlabeled is experienced as broken.

---

# Accessibility Considerations

- **`aria-live` is a trap here and must be scoped narrowly.** A polite live region on the list itself will announce every row of a bulk insert — potentially six events at once, mid-sentence, every 40 seconds. Instead: `aria-live="off"` on the list, and a single visually-hidden polite region announcing only a summary (`3 new events`) on change. The existing `aria-live="polite"` usage on the loading indicator (`LiveSeriesSheet:286`) is the right scale precedent.
- **The `~` inferred marker needs a text equivalent** — `aria-label` on the row spelling out "attribution uncertain." A glyph that carries meaning visually must carry it non-visually too.
- **Roshan's amber row must not rely on color alone** (WCAG 1.4.1). It carries a distinct leading glyph and an explicit "Roshan" word — the amber is reinforcement, never the sole signal.
- **Contrast:** the `inferred` dimming uses `text-gray-400 dark:text-gray-600` — already in system use for de-emphasized metadata, and above 4.5:1 against both surfaces. Do not dim further.
- **Reduced motion:** nothing new animates, so nothing new needs a `prefers-reduced-motion` branch. The existing `animate-pulse` live dots are unchanged.
- **Keyboard:** the two interactive controls (Show all, Draft collapse) get `focus-ring` and standard button semantics. Rows are static and take no tab stop.

---

# Edge Cases

1. **`stream_delay_s` changes mid-series** (observed range 120s–900s, and it's a per-tournament organizer setting). If it rises past the 600s threshold mid-match, the ticker must disappear cleanly rather than freezing on stale rows.
2. **Ticker and minimap disagree about a tower.** The structural finding from Problem Framing. Until E12 closes, `TowerDestroyed` is `uncertain` and therefore unrendered — which incidentally makes this collision impossible at MVP. **When E12 closes and towers ship, this must be re-examined**, not assumed solved. The clean long-term answer is to source the minimap from the same Valve bitmask so there's one decode instead of two — noted as a data change, out of scope here.
3. **A pause.** `scoreboard.duration` freezes or goes backwards. The ticker must not emit, and must not show a "waiting" state distinguishable from the normal empty state.
4. **Two live matches in two tabs.** Events must be strictly `od_match_id`-scoped at the query layer, not filtered in the UI — a UI-layer filter is one prop-threading mistake away from cross-match leakage.
5. **The 900s-delay case with spoiler-free OFF.** The fan has explicitly opted into seeing everything, and still gets a 15-minute-old ticker beside a current score. The `≥600s` suppression rule applies regardless of spoiler preference — this is a correctness decision, not a preference.
6. **Game ends while the sheet is open.** `LiveSeriesSheet` never auto-closes on series disappearance (shows last-known state). The ticker must follow the same rule and must not keep polling for a game that ended.
7. **Sheet-host content swap.** `App.jsx` hosts one persistent `<Sheet>` cross-fading between `LiveSeriesSheet` and `MatchDrawer`. A taller live sheet means a scroll position that may not exist in the drawer being swapped to — verify scroll resets rather than clamping oddly.

---

# Risks

- **Load-bearing assumption: fans will read a delay label.** If they don't, the two-clocks problem persists in a milder form. The `≥600s` suppression rule is the backstop that keeps the worst case out of the product entirely — it is the single most important line in this spec and the one most likely to be argued away as over-conservative during implementation.
- **Load-bearing assumption: `inferred` dimming reads as a hedge, not as a rendering bug.** A dimmed team name could plausibly be read as "still loading." Worth explicitly checking during owner validation; if it reads as loading, fall back to an explicit "likely" word rather than adding color.
- **Vertical budget.** If the collapsible Draft (parity item 2) doesn't ship alongside the ticker, the live sheet becomes materially longer than the completed sheet — moving *away* from parity while nominally pursuing it. These two changes are coupled and should not be split across releases.
- **Redesign trigger:** if teamfight grouping later needs per-row hero icons (it plausibly will — icons are how Dota fans identify a fight), the single-line row shape is wrong and the ticker needs a two-line variant. Designing the row as a flex container with a reserved leading slot now makes that additive rather than a rewrite.

---

# Future Evolution

- **The completed-sheet counterpart is the real prize.** If `MatchDrawer` grows a "how this game was won" section from OpenDota's post-game `objectives[]`, live and completed become **the same component in two time states** — which is the strongest possible answer to the parity request, and the growth doc's Stage 3 citation surface. **Build the row component source-agnostic now** (it renders an event shape, not a `GetLiveLeagueGames` shape) so that section is a data swap, not a second component.
- **Teamfight clustering** as real derivation (not just display grouping) slots into the same rows with no layout change.
- **`TeamIndicators` on the live names row** — the live surface omits them because there's no live rapier/rampage data. A validated event stream could eventually supply live equivalents, closing the last structural difference in the names row.
- **Do not build now:** tappable rows, VOD deep-links from events, per-event share, hero position rendering. Each adds interaction surface to a passive glance component before there's any evidence fans want to act on a row rather than read it.

---

# Implementation Handoff

**Reused / extended:**
- `SeriesLivePulse.jsx` — new section between Watch Live and the minimap; new `LiveStoryFeed` child. Draft block gains `MatchDrawer`'s collapsible pattern. Clear ticker state in the existing `useLayoutEffect` on `psMatchId`.
- `LiveSeriesSheet.jsx` — add `overscroll-y-contain`; drop the duplicate Live chip from the `G{n}` row; normalize body padding; fix the spoiler-free finished-game team-name gap flagged at `:148-156`.
- `MatchDrawer.jsx` — **unchanged.** Fixed baseline.
- New `LiveStoryFeed.jsx` — presentational, source-agnostic event rows.

**Patterns applied (`DESIGN_GUIDELINES.md`):** section labels (Gold Advantage / Player Stats treatment); collapsible section (`MatchDrawer` Draft); stakes-chip amber for Roshan; empty states; floating tooltip via `InfoButton`; motion restrictions.

**Data:** the read `?mode=` added to `api/tournaments.js` per the product spec, delivering pre-gated events (server-side spoiler gate — never client-only) plus the effective `stream_delay_s` the header label and the `≥600s` suppression both depend on.

**New guidelines entry:** one — *Live Story event row* (row anatomy, the `~` inferred convention, the Roshan amber treatment, the newest-first + cap rule). Everything else reuses existing patterns.

**Ship order, because the coupling matters:** (1) parity fixes 1–6, independently valuable and shippable before TI; (2) collapsible Draft; (3) ticker. Never (3) before (2).

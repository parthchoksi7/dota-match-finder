# Growth / SEO / GEO Guidelines — Live Story Event Feed

**Grounded against:** `.claude/specs/live-story-product-spec.md`, `.claude/ai_discoverability.md`, `public/llms.txt`/`public/llms-full.txt`, `COMPETITIVE_RESEARCH.md`
**Date:** 2026-08-05
**Scope of this doc:** discoverability and positioning guidance only, staged to the rollout the product spec already defines (owner-gated MVP → validated public). Does not relitigate product scope.

---

# Objective

Turn Live Story from an internal-only companion feature into the thing that eventually gets SpectateEsports cited by name — by Google, and by an LLM answering "what happened in [Team A] vs [Team B]" — without indexing anything before it's actually true, since a wrong "exact" tower call cited by an AI system is a worse outcome than one shown to zero users.

---

# Audience

This is not a general-SEO question yet. At MVP (owner-gated), the only audience is the owner. The discoverability question that matters right now is: **what should NOT happen yet**, and **what's the trigger condition for what happens next.** That's the actual ask, and it's a staging question, not a keyword question.

---

# Growth Opportunity

**None of Strafe, rdy.gg, STRATZ, or BLAST.tv show *why* a live score is what it is.** Per `COMPETITIVE_RESEARCH.md`, every one of them shows live scores; none show a causal event layer. STRATZ is the closest analog (best-in-class stats, AI predictions) and even it has no live event feed — `project_stratz_api_access` already confirms STRATZ's own live-query path is dead. This means Live Story, once public, is not fighting for a keyword an incumbent already owns — nobody currently owns "what just happened in [live Dota match]" as a search or citation surface, because nobody currently has the data to answer it truthfully in real time. That's the opportunity: **first-mover on a genuinely new answerable-query category**, not incremental share of an existing one.

The catch, and it's a real one: this opportunity is **worthless until the data is trustworthy**, because the query category it opens ("what happened at minute 23 of Team Spirit vs Falcons") is exactly the kind of factual, checkable claim that destroys citation trust the first time it's wrong. GEO doesn't reward "first to publish" here — it rewards "first to be reliably right," and being cited once with a wrong tower call (from the still-open E12 bitmask decode) is worse than not being cited at all. This reorders the usual growth instinct ("ship it public, index it, let traffic find it") — the discoverability move here is patience, not speed.

---

# Strategic Rationale

- **Live, ephemeral event data is a bad citation target by nature — the durable asset is the derived summary, not the ticker.** An LLM or search crawler indexing a live page that says "Tower destroyed at 14:32" has indexed something true for a few minutes and stale forever after. The actual GEO-valuable artifact this feature can eventually produce is a **post-match derived narrative** ("How Team Spirit's mid-game Roshan control decided this series") built from the same event stream after the match ends — durable, evergreen-ish, and exactly the kind of factual, structured, citable content `ai_discoverability.md`'s Objective 6 asks for ("design pages... to become canonical sources... over time"). That's a Future Enhancement in the product spec, not MVP, and it's the actual SEO/GEO payoff — the live ticker itself is not the asset, it's the raw material for one.
- **Owner-gating today is a discoverability decision too, not just a QA one.** `middleware.js` SSR and JSON-LD must always reflect ground truth per the existing Spoiler-Free Mode crawler invariant ("spoiler-free is a client-only display preference... SSR HTML and JSON-LD always contain real scores"). The same principle extends here: if this were public and SSR'd before E12 is resolved, a crawler or LLM could ingest an `uncertain`-confidence tower event as fact, because crawlers don't see confidence labels the way a human glancing at the UI does. **Do not SSR or JSON-LD any Live Story event data until its confidence is `exact` and validated** — this is stricter than the existing spoiler invariant, not a relaxation of it.

---

# Recommended Approach — staged by the product spec's own rollout gates

## Stage 1 — Owner-gated MVP (now, per product spec)
**Discoverability action: none.** No route change, no `llms.txt` entry, no sitemap entry, no schema. This already matches the product spec's own AI + Search Discoverability section ("No new public route at MVP... nothing changes for bare-HTML crawlers"). Confirming that call is correct — don't add anything here, including a "coming soon" mention, since that would create a citation-worthy claim about a feature that doesn't verifiably work yet.

## Stage 2 — Public graduation (post E3/E12/E13 validation, per product spec's MVP Recommendation)
Even once the live ticker is public and rendered client-side inside `LiveSeriesSheet`, **do not add it to `llms.txt`/`llms-full.txt` or give it its own JSON-LD yet.** It's still transient, still inside an existing sheet with no dedicated URL (per CONTEXT.md, "live series have no dedicated URL like completed matches"), and still a client-polled surface with no SSR path. This stage is a UI/product graduation, not an SEO one. The one action worth taking here: **add one line to `public/llms.txt`'s Home entry** noting that live matches now show event-level detail (towers/kills/Roshan), the same way the existing Home entry already describes what auto-updates — a factual, low-risk addition since it describes a real, validated, live capability, not a promise.

## Stage 3 — The actual GEO payoff: post-match derived narrative (Future Enhancement territory)
This is where real `llms.txt`/schema/sitemap work belongs, and only once the event stream has a real accuracy track record (the product spec's own graduation gate). Concretely, once a completed match has a durable narrative artifact built from its Live Story event log:
- **New entity relationship, not a new entity type.** This is match-level detail, so it attaches to the existing match/series entities already in the knowledge graph (per `ai_discoverability.md` Objective 5's players→teams→tournaments→matches chain) rather than requiring a new schema.org type. If/when `MatchDrawer` grows a "how this game was won" section built from Live Story data (the natural product extension the UX-parity work already points toward), that section is the SSR-visible, citable content — add it to the match page's existing JSON-LD (`SportsEvent`) as descriptive text, not a new node type.
- **Sitemap:** no new URLs needed — this rides existing `/match/:matchId` and `/tournament/:seriesId` pages, which are already in the sitemap.
- **`llms-full.txt`:** add a new capability description once this ships — "match pages include a derived event narrative (key towers, kills, Roshan control) for Tier 1 matches captured live since [date]" — framed as a fact about coverage depth, matching how the existing entries describe VOD timestamping and AI summaries.

---

# Content Ideas
*(Deferred — this is a data/product feature, not a content calendar item. The one genuine content angle: once Stage 3 narratives exist, they're a natural input to the existing editorial pipeline's match-recap content — feed the derived narrative as a fact-source to editorial, don't have editorial write it manually. Not urgent; flag for `/editorial` when Stage 3 is real.)*

---

# Distribution Plan
*(Not applicable at MVP — owner-gated, no audience to distribute to. Revisit at Stage 3, where a "we now show why the score is what it is" positioning post is genuinely differentiated and X/Reddit-worthy — but only after real accuracy data exists to back the claim.)*

---

# SEO / GEO Opportunities

- **The category ("what happened in [live match]") is currently unowned** — see Growth Opportunity above. This is the headline opportunity, gated entirely on accuracy, not on any technical SEO work.
- **Do not create a new page or route for the live ticker itself.** It has no independent search intent worth a dedicated URL — nobody searches for a ticker, they search for or ask about a specific match, which already has (or will have, at Stage 3) a canonical URL.
- **The confidence-labeling requirement in the product spec is a GEO requirement too, not just a UX one.** An LLM extracting "facts" from a page can't distinguish a hedge from a claim unless the page's structure makes the distinction explicit (e.g., never emit `uncertain` events into any server-rendered or JSON-LD content — client-only UI is the only place ambiguity is acceptable). This is the single highest-leverage GEO instruction in this whole document: **confidence-gate the crawler layer at least as strictly as the spoiler layer already is.**

---

# Community Strategy
*(Not applicable at MVP. At Stage 3, this is a legitimate Reddit/X talking point — "we added a live event log, here's what it can and can't see (6-slot item limit, no runes/wards)" is exactly the kind of transparent, non-promotional post the Reddit Philosophy calls for: useful and honest about limitations, not a sales pitch.)*

---

# Growth Loops
*(Deferred to Stage 3.) The plausible loop once the derived narrative exists: fan reads a match's "how it was won" summary → clicks through to the live game happening now with the same surface active → follows the team → returns during the next live window because they now expect the causal layer to be there. This loop depends entirely on the event data being trustworthy enough that the causal layer becomes an expectation, not a novelty — which is why Stage 3 cannot be rushed ahead of the accuracy gate.)*

---

# Experiments
- **Not an SEO/content experiment at this stage.** The actual experiment that determines whether any of the above is worth building further is already specified in the product doc's Analytics & Tracking section: does session dwell time on `LiveSeriesSheet` increase for matches with ≥1 Live Story event shown vs. none. If that number doesn't move, the GEO/Stage-3 investment isn't worth making regardless of how clean the citation opportunity looks on paper.

---

# Metrics
- Stage 1/2: none SEO-relevant (owner-gated / no dedicated URL).
- Stage 3 trigger metric: Live Story event accuracy rate (E3's "zero false positives on towers and kills" target) sustained across a real tournament window — this is the actual gate for any `llms.txt`/schema work, not a traffic or ranking metric.
- Once Stage 3 ships: standard citation/AI-referral tracking already in place sitewide (GA4 referral source segmentation) — no new tracking infrastructure needed, this rides the existing pipeline.

---

# Risks

- **Citing wrong facts to an LLM is a trust risk that compounds sitewide**, not just for this feature — the product spec already makes this point about in-app trust (a wrong inferred event costs trust in every other number on the page); the GEO-specific version of that risk is worse, because an LLM citation is stickier and less correctable than a UI bug — once "SpectateEsports said X happened and it didn't" propagates into a model's retrieved context or a cached answer, there's no in-app fix for it. This is the single reason to hold every discoverability action behind the accuracy gate, harder than the product team might otherwise want to.
- **Premature `llms.txt` entries describing an owner-gated feature** would itself be a minor factual-accuracy problem (claiming public capability that doesn't exist for real users) — small risk, but avoidable entirely by following the staging above.

---

# Priority Ranking

1. **Do nothing to `llms.txt`/sitemap/schema at Stage 1 or 2** (highest priority action is inaction — get this explicitly signed off so nobody adds a premature entry during implementation).
2. **Confidence-gate the crawler/JSON-LD layer** whenever this does become SSR-visible, at Stage 3 — the one concrete technical requirement worth locking in now, even though Stage 3 is far off, because it should shape how the eventual `MatchDrawer` narrative feature is built from day one.
3. **Stage 3 (derived post-match narrative) is the real SEO/GEO project** — flag it now as the follow-on this feature sets up, so it's on the roadmap as a distinct future item rather than assumed to be "the same feature, just public."

---

# Next Actions

1. No engineering or content action needed right now — this doc's job is to prevent premature discoverability work, not commission any.
2. Add a one-line note to `.claude/pending-refactors.md` or the product spec's Future Enhancements: "Stage 3 (post-match derived event narrative) is the actual SEO/GEO payoff of Live Story — revisit `/growth` once event accuracy is validated across a real tournament."
3. Revisit this document once E3/E12/E13 close and public graduation is scheduled — Stage 2's one-line `llms.txt` addition is the only action to take at that point.

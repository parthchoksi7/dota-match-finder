# AI + Search Discoverability — Mandatory for All Features

This is a standing requirement for every feature, page, API, component, or data model added to SpectateEsports. It applies to new work AND modifications to existing code.

---

## The Core Mandate

For every implementation, optimize for:
- **Traditional search engines** (Google, Bing)
- **AI retrieval systems** (ChatGPT, Claude, Gemini, Perplexity, Grok, future LLMs)
- **Knowledge graph formation** (entity relationships, structured data, semantic clarity)
- **Long-term canonical authority** in the Dota 2 / esports domain

This is NOT just SEO. Think: "Would an LLM understand this correctly? Could this page become a citation source?"

---

## The 10 Objectives (Apply to Every Feature)

1. Make the feature understandable by humans, search engines, and LLMs.
2. Make the semantic meaning explicit and machine-readable (structured data).
3. Ensure important content is crawlable without relying heavily on client-side JavaScript.
4. Maximize the probability that AI systems can: retrieve, summarize, cite, and understand relationships between entities.
5. Strengthen SpectateEsports as a long-term knowledge graph connecting players → teams → tournaments → matches → heroes → statistics → broadcasts → organizations.
6. Design pages and data structures to become canonical sources of esports information over time.
7. Optimize for future AI ecosystems, not just current SEO best practices.
8. Prefer architectures that improve: semantic clarity, structured understanding, retrieval quality, citation likelihood, canonical authority, discoverability, performance, and accessibility.
9. Think from the perspective of: Google indexing, OpenAI retrieval, Anthropic/Claude retrieval, Perplexity citation, vector embedding pipelines, and future autonomous AI agents.
10. Before finalizing any feature, evaluate:
    - Would an LLM understand this correctly?
    - Could this page become a citation source?
    - Is the entity relationship structure obvious?
    - Is the content useful in a retrieval pipeline?
    - Does this strengthen long-term authority and discoverability?

---

## Implementation Checklist by Change Type

### New public page or route (`/new-route`)

**Middleware (`middleware.js`)**
- [ ] Add route to the `matcher` array in `export const config`
- [ ] Add a route handler function (`handleNewRoute(url)`)
- [ ] Set a precise, entity-rich `<title>` (include the entity name, tournament, player, etc.)
- [ ] Set a factual `<meta name="description">` (what the page contains, who it covers, what data is shown)
- [ ] Add `<link rel="canonical">` pointing to the authoritative URL
- [ ] Add OpenGraph tags (`og:title`, `og:description`, `og:image`, `og:url`)
- [ ] Add `<script type="application/ld+json">` with appropriate schema.org type (see Schema Reference below)
- [ ] Inject semantic HTML into `<div id="root">` via `buildResponse()` — headings, paragraphs, lists — so bare-HTML crawlers (those that don't execute JS) see real content, not an empty div

**Sitemap (`api/sitemap.js`)**
- [ ] Add a `<url>` entry for every new static public page
- [ ] For dynamic entity pages (e.g. `/team/:slug`), enumerate and include known URLs
- [ ] Set `<priority>` and `<changefreq>` appropriately (live = hourly/0.9, static = monthly/0.5)

**`llms.txt` and `llms-full.txt` (`public/`)**
- [ ] Add the new page to `public/llms.txt` under the appropriate section
- [ ] If the page covers a new entity type (heroes, players, teams), add it to `public/llms-full.txt` with a description of what it contains and what data is available
- [ ] If the page exposes new API endpoints, add them to the "Machine-Readable Endpoints" section in `llms.txt`

**`robots.txt` (`public/robots.txt`)**
- [ ] Add an explicit `Allow: /new-route` or `Allow: /new-route/` entry for every new public route (already required by `claude_instructions_template.md` §4, but worth double-checking here)

---

### New API endpoint or mode

- [ ] Add the endpoint URL to the "Machine-Readable Endpoints" section in `public/llms.txt`
- [ ] Add the response schema (JSON structure with field names and types) to `public/llms-full.txt` — this helps AI systems understand the data without executing code
- [ ] Consider whether the endpoint should be publicly crawlable (e.g. `?format=json` responses that AI systems could ingest directly). If yes, remove it from `Disallow: /api/` in `robots.txt` and add an explicit `Allow:` instead.
- [ ] If the endpoint returns entity data (teams, players, tournaments, matches), include `@id` and entity names in the response JSON where practical — this creates semantic anchors for embedding pipelines

---

### New entity type (hero page, player page, team page, etc.)

This is the highest-value AI discoverability work. Follow the full checklist:

**Routing and rendering**
- [ ] Give the entity a stable, keyword-rich URL: `/heroes/{hero-slug}`, `/players/{name-slug}`, `/teams/{team-slug}`
- [ ] The URL must be stable over time — entity pages become citation targets; URL changes break links
- [ ] Inject server-side content via middleware for every entity URL pattern (not just the index page)
- [ ] Entity pages should have meaningful content in the initial HTML even before React hydrates

**Structured data**
- [ ] Use the correct schema.org type: `Person` for players, `SportsTeam` for teams, `VideoGame` or `Game` for heroes, `SportsEvent` for tournaments/matches
- [ ] Include relationship fields: a player page should reference their team (`memberOf`); a team page should reference their tournament (`competitor`); a tournament page should reference teams (`competitor`)
- [ ] Use `@id` anchors so different pages can reference the same entity consistently

**Content**
- [ ] Every entity page must have a factual introductory paragraph that describes the entity plainly — this is the text LLMs will extract and cite
- [ ] Include key statistics or facts in plain HTML (not locked behind JavaScript) — they become the "quotable" content
- [ ] Link to related entities (team page links to player pages, tournament page links to team pages) — entity relationships strengthen the knowledge graph

**llms.txt / llms-full.txt**
- [ ] Add the entity type and URL pattern to `llms.txt`
- [ ] Add detailed entity data (known values, list of entities, field descriptions) to `llms-full.txt`
- [ ] Add known canonical entities as examples: "Team Spirit page: /teams/team-spirit"

---

### New data field exposed in the UI

- [ ] If the data is factual and unique (e.g. a new match statistic, a new player field, a new tournament format), consider whether it should appear in page server-rendered content (not just React-rendered)
- [ ] If the field represents a key entity property (player nationality, team region, tournament prize pool), add it to the appropriate structured data schema in the middleware
- [ ] If it's a stat that makes the site more authoritative (e.g. first blood time, hero win rates), document it in `llms-full.txt` under the relevant API schema section

---

### Modification to an existing entity or page

- [ ] Review the existing structured data in `middleware.js` for the affected route
- [ ] Update the JSON-LD if the entity structure changes (new fields, renamed fields, new relationships)
- [ ] Review the affected sections in `llms.txt` and `llms-full.txt` and update descriptions if behavior changes
- [ ] If a URL structure changes (e.g. slug format update), ensure old URLs redirect to new ones — citation links from other sites and AI training data will use old URLs

---

## Schema.org Reference (Use These Types)

| Page / Entity | Primary schema.org type | Key fields |
|---|---|---|
| Homepage | `WebSite` | `potentialAction` (SearchAction), `name`, `url` |
| Match page | `SportsEvent` | `name`, `sport`, `competitor` (SportsTeam), `winner`, `organizer`, `startDate` |
| Tournament page | `SportsEvent` | `name`, `sport`, `competitor` (array of SportsTeam), `organizer`, `startDate`, `endDate` |
| Tournament list | `CollectionPage` | `name`, `description`, `about` (SportsOrganization) |
| Team page | `SportsTeam` | `name`, `sport`, `memberOf` (SportsOrganization), `member` (array of Person) |
| Player page | `Person` | `name`, `alternateName` (in-game name), `nationality`, `memberOf` (SportsTeam) |
| Hero page | `Thing` or custom | `name`, `description`, `url` — no official schema.org type for fictional game characters |
| News page | `CollectionPage` + `NewsMediaOrganization` | Standard news metadata |
| About page | `AboutPage` + `Organization` | `name`, `url`, `description`, `sameAs` |
| Static content | `WebPage` | `name`, `description`, `url`, `isPartOf` (WebSite), `breadcrumb` |

Always include `BreadcrumbList` on every page. Always include `"isPartOf": { "@id": "https://spectateesports.live/#website" }` to link to the root WebSite entity.

---

## Rendering Rules

The site is a pure CSR (React + Vite) SPA. Edge middleware (`middleware.js`) compensates by injecting server-side content for known routes. The rule is:

**Any route that could become a citation target must have middleware coverage.**

A "citation target" is any page an LLM might point users to when answering a question. This includes:
- Any entity page (team, player, hero, tournament, match)
- Any collection page (/tournaments, /news)
- Any informational page (/about, /calendar, /release-notes)

**The homepage** gets its JSON-LD from `index.html` directly (it's already there). Do not add it to the middleware matcher.

**The test**: `curl -A "GPTBot/1.0" https://spectateesports.live/{route}` should return a response containing:
1. A meaningful `<title>`
2. A `<meta name="description">` with factual content
3. A `<link rel="canonical">`
4. A `<script type="application/ld+json">` block with valid schema.org data
5. Content in `<div id="root">` — at minimum an `<h1>` and a descriptive paragraph

---

## Entity Relationship Strategy

SpectateEsports should build toward a knowledge graph where every entity links to related entities:

```
Tournament
  └─ has competitor: Team[]
        └─ has member: Player[]
              └─ played in: Match[]
                    └─ used hero: Hero[]
                    └─ part of: Tournament
```

Each entity page should:
- Reference entities it belongs to (player → team, team → tournament)
- Reference entities it contains (tournament → teams, match → players)
- Use `@id` anchors that other pages can reference (e.g. `"@id": "https://spectateesports.live/teams/team-spirit#entity"`)

Over time, this creates a knowledge graph that AI retrieval systems can traverse and cite.

---

## Content Authority Principles

For AI citation, content must be:

1. **Factual** — state facts, not marketing claims ("Team Spirit won TI12 in 2023" not "an incredible esports team")
2. **Unique** — something not available elsewhere, or available here faster/more accurately
3. **Structured** — in formats machines can parse (tables, lists, JSON-LD, clear headings)
4. **Durable** — pages with stable content and stable URLs get cited; transient data (live scores) does not
5. **Attributed** — cite data sources explicitly ("data via OpenDota API", "tournament structure via PandaScore")
6. **Timely** — freshness signals matter for news and results; include `lastmod` in sitemap and `dateModified` in WebPage schema where possible

---

## What NOT to Do

- Do NOT rely on React rendering for any content that should be indexed. Crawlers that skip JS will see nothing.
- Do NOT put entity names, statistics, or facts only inside JSX. Duplicate them in middleware server-rendered HTML.
- Do NOT use generic titles like "Spectate Esports — Match". Include entity names: "Team Spirit 2-0 Gaimin Gladiators — DreamLeague S29 | Spectate Esports".
- Do NOT skip the JSON-LD block on any new public page. Even a minimal `WebPage` schema is better than nothing.
- Do NOT change entity page URL slugs without adding 301 redirects. Citation links rot; entity authority is lost.
- Do NOT add new public routes without updating `llms.txt` — AI systems use this file to understand the site's structure.

---

## Long-Term AI Discoverability Goals

These are the architectural targets we are building toward:

- **Entity pages for every major entity**: every Tier 1 team, every active player, every tournament, every hero
- **Evergreen tournament history pages**: completed events with final standings, winner, notable moments — durable citation targets
- **Glossary pages**: `/glossary/draft`, `/glossary/gpm`, `/glossary/roshan` — the highest-citation-potential pages for Dota 2 AI answers
- **Player career pages**: `/players/{slug}` with tournament history, hero pool, statistical profile
- **Migrate to SSR/SSG**: The single largest AI discoverability improvement. Even a partial Next.js migration for entity pages would unlock full crawler access to all content.

Adding any of these: follow this full checklist from the top.

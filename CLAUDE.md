# Claude Instructions

Before pushing anything to production, read `.claude/claude_instructions_template.md` in full and follow the deployment checklist there.

## Read before starting work (not just before deploying)

- **Any new feature request or product planning** — read `.claude/pm_instructions.md` first; produce a full product specification before touching any code
- **Any UI or visual change** — read `DESIGN_GUIDELINES.md` before touching any className, component, or copy
- **Any feature work, bug fix, or API change** — read the relevant section of `CONTEXT.md` first; understand existing patterns before writing new code
- **Any refactor** — check `.claude/pending-refactors.md` before starting; if you spot a refactor opportunity while working, add it there rather than doing it unplanned inline
- **Any new feature idea or fan-need brainstorm** — check `.claude/product-backlog.md` first for whether it's already tracked (there or cross-referenced into `.claude/specs/live-story-roadmap.md`); add new items there in the same RICE format rather than starting a fresh doc
- **Every new page, route, API endpoint, or entity type** — read `.claude/ai_discoverability.md` and apply the implementation checklist; AI + search discoverability is mandatory for all features, not optional
- **Any change touching `api/match-streams.js`, `api/live-matches.js` (stream cache writes), `api/_shared.js` (`getTwitchStreams`), or `src/api.js` (`findTwitchVod`, `fetchMatchStreams`, `resolveMatchStreams`)** — read the "VOD Replay System" section in `.claude/claude_instructions_template.md` first. That system is LOCKED and requires explicit owner approval to modify.

## Keep current after changes

- New features or changed behavior → update `CONTEXT.md`
- New env vars → update both `CONTEXT.md` (Environment Variables section) and `README.md` (env vars table)
- Completed refactor from `pending-refactors.md` → remove the item from that file

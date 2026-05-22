# Claude Instructions

Before pushing anything to production, read `.claude/claude_instructions_template.md` in full and follow the deployment checklist there.

## Read before starting work (not just before deploying)

- **Any new feature request or product planning** — read `.claude/pm_instructions.md` first; produce a full product specification before touching any code
- **Any UI or visual change** — read `DESIGN_GUIDELINES.md` before touching any className, component, or copy
- **Any feature work, bug fix, or API change** — read the relevant section of `CONTEXT.md` first; understand existing patterns before writing new code
- **Any refactor** — check `.claude/pending-refactors.md` before starting; if you spot a refactor opportunity while working, add it there rather than doing it unplanned inline

## Keep current after changes

- New features or changed behavior → update `CONTEXT.md`
- New env vars → update both `CONTEXT.md` (Environment Variables section) and `README.md` (env vars table)
- Completed refactor from `pending-refactors.md` → remove the item from that file

# Claude Code Instructions

Project-specific rules for AI-assisted development on this repo. These apply to every code change, regardless of how small.

---

## After Every Code Change

### 1. Run the existing test suite (always)

```bash
npm test
```

All tests must pass before committing. Never skip this.

---

### 2. Code review — as a completely different developer

After making changes, do a fresh read of every modified file as if you're seeing it for the first time. Assume the author made mistakes. Look for:

- **Logic errors** — off-by-one, wrong field name, inverted condition, wrong object passed to a function
- **Missing error handling** — `res.ok` checks before `.json()`, try/catch around I/O, abort signals on long-running fetches
- **Poisoned caches** — module-level caches set to a bad value on API failure (empty Set, null, error object) that persist silently until process restart
- **Broken imports** — removed exports still imported elsewhere; circular deps
- **Inconsistency** — same logic written differently in two places (e.g. server vs client versions of the same helper)
- **Stale comments** — comments that contradict the new code
- **Documentation drift** — CONTEXT.md sections that still describe the old behaviour

**How to do it:** Use the `Explore` subagent to read and report on each modified file. Then fix every issue found before committing.

---

### 3. QA step — beyond the unit tests

Unit tests cover pure logic. The QA step covers runtime integration — things tests cannot catch. Run this after the test suite passes and the code review is clean.

#### API shape verification
For any new field being read from an external API (PandaScore, OpenDota, Twitch):
- Confirm the field name in actual API documentation or a real response
- Check that null/missing field is handled (optional chaining `?.`, fallback `|| ''`)
- Confirm the field is available on the specific endpoint being called (e.g. `league.tier` on `/matches/running` vs `/series/running` vs `/tournaments/running` — these are different objects)

#### Filter output sanity check
For any change to tier/filter logic:
- Manually verify at least one known tier-S event appears in the filtered output
- Manually verify at least one known non-tier-S event is excluded
- If touching OpenDota: confirm `leagueid` (not `league_id` or `league.id`) is the correct field name for the promatches endpoint

#### Cache poisoning check
For any code that writes to a module-level variable or KV cache:
- Trace the error path: if the upstream fetch fails non-fatally (e.g. 429, 503), does the cache end up holding an empty/wrong value?
- If yes, fix to only set the cache on success and throw on failure so callers can retry

#### Pagination and cursor correctness
For any change to paginated endpoints:
- Check what `nextMatchId` / cursor is returned when the result page is empty
- Returning the same cursor as input causes infinite "load more" loops — return `null` to signal end of data

#### Import/export consistency
After removing or renaming an exported symbol:
- `grep -r "symbolName"` across the whole repo (not just the files you touched) to find any consumers that were missed

---

## Commit message format

Use imperative present tense. Describe *why*, not just *what*. Reference the ticket/session URL on the last line.

```
Short summary (72 chars max)

Longer explanation of why the change was needed and what approach was taken.
Call out any non-obvious decisions.

https://claude.ai/code/session_...
```

---

## Key architecture rules

- Vercel functions are capped at **12 deployed functions** — merge related modes into one handler with a `?mode=` query param rather than creating new files
- Module-level caches in serverless functions only survive within a warm Lambda instance — do not rely on them for correctness, only for performance
- `api/_shared.js` is the canonical place for utilities shared across multiple serverless functions; it is NOT deployed as its own function (underscore prefix)
- PandaScore tier `'s'` = OpenDota tier `'premium'` = the only tiers shown in this app
- Never add hardcoded tournament name lists — use the tier fields from the APIs

# Project Instructions for Spectate Esports

Claude should follow these guidelines for ALL tasks in this project:

---

## Required Updates for Any New Feature or Interaction

### 1. About Page
- File: `src/pages/AboutPage.jsx`
- Update the feature list with new capabilities
- Add brief descriptions of what the feature does

### 2. Context Documentation
- File: `CONTEXT.md`
- Add new features to the appropriate section
- Document new API integrations or dependencies
- Update the "Known Issues/Limitations" section if relevant
- Add to the "Backlog/Future Ideas" if there are follow-up enhancements

### 3. Release Notes
- File: `src/pages/ReleaseNotesPage.jsx` (the `RELEASES` array at the top)
- Add entry for every new feature or bug fix
- Include: date, tag ("new"/"improvement"/"fix"), title, desc, and optional items array
- Keep most recent releases at the top of the array

### 4. Analytics Tracking
- Add Google Analytics event tracking for ALL new user interactions
- Event naming convention: `feature_action` (e.g., `vod_click`, `summary_generate`)
- Required for: buttons, links, form submissions, drawer opens/closes
- Use existing GA helper pattern from the codebase

### 5. Automated Testing
- Write tests for all new features before marking them complete
- Test files should live in `__tests__/` or `*.test.js` files
- Cover:
  - Happy path (feature works as expected)
  - Edge cases (empty data, API failures, missing fields)
  - User interactions (clicks, inputs, navigation)
- Use existing testing framework (React Testing Library + Vitest/Jest)

### 6. Regression Testing
- Before deployment, ask: "Would you like to run regression tests?"
- Run full test suite: `npm test`
- Check for:
  - Breaking changes in existing features
  - API compatibility issues
  - UI/layout regressions
- Do NOT proceed to deployment without user confirmation

---

## Cost Optimization Requirements

### API Rate Limits and Caching
- **Always check if data can be cached** before making API calls
- Use `localStorage` or `sessionStorage` for:
  - Hero data (rarely changes)
  - Match summaries (never change once generated)
  - Twitch tokens (valid for ~60 days)
- Implement rate limiting on the frontend:
  - Debounce search inputs
  - Prevent duplicate concurrent requests
  - Show "already loading" states
- **Free API limits to respect:**
  - OpenDota: No hard limit but avoid spam
  - Twitch: Rate limited per client ID
  - Anthropic Claude: Pay-per-use (minimize unnecessary calls)
  
### Caching Strategy
- Cache hero list on first load (store in `localStorage` with expiry)
- Cache match summaries by match ID (never regenerate)
- Cache Twitch tokens until expiry
- For search results: cache the filtered view, not raw API data
- Add cache invalidation logic if data becomes stale

### Before Adding New API Calls
- Ask: "Can this be computed locally instead?"
- Ask: "Can we batch multiple requests?"
- Ask: "Can we cache the response?"
- Document the caching strategy in `CONTEXT.md`

---

## Code Quality Standards

### File Organization
- Components in `src/components/`
- API calls in `src/api.js`
- Utilities in `src/utils.js`
- Serverless functions in `api/`

### Error Handling
- Always wrap API calls in try-catch
- Show user-friendly error messages that explain what failed and what to do next
- **Document failure modes**: For every feature, explain what happens when:
  - API is down or rate limited
  - Network connection fails
  - Data is missing or malformed
  - User has no internet connection
- Give users clear next steps (e.g., "Try again in a few minutes" or "Check your internet connection")
- Log errors to console for debugging
- Never let the app crash silently

### Comments
- Add brief comments for complex logic
- Document why, not what (code should be self-explanatory)
- Add JSDoc for reusable utility functions

### Writing Style
- **Never use em dashes (—)** in any user-facing text, code comments, or documentation
- Use hyphens (-) or rewrite sentences to avoid the need for dashes
- Keep language simple and clear for beginner-friendly communication

---

## Deployment Checklist

Before deploying to production:

1. ✅ Run regression tests (`npm test`)
2. ✅ Check all new features have GA tracking
3. ✅ Verify API rate limits won't be exceeded
4. ✅ Test on mobile viewport
5. ✅ Update `CONTEXT.md` with changes
6. ✅ Update About page
7. ✅ Update `src/pages/ReleaseNotesPage.jsx` with new release entry
8. ✅ Ask user: "Ready to deploy? All tests passed and docs updated."

---

## Owner-Only Features

These features are intentionally hidden from public documentation. They are gated by a localStorage key and only accessible to the site owner. Do NOT document them in CONTEXT.md, About page, or Release Notes.

### Draft X Posts

- Enabled by: `localStorage.setItem('spectate-owner', 'true')` in the browser console
- When enabled, a "Draft X posts" button appears on completed series cards in `MatchCard`
- Button opens `XPostsModal` (src/components/XPostsModal.jsx)
- `App.jsx` calls `/api/draft-posts` with series metadata and game replay URLs
- `api/draft-posts.js` uses Claude Haiku to generate one post per game (under 200 chars + link)
- `api/og-series.js` generates a downloadable series summary image (winner, score, tournament, format)
- Posts vary in tone across games (opener, momentum shift, decider narrative)
- Each post ends with the Spectate match URL as the CTA/replay link
- `XPostsModal` shows posts per game with a one-click Copy button; closes on Escape or backdrop click
- Hidden in spoiler-free mode

---

## Notes for Claude Code

- This is a beginner-friendly project - explain technical decisions
- Always show what changed and why
- If something breaks, explain how to fix it
- When in doubt, ask before making breaking changes

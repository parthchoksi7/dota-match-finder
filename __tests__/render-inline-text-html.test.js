/**
 * renderInlineTextHtml (middleware.js) -- the SSR/bot-shell mirror of
 * src/pages/ArticlePage.jsx's renderInlineText(). Article body text may contain the
 * minimal `[label](/path)` inline-link syntax (2026-08-16); this converts it to a real
 * <a href> in the no-JS HTML fallback instead of leaving literal bracket text, while
 * still escaping everything else exactly like plain escapeHtml() did before.
 */
import { describe, it, expect } from 'vitest'
import { renderInlineTextHtml } from '../middleware.js'

describe('renderInlineTextHtml', () => {
  it('converts a single inline link to a real anchor tag', () => {
    expect(renderInlineTextHtml('Check out [Team Spirit](/teams/team-spirit) today.')).toBe(
      'Check out <a href="/teams/team-spirit">Team Spirit</a> today.'
    )
  })

  it('converts multiple inline links in the same string', () => {
    const input = '[Iron Wing](/teams/1win) vs. [Team Spirit](/teams/team-spirit)'
    expect(renderInlineTextHtml(input)).toBe(
      '<a href="/teams/1win">Iron Wing</a> vs. <a href="/teams/team-spirit">Team Spirit</a>'
    )
  })

  it('leaves plain text with no link syntax untouched (other than normal escaping)', () => {
    expect(renderInlineTextHtml('No links here.')).toBe('No links here.')
  })

  it('still escapes HTML-special characters outside of link syntax', () => {
    expect(renderInlineTextHtml('A "quoted" & <tagged> string')).toBe(
      'A &quot;quoted&quot; &amp; &lt;tagged&gt; string'
    )
  })

  it('escapes HTML-special characters inside a link label', () => {
    expect(renderInlineTextHtml('[A & B](/teams/a-and-b)')).toBe(
      '<a href="/teams/a-and-b">A &amp; B</a>'
    )
  })

  it('does not link a non-internal href (external origin) -- renders the original bracket text', () => {
    expect(renderInlineTextHtml('[evil](https://evil.com)')).toBe('[evil](https://evil.com)')
  })

  it('does not link a javascript: href', () => {
    // The `)` inside the href means the regex match ends at that first `)` (documented
    // limitation, see the function's comment) -- but since the matched portion is returned
    // unchanged (non-internal href) and .replace() reattaches the untouched trailing `)`,
    // the net result reconstructs the original string exactly.
    expect(renderInlineTextHtml('[click me](javascript:alert(1))')).toBe(
      '[click me](javascript:alert(1))'
    )
  })

  it('leaves unmatched bracket syntax untouched', () => {
    expect(renderInlineTextHtml('[not a link] and (not a link either)')).toBe(
      '[not a link] and (not a link either)'
    )
  })
})

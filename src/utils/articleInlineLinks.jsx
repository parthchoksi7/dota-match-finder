import { trackEvent } from '../utils'

// Parses the minimal `[label](/path)` markdown-link syntax article content is allowed to use
// (see CONTEXT.md's Editorial Pipeline section). No other markdown is supported on purpose --
// editorial copy is plain prose with occasional internal links, not a general markdown document.
// Known limitation: a literal `)` inside the href (e.g. a Wikipedia-style disambiguation URL)
// truncates the match early. Acceptable because every real link target is a curated internal
// slug (`/teams/:slug`, `/heroes/:slug`) and none of those contain parentheses.
//
// Mirrored server-side by middleware.js's renderInlineTextHtml() for the no-JS/bot SSR shell --
// keep both in sync if this syntax ever changes. Lives in its own file (not inlined in
// ArticlePage.jsx) because a component file may only export components for React Fast Refresh
// to work correctly -- exporting this alongside the default component export broke HMR.
const INLINE_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g

export function renderInlineText(text) {
  const nodes = []
  let lastIndex = 0
  let match
  let key = 0
  INLINE_LINK_RE.lastIndex = 0
  while ((match = INLINE_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const [full, label, href] = match
    // Same-origin only -- article text is pipeline/LLM-generated, so never trust an
    // unvalidated scheme (javascript:, an external https:// origin, etc.) into an href.
    // A non-internal target renders as the original bracket text instead of a link.
    if (href.startsWith('/')) {
      nodes.push(
        <a
          key={`link-${key++}`}
          href={href}
          className="text-sky-500 underline decoration-sky-500/40 hover:text-sky-400 hover:decoration-sky-400"
          onClick={() => trackEvent('article_inline_link_click', { href })}
        >
          {label}
        </a>
      )
    } else {
      nodes.push(full)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

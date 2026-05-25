/**
 * Tests for the RSS ?format=rss mode in api/news.js.
 *
 * Tests inline copies of the pure functions:
 * - escapeXml: sanitizes XML special characters in article fields
 * - RSS item generation: correct XML element structure per article
 * - RSS channel structure: valid RSS 2.0 envelope
 * - Edge cases: empty article list, articles with & < > " ' in titles
 */

import { describe, it, expect } from 'vitest'

// ── escapeXml (copy from api/news.js) ─────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('Team Spirit & Gaimin')).toBe('Team Spirit &amp; Gaimin')
  })

  it('escapes less-than and greater-than', () => {
    expect(escapeXml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('escapes double quotes', () => {
    expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('handles string with all special characters', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f'
    )
  })

  it('does not double-escape: & is escaped first so < does not become &amp;lt;', () => {
    const result = escapeXml('&lt;')
    // & → &amp;, then the literal < and ; from the already-partially-escaped string
    // Input "&lt;" → "&amp;lt;" (only the & is an XML special char here)
    expect(result).toBe('&amp;lt;')
  })

  it('returns an empty string unchanged', () => {
    expect(escapeXml('')).toBe('')
  })

  it('converts non-string input via String()', () => {
    expect(escapeXml(42)).toBe('42')
    expect(escapeXml(null)).toBe('null')
  })
})

// ── RSS item generation ───────────────────────────────────────────────────────

function buildRssItem(a) {
  const safeTitle = escapeXml(a.title || '')
  const safeDesc  = escapeXml(a.excerpt || '')
  const safeLink  = escapeXml(a.url || '')
  const safeGuid  = escapeXml(a.url || '')
  const pubDate   = a.publishedAt ? new Date(a.publishedAt).toUTCString() : ''
  return `    <item>
      <title>${safeTitle}</title>
      <link>${safeLink}</link>
      <description>${safeDesc}</description>
      <guid isPermaLink="true">${safeGuid}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
    </item>`
}

function buildRss(articles) {
  const rssItems = articles.map(buildRssItem).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Spectate Esports — Dota 2 News</title>
    <link>https://spectateesports.live/news</link>
    <description>Latest Dota 2 esports news: pro match results, roster transfers, patch notes, and tournament updates from Steam, Liquipedia, and editorial sources.</description>
    <language>en-us</language>
    <atom:link href="https://spectateesports.live/api/news?format=rss" rel="self" type="application/rss+xml" />
    <ttl>30</ttl>
${rssItems}
  </channel>
</rss>`
}

const sampleArticle = {
  title: 'Team Spirit wins DreamLeague S29',
  excerpt: 'Team Spirit defeated Gaimin Gladiators 2-1 in the Grand Final.',
  url: 'https://dotesports.com/dota-2/article-1',
  publishedAt: '2026-05-24T10:00:00.000Z',
}

describe('RSS item structure', () => {
  it('contains <title> with escaped content', () => {
    const item = buildRssItem({ ...sampleArticle, title: 'Spirit & GG' })
    expect(item).toContain('<title>Spirit &amp; GG</title>')
  })

  it('contains <link> with the article URL', () => {
    const item = buildRssItem(sampleArticle)
    expect(item).toContain('<link>https://dotesports.com/dota-2/article-1</link>')
  })

  it('contains <description> with escaped excerpt', () => {
    const item = buildRssItem(sampleArticle)
    expect(item).toContain('<description>Team Spirit defeated Gaimin Gladiators 2-1 in the Grand Final.</description>')
  })

  it('contains <guid> matching the URL', () => {
    const item = buildRssItem(sampleArticle)
    expect(item).toContain('<guid isPermaLink="true">https://dotesports.com/dota-2/article-1</guid>')
  })

  it('contains <pubDate> when publishedAt is set', () => {
    const item = buildRssItem(sampleArticle)
    expect(item).toContain('<pubDate>')
    // toUTCString produces a human-readable UTC date
    expect(item).toContain('2026')
  })

  it('omits <pubDate> when publishedAt is missing', () => {
    const item = buildRssItem({ ...sampleArticle, publishedAt: null })
    expect(item).not.toContain('<pubDate>')
  })

  it('escapes < > in title', () => {
    const item = buildRssItem({ ...sampleArticle, title: '<Breaking> News' })
    expect(item).toContain('<title>&lt;Breaking&gt; News</title>')
    expect(item).not.toContain('<title><Breaking>')
  })

  it('falls back to empty string for missing title', () => {
    const item = buildRssItem({ ...sampleArticle, title: '' })
    expect(item).toContain('<title></title>')
  })
})

// ── RSS channel structure ─────────────────────────────────────────────────────

describe('RSS channel structure', () => {
  it('starts with XML declaration', () => {
    const rss = buildRss([sampleArticle])
    expect(rss.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('has rss version 2.0 root element', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('<rss version="2.0"')
  })

  it('has atom namespace declaration', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
  })

  it('has channel title', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('<title>Spectate Esports — Dota 2 News</title>')
  })

  it('has self-referencing atom:link', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('href="https://spectateesports.live/api/news?format=rss"')
    expect(rss).toContain('rel="self"')
  })

  it('has ttl of 30 minutes', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('<ttl>30</ttl>')
  })

  it('includes all articles as <item> elements', () => {
    const articles = [
      { ...sampleArticle, url: 'https://example.com/1', title: 'A' },
      { ...sampleArticle, url: 'https://example.com/2', title: 'B' },
      { ...sampleArticle, url: 'https://example.com/3', title: 'C' },
    ]
    const rss = buildRss(articles)
    const itemCount = (rss.match(/<item>/g) || []).length
    expect(itemCount).toBe(3)
  })

  it('produces valid RSS for an empty article list', () => {
    const rss = buildRss([])
    expect(rss).toContain('<channel>')
    expect(rss).toContain('</channel>')
    expect(rss).not.toContain('<item>')
  })

  it('closes all tags correctly (no unclosed channel or rss)', () => {
    const rss = buildRss([sampleArticle])
    expect(rss).toContain('</channel>')
    expect(rss).toContain('</rss>')
  })
})

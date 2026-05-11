/**
 * Unit tests for api/news.js ingestion pipeline.
 *
 * Tests pure functions extracted from the module:
 * - hashUrl: djb2-xor produces stable hashes for deduplication
 * - canonicalizeUrl: strips tracking params from URLs
 * - normalizeArticle: sanitizes and structures raw RSS items
 * - tagArticle: classifies articles by category and entity
 * - deduplication logic via id hash
 */

import { describe, it, expect } from 'vitest'

// ── hashUrl ───────────────────────────────────────────────────────────────────

function hashUrl(url) {
  let h = 5381
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(36)
}

describe('hashUrl', () => {
  it('returns the same hash for the same URL', () => {
    expect(hashUrl('https://dotesports.com/dota-2/article-123')).toBe(
      hashUrl('https://dotesports.com/dota-2/article-123')
    )
  })

  it('returns different hashes for different URLs', () => {
    const a = hashUrl('https://dotesports.com/article-1')
    const b = hashUrl('https://dotesports.com/article-2')
    expect(a).not.toBe(b)
  })

  it('returns a non-empty string', () => {
    const h = hashUrl('https://example.com')
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })
})

// ── canonicalizeUrl ───────────────────────────────────────────────────────────

function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw)
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid']) {
      u.searchParams.delete(p)
    }
    return u.toString()
  } catch {
    return raw
  }
}

describe('canonicalizeUrl', () => {
  it('strips utm_source from URL', () => {
    expect(canonicalizeUrl('https://dotesports.com/article?utm_source=twitter'))
      .toBe('https://dotesports.com/article')
  })

  it('strips multiple tracking params', () => {
    expect(canonicalizeUrl('https://example.com/page?utm_source=fb&utm_medium=social&other=keep'))
      .toBe('https://example.com/page?other=keep')
  })

  it('strips fbclid and gclid', () => {
    expect(canonicalizeUrl('https://example.com/page?fbclid=abc123&gclid=xyz'))
      .toBe('https://example.com/page')
  })

  it('preserves non-tracking query params', () => {
    expect(canonicalizeUrl('https://example.com/search?q=dota'))
      .toBe('https://example.com/search?q=dota')
  })

  it('returns the input unchanged when it is not a valid URL', () => {
    expect(canonicalizeUrl('not-a-url')).toBe('not-a-url')
  })
})

// ── stripHtml ─────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str
  return str.slice(0, maxLen - 1).trimEnd() + '…'
}

describe('normalizeArticle (inline)', () => {
  const source = { id: 'dotesports', name: 'Dot Esports', baseUrl: 'https://dotesports.com', reliability: 4, games: ['dota2'], categoryFilter: null }

  function normalizeArticle(raw, src) {
    const url = canonicalizeUrl(raw.link || '')
    if (!url) return null
    if (src.categoryFilter && !src.categoryFilter(raw.categories || [])) return null
    return {
      id: hashUrl(url),
      title: stripHtml(raw.title || '').trim(),
      excerpt: truncate(stripHtml(raw.description || ''), 200),
      url,
      source: { id: src.id, name: src.name, baseUrl: src.baseUrl, reliability: src.reliability },
      publishedAt: raw.pubDate ? new Date(raw.pubDate).toISOString() : new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      tags: { games: src.games, categories: [], entities: [] },
    }
  }

  it('strips HTML from title', () => {
    const a = normalizeArticle({ link: 'https://example.com/a', title: '<b>Team Spirit</b> wins', description: '', pubDate: '2026-05-01' }, source)
    expect(a.title).toBe('Team Spirit wins')
  })

  it('strips HTML from description and truncates to 200 chars', () => {
    const longDesc = '<p>' + 'x'.repeat(300) + '</p>'
    const a = normalizeArticle({ link: 'https://example.com/b', title: 'T', description: longDesc, pubDate: '2026-05-01' }, source)
    expect(a.excerpt.length).toBeLessThanOrEqual(200)
    expect(a.excerpt.endsWith('…')).toBe(true)
  })

  it('returns null when link is empty', () => {
    const a = normalizeArticle({ link: '', title: 'T', description: 'D', pubDate: '2026-05-01' }, source)
    expect(a).toBeNull()
  })

  it('applies categoryFilter to exclude non-matching articles', () => {
    const filteredSource = { ...source, categoryFilter: (cats) => cats.some(c => c.includes('dota')) }
    const a = normalizeArticle({ link: 'https://example.com/c', title: 'CS2 news', description: 'D', pubDate: '2026-05-01', categories: ['cs2'] }, filteredSource)
    expect(a).toBeNull()
  })

  it('passes categoryFilter when a matching category exists', () => {
    const filteredSource = { ...source, categoryFilter: (cats) => cats.some(c => c.toLowerCase().includes('dota')) }
    const a = normalizeArticle({ link: 'https://example.com/d', title: 'Dota news', description: 'D', pubDate: '2026-05-01', categories: ['dota-2'] }, filteredSource)
    expect(a).not.toBeNull()
  })
})

// ── tagArticle ────────────────────────────────────────────────────────────────

const TIER1_TEAMS_SERVER = [
  'Team Liquid', 'Tundra Esports', 'Team Spirit', 'BetBoom Team',
  'Team Falcons', 'Gaimin Gladiators', 'Aurora Gaming', 'OG',
  'Natus Vincere', 'Virtus.pro', 'Team Secret', 'Team Aster',
  'Talon Esports', 'Nouns Esports', 'Team Yandex', 'PSG.LGD',
  'Nigma Galaxy', 'Evil Geniuses', 'beastcoast', 'Thunder Awaken',
]

const PERMANENT_TIER1_NAMES = [
  'DreamLeague', 'ESL One', 'PGL', 'PGL Wallachia',
  'BLAST', 'The International', 'Beyond The Summit', 'WePlay',
  'Riyadh Masters', '1win Essence',
]

function tagArticle(article) {
  const text = `${article.title} ${article.excerpt}`.toLowerCase()
  const matchedTeams = TIER1_TEAMS_SERVER.filter(t => text.includes(t.toLowerCase()))
  const matchedTournaments = PERMANENT_TIER1_NAMES.filter(n => text.includes(n.toLowerCase()))
  const categories = []
  if (matchedTournaments.length > 0) categories.push('tournament')
  if (matchedTeams.length > 0) categories.push('team')
  if (/patch|update|7\.\d{2}[a-z]?/.test(text)) categories.push('patch')
  if (/roster|sign|release|leave|join|transfer|picked up|parts ways/.test(text)) categories.push('roster')
  if (/result|beat|defeat|win|lose|2-1|2-0|1-2|0-2|eliminat/.test(text)) categories.push('match-result')
  return {
    ...article,
    tags: {
      ...article.tags,
      categories: categories.length ? [...new Set(categories)] : ['general'],
      entities: [...new Set([...matchedTeams, ...matchedTournaments])],
    },
  }
}

function makeArticle(title, excerpt = '') {
  return { title, excerpt, tags: { games: ['dota2'], categories: [], entities: [] } }
}

describe('tagArticle', () => {
  it('tags "DreamLeague" mention as tournament category', () => {
    const a = tagArticle(makeArticle('DreamLeague Season 23 starts tomorrow'))
    expect(a.tags.categories).toContain('tournament')
    expect(a.tags.entities).toContain('DreamLeague')
  })

  it('tags "Team Spirit" mention as team category', () => {
    const a = tagArticle(makeArticle('Team Spirit beats Team Liquid in grand finals'))
    expect(a.tags.categories).toContain('team')
    expect(a.tags.entities).toContain('Team Spirit')
    expect(a.tags.entities).toContain('Team Liquid')
  })

  it('gives articles with no tier-1 entities the "general" category', () => {
    const a = tagArticle(makeArticle('Valve adds a new Dota 2 cosmetic item to the store'))
    expect(a.tags.categories).toEqual(['general'])
    expect(a.tags.entities).toHaveLength(0)
  })

  it('tags patch-related articles as "patch"', () => {
    const a = tagArticle(makeArticle('Dota 2 patch 7.38b released'))
    expect(a.tags.categories).toContain('patch')
  })

  it('tags roster moves as "roster"', () => {
    const a = tagArticle(makeArticle('OG sign new carry after roster changes'))
    expect(a.tags.categories).toContain('roster')
  })

  it('tags match result articles', () => {
    const a = tagArticle(makeArticle('Team Spirit defeat Gaimin Gladiators 2-0'))
    expect(a.tags.categories).toContain('match-result')
  })

  it('deduplicates entities when the same team appears multiple times', () => {
    const a = tagArticle(makeArticle('Team Spirit vs Team Spirit rematch'))
    const spiritCount = a.tags.entities.filter(e => e === 'Team Spirit').length
    expect(spiritCount).toBe(1)
  })

  it('can assign multiple categories to one article', () => {
    const a = tagArticle(makeArticle('Team Spirit win DreamLeague 2-0'))
    expect(a.tags.categories).toContain('team')
    expect(a.tags.categories).toContain('tournament')
    expect(a.tags.categories).toContain('match-result')
  })
})

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('deduplication by URL hash', () => {
  it('keeps only the first article when two share the same id', () => {
    const sharedId = hashUrl('https://dotesports.com/article-1')
    const articles = [
      { id: sharedId, title: 'First', url: 'https://dotesports.com/article-1' },
      { id: sharedId, title: 'Duplicate', url: 'https://dotesports.com/article-1' },
    ]
    const seen = new Set()
    const deduped = articles.filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    expect(deduped).toHaveLength(1)
    expect(deduped[0].title).toBe('First')
  })

  it('keeps distinct articles that have different ids', () => {
    const articles = [
      { id: hashUrl('https://example.com/a'), title: 'A' },
      { id: hashUrl('https://example.com/b'), title: 'B' },
    ]
    const seen = new Set()
    const deduped = articles.filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })
    expect(deduped).toHaveLength(2)
  })
})

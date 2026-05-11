import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { XMLParser } from 'fast-xml-parser'
import { NEWS_SOURCES, PERMANENT_TIER1_NAMES, TIER1_TEAMS_SERVER } from './_shared.js'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const NEWS_CACHE_TTL = 30 * 60 // 30 min
const MAX_AGE_DAYS = 7
const MAX_PER_SOURCE = 25
const MAX_TOTAL = 60
const FEED_TIMEOUT_MS = 5000

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Treat these as arrays even when there is only one element
  isArray: (name) => ['item', 'entry', 'category', 'link'].includes(name),
  cdataPropName: '__cdata',
  processEntities: true,
  htmlEntities: true,
})

// ── Utilities ─────────────────────────────────────────────────────────────────

function toArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function getRawText(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (val.__cdata) return val.__cdata
  if (val['#text']) return val['#text']
  return String(val)
}

// djb2-xor hash for stable URL deduplication (no crypto import needed)
function hashUrl(url) {
  let h = 5381
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(36)
}

function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw)
    // Strip common tracking query params
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid']) {
      u.searchParams.delete(p)
    }
    return u.toString()
  } catch {
    return raw
  }
}

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

function parseDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ── RSS / Atom parsing ────────────────────────────────────────────────────────

function parseRssFeed(xml) {
  const parsed = parser.parse(xml)

  // RSS 2.0
  const channel = parsed?.rss?.channel
  if (channel?.item) {
    return toArray(channel.item).map(item => {
      // RSS <link> can be a string or an object with CDATA
      const rawLink = item.link
      let link = ''
      if (typeof rawLink === 'string') link = rawLink
      else if (rawLink?.__cdata) link = rawLink.__cdata
      else if (item.guid) link = getRawText(item.guid)

      return {
        title: getRawText(item.title),
        link: link.trim(),
        description: getRawText(item.description) || getRawText(item['content:encoded']),
        pubDate: getRawText(item.pubDate),
        categories: toArray(item.category).map(c => getRawText(c)),
        enclosureUrl: item.enclosure?.['@_url'] || null,
      }
    })
  }

  // Atom (e.g. Reddit feeds)
  const feedRoot = parsed?.feed
  if (feedRoot?.entry) {
    return toArray(feedRoot.entry).map(entry => {
      const links = toArray(entry.link)
      const altLink = links.find(l => l['@_rel'] === 'alternate') || links[0]
      return {
        title: getRawText(entry.title),
        link: (altLink?.['@_href'] || '').trim(),
        description: getRawText(entry.summary) || getRawText(entry.content),
        pubDate: getRawText(entry.published) || getRawText(entry.updated),
        categories: [],
        enclosureUrl: null,
      }
    })
  }

  return []
}

// ── Feed fetching ─────────────────────────────────────────────────────────────

async function fetchFeedWithTimeout(source) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const res = await fetch(source.feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SpectateEsports/1.0 (+https://spectateesports.live)',
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, application/xml, */*',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const isXml = ct.includes('xml') || ct.includes('rss') || ct.includes('atom')
    if (!isXml) throw new Error(`Unexpected content-type: ${ct}`)
    const xml = await res.text()
    return parseRssFeed(xml)
  } finally {
    clearTimeout(timer)
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeArticle(raw, source) {
  const url = canonicalizeUrl(raw.link || '')
  if (!url) return null

  // Apply source-level filter; receives categories array and raw URL for flexible matching
  if (source.categoryFilter && !source.categoryFilter(raw.categories || [], raw.link || '')) {
    return null
  }

  return {
    id: hashUrl(url),
    title: stripHtml(raw.title || '').trim(),
    excerpt: truncate(stripHtml(raw.description || ''), 200),
    url,
    source: {
      id: source.id,
      name: source.name,
      baseUrl: source.baseUrl,
      reliability: source.reliability,
    },
    publishedAt: parseDate(raw.pubDate) || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    tags: {
      games: source.games,
      categories: [],
      entities: [],
    },
  }
}

// ── Entity tagging ────────────────────────────────────────────────────────────

function tagArticle(article, dynamicTeams = []) {
  const text = `${article.title} ${article.excerpt}`.toLowerCase()
  const allTeams = dynamicTeams.length > 0 ? dynamicTeams : TIER1_TEAMS_SERVER

  const matchedTeams = allTeams.filter(t => text.includes(t.toLowerCase()))
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

// ── Ingestion ─────────────────────────────────────────────────────────────────

async function fetchAndCacheNews(game) {
  const sources = NEWS_SOURCES.filter(s => !s.disabled && s.games.includes(game))

  // Read dynamic team list from KV (populated daily by ?mode=sync-teams cron).
  // Fall back to static TIER1_TEAMS_SERVER if KV is unavailable or empty.
  let dynamicTeams = TIER1_TEAMS_SERVER
  try {
    const stored = await kv.get('dota2:tier1_teams_dynamic_v1')
    if (Array.isArray(stored) && stored.length > 0) dynamicTeams = stored
  } catch {
    // Non-fatal - static list is a fine fallback
  }

  const results = await Promise.allSettled(sources.map(fetchFeedWithTimeout))

  const perSourceMeta = []
  let articles = []

  results.forEach((r, i) => {
    const src = sources[i]
    if (r.status === 'fulfilled') {
      const normalized = r.value.slice(0, MAX_PER_SOURCE)
        .map(item => normalizeArticle(item, src))
        .filter(Boolean)
      articles.push(...normalized)
      perSourceMeta.push({ id: src.id, name: src.name, count: normalized.length })
    } else {
      console.error(`[news] ${src.id} failed: ${r.reason?.message}`)
      perSourceMeta.push({ id: src.id, name: src.name, count: 0, error: r.reason?.message })
    }
  })

  // Drop stale articles
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000
  articles = articles.filter(a => new Date(a.publishedAt).getTime() > cutoff)

  // Deduplicate by URL hash
  const seen = new Set()
  articles = articles.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })

  // Tag each article with entities and categories
  articles = articles.map(a => tagArticle(a, dynamicTeams))

  // Sort: newest first, tiebreak by source reliability
  articles.sort((a, b) => {
    const diff = new Date(b.publishedAt) - new Date(a.publishedAt)
    return diff !== 0 ? diff : b.source.reliability - a.source.reliability
  })

  articles = articles.slice(0, MAX_TOTAL)

  const payload = {
    articles,
    meta: {
      sources: perSourceMeta,
      fetchedAt: new Date().toISOString(),
      cached: false,
    },
  }

  // Never cache an empty result (KV poison prevention)
  if (articles.length > 0) {
    kv.set(`news:articles:${game}:v1`, payload, { ex: NEWS_CACHE_TTL }).catch(err => {
      console.error('[news] KV write failed:', err?.message)
    })
  }

  return payload
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800')

  const game = req.query?.game || 'dota2'
  const limitParam = parseInt(req.query?.limit || '20', 10)
  const limit = Math.min(Math.max(1, limitParam), MAX_TOTAL)
  const categoryFilter = req.query?.category || null
  const sourceFilter = req.query?.source || null
  const bust = req.query?.bust === '1'
  const cacheKey = `news:articles:${game}:v1`

  if (bust) {
    await kv.del(cacheKey).catch(() => {})
    console.log('[news] cache cleared')
  }

  let result = null
  let served = false

  if (!bust) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        result = { ...cached, meta: { ...cached.meta, cached: true } }
        served = true
      }
    } catch (err) {
      console.warn('[news] KV read failed:', err?.message)
    }
  }

  if (!served) {
    try {
      result = await fetchAndCacheNews(game)
    } catch (err) {
      console.error('[news] ingestion failed:', err?.message)
      return res.status(200).json({
        articles: [],
        meta: { sources: [], fetchedAt: new Date().toISOString(), cached: false, error: err?.message },
      })
    }
  }

  let articles = result?.articles || []

  // Server-side filtering (client passes params; all articles already cached together)
  if (categoryFilter) {
    const cats = categoryFilter.split(',').map(c => c.trim().toLowerCase())
    articles = articles.filter(a =>
      a.tags.categories.some(c => cats.includes(c.toLowerCase()))
    )
  }

  if (sourceFilter) {
    const srcs = sourceFilter.split(',').map(s => s.trim().toLowerCase())
    articles = articles.filter(a => srcs.includes(a.source.id.toLowerCase()))
  }

  articles = articles.slice(0, limit)

  return res.status(200).json({
    articles,
    meta: {
      ...result?.meta,
      total: articles.length,
    },
  })
}

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'

import { get as httpsGet } from 'node:https'
import { createGunzip } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import { NEWS_SOURCES, PERMANENT_TIER1_NAMES, TIER1_TEAMS_SERVER, trackError } from './_shared.js'
import { parseLiquipediaTransfers, getCurrentTransferPage } from './_liquipedia.js'

const NEWS_CACHE_TTL = 30 * 60 // 30 min
const MAX_AGE_DAYS = 60
const MAX_PER_SOURCE = 25
const MAX_TOTAL = 60
const FEED_TIMEOUT_MS = 5000

const STEAM_JSON_SOURCE = {
  id: 'steam-news-api',
  name: 'Dota 2 Official',
  baseUrl: 'https://www.dota2.com',
  games: ['dota2'],
  reliability: 5,
  categoryFilter: null,
}

const LIQUIPEDIA_SOURCE = {
  id: 'liquipedia',
  name: 'Liquipedia',
  baseUrl: 'https://liquipedia.net',
  games: ['dota2'],
  reliability: 4,
  categoryFilter: null,
}

const CURRENTS_SOURCE = {
  id: 'currents',
  name: 'Currents',
  baseUrl: 'https://currentsapi.services',
  games: ['dota2'],
  reliability: 3,
  categoryFilter: null,
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Treat these as arrays even when there is only one element
  isArray: (name) => ['item', 'entry', 'category'].includes(name),
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

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'News'
  }
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

// ── Steam News JSON API ───────────────────────────────────────────────────────

async function fetchSteamJsonApi() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const res = await fetch(
      'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=20&maxlength=300&format=json',
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'SpectateEsports/1.0 (+https://spectateesports.live)' },
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const items = data?.appnews?.newsitems || []
    return items.map(item => ({
      title: stripHtml(item.title || ''),
      link: item.url || '',
      description: stripHtml(item.contents || ''),
      // Steam dates are Unix seconds, not milliseconds
      pubDate: item.date ? new Date(item.date * 1000).toISOString() : null,
      categories: Array.isArray(item.tags) ? item.tags.map(t => t.tag || t) : [],
      enclosureUrl: null,
      _feedlabel: item.feedlabel || null,
      _feedname: item.feedname || null,
    }))
  } finally {
    clearTimeout(timer)
  }
}

// ── HTTPS+gzip helper (Liquipedia requires Accept-Encoding: gzip) ────────────

function httpsGetGzip(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = httpsGet(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'SpectateEsports/1.0 (contact: admin@spectateesports.live)',
          'Accept-Encoding': 'gzip',
          'Accept': 'application/json',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const enc = (res.headers['content-encoding'] || '').toLowerCase()
        const stream = enc === 'gzip' ? res.pipe(createGunzip()) : res
        const chunks = []
        stream.on('data', c => chunks.push(c))
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        stream.on('error', reject)
      }
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'))
    })
  })
}

// ── Liquipedia Transfers ──────────────────────────────────────────────────────

async function fetchLiquipediaTransfers() {
  const page = getCurrentTransferPage()
  const url = `https://liquipedia.net/dota2/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`
  const text = await httpsGetGzip(url)
  const data = JSON.parse(text)
  const html = data?.parse?.text?.['*'] || ''
  if (!html) throw new Error('Empty Liquipedia response')
  return parseLiquipediaTransfers(html)
}

// ── Currents API ──────────────────────────────────────────────────────────────

async function fetchCurrentsApi() {
  const apiKey = process.env.CURRENTS_API_KEY
  if (!apiKey) return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const url = new URL('https://api.currentsapi.services/v1/search')
    url.searchParams.set('keywords', 'dota 2')
    url.searchParams.set('language', 'en')
    url.searchParams.set('apiKey', apiKey)

    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const items = data?.news || []
    return items
      // Currents keyword search is broad — filter to articles that actually mention Dota
      .filter(item => `${item.title} ${item.description}`.toLowerCase().includes('dota'))
      .map(item => ({
        title: item.title || '',
        link: item.url || '',
        description: item.description || '',
        // Currents dates come as "2026-05-17 10:30:00 +0000" — not reliably parsed by new Date()
        pubDate: item.published
          ? item.published.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/, '$1T$2$3')
          : null,
        categories: Array.isArray(item.category) ? item.category : [],
        enclosureUrl: null,
      }))
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

  const isDota2 = game === 'dota2'

  const [rssResults, steamJsonItems, liquipediaItems, currentsItems] = await Promise.all([
    Promise.allSettled(sources.map(fetchFeedWithTimeout)),
    fetchSteamJsonApi().catch(err => { console.error('[news] steam-json failed:', err?.message); return [] }),
    isDota2 ? fetchLiquipediaTransfers().catch(err => { console.error('[news] liquipedia failed:', err?.message); return [] }) : Promise.resolve([]),
    fetchCurrentsApi().catch(err => { console.error('[news] currents failed:', err?.message); return [] }),
  ])

  const perSourceMeta = []
  let articles = []

  // RSS sources
  rssResults.forEach((r, i) => {
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

  // Steam News JSON API — use feedlabel as source name when available (e.g. "PCGamesN")
  if (steamJsonItems.length > 0) {
    const normalized = steamJsonItems.slice(0, MAX_PER_SOURCE)
      .map(({ _feedlabel, _feedname, ...item }) => {
        const src = _feedlabel
          ? { ...STEAM_JSON_SOURCE, name: _feedlabel, id: `steam-${(_feedname || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || 'other'}` }
          : STEAM_JSON_SOURCE
        return normalizeArticle(item, src)
      })
      .filter(Boolean)
    articles.push(...normalized)
    perSourceMeta.push({ id: STEAM_JSON_SOURCE.id, name: 'Steam News API', count: normalized.length })
  }

  // Liquipedia transfer news
  if (liquipediaItems.length > 0) {
    const normalized = liquipediaItems.slice(0, MAX_PER_SOURCE)
      .map(item => normalizeArticle(item, LIQUIPEDIA_SOURCE))
      .filter(Boolean)
    articles.push(...normalized)
    perSourceMeta.push({ id: LIQUIPEDIA_SOURCE.id, name: LIQUIPEDIA_SOURCE.name, count: normalized.length })
  }

  // Currents API — label each article by its publisher's domain
  if (currentsItems.length > 0) {
    const normalized = currentsItems.slice(0, MAX_PER_SOURCE)
      .map(item => normalizeArticle(item, { ...CURRENTS_SOURCE, name: domainFromUrl(item.link) }))
      .filter(Boolean)
    articles.push(...normalized)
    perSourceMeta.push({ id: CURRENTS_SOURCE.id, name: 'Currents API', count: normalized.length })
  }

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
      await trackError('/api/news', 500, err?.message)
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

  if (req.query?.format === 'rss') {
    const rssItems = articles.map(a => {
      const safeTitle = escapeXml(a.title || '')
      const safeDesc = escapeXml(a.excerpt || '')
      const safeLink = escapeXml(a.url || '')
      const safeGuid = escapeXml(a.url || '')
      const pubDate = a.publishedAt ? new Date(a.publishedAt).toUTCString() : ''
      return `    <item>
      <title>${safeTitle}</title>
      <link>${safeLink}</link>
      <description>${safeDesc}</description>
      <guid isPermaLink="true">${safeGuid}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
    </item>`
    }).join('\n')

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
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

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    return res.status(200).send(rss)
  }

  return res.status(200).json({
    articles,
    meta: {
      ...result?.meta,
      total: articles.length,
    },
  })
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

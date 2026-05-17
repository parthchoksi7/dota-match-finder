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

// ── Liquipedia Transfers ──────────────────────────────────────────────────────

function parseLiquipediaTransfers(html) {
  const articles = []
  const sevenDaysAgo = Date.now() - 7 * 86400_000
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || []

  for (const row of rows) {
    if (/<th/i.test(row)) continue

    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    if (tds.length < 4) continue

    const dateText = stripHtml(tds[0][1]).trim()
    const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue

    const date = new Date(dateMatch[1])
    if (isNaN(date.getTime()) || date.getTime() < sevenDaysAgo) continue

    const playerHtml = tds[1][1]
    const playerName = stripHtml(playerHtml).trim()
    const playerPathMatch = playerHtml.match(/href="(\/dota2\/[^"#?]+)"/)
    const playerPath = playerPathMatch?.[1]

    if (!playerName || playerName === '—' || playerName === '-') continue

    const fromTeam = stripHtml(tds[2][1]).trim()
    const toTeam = stripHtml(tds[3][1]).trim()
    const transferType = tds[4] ? stripHtml(tds[4][1]).trim() : ''

    if (!toTeam || toTeam === '—' || toTeam === '-') continue

    const hasPrevTeam = fromTeam && fromTeam !== '—' && fromTeam !== '-'
    const title = hasPrevTeam
      ? `${playerName} joins ${toTeam}`
      : `${playerName} signs with ${toTeam}`
    const excerpt = [
      hasPrevTeam ? `${fromTeam} → ${toTeam}` : toTeam,
      transferType ? `(${transferType})` : '',
    ].filter(Boolean).join(' ')

    // Append date as fragment so each transfer gets a unique URL (prevents dedup across multiple
    // transfers by the same player in the same week)
    const transferDate = dateMatch[1]
    const baseUrl = playerPath
      ? `https://liquipedia.net${playerPath}`
      : `https://liquipedia.net/dota2/Portal:Transfers`
    articles.push({
      title,
      link: `${baseUrl}#${transferDate}`,
      description: excerpt,
      pubDate: date.toISOString(),
      categories: ['roster'],
      enclosureUrl: null,
    })
  }

  return articles
}

async function fetchLiquipediaTransfers() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(
      'https://liquipedia.net/dota2/api.php?action=parse&page=Portal:Transfers&prop=text&format=json',
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SpectateEsports/1.0 (contact: admin@spectateesports.live)',
          'Accept-Encoding': 'gzip',
          'Accept': 'application/json',
        },
      }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const html = data?.parse?.text?.['*'] || ''
    if (!html) throw new Error('Empty Liquipedia response')
    return parseLiquipediaTransfers(html)
  } finally {
    clearTimeout(timer)
  }
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
    return items.map(item => ({
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

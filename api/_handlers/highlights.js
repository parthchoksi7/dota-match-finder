import { kv } from '../_kv.js'
import { createLogger } from '../_shared.js'

const YT_HIGHLIGHTS_TTL = 60 * 60 * 6 // 6 hours
const YT_HIGHLIGHTS_MAX_AGE_DAYS = 90

// Maps tournament name keywords to the official YouTube channel for that org.
// Channel IDs verified via youtube.com/channel/ URLs in May 2026.
const YT_CHANNEL_MAP = [
  { keywords: ['dreamleague', 'esl one'], channelId: 'UCaYLBJfw6d8XqmNlL204lNg', handle: '@ESLDota2' },
  { keywords: ['pgl', 'wallachia'],       channelId: 'UC5jpxDZx4yoBo324pMQ91Ww', handle: '@PGL_DOTA2' },
  { keywords: ['blast'],                  channelId: 'UCAvIC2XmBLLXFPdveirTrmw', handle: '@BLASTDota' },
  { keywords: ['weplay', 'omega league'], channelId: 'UCdIRwwGQY68S95bQuUVX0sA', handle: '@WePlayDota' },
  { keywords: ['the international', 'riyadh masters', 'beyond the summit'],
                                          channelId: 'UCTQKT5QqO3h7y32G8VzuySQ', handle: '@dota2' },
]

export default async function handleHighlights(req, res) {
  const log = createLogger('/api/tournaments?mode=highlights')
  const rawName = (req.query?.name || '').trim()
  if (!rawName) return res.status(400).json({ error: 'name param required' })
  const rawBeginAt = req.query?.beginAt || null
  const rawEndAt = req.query?.endAt || null

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    log.warn('YOUTUBE_API_KEY not set')
    return res.status(200).json({ videos: [], channelHandle: null })
  }

  const nameLower = rawName.toLowerCase()
  const channel = YT_CHANNEL_MAP.find(c => c.keywords.some(k => nameLower.includes(k)))
  if (!channel) return res.status(200).json({ videos: [], channelHandle: null })

  // Clean up the name to get the best YouTube search term:
  // - Strip stage suffixes like "- Group A", "- Group Stage", "- Playoffs", etc.
  // - Strip trailing year (ESL video titles don't include "2026")
  // - Strip "Season N": orgs use different conventions (ESL: "S29", BLAST: "VII",
  //   PGL: "Season 7"). The date filter (publishedAfter/publishedBefore) scopes to
  //   the correct season when tournament dates are available, making the season number
  //   in the search term redundant and harmful for Roman-numeral orgs like BLAST.
  const searchTerm = rawName
    .replace(/\s*[-–—]\s*(group [a-z]|group stage|playoffs|upper bracket|lower bracket|qualifier|open qualifier|closed qualifier|main event)\s*/gi, '')
    .replace(/\s+\d{4}\b/, '')
    .replace(/\bseason\s+\d+\b/gi, '')
    .trim()

  const slugKey = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)
  const dateKey = rawBeginAt ? new Date(rawBeginAt).toISOString().slice(0, 10) : 'nodate'
  const cacheKey = `dota2:yt_highlights:v1:${channel.channelId}:${slugKey}:${dateKey}`

  if (req.query?.bust !== '1') {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) return res.status(200).json({ ...cached, cached: true })
    } catch (e) {
      log.warn('KV read failed', { error: e?.message })
    }
  }

  // Date window: use tournament dates when available; else fall back to 90-day window.
  // Start 5 days before the event begin date to capture pre-event content (trailers,
  // team previews, day-0 uploads) that orgs post before the first match day.
  let publishedAfter, publishedBefore
  if (rawBeginAt) {
    const d = new Date(rawBeginAt)
    d.setUTCDate(d.getUTCDate() - 5)
    publishedAfter = d.toISOString()
  } else {
    publishedAfter = new Date(Date.now() - YT_HIGHLIGHTS_MAX_AGE_DAYS * 86400_000).toISOString()
  }
  if (rawEndAt) {
    const d = new Date(rawEndAt)
    d.setUTCDate(d.getUTCDate() + 1)
    publishedBefore = d.toISOString()
  }

  // Use uploads playlist (playlistItems.list) instead of search.list:
  // - No indexing lag: videos appear immediately after upload
  // - 1 quota unit vs 100 for search.list
  // Uploads playlist ID = channel ID with "UC" → "UU" prefix.
  // Fetch up to 2 pages of 50 (100 total) to cover multi-day tournaments where
  // channels post many clips/livestreams between match highlights.
  const uploadsPlaylistId = channel.channelId.replace(/^UC/, 'UU')
  const afterMs = new Date(publishedAfter).getTime()
  const beforeMs = publishedBefore ? new Date(publishedBefore).getTime() : Infinity

  let allItems = []
  let pageToken = null
  try {
    for (let page = 0; page < 2; page++) {
      const ytUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
      ytUrl.searchParams.set('part', 'snippet')
      ytUrl.searchParams.set('playlistId', uploadsPlaylistId)
      ytUrl.searchParams.set('maxResults', '50')
      ytUrl.searchParams.set('key', apiKey)
      if (pageToken) ytUrl.searchParams.set('pageToken', pageToken)

      const ytRes = await fetch(ytUrl.toString())
      if (!ytRes.ok) {
        const body = await ytRes.text()
        log.error('YouTube API error', { status: ytRes.status, body: body.slice(0, 200) })
        if (page === 0) return res.status(200).json({ videos: [], channelHandle: channel.handle, error: `YouTube ${ytRes.status}` })
        break
      }
      const ytData = await ytRes.json()
      const items = ytData.items || []
      allItems.push(...items)
      if (!ytData.nextPageToken) break
      // Early exit: if the oldest item on this page predates our window, stop paging.
      const oldestPub = items.length ? new Date(items[items.length - 1].snippet?.publishedAt || 0).getTime() : 0
      if (oldestPub < afterMs) break
      pageToken = ytData.nextPageToken
    }

    const videos = allItems
      .map(item => ({
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
        publishedAt: item.snippet?.publishedAt,
      }))
      .filter(v => {
        if (!v.videoId || !v.title) return false
        const pub = new Date(v.publishedAt).getTime()
        return pub >= afterMs && pub <= beforeMs
      })
      .slice(0, 30)

    const result = { videos, channelHandle: channel.handle }
    // Cache hits and misses. Empty results cached briefly (30 min) to avoid burning
    // YouTube API quota on repeated page loads when no videos exist yet.
    const ttl = videos.length > 0 ? YT_HIGHLIGHTS_TTL : 60 * 30
    kv.set(cacheKey, result, { ex: ttl }).catch(e => {
      log.error('KV write failed', { error: e?.message })
    })
    return res.status(200).json(result)
  } catch (err) {
    log.error('fetch error', { error: err?.message })
    return res.status(200).json({ videos: [], channelHandle: channel.handle, error: err?.message })
  }
}

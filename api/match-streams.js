import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'
import { PANDASCORE_BASE, STREAM_TTL, getTwitchStreams, trackError, setCorsHeaders } from './_shared.js'

/**
 * Returns true if the PandaScore opponents fuzzy-match the two OpenDota team names.
 * Uses substring matching in both directions to handle name truncation on either side
 * (e.g. "BetBoom Team" vs "BetBoom", "Yakult Brothers" vs "Yakult S Brothers").
 */
function teamsMatch(psOpponents, radiantTeam, direTeam) {
  if (!psOpponents || psOpponents.length < 2) return false
  const names = psOpponents.map(o => o.opponent?.name?.toLowerCase() || '')
  const r = radiantTeam?.toLowerCase() || ''
  const d = direTeam?.toLowerCase() || ''
  if (!r || !d) return false
  const matchesOne = (psName, odName) => psName.includes(odName) || odName.includes(psName)
  return (matchesOne(names[0], r) || matchesOne(names[0], d)) &&
         (matchesOne(names[1], r) || matchesOne(names[1], d))
}

async function getOrFetchTwitchToken() {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const cached = await kv.get('twitch:token:v1')
    if (cached) return cached
  } catch {}
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    )
    if (!tokenRes.ok) return null
    const { access_token, expires_in } = await tokenRes.json()
    const payload = { token: access_token, clientId }
    const ttl = Math.max(3600, (expires_in || 5_184_000) - 3600)
    kv.set('twitch:token:v1', payload, { ex: ttl }).catch(() => {})
    return payload
  } catch (err) {
    console.error('Twitch token fetch failed:', err?.message)
    return null
  }
}

function parseTwitchDuration(duration) {
  if (duration == null || typeof duration !== 'string') return 0
  const match = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  if (!match) return 0
  const hours = parseInt(match[1] || 0, 10)
  const minutes = parseInt(match[2] || 0, 10)
  const seconds = parseInt(match[3] || 0, 10)
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * GET /api/match-streams?ids=123,456&ts=1234567890&radiantTeam=Tundra&direTeam=REKONIX
 *
 * Lookup flow per match ID:
 * 1. KV `stream:match:{id}` — fast path, written when external_identifier is available
 *    or when a prior PandaScore fuzzy match cached it.
 * 2. PandaScore fuzzy match — query by ±1h time window, match by team names.
 *    Caches result to KV for future lookups.
 * 3. ts fallback — if fuzzy match finds nothing, read `stream:ts:{bucket}` which now
 *    stores a JSON array of all channels that were live in that time window.
 *    Returned as `_candidates` so the frontend can narrow its Twitch VOD search.
 *
 * GET /api/match-streams?mode=twitch-vod&channel={channel}&ts={matchStartTime}
 * Fetches the Twitch VOD for a match server-side. OAuth token never reaches the browser.
 * Caches channel user-id (30d) and VOD result (24h hit / 30min miss) in KV.
 */
export default async function handler(req, res) {
  if (setCorsHeaders(req, res, { allowAll: true })) return

  if (req.query?.mode === 'twitch-vod') {
    const { channel, ts } = req.query
    if (!channel || !ts) return res.status(400).json({ error: 'channel and ts required' })
    const matchStartTime = parseInt(ts, 10)
    if (isNaN(matchStartTime)) return res.status(400).json({ error: 'ts must be a number' })

    const dayBucket = Math.floor(matchStartTime / 86400)
    const vodCacheKey = `twitch:vod:v1:${channel}:${dayBucket}`

    try {
      const cached = await kv.get(vodCacheKey)
      if (cached !== null) return res.status(200).json(cached)
    } catch {}

    const auth = await getOrFetchTwitchToken()
    if (!auth) return res.status(503).json({ error: 'Twitch credentials not configured' })

    const headers = {
      'Client-ID': auth.clientId,
      'Authorization': `Bearer ${auth.token}`,
    }

    try {
      // Resolve channel login → user_id (cached 30d)
      const uidCacheKey = `twitch:channel-uid:v1:${channel}`
      let userId
      try { userId = await kv.get(uidCacheKey) } catch {}

      if (!userId) {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers })
        if (!userRes.ok) return res.status(502).json({ error: 'Twitch users fetch failed' })
        const userData = await userRes.json()
        userId = userData.data?.[0]?.id
        if (!userId) {
          const miss = { url: null, channel }
          kv.set(vodCacheKey, miss, { ex: 1800 }).catch(() => {})
          return res.status(200).json(miss)
        }
        kv.set(uidCacheKey, userId, { ex: 30 * 24 * 3600 }).catch(() => {})
      }

      const vodRes = await fetch(
        `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=30`,
        { headers }
      )
      if (!vodRes.ok) return res.status(502).json({ error: 'Twitch videos fetch failed' })
      const vodData = await vodRes.json()

      for (const vod of vodData.data || []) {
        const vodStart = new Date(vod.created_at).getTime() / 1000
        const vodEnd = vodStart + parseTwitchDuration(vod.duration)
        if (matchStartTime >= vodStart && matchStartTime <= vodEnd) {
          const offset = Math.floor(matchStartTime - vodStart + 600)
          const result = {
            url: `https://www.twitch.tv/videos/${vod.id}?t=${offset}s`,
            channel,
            startedAt: vod.created_at,
          }
          kv.set(vodCacheKey, result, { ex: 24 * 3600 }).catch(() => {})
          return res.status(200).json(result)
        }
      }

      const miss = { url: null, channel }
      kv.set(vodCacheKey, miss, { ex: 1800 }).catch(() => {})
      return res.status(200).json(miss)
    } catch (err) {
      console.error('twitch-vod fetch failed:', err?.message)
      await trackError('/api/match-streams', 502, err?.message)
      return res.status(502).json({ error: 'Twitch VOD fetch failed' })
    }
  }

  const { ids, ts, radiantTeam, direTeam } = req.query
  if (!ids) return res.status(400).json({ error: 'ids required' })

  const result = {}

  const matchIds = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)

  // Step 1: KV lookup by match ID
  try {
    if (matchIds.length > 0) {
      const keys = matchIds.map(id => `stream:match:${id}`)
      const values = await kv.mget(...keys)
      matchIds.forEach((id, i) => { if (values[i]) result[id] = values[i] })
    }
  } catch (err) {
    console.warn('match-streams KV read failed:', err?.message)
  }

  const missingIds = matchIds.filter(id => !result[id])

  // Step 2: PandaScore fuzzy match for missing IDs
  if (missingIds.length > 0 && ts && radiantTeam && direTeam && process.env.PANDASCORE_TOKEN) {
    try {
      const startTime = parseInt(ts, 10)
      if (!isNaN(startTime)) {
        const startIso = new Date((startTime - 3600) * 1000).toISOString()
        const endIso = new Date((startTime + 3600) * 1000).toISOString()
        const psRes = await fetch(
          `${PANDASCORE_BASE}/matches?range[begin_at]=${startIso},${endIso}&sort=begin_at&page[size]=20`,
          { headers: { Authorization: `Bearer ${process.env.PANDASCORE_TOKEN}`, Accept: 'application/json' } }
        )
        if (psRes.ok) {
          const psMatches = await psRes.json()
          const psMatch = (psMatches || []).find(m => teamsMatch(m.opponents, radiantTeam, direTeam))
          if (psMatch) {
            // Log all streams PandaScore returned so we can debug VOD misses
            const allStreams = (psMatch.streams_list || []).map(s => `${s.language}|official=${s.official}|main=${s.main}|${s.raw_url}`)
            console.log(`match-streams PandaScore streams for ${radiantTeam} vs ${direTeam}: [${allStreams.join(', ')}]`)

            // Use getTwitchStreams — same logic as live/upcoming matches:
            // prefers English, falls back to any-language official, then static mapping.
            const streams = getTwitchStreams(
              psMatch.streams_list,
              psMatch.league?.name,
              psMatch.serie?.full_name || psMatch.serie?.name
            )
            if (streams.length > 0) {
              const channel = streams[0].url.replace('https://www.twitch.tv/', '')
              for (const id of missingIds) {
                result[id] = channel
                kv.set(`stream:match:${id}`, channel, { ex: STREAM_TTL }).catch(() => {})
              }
              console.log(`match-streams fuzzy: ${radiantTeam} vs ${direTeam} → ${channel}`)
            }
          }
        }
      }
    } catch (err) {
      console.warn('match-streams PandaScore fuzzy match failed:', err?.message)
    }
  }

  // Step 3: ts fallback — return candidate channels from the time bucket
  const stillMissing = matchIds.filter(id => !result[id])
  if (stillMissing.length > 0 && ts) {
    try {
      const rawTs = parseInt(ts, 10)
      if (!isNaN(rawTs)) {
        const rounded = Math.floor(rawTs / 300) * 300
        const tsKeys = [rounded - 300, rounded, rounded + 300].map(t => `stream:ts:${t}`)
        const tsValues = await kv.mget(...tsKeys)
        const hit = tsValues.find(v => v != null)
        if (hit) {
          // New format: JSON array of channels. Legacy format: plain string.
          result._candidates = Array.isArray(hit) ? hit : [hit]
        }
      }
    } catch (err) {
      console.warn('match-streams ts fallback failed:', err?.message)
    }
  }

  return res.status(200).json(result)
}

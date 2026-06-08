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
 * GET /api/match-streams?mode=twitch-token
 * Returns a short-lived Twitch OAuth token for the frontend to use with Twitch Helix API.
 * TWITCH_CLIENT_SECRET stays server-side only; the client never sees it.
 * Token is cached in KV for ~50 days (re-fetched 1h before Twitch expires it).
 */
export default async function handler(req, res) {
  // twitch-token returns a live OAuth token — restrict to our origin only
  const isPublicMode = req.query?.mode !== 'twitch-token'
  if (setCorsHeaders(req, res, { allowAll: isPublicMode })) return

  if (req.query?.mode === 'twitch-token') {
    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: 'Twitch credentials not configured' })
    }
    try {
      const cached = await kv.get('twitch:token:v1')
      if (cached) return res.status(200).json(cached)
    } catch {}
    try {
      const tokenRes = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
        { method: 'POST' }
      )
      if (!tokenRes.ok) return res.status(502).json({ error: 'Twitch token fetch failed' })
      const { access_token, expires_in } = await tokenRes.json()
      const payload = { token: access_token, clientId }
      const ttl = Math.max(3600, (expires_in || 5_184_000) - 3600)
      kv.set('twitch:token:v1', payload, { ex: ttl }).catch(() => {})
      return res.status(200).json(payload)
    } catch (err) {
      console.error('twitch-token fetch failed:', err?.message)
      await trackError('/api/match-streams', 502, err?.message)
      return res.status(502).json({ error: 'Twitch token fetch failed' })
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

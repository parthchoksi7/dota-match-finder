import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

import { PANDASCORE_BASE, STREAM_TTL } from './_shared.js'

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
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

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
            const official = (psMatch.streams_list || []).filter(s => s.official && s.language === 'en' && s.raw_url)
            const mainStreams = official.filter(s => s.main)
            const candidate = mainStreams.length === 1 ? mainStreams[0]
                            : official.length === 1   ? official[0]
                            : null
            if (candidate) {
              const channel = candidate.raw_url.replace('https://www.twitch.tv/', '')
              for (const id of missingIds) {
                result[id] = channel
                kv.set(`stream:match:${id}`, channel, { ex: STREAM_TTL }).catch(() => {})
              }
              console.log(`match-streams fuzzy match: ${radiantTeam} vs ${direTeam} → ${channel}`)
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

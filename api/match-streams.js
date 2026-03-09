import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

/**
 * GET /api/match-streams?ids=123,456,789
 *
 * Returns a map of matchId → channel name for matches where we recorded
 * which Twitch channel was streaming it live. Used to skip the "guess which
 * stream" step in the VOD drawer.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { ids, ts } = req.query
  if (!ids && !ts) return res.status(400).json({ error: 'ids or ts required' })

  const result = {}

  try {
    if (ids) {
      const matchIds = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
      if (matchIds.length > 0) {
        const keys = matchIds.map(id => `stream:match:${id}`)
        const values = await kv.mget(...keys)
        matchIds.forEach((id, i) => { if (values[i]) result[id] = values[i] })
      }
    }

    if (ts) {
      // Look up by game start timestamp (rounded to 5 min to handle PandaScore vs OpenDota drift).
      // Try the rounded bucket and the one before/after to absorb edge-of-window mismatches.
      const rawTs = parseInt(ts, 10)
      if (!isNaN(rawTs)) {
        const rounded = Math.floor(rawTs / 300) * 300
        const candidates = [rounded - 300, rounded, rounded + 300]
        const tsKeys = candidates.map(t => `stream:ts:${t}`)
        const tsValues = await kv.mget(...tsKeys)
        const hit = tsValues.find(v => v != null)
        if (hit) result[ts] = hit
      }
    }
  } catch (err) {
    console.warn('match-streams KV read failed:', err?.message)
  }

  return res.status(200).json(result)
}

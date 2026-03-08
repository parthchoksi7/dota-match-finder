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

  const { ids } = req.query
  if (!ids) return res.status(400).json({ error: 'ids required' })

  const matchIds = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
  if (matchIds.length === 0) return res.status(200).json({})

  try {
    const keys = matchIds.map(id => `stream:match:${id}`)
    const values = await kv.mget(...keys)
    const result = {}
    matchIds.forEach((id, i) => {
      if (values[i]) result[id] = values[i]
    })
    return res.status(200).json(result)
  } catch (err) {
    console.warn('match-streams KV read failed:', err?.message)
    return res.status(200).json({}) // graceful degradation
  }
}

import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:grand_final_match_ids_v1'
const TTL = 60 * 60 // 1 hour

const PANDASCORE_BASE = 'https://api.pandascore.co'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured', matchIds: [] })
  }

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    console.log('Grand finals cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      console.log('Grand finals: serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('Grand finals KV cache read failed:', err?.message)
  }

  try {
    console.log('Grand finals: fetching from PandaScore')
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

    // Fetch recent past Dota 2 matches; filter for Grand Final stage server-side
    const response = await fetch(
      `${PANDASCORE_BASE}/dota2/matches/past?sort=-end_at&page[size]=100`,
      { headers }
    )
    if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)

    const data = await response.json()
    const grandFinals = (data || []).filter(m =>
      m.tournament?.name?.toLowerCase().includes('grand final')
    )

    // Extract OpenDota match IDs via game.external_identifier
    const matchIds = []
    for (const m of grandFinals) {
      for (const g of m.games || []) {
        if (g.external_identifier) {
          matchIds.push(String(g.external_identifier))
        }
      }
    }

    console.log(`Grand finals: found ${grandFinals.length} GF series, ${matchIds.length} match IDs`)

    const payload = { matchIds, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('Grand finals KV cache write failed:', err?.message)
    }

    return res.status(200).json(payload)
  } catch (err) {
    console.error('Grand finals error:', err?.message || err)
    // Fail open — return empty list so the UI degrades gracefully
    return res.status(200).json({ matchIds: [], fetchedAt: new Date().toISOString(), error: err?.message })
  }
}

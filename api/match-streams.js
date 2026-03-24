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

  // Fallback: for any match IDs still missing from KV, fetch the match from PandaScore
  // to get the authoritative streams_list. This handles completed ESL One matches where
  // the KV entry was never written (or stored the wrong main channel and was skipped).
  if (ids && process.env.PANDASCORE_TOKEN) {
    const allIds = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
    const missingIds = allIds.filter(id => !result[id])
    if (missingIds.length > 0) {
      await Promise.all(missingIds.map(async (id) => {
        try {
          const r = await fetch(
            `https://api.pandascore.co/dota2/matches/${id}`,
            { headers: { Authorization: `Bearer ${process.env.PANDASCORE_TOKEN}`, Accept: 'application/json' } }
          )
          if (!r.ok) return
          const m = await r.json()
          const official = (m.streams_list || []).filter(s => s.official && s.language === 'en' && s.raw_url)
          // Prefer the stream marked main:true — that's the sub-channel designated for this specific
          // match. Falls back to the single-stream case for tournaments with only one channel.
          const mainStreams = official.filter(s => s.main)
          const candidate = mainStreams.length === 1 ? mainStreams[0]
                          : official.length === 1   ? official[0]
                          : null
          if (candidate) {
            const channel = candidate.raw_url.replace('https://www.twitch.tv/', '')
            // Skip esl_dota2 main for ESL One -- it's unreliable (PandaScore lists it even when
            // the actual broadcast is on a sub-channel like esl_dota2storm or esl_dota2earth).
            const tournamentName = ((m.league?.name || '') + ' ' + (m.serie?.full_name || '')).toLowerCase()
            if (channel === 'esl_dota2' && tournamentName.includes('esl one')) return
            result[id] = channel
            // Cache so we don't call PandaScore again for this match
            kv.set(`stream:match:${id}`, channel, { ex: 60 * 60 * 24 * 14 }).catch(() => {})
          }
        } catch { /* best effort */ }
      }))
    }
  }

  return res.status(200).json(result)
}

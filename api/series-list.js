import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'tournaments:dota2:series_list_v1'
const TTL = 60 * 60 // 1 hour

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

const TIER1_KEYWORDS = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters'
]

function isTier1(leagueName, serieName) {
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()
  return TIER1_KEYWORDS.some(k => lower.includes(k))
}

function getSeriesStatus(serie, runningIds, upcomingIds) {
  if (runningIds.has(serie.id)) return 'live'
  if (upcomingIds.has(serie.id)) return 'upcoming'
  return 'completed'
}

function formatPrizePool(prize) {
  if (!prize) return null
  const match = String(prize).match(/[\d,]+/)
  if (!match) return prize
  const num = parseInt(match[0].replace(/,/g, ''))
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
  return `$${num}`
}

function mapSeries(serie, status) {
  const leagueName = serie.league?.name || ''
  const fullName = serie.full_name || serie.name || leagueName
  const prizePool = formatPrizePool(serie.prizepool)

  return {
    id: serie.id,
    slug: serie.slug || String(serie.id),
    name: fullName,
    leagueName,
    leagueSlug: serie.league?.slug || '',
    status,
    beginAt: serie.begin_at || null,
    endAt: serie.end_at || null,
    prizePool,
    location: serie.league?.name || null,
    tier: serie.tournaments?.[0]?.tier || null,
    tournamentCount: (serie.tournaments || []).length,
    tournaments: (serie.tournaments || []).map(t => ({
      id: t.id,
      name: t.name,
      beginAt: t.begin_at || null,
      endAt: t.end_at || null,
      tier: t.tier || null,
      prizePool: formatPrizePool(t.prizepool),
    })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    console.log('Series list cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      console.log('Series list: serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  try {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

    const [runningRes, upcomingRes, pastRes] = await Promise.all([
      fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=20`, { headers }),
      fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=20`, { headers }),
      fetch(`${PANDASCORE_BASE}/series/past?sort=-end_at&page[size]=10`, { headers }),
    ])

    if (!runningRes.ok || !upcomingRes.ok || !pastRes.ok) {
      throw new Error(`PandaScore error: ${runningRes.status} / ${upcomingRes.status} / ${pastRes.status}`)
    }

    const [running, upcoming, past] = await Promise.all([
      runningRes.json(),
      upcomingRes.json(),
      pastRes.json(),
    ])

    const runningIds = new Set((running || []).map(s => s.id))
    const upcomingIds = new Set((upcoming || []).map(s => s.id))

    const tier1Running = (running || [])
      .filter(s => isTier1(s.league?.name, s.full_name || s.name))
      .map(s => mapSeries(s, 'live'))

    const tier1Upcoming = (upcoming || [])
      .filter(s => isTier1(s.league?.name, s.full_name || s.name))
      .map(s => mapSeries(s, 'upcoming'))

    const tier1Past = (past || [])
      .filter(s => isTier1(s.league?.name, s.full_name || s.name))
      .slice(0, 5)
      .map(s => mapSeries(s, 'completed'))

    const payload = {
      live: tier1Running,
      upcoming: tier1Upcoming,
      completed: tier1Past,
      fetchedAt: new Date().toISOString(),
    }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    return res.status(200).json(payload)

  } catch (err) {
    console.error('Series list error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

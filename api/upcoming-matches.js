import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:upcoming_matches_v4'
const TTL = 60 * 15 // 15 minutes

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

import { isTier1, isTier1ByName, getTwitchStreams, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES } from './_shared.js'

function getSeriesLabel(matchType, numberOfGames) {
  if (matchType === 'best_of_1') return 'BO1'
  if (matchType === 'best_of_2') return 'BO2'
  if (matchType === 'best_of_3') return 'BO3'
  if (matchType === 'best_of_5') return 'BO5'
  if (matchType === 'best_of' && numberOfGames) return `BO${numberOfGames}`
  return null
}

function buildTournamentName(m) {
  const league = m.league?.name || ''
  const serie = m.serie?.full_name || m.serie?.name || ''
  const rawName = league && serie
    ? (serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`)
    : league || serie || 'Unknown'
  return rawName
    .replace(/\bseason\s+(\d+)\b/gi, 'S$1')
    .replace(/\s+\d{4}$/, '')
    .trim()
}

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const leagueName = m.league?.name || ''
  const serieName = m.serie?.full_name || m.serie?.name || ''

  return {
    id: m.id,
    scheduledAt: m.scheduled_at || m.begin_at || null,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    streams: getTwitchStreams(m.streams_list, leagueName, serieName),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    console.log('Upcoming matches cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      console.log('Upcoming matches: serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  try {
    console.log('Upcoming matches: fetching from PandaScore')
    const now = new Date()
    const cutoff = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    const url = `${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=50&range[scheduled_at]=${now.toISOString()},${cutoff}`

    // Fetch tier1 names alongside matches — used as a fallback when PandaScore
    // hasn't assigned a tier to a new series yet (e.g. DreamLeague S29 at launch).
    const [response, tier1Names] = await Promise.all([
      fetch(url, { headers }),
      kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
    ])
    if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)

    const names = [...new Set([
      ...(Array.isArray(tier1Names) ? tier1Names.map(n => n.toLowerCase()) : []),
      ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
    ])]
    const data = await response.json()
    const matches = (data || [])
      .filter(m => isTier1(m) || isTier1ByName(m, names))
      .filter(m => m.opponents?.length === 2)
      .map(mapMatch)

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    return res.status(200).json(payload)

  } catch (err) {
    console.error('Upcoming matches error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch upcoming matches', message: err?.message })
  }
}

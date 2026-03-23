import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:upcoming_matches_v1'
const TTL = 60 * 15 // 15 minutes

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

import { isTier1 } from './_shared.js'

function getSeriesLabel(matchType) {
  if (matchType === 'best_of_1') return 'BO1'
  if (matchType === 'best_of_2') return 'BO2'
  if (matchType === 'best_of_3') return 'BO3'
  if (matchType === 'best_of_5') return 'BO5'
  return null
}

function getTwitchStreams(leagueName, serieName) {
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()
  if (lower.includes('pgl')) return [
    { label: 'PGL', url: 'https://twitch.tv/pgl_dota2' },
    { label: 'PGL (EN2)', url: 'https://twitch.tv/pgl_dota2en2' },
  ]
  if (lower.includes('esl one')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
    { label: 'ESL Storm', url: 'https://twitch.tv/esl_dota2storm' },
    { label: 'ESL Earth', url: 'https://twitch.tv/esl_dota2earth' },
  ]
  if (lower.includes('dreamleague')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
  ]
  if (lower.includes('beyond the summit') || lower.includes('bts')) return [
    { label: 'BTS', url: 'https://twitch.tv/beyond_the_summit' },
  ]
  if (lower.includes('blast')) return [
    { label: 'BLAST', url: 'https://twitch.tv/blast_dota2' },
  ]
  if (lower.includes('weplay')) return [
    { label: 'WePlay', url: 'https://twitch.tv/weplaydota' },
  ]
  if (lower.includes('the international') || lower.includes(' ti ')) return [
    { label: 'TI', url: 'https://twitch.tv/dota2ti' },
  ]
  return []
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
    seriesLabel: getSeriesLabel(m.match_type),
    streams: getTwitchStreams(leagueName, serieName),
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

    const response = await fetch(url, { headers })
    if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)

    const data = await response.json()
    const matches = (data || [])
      .filter(m => isTier1(m.league?.name, m.serie?.full_name))
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

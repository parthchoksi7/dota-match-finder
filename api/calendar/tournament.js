import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
import { generateCalendar, generateMatchEvent, generateTournamentEvent, formatDateUTC } from './ics-utils.js'

dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'
const TTL = 60 * 30 // 30 minutes

async function fetchSeriesData(seriesId, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  const [seriesRes, matchesRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/series/${seriesId}`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/${seriesId}/matches?sort=scheduled_at&page[size]=100`, { headers }),
  ])

  if (!seriesRes.ok) throw new Error(`PandaScore series lookup failed: ${seriesRes.status}`)

  const series = await seriesRes.json()
  const matches = matchesRes.ok ? await matchesRes.json() : []

  return { series, matches: Array.isArray(matches) ? matches : [] }
}

export default async function handler(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    res.status(503).send('PANDASCORE_TOKEN not configured')
    return
  }

  const seriesId = req.query?.series
  if (!seriesId) {
    res.status(400).send('Missing required parameter: series')
    return
  }

  const numericId = parseInt(seriesId, 10)
  if (isNaN(numericId) || numericId <= 0) {
    res.status(400).send('Invalid series ID')
    return
  }

  console.log(`calendar/tournament: request for series=${numericId}`)

  const cacheKey = `calendar:series:${numericId}`
  let cached = null
  try {
    cached = await kv.get(cacheKey)
    if (cached) console.log('calendar/tournament: serving from KV cache')
  } catch (err) {
    console.warn('KV read failed:', err?.message)
  }

  let series, matches
  if (cached) {
    series = cached.series
    matches = cached.matches
  } else {
    try {
      const result = await fetchSeriesData(numericId, token)
      series = result.series
      matches = result.matches

      try {
        await kv.set(cacheKey, { series, matches }, { ex: TTL })
      } catch (err) {
        console.warn('KV write failed:', err?.message)
      }
    } catch (err) {
      console.error('calendar/tournament error:', err?.message)
      res.status(500).send(`Failed to fetch tournament data: ${err.message}`)
      return
    }
  }

  console.log(`calendar/tournament: generating .ics for series=${numericId}, ${matches.length} matches`)

  const dtstamp = formatDateUTC(new Date())
  const eventBlocks = []

  // All-day series event
  const seriesEvent = generateTournamentEvent(series, dtstamp)
  if (seriesEvent) eventBlocks.push(seriesEvent)

  // Individual match events
  for (const match of matches) {
    const event = generateMatchEvent(match, dtstamp)
    if (event) eventBlocks.push(event)
  }

  const seriesName = series.full_name || series.name || `Series ${numericId}`
  const calName = `${seriesName} (Dota 2)`
  const icsContent = generateCalendar(calName, eventBlocks)

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `inline; filename="dota2-tournament-${numericId}.ics"`)
  res.setHeader('Cache-Control', 'public, max-age=1800')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).send(icsContent)
}

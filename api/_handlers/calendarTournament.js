import { kv } from '../_kv.js'
import { trackError, PANDASCORE_BASE } from '../_shared.js'
import {
  icalFormatDateUTC,
  icalMatchEvent,
  icalTournamentEvent,
  icalWrapCalendar,
  icalSeriesDisplayName,
  CAL_MATCHES_TTL,
} from './_ical.js'

export default async function handleCalendarTournament(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const seriesId = parseInt(req.query?.series, 10)
  if (!seriesId || seriesId <= 0) return res.status(400).send('Missing or invalid parameter: series')

  console.log(`calendar-tournament: series=${seriesId}`)
  const cacheKey = `calendar:series:${seriesId}`
  if (req.query?.bust === '1') { try { await kv.del(cacheKey) } catch {} }
  let cached = null
  try { cached = await kv.get(cacheKey) } catch {}

  let series, matches
  if (cached) {
    series = cached.series
    matches = cached.matches
  } else {
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      // Direct /series/{id} returns 404 on current plan tier - use filter[id] on list endpoints instead
      const [runSR, upSR, pastSR] = await Promise.all([
        fetch(`${PANDASCORE_BASE}/series/running?filter[id]=${seriesId}`, { headers }),
        fetch(`${PANDASCORE_BASE}/series/upcoming?filter[id]=${seriesId}`, { headers }),
        fetch(`${PANDASCORE_BASE}/series/past?filter[id]=${seriesId}`, { headers }),
      ])
      const toArr = async (r) => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
      const [runSD, upSD, pastSD] = await Promise.all([
        runSR.ok ? toArr(runSR) : Promise.resolve([]),
        upSR.ok ? toArr(upSR) : Promise.resolve([]),
        pastSR.ok ? toArr(pastSR) : Promise.resolve([]),
      ])
      series = [...runSD, ...upSD, ...pastSD][0]
      if (!series) throw new Error(`Series ${seriesId} not found`)
      // Fetch matches using filter[serie_id] on running/upcoming/past endpoints
      const [runMR, upMR, pastMR] = await Promise.all([
        fetch(`${PANDASCORE_BASE}/matches/running?filter[serie_id]=${seriesId}&page[size]=50`, { headers }),
        fetch(`${PANDASCORE_BASE}/matches/upcoming?filter[serie_id]=${seriesId}&sort=scheduled_at&page[size]=100`, { headers }),
        fetch(`${PANDASCORE_BASE}/matches/past?filter[serie_id]=${seriesId}&sort=-scheduled_at&page[size]=50`, { headers }),
      ])
      const [runMD, upMD, pastMD] = await Promise.all([
        runMR.ok ? toArr(runMR) : Promise.resolve([]),
        upMR.ok ? toArr(upMR) : Promise.resolve([]),
        pastMR.ok ? toArr(pastMR) : Promise.resolve([]),
      ])
      matches = [...runMD, ...upMD, ...pastMD]
      if (!Array.isArray(matches)) matches = []
      try { await kv.set(cacheKey, { series, matches }, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
    } catch (err) {
      console.error('calendar-tournament error:', err?.message)
      await trackError('/api/tournaments', 500, err?.message)
      return res.status(500).send(`Failed to fetch tournament data: ${err.message}`)
    }
  }

  const dtstamp = icalFormatDateUTC(new Date())
  const matchEnds = matches.map(m => new Date(m.end_at || m.begin_at || m.scheduled_at)).filter(d => !isNaN(d))
  const latestMatchEnd = matchEnds.length ? new Date(Math.max(...matchEnds.map(d => d.getTime()))) : null
  const eventBlocks = [icalTournamentEvent(series, dtstamp, latestMatchEnd), ...matches.map(m => icalMatchEvent(m, dtstamp))].filter(Boolean)
  const icsContent = icalWrapCalendar(icalSeriesDisplayName(series), eventBlocks)
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `inline; filename="dota2-tournament-${seriesId}.ics"`)
  res.setHeader('Cache-Control', 'public, max-age=1800')
  return res.status(200).send(icsContent)
}

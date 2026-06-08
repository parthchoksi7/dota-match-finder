import { kv } from '../_kv.js'
import { trackError, PANDASCORE_BASE } from '../_shared.js'
import {
  icalFormatDateUTC,
  icalMatchEvent,
  icalTournamentEvent,
  icalWrapCalendar,
  CAL_MATCHES_TTL,
} from './_ical.js'
import { isTier1 } from './_tournamentUtils.js'

export default async function handleCalendarAll(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const cacheKey = 'calendar:all'
  if (req.query?.bust === '1') { try { await kv.del(cacheKey) } catch {} }
  let cached = null
  try { cached = await kv.get(cacheKey) } catch {}

  let allSeries, allMatches
  if (cached) {
    allSeries = cached.allSeries
    allMatches = cached.allMatches
  } else {
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      const toArr = async (r) => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
      // Fetch series, matches, and tournaments in parallel.
      // Series objects have no tier field; derive tier from tournament objects (t.tier).
      const [runSerR, upSerR, runMatchR, upMatchR, runTourR, upTourR] = await Promise.all([
        fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=50`, { headers }),
        fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=50`, { headers }),
        fetch(`${PANDASCORE_BASE}/matches/running?sort=scheduled_at&page[size]=100`, { headers }),
        fetch(`${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=100`, { headers }),
        fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
        fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=100`, { headers }),
      ])
      const [runSer, upSer, runMatch, upMatch, runTour, upTour] = await Promise.all([
        runSerR.ok ? toArr(runSerR) : Promise.resolve([]),
        upSerR.ok ? toArr(upSerR) : Promise.resolve([]),
        runMatchR.ok ? toArr(runMatchR) : Promise.resolve([]),
        upMatchR.ok ? toArr(upMatchR) : Promise.resolve([]),
        runTourR.ok ? toArr(runTourR) : Promise.resolve([]),
        upTourR.ok ? toArr(upTourR) : Promise.resolve([]),
      ])
      // Build tier-1 serie_id set from tournament objects (which have t.tier populated).
      const calTier1SerieIds = new Set(
        [...(runTour || []), ...(upTour || [])].filter(isTier1).map(t => t.serie_id || t.serie?.id).filter(Boolean)
      )
      allSeries = [...runSer, ...upSer].filter(s => calTier1SerieIds.has(s.id))
      const tier1SerieIds = new Set(allSeries.map(s => s.id))
      allMatches = [...runMatch, ...upMatch].filter(m => {
        const sid = m.serie_id || m.serie?.id
        return sid && tier1SerieIds.has(sid)
      })
      try { await kv.set(cacheKey, { allSeries, allMatches }, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
    } catch (err) {
      console.error('calendar-all error:', err?.message)
      await trackError('/api/tournaments', 500, err?.message)
      return res.status(500).send(`Failed to fetch tournament data: ${err.message}`)
    }
  }

  const dtstamp = icalFormatDateUTC(new Date())
  // Build a map of latest match end per series for accurate banner event duration
  const matchEndBySeries = {}
  for (const m of allMatches) {
    const sid = m.serie_id || m.serie?.id
    if (!sid) continue
    const ts = new Date(m.end_at || m.begin_at || m.scheduled_at)
    if (isNaN(ts)) continue
    if (!matchEndBySeries[sid] || ts > matchEndBySeries[sid]) matchEndBySeries[sid] = ts
  }
  const seriesEvents = allSeries.map(s => icalTournamentEvent(s, dtstamp, matchEndBySeries[s.id] || null)).filter(Boolean)
  const matchEvents = allMatches.map(m => icalMatchEvent(m, dtstamp)).filter(Boolean)
  const icsContent = icalWrapCalendar('Dota 2 Esports', [...seriesEvents, ...matchEvents])
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="dota2-esports.ics"')
  res.setHeader('Cache-Control', 'public, max-age=1800')
  return res.status(200).send(icsContent)
}

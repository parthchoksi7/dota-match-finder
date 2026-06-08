import { kv } from '../_kv.js'
import { trackError } from '../_shared.js'
import {
  normalizeTeamSlug,
  calResolveTeamId,
  calFetchMatchesForTeam,
  icalFormatDateUTC,
  icalMatchEvent,
  icalWrapCalendar,
  CAL_MATCHES_TTL,
} from './_ical.js'

export default async function handleCalendarTeam(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const teamsParam = req.query?.teams || ''
  if (!teamsParam) {
    return res.status(400).send('Missing required parameter: teams')
  }
  const teamSlugs = teamsParam.split(',').map(s => s.trim()).filter(Boolean).map(normalizeTeamSlug).slice(0, 10)
  if (teamSlugs.length === 0) return res.status(400).send('No valid team slugs provided')

  console.log(`calendar-team: teams=${teamSlugs.join(',')}`)
  const cacheKey = `calendar:matches:${[...teamSlugs].sort().join(',')}`
  let matches = null
  try { matches = await kv.get(cacheKey) } catch {}

  if (!matches) {
    try {
      const teamIds = await Promise.all(teamSlugs.map(slug => calResolveTeamId(slug, token, kv)))
      const validIds = teamIds.filter(Boolean)
      if (validIds.length === 0) return res.status(404).send(`No teams found for: ${teamSlugs.join(', ')}`)
      const matchArrays = await Promise.all(validIds.map(id => calFetchMatchesForTeam(id, token).catch(() => [])))
      const seen = new Set()
      matches = []
      for (const arr of matchArrays) {
        for (const m of arr) { if (!seen.has(m.id)) { seen.add(m.id); matches.push(m) } }
      }
      matches.sort((a, b) => ((a.begin_at || a.scheduled_at || '') < (b.begin_at || b.scheduled_at || '') ? -1 : 1))
      try { await kv.set(cacheKey, matches, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
    } catch (err) {
      console.error('calendar-team error:', err?.message)
      await trackError('/api/tournaments', 500, err?.message)
      return res.status(500).send(`Failed to fetch match data: ${err.message}`)
    }
  }

  const dtstamp = icalFormatDateUTC(new Date())
  const eventBlocks = matches.map(m => icalMatchEvent(m, dtstamp)).filter(Boolean)
  const icsContent = icalWrapCalendar(`Dota 2 - ${teamSlugs.join(', ')}`, eventBlocks)
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="dota2-matches.ics"')
  res.setHeader('Cache-Control', 'public, max-age=1800')
  return res.status(200).send(icsContent)
}

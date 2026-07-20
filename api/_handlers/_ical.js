/**
 * iCal utilities for calendar feed modes.
 * Pure helpers — no HTTP calls except inside calResolveTeamId/calFetchMatchesForTeam.
 */

import { PANDASCORE_BASE } from '../_shared.js'

export const CRLF = '\r\n'

export function icalEscapeText(str) {
  if (!str) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function icalFoldLine(line) {
  if (line.length <= 75) return line
  const parts = []
  let pos = 0
  parts.push(line.slice(0, 75))
  pos = 75
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + 74))
    pos += 74
  }
  return parts.join(CRLF)
}

export function icalFormatDateUTC(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
}

export function icalFormatDateOnly(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
}

export function icalMatchDurationHours(matchType) {
  if (!matchType) return 2
  const lower = matchType.toLowerCase()
  if (lower.includes('best_of_1')) return 1
  if (lower.includes('best_of_5')) return 3
  return 2
}

export function icalFormatLabel(matchType) {
  if (!matchType) return 'Bo3'
  if (matchType === 'best_of_1') return 'Bo1'
  if (matchType === 'best_of_2') return 'Bo2'
  if (matchType === 'best_of_3') return 'Bo3'
  if (matchType === 'best_of_5') return 'Bo5'
  return matchType
}

export function icalMatchEvent(match, dtstamp) {
  const beginAt = match.begin_at || match.scheduled_at
  if (!beginAt) return null
  const start = new Date(beginAt)
  if (isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + icalMatchDurationHours(match.match_type) * 3600000)
  const opponents = match.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const league = match.league?.name || ''
  const serie = match.serie?.full_name || match.serie?.name || ''
  const tournament = match.tournament?.name || ''
  const combined = league && serie
    ? (serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`)
    : league || serie || tournament || 'Unknown Tournament'
  const lines = [
    'BEGIN:VEVENT',
    `UID:spectate-match-${match.id}@spectateesports.live`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icalFormatDateUTC(start)}`,
    `DTEND:${icalFormatDateUTC(end)}`,
    `SUMMARY:${icalEscapeText(`${teamA} vs ${teamB} - ${combined}`)}`,
    `DESCRIPTION:${icalEscapeText(`Watch VODs at https://spectateesports.live\n\nTournament: ${combined}\nFormat: ${icalFormatLabel(match.match_type)}\nStage: ${tournament}`)}`,
    'URL:https://spectateesports.live',
    'STATUS:CONFIRMED',
    'CATEGORIES:Dota 2,Esports',
    'END:VEVENT',
  ]
  return lines.map(icalFoldLine).join(CRLF)
}

export function icalSeriesDisplayName(series) {
  const league = series.league?.name || ''
  const raw = series.full_name || series.name || ''
  // Strip 4-digit year (e.g. "Birmingham 2026" → "Birmingham")
  const shortName = raw.replace(/\s*\b20\d\d\b/g, '').replace(/\s+/g, ' ').trim()
  if (league && shortName && !shortName.toLowerCase().startsWith(league.toLowerCase())) {
    return `${league} ${shortName} - Dota 2`
  }
  return `${shortName || 'Dota 2 Tournament'} - Dota 2`
}

export function icalTournamentEvent(series, dtstamp, latestMatchEnd) {
  if (!series.begin_at) return null
  const start = new Date(series.begin_at)
  if (isNaN(start.getTime())) return null
  // Use end_at if available; fall back to latestMatchEnd; then start itself
  const endDate = series.end_at
    ? new Date(series.end_at)
    : (latestMatchEnd instanceof Date && !isNaN(latestMatchEnd) ? latestMatchEnd : start)
  const endPlus1 = new Date(endDate.getTime() + 86400000)
  const displayName = icalSeriesDisplayName(series)
  const descParts = [displayName]
  if (series.prizepool) descParts.push(`Prize Pool: $${Number(series.prizepool).toLocaleString()}`)
  if (series.location) descParts.push(`Location: ${series.location}`)
  descParts.push(`\nMore info: https://spectateesports.live/tournament/${series.id}`)
  const lines = [
    'BEGIN:VEVENT',
    `UID:spectate-series-${series.id}@spectateesports.live`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${icalFormatDateOnly(start)}`,
    `DTEND;VALUE=DATE:${icalFormatDateOnly(endPlus1)}`,
    `SUMMARY:${icalEscapeText(displayName)}`,
    `DESCRIPTION:${icalEscapeText(descParts.join('\n'))}`,
    'TRANSP:TRANSPARENT',
    'CATEGORIES:Dota 2,Esports,Tournament',
    'END:VEVENT',
  ]
  return lines.map(icalFoldLine).join(CRLF)
}

export function icalWrapCalendar(calName, eventBlocks) {
  const header = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Spectate Esports//Dota 2 Match Calendar//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalEscapeText(calName)}`,
    'X-WR-TIMEZONE:UTC', 'X-PUBLISHED-TTL:PT1H',
  ].map(icalFoldLine).join(CRLF)
  const parts = [header, ...eventBlocks.filter(Boolean), 'END:VCALENDAR']
  return parts.join(CRLF) + CRLF
}

export const CAL_SLUG_ALIASES = {
  'liquid': 'team-liquid', 'teamliquid': 'team-liquid',
  'tundra': 'tundra-esports',
  'spirit': 'team-spirit', 'teamspirit': 'team-spirit',
  'betboom': 'betboom-team', 'bb': 'betboom-team',
  'yandex': 'team-yandex', 'teamyandex': 'team-yandex',
  'falcons': 'team-falcons-dota-2', 'teamfalcons': 'team-falcons-dota-2',
  'gaimin': 'gaimin-gladiators', 'gladiators': 'gaimin-gladiators', 'gaimingladiators': 'gaimin-gladiators',
  'aurora': 'aurora-dota-2', 'auroragaming': 'aurora-dota-2',
  'talon': 'talon-esports',
  'nouns': 'nouns-esports',
  'og': 'og',
  'navi': 'natus-vincere', 'natusvincere': 'natus-vincere',
  'virtuspro': 'virtus-pro', 'vp': 'virtus-pro',
  'secret': 'team-secret', 'teamsecret': 'team-secret',
  'aster': 'team-aster', 'teamaster': 'team-aster',
}

export function normalizeTeamSlug(input) {
  const clean = input.toLowerCase().replace(/[\s\-_]/g, '')
  return CAL_SLUG_ALIASES[clean] || input.toLowerCase().trim()
}

export const CAL_MATCHES_TTL = 60 * 30
export const CAL_TEAM_ID_TTL = 60 * 60 * 24

export async function calResolveTeamId(slug, token, kv) {
  const cacheKey = `calendar:team_id:${slug}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return cached
  } catch {}
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const res = await fetch(`${PANDASCORE_BASE}/teams?filter[slug]=${encodeURIComponent(slug)}&page[size]=1`, { headers })
  if (res.ok) {
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const id = data[0].id
      try { await kv.set(cacheKey, id, { ex: CAL_TEAM_ID_TTL }) } catch {}
      return id
    }
  }
  const searchRes = await fetch(`${PANDASCORE_BASE}/teams?search[name]=${encodeURIComponent(slug)}&page[size]=1`, { headers })
  if (!searchRes.ok) return null
  const searchData = await searchRes.json()
  if (!Array.isArray(searchData) || searchData.length === 0) return null
  const id = searchData[0].id
  try { await kv.set(cacheKey, id, { ex: CAL_TEAM_ID_TTL }) } catch {}
  return id
}

export async function calFetchMatchesForTeam(teamId, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const sevenDaysAhead = new Date(Date.now() + 7 * 86400000).toISOString()
  const [upRes, runRes, pastRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/matches/upcoming?filter[opponent_id]=${teamId}&sort=scheduled_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/matches/running?filter[opponent_id]=${teamId}&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/matches/past?filter[opponent_id]=${teamId}&sort=-end_at&page[size]=20&range[end_at]=${sevenDaysAgo},${sevenDaysAhead}`, { headers }),
  ])
  const results = await Promise.allSettled([
    upRes.ok ? upRes.json() : Promise.resolve([]),
    runRes.ok ? runRes.json() : Promise.resolve([]),
    pastRes.ok ? pastRes.json() : Promise.resolve([]),
  ])
  return [
    ...(results[0].status === 'fulfilled' ? results[0].value || [] : []),
    ...(results[1].status === 'fulfilled' ? results[1].value || [] : []),
    ...(results[2].status === 'fulfilled' ? results[2].value || [] : []),
  ]
}

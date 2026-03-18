/**
 * iCalendar (.ics) generation utilities — server-side copy for Vercel functions.
 * (Duplicated from src/utils/icsGenerator.js since API functions can't import from src/)
 */

const CRLF = '\r\n'

function escapeText(str) {
  if (!str) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function foldLine(line) {
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

export function formatDateUTC(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

export function formatDateOnly(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
}

function getMatchDurationHours(matchType) {
  if (!matchType) return 2
  const lower = matchType.toLowerCase()
  if (lower.includes('best_of_1')) return 1
  if (lower.includes('best_of_5')) return 3
  return 2
}

function getFormatLabel(matchType) {
  if (!matchType) return 'Bo3'
  if (matchType === 'best_of_1') return 'Bo1'
  if (matchType === 'best_of_2') return 'Bo2'
  if (matchType === 'best_of_3') return 'Bo3'
  if (matchType === 'best_of_5') return 'Bo5'
  return matchType
}

export function generateMatchEvent(match, dtstamp) {
  const beginAt = match.begin_at || match.scheduled_at
  if (!beginAt) return null

  const start = new Date(beginAt)
  if (isNaN(start.getTime())) return null

  const durationHours = getMatchDurationHours(match.match_type)
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

  const opponents = match.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'

  const leagueName = match.league?.name || ''
  const serieName = match.serie?.full_name || match.serie?.name || ''
  const tournamentName = match.tournament?.name || ''
  const combinedTournament = leagueName && serieName
    ? (serieName.toLowerCase().includes(leagueName.toLowerCase()) ? serieName : `${leagueName} ${serieName}`)
    : leagueName || serieName || tournamentName || 'Unknown Tournament'

  const formatLabel = getFormatLabel(match.match_type)
  const stageName = match.tournament?.name || ''

  const summary = escapeText(`${teamA} vs ${teamB} - ${combinedTournament}`)
  const description = escapeText(
    `Watch VODs at https://spectateesports.live\n\nTournament: ${combinedTournament}\nFormat: ${formatLabel}\nStage: ${stageName}`
  )

  const uid = `spectate-match-${match.id}@spectateesports.live`

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatDateUTC(start)}`,
    `DTEND:${formatDateUTC(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'URL:https://spectateesports.live',
    'STATUS:CONFIRMED',
    'CATEGORIES:Dota 2,Esports',
    'END:VEVENT',
  ]

  return lines.map(foldLine).join(CRLF)
}

export function generateTournamentEvent(series, dtstamp) {
  if (!series.begin_at) return null

  const start = new Date(series.begin_at)
  if (isNaN(start.getTime())) return null

  const endDate = series.end_at ? new Date(series.end_at) : start
  const endPlus1 = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)

  const seriesName = series.full_name || series.name || 'Dota 2 Tournament'
  const prizePool = series.prizepool ? `$${Number(series.prizepool).toLocaleString()}` : null
  const location = series.location || null

  let descParts = [seriesName]
  if (prizePool) descParts.push(`Prize Pool: ${prizePool}`)
  if (location) descParts.push(`Location: ${location}`)
  descParts.push(`\nMore info: https://spectateesports.live/tournament/${series.id}`)

  const description = escapeText(descParts.join('\n'))
  const summary = escapeText(`${seriesName} (Dota 2)`)
  const uid = `spectate-series-${series.id}@spectateesports.live`

  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${formatDateOnly(start)}`,
    `DTEND;VALUE=DATE:${formatDateOnly(endPlus1)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'TRANSP:TRANSPARENT',
    'CATEGORIES:Dota 2,Esports,Tournament',
    'END:VEVENT',
  ]

  return lines.map(foldLine).join(CRLF)
}

export function generateCalendar(calName, eventBlocks) {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Spectate Esports//Dota 2 Match Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-WR-TIMEZONE:UTC',
    'X-PUBLISHED-TTL:PT1H',
  ].map(foldLine).join(CRLF)

  const footer = 'END:VCALENDAR'

  const parts = [header]
  for (const block of eventBlocks) {
    if (block) parts.push(block)
  }
  parts.push(footer)

  return parts.join(CRLF) + CRLF
}

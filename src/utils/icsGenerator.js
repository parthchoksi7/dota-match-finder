/**
 * iCalendar (.ics) generation utilities for Spectate Esports calendar feeds.
 * Generates standards-compliant iCal content manually (no external dependency).
 *
 * iCal rules:
 * - Lines must end with CRLF (\r\n)
 * - Lines should not exceed 75 octets; fold long lines with CRLF + space
 * - Special characters in text: commas -> \,  semicolons -> \;  newlines -> \n
 */

const CRLF = '\r\n'

/**
 * Escape iCal text field special characters.
 */
function escapeText(str) {
  if (!str) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Fold a single iCal line to max 75 octets per line.
 * Continuation lines begin with a single space.
 */
function foldLine(line) {
  if (line.length <= 75) return line
  const parts = []
  let pos = 0
  // First line: 75 chars
  parts.push(line.slice(0, 75))
  pos = 75
  // Continuation lines: 74 chars (1 for leading space)
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + 74))
    pos += 74
  }
  return parts.join(CRLF)
}

/**
 * Format a JS Date (or ISO string) to iCal UTC datetime: YYYYMMDDTHHMMSSZ
 */
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

/**
 * Format a JS Date to iCal date-only: YYYYMMDD
 */
export function formatDateOnly(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
}

/**
 * Determine match duration in hours based on match type string.
 * Bo1 = 1h, Bo3 = 2h, Bo5 = 3h
 */
function getMatchDurationHours(matchType) {
  if (!matchType) return 2
  const lower = matchType.toLowerCase()
  if (lower.includes('best_of_1') || lower.includes('bo1')) return 1
  if (lower.includes('best_of_5') || lower.includes('bo5')) return 3
  return 2 // Bo3 default
}

/**
 * Get human-readable format label from PandaScore match_type.
 */
function getFormatLabel(matchType) {
  if (!matchType) return 'Bo3'
  if (matchType === 'best_of_1') return 'Bo1'
  if (matchType === 'best_of_2') return 'Bo2'
  if (matchType === 'best_of_3') return 'Bo3'
  if (matchType === 'best_of_5') return 'Bo5'
  return matchType
}

/**
 * Generate a VEVENT block for a match.
 * Returns null if the match has no scheduled time.
 *
 * @param {Object} match - PandaScore match object (or pre-mapped match data)
 * @param {string} dtstamp - Current UTC timestamp string (YYYYMMDDTHHMMSSZ)
 */
export function generateMatchEvent(match, dtstamp) {
  const beginAt = match.begin_at || match.scheduled_at
  if (!beginAt) return null

  const start = new Date(beginAt)
  if (isNaN(start.getTime())) return null

  const durationHours = getMatchDurationHours(match.match_type)
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

  const opponents = match.opponents || []
  const teamA = opponents[0]?.opponent?.name || match.teamA || 'TBD'
  const teamB = opponents[1]?.opponent?.name || match.teamB || 'TBD'

  const leagueName = match.league?.name || ''
  const serieName = match.serie?.full_name || match.serie?.name || ''
  const tournamentName = match.tournament?.name || ''
  const combinedTournament = leagueName || serieName || tournamentName || 'Unknown Tournament'

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

/**
 * Generate an all-day VEVENT for a tournament series.
 *
 * @param {Object} series - PandaScore series object
 * @param {string} dtstamp - Current UTC timestamp string
 */
export function generateTournamentEvent(series, dtstamp) {
  if (!series.begin_at) return null

  const start = new Date(series.begin_at)
  if (isNaN(start.getTime())) return null

  const endDate = series.end_at ? new Date(series.end_at) : start
  // DTEND for all-day is exclusive so add 1 day
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

/**
 * Wrap VEVENT blocks in a VCALENDAR envelope.
 *
 * @param {string} calName - X-WR-CALNAME value
 * @param {string[]} eventBlocks - Array of VEVENT strings (already CRLF-terminated)
 */
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
    if (block) {
      parts.push(block)
    }
  }
  parts.push(footer)

  return parts.join(CRLF) + CRLF
}

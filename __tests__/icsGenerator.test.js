import { describe, it, expect } from 'vitest'
import {
  formatDateUTC,
  formatDateOnly,
  generateMatchEvent,
  generateTournamentEvent,
  generateCalendar,
} from '../src/utils/icsGenerator.js'

// ─── formatDateUTC ────────────────────────────────────────────────────────────

describe('formatDateUTC', () => {
  it('formats a Date to YYYYMMDDTHHMMSSZ', () => {
    const d = new Date('2026-03-22T14:30:00Z')
    expect(formatDateUTC(d)).toBe('20260322T143000Z')
  })

  it('accepts an ISO string', () => {
    expect(formatDateUTC('2026-12-01T08:05:00Z')).toBe('20261201T080500Z')
  })

  it('pads single-digit month, day, hour, minute, second', () => {
    const d = new Date('2026-01-02T03:04:05Z')
    expect(formatDateUTC(d)).toBe('20260102T030405Z')
  })
})

// ─── formatDateOnly ───────────────────────────────────────────────────────────

describe('formatDateOnly', () => {
  it('formats a Date to YYYYMMDD', () => {
    expect(formatDateOnly(new Date('2026-03-22T00:00:00Z'))).toBe('20260322')
  })

  it('accepts an ISO string', () => {
    expect(formatDateOnly('2026-11-30T00:00:00Z')).toBe('20261130')
  })
})

// ─── generateMatchEvent ───────────────────────────────────────────────────────

const DTSTAMP = '20260319T120000Z'

function makeMatch(overrides = {}) {
  return {
    id: 12345,
    begin_at: '2026-03-22T14:00:00Z',
    match_type: 'best_of_3',
    opponents: [
      { opponent: { name: 'Team Liquid' } },
      { opponent: { name: 'Tundra Esports' } },
    ],
    league: { name: 'ESL One' },
    serie: { full_name: 'ESL One Birmingham 2026' },
    tournament: { name: 'Group Stage' },
    ...overrides,
  }
}

describe('generateMatchEvent', () => {
  it('returns null when begin_at is missing', () => {
    expect(generateMatchEvent(makeMatch({ begin_at: null }), DTSTAMP)).toBeNull()
  })

  it('returns null when begin_at is invalid', () => {
    expect(generateMatchEvent(makeMatch({ begin_at: 'not-a-date' }), DTSTAMP)).toBeNull()
  })

  it('generates a VEVENT string', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('BEGIN:VEVENT')
    expect(event).toContain('END:VEVENT')
  })

  it('includes the correct UID', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('UID:spectate-match-12345@spectateesports.live')
  })

  it('includes DTSTART in UTC format', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('DTSTART:20260322T140000Z')
  })

  it('sets DTEND 2 hours after start for Bo3', () => {
    const event = generateMatchEvent(makeMatch({ match_type: 'best_of_3' }), DTSTAMP)
    expect(event).toContain('DTEND:20260322T160000Z')
  })

  it('sets DTEND 1 hour after start for Bo1', () => {
    const event = generateMatchEvent(makeMatch({ match_type: 'best_of_1', begin_at: '2026-03-22T14:00:00Z' }), DTSTAMP)
    expect(event).toContain('DTEND:20260322T150000Z')
  })

  it('sets DTEND 3 hours after start for Bo5', () => {
    const event = generateMatchEvent(makeMatch({ match_type: 'best_of_5', begin_at: '2026-03-22T14:00:00Z' }), DTSTAMP)
    expect(event).toContain('DTEND:20260322T170000Z')
  })

  it('includes team names in SUMMARY', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('Team Liquid vs Tundra Esports')
  })

  it('shows TBD when opponents are missing', () => {
    const event = generateMatchEvent(makeMatch({ opponents: [] }), DTSTAMP)
    expect(event).toContain('TBD vs TBD')
  })

  it('includes STATUS:CONFIRMED', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('STATUS:CONFIRMED')
  })

  it('includes CATEGORIES', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('CATEGORIES:Dota 2,Esports')
  })

  it('folds lines longer than 75 characters', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    const lines = event.split('\r\n')
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('uses CRLF line endings', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    expect(event).toContain('\r\n')
    expect(event).not.toMatch(/(?<!\r)\n/)
  })
})

// ─── generateTournamentEvent ──────────────────────────────────────────────────

function makeSeries(overrides = {}) {
  return {
    id: 9999,
    full_name: 'ESL One Birmingham 2026',
    begin_at: '2026-03-22T00:00:00Z',
    end_at: '2026-03-29T00:00:00Z',
    prizepool: '1000000',
    location: 'Birmingham, UK',
    ...overrides,
  }
}

describe('generateTournamentEvent', () => {
  it('returns null when begin_at is missing', () => {
    expect(generateTournamentEvent(makeSeries({ begin_at: null }), DTSTAMP)).toBeNull()
  })

  it('generates an all-day VEVENT', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('BEGIN:VEVENT')
    expect(event).toContain('DTSTART;VALUE=DATE:20260322')
  })

  it('DTEND is end_at + 1 day (exclusive)', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('DTEND;VALUE=DATE:20260330')
  })

  it('includes TRANSP:TRANSPARENT so event is non-blocking', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('TRANSP:TRANSPARENT')
  })

  it('includes the series UID', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('UID:spectate-series-9999@spectateesports.live')
  })

  it('includes (Dota 2) suffix in SUMMARY', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('(Dota 2)')
  })

  it('includes prize pool in DESCRIPTION when present', () => {
    const event = generateTournamentEvent(makeSeries(), DTSTAMP)
    expect(event).toContain('Prize Pool')
  })

  it('omits prize pool when not present', () => {
    const event = generateTournamentEvent(makeSeries({ prizepool: null }), DTSTAMP)
    expect(event).not.toContain('Prize Pool')
  })
})

// ─── generateCalendar ─────────────────────────────────────────────────────────

describe('generateCalendar', () => {
  it('wraps events in VCALENDAR envelope', () => {
    const cal = generateCalendar('Test Cal', [])
    expect(cal).toContain('BEGIN:VCALENDAR')
    expect(cal).toContain('END:VCALENDAR')
  })

  it('includes X-WR-CALNAME', () => {
    const cal = generateCalendar('Dota 2 - Liquid', [])
    expect(cal).toContain('X-WR-CALNAME:Dota 2 - Liquid')
  })

  it('includes X-PUBLISHED-TTL:PT1H', () => {
    const cal = generateCalendar('Test', [])
    expect(cal).toContain('X-PUBLISHED-TTL:PT1H')
  })

  it('includes PRODID', () => {
    const cal = generateCalendar('Test', [])
    expect(cal).toContain('PRODID:-//Spectate Esports//')
  })

  it('includes event blocks between header and footer', () => {
    const event = generateMatchEvent(makeMatch(), DTSTAMP)
    const cal = generateCalendar('Test', [event])
    expect(cal).toContain('BEGIN:VEVENT')
    expect(cal.indexOf('BEGIN:VCALENDAR')).toBeLessThan(cal.indexOf('BEGIN:VEVENT'))
    expect(cal.indexOf('END:VEVENT')).toBeLessThan(cal.indexOf('END:VCALENDAR'))
  })

  it('skips null event blocks', () => {
    const cal = generateCalendar('Test', [null, null])
    expect(cal.split('BEGIN:VEVENT').length - 1).toBe(0)
  })

  it('ends with CRLF', () => {
    const cal = generateCalendar('Test', [])
    expect(cal.endsWith('\r\n')).toBe(true)
  })
})

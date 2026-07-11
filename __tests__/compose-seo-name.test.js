import { describe, it, expect } from 'vitest'
import { composeSeoName } from '../api/_handlers/_tournamentUtils.js'
import { tournamentPath } from '../src/utils.js'

describe('composeSeoName', () => {
  it('prepends league when serie name omits it (EWC "2026" case)', () => {
    expect(composeSeoName('2026', 'Esports World Cup')).toBe('Esports World Cup 2026')
    expect(composeSeoName('Europe Closed Qualifier 2026', 'The International'))
      .toBe('The International Europe Closed Qualifier 2026')
  })

  it('does not duplicate the league when the name already contains it', () => {
    expect(composeSeoName('PGL Wallachia 2026 Season 7', 'PGL Wallachia')).toBe('PGL Wallachia 2026 Season 7')
    expect(composeSeoName('BLAST Slam VII', 'BLAST')).toBe('BLAST Slam VII')
  })

  it('is case-insensitive on the containment check', () => {
    expect(composeSeoName('blast slam vii', 'BLAST')).toBe('blast slam vii')
  })

  it('handles missing league or name', () => {
    expect(composeSeoName('Some Event', '')).toBe('Some Event')
    expect(composeSeoName('Some Event', null)).toBe('Some Event')
    expect(composeSeoName('', 'Esports World Cup')).toBe('Esports World Cup')
    expect(composeSeoName(null, null)).toBe('')
  })
})

describe('tournamentPath (client slug URLs)', () => {
  it('uses seoName when present', () => {
    expect(tournamentPath({ id: 10728, seoName: 'Esports World Cup 2026', name: '2026', leagueName: 'Esports World Cup' }))
      .toBe('/tournament/esports-world-cup-2026-10728')
  })

  it('composes league + name when seoName is absent (stale cache payloads)', () => {
    expect(tournamentPath({ id: 10728, name: '2026', leagueName: 'Esports World Cup' }))
      .toBe('/tournament/esports-world-cup-2026-10728')
  })

  it('falls back to bare id when nothing slugs', () => {
    expect(tournamentPath({ id: 42 })).toBe('/tournament/42')
    expect(tournamentPath({ id: 42, name: '###' })).toBe('/tournament/42')
  })

  it('produces URLs the detail-page route regex can parse', () => {
    const path = tournamentPath({ id: 10719, name: 'Europe Closed Qualifier 2026', leagueName: 'The International' })
    const match = path.match(/^\/tournament\/.*?(\d+)\/?$/)
    expect(match[1]).toBe('10719')
  })
})

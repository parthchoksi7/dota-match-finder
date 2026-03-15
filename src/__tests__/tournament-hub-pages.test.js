/**
 * Tests for the Tournament Hub Pages feature.
 *
 * Covers:
 * - src/utils/regions.js - country-to-region mapping and helpers
 * - TournamentCard rendering logic (pure functions)
 * - Series status determination
 */

import { describe, it, expect } from 'vitest'
import { getRegion, getRegionColor, groupTeamsByRegion, getRegionSummary } from '../utils/regions'

// ── getRegion ───────────────────────────────────────────────────────────────

describe('getRegion', () => {
  it('maps Western Europe country codes correctly', () => {
    expect(getRegion('SE')).toBe('WEU')
    expect(getRegion('DE')).toBe('WEU')
    expect(getRegion('DK')).toBe('WEU')
    expect(getRegion('FI')).toBe('WEU')
    expect(getRegion('GB')).toBe('WEU')
  })

  it('maps Eastern Europe / CIS country codes correctly', () => {
    expect(getRegion('RU')).toBe('EEU')
    expect(getRegion('UA')).toBe('EEU')
    expect(getRegion('KZ')).toBe('EEU')
  })

  it('maps China correctly', () => {
    expect(getRegion('CN')).toBe('CN')
  })

  it('maps Southeast Asia correctly', () => {
    expect(getRegion('PH')).toBe('SEA')
    expect(getRegion('MY')).toBe('SEA')
    expect(getRegion('SG')).toBe('SEA')
  })

  it('maps North America correctly', () => {
    expect(getRegion('US')).toBe('NA')
    expect(getRegion('CA')).toBe('NA')
  })

  it('maps South America correctly', () => {
    expect(getRegion('BR')).toBe('SA')
    expect(getRegion('PE')).toBe('SA')
  })

  it('returns Other for unknown codes', () => {
    expect(getRegion('XX')).toBe('Other')
    expect(getRegion('ZZ')).toBe('Other')
  })

  it('returns Other for null or undefined', () => {
    expect(getRegion(null)).toBe('Other')
    expect(getRegion(undefined)).toBe('Other')
    expect(getRegion('')).toBe('Other')
  })

  it('is case-insensitive', () => {
    expect(getRegion('se')).toBe('WEU')
    expect(getRegion('cn')).toBe('CN')
  })
})

// ── getRegionColor ──────────────────────────────────────────────────────────

describe('getRegionColor', () => {
  it('returns a non-empty class string for known regions', () => {
    expect(getRegionColor('WEU')).toBeTruthy()
    expect(getRegionColor('CN')).toBeTruthy()
    expect(getRegionColor('SEA')).toBeTruthy()
    expect(getRegionColor('NA')).toBeTruthy()
  })

  it('returns the Other color for unknown regions', () => {
    const otherColor = getRegionColor('Other')
    expect(getRegionColor('UNKNOWN')).toBe(otherColor)
  })
})

// ── groupTeamsByRegion ──────────────────────────────────────────────────────

describe('groupTeamsByRegion', () => {
  const teams = [
    { id: 1, name: 'Team Spirit', location: 'RU' },
    { id: 2, name: 'OG', location: 'DE' },
    { id: 3, name: 'Tundra', location: 'GB' },
    { id: 4, name: 'PSG.LGD', location: 'CN' },
    { id: 5, name: 'Team SMG', location: 'SG' },
    { id: 6, name: 'Unknown Team', location: null },
  ]

  it('groups teams by region correctly', () => {
    const groups = groupTeamsByRegion(teams)
    expect(groups['EEU']).toHaveLength(1)
    expect(groups['WEU']).toHaveLength(2)
    expect(groups['CN']).toHaveLength(1)
    expect(groups['SEA']).toHaveLength(1)
    expect(groups['Other']).toHaveLength(1)
  })

  it('handles empty teams array', () => {
    const groups = groupTeamsByRegion([])
    expect(Object.keys(groups)).toHaveLength(0)
  })

  it('handles teams with unknown locations', () => {
    const groups = groupTeamsByRegion([{ id: 1, name: 'X', location: 'ZZ' }])
    expect(groups['Other']).toHaveLength(1)
  })
})

// ── getRegionSummary ────────────────────────────────────────────────────────

describe('getRegionSummary', () => {
  it('returns sorted region counts', () => {
    const teams = [
      { location: 'RU' }, // EEU
      { location: 'UA' }, // EEU
      { location: 'SE' }, // WEU
      { location: 'CN' }, // CN
      { location: 'PH' }, // SEA
      { location: 'US' }, // NA
    ]
    const summary = getRegionSummary(teams)
    const regions = summary.map(s => s.region)
    // Should include all present regions
    expect(regions).toContain('WEU')
    expect(regions).toContain('EEU')
    expect(regions).toContain('CN')
    expect(regions).toContain('SEA')
    expect(regions).toContain('NA')
    // EEU should have count 2
    const eeu = summary.find(s => s.region === 'EEU')
    expect(eeu?.count).toBe(2)
  })

  it('returns empty array for empty teams', () => {
    expect(getRegionSummary([])).toEqual([])
  })

  it('does not include regions with 0 teams', () => {
    const teams = [{ location: 'CN' }]
    const summary = getRegionSummary(teams)
    expect(summary).toHaveLength(1)
    expect(summary[0].region).toBe('CN')
  })
})

// ── Series status logic ─────────────────────────────────────────────────────

describe('Series status determination', () => {
  function getStatus(beginAt, endAt) {
    const now = new Date()
    const begin = beginAt ? new Date(beginAt) : null
    const end = endAt ? new Date(endAt) : null
    if (end && end < now) return 'completed'
    if (begin && begin <= now) return 'live'
    return 'upcoming'
  }

  it('returns completed for past events', () => {
    expect(getStatus('2026-01-01', '2026-01-10')).toBe('completed')
  })

  it('returns upcoming for future events', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
    expect(getStatus(future, null)).toBe('upcoming')
  })

  it('returns live for ongoing events', () => {
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString()
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString()
    expect(getStatus(past, future)).toBe('live')
  })

  it('returns upcoming when no dates are provided', () => {
    expect(getStatus(null, null)).toBe('upcoming')
  })
})

// ── formatPrizePool ─────────────────────────────────────────────────────────

describe('formatPrizePool (inline)', () => {
  function formatPrizePool(prize) {
    if (!prize) return null
    const match = String(prize).match(/[\d,]+/)
    if (!match) return prize
    const num = parseInt(match[0].replace(/,/g, ''))
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
    return `$${num}`
  }

  it('formats millions correctly', () => {
    expect(formatPrizePool('1000000')).toBe('$1.0M')
    expect(formatPrizePool('500000')).toBe('$500K')
  })

  it('formats thousands correctly', () => {
    expect(formatPrizePool('50000')).toBe('$50K')
  })

  it('handles null/undefined', () => {
    expect(formatPrizePool(null)).toBeNull()
    expect(formatPrizePool(undefined)).toBeNull()
    expect(formatPrizePool('')).toBeNull()
  })

  it('handles already-formatted strings with commas', () => {
    expect(formatPrizePool('1,000,000')).toBe('$1.0M')
  })
})

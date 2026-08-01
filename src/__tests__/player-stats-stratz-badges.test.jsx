/**
 * Tests for STRATZ enrichment badges in PlayerStatsSection (backlog #24):
 * position badge, MVP/award badge, impact score. All three must silently
 * absent themselves when the corresponding field is null — this is the
 * graceful-degrade contract for a second, independently-fetched data source
 * (see DESIGN_GUIDELINES.md "STRATZ enrichment").
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlayerStatsSection from '../components/PlayerStatsSection'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    fetchHeroes: vi.fn().mockResolvedValue({}),
  }
})

function basePlayer(overrides = {}) {
  return {
    heroId: 1,
    name: 'yatoro',
    netWorth: 30000,
    items: [0, 0, 0, 0, 0, 0],
    backpackItems: [0, 0, 0],
    neutralItem: 0,
    permanentBuffs: [],
    isRadiant: true,
    position: null,
    positionLabel: null,
    imp: null,
    award: null,
    ...overrides,
  }
}

describe('PlayerStatsSection — STRATZ enrichment badges', () => {
  it('renders no position badge, MVP badge, or impact value when STRATZ fields are all null', () => {
    render(<PlayerStatsSection players={[basePlayer()]} itemNames={{}} radiantName="Radiant" direName="Dire" loading={false} />)
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Position:/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Impact score/)).not.toBeInTheDocument()
    // Net worth still renders — the graceful-degrade baseline (pre-STRATZ behavior)
    expect(screen.getByText('30.0k')).toBeInTheDocument()
  })

  it('renders the position numeral and an accessible label when position is set', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ position: 1, positionLabel: 'Carry' })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    expect(screen.getByLabelText('Position: Carry')).toBeInTheDocument()
    expect(screen.getByLabelText('Position: Carry')).toHaveTextContent('1')
  })

  it('renders a role-only fallback label with no numeral when position is null but positionLabel is set', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ position: null, positionLabel: 'Hard Support' })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    const badge = screen.getByLabelText('Position: Hard Support')
    expect(badge).toHaveTextContent('H')  // first letter of the fallback label, no digit
  })

  it('renders the MVP/award badge with the literal award string from STRATZ, not a hardcoded label', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ award: 'MVP' })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    expect(screen.getByLabelText('Match MVP')).toBeInTheDocument()
  })

  it('renders a positive impact score in green with an explicit + sign', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ imp: 9 })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    const impact = screen.getByLabelText('Impact score: +9 on STRATZ\'s -100 to +100 scale')
    expect(impact).toHaveTextContent('+9')
    expect(impact.className).toMatch(/text-green-600/)
  })

  it('renders a negative impact score in red with the sign already present (no double minus)', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ imp: -4 })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    const impact = screen.getByLabelText('Impact score: -4 on STRATZ\'s -100 to +100 scale')
    expect(impact).toHaveTextContent('-4')
    expect(impact.className).toMatch(/text-red-600/)
  })

  it('renders a zero impact score in neutral gray', () => {
    render(<PlayerStatsSection
      players={[basePlayer({ imp: 0 })]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    const impact = screen.getByLabelText('Impact score: 0 on STRATZ\'s -100 to +100 scale')
    expect(impact.className).toMatch(/text-gray-400/)
  })

  it('only badges the awarded player when the roster is mixed (partial STRATZ coverage)', () => {
    render(<PlayerStatsSection
      players={[
        basePlayer({ heroId: 1, name: 'yatoro', award: 'MVP', position: 1, positionLabel: 'Carry' }),
        basePlayer({ heroId: 2, name: 'collapse', isRadiant: true }),
      ]}
      itemNames={{}} radiantName="Radiant" direName="Dire" loading={false}
    />)
    expect(screen.getAllByLabelText(/^Match /)).toHaveLength(1)
    expect(screen.getAllByLabelText(/^Position:/)).toHaveLength(1)
  })
})

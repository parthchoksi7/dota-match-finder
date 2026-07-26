/**
 * Tests for DotaMinimap (Live Story R4 Phase D — schematic tower map, owner-only).
 *
 * The one property this component must never violate: it draws towers ONLY, and it must
 * always carry a visible, explicit statement that barracks/base-tower/Ancient state is
 * unknown. That caption is not decorative — it's what stops an owner from misreading "no
 * marker drawn" as "confirmed standing" for something we genuinely don't know.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DotaMinimap, { buildMinimapAriaLabel } from '../components/DotaMinimap.jsx'

describe('buildMinimapAriaLabel', () => {
  it('summarizes standing counts per lane per side, using team names when given', () => {
    const label = buildMinimapAriaLabel([2, 3, 1], [3, 2, 3], 'Team Lynx', 'KW')
    expect(label).toContain('Team Lynx: top 2 of 3, mid 3 of 3, bot 1 of 3 standing')
    expect(label).toContain('KW: top 3 of 3, mid 2 of 3, bot 3 of 3 standing')
  })

  it('falls back to Radiant/Dire when team names are missing', () => {
    const label = buildMinimapAriaLabel([3, 3, 3], [3, 3, 3], null, null)
    expect(label).toContain('Radiant:')
    expect(label).toContain('Dire:')
  })

  it('always states the unknown-data scope, regardless of the counts passed in', () => {
    const label = buildMinimapAriaLabel([0, 0, 0], [3, 3, 3], 'A', 'B')
    expect(label).toContain('Barracks, base towers, and Ancient status are not known and are not shown.')
  })
})

describe('DotaMinimap — rendering', () => {
  it('renders nothing when radiant or dire data is missing (never a placeholder/skeleton map)', () => {
    expect(render(<DotaMinimap radiant={null} dire={[3, 3, 3]} />).container).toBeEmptyDOMElement()
    expect(render(<DotaMinimap radiant={[3, 3, 3]} dire={null} />).container).toBeEmptyDOMElement()
  })

  it('renders exactly 18 tower markers (9 per side) — never more, never a marker for barracks/base towers/Ancient', () => {
    const { container } = render(<DotaMinimap radiant={[3, 3, 3]} dire={[3, 3, 3]} radiantName="A" direName="B" />)
    expect(container.querySelectorAll('rect').length).toBe(18)
  })

  it('always renders the explicit "unknown" caption text, visibly, alongside the map', () => {
    render(<DotaMinimap radiant={[3, 3, 3]} dire={[3, 3, 3]} radiantName="A" direName="B" />)
    expect(screen.getByText(/barracks, base towers & ancient status unknown/i)).toBeInTheDocument()
  })

  it('the svg carries an aria-label built from the same summarizer, so assistive tech gets the same caveat', () => {
    render(<DotaMinimap radiant={[2, 3, 1]} dire={[3, 2, 3]} radiantName="Team Lynx" direName="KW" />)
    expect(screen.getByRole('img', { name: /Team Lynx: top 2 of 3/ })).toBeInTheDocument()
  })

  it('marks a lane fully cleared (0 standing) by destroying all 3 markers for that lane/side, leaving the other lanes untouched', () => {
    const { container } = render(<DotaMinimap radiant={[0, 3, 3]} dire={[3, 3, 3]} radiantName="A" direName="B" />)
    // 3 destroyed (opacity 0.5, transparent fill) + 15 standing (opacity 1, colored fill)
    const destroyed = [...container.querySelectorAll('rect')].filter(r => r.getAttribute('opacity') === '0.5')
    expect(destroyed).toHaveLength(3)
  })
})

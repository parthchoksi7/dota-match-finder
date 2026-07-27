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
import DotaMinimap, { buildMinimapAriaLabel, TOWER_POSITIONS, BASE_POSITIONS } from '../components/DotaMinimap.jsx'

function dist([x1, y1], [x2, y2]) {
  return Math.hypot(x1 - x2, y1 - y2)
}

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
    // Scoped to the map <svg> specifically — the legend swatches above it are also tiny <rect>-
    // based <svg>s and must not be counted as tower markers.
    const mapSvg = container.querySelector('svg[role="img"]')
    expect(mapSvg.querySelectorAll('rect').length).toBe(18)
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
    const mapSvg = container.querySelector('svg[role="img"]')
    // 3 destroyed (opacity 0.55, transparent fill) + 15 standing (opacity 1, colored fill)
    const destroyed = [...mapSvg.querySelectorAll('rect')].filter(r => r.getAttribute('opacity') === '0.55')
    expect(destroyed).toHaveLength(3)
  })
})

describe('TOWER_POSITIONS — geometry regression (caught 2026-07-27: Dire top/bot had T1/T3 swapped)', () => {
  it('for every lane and side, position index 0 (T1) is the FARTHEST tower from that side\'s own base, and index 2 (T3) is the closest', () => {
    for (const lane of ['top', 'mid', 'bot']) {
      for (const side of ['radiant', 'dire']) {
        const ownBase = BASE_POSITIONS[side]
        const distances = TOWER_POSITIONS[lane][side].map(pos => dist(pos, ownBase))
        expect(distances[0]).toBeGreaterThan(distances[1])
        expect(distances[1]).toBeGreaterThan(distances[2])
      }
    }
  })

  it('Radiant and Dire towers in the same lane are each closer to their OWN base than to the enemy base (sides are not mirror-flipped)', () => {
    for (const lane of ['top', 'mid', 'bot']) {
      for (const side of ['radiant', 'dire']) {
        const enemy = side === 'radiant' ? 'dire' : 'radiant'
        for (const pos of TOWER_POSITIONS[lane][side]) {
          expect(dist(pos, BASE_POSITIONS[side])).toBeLessThan(dist(pos, BASE_POSITIONS[enemy]))
        }
      }
    }
  })

  // Distance-to-base alone can't catch an ENTIRE lane's array being swapped with a different
  // lane (e.g. top.dire and bot.dire contents exchanged) — that would still pass both tests
  // above, since each array would still be monotonic to its own base and closer to its own
  // side. These assertions tie each lane to the fixed coordinate its actual drawn path holds
  // constant along (see the <polyline> points in the component): Radiant top runs along x=35,
  // Dire top along y=35, Radiant bot along y=265, Dire bot along x=265, and both mid arrays sit
  // on the x+y=300 diagonal — so a cross-lane swap fails here even though it wouldn't above.
  it('each lane/side\'s positions sit on the fixed coordinate its own drawn lane path holds constant (catches a whole-lane swap, not just a within-lane one)', () => {
    for (const [x, y] of TOWER_POSITIONS.top.radiant) { expect(x).toBe(35) }
    for (const [, y] of TOWER_POSITIONS.top.dire) { expect(y).toBe(35) }
    for (const [, y] of TOWER_POSITIONS.bot.radiant) { expect(y).toBe(265) }
    for (const [x] of TOWER_POSITIONS.bot.dire) { expect(x).toBe(265) }
    for (const [x, y] of [...TOWER_POSITIONS.mid.radiant, ...TOWER_POSITIONS.mid.dire]) {
      expect(x + y).toBeCloseTo(300, 0)
    }
  })
})

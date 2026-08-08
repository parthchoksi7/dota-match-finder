/**
 * Coverage for the redesigned LiveEventFeed (2026-08-07).
 *
 * The feed now takes server-grouped `groups` (pulse.timeline, newest-first) rather than a flat
 * event list. Three properties this file exists to protect:
 *
 *  1. NO GREY MARKERS. Every event resolves to a meaningful colour. Kills use the side that
 *     benefited (inferrable even when the killer isn't), Roshan is amber (neutral, not unknown),
 *     fights are cyan (event-type hue, with sides carried by the kill-split badge instead).
 *  2. A fight's net-worth swing renders ONLY when history could bracket the window — never "+0",
 *     never a placeholder. A wrong number costs more trust than an absent one.
 *  3. Pagination, not an internal scroller — the sheet owns scroll, and nesting one traps
 *     thumb-scroll on mobile.
 *
 * Also retains the earlier wording guards: item names resolve, Aegis says "picks up" not "buys",
 * and an unattributed kill carries no internal-jargon sub-line.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LiveEventFeed } from '../components/LiveValveBoard.jsx'

const ITEM_NAMES = {
  63: { key: 'black_king_bar', dname: 'Black King Bar' },
  138: { key: 'aegis', dname: 'Aegis of the Immortal' },
}

const ev = (over = {}) => ({ type: 'HeroKilled', time: 600, side: 'radiant', victimName: 'v', killerName: 'k', ...over })
const eventGroup = (over = {}) => ({ kind: 'event', time: over.time ?? 600, event: ev(over) })
const fightGroup = (over = {}) => ({
  kind: 'fight', time: 1443, endTime: 1460, label: 'Teamfight',
  radiantKills: 3, direKills: 1, swing: 3200,
  kills: [ev({ time: 1443 }), ev({ time: 1450, side: 'dire' })],
  items: [],
  ...over,
})

function renderFeed(groups, props = {}) {
  return render(
    <LiveEventFeed groups={groups} heroes={{}} itemNames={ITEM_NAMES}
      radiantName="Tundra" direName="BetBoom" {...props} />
  )
}

describe('LiveEventFeed — no grey markers', () => {
  it('colours an unattributed kill by the side that benefited, not grey', () => {
    const { container } = renderFeed([eventGroup({ ambiguous: true, killerName: null, side: 'radiant' })])
    expect(screen.getByText('v dies')).toBeInTheDocument()
    expect(container.querySelector('.border-green-500')).not.toBeNull()
    expect(container.querySelector('.border-gray-300, .border-gray-700')).toBeNull()
  })

  it('colours Roshan amber — neutral, which is different from unknown', () => {
    const { container } = renderFeed([{ kind: 'event', time: 870, event: { type: 'RoshanKilled', time: 870, side: null } }])
    expect(screen.getByText('Roshan killed')).toBeInTheDocument()
    expect(container.querySelector('.border-amber-500')).not.toBeNull()
  })

  it('colours a fight cyan, with sides carried by the kill split instead of the marker', () => {
    const { container } = renderFeed([fightGroup()])
    expect(container.querySelector('.border-cyan-500')).not.toBeNull()
  })

  it('renders no grey marker for ANY group type', () => {
    const { container } = renderFeed([
      fightGroup(),
      { kind: 'event', time: 870, event: { type: 'RoshanKilled', time: 870, side: null } },
      eventGroup({ ambiguous: true, killerName: null }),
    ])
    for (const el of container.querySelectorAll('span[class*="border-"]')) {
      expect(el.className).not.toMatch(/border-gray-(300|400|700)/)
    }
  })
})

describe('LiveEventFeed — fight cards', () => {
  it('shows the label, kill split and swing on the collapsed card', () => {
    renderFeed([fightGroup()])
    expect(screen.getByText('Teamfight')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/Tundra .*swing/)).toBeInTheDocument()
  })

  it('attributes the swing to dire when the lead moved that way', () => {
    renderFeed([fightGroup({ swing: -2500 })])
    expect(screen.getByText(/BetBoom .*swing/)).toBeInTheDocument()
  })

  it('renders NO swing line when history could not bracket the window', () => {
    renderFeed([fightGroup({ swing: null })])
    expect(screen.queryByText(/swing/)).not.toBeInTheDocument()
    // ...but the fight itself still renders, just without the figure.
    expect(screen.getByText('Teamfight')).toBeInTheDocument()
  })

  it('never renders a fabricated +0 swing', () => {
    renderFeed([fightGroup({ swing: null })])
    expect(screen.queryByText(/\+0/)).not.toBeInTheDocument()
  })

  it('is collapsed by default and expands its kills on click', () => {
    renderFeed([fightGroup()])
    const btn = screen.getByRole('button', { expanded: false })
    expect(within(btn).queryByText('k kills v')).not.toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
    expect(screen.getAllByText('k kills v').length).toBeGreaterThan(0)
  })

  it('carries a complete sentence in aria-label, since the visual card is fragmentary', () => {
    renderFeed([fightGroup()])
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toMatch(/Teamfight at 24:03/)
    expect(btn.getAttribute('aria-label')).toMatch(/Tundra 3, BetBoom 1/)
  })

  it('labels a 2-kill group a Trade', () => {
    renderFeed([fightGroup({ label: 'Trade', radiantKills: 1, direKills: 1 })])
    expect(screen.getByText('Trade')).toBeInTheDocument()
  })
})

describe('LiveEventFeed — pagination and ordering', () => {
  it('caps the initial render and offers a "show earlier" affordance', () => {
    const groups = Array.from({ length: 15 }, (_, i) => eventGroup({ time: 100 + i }))
    renderFeed(groups)
    expect(screen.getByRole('button', { name: /show earlier events/i })).toBeInTheDocument()
  })

  it('reveals more groups on tap', () => {
    const groups = Array.from({ length: 15 }, (_, i) => eventGroup({ time: 100 + i }))
    renderFeed(groups)
    const before = screen.getAllByText('k kills v').length
    fireEvent.click(screen.getByRole('button', { name: /show earlier events/i }))
    expect(screen.getAllByText('k kills v').length).toBeGreaterThan(before)
  })

  it('shows no pagination affordance when everything already fits', () => {
    renderFeed([eventGroup(), eventGroup({ time: 200 })])
    expect(screen.queryByRole('button', { name: /show earlier events/i })).not.toBeInTheDocument()
  })

  it('puts the LIVE cue at the top, adjacent to the newest group', () => {
    const { container } = renderFeed([fightGroup()])
    const live = screen.getByText('Live')
    const fight = screen.getByText('Teamfight')
    // eslint-disable-next-line no-bitwise
    expect(live.compareDocumentPosition(fight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container).toBeTruthy()
  })

  it('renders nothing at all when there are no groups', () => {
    const { container } = renderFeed([])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LiveEventFeed — event wording (retained guards)', () => {
  it('resolves the real item name', () => {
    renderFeed([{ kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'radiant', playerName: 'bashka', itemId: 63 } }])
    expect(screen.getByText('bashka buys Black King Bar')).toBeInTheDocument()
  })

  it('says "picks up" for Aegis, which can never be bought', () => {
    renderFeed([{ kind: 'event', time: 900, event: { type: 'ItemPurchased', time: 900, side: 'radiant', playerName: 'alberkaaa', itemId: 138 } }])
    expect(screen.getByText('alberkaaa picks up Aegis of the Immortal')).toBeInTheDocument()
    expect(screen.queryByText(/buys Aegis/)).not.toBeInTheDocument()
  })

  it('uses a neutral verb when the item name does not resolve', () => {
    renderFeed([{ kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'dire', playerName: 'bashka', itemId: 999 } }])
    expect(screen.getByText('bashka gets a marquee item')).toBeInTheDocument()
  })

  it('shows no internal-jargon sub-line on an unattributed kill', () => {
    renderFeed([eventGroup({ ambiguous: true, killerName: null })])
    expect(screen.queryByText(/poll cadence/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not attributable/)).not.toBeInTheDocument()
  })
})

describe('LiveEventFeed — item purchase marker shows real item art', () => {
  it('renders the item\'s own icon (not the generic glyph) inside the side-coloured marker', () => {
    const { container } = renderFeed([
      { kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'radiant', playerName: 'bashka', itemId: 63 } },
    ])
    const img = container.querySelector('img[src*="black_king_bar"]')
    expect(img).not.toBeNull()
    // The marker circle itself still carries the side colour — the icon swap doesn't remove it.
    expect(img.closest('span').className).toMatch(/border-green-500/)
  })

  it('colours the marker red for a dire purchase, green for radiant', () => {
    const { container } = renderFeed([
      { kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'dire', playerName: 'Norma', itemId: 63 } },
    ])
    const img = container.querySelector('img[src*="black_king_bar"]')
    expect(img.closest('span').className).toMatch(/border-red-500/)
  })

  it('falls back to the generic glyph (no broken image) when the item name never resolved', () => {
    const { container } = renderFeed([
      { kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'radiant', playerName: 'bashka', itemId: 999 } },
    ])
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('falls back to the generic glyph on an image load error, rather than a broken-image box', () => {
    const { container } = renderFeed([
      { kind: 'event', time: 600, event: { type: 'ItemPurchased', time: 600, side: 'radiant', playerName: 'bashka', itemId: 63 } },
    ])
    const img = container.querySelector('img')
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('sizes the icon smaller inside a compact (in-fight) row than a standalone row', () => {
    const fightWithItem = fightGroup({
      items: [{ type: 'ItemPurchased', time: 1450, side: 'radiant', playerName: 'bashka', itemId: 63 }],
    })
    const { container } = renderFeed([fightWithItem])
    fireEvent.click(screen.getByRole('button', { name: /teamfight/i }))
    const img = container.querySelector('img[src*="black_king_bar"]')
    expect(img.className).toMatch(/w-4 h-4/)
  })
})

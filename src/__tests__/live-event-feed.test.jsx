/**
 * Coverage for LiveEventFeed's HeroKilled and ItemPurchased rows.
 *
 * ItemPurchased: resolves the item's real name via the itemNames map rather than always showing
 * the generic "buys a marquee item" text (itemNames wasn't threaded into this component at all
 * until that fix), AND uses the correct verb for items that can never actually be bought — `aegis`/
 * `cheese` are Roshan/Tormentor drops, confirmed live (`aegis` rendering as "buys Aegis of the
 * Immortal", which is simply false — nobody buys an Aegis).
 *
 * HeroKilled: an ambiguous/unattributed kill shows no explanatory sub-line — an earlier version
 * said "Killer not attributable at this poll cadence", which is internal jargon a viewer has no
 * use for; the bare "X dies" is already an honest, complete statement on its own.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveEventFeed } from '../components/LiveValveBoard.jsx'

const ITEM_NAMES = {
  63: { key: 'black_king_bar', dname: 'Black King Bar' },
  138: { key: 'aegis', dname: 'Aegis of the Immortal' },
}

describe('LiveEventFeed — ItemPurchased row', () => {
  it('shows the real item name when itemNames resolves it', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{}} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('bashka buys Black King Bar')).toBeInTheDocument()
    expect(screen.queryByText(/buys a marquee item/)).not.toBeInTheDocument()
  })

  it('says "picks up", never "buys", for a Roshan/Tormentor-only drop like Aegis', () => {
    const events = [{ type: 'ItemPurchased', time: 900, side: 'radiant', heroId: 1, playerName: 'alberkaaa', itemId: 138 }]
    render(<LiveEventFeed events={events} heroes={{}} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('alberkaaa picks up Aegis of the Immortal')).toBeInTheDocument()
    expect(screen.queryByText(/buys Aegis/)).not.toBeInTheDocument()
  })

  it('uses a neutral verb (never "buys") when the item name fails to resolve, since an unresolved id could just as easily be a pickup', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 999 }]
    render(<LiveEventFeed events={events} heroes={{}} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('bashka gets a marquee item')).toBeInTheDocument()
    expect(screen.queryByText(/buys/)).not.toBeInTheDocument()
  })

  it('uses the neutral verb when itemNames is not provided at all', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{}} />)
    expect(screen.getByText('bashka gets a marquee item')).toBeInTheDocument()
  })

  it('falls back to the hero name when playerName is null', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: null, itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{ 1: { key: 'antimage', name: 'Anti-Mage' } }} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('Anti-Mage buys Black King Bar')).toBeInTheDocument()
  })
})

describe('LiveEventFeed — HeroKilled row', () => {
  it('shows a bare "X dies" for an ambiguous/unattributed kill, with no jargon sub-line', () => {
    const events = [{ type: 'HeroKilled', time: 1950, side: null, victimName: 'Till The End', ambiguous: true }]
    render(<LiveEventFeed events={events} heroes={{}} />)
    expect(screen.getByText('Till The End dies')).toBeInTheDocument()
    expect(screen.queryByText(/poll cadence/)).not.toBeInTheDocument()
    expect(screen.queryByText(/not attributable/)).not.toBeInTheDocument()
  })

  it('names both sides for an unambiguous, attributed kill', () => {
    const events = [{ type: 'HeroKilled', time: 1950, side: 'dire', victimName: 'Fenwick', killerName: 'Pivot' }]
    render(<LiveEventFeed events={events} heroes={{}} />)
    expect(screen.getByText('Pivot kills Fenwick')).toBeInTheDocument()
  })
})

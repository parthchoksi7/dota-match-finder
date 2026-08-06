/**
 * Coverage for LiveEventFeed's ItemPurchased row — specifically that it resolves the item's real
 * name via the itemNames map rather than always showing the generic "buys a marquee item" text.
 * Regression guard: itemNames wasn't threaded into this component at all until this fix.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveEventFeed } from '../components/LiveValveBoard.jsx'

const ITEM_NAMES = { 63: { key: 'black_king_bar', dname: 'Black King Bar' } }

describe('LiveEventFeed — ItemPurchased row', () => {
  it('shows the real item name when itemNames resolves it', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{}} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('bashka buys Black King Bar')).toBeInTheDocument()
    expect(screen.queryByText(/buys a marquee item/)).not.toBeInTheDocument()
  })

  it('falls back to the generic phrasing when itemNames has no entry for this id', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 999 }]
    render(<LiveEventFeed events={events} heroes={{}} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('bashka buys a marquee item')).toBeInTheDocument()
  })

  it('falls back to the generic phrasing when itemNames is not provided at all', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: 'bashka', itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{}} />)
    expect(screen.getByText('bashka buys a marquee item')).toBeInTheDocument()
  })

  it('falls back to the hero name when playerName is null', () => {
    const events = [{ type: 'ItemPurchased', time: 600, side: 'radiant', heroId: 1, playerName: null, itemId: 63 }]
    render(<LiveEventFeed events={events} heroes={{ 1: { key: 'antimage', name: 'Anti-Mage' } }} itemNames={ITEM_NAMES} />)
    expect(screen.getByText('Anti-Mage buys Black King Bar')).toBeInTheDocument()
  })
})

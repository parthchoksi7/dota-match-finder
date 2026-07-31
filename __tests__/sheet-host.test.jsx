/**
 * Coverage for the sheet-host pattern App.jsx uses to render LiveSeriesSheet and MatchDrawer:
 * a single persistent <Sheet> whose inner content swaps between the two, instead of each owning
 * its own <Sheet> (which used to fully unmount/remount the panel — and replay its entrance
 * animation — when a fan moved from a live series to a completed game, e.g. tapping a finished
 * game inside a live series). This test exercises the actual pattern (not App.jsx's full
 * dependency tree — mocked stand-ins take the place of MatchDrawer/LiveSeriesSheet's bodies)
 * to verify the panel itself never unmounts/remounts across a swap.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sheet, { SHEET_WIDTH } from '../src/components/Sheet.jsx'

function LiveBody() {
  return <div>Live series body</div>
}
function DrawerBody() {
  return <div>Match drawer body</div>
}

// Mirrors App.jsx's host: `{(selectedLiveSeries || selectedMatch) && <Sheet>{selectedMatch ? <MatchDrawer/> : <LiveSeriesSheet/>}</Sheet>}`
function SheetHost({ selectedLiveSeries, selectedMatch }) {
  if (!selectedLiveSeries && !selectedMatch) return null
  return (
    <Sheet onDismiss={() => {}} ariaLabel={selectedMatch ? 'Match details' : 'Live series'} widthClassName={SHEET_WIDTH}>
      <div key={selectedMatch ? 'drawer' : 'live'}>
        {selectedMatch ? <DrawerBody /> : <LiveBody />}
      </div>
    </Sheet>
  )
}

describe('sheet host (App.jsx live-series <-> match-drawer swap)', () => {
  it('renders exactly one dialog for the live-series state', () => {
    render(<SheetHost selectedLiveSeries={{ id: 1 }} selectedMatch={null} />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('Live series body')).toBeInTheDocument()
  })

  it('renders exactly one dialog for the match-drawer state', () => {
    render(<SheetHost selectedLiveSeries={null} selectedMatch={{ id: 2 }} />)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('Match drawer body')).toBeInTheDocument()
  })

  it('does not unmount the panel when swapping from live series to match drawer', () => {
    const { rerender } = render(<SheetHost selectedLiveSeries={{ id: 1 }} selectedMatch={null} />)
    const panelBefore = screen.getByRole('dialog')

    rerender(<SheetHost selectedLiveSeries={{ id: 1 }} selectedMatch={{ id: 2 }} />)

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // Same DOM node — the outer panel never unmounted/remounted across the swap.
    expect(screen.getByRole('dialog')).toBe(panelBefore)
    expect(screen.getByText('Match drawer body')).toBeInTheDocument()
    expect(screen.queryByText('Live series body')).not.toBeInTheDocument()
  })

  it('does not unmount the panel when swapping back from match drawer to live series', () => {
    const { rerender } = render(<SheetHost selectedLiveSeries={null} selectedMatch={{ id: 2 }} />)
    const panelBefore = screen.getByRole('dialog')

    rerender(<SheetHost selectedLiveSeries={{ id: 1 }} selectedMatch={null} />)

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBe(panelBefore)
    expect(screen.getByText('Live series body')).toBeInTheDocument()
  })

  it('renders nothing when neither is selected', () => {
    render(<SheetHost selectedLiveSeries={null} selectedMatch={null} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

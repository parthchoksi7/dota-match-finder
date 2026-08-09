/**
 * Coverage for LiveMatchRow's "this row opens live match details" affordance (2026-08-09).
 * Before this, the row was clickable (onClick + hover state) but nothing signaled that on the
 * row itself — no chevron, no aria role, no keyboard access — especially invisible on mobile
 * where there's no hover to discover it. Owner-requested.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LiveMatchRow from '../components/LiveMatchRow.jsx'

function baseMatch(overrides = {}) {
  return {
    id: 1,
    teamA: 'Team Spirit',
    teamB: 'Gaimin Gladiators',
    tournament: 'Test Cup',
    seriesLabel: 'BO3',
    seriesScore: '0-0',
    bracketRound: 'Upper Bracket Final',
    currentGame: 1,
    games: [],
    streams: [],
    ...overrides,
  }
}

describe('LiveMatchRow — clickable-row affordance', () => {
  it('renders a chevron and marks the row as a button when it is clickable', () => {
    const { container } = render(<LiveMatchRow match={baseMatch()} onSelectLiveMatch={vi.fn()} />)
    expect(container.querySelector('svg path[d="M9 5l7 7-7 7"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /view live match details/i })).toBeInTheDocument()
  })

  it('renders no chevron and no button role when there is nothing to click into', () => {
    const { container } = render(<LiveMatchRow match={baseMatch()} />)
    expect(container.querySelector('svg path[d="M9 5l7 7-7 7"]')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the match on Enter/Space when the row itself has focus', () => {
    const onSelect = vi.fn()
    render(<LiveMatchRow match={baseMatch()} onSelectLiveMatch={onSelect} />)
    const row = screen.getByRole('button', { name: /view live match details/i })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(1)
    fireEvent.keyDown(row, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('does not open the row when Enter originates from a nested watch link', () => {
    const onSelect = vi.fn()
    render(
      <LiveMatchRow
        match={baseMatch({ streams: [{ url: 'https://twitch.tv/x', label: 'ESL' }] })}
        onSelectLiveMatch={onSelect}
      />
    )
    const watchLink = screen.getAllByRole('link', { name: /watch/i })[0]
    fireEvent.keyDown(watchLink, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

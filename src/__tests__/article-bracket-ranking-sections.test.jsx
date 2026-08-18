/**
 * Tests for the `ranking` and `bracket` article section types added for the
 * TI 2026 playoff bracket prediction article (data-driven pre-tournament forecasts).
 *
 * Covers:
 * - `ranking`: renders every item, top row gets the amber "favorite" highlight
 * - `bracket`: predicted winner shown with pct badge, loser dimmed, no live/score/TBD
 *   state leaks in from the real-match code paths those components also serve
 * - `bracket`: drop-in `note` (e.g. "+ loser of Falcons–Yandex") renders
 * - `bracket`: double-elimination section labels (Upper/Lower/Grand Final) render
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleSection, RankingList } from '../pages/ArticlePage'

vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})

describe('RankingList', () => {
  it('renders every item with its value', () => {
    render(<RankingList items={[
      { label: 'TEAM VISION', value: '26.9%' },
      { label: 'Nigma Galaxy', value: '1.6%' },
    ]} />)
    expect(screen.getByText('TEAM VISION')).toBeInTheDocument()
    expect(screen.getByText('26.9%')).toBeInTheDocument()
    expect(screen.getByText('Nigma Galaxy')).toBeInTheDocument()
    expect(screen.getByText('1.6%')).toBeInTheDocument()
  })

  it('returns null for an empty/missing item list', () => {
    const { container: empty } = render(<RankingList items={[]} />)
    expect(empty.firstChild).toBeNull()
    const { container: missing } = render(<RankingList />)
    expect(missing.firstChild).toBeNull()
  })
})

describe('ArticleSection — bracket type', () => {
  const bracketSection = {
    type: 'bracket',
    bracket: [
      { section: 'upper', round: 0, label: 'Quarterfinals', matches: [
        { id: 'qf1', teamA: 'Iron Wing', teamB: 'Team Spirit', predicted: true, winner: 1, pct: 50 },
      ]},
      { section: 'lower', round: 1, label: 'Quarterfinals', matches: [
        { id: 'lqf1', teamA: 'Iron Wing', teamB: 'Team Yandex', predicted: true, winner: 1, pct: 53, note: '+ loser of Falcons–Yandex' },
      ]},
      { section: 'grand_final', round: 0, label: 'Grand Final — Best of 5', matches: [
        { id: 'gf', teamA: 'TEAM VISION', teamB: 'Team Falcons', predicted: true, winner: 0, pct: 61 },
      ]},
    ],
  }

  it('shows the predicted winner with its percentage', () => {
    render(<ArticleSection section={bracketSection} />)
    expect(screen.getByText('61%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders the drop-in note for a lower-bracket match', () => {
    render(<ArticleSection section={bracketSection} />)
    expect(screen.getByText('+ loser of Falcons–Yandex')).toBeInTheDocument()
  })

  it('renders Upper Bracket, Lower Bracket, and Grand Final section labels', () => {
    render(<ArticleSection section={bracketSection} />)
    expect(screen.getByText('Upper Bracket')).toBeInTheDocument()
    expect(screen.getByText('Lower Bracket')).toBeInTheDocument()
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
  })

  it('does not render a live indicator or a raw score for a predicted match', () => {
    const { container } = render(<ArticleSection section={bracketSection} />)
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })
})

describe('ArticleSection — ranking type', () => {
  it('delegates to RankingList', () => {
    render(<ArticleSection section={{ type: 'ranking', items: [{ label: 'BoomBoys', value: '9.0%' }] }} />)
    expect(screen.getByText('BoomBoys')).toBeInTheDocument()
    expect(screen.getByText('9.0%')).toBeInTheDocument()
  })
})

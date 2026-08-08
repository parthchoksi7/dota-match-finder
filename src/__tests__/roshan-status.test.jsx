/**
 * Coverage for RoshanStatus (LiveValveBoard.jsx). Neither state shows a "killing team not
 * reported" caveat — removed entirely per owner feedback (2026-08-08): the card already states
 * plainly what's known (alive, or respawning with a countdown); disclaiming what ISN'T known adds
 * words without adding information a viewer needs.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoshanStatus } from '../components/LiveValveBoard.jsx'

describe('RoshanStatus', () => {
  it('shows "Roshan is up" with no caveat sub-line when alive (respawnTimer <= 0)', () => {
    render(<RoshanStatus respawnTimer={0} />)
    expect(screen.getByText('Roshan is up')).toBeInTheDocument()
    expect(screen.queryByText(/killing team/i)).not.toBeInTheDocument()
  })

  it('shows "Roshan respawning" with a countdown and no caveat sub-line when dead', () => {
    render(<RoshanStatus respawnTimer={166} />)
    expect(screen.getByText('Roshan respawning')).toBeInTheDocument()
    expect(screen.getByText('2:46')).toBeInTheDocument()
    expect(screen.queryByText(/killing team/i)).not.toBeInTheDocument()
  })

  it('renders nothing when respawnTimer is not a finite number', () => {
    expect(render(<RoshanStatus respawnTimer={null} />).container).toBeEmptyDOMElement()
    expect(render(<RoshanStatus respawnTimer={undefined} />).container).toBeEmptyDOMElement()
  })
})

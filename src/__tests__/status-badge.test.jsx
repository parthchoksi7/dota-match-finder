/**
 * Tests for the shared StatusBadge component.
 *
 * Covers: live, upcoming, and completed (default) render states.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../components/StatusBadge'

describe('StatusBadge', () => {
  it('renders "Live" label for live status', () => {
    render(<StatusBadge status="live" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('renders a pulse dot for live status', () => {
    const { container } = render(<StatusBadge status="live" />)
    const dot = container.querySelector('.animate-pulse')
    expect(dot).toBeInTheDocument()
  })

  it('renders "Upcoming" label for upcoming status', () => {
    render(<StatusBadge status="upcoming" />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('does not render a pulse dot for upcoming status', () => {
    const { container } = render(<StatusBadge status="upcoming" />)
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument()
  })

  it('renders "Completed" label for completed status', () => {
    render(<StatusBadge status="completed" />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders "Completed" label for unknown/missing status', () => {
    render(<StatusBadge status={undefined} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })
})

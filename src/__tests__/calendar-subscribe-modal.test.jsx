/**
 * Tests for CalendarSubscribeModal.
 *
 * Covers:
 * - Does not render when isOpen=false
 * - Renders heading and label when isOpen=true
 * - Shows the subscription URL in the input
 * - Copy button calls clipboard API and shows "Copied!" feedback
 * - Platform accordion items expand and collapse on click
 * - Close button calls onClose
 * - Backdrop click calls onClose
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CalendarSubscribeModal from '../components/CalendarSubscribeModal'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))

const TEST_URL = 'https://spectateesports.live/api/tournaments?mode=calendar-all'

function renderModal(props = {}) {
  return render(
    <CalendarSubscribeModal
      isOpen={true}
      onClose={vi.fn()}
      url={TEST_URL}
      feedType="tournament"
      source="all_tournaments"
      label="All Dota 2 Tournaments"
      {...props}
    />
  )
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe('CalendarSubscribeModal — visibility', () => {
  it('does not render when isOpen=false', () => {
    render(
      <CalendarSubscribeModal
        isOpen={false}
        onClose={vi.fn()}
        url={TEST_URL}
        feedType="tournament"
        source="all_tournaments"
        label="All Dota 2 Tournaments"
      />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when isOpen=true', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the heading "Subscribe to Matches"', () => {
    renderModal()
    expect(screen.getByText('Subscribe to Matches')).toBeInTheDocument()
  })

  it('shows the label prop', () => {
    renderModal({ label: 'All Dota 2 Tournaments' })
    expect(screen.getByText('All Dota 2 Tournaments')).toBeInTheDocument()
  })
})

// ── URL input ─────────────────────────────────────────────────────────────────

describe('CalendarSubscribeModal — URL input', () => {
  it('displays the subscription URL in a read-only input', () => {
    renderModal()
    const input = screen.getByDisplayValue(TEST_URL)
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('readonly')
  })

  it('shows an empty input when no URL is provided', () => {
    renderModal({ url: '' })
    const input = screen.getByRole('textbox', { name: '' })
    expect(input.value).toBe('')
  })
})

// ── Copy button ───────────────────────────────────────────────────────────────

describe('CalendarSubscribeModal — copy button', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('initially shows "Copy"', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('calls clipboard.writeText with the URL on click', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEST_URL)
    })
  })

  it('shows "Copied!" after clicking Copy', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })
})

// ── Platform accordion ────────────────────────────────────────────────────────

describe('CalendarSubscribeModal — platform accordion', () => {
  it('shows all three platform buttons', () => {
    renderModal()
    expect(screen.getByText('Google Calendar')).toBeInTheDocument()
    expect(screen.getByText('Apple Calendar')).toBeInTheDocument()
    expect(screen.getByText('Outlook')).toBeInTheDocument()
  })

  it('platform steps are hidden by default', () => {
    renderModal()
    expect(screen.queryByText(/Open Google Calendar/)).not.toBeInTheDocument()
  })

  it('expands Google Calendar steps on click', () => {
    renderModal()
    fireEvent.click(screen.getByText('Google Calendar'))
    expect(screen.getByText(/Open Google Calendar/)).toBeInTheDocument()
  })

  it('collapses expanded section when clicked again', () => {
    renderModal()
    fireEvent.click(screen.getByText('Google Calendar'))
    expect(screen.getByText(/Open Google Calendar/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Google Calendar'))
    expect(screen.queryByText(/Open Google Calendar/)).not.toBeInTheDocument()
  })

  it('only one platform expands at a time', () => {
    renderModal()
    fireEvent.click(screen.getByText('Google Calendar'))
    fireEvent.click(screen.getByText('Apple Calendar'))
    expect(screen.queryByText(/Open Google Calendar/)).not.toBeInTheDocument()
    expect(screen.getByText(/Open the Calendar app/)).toBeInTheDocument()
  })
})

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('CalendarSubscribeModal — close behaviour', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    // The backdrop is the div directly behind the panel
    const backdrop = document.querySelector('[aria-hidden="true"]')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

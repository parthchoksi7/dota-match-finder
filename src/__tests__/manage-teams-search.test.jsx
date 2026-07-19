/**
 * Tests for the "Follow a Team" search in ManageTeamsModal — the dynamic team list
 * (fetchTier1Teams) and alias-aware matching (teamMatchesQuery), added so newly-emerged
 * tier-1 teams (e.g. Parivision) show up without a code change, and community nicknames
 * (e.g. "boomboys" -> BetBoom Team, "pvision" -> Parivision) resolve correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ManageTeamsModal from '../components/ManageTeamsModal'
import { fetchTier1Teams } from '../api'
import { TIER1_TEAMS_FALLBACK } from '../data/tier1TeamsFallback'
import { isPushSupported } from '../utils/push'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn() }
})
vi.mock('../utils/push', () => ({
  isPushSupported: vi.fn(() => false),
  getPushPermission: vi.fn(() => 'default'),
  subscribeToPush: vi.fn(() => Promise.resolve({ ok: true })),
  needsIOSInstall: vi.fn(() => false),
  updatePushPrefs: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('../api', async () => {
  const actual = await vi.importActual('../api')
  return { ...actual, fetchTier1Teams: vi.fn() }
})

const LIVE_TEAMS = [
  { name: 'BetBoom Team', slug: 'betboom', acronym: 'BB', aliases: ['boomboys', 'bb'] },
  { name: 'Parivision', slug: 'parivision', acronym: null, aliases: ['pvision'] },
  { name: 'Team Liquid', slug: 'team-liquid', acronym: 'TL', aliases: ['tl'] },
]

const baseProps = {
  open: true,
  followedTeams: [],
  onToggleFollow: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  isPushSupported.mockReturnValue(false)
  fetchTier1Teams.mockResolvedValue(LIVE_TEAMS)
})

async function openSearch() {
  render(<ManageTeamsModal {...baseProps} />)
  await waitFor(() => expect(fetchTier1Teams).toHaveBeenCalled())
  const input = screen.getByPlaceholderText('Search teams...')
  fireEvent.focus(input)
  return input
}

describe('ManageTeamsModal - dynamic team list', () => {
  it('shows a team from the live fetch that is not in the static fallback (Parivision)', async () => {
    const input = await openSearch()
    fireEvent.change(input, { target: { value: 'parivision' } })
    await waitFor(() => expect(screen.getByText('Parivision')).toBeInTheDocument())
  })

  it('renders correctly when fetchTier1Teams resolves to the static fallback (its documented behavior on network failure — it never rejects to the caller)', async () => {
    fetchTier1Teams.mockResolvedValue(TIER1_TEAMS_FALLBACK)
    render(<ManageTeamsModal {...baseProps} />)
    const input = screen.getByPlaceholderText('Search teams...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'team liquid' } })
    await waitFor(() => expect(screen.getByText('Team Liquid')).toBeInTheDocument())
  })
})

describe('ManageTeamsModal - alias search', () => {
  it('finds BetBoom Team when searching its nickname "boomboys"', async () => {
    const input = await openSearch()
    fireEvent.change(input, { target: { value: 'boomboys' } })
    await waitFor(() => expect(screen.getByText('BetBoom Team')).toBeInTheDocument())
  })

  it('finds Parivision when searching its nickname "pvision"', async () => {
    const input = await openSearch()
    fireEvent.change(input, { target: { value: 'pvision' } })
    await waitFor(() => expect(screen.getByText('Parivision')).toBeInTheDocument())
  })

  it('shows "No teams found" for a query matching no name, acronym, or alias', async () => {
    const input = await openSearch()
    fireEvent.change(input, { target: { value: 'zzz-not-a-team' } })
    await waitFor(() => expect(screen.getByText('No teams found')).toBeInTheDocument())
  })

  it('excludes already-followed teams from suggestions even when their alias matches', async () => {
    render(<ManageTeamsModal {...baseProps} followedTeams={['BetBoom Team']} />)
    await waitFor(() => expect(fetchTier1Teams).toHaveBeenCalled())
    const input = screen.getByPlaceholderText('Search teams...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'boomboys' } })
    await waitFor(() => expect(screen.getByText('No teams found')).toBeInTheDocument())
    expect(screen.queryByText('BetBoom Team', { selector: 'button' })).not.toBeInTheDocument()
  })
})

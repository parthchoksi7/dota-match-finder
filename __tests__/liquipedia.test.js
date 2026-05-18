/**
 * Tests for the Liquipedia transfer parser.
 *
 * These tests import the real implementation from api/_liquipedia.js so they
 * always cover the live code - no inline copies that can drift out of sync.
 *
 * Key regressions guarded here:
 *  - Parser must handle divRow/divCell structure (not <table>/<tr>/<td>)
 *  - Quarterly page (Transfers/YYYY/Nth_Quarter) must be targeted, not Portal:Transfers
 *  - Gzip requirement is handled at the fetch layer, not the parser layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseLiquipediaTransfers, getCurrentTransferPage } from '../api/_liquipedia.js'

// ── HTML fixture builders ─────────────────────────────────────────────────────

/**
 * Builds a minimal but structurally faithful Liquipedia divRow.
 * Mirrors actual Liquipedia HTML: divRow > divCell Date/Name/Team OldTeam/Icon/Team NewTeam/Ref
 */
function makeTransferRow({
  date,
  players,         // [{ path, name }]
  fromTeam = null, // null = free agent / None
  toTeam,
}) {
  const oldTeamCell = fromTeam
    ? `<span class="team-template-team-icon" data-highlighting-class="${fromTeam}"></span>`
    : `<span style="font-style:italic">&#160;None&#160;</span>`

  const playerLinks = players.map(({ path, name }) =>
    `<div class="block-player"><span class="name"><a href="${path}" title="${name}">${name}</a></span></div>`
  ).join('')

  return [
    `<div class="divRow mainpage-transfer-to-team">`,
    `<div class="divCell Date">${date}</div>`,
    `<div class="divCell Name">${playerLinks}</div>`,
    `<div class="divCell Team OldTeam">${oldTeamCell}</div>`,
    `<div class="divCell Icon" style="width:70px"></div>`,
    `<div class="divCell Team NewTeam"><span class="team-template-team-icon" data-highlighting-class="${toTeam}"></span></div>`,
    `<div class="divCell Ref"></div>`,
    `</div>`,
  ].join('')
}

/** Date string N days ago from now in YYYY-MM-DD format */
function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400_000)
  return d.toISOString().slice(0, 10)
}

// ── getCurrentTransferPage ────────────────────────────────────────────────────

describe('getCurrentTransferPage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const cases = [
    { month: 1,  expected: '1st_Quarter', label: 'January' },
    { month: 3,  expected: '1st_Quarter', label: 'March (end of Q1)' },
    { month: 4,  expected: '2nd_Quarter', label: 'April (start of Q2)' },
    { month: 6,  expected: '2nd_Quarter', label: 'June' },
    { month: 7,  expected: '3rd_Quarter', label: 'July' },
    { month: 9,  expected: '3rd_Quarter', label: 'September' },
    { month: 10, expected: '4th_Quarter', label: 'October' },
    { month: 12, expected: '4th_Quarter', label: 'December' },
  ]

  for (const { month, expected, label } of cases) {
    it(`${label} → ${expected}`, () => {
      vi.setSystemTime(new Date(2026, month - 1, 15))
      expect(getCurrentTransferPage()).toBe(`Transfers/2026/${expected}`)
    })
  }

  it('embeds the current year in the page path', () => {
    vi.setSystemTime(new Date(2027, 0, 1))
    expect(getCurrentTransferPage()).toMatch(/^Transfers\/2027\//)
  })

  it('never returns Portal:Transfers', () => {
    vi.setSystemTime(new Date(2026, 4, 17))
    expect(getCurrentTransferPage()).not.toContain('Portal')
  })
})

// ── parseLiquipediaTransfers ──────────────────────────────────────────────────

describe('parseLiquipediaTransfers', () => {
  describe('happy path - single player transfers', () => {
    it('parses a free-agent signing (no old team)', () => {
      const html = makeTransferRow({
        date: daysAgo(3),
        players: [{ path: '/dota2/not_me', name: 'not me' }],
        fromTeam: null,
        toTeam: 'Team Spirit',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles).toHaveLength(1)
      expect(articles[0].title).toBe('not me signs with Team Spirit')
      expect(articles[0].description).toBe('Team Spirit')
      expect(articles[0].categories).toContain('roster')
    })

    it('parses a player moving between teams', () => {
      const html = makeTransferRow({
        date: daysAgo(5),
        players: [{ path: '/dota2/SomePlayer', name: 'SomePlayer' }],
        fromTeam: 'Team Liquid',
        toTeam: 'Team Spirit',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles).toHaveLength(1)
      expect(articles[0].title).toBe('SomePlayer moves to Team Spirit')
      expect(articles[0].description).toBe('Team Liquid → Team Spirit')
    })

    it('appends the transfer date as a URL fragment for dedup stability', () => {
      const date = daysAgo(2)
      const html = makeTransferRow({
        date,
        players: [{ path: '/dota2/Player', name: 'Player' }],
        fromTeam: null,
        toTeam: 'Team Spirit',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles[0].link).toContain(`#${date}`)
    })

    it('sets pubDate to an ISO string matching the transfer date', () => {
      const date = daysAgo(4)
      const html = makeTransferRow({
        date,
        players: [{ path: '/dota2/Player', name: 'Player' }],
        fromTeam: null,
        toTeam: 'OG',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles[0].pubDate).toContain(date)
    })
  })

  describe('happy path - multi-player transfers', () => {
    it('produces one article for a full roster signing', () => {
      const players = [
        { path: '/dota2/P1', name: 'P1' },
        { path: '/dota2/P2', name: 'P2' },
        { path: '/dota2/P3', name: 'P3' },
      ]
      const html = makeTransferRow({
        date: daysAgo(2),
        players,
        fromTeam: null,
        toTeam: 'Gaimin Gladiators',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles).toHaveLength(1)
      expect(articles[0].title).toBe('Gaimin Gladiators signs new roster')
      expect(articles[0].description).toContain('P1')
      expect(articles[0].description).toContain('P2')
      expect(articles[0].description).toContain('P3')
    })

    it('generates "acquires players from" title when old team is known', () => {
      const players = [
        { path: '/dota2/P1', name: 'P1' },
        { path: '/dota2/P2', name: 'P2' },
      ]
      const html = makeTransferRow({
        date: daysAgo(1),
        players,
        fromTeam: 'Team Falcons',
        toTeam: 'Team Secret',
      })
      const articles = parseLiquipediaTransfers(html)
      expect(articles[0].title).toBe('Team Secret acquires players from Team Falcons')
    })
  })

  describe('date filtering', () => {
    it('includes transfers within the 14-day window', () => {
      const html = makeTransferRow({
        date: daysAgo(13),
        players: [{ path: '/dota2/P', name: 'P' }],
        fromTeam: null,
        toTeam: 'OG',
      })
      expect(parseLiquipediaTransfers(html)).toHaveLength(1)
    })

    it('excludes transfers older than 14 days', () => {
      const html = makeTransferRow({
        date: daysAgo(15),
        players: [{ path: '/dota2/P', name: 'P' }],
        fromTeam: null,
        toTeam: 'OG',
      })
      expect(parseLiquipediaTransfers(html)).toHaveLength(0)
    })

    it('mixes old and new rows and only returns the recent one', () => {
      const recent = makeTransferRow({
        date: daysAgo(3),
        players: [{ path: '/dota2/Recent', name: 'Recent' }],
        fromTeam: null,
        toTeam: 'OG',
      })
      const old = makeTransferRow({
        date: daysAgo(20),
        players: [{ path: '/dota2/Old', name: 'Old' }],
        fromTeam: null,
        toTeam: 'OG',
      })
      const articles = parseLiquipediaTransfers(recent + old)
      expect(articles).toHaveLength(1)
      expect(articles[0].title).toContain('Recent')
    })
  })

  describe('filtering - rows that should be skipped', () => {
    it('skips same-team renewals (fromTeam === toTeam)', () => {
      const html = makeTransferRow({
        date: daysAgo(2),
        players: [{ path: '/dota2/P', name: 'P' }],
        fromTeam: 'Team Spirit',
        toTeam: 'Team Spirit',
      })
      expect(parseLiquipediaTransfers(html)).toHaveLength(0)
    })

    it('skips rows where toTeam is TBD', () => {
      const html = makeTransferRow({
        date: daysAgo(2),
        players: [{ path: '/dota2/P', name: 'P' }],
        fromTeam: null,
        toTeam: 'TBD',
      })
      expect(parseLiquipediaTransfers(html)).toHaveLength(0)
    })

    it('skips red-link players (index.php hrefs)', () => {
      const redLinkRow = [
        `<div class="divRow mainpage-transfer-to-team">`,
        `<div class="divCell Date">${daysAgo(2)}</div>`,
        `<div class="divCell Name">`,
        `<div class="block-player"><span class="name">`,
        `<a href="/dota2/index.php?title=Unknown&amp;action=edit&amp;redlink=1" class="new">Unknown</a>`,
        `</span></div></div>`,
        `<div class="divCell Team OldTeam"></div>`,
        `<div class="divCell Icon"></div>`,
        `<div class="divCell Team NewTeam"><span data-highlighting-class="OG"></span></div>`,
        `<div class="divCell Ref"></div></div>`,
      ].join('')
      expect(parseLiquipediaTransfers(redLinkRow)).toHaveLength(0)
    })
  })

  describe('regression - Portal:Transfers navbox structure returns empty', () => {
    // This is the exact bug that broke Liquipedia: fetching Portal:Transfers
    // returns only navbox HTML with <table class="nowraplinks navbox-inner">
    // rows - no divRow elements - so the parser must return [] instead of
    // crashing or returning garbled output.
    it('returns [] for navbox-only HTML (wrong page fetched)', () => {
      const navboxHtml = `
        <div class="navbox"><table class="nowraplinks navbox-inner"><tbody>
          <tr><th class="navbox-group">2026</th>
          <td><a href="/dota2/Transfers/2026/2nd_Quarter">Q2</a></td></tr>
          <tr><th class="navbox-group">2025</th>
          <td><a href="/dota2/Transfers/2025/4th_Quarter">Q4</a></td></tr>
        </tbody></table></div>
      `
      expect(parseLiquipediaTransfers(navboxHtml)).toHaveLength(0)
    })

    it('returns [] for completely empty HTML', () => {
      expect(parseLiquipediaTransfers('')).toHaveLength(0)
    })
  })

  describe('multiple rows in one page', () => {
    it('returns one article per valid row', () => {
      const rows = [
        makeTransferRow({ date: daysAgo(1), players: [{ path: '/dota2/A', name: 'A' }], fromTeam: null, toTeam: 'OG' }),
        makeTransferRow({ date: daysAgo(2), players: [{ path: '/dota2/B', name: 'B' }], fromTeam: 'Team Liquid', toTeam: 'Team Spirit' }),
        makeTransferRow({ date: daysAgo(3), players: [{ path: '/dota2/C', name: 'C' }], fromTeam: null, toTeam: 'Team Secret' }),
      ].join('')
      expect(parseLiquipediaTransfers(rows)).toHaveLength(3)
    })
  })
})

/**
 * Live-score push (`type: 'score'`) — the one deliberate exception to the spoiler-safe push copy
 * rule, and the only type that defaults OFF.
 *
 * Covers the two properties that would be expensive to get wrong in production:
 *  - the opt-in default really is OFF, including for subscribers who predate the pref
 *  - the PS↔OD correlation refuses to guess (no match = no push), so a fan is never sent
 *    another series' score
 */
import { describe, it, expect, vi } from 'vitest'

// Import-safety: live-matches.js constructs an Upstash client at module load and reads dotenv.
// Mock both so importing the pure helpers doesn't require real credentials (mirrors
// push-payload.test.js).
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() {} } }))

import { buildPushPayload, normalizePrefs, collectRunningGames, correlateLiveScores } from '../api/live-matches.js'

const MATCH = {
  id: 998877,
  teamA: 'Tundra Esports',
  teamB: 'BetBoom Team',
  tournament: 'Esports World Cup 2026',
  bracketRound: 'Upper Bracket Final',
  seriesLabel: 'BO3',
  seriesScore: '1-0',
}

const PULSE = {
  radiantName: 'Tundra Esports',
  direName: 'BetBoom Team',
  radiantScore: 24,
  direScore: 19,
  radiantLead: 2400,
  gameTime: 1930,
}

describe("buildPushPayload('score')", () => {
  it('carries the live score and gold lead, and deep-links into the live companion sheet', () => {
    const p = buildPushPayload('score', MATCH, { pulse: PULSE, gamePosition: 2 })
    expect(p.title).toBe('Tundra 24-19 BetBoom')
    expect(p.body).toBe('Game 2 · BO3 1-0 · Tundra +2.4k · 32 min')
    expect(p.url).toBe('/?live=998877&from=push&pt=score')
  })

  it('uses a per-SERIES tag so each send replaces the last instead of stacking', () => {
    const a = buildPushPayload('score', MATCH, { pulse: PULSE, gamePosition: 1 })
    const b = buildPushPayload('score', MATCH, { pulse: { ...PULSE, radiantScore: 31 }, gamePosition: 2 })
    expect(a.tag).toBe('score-998877')
    expect(b.tag).toBe(a.tag)
  })

  it('is silent — an ambient score update is not an interrupt', () => {
    expect(buildPushPayload('score', MATCH, { pulse: PULSE }).silent).toBe(true)
    // The one-shot types stay audible.
    expect(buildPushPayload('live', MATCH).silent).toBeUndefined()
  })

  it('degrades to the matchup + stakes rather than a fabricated score', () => {
    const p = buildPushPayload('score', MATCH, { pulse: { ...PULSE, radiantScore: null } })
    expect(p.title).toBe('Tundra Esports vs BetBoom Team')
    expect(p.title).not.toMatch(/\d+-\d+/)
  })

  it('no em dashes in user-facing copy', () => {
    const p = buildPushPayload('score', MATCH, { pulse: PULSE, gamePosition: 2 })
    expect(`${p.title} ${p.body}`).not.toContain('—')
  })
})

describe('normalizePrefs — score defaults OFF', () => {
  it('an absent prefs object leaves score off while every other type stays on', () => {
    expect(normalizePrefs(null).types).toEqual({ soon: true, live: true, replay: true, score: false })
  })

  it('a legacy subscriber (prefs written before score existed) is not opted in', () => {
    expect(normalizePrefs({ types: { soon: true, live: true, replay: true } }).types.score).toBe(false)
  })

  it('only an explicit true opts in', () => {
    expect(normalizePrefs({ types: { score: true } }).types.score).toBe(true)
    expect(normalizePrefs({ types: { score: 'yes' } }).types.score).toBe(false)
    expect(normalizePrefs({ types: { score: 1 } }).types.score).toBe(false)
  })
})

describe('collectRunningGames', () => {
  const base = {
    id: 1,
    opponents: [{ opponent: { name: 'Tundra Esports' } }, { opponent: { name: 'BetBoom Team' } }],
    games: [
      { position: 1, status: 'finished', begin_at: '2026-07-27T10:00:00Z' },
      { position: 2, status: 'running', begin_at: '2026-07-27T11:00:00Z' },
    ],
  }

  it('picks the running game and converts its start to unix seconds', () => {
    expect(collectRunningGames([base])).toEqual([{
      seriesId: 1,
      startedAt: Date.parse('2026-07-27T11:00:00Z') / 1000,
      position: 2,
      opponents: base.opponents,
    }])
  })

  it('skips a series with no running game, no start time, or an unnamed side', () => {
    expect(collectRunningGames([{ ...base, games: [{ position: 1, status: 'finished' }] }])).toEqual([])
    expect(collectRunningGames([{ ...base, games: [{ position: 1, status: 'running', begin_at: null }] }])).toEqual([])
    expect(collectRunningGames([{ ...base, opponents: [{ opponent: { name: 'Tundra Esports' } }] }])).toEqual([])
  })

  it('tolerates empty / malformed input', () => {
    expect(collectRunningGames(null)).toEqual([])
    expect(collectRunningGames([{}])).toEqual([])
  })
})

describe('correlateLiveScores', () => {
  const startedAt = 1800000000
  const running = [{
    seriesId: 42,
    startedAt,
    position: 2,
    opponents: [{ opponent: { name: 'Tundra Esports' } }, { opponent: { name: 'BetBoom Team' } }],
  }]

  const row = {
    od_match_id: 8500000001,
    start_time: startedAt + 30,
    radiant_name: 'Tundra Esports',
    dire_name: 'BetBoom Team',
    radiant_score: 24,
    dire_score: 19,
    radiant_lead: 2400,
    game_time: 1930,
  }

  it('maps a correlated row into a pulse keyed by PandaScore series id', () => {
    const out = correlateLiveScores(running, [row])
    expect(out.get(42)).toEqual({
      gamePosition: 2,
      pulse: {
        radiantName: 'Tundra Esports',
        direName: 'BetBoom Team',
        radiantScore: 24,
        direScore: 19,
        radiantLead: 2400,
        gameTime: 1930,
      },
    })
  })

  it('picks the right game when two live games sit in the same time window', () => {
    const other = {
      ...row,
      od_match_id: 8500000002,
      start_time: startedAt + 5, // closer in time, but the WRONG teams
      radiant_name: 'Team Falcons',
      dire_name: 'PARIVISION',
      radiant_score: 3,
      dire_score: 11,
    }
    const out = correlateLiveScores(running, [other, row])
    expect(out.get(42).pulse.radiantScore).toBe(24)
  })

  it('returns nothing rather than guessing when no row is in the window', () => {
    expect(correlateLiveScores(running, [{ ...row, start_time: startedAt + 5000 }]).size).toBe(0)
    expect(correlateLiveScores(running, []).size).toBe(0)
    expect(correlateLiveScores([], [row]).size).toBe(0)
  })
})

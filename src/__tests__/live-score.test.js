/**
 * Glanceable live score — the pure formatting + gating layer shared by the browser tab title,
 * the PWA icon badge, and the opt-in live-score push (src/utils/liveScore.js).
 *
 * The properties that actually matter here and are easy to regress:
 *  - a truncated tab title is never ambiguous about whose score is whose (score-first ordering)
 *  - a missing kill score produces NO title / NO ping, never a fabricated "0-0"
 *  - the gold lead is always attributed to a named side, never a bare "+2.4k"
 *  - the ping gate suppresses an unchanged (paused/stalled) game
 */
import { describe, it, expect } from 'vitest'
import {
  shortTeamName,
  formatGoldMagnitude,
  formatLiveScoreTitle,
  formatScoreHeadline,
  formatScoreDetail,
  countFollowedLive,
  scoreSignature,
  shouldSendScorePing,
  SCORE_PING_MIN_GAME_TIME_S,
} from '../utils/liveScore'

const PULSE = {
  radiantName: 'Tundra Esports',
  direName: 'BetBoom Team',
  radiantScore: 24,
  direScore: 19,
  radiantLead: 2400,
  gameTime: 1930,
}

describe('shortTeamName', () => {
  it('strips trailing org boilerplate', () => {
    expect(shortTeamName('Tundra Esports')).toBe('Tundra')
    expect(shortTeamName('Xtreme Gaming')).toBe('Xtreme')
    expect(shortTeamName('BetBoom Team')).toBe('BetBoom')
    expect(shortTeamName('Nigma Galaxy E-Sports')).toBe('Nigma Galaxy')
  })

  it('strips a leading "Team"', () => {
    expect(shortTeamName('Team Falcons')).toBe('Falcons')
    expect(shortTeamName('Team Liquid')).toBe('Liquid')
  })

  it('leaves names with no boilerplate alone', () => {
    expect(shortTeamName('PARIVISION')).toBe('PARIVISION')
    expect(shortTeamName('Gaimin Gladiators')).toBe('Gaimin Gladiators')
  })

  it('never strips down to nothing', () => {
    expect(shortTeamName('Team')).toBe('Team')
    expect(shortTeamName('Gaming')).toBe('Gaming')
  })

  it('returns null for non-strings and blanks', () => {
    expect(shortTeamName(null)).toBe(null)
    expect(shortTeamName(undefined)).toBe(null)
    expect(shortTeamName('   ')).toBe(null)
    expect(shortTeamName(42)).toBe(null)
  })
})

describe('formatGoldMagnitude', () => {
  it('formats thousands with one decimal, sub-1k raw, always positive', () => {
    expect(formatGoldMagnitude(2540)).toBe('+2.5k')
    expect(formatGoldMagnitude(-2540)).toBe('+2.5k')
    expect(formatGoldMagnitude(300)).toBe('+300')
  })

  it('returns null for a dead-even or unreadable lead', () => {
    expect(formatGoldMagnitude(0)).toBe(null)
    expect(formatGoldMagnitude(null)).toBe(null)
    expect(formatGoldMagnitude(NaN)).toBe(null)
  })
})

describe('formatLiveScoreTitle', () => {
  it('puts the score first so a truncated tab still answers the question', () => {
    expect(formatLiveScoreTitle(PULSE)).toBe('24-19 Tundra v BetBoom · Tundra +2.4k')
    // The load-bearing property: the first score belongs to the first-listed name, so cutting
    // the title anywhere still attributes 24 to Tundra.
    expect(formatLiveScoreTitle(PULSE).indexOf('24')).toBeLessThan(formatLiveScoreTitle(PULSE).indexOf('Tundra'))
  })

  it('attributes the gold lead to the DIRE side when dire is ahead', () => {
    expect(formatLiveScoreTitle({ ...PULSE, radiantLead: -3100 })).toBe('24-19 Tundra v BetBoom · BetBoom +3.1k')
  })

  it('drops the gold clause when the game is dead even', () => {
    expect(formatLiveScoreTitle({ ...PULSE, radiantLead: 0 })).toBe('24-19 Tundra v BetBoom')
    expect(formatLiveScoreTitle({ ...PULSE, radiantLead: null })).toBe('24-19 Tundra v BetBoom')
  })

  it('returns null (title untouched) rather than fabricating a score', () => {
    expect(formatLiveScoreTitle({ ...PULSE, radiantScore: null })).toBe(null)
    expect(formatLiveScoreTitle({ ...PULSE, direScore: undefined })).toBe(null)
    expect(formatLiveScoreTitle(null)).toBe(null)
  })

  it('falls back to Radiant/Dire when a side name is missing', () => {
    expect(formatLiveScoreTitle({ ...PULSE, radiantName: null, radiantLead: 0 }))
      .toBe('24-19 Radiant v BetBoom')
  })
})

describe('formatScoreHeadline', () => {
  it('reads name-first (a notification title has room the tab does not)', () => {
    expect(formatScoreHeadline(PULSE)).toBe('Tundra 24-19 BetBoom')
  })

  it('is null without a kill score', () => {
    expect(formatScoreHeadline({ ...PULSE, radiantScore: null })).toBe(null)
  })
})

describe('formatScoreDetail', () => {
  it('joins game, series score, gold lead and clock', () => {
    expect(formatScoreDetail(PULSE, { seriesLabel: 'BO3', seriesScore: '1-0', gamePosition: 2 }))
      .toBe('Game 2 · BO3 1-0 · Tundra +2.4k · 32 min')
  })

  it('drops each clause independently when its source is missing', () => {
    expect(formatScoreDetail(PULSE, {})).toBe('Tundra +2.4k · 32 min')
    expect(formatScoreDetail({ ...PULSE, radiantLead: 0 }, { gamePosition: 1 })).toBe('Game 1 · 32 min')
    expect(formatScoreDetail({ ...PULSE, gameTime: 30, radiantLead: 0 }, {})).toBe('')
  })

  it('shows a bare series score when no format label is known', () => {
    expect(formatScoreDetail({ ...PULSE, radiantLead: 0, gameTime: 0 }, { seriesScore: '1-1' })).toBe('1-1')
  })
})

describe('countFollowedLive', () => {
  const live = [
    { teamA: 'Tundra Esports', teamB: 'BetBoom Team' },
    { teamA: 'Team Falcons', teamB: 'PARIVISION' },
    { teamA: 'Xtreme Gaming', teamB: 'Aurora Gaming' },
  ]

  it('counts only series involving a followed team', () => {
    expect(countFollowedLive(live, ['Tundra Esports'])).toBe(1)
    expect(countFollowedLive(live, ['Tundra Esports', 'PARIVISION'])).toBe(2)
  })

  it('counts a series once even when both sides are followed', () => {
    expect(countFollowedLive(live, ['Tundra Esports', 'BetBoom Team'])).toBe(1)
  })

  it('is zero with no follows, no live matches, or bad input', () => {
    expect(countFollowedLive(live, [])).toBe(0)
    expect(countFollowedLive([], ['Tundra Esports'])).toBe(0)
    expect(countFollowedLive(null, null)).toBe(0)
  })
})

describe('scoreSignature / shouldSendScorePing', () => {
  it('carries the kill score and the raw gold lead', () => {
    expect(scoreSignature(PULSE)).toBe('24-19|2400')
    expect(scoreSignature({ ...PULSE, radiantLead: null })).toBe('24-19|')
  })

  it('ignores a gold-lead drift below the delta, sends once it crosses', () => {
    const prev = scoreSignature(PULSE) // lead 2400
    expect(shouldSendScorePing({ ...PULSE, radiantLead: 3100 }, prev)).toBe(false)
    expect(shouldSendScorePing({ ...PULSE, radiantLead: 3400 }, prev)).toBe(true)
    // A swing the other way counts the same.
    expect(shouldSendScorePing({ ...PULSE, radiantLead: 1400 }, prev)).toBe(true)
  })

  it('sends when a lead reading appears or disappears (delta unknowable)', () => {
    expect(shouldSendScorePing(PULSE, '24-19|')).toBe(true)
    expect(shouldSendScorePing({ ...PULSE, radiantLead: null }, '24-19|2400')).toBe(true)
  })

  it('is null without a kill score, and such a pulse can never ping', () => {
    expect(scoreSignature({ ...PULSE, radiantScore: null })).toBe(null)
    expect(shouldSendScorePing({ ...PULSE, radiantScore: null }, null)).toBe(false)
  })

  it('pings on a first sighting and on a kill-score change', () => {
    expect(shouldSendScorePing(PULSE, null)).toBe(true)
    expect(shouldSendScorePing(PULSE, '')).toBe(true)
    // A single kill is enough, regardless of how little the gold moved.
    expect(shouldSendScorePing({ ...PULSE, radiantScore: 25, radiantLead: 2410 }, scoreSignature(PULSE))).toBe(true)
  })

  it('suppresses an unchanged game (the paused/stalled case)', () => {
    expect(shouldSendScorePing(PULSE, scoreSignature(PULSE))).toBe(false)
  })

  it('suppresses the first minutes, where the now-live alert already fired', () => {
    expect(shouldSendScorePing({ ...PULSE, gameTime: SCORE_PING_MIN_GAME_TIME_S - 1 }, null)).toBe(false)
    expect(shouldSendScorePing({ ...PULSE, gameTime: SCORE_PING_MIN_GAME_TIME_S }, null)).toBe(true)
    expect(shouldSendScorePing({ ...PULSE, gameTime: null }, null)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { correlateValveGame } from '../api/_handlers/liveValvePulse.js'

function snapshot(games) {
  return { result: { games } }
}

function game(matchId, radiantTeamName, direTeamName) {
  return {
    match_id: matchId,
    radiant_team: { team_name: radiantTeamName },
    dire_team: { team_name: direTeamName },
  }
}

describe('correlateValveGame', () => {
  it('finds the game whose team pair matches the PandaScore opponents', () => {
    const snap = snapshot([
      game(1, 'Team Spirit', 'Gaimin Gladiators'),
      game(2, 'Tundra Esports', 'BetBoom Team'),
    ])
    const hit = correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')
    expect(hit.game.match_id).toBe(2)
  })

  it('reports which PandaScore name is on Valve\'s Radiant side', () => {
    const snap = snapshot([game(1, 'BetBoom Team', 'Tundra Esports')])
    const hit = correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')
    // Valve has BetBoom as Radiant, so the PS names must be reported swapped relative to input.
    expect(hit.radiantName).toBe('BetBoom Team')
    expect(hit.direName).toBe('Tundra Esports')
  })

  it('matches regardless of which PandaScore opponent is listed first', () => {
    const snap = snapshot([game(1, 'Tundra Esports', 'BetBoom Team')])
    const a = correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')
    const b = correlateValveGame(snap, 'BetBoom Team', 'Tundra Esports')
    expect(a.game.match_id).toBe(1)
    expect(b.game.match_id).toBe(1)
    // Radiant attribution must follow Valve's own sides, not the PS argument order.
    expect(a.radiantName).toBe('Tundra Esports')
    expect(b.radiantName).toBe('Tundra Esports')
  })

  it('returns null when NO game matches', () => {
    const snap = snapshot([game(1, 'Team Spirit', 'Gaimin Gladiators')])
    expect(correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')).toBeNull()
  })

  it('returns null when MORE THAN ONE game matches, rather than binding the wrong one', () => {
    // Two games of the same series can sit in the feed together around a game transition.
    // Guessing here would silently show the previous game's final state as if it were current.
    const snap = snapshot([
      game(1, 'Tundra Esports', 'BetBoom Team'),
      game(2, 'Tundra Esports', 'BetBoom Team'),
    ])
    expect(correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')).toBeNull()
  })

  it('skips games with a missing team block (~50% of live league games carry none)', () => {
    const snap = snapshot([
      { match_id: 1, radiant_team: null, dire_team: null },
      game(2, 'Tundra Esports', 'BetBoom Team'),
    ])
    const hit = correlateValveGame(snap, 'Tundra Esports', 'BetBoom Team')
    expect(hit.game.match_id).toBe(2)
  })

  it('returns null without both PandaScore names — names are the only join key available', () => {
    const snap = snapshot([game(1, 'Tundra Esports', 'BetBoom Team')])
    expect(correlateValveGame(snap, 'Tundra Esports', null)).toBeNull()
    expect(correlateValveGame(snap, null, 'BetBoom Team')).toBeNull()
  })

  it('degrades to null on an empty or malformed snapshot rather than throwing', () => {
    expect(correlateValveGame(snapshot([]), 'A Team', 'B Team')).toBeNull()
    expect(correlateValveGame(null, 'A Team', 'B Team')).toBeNull()
    expect(correlateValveGame({}, 'A Team', 'B Team')).toBeNull()
  })
})

/**
 * Unit tests for the team-grounding fix in api/summarize.js (2026-08-13). Before this fix, the
 * model was given a bare `isRadiant` boolean and had to re-derive each player's team name itself
 * at generation time, which caused real cross-team misattributions in production (a Team Spirit
 * player's action credited to Aurora Gaming in one section of the same summary). These tests
 * cover the two pieces that close that gap: `trimMatchDataForSummary` resolving an explicit
 * `team_name` on every player/pick-ban, and `buildMatchSummaryPrompt` surfacing that as an
 * explicit roster block in the prompt text itself.
 */

import { describe, it, expect } from 'vitest'
import { trimMatchDataForSummary, buildMatchSummaryPrompt } from '../api/summarize.js'

function baseMatchData(overrides = {}) {
  return {
    duration: 2520,
    radiant_win: true,
    radiant_score: 30,
    dire_score: 20,
    radiant_name: 'Team Spirit',
    dire_name: 'Aurora Gaming',
    picks_bans: [
      { is_pick: true, hero_id: 11, team: 0, order: 1 },
      { is_pick: true, hero_id: 22, team: 1, order: 2 },
    ],
    players: [
      { hero_id: 11, personaname: 'Yatoro', isRadiant: true, kills: 11, deaths: 2, assists: 15, net_worth: 37756, hero_damage: 43248, lane_role: 1 },
      { hero_id: 22, personaname: 'Nightfall', isRadiant: false, kills: 5, deaths: 6, assists: 9, net_worth: 20000, hero_damage: 15000, lane_role: 2 },
    ],
    ...overrides,
  }
}

describe('trimMatchDataForSummary — team_name resolution', () => {
  it('sets team_name on every player from isRadiant', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData())
    expect(trimmed.players.find(p => p.personaname === 'Yatoro').team_name).toBe('Team Spirit')
    expect(trimmed.players.find(p => p.personaname === 'Nightfall').team_name).toBe('Aurora Gaming')
  })

  it('falls back to player_slot to derive isRadiant, and still resolves team_name from it', () => {
    const matchData = baseMatchData({
      players: [
        { hero_id: 11, personaname: 'SlotPlayer', player_slot: 3, kills: 1, deaths: 1, assists: 1, net_worth: 1000, hero_damage: 1000, lane_role: 1 },
        { hero_id: 22, personaname: 'DireSlotPlayer', player_slot: 129, kills: 1, deaths: 1, assists: 1, net_worth: 1000, hero_damage: 1000, lane_role: 1 },
      ],
    })
    const trimmed = trimMatchDataForSummary(matchData)
    const radiant = trimmed.players.find(p => p.personaname === 'SlotPlayer')
    const dire = trimmed.players.find(p => p.personaname === 'DireSlotPlayer')
    expect(radiant.isRadiant).toBe(true)
    expect(radiant.team_name).toBe('Team Spirit')
    expect(dire.isRadiant).toBe(false)
    expect(dire.team_name).toBe('Aurora Gaming')
  })

  it('sets team_name on every pick_ban from the team index (0=radiant, 1=dire)', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData())
    expect(trimmed.picks_bans[0].team_name).toBe('Team Spirit')
    expect(trimmed.picks_bans[1].team_name).toBe('Aurora Gaming')
  })

  it('leaves team_name (and isRadiant) unresolved rather than defaulting to dire when a player has neither isRadiant nor player_slot', () => {
    const matchData = baseMatchData({
      players: [
        { hero_id: 11, personaname: 'UnknownTeamPlayer', kills: 1, deaths: 1, assists: 1, net_worth: 1000, hero_damage: 1000, lane_role: 1 },
      ],
    })
    const trimmed = trimMatchDataForSummary(matchData)
    const player = trimmed.players[0]
    expect(player.isRadiant).toBeUndefined()
    expect(player.team_name).toBeUndefined()
  })

  it('leaves pick_ban team_name unresolved when pb.team is neither 0 nor 1', () => {
    const matchData = baseMatchData({
      picks_bans: [{ is_pick: true, hero_id: 11, team: null, order: 1 }],
    })
    const trimmed = trimMatchDataForSummary(matchData)
    expect(trimmed.picks_bans[0].team_name).toBeUndefined()
  })

  it('does not crash when players or picks_bans are missing', () => {
    const matchData = baseMatchData({ players: undefined, picks_bans: undefined })
    expect(() => trimMatchDataForSummary(matchData)).not.toThrow()
    const trimmed = trimMatchDataForSummary(matchData)
    expect(trimmed.players).toBeUndefined()
    expect(trimmed.picks_bans).toBeUndefined()
  })
})

describe('buildMatchSummaryPrompt — roster grounding', () => {
  it('includes a TEAM ROSTERS block listing each player under their real team', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData())
    const withHeroNames = {
      ...trimmed,
      players: trimmed.players.map(p => ({ ...p, hero_name: p.hero_id === 11 ? 'Shadow Fiend' : 'Axe' })),
    }
    const prompt = buildMatchSummaryPrompt(withHeroNames, {})

    expect(prompt).toContain('TEAM ROSTERS')
    const rosterSection = prompt.slice(prompt.indexOf('TEAM ROSTERS'), prompt.indexOf('Before writing'))
    expect(rosterSection).toContain('Team Spirit: Yatoro (Shadow Fiend)')
    expect(rosterSection).toContain('Aurora Gaming: Nightfall (Axe)')
  })

  it('falls back to resolving hero_name from the heroes map when not pre-resolved', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData())
    const heroes = { 11: 'Shadow Fiend', 22: 'Axe' }
    const prompt = buildMatchSummaryPrompt(trimmed, heroes)

    expect(prompt).toContain('Yatoro (Shadow Fiend)')
    expect(prompt).toContain('Nightfall (Axe)')
  })

  it('omits a team-unresolved player from both roster buckets instead of defaulting them into dire', () => {
    const matchData = baseMatchData({
      players: [
        { hero_id: 11, personaname: 'Yatoro', isRadiant: true, kills: 11, deaths: 2, assists: 15, net_worth: 37756, hero_damage: 43248, lane_role: 1 },
        { hero_id: 22, personaname: 'Nightfall', isRadiant: false, kills: 5, deaths: 6, assists: 9, net_worth: 20000, hero_damage: 15000, lane_role: 2 },
        { hero_id: 33, personaname: 'UnknownTeamPlayer', kills: 1, deaths: 1, assists: 1, net_worth: 1000, hero_damage: 1000, lane_role: 1 },
      ],
    })
    const trimmed = trimMatchDataForSummary(matchData)
    const heroes = { 11: 'Shadow Fiend', 22: 'Axe', 33: 'Pudge' }
    const prompt = buildMatchSummaryPrompt(trimmed, heroes)
    const rosterSection = prompt.slice(prompt.indexOf('TEAM ROSTERS'), prompt.indexOf('Before writing'))

    expect(rosterSection).not.toContain('UnknownTeamPlayer')
  })

  it('does not crash and produces an empty roster when players/picks_bans are absent', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData({ players: undefined, picks_bans: undefined }))
    expect(() => buildMatchSummaryPrompt(trimmed, {})).not.toThrow()
    const prompt = buildMatchSummaryPrompt(trimmed, {})
    expect(prompt).toContain('Team Spirit: ')
    expect(prompt).toContain('Aurora Gaming: ')
  })

  it('includes the numeric-quoting and no-fabrication rules', () => {
    const trimmed = trimMatchDataForSummary(baseMatchData())
    const prompt = buildMatchSummaryPrompt(trimmed, { 11: 'Shadow Fiend', 22: 'Axe' })
    expect(prompt).toMatch(/quoted exactly/i)
    expect(prompt).toMatch(/do not invent narrative events/i)
  })
})

import { describe, it, expect } from 'vitest'
import { mergeWithPsGames } from '../api'

function makeOdMatch(id, seriesId, startTime = 1000, radiantTeam = 'Team A', direTeam = 'Team B') {
  return { id: String(id), seriesId, startTime, radiantScore: 25, direScore: 18, _fromPandaScore: false, radiantTeam, direTeam }
}

function makePsGame(id, pandaMatchId, seriesId, startTime = 1000) {
  return { id: String(id), _pandaMatchId: pandaMatchId, seriesId, startTime, radiantScore: null, direScore: null, _fromPandaScore: true }
}

function makeTempPsGame(pandaMatchId, position, seriesId, startTime = 1000, radiantTeam = 'Team A', direTeam = 'Team B') {
  return {
    id: `_ps-${pandaMatchId}-${position}`,
    _pandaMatchId: pandaMatchId,
    seriesId,
    startTime,
    radiantScore: null,
    direScore: null,
    _fromPandaScore: true,
    _tempId: true,
    radiantTeam,
    direTeam,
  }
}

describe('mergeWithPsGames', () => {
  it('returns matches unchanged when psGames is empty', () => {
    const matches = [makeOdMatch('1', 100)]
    expect(mergeWithPsGames(matches, [])).toBe(matches)
  })

  it('returns matches unchanged when psGames is null/undefined', () => {
    const matches = [makeOdMatch('1', 100)]
    expect(mergeWithPsGames(matches, null)).toBe(matches)
    expect(mergeWithPsGames(matches, undefined)).toBe(matches)
  })

  it('Case 1: all PS games already in OD - nothing injected', () => {
    const matches = [makeOdMatch('10', 500), makeOdMatch('11', 500)]
    const psGames = [
      makePsGame('10', 99, 500),
      makePsGame('11', 99, 500),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(2)
    expect(result.map(m => m.id)).toEqual(['10', '11'])
  })

  it('Case 2: no PS games in OD - all injected with PS seriesId', () => {
    const matches = [makeOdMatch('10', 500, 2000)]
    const psGames = [
      makePsGame('20', 99, 99, 1800),
      makePsGame('21', 99, 99, 1700),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(3)
    const injected = result.filter(m => m._fromPandaScore)
    expect(injected).toHaveLength(2)
    expect(injected[0].seriesId).toBe(99)
    expect(injected[1].seriesId).toBe(99)
  })

  it('Case 3: partial - missing PS games get bridged seriesId from OD game', () => {
    const matches = [makeOdMatch('10', 1098540, 3000)]
    const psGames = [
      makePsGame('10', 99, 99, 3000), // already in OD
      makePsGame('20', 99, 99, 2900), // not in OD
      makePsGame('21', 99, 99, 2800), // not in OD
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(3)
    const injected = result.filter(m => m._fromPandaScore)
    expect(injected).toHaveLength(2)
    injected.forEach(g => expect(g.seriesId).toBe(1098540))
  })

  it('sorts result by startTime descending after injection', () => {
    const matches = [makeOdMatch('10', 500, 1000)]
    const psGames = [
      makePsGame('20', 99, 99, 3000),
      makePsGame('21', 99, 99, 500),
    ]
    const result = mergeWithPsGames(matches, psGames)
    const times = result.map(m => m.startTime)
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('handles multiple independent PS series correctly', () => {
    const matches = [makeOdMatch('10', 500, 2000)]
    const psGames = [
      makePsGame('20', 111, 111, 1900), // series A - not in OD
      makePsGame('21', 111, 111, 1800), // series A - not in OD
      makePsGame('10', 222, 222, 2000), // series B - already in OD (Case 1)
    ]
    const result = mergeWithPsGames(matches, psGames)
    // Only series A games injected; series B skipped (Case 1)
    expect(result).toHaveLength(3)
    const injected = result.filter(m => m._fromPandaScore)
    expect(injected).toHaveLength(2)
    injected.forEach(g => expect(g._pandaMatchId).toBe(111))
  })

  it('does not mutate the original matches array', () => {
    const matches = [makeOdMatch('10', 500, 2000)]
    const original = [...matches]
    mergeWithPsGames(matches, [makePsGame('20', 99, 99, 1000)])
    expect(matches).toHaveLength(original.length)
  })

  it('returns matches unchanged when no toInject entries', () => {
    // All PS games are already in OD (Case 1 only)
    const matches = [makeOdMatch('10', 500), makeOdMatch('11', 500)]
    const psGames = [makePsGame('10', 99, 500), makePsGame('11', 99, 500)]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toBe(matches)
  })

  it('handles empty matches with PS games (all injected)', () => {
    const psGames = [makePsGame('20', 99, 99, 2000), makePsGame('21', 99, 99, 1000)]
    const result = mergeWithPsGames([], psGames)
    expect(result).toHaveLength(2)
    expect(result[0].startTime).toBe(2000)
    expect(result[1].startTime).toBe(1000)
  })

  it('_tempId: injects when OD does not have the match (backend returned temp ID = OD not indexed)', () => {
    const recent = Math.floor(Date.now() / 1000) - 3600
    const matches = [
      makeOdMatch('8800000001', 1098400, recent, 'Aurora Gaming', 'Gaimin Gladiators'),
    ]
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, recent + 200, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, recent + 300, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 3, 1487821, recent + 400, 'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(4)
    expect(result.filter(m => m._fromPandaScore)).toHaveLength(3)
  })

  it('_tempId backstop: injects when OD match is recent but for a different team pair', () => {
    const recent = Math.floor(Date.now() / 1000) - 1800
    const matches = [makeOdMatch('8800000001', 1098400, recent, 'Aurora Gaming', 'Gaimin Gladiators')]
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, recent, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, recent + 100, 'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(3)
    expect(result.filter(m => m._fromPandaScore)).toHaveLength(2)
  })

  it('_tempId backstop: skips injection when all PS games are older than 8h', () => {
    const old = Math.floor(Date.now() / 1000) - 9 * 3600  // 9h ago — outside 8h window
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, old, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, old + 3600, 'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames([], psGames)
    expect(result).toHaveLength(0)
  })

  it('backend-resolved IDs: if backend returns real OD ID, Case 1 fires and PS is skipped', () => {
    // Simulates backend having resolved the OD match ID via timestamp lookup.
    // The PS game now carries the real OD ID, so it matches in odIds → no injection.
    const realOdId = '8814771003'
    const matches = [makeOdMatch(realOdId, 1098540, 2000, 'Nigma Galaxy', 'BB')]
    const psGames = [
      // Backend resolved: id = real OD match ID, _tempId: false
      { id: realOdId, _pandaMatchId: 1487824, seriesId: 1098540, startTime: 2000,
        radiantScore: null, direScore: null, _fromPandaScore: true, _tempId: false,
        radiantTeam: 'BetBoom Team', direTeam: 'Nigma Galaxy' },
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(1)
    expect(result[0]._fromPandaScore).toBe(false)  // OD version kept, not PS version
  })
})

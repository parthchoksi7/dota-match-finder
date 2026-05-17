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

  it('_tempId dedup: skips injection when OD already has matching team pair (recent)', () => {
    // Use real-ish recent timestamps (within 72h of now)
    const recent = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    const matches = [
      makeOdMatch('8814473655', 1098540, recent - 200, 'Vici Gaming', 'Team Liquid'),
      makeOdMatch('8814554021', 1098540, recent - 100, 'Vici Gaming', 'Team Liquid'),
      makeOdMatch('8814642533', 1098540, recent,       'Vici Gaming', 'Team Liquid'),
    ]
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, recent - 200, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, recent - 100, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 3, 1487821, recent,       'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(3)
    expect(result.every(m => !m._fromPandaScore)).toBe(true)
  })

  it('_tempId dedup: injects when OD does not have matching team pair yet', () => {
    const recent = Math.floor(Date.now() / 1000) - 3600
    const matches = [
      makeOdMatch('8800000001', 1098400, recent, 'Aurora', 'Vici Gaming'),
    ]
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, recent + 200, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, recent + 300, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 3, 1487821, recent + 400, 'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(4)
    const injected = result.filter(m => m._fromPandaScore)
    expect(injected).toHaveLength(3)
  })

  it('_tempId dedup: team pair comparison is order-independent', () => {
    const recent = Math.floor(Date.now() / 1000) - 3600
    const matches = [makeOdMatch('111', 500, recent, 'Team Liquid', 'Vici Gaming')]
    const psGames = [
      // PS has teams swapped (Vici as radiantTeam)
      makeTempPsGame(99, 1, 99, recent, 'Vici Gaming', 'Team Liquid'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(1)
    expect(result[0]._fromPandaScore).toBe(false)
  })

  it('_tempId dedup: does not suppress when OD match with same teams is older than 8h', () => {
    const old = Math.floor(Date.now() / 1000) - 10 * 3600 // 10h ago — outside 8h window
    const recent = Math.floor(Date.now() / 1000) - 1800   // 30min ago
    const matches = [makeOdMatch('8800000001', 1098400, old, 'Team Liquid', 'Vici Gaming')]
    const psGames = [
      makeTempPsGame(1487821, 1, 1487821, recent, 'Team Liquid', 'Vici Gaming'),
      makeTempPsGame(1487821, 2, 1487821, recent + 100, 'Team Liquid', 'Vici Gaming'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    // Should inject because the OD match is outside the 8h window
    expect(result).toHaveLength(3)
    const injected = result.filter(m => m._fromPandaScore)
    expect(injected).toHaveLength(2)
  })

  it('name mismatch: "Aurora" (PS) vs "Aurora Gaming" (OD) - substring match deduplicates', () => {
    // PS uses short names, OD uses full names — "aurora gaming".includes("aurora") = true
    const recent = Math.floor(Date.now() / 1000) - 1800
    const matches = [makeOdMatch('999', 500, recent, 'Aurora Gaming', 'Gaimin Gladiators')]
    const psGames = [
      makeTempPsGame(7777, 1, 7777, recent, 'Aurora', 'Gaimin Gladiators'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(1)
    expect(result[0]._fromPandaScore).toBe(false)
  })

  it('name mismatch: "BetBoom" (PS) vs "BetBoom Team" (OD) - substring match deduplicates', () => {
    // "betboom team".includes("betboom") = true
    const recent = Math.floor(Date.now() / 1000) - 1800
    const matches = [makeOdMatch('888', 500, recent, 'BetBoom Team', 'Team Spirit')]
    const psGames = [
      makeTempPsGame(6666, 1, 6666, recent, 'BetBoom', 'Team Spirit'),
    ]
    const result = mergeWithPsGames(matches, psGames)
    expect(result).toHaveLength(1)
    expect(result[0]._fromPandaScore).toBe(false)
  })
})

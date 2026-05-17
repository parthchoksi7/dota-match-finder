import { describe, it, expect } from 'vitest'
import { mergeWithPsGames } from '../api'

function makeOdMatch(id, seriesId, startTime = 1000) {
  return { id: String(id), seriesId, startTime, radiantScore: 25, direScore: 18, _fromPandaScore: false }
}

function makePsGame(id, pandaMatchId, seriesId, startTime = 1000) {
  return { id: String(id), _pandaMatchId: pandaMatchId, seriesId, startTime, radiantScore: null, direScore: null, _fromPandaScore: true }
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
})

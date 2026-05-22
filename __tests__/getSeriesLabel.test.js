import { describe, it, expect } from 'vitest'
import { getSeriesLabel } from '../api/_shared.js'

describe('getSeriesLabel', () => {
  it('returns BO1 for best_of_1', () => {
    expect(getSeriesLabel('best_of_1', null)).toBe('BO1')
  })

  it('returns BO2 for best_of_2', () => {
    expect(getSeriesLabel('best_of_2', null)).toBe('BO2')
  })

  it('returns BO3 for best_of_3', () => {
    expect(getSeriesLabel('best_of_3', null)).toBe('BO3')
  })

  it('returns BO5 for best_of_5', () => {
    expect(getSeriesLabel('best_of_5', null)).toBe('BO5')
  })

  it('returns BON for best_of with explicit numberOfGames', () => {
    expect(getSeriesLabel('best_of', 7)).toBe('BO7')
  })

  it('returns null for best_of with no numberOfGames', () => {
    expect(getSeriesLabel('best_of', null)).toBeNull()
  })

  it('returns null for unknown match type', () => {
    expect(getSeriesLabel('unknown', null)).toBeNull()
  })

  it('returns null for null match type', () => {
    expect(getSeriesLabel(null, null)).toBeNull()
  })
})

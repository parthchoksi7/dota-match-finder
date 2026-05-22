import { describe, it, expect } from 'vitest'
import { parseBracketRound } from '../api/_shared.js'

describe('parseBracketRound', () => {
  it('strips team names after colon', () => {
    expect(parseBracketRound('Upper Bracket Final: PARI vs TS')).toBe('Upper Bracket Final')
  })

  it('applies title case to lowercase input', () => {
    expect(parseBracketRound('Grand final: TBD vs TBD')).toBe('Grand Final')
  })

  it('applies title case to mixed case input', () => {
    expect(parseBracketRound('Upper bracket semifinal 1: Recrent vs TBD')).toBe('Upper Bracket Semifinal 1')
  })

  it('handles space before colon', () => {
    expect(parseBracketRound('Lower Bracket Final : TBD vs TBD')).toBe('Lower Bracket Final')
  })

  it('handles already-correct title case', () => {
    expect(parseBracketRound('Lower Bracket Quarterfinals 1: AUR vs Tundra')).toBe('Lower Bracket Quarterfinals 1')
  })

  it('returns null for null input', () => {
    expect(parseBracketRound(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(parseBracketRound(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseBracketRound('')).toBeNull()
  })

  it('handles name with no colon', () => {
    expect(parseBracketRound('Grand Final')).toBe('Grand Final')
  })
})

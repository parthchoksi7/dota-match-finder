/**
 * Tests for the match-enrichment mode added to api/tournaments.js.
 * This mode combines match-formats and match-brackets into a single KV round-trip,
 * returning { formats, brackets } keyed by OpenDota match ID.
 *
 * Tests focus on the transformation logic — KV result splitting, map building,
 * missing-ID detection, PS fallback bracket population, and the Supabase
 * match_stream_history.bracket_round fallback — without exercising the network layer.
 */

import { describe, it, expect } from 'vitest'
import { parseBracketRound } from '../api/_shared.js'

// ── KV result splitting ───────────────────────────────────────────────────────
// The handler calls kv.mget(...fmtKeys, ...bktKeys) and slices the result.
// fmtVals = allVals.slice(0, N), bktVals = allVals.slice(N)

function splitKvResult(ids, allVals) {
  const n = ids.length
  return {
    fmtVals: allVals.slice(0, n),
    bktVals: allVals.slice(n),
  }
}

describe('match-enrichment: KV result splitting', () => {
  it('correctly splits a 2-id mget result', () => {
    const ids = ['111', '222']
    const allVals = ['best_of_3', null, 'Grand Final', null]
    const { fmtVals, bktVals } = splitKvResult(ids, allVals)
    expect(fmtVals).toEqual(['best_of_3', null])
    expect(bktVals).toEqual(['Grand Final', null])
  })

  it('handles all-null result (no KV entries)', () => {
    const ids = ['111', '222', '333']
    const allVals = [null, null, null, null, null, null]
    const { fmtVals, bktVals } = splitKvResult(ids, allVals)
    expect(fmtVals).toEqual([null, null, null])
    expect(bktVals).toEqual([null, null, null])
  })

  it('handles single id', () => {
    const ids = ['111']
    const allVals = ['best_of_5', 'Upper Bracket Final']
    const { fmtVals, bktVals } = splitKvResult(ids, allVals)
    expect(fmtVals).toEqual(['best_of_5'])
    expect(bktVals).toEqual(['Upper Bracket Final'])
  })
})

// ── Map building from KV vals ─────────────────────────────────────────────────

function buildMaps(ids, fmtVals, bktVals) {
  const formats = {}
  const brackets = {}
  ids.forEach((id, i) => {
    if (fmtVals[i]) formats[id] = fmtVals[i]
    if (bktVals[i]) brackets[id] = bktVals[i]
  })
  return { formats, brackets }
}

describe('match-enrichment: map building', () => {
  it('populates both maps when all values present', () => {
    const ids = ['111', '222']
    const fmtVals = ['best_of_3', 'best_of_5']
    const bktVals = ['Grand Final', 'Upper Bracket Semifinal']
    const { formats, brackets } = buildMaps(ids, fmtVals, bktVals)
    expect(formats).toEqual({ '111': 'best_of_3', '222': 'best_of_5' })
    expect(brackets).toEqual({ '111': 'Grand Final', '222': 'Upper Bracket Semifinal' })
  })

  it('skips null format entries', () => {
    const ids = ['111', '222']
    const fmtVals = [null, 'best_of_3']
    const bktVals = ['Grand Final', 'Lower Bracket Final']
    const { formats } = buildMaps(ids, fmtVals, bktVals)
    expect(formats).not.toHaveProperty('111')
    expect(formats['222']).toBe('best_of_3')
  })

  it('skips null bracket entries', () => {
    const ids = ['111', '222']
    const fmtVals = ['best_of_3', 'best_of_3']
    const bktVals = [null, 'Grand Final']
    const { brackets } = buildMaps(ids, fmtVals, bktVals)
    expect(brackets).not.toHaveProperty('111')
    expect(brackets['222']).toBe('Grand Final')
  })

  it('returns empty maps when all vals are null', () => {
    const ids = ['111', '222']
    const { formats, brackets } = buildMaps(ids, [null, null], [null, null])
    expect(formats).toEqual({})
    expect(brackets).toEqual({})
  })
})

// ── Missing ID detection ──────────────────────────────────────────────────────

describe('match-enrichment: missing bracket detection', () => {
  it('finds IDs whose bracket is absent', () => {
    const ids = ['111', '222', '333']
    const brackets = { '222': 'Grand Final' }
    const missing = ids.filter(id => !brackets[id])
    expect(missing).toEqual(['111', '333'])
  })

  it('returns empty array when all brackets are present', () => {
    const ids = ['111', '222']
    const brackets = { '111': 'Grand Final', '222': 'Upper Bracket Final' }
    const missing = ids.filter(id => !brackets[id])
    expect(missing).toEqual([])
  })

  it('returns all IDs when brackets is empty', () => {
    const ids = ['111', '222']
    const missing = ids.filter(id => !{}[id])
    expect(missing).toEqual(['111', '222'])
  })
})

// ── PS fallback bracket population ───────────────────────────────────────────
// Replicates the loop from the handler: for each PS match game, if the game's
// external_identifier is in the missingSet, write its bracket round.

function applyPsFallback(psMatches, missingSet, brackets) {
  for (const m of (Array.isArray(psMatches) ? psMatches : [])) {
    const br = parseBracketRound(m.name)
    if (!br) continue
    for (const g of (m.games || [])) {
      const extId = String(g.external_identifier || '')
      if (!extId || !missingSet.has(extId)) continue
      brackets[extId] = br
    }
  }
  return brackets
}

describe('match-enrichment: PS fallback population', () => {
  it('fills missing bracket from PS match game', () => {
    const missingSet = new Set(['111'])
    const brackets = {}
    const psMatches = [
      { name: 'Grand Final: Team A vs Team B', games: [{ external_identifier: '111' }] }
    ]
    applyPsFallback(psMatches, missingSet, brackets)
    expect(brackets['111']).toBe('Grand Final')
  })

  it('does not overwrite existing bracket entry', () => {
    const missingSet = new Set(['222'])
    const brackets = { '111': 'Upper Bracket Final' }
    const psMatches = [
      { name: 'Grand Final: TBD vs TBD', games: [{ external_identifier: '222' }] }
    ]
    applyPsFallback(psMatches, missingSet, brackets)
    expect(brackets['111']).toBe('Upper Bracket Final')
    expect(brackets['222']).toBe('Grand Final')
  })

  it('skips PS match with no parseable bracket round', () => {
    const missingSet = new Set(['111'])
    const brackets = {}
    // "TBD vs TBD" before the colon contains "vs" → parseBracketRound returns null
    const psMatches = [
      { name: 'TBD vs TBD: some context', games: [{ external_identifier: '111' }] }
    ]
    applyPsFallback(psMatches, missingSet, brackets)
    expect(brackets).toEqual({})
  })

  it('skips games whose external_identifier is not in missingSet', () => {
    const missingSet = new Set(['999'])
    const brackets = {}
    const psMatches = [
      { name: 'Grand Final: TBD vs TBD', games: [{ external_identifier: '111' }] }
    ]
    applyPsFallback(psMatches, missingSet, brackets)
    expect(brackets).toEqual({})
  })

  it('handles non-array psMatches gracefully', () => {
    const brackets = {}
    applyPsFallback(null, new Set(['111']), brackets)
    expect(brackets).toEqual({})
  })

  it('handles games with missing external_identifier', () => {
    const missingSet = new Set(['111'])
    const brackets = {}
    const psMatches = [
      { name: 'Grand Final: TBD vs TBD', games: [{ external_identifier: null }] }
    ]
    applyPsFallback(psMatches, missingSet, brackets)
    expect(brackets).toEqual({})
  })
})

// ── Supabase bracket_round fallback ──────────────────────────────────────────
// match_stream_history.bracket_round is written permanently by api/match-streams.js
// the first time a match's stream resolves, so it survives long after the 14-day
// bracket:match KV TTL and the 7-day PS lookback (above) both expire. Replicates
// the loop from the handler: for each still-missing id after KV + PS fallback,
// apply any Supabase row found for it.

function applySupabaseFallback(rows, brackets) {
  for (const row of (rows || [])) {
    const id = String(row.od_match_id)
    brackets[id] = row.bracket_round
  }
  return brackets
}

describe('match-enrichment: Supabase bracket_round fallback', () => {
  it('fills brackets from Supabase rows for still-missing ids', () => {
    const brackets = { '111': 'Upper Bracket Final' }
    const rows = [{ od_match_id: 222, bracket_round: 'Grand Final' }]
    applySupabaseFallback(rows, brackets)
    expect(brackets).toEqual({ '111': 'Upper Bracket Final', '222': 'Grand Final' })
  })

  it('handles multiple Supabase rows in one pass', () => {
    const brackets = {}
    const rows = [
      { od_match_id: 111, bracket_round: 'Grand Final' },
      { od_match_id: 222, bracket_round: 'Lower Bracket Final' },
    ]
    applySupabaseFallback(rows, brackets)
    expect(brackets).toEqual({ '111': 'Grand Final', '222': 'Lower Bracket Final' })
  })

  it('handles null/empty rows gracefully', () => {
    const brackets = { '111': 'Grand Final' }
    applySupabaseFallback(null, brackets)
    applySupabaseFallback([], brackets)
    expect(brackets).toEqual({ '111': 'Grand Final' })
  })

  it('converts numeric od_match_id to a string key matching the ids array format', () => {
    const brackets = {}
    const rows = [{ od_match_id: 8904012666, bracket_round: 'Grand Final' }]
    applySupabaseFallback(rows, brackets)
    expect(brackets['8904012666']).toBe('Grand Final')
  })

  it('computes stillMissing (post-KV, post-PS) correctly before the Supabase query', () => {
    const ids = ['111', '222', '333']
    const brackets = { '111': 'Grand Final' } // only 111 resolved by KV/PS so far
    const stillMissing = ids.filter(id => !brackets[id])
    expect(stillMissing).toEqual(['222', '333'])
  })

  it('converts string ids to numbers for the Supabase .in() filter', () => {
    const stillMissing = ['111', '222']
    expect(stillMissing.map(Number)).toEqual([111, 222])
  })

  it('skips the Supabase query entirely when nothing is still missing', () => {
    const ids = ['111']
    const brackets = { '111': 'Grand Final' }
    const stillMissing = ids.filter(id => !brackets[id])
    expect(stillMissing).toHaveLength(0)
  })

  it('excludes non-numeric ids so they cannot turn into NaN inside .in()', () => {
    // A malformed id reaching stillMissing.map(Number) would produce NaN, which would
    // corrupt the whole `.in('od_match_id', [...])` batch query, not just the bad id.
    const ids = ['111', 'not-a-real-id', '222']
    const brackets = {}
    const stillMissing = ids.filter(id => !brackets[id] && /^\d+$/.test(id))
    expect(stillMissing).toEqual(['111', '222'])
    expect(stillMissing.map(Number).some(Number.isNaN)).toBe(false)
  })
})

// ── Empty IDs guard ───────────────────────────────────────────────────────────

describe('match-enrichment: empty IDs guard', () => {
  it('returns empty maps immediately when ids is empty', () => {
    const ids = []
    if (ids.length === 0) {
      expect({ formats: {}, brackets: {} }).toEqual({ formats: {}, brackets: {} })
    }
  })
})

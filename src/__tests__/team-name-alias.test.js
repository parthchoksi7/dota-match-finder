/**
 * Tests for TEAM_NAME_ALIAS_GROUPS / namesAlias in src/teamMatching.js — PS↔OD team-name pairs
 * that diverge with no substring relationship at all (see the file's own comment for why this
 * needs explicit alias membership instead of normalizeTeamName alone).
 */

import { describe, it, expect } from 'vitest'
import { namesAlias, normalizeTeamName } from '../teamMatching'

describe('TEAM_NAME_ALIAS_GROUPS', () => {
  it('aliases BoomBoys (OD) with BetBoom Team (PS)', () => {
    expect(namesAlias(normalizeTeamName('BetBoom Team'), normalizeTeamName('BoomBoys'))).toBe(true)
    expect(namesAlias(normalizeTeamName('BetBoom Team'), normalizeTeamName('BB'))).toBe(true)
  })

  it('aliases the 1win/1w Team/Tundra Esports pre-rebrand lineage', () => {
    expect(namesAlias(normalizeTeamName('1w Team'), normalizeTeamName('Tundra Esports'))).toBe(true)
    expect(namesAlias(normalizeTeamName('1win'), normalizeTeamName('1W'))).toBe(true)
  })

  // TI 2026 rebrand scrub (`.claude/specs/ti-2026-day-one-spec.md` T0.2): PandaScore's "Iron Wing"
  // (id 138994) is backed by OpenDota Steam group 10150413, whose per-match name still reads
  // "Tundra Esports" as of its last indexed match — a second, unrelated OD label from a different
  // org than the 1win/8291895 lineage above and the real still-active "Tundra Esports" (PS id
  // 128439) below.
  it('aliases Iron Wing (PS) with the stale OD label "Tundra Esports"', () => {
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('Tundra Esports'))).toBe(true)
  })

  it('does not transitively alias Iron Wing with the 1win lineage', () => {
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('1win'))).toBe(false)
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('1w Team'))).toBe(false)
  })

  it('does not alias unrelated team names', () => {
    expect(namesAlias(normalizeTeamName('Team Liquid'), normalizeTeamName('OG'))).toBe(false)
  })
})

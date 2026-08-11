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

  // 2026-08-10 owner confirmation: "1w Team" rebranded again to "Iron Wing", and PandaScore's
  // separately-tracked "Iron Wing" (id 138994, OD Steam group 10150413, stale OD label "Tundra
  // Esports") plus the previously-assumed-separate "real, currently active Tundra Esports" (PS
  // id 128439) are the SAME lineage as the 1win/8291895 chain, not distinct orgs. A prior
  // session (2026-08-02) had concluded otherwise from OD's rename lag alone — corrected here.
  it('aliases Iron Wing with the full 1win/1w Team/Tundra Esports lineage', () => {
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('Tundra Esports'))).toBe(true)
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('1win'))).toBe(true)
    expect(namesAlias(normalizeTeamName('Iron Wing'), normalizeTeamName('1w Team'))).toBe(true)
  })

  it('does not alias unrelated team names', () => {
    expect(namesAlias(normalizeTeamName('Team Liquid'), normalizeTeamName('OG'))).toBe(false)
  })
})

/**
 * Tests for the Heroes tab show-more logic and stage switcher visibility rules.
 *
 * These tests verify the pure logic that controls:
 * - How many heroes are visible based on showAllHeroes state
 * - When the stage switcher should be shown based on activeTab
 */

import { describe, it, expect } from 'vitest'

// --- mirrors the slice logic in TournamentHub render ---

function visibleHeroes(heroes, showAll) {
  return showAll ? heroes : heroes.slice(0, 25)
}

// --- mirrors the stage switcher visibility condition ---

function showStageSwitcher(eventStages, activeTab) {
  return (
    Array.isArray(eventStages) &&
    eventStages.length > 1 &&
    activeTab !== 'Overview' &&
    activeTab !== 'Heroes'
  )
}

// ============================================================
// visibleHeroes tests
// ============================================================

describe('visibleHeroes', () => {
  const make = n => Array.from({ length: n }, (_, i) => ({ name: `Hero ${i + 1}`, picks: 1, bans: 0, wins: 0, contested: 1 }))

  it('shows all heroes when list has fewer than 25', () => {
    const heroes = make(10)
    expect(visibleHeroes(heroes, false)).toHaveLength(10)
  })

  it('shows exactly 25 when collapsed and list has exactly 25', () => {
    const heroes = make(25)
    expect(visibleHeroes(heroes, false)).toHaveLength(25)
  })

  it('shows only 25 when collapsed and list has more than 25', () => {
    const heroes = make(40)
    expect(visibleHeroes(heroes, false)).toHaveLength(25)
  })

  it('shows all heroes when expanded regardless of count', () => {
    const heroes = make(60)
    expect(visibleHeroes(heroes, true)).toHaveLength(60)
  })

  it('the first 25 shown when collapsed are the same as the first 25 of the full list', () => {
    const heroes = make(40)
    const collapsed = visibleHeroes(heroes, false)
    expect(collapsed).toEqual(heroes.slice(0, 25))
  })

  it('returns empty array when heroes list is empty', () => {
    expect(visibleHeroes([], false)).toHaveLength(0)
    expect(visibleHeroes([], true)).toHaveLength(0)
  })
})

// ============================================================
// showStageSwitcher tests
// ============================================================

describe('showStageSwitcher', () => {
  const stages = [{ id: 1, name: 'Group Stage' }, { id: 2, name: 'Playoffs' }]

  it('shows switcher on Standings tab when multiple stages exist', () => {
    expect(showStageSwitcher(stages, 'Standings')).toBe(true)
  })

  it('shows switcher on Schedule tab when multiple stages exist', () => {
    expect(showStageSwitcher(stages, 'Schedule')).toBe(true)
  })

  it('hides switcher on Overview tab even when multiple stages exist', () => {
    expect(showStageSwitcher(stages, 'Overview')).toBe(false)
  })

  it('hides switcher on Heroes tab even when multiple stages exist', () => {
    expect(showStageSwitcher(stages, 'Heroes')).toBe(false)
  })

  it('hides switcher when only one stage exists', () => {
    expect(showStageSwitcher([{ id: 1, name: 'Main Event' }], 'Standings')).toBe(false)
  })

  it('hides switcher when eventStages is null', () => {
    expect(showStageSwitcher(null, 'Standings')).toBe(false)
  })

  it('hides switcher when eventStages is empty', () => {
    expect(showStageSwitcher([], 'Standings')).toBe(false)
  })
})

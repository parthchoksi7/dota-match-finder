/**
 * Tests for the tournament-heroes API logic.
 *
 * Covers:
 * - findLeague: token overlap matching against the OpenDota leagues list
 * - hero stats aggregation: picks, bans, wins derived from picks_bans arrays
 */

import { describe, it, expect } from 'vitest'

// --- findLeague: mirrors the function in api/tournament-heroes.js verbatim ---

const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
const tokens = s => s.toLowerCase().split(/[\s\-_]+/).filter(t => t.length > 1 && !STOP.has(t))

function findLeague(leagues, search) {
  if (!search || !leagues?.length) return null
  const searchTokens = new Set(tokens(search))

  let best = null, bestScore = 0
  for (const league of leagues) {
    const lt = tokens(league.name || '')
    const overlap = lt.filter(t => searchTokens.has(t)).length
    if (overlap >= 2 && overlap > bestScore) {
      best = league
      bestScore = overlap
    }
  }
  return best
}

// --- aggregateHeroStats: mirrors the loop in api/tournament-heroes.js ---

function aggregateHeroStats(matches, heroMap) {
  const heroStats = {}
  let gameCount = 0

  for (const match of matches) {
    if (!match.picks_bans?.length) continue
    gameCount++
    const radiantWin = match.radiant_win

    for (const pb of match.picks_bans) {
      const heroName = heroMap[pb.hero_id]
      if (!heroName) continue
      if (!heroStats[heroName]) heroStats[heroName] = { picks: 0, wins: 0, bans: 0 }

      if (pb.is_pick) {
        heroStats[heroName].picks++
        const won = (pb.team === 0 && radiantWin) || (pb.team === 1 && !radiantWin)
        if (won) heroStats[heroName].wins++
      } else {
        heroStats[heroName].bans++
      }
    }
  }

  return { heroStats, gameCount }
}

// ============================================================
// findLeague tests
// ============================================================

describe('findLeague', () => {
  it('returns null when leagues array is empty', () => {
    expect(findLeague([], 'PGL Wallachia Season 7')).toBeNull()
  })

  it('returns null when leagues is null', () => {
    expect(findLeague(null, 'PGL Wallachia Season 7')).toBeNull()
  })

  it('returns null when search string is empty', () => {
    const leagues = [{ leagueid: 1, name: 'PGL Wallachia 2026 Season 7' }]
    expect(findLeague(leagues, '')).toBeNull()
  })

  it('returns null when no league has 2+ matching tokens', () => {
    const leagues = [
      { leagueid: 1, name: 'DreamLeague Season 25' },
      { leagueid: 2, name: 'ESL One Birmingham 2026' },
    ]
    // "PGL" appears in neither league name
    expect(findLeague(leagues, 'PGL Wallachia Season 7')).toBeNull()
  })

  it('matches PGL Wallachia search to the right OpenDota league', () => {
    const leagues = [
      { leagueid: 100, name: 'DreamLeague Season 25' },
      { leagueid: 200, name: 'ESL One Birmingham 2026' },
      { leagueid: 300, name: 'PGL Wallachia 2026 Season 7' },
    ]
    const result = findLeague(leagues, 'PGL Wallachia Season 7')
    expect(result?.leagueid).toBe(300)
  })

  it('picks the league with the highest token overlap when multiple leagues share some tokens', () => {
    const leagues = [
      { leagueid: 1, name: 'PGL Open 2026' },       // "pgl" only (1 token overlap with "PGL Wallachia")
      { leagueid: 2, name: 'PGL Wallachia 2026 Season 7' }, // "pgl" + "wallachia" = 2 overlaps
    ]
    const result = findLeague(leagues, 'PGL Wallachia Season 7')
    expect(result?.leagueid).toBe(2)
  })

  it('ignores stop words when counting overlap tokens', () => {
    // "the", "season", "of", "a" are all stop words and are not counted
    const leagues = [
      { leagueid: 1, name: 'The International 2025' },
    ]
    // Tokens from league: ['international', '2025']
    // Tokens from search: ['international'] (only 1 meaningful token after stop-word removal)
    // Only 1 matching token -> below threshold of 2, should return null
    expect(findLeague(leagues, 'The International Season')).toBeNull()
  })

  it('matches DreamLeague by name', () => {
    const leagues = [
      { leagueid: 1, name: 'DreamLeague Season 25 2026' },
      { leagueid: 2, name: 'ESL One Birmingham 2026' },
    ]
    const result = findLeague(leagues, 'DreamLeague Season 25')
    expect(result?.leagueid).toBe(1)
  })

  it('handles league names with hyphens and underscores in tokenization', () => {
    const leagues = [
      { leagueid: 1, name: 'WePlay-Dota2-Pushka-League' },
    ]
    // Tokens: ['weplay', 'dota2', 'pushka', 'league']
    const result = findLeague(leagues, 'WePlay Pushka League')
    expect(result?.leagueid).toBe(1)
  })
})

// ============================================================
// aggregateHeroStats tests
// ============================================================

describe('aggregateHeroStats', () => {
  const heroMap = { 1: 'Anti-Mage', 2: 'Axe', 3: 'Bane' }

  it('returns 0 gameCount when no matches have picks_bans', () => {
    const matches = [{ radiant_win: true, picks_bans: [] }, { radiant_win: false }]
    const { gameCount } = aggregateHeroStats(matches, heroMap)
    expect(gameCount).toBe(0)
  })

  it('counts a game only when picks_bans is non-empty', () => {
    const matches = [
      { radiant_win: true, picks_bans: [{ hero_id: 1, is_pick: true, team: 0 }] },
      { radiant_win: false, picks_bans: [] },
    ]
    const { gameCount } = aggregateHeroStats(matches, heroMap)
    expect(gameCount).toBe(1)
  })

  it('counts picks and bans separately', () => {
    const matches = [
      {
        radiant_win: true,
        picks_bans: [
          { hero_id: 1, is_pick: true, team: 0 },
          { hero_id: 1, is_pick: false, team: 1 }, // ban
        ],
      },
    ]
    const { heroStats } = aggregateHeroStats(matches, heroMap)
    expect(heroStats['Anti-Mage'].picks).toBe(1)
    expect(heroStats['Anti-Mage'].bans).toBe(1)
  })

  it('attributes a win to team 0 (radiant) when radiant wins', () => {
    const matches = [
      {
        radiant_win: true,
        picks_bans: [{ hero_id: 2, is_pick: true, team: 0 }],
      },
    ]
    const { heroStats } = aggregateHeroStats(matches, heroMap)
    expect(heroStats['Axe'].wins).toBe(1)
  })

  it('attributes a win to team 1 (dire) when radiant loses', () => {
    const matches = [
      {
        radiant_win: false,
        picks_bans: [{ hero_id: 2, is_pick: true, team: 1 }],
      },
    ]
    const { heroStats } = aggregateHeroStats(matches, heroMap)
    expect(heroStats['Axe'].wins).toBe(1)
  })

  it('does not award a win to the losing team', () => {
    const matches = [
      {
        radiant_win: true,
        picks_bans: [{ hero_id: 3, is_pick: true, team: 1 }], // Dire hero, radiant wins
      },
    ]
    const { heroStats } = aggregateHeroStats(matches, heroMap)
    expect(heroStats['Bane'].wins).toBe(0)
  })

  it('skips picks_bans entries where hero_id is not in heroMap', () => {
    const matches = [
      {
        radiant_win: true,
        picks_bans: [{ hero_id: 999, is_pick: true, team: 0 }],
      },
    ]
    const { heroStats } = aggregateHeroStats(matches, heroMap)
    expect(Object.keys(heroStats)).toHaveLength(0)
  })

  it('aggregates stats across multiple games', () => {
    const matches = [
      {
        radiant_win: true,
        picks_bans: [
          { hero_id: 1, is_pick: true, team: 0 },
          { hero_id: 2, is_pick: false, team: 1 },
        ],
      },
      {
        radiant_win: false,
        picks_bans: [
          { hero_id: 1, is_pick: true, team: 1 }, // wins (dire wins)
          { hero_id: 2, is_pick: true, team: 0 },  // loses (radiant loses)
        ],
      },
    ]
    const { heroStats, gameCount } = aggregateHeroStats(matches, heroMap)
    expect(gameCount).toBe(2)
    expect(heroStats['Anti-Mage'].picks).toBe(2)
    expect(heroStats['Anti-Mage'].wins).toBe(2) // both games won
    expect(heroStats['Axe'].bans).toBe(1)
    expect(heroStats['Axe'].picks).toBe(1)
    expect(heroStats['Axe'].wins).toBe(0) // radiant picked Axe but radiant lost
  })
})

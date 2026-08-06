import { describe, it, expect } from 'vitest'
import {
  decodeTowerState,
  decodeBarracksState,
  decodeUltimateState,
  sumNetWorth,
  indexLiveIgns,
  shapeSidePlayers,
  shapeValvePulse,
} from '../api/_liveValveState.js'

describe('decodeTowerState', () => {
  it('reports every building standing for the all-bits-set mask (2047 = 11 bits)', () => {
    const out = decodeTowerState(2047)
    expect(out.lanes.top).toEqual([true, true, true])
    expect(out.lanes.mid).toEqual([true, true, true])
    expect(out.lanes.bot).toEqual([true, true, true])
    expect(out.tier4).toEqual([true, true])
  })

  it('reports everything destroyed for mask 0', () => {
    const out = decodeTowerState(0)
    expect(out.lanes.top).toEqual([false, false, false])
    expect(out.tier4).toEqual([false, false])
  })

  it('uses the lane-major layout (bit = laneIndex*3 + tierIndex)', () => {
    // Clear only bit 8 => bot lane (index 2), tier 3. This is the exact transition from the
    // worked example in _liveStoryDiff.js's layout proof.
    const out = decodeTowerState(2047 & ~(1 << 8))
    expect(out.lanes.bot).toEqual([true, true, false])
    expect(out.lanes.top).toEqual([true, true, true])
    expect(out.lanes.mid).toEqual([true, true, true])
  })

  it('maps bit 0 to top tier 1, not to some other lane', () => {
    const out = decodeTowerState(2047 & ~1)
    expect(out.lanes.top).toEqual([false, true, true])
  })

  it('carries laneVerified=false through, since lane NAMING is not yet at the graduation bar', () => {
    expect(decodeTowerState(2047).laneVerified).toBe(false)
    expect(decodeBarracksState(63).laneVerified).toBe(false)
  })

  it('never reports laneVerified=true without positive evidence, in either decoder', () => {
    // Fail-safe direction check. The flag starts false and is only raised by the shared decoder
    // saying so; the inverse (start true, AND down) would report "verified" for an empty loop,
    // and the UI drops its provisional-lane caption when this reads true.
    for (const mask of [0, 1, 63, 1023, 2047]) {
      expect(decodeTowerState(mask).laneVerified).toBe(false)
    }
    for (const mask of [0, 1, 31, 63]) {
      expect(decodeBarracksState(mask).laneVerified).toBe(false)
    }
  })

  it('returns null for non-finite or negative input rather than fabricating a state', () => {
    expect(decodeTowerState(undefined)).toBeNull()
    expect(decodeTowerState(null)).toBeNull()
    expect(decodeTowerState(NaN)).toBeNull()
    expect(decodeTowerState(-1)).toBeNull()
  })
})

describe('decodeBarracksState', () => {
  it('reports all six standing for mask 63', () => {
    const out = decodeBarracksState(63)
    expect(out.lanes.top).toEqual({ melee: true, ranged: true })
    expect(out.lanes.mid).toEqual({ melee: true, ranged: true })
    expect(out.lanes.bot).toEqual({ melee: true, ranged: true })
  })

  it('uses the lane-major layout (bit = laneIndex*2 + kind)', () => {
    // Clearing bits 4 and 5 drops both BOT barracks — the second half of the worked example
    // where bot tier-3 falls and both bot rax follow.
    const out = decodeBarracksState(63 & ~(1 << 4) & ~(1 << 5))
    expect(out.lanes.bot).toEqual({ melee: false, ranged: false })
    expect(out.lanes.top).toEqual({ melee: true, ranged: true })
    expect(out.lanes.mid).toEqual({ melee: true, ranged: true })
  })

  it('distinguishes melee (even bit) from ranged (odd bit) within a lane', () => {
    const out = decodeBarracksState(63 & ~(1 << 2)) // mid melee only
    expect(out.lanes.mid).toEqual({ melee: false, ranged: true })
  })

  it('returns null for invalid input', () => {
    expect(decodeBarracksState(undefined)).toBeNull()
    expect(decodeBarracksState(-5)).toBeNull()
  })
})

describe('decodeUltimateState', () => {
  it('treats state 0 as not yet unlocked', () => {
    expect(decodeUltimateState(0, 0)).toEqual({ unlocked: false, ready: false, cooldown: null })
  })

  it('treats bit0-only as unlocked but on cooldown', () => {
    expect(decodeUltimateState(1, 0)).toEqual({ unlocked: true, ready: false, cooldown: 0 })
  })

  it('treats bits 0+1 with no cooldown as ready', () => {
    expect(decodeUltimateState(3, 0)).toEqual({ unlocked: true, ready: true, cooldown: 0 })
  })

  it('lets a real positive cooldown override the ready bit', () => {
    // The bit is a 99.5% inference; the cooldown is a direct reading. On disagreement the
    // direct reading must win, never the fallible one.
    expect(decodeUltimateState(3, 42)).toEqual({ unlocked: true, ready: false, cooldown: 42 })
  })

  it('never reports ready=true while the ultimate is locked, whatever the cooldown says', () => {
    expect(decodeUltimateState(0, 0).ready).toBe(false)
    expect(decodeUltimateState(2, 0).ready).toBe(false) // bit1 set without bit0 — nonsensical, still locked
  })

  it('rounds fractional cooldowns', () => {
    expect(decodeUltimateState(1, 12.7).cooldown).toBe(13)
  })

  it('degrades safely on a missing state field', () => {
    expect(decodeUltimateState(undefined, 5)).toEqual({ unlocked: false, ready: false, cooldown: null })
  })
})

describe('sumNetWorth', () => {
  it('sums finite values', () => {
    expect(sumNetWorth([{ net_worth: 100 }, { net_worth: 250 }])).toBe(350)
  })

  it('returns null (not 0) when no player carries a usable value, so callers can tell "no data" from a real zero', () => {
    expect(sumNetWorth([])).toBeNull()
    expect(sumNetWorth(null)).toBeNull()
    expect(sumNetWorth([{ net_worth: null }, {}])).toBeNull()
  })

  it('skips unusable entries but still sums the rest', () => {
    expect(sumNetWorth([{ net_worth: 100 }, { net_worth: null }, null])).toBe(100)
  })
})

describe('indexLiveIgns', () => {
  it('indexes IGNs by account id from the top-level players block', () => {
    const map = indexLiveIgns({ players: [
      { account_id: 1, name: 'Nightfall', team: 0 },
      { account_id: 2, name: 'Pivot', team: 1 },
    ] })
    expect(map.get('1')).toBe('Nightfall')
    expect(map.get('2')).toBe('Pivot')
  })

  it('drops broadcasters (team 2) — Valve uses 0/1/2 here, not the codebase-wide 2/3', () => {
    const map = indexLiveIgns({ players: [
      { account_id: 1, name: 'Nightfall', team: 0 },
      { account_id: 99, name: 'ODPixel', team: 2 },
    ] })
    expect(map.has('99')).toBe(false)
    expect(map.size).toBe(1)
  })

  it('degrades to an empty map rather than throwing', () => {
    expect(indexLiveIgns(null).size).toBe(0)
    expect(indexLiveIgns({}).size).toBe(0)
  })
})

describe('shapeSidePlayers', () => {
  const igns = new Map([['7', 'Nightfall']])

  it('renames Valve\'s singular `death` to the codebase-wide `deaths`', () => {
    const [p] = shapeSidePlayers({ players: [{ account_id: 7, death: 3 }] }, igns)
    expect(p.deaths).toBe(3)
    expect(p.death).toBeUndefined()
  })

  it('normalizes empty item slots from -1 to 0 to match the ItemSlot contract', () => {
    const [p] = shapeSidePlayers({ players: [{
      account_id: 7, item0: 1, item1: -1, item2: 63, item3: -1, item4: -1, item5: -1,
    }] }, igns)
    expect(p.items).toEqual([1, 0, 63, 0, 0, 0])
  })

  it('always emits exactly 6 item slots even when the source omits fields', () => {
    const [p] = shapeSidePlayers({ players: [{ account_id: 7 }] }, igns)
    expect(p.items).toHaveLength(6)
    expect(p.items).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('joins the IGN in by account id', () => {
    const [p] = shapeSidePlayers({ players: [{ account_id: 7 }] }, igns)
    expect(p.name).toBe('Nightfall')
  })

  it('leaves name null when the account has no known IGN, never an empty string', () => {
    const [p] = shapeSidePlayers({ players: [{ account_id: 999 }] }, igns)
    expect(p.name).toBeNull()
  })

  it('derives isDead from a positive respawn timer', () => {
    const [alive] = shapeSidePlayers({ players: [{ account_id: 7, respawn_timer: 0 }] }, igns)
    const [dead] = shapeSidePlayers({ players: [{ account_id: 7, respawn_timer: 12 }] }, igns)
    expect(alive.isDead).toBe(false)
    expect(dead.isDead).toBe(true)
    expect(dead.respawnTimer).toBe(12)
  })

  it('passes hero_id 0 (still drafting) through untouched so the frontend can show a placeholder', () => {
    const [p] = shapeSidePlayers({ players: [{ account_id: 7, hero_id: 0 }] }, igns)
    expect(p.heroId).toBe(0)
  })

  it('returns an empty array for a missing side rather than throwing', () => {
    expect(shapeSidePlayers(null, igns)).toEqual([])
    expect(shapeSidePlayers({}, igns)).toEqual([])
  })
})

describe('shapeValvePulse', () => {
  const game = {
    match_id: 8734219560,
    stream_delay_s: 120,
    spectators: 3,
    players: [
      { account_id: 7, name: 'Nightfall', hero_id: 41, team: 0 },
      { account_id: 8, name: 'Pivot', hero_id: 86, team: 1 },
    ],
    scoreboard: {
      duration: 1263.36669921875,
      roshan_respawn_timer: 166,
      radiant: {
        score: 20,
        tower_state: 2047,
        barracks_state: 63,
        picks: [{ hero_id: 41 }, { hero_id: 13 }],
        bans: [{ hero_id: 33 }],
        players: [{ account_id: 7, hero_id: 41, net_worth: 21400, kills: 9, death: 2, assists: 6 }],
      },
      dire: {
        score: 15,
        tower_state: 2047,
        barracks_state: 63,
        picks: [{ hero_id: 86 }],
        bans: [{ hero_id: 94 }],
        players: [{ account_id: 8, hero_id: 86, net_worth: 16400, kills: 5, death: 4, assists: 7 }],
      },
    },
  }

  it('floors the float duration — an unfloored value breaks natural-key dedupe downstream', () => {
    expect(shapeValvePulse(game).gameTime).toBe(1263)
  })

  it('uses the caller-supplied PandaScore names, never Valve\'s own team block', () => {
    const out = shapeValvePulse(game, { radiantName: 'Tundra Esports', direName: 'BetBoom Team' })
    expect(out.radiantName).toBe('Tundra Esports')
    expect(out.direName).toBe('BetBoom Team')
  })

  it('computes the net-worth lead as radiant-minus-dire, matching GoldGraph\'s sign convention', () => {
    const out = shapeValvePulse(game)
    expect(out.radiantNetWorth).toBe(21400)
    expect(out.direNetWorth).toBe(16400)
    expect(out.radiantLead).toBe(5000)
  })

  it('leaves radiantLead null when either side has no net-worth data, rather than showing a fake even game', () => {
    const noDire = { ...game, scoreboard: { ...game.scoreboard, dire: { ...game.scoreboard.dire, players: [] } } }
    expect(shapeValvePulse(noDire).radiantLead).toBeNull()
  })

  it('emits picks and bans as BARE hero ids — the shape trimSide produces and the UI indexes by', () => {
    // Regression guard: an earlier version of this test fed raw `{hero_id}` objects and asserted
    // them back, so it would have passed even though production (post-trimSide) hands bare ids.
    // Indexing a hero map by an object yields undefined, rendering "Hero [object Object]".
    const out = shapeValvePulse(game)
    expect(out.draft.radiantPicks).toEqual([41, 13])
    expect(out.draft.radiantBans).toEqual([33])
    expect(out.draft.direPicks).toEqual([86])
    expect(out.draft.direBans).toEqual([94])
  })

  it('accepts the already-flattened bare-id shape that production actually delivers', () => {
    const trimmed = {
      ...game,
      scoreboard: {
        ...game.scoreboard,
        radiant: { ...game.scoreboard.radiant, picks: [41, 13], bans: [33] },
        dire: { ...game.scoreboard.dire, picks: [86], bans: [94] },
      },
    }
    const out = shapeValvePulse(trimmed)
    expect(out.draft.radiantPicks).toEqual([41, 13])
    expect(out.draft.radiantBans).toEqual([33])
  })

  it('surfaces the Roshan respawn timer without inventing a killing team', () => {
    const out = shapeValvePulse(game)
    expect(out.roshanRespawnTimer).toBe(166)
    expect(out).not.toHaveProperty('roshanKilledBy')
  })

  it('marks its own provenance so a consumer can never confuse it with the OpenDota pulse', () => {
    expect(shapeValvePulse(game).source).toBe('valve')
  })

  it('degrades to null scoreboard-derived fields when scoreboard is absent (~7% of games)', () => {
    const out = shapeValvePulse({ match_id: 1, players: [] })
    expect(out.gameTime).toBeNull()
    expect(out.radiantScore).toBeNull()
    expect(out.towers.radiant).toBeNull()
    expect(out.barracks.radiant).toBeNull()
    expect(out.players.radiant).toEqual([])
  })

  it('returns null for a missing game', () => {
    expect(shapeValvePulse(null)).toBeNull()
  })
})

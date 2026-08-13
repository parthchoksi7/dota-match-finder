import { describe, it, expect } from 'vitest'
import {
  decodeTowerState,
  decodeBarracksState,
  decodeUltimateState,
  sumNetWorth,
  indexLiveIgns,
  shapeSidePlayers,
  shapeValvePulse,
  towerStateToCounts,
  shapeLiveEvents,
  shapeValveGoldHistory,
  normalizeHeroIdList,
  collectItemIds,
  collectEventItemIds,
  netWorthSwingOverWindow,
  groupTimelineEvents,
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

  it('rounds fractional cooldowns up, never down to zero', () => {
    expect(decodeUltimateState(1, 12.7).cooldown).toBe(13)
  })

  it('does not report ready on a genuine sub-1s remaining cooldown (Math.round would floor 0.4 to 0)', () => {
    // Regression: Math.round(0.4) === 0, which used to fall through to the ready bit and could
    // report ready=true for an ultimate that's still 0.4s from coming off cooldown.
    expect(decodeUltimateState(3, 0.4)).toEqual({ unlocked: true, ready: false, cooldown: 1 })
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

describe('towerStateToCounts', () => {
  it('reduces exact per-tower booleans to [top,mid,bot] standing counts', () => {
    const state = decodeTowerState(2047 & ~(1 << 8) & ~1) // clear bot-T3 and top-T1
    expect(towerStateToCounts(state)).toEqual([2, 3, 2])
  })

  it('returns null when given a non-decoded value', () => {
    expect(towerStateToCounts(null)).toBeNull()
    expect(towerStateToCounts(undefined)).toBeNull()
  })
})

describe('normalizeHeroIdList', () => {
  it('passes bare hero ids through unchanged (the shape trimSide actually produces)', () => {
    expect(normalizeHeroIdList([41, 13, 96])).toEqual([41, 13, 96])
  })

  it('flattens raw {hero_id} objects too, for callers reaching this with an untrimmed snapshot', () => {
    expect(normalizeHeroIdList([{ hero_id: 41 }, { hero_id: 13 }])).toEqual([41, 13])
  })

  it('drops non-finite entries rather than passing them through', () => {
    expect(normalizeHeroIdList([41, null, undefined, {}, 13])).toEqual([41, 13])
  })

  it('degrades to an empty array for non-array input', () => {
    expect(normalizeHeroIdList(null)).toEqual([])
    expect(normalizeHeroIdList(undefined)).toEqual([])
  })
})

describe('shapeLiveEvents', () => {
  const base = { odMatchId: '1', gameTime: 90 }

  it('keeps HeroKilled, RoshanKilled, and ItemPurchased events', () => {
    const events = [
      { ...base, eventType: 'HeroKilled', team: 3, confidence: 'exact', heroId: 1, payload: { victimName: 'V' } },
      { ...base, eventType: 'RoshanKilled', team: null, confidence: 'exact', payload: {} },
      { ...base, eventType: 'ItemPurchased', team: 2, confidence: 'exact', heroId: 5, payload: { itemId: 42, playerName: 'P' } },
    ]
    expect(shapeLiveEvents(events)).toHaveLength(3)
  })

  it('drops TowerDestroyed and BarracksDestroyed unconditionally, even if somehow marked non-uncertain', () => {
    const events = [
      { ...base, eventType: 'TowerDestroyed', team: 2, confidence: 'exact', payload: { bit: 0 } },
      { ...base, eventType: 'BarracksDestroyed', team: 2, confidence: 'exact', payload: { bit: 0 } },
    ]
    expect(shapeLiveEvents(events)).toHaveLength(0)
  })

  it('drops any event carrying confidence "uncertain", regardless of type — a second, redundant safety check', () => {
    const events = [{ ...base, eventType: 'HeroKilled', team: 3, confidence: 'uncertain', heroId: 1, payload: {} }]
    expect(shapeLiveEvents(events)).toHaveLength(0)
  })

  it('colors a kill by the KILLER\'s side, not the victim\'s (matches GoldGraph marker convention)', () => {
    const events = [{
      ...base, eventType: 'HeroKilled', team: 3 /* victim was dire */, confidence: 'inferred', heroId: 1,
      payload: { victimName: 'V', killerTeam: 2, killerName: 'K' },
    }]
    expect(shapeLiveEvents(events)[0].side).toBe('radiant')
  })

  it('infers the beneficiary side for an ambiguous/unattributed kill instead of leaving it null', () => {
    // Changed deliberately 2026-08-07: this previously asserted `null`, which is what produced the
    // grey markers the owner flagged. A death always tells us which side BENEFITED even when the
    // killer isn't resolvable, so there is no longer any "unknown side" case for a kill.
    const events = [{
      ...base, eventType: 'HeroKilled', team: 3, confidence: 'exact', heroId: 1,
      payload: { victimName: 'V', ambiguous: true },
    }]
    expect(shapeLiveEvents(events)[0].side).toBe('radiant')
  })

  it('Roshan events always carry side null — team attribution is never guessed', () => {
    const events = [{ ...base, eventType: 'RoshanKilled', team: null, confidence: 'exact', payload: {} }]
    expect(shapeLiveEvents(events)[0].side).toBeNull()
  })

  it('preserves newest-last order and caps to the most recent `limit` events', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      ...base, gameTime: i, eventType: 'RoshanKilled', team: null, confidence: 'exact', payload: {},
    }))
    const out = shapeLiveEvents(events, 3)
    expect(out.map(e => e.time)).toEqual([7, 8, 9])
  })

  it('degrades to an empty array for non-array input', () => {
    expect(shapeLiveEvents(null)).toEqual([])
    expect(shapeLiveEvents(undefined)).toEqual([])
  })
})

describe('collectEventItemIds', () => {
  it('collects itemId from ItemPurchased events only', () => {
    const events = [
      { type: 'ItemPurchased', itemId: 42 },
      { type: 'HeroKilled', victimHeroId: 1 },
      { type: 'RoshanKilled' },
      { type: 'ItemPurchased', itemId: 63 },
    ]
    expect(collectEventItemIds(events)).toEqual(expect.arrayContaining([42, 63]))
    expect(collectEventItemIds(events)).toHaveLength(2)
  })

  it('dedups repeated purchases of the same item', () => {
    const events = [{ type: 'ItemPurchased', itemId: 42 }, { type: 'ItemPurchased', itemId: 42 }]
    expect(collectEventItemIds(events)).toEqual([42])
  })

  it('is the union source for a scoped item map, alongside collectItemIds — an item bought and since sold still resolves', () => {
    // The exact scenario this was built for: itemId 63 is no longer in anyone's visible 6 slots
    // (collectItemIds alone would miss it), but a feed event still references it.
    const pulse = { players: { radiant: [{ items: [1, 0, 0, 0, 0, 0] }], dire: [] } }
    const events = [{ type: 'ItemPurchased', itemId: 63 }]
    const scoped = new Set([...collectItemIds(pulse), ...collectEventItemIds(events)])
    expect(scoped.has(1)).toBe(true)
    expect(scoped.has(63)).toBe(true)
  })

  it('ignores non-finite or non-positive item ids', () => {
    const events = [{ type: 'ItemPurchased', itemId: null }, { type: 'ItemPurchased', itemId: 0 }, { type: 'ItemPurchased' }]
    expect(collectEventItemIds(events)).toEqual([])
  })

  it('degrades to an empty array for non-array input', () => {
    expect(collectEventItemIds(null)).toEqual([])
    expect(collectEventItemIds(undefined)).toEqual([])
  })
})

describe('shapeValveGoldHistory', () => {
  it('shapes rows into {t, lead} points sorted ascending by game_time', () => {
    const rows = [
      { game_time: 60, radiant_lead: 500, radiant_score: 1, dire_score: 0, captured_at: 'a' },
      { game_time: 0, radiant_lead: 0, radiant_score: 0, dire_score: 0, captured_at: 'a' },
    ]
    expect(shapeValveGoldHistory(rows)).toEqual([
      { t: 0, lead: 0, rk: 0, dk: 0 },
      { t: 60, lead: 500, rk: 1, dk: 0 },
    ])
  })

  it('keeps the latest captured_at when two rows share a game_time (defensive dedup)', () => {
    const rows = [
      { game_time: 60, radiant_lead: 100, captured_at: '2026-01-01T00:00:00Z' },
      { game_time: 60, radiant_lead: 900, captured_at: '2026-01-01T00:01:00Z' },
    ]
    expect(shapeValveGoldHistory(rows)).toEqual([{ t: 60, lead: 900, rk: undefined, dk: undefined }])
  })

  it('drops rows with a negative game_time or a null lead', () => {
    const rows = [
      { game_time: -5, radiant_lead: 100, captured_at: 'a' },
      { game_time: 10, radiant_lead: null, captured_at: 'a' },
    ]
    expect(shapeValveGoldHistory(rows)).toEqual([])
  })

  it('caps to the most recent maxPoints after sorting, keeping the tail', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ game_time: i, radiant_lead: i * 10, captured_at: 'a' }))
    expect(shapeValveGoldHistory(rows, 2).map(p => p.t)).toEqual([3, 4])
  })

  it('degrades to an empty array for non-array input', () => {
    expect(shapeValveGoldHistory(null)).toEqual([])
    expect(shapeValveGoldHistory(undefined)).toEqual([])
  })
})

describe('shapeLiveEvents — kill side is always resolvable (no grey)', () => {
  const base = { odMatchId: '1', gameTime: 90, confidence: 'exact' }

  it('uses the real killer team when attribution succeeded', () => {
    const [e] = shapeLiveEvents([{
      ...base, eventType: 'HeroKilled', team: 3, heroId: 1,
      payload: { victimName: 'V', killerTeam: 2, killerName: 'K' },
    }])
    expect(e.side).toBe('radiant')
  })

  it('infers the killer side as the OPPOSITE of the victim when attribution was declined', () => {
    // The fix for the owner-reported grey markers: a dire hero died, so radiant benefited —
    // knowable even though the specific killer is not.
    const [e] = shapeLiveEvents([{
      ...base, eventType: 'HeroKilled', team: 3, heroId: 1,
      payload: { victimName: 'V', ambiguous: true },
    }])
    expect(e.side).toBe('radiant')
    expect(e.victimSide).toBe('dire')
    expect(e.ambiguous).toBe(true)
  })

  it('infers the other direction too', () => {
    const [e] = shapeLiveEvents([{
      ...base, eventType: 'HeroKilled', team: 2, heroId: 1,
      payload: { victimName: 'V', ambiguous: true },
    }])
    expect(e.side).toBe('dire')
    expect(e.victimSide).toBe('radiant')
  })

  it('never emits a null side for ANY kill, attributed or not — that was the grey-marker source', () => {
    const events = shapeLiveEvents([
      { ...base, eventType: 'HeroKilled', team: 2, heroId: 1, payload: { ambiguous: true } },
      { ...base, eventType: 'HeroKilled', team: 3, heroId: 2, payload: { killerTeam: 2 } },
      { ...base, eventType: 'HeroKilled', team: 3, heroId: 3, payload: {} },
    ])
    expect(events).toHaveLength(3)
    for (const e of events) expect(e.side).not.toBeNull()
  })
})

describe('netWorthSwingOverWindow', () => {
  const history = [{ t: 0, lead: 0 }, { t: 60, lead: 500 }, { t: 120, lead: 2000 }, { t: 180, lead: 1200 }]

  it('returns the lead delta across the window', () => {
    expect(netWorthSwingOverWindow(history, 60, 120)).toBe(1500)
  })

  it('returns a negative swing when the lead moved toward dire', () => {
    expect(netWorthSwingOverWindow(history, 120, 180)).toBe(-800)
  })

  it('uses the nearest sample BEFORE the start and the nearest AFTER the end', () => {
    // window 70..110 sits between samples; brackets to 60 and 120.
    expect(netWorthSwingOverWindow(history, 70, 110)).toBe(1500)
  })

  it('returns null — never 0 — when no sample exists before the window', () => {
    expect(netWorthSwingOverWindow([{ t: 100, lead: 500 }], 50, 80)).toBeNull()
  })

  it('returns null when no sample exists after the window', () => {
    expect(netWorthSwingOverWindow([{ t: 10, lead: 500 }], 50, 80)).toBeNull()
  })

  it('returns null on empty/missing history rather than fabricating a swing', () => {
    expect(netWorthSwingOverWindow([], 0, 60)).toBeNull()
    expect(netWorthSwingOverWindow(null, 0, 60)).toBeNull()
    expect(netWorthSwingOverWindow(history, NaN, 60)).toBeNull()
  })
})

describe('groupTimelineEvents', () => {
  const kill = (time, side) => ({ type: 'HeroKilled', time, side, victimName: `v${time}` })
  const HISTORY = [{ t: 0, lead: 0 }, { t: 600, lead: 1000 }, { t: 1200, lead: 4000 }]

  it('groups 3+ nearby kills into one Teamfight', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(608, 'radiant'), kill(615, 'dire')], HISTORY)
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('fight')
    expect(groups[0].label).toBe('Teamfight')
    expect(groups[0].radiantKills).toBe(2)
    expect(groups[0].direKills).toBe(1)
  })

  it('labels exactly 2 nearby kills a Trade, not a Teamfight', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(610, 'dire')], HISTORY)
    expect(groups[0].kind).toBe('fight')
    expect(groups[0].label).toBe('Trade')
  })

  it('leaves 2 same-side kills ungrouped instead of mislabeling them a Trade', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(610, 'radiant')], HISTORY)
    expect(groups).toHaveLength(2)
    expect(groups.every(g => g.kind === 'event')).toBe(true)
  })

  it('leaves a lone kill ungrouped — one death is not a fight', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant')], HISTORY)
    expect(groups[0].kind).toBe('event')
    expect(groups[0].event.type).toBe('HeroKilled')
  })

  it('separates kills that are far apart into distinct groups', () => {
    const groups = groupTimelineEvents([kill(100, 'radiant'), kill(900, 'dire')], HISTORY)
    expect(groups).toHaveLength(2)
    expect(groups.every(g => g.kind === 'event')).toBe(true)
  })

  it('attaches a fight net-worth swing from history', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(605, 'radiant'), kill(610, 'radiant')], HISTORY)
    expect(groups[0].swing).toBe(3000) // lead 1000 at t=600 -> 4000 at t=1200
  })

  it('sets swing to null when history cannot bracket the fight, rather than showing a wrong number', () => {
    const groups = groupTimelineEvents([kill(5000, 'radiant'), kill(5005, 'radiant'), kill(5010, 'radiant')], HISTORY)
    expect(groups[0].swing).toBeNull()
  })

  it('attaches items bought inside a fight window to that fight, not as separate rows', () => {
    const events = [
      kill(600, 'radiant'), kill(605, 'radiant'), kill(610, 'radiant'),
      { type: 'ItemPurchased', time: 612, side: 'radiant', itemId: 63, playerName: 'p' },
    ]
    const groups = groupTimelineEvents(events, HISTORY)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(1)
    expect(groups[0].items[0].itemId).toBe(63)
  })

  it('keeps an item far from any fight as its own standalone row', () => {
    const events = [
      kill(600, 'radiant'), kill(605, 'radiant'), kill(610, 'radiant'),
      { type: 'ItemPurchased', time: 2000, side: 'dire', itemId: 63, playerName: 'p' },
    ]
    const groups = groupTimelineEvents(events, HISTORY)
    expect(groups).toHaveLength(2)
    expect(groups[0].kind).toBe('event') // newest first -> the t=2000 item leads
    expect(groups[0].event.itemId).toBe(63)
  })

  it('keeps Roshan as a standalone event, never folded into a fight', () => {
    const events = [kill(600, 'radiant'), kill(605, 'radiant'), { type: 'RoshanKilled', time: 607, side: null }]
    const groups = groupTimelineEvents(events, HISTORY)
    const rosh = groups.find(g => g.kind === 'event' && g.event.type === 'RoshanKilled')
    expect(rosh).toBeDefined()
  })

  it('returns groups NEWEST FIRST, so the live state needs no scrolling', () => {
    const groups = groupTimelineEvents([kill(100, 'radiant'), kill(900, 'dire')], HISTORY)
    expect(groups[0].time).toBe(900)
    expect(groups[1].time).toBe(100)
  })

  it('never reports a fight duration — cadence makes it unknowable (see the honesty note)', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(605, 'radiant'), kill(610, 'radiant')], HISTORY)
    expect(groups[0]).not.toHaveProperty('duration')
  })

  it('degrades to an empty array for empty/missing input', () => {
    expect(groupTimelineEvents([], HISTORY)).toEqual([])
    expect(groupTimelineEvents(null, HISTORY)).toEqual([])
  })

  it('works with no history at all — fights still group, swings are just null', () => {
    const groups = groupTimelineEvents([kill(600, 'radiant'), kill(605, 'radiant'), kill(610, 'radiant')])
    expect(groups[0].kind).toBe('fight')
    expect(groups[0].swing).toBeNull()
  })
})

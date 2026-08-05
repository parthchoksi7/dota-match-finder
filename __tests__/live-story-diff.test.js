import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  diffSnapshots,
  diffGame,
  indexGamesById,
  indexPlayerNames,
  resolveMarqueeItemIds,
  clearedBits,
  decodeTowerBit,
  decodeBarracksBit,
  parseOdBuildingObjective,
  crossCheckBuildingEvents,
  toGameTime,
  TEAM_RADIANT,
  TEAM_DIRE,
} from '../api/_liveStoryDiff.js'

// Real, unedited GetLiveLeagueGames responses captured ~80s apart during a live tier-1 window on
// 2026-08-05 (40 and 38 games respectively, 37 in common). Every assertion below that references
// a specific match/hero/item was derived from these files, not invented — so a regression in the
// differ shows up as a diff against real Valve data rather than against a mock of it.
const here = dirname(fileURLToPath(import.meta.url))
const FIX = join(here, 'fixtures', 'get-live-league-games')
const t0 = JSON.parse(readFileSync(join(FIX, 'yakult-vs-playtime-t0.json'), 'utf8'))
const t1 = JSON.parse(readFileSync(join(FIX, 'yakult-vs-playtime-t1.json'), 'utf8'))

// The match the investigation validated against by hand: Yakult Brothers vs PlayTime,
// Games of the Future 2026. duration 1263 -> 1343, score 10-7 -> 12-10.
const YAKULT = '8930398938'

// Minimal stand-in for the item map api/_handlers/matchStats.js caches in KV. Ids verified
// against https://api.opendota.com/api/constants/items on 2026-08-05.
const ITEM_NAMES = {
  1: { key: 'blink', dname: 'Blink Dagger' },
  108: { key: 'ultimate_scepter', dname: "Aghanim's Scepter" },
  116: { key: 'black_king_bar', dname: 'Black King Bar' },
  119: { key: 'shivas_guard', dname: "Shiva's Guard" },
  147: { key: 'manta', dname: 'Manta Style' },
  939: { key: 'harpoon', dname: 'Harpoon' },
  // Present in the fixtures but deliberately NOT marquee — proves the filter excludes.
  36: { key: 'magic_wand', dname: 'Magic Wand' },
  63: { key: 'power_treads', dname: 'Power Treads' },
}
const MARQUEE = resolveMarqueeItemIds(ITEM_NAMES)

function gamePair(matchId) {
  return [indexGamesById(t0).get(matchId), indexGamesById(t1).get(matchId)]
}

describe('fixture sanity', () => {
  it('parses the { result: { games } } envelope', () => {
    expect(indexGamesById(t0).size).toBe(40)
    expect(indexGamesById(t1).size).toBe(38)
  })

  it('scoreboard is present on 37 of 40 games, not universally', () => {
    // The investigation doc claims 39/40; the fixtures say 37. Asserted so the real number is
    // pinned and the "always present" assumption can never quietly creep back in.
    const withSb = [...indexGamesById(t0).values()].filter(g => g.scoreboard).length
    expect(withSb).toBe(37)
  })

  it('team_name is missing on half the live league games', () => {
    // Load-bearing for correlation: PandaScore, not Valve, must supply display names.
    const named = [...indexGamesById(t0).values()].filter(g => g.radiant_team?.team_name).length
    expect(named).toBe(20)
  })
})

describe('toGameTime', () => {
  it('floors the float duration Valve actually sends', () => {
    // 1263.36669921875 in the raw fixture — an unfloored value breaks the natural key's dedupe.
    expect(toGameTime(1263.36669921875)).toBe(1263)
  })

  it('returns null for a non-finite duration', () => {
    expect(toGameTime(undefined)).toBeNull()
    expect(toGameTime(null)).toBeNull()
  })
})

describe('indexPlayerNames', () => {
  it('reads IGNs off the top-level players[] array and normalizes 0/1 to 2/3', () => {
    const [, next] = gamePair(YAKULT)
    const names = indexPlayerNames(next)
    // Radiant hero 18 is "Lou" in the raw fixture; the key uses canonical team 2, not raw 0.
    expect(names[`${TEAM_RADIANT}:18`]).toBe('Lou')
    expect(names[`${TEAM_DIRE}:12`]).toBe('Wits')
  })

  it('drops broadcasters (team 2 in the raw encoding, hero_id 0)', () => {
    const [, next] = gamePair(YAKULT)
    const names = indexPlayerNames(next)
    // hero_id 0 is the caster placeholder — it must never occupy a real key.
    expect(names[`${TEAM_RADIANT}:0`]).toBeUndefined()
    expect(names[`${TEAM_DIRE}:0`]).toBeUndefined()
  })
})

describe('diffGame — Yakult vs PlayTime, the hand-validated match', () => {
  const [prev, next] = gamePair(YAKULT)
  const events = diffGame(prev, next, { marqueeItemIds: MARQUEE })

  it('derives exactly the five deaths the score delta implies', () => {
    // Score 10-7 -> 12-10 means Radiant conceded 3 and Dire conceded 2.
    const kills = events.filter(e => e.eventType === 'HeroKilled')
    expect(kills).toHaveLength(5)
    expect(kills.filter(e => e.team === TEAM_RADIANT)).toHaveLength(3)
    expect(kills.filter(e => e.team === TEAM_DIRE)).toHaveLength(2)
  })

  it('names the victims from the live IGN array', () => {
    const victims = events
      .filter(e => e.eventType === 'HeroKilled')
      .map(e => e.payload.victimName)
    expect(victims).toEqual(expect.arrayContaining(['Lou', 'kaka', 'Wits', 'Elmisho']))
  })

  it('refuses to attribute a killer when the tick is ambiguous', () => {
    // Three Dire heroes each gained exactly one kill against three Radiant deaths in the same
    // window — unpairable from this data. A wrong killer is worse than an unattributed kill.
    const kills = events.filter(e => e.eventType === 'HeroKilled')
    expect(kills.every(e => e.payload.killerHeroId === null)).toBe(true)
    expect(kills.every(e => e.payload.ambiguous === true)).toBe(true)
    // The death itself is still an observed fact.
    expect(kills.every(e => e.confidence === 'exact')).toBe(true)
  })

  it('emits no phantom purchase when items merely swap slots', () => {
    // Radiant hero 18: [1,172,63,116,252,36] -> [1,172,36,116,252,63]. Ids 63 and 36 changed
    // places and nothing was bought. A slot-wise diff would emit two purchases here.
    const hero18 = events.filter(e => e.eventType === 'ItemPurchased' && e.heroId === 18)
    expect(hero18).toHaveLength(0)
  })

  it('emits no Roshan event when the respawn timer never leaves zero', () => {
    expect(events.filter(e => e.eventType === 'RoshanKilled')).toHaveLength(0)
  })

  it('emits no building events when both bitmasks are unchanged', () => {
    // tower_state 1982/1974 and barracks_state 63 are identical across the pair.
    expect(events.filter(e => /Destroyed$/.test(e.eventType))).toHaveLength(0)
  })

  it('stamps every event with the floored game time of the newer snapshot', () => {
    expect(events.every(e => e.gameTime === 1343)).toBe(true)
  })

  it('assigns per-type sequence numbers so the natural key stays unique', () => {
    const kills = events.filter(e => e.eventType === 'HeroKilled')
    expect(kills.map(e => e.seq).sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('diffGame — guards', () => {
  const [prev, next] = gamePair(YAKULT)

  it('returns nothing when the clock has not advanced (pause / stale poll)', () => {
    expect(diffGame(prev, prev, { marqueeItemIds: MARQUEE })).toEqual([])
  })

  it('returns nothing when the clock runs backwards', () => {
    expect(diffGame(next, prev, { marqueeItemIds: MARQUEE })).toEqual([])
  })

  it('returns nothing when either scoreboard is absent', () => {
    expect(diffGame({ match_id: 1 }, next, { marqueeItemIds: MARQUEE })).toEqual([])
    expect(diffGame(prev, { match_id: 1 }, { marqueeItemIds: MARQUEE })).toEqual([])
  })

  it('emits no ItemPurchased at all when the item map failed to load', () => {
    // A failed constants fetch must degrade to "no item events", never to every boot and clarity.
    const events = diffSnapshots(t0, t1, { marqueeItemIds: new Set() })
    expect(events.filter(e => e.eventType === 'ItemPurchased')).toHaveLength(0)
  })
})

describe('resolveMarqueeItemIds', () => {
  it('maps constants keys to ids without hardcoding a numeric id', () => {
    expect(MARQUEE.has(116)).toBe(true)  // black_king_bar
    expect(MARQUEE.has(1)).toBe(true)    // blink
  })

  it('excludes non-marquee items present in the same map', () => {
    expect(MARQUEE.has(36)).toBe(false)  // magic_wand
    expect(MARQUEE.has(63)).toBe(false)  // power_treads
  })

  it('returns an empty set rather than throwing on a missing map', () => {
    expect(resolveMarqueeItemIds(null).size).toBe(0)
    expect(resolveMarqueeItemIds(undefined).size).toBe(0)
  })
})

describe('clearedBits', () => {
  it('reports only 1 -> 0 transitions', () => {
    // 1975 -> 1974 clears bit 0 alone (observed live in match 8930471017).
    expect(clearedBits(1975, 1974)).toEqual([0])
  })

  it('reports multiple simultaneous losses', () => {
    // 2047 -> 1982 clears bits 0 and 6 (observed live in match 8930468870).
    expect(clearedBits(2047, 1982)).toEqual([0, 6])
  })

  it('ignores bits that turn on', () => {
    expect(clearedBits(1974, 2047)).toEqual([])
  })

  it('is inert on non-finite input', () => {
    expect(clearedBits(undefined, 1974)).toEqual([])
    expect(clearedBits(1974, null)).toEqual([])
  })
})

// A second real pair, captured live 2026-08-05 ~31s apart. Kept specifically because the Yakult
// pair contains NO Roshan kill and NO building losses — the two highest-value event types were
// therefore completely untested against real data until this pair existed.
const r0 = JSON.parse(readFileSync(join(FIX, 'roshan-and-towers-t0.json'), 'utf8'))
const r1 = JSON.parse(readFileSync(join(FIX, 'roshan-and-towers-t1.json'), 'utf8'))

describe('live capture — Roshan and buildings', () => {
  const events = diffSnapshots(r0, r1, { marqueeItemIds: MARQUEE })

  it('derives a Roshan kill from the respawn timer leaving zero', () => {
    const rosh = events.filter(e => e.eventType === 'RoshanKilled')
    expect(rosh).toHaveLength(1)
    expect(rosh[0].confidence).toBe('exact')
    expect(rosh[0].payload.respawnTimer).toBeGreaterThan(0)
  })

  it('never attributes Roshan to a team', () => {
    // The field says THAT Roshan died, not WHO killed it. At this cadence a teamfight and a
    // Roshan attempt routinely share one window, so guessing from a net-worth swing would be
    // confidently wrong often enough to matter.
    const rosh = events.filter(e => e.eventType === 'RoshanKilled')[0]
    expect(rosh.team).toBeNull()
    expect(rosh.payload.teamAttribution).toBeNull()
  })

  it('derives building losses that decode to real board positions', () => {
    const towers = events.filter(e => e.eventType === 'TowerDestroyed')
    expect(towers.length).toBeGreaterThan(0)
    for (const t of towers) {
      const d = decodeTowerBit(t.payload.bit)
      expect(d).not.toBeNull()
      expect(d.tier).toBeGreaterThanOrEqual(1)
      expect(d.tier).toBeLessThanOrEqual(4)
    }
  })

  it('attributes a killer when exactly one player died to exactly one killer', () => {
    // The Yakult pair only ever exercises the ambiguous path; this pair exercises the other
    // branch, so both halves of the attribution rule are covered by real data.
    const attributed = events.filter(e => e.eventType === 'HeroKilled' && !e.payload.ambiguous)
    expect(attributed.length).toBeGreaterThan(0)
    for (const e of attributed) {
      expect(e.payload.killerHeroId).toEqual(expect.any(Number))
      // Naming a killer is an inference even when unambiguous — it is never promoted to exact.
      expect(e.confidence).toBe('inferred')
    }
  })
})

describe('E12 — tower/barracks bit layout', () => {
  // Re-derives the proof in-test so a future fixture or refactor cannot silently invalidate it.
  // The constraints below are physically enforced by Dota: a deeper tower cannot fall before a
  // shallower one in the same lane, and barracks cannot fall before their lane's tier-3.
  function observedStates() {
    const out = []
    for (const snap of [t0, t1]) {
      for (const g of indexGamesById(snap).values()) {
        if (!g.scoreboard) continue
        for (const side of ['radiant', 'dire']) {
          const t = g.scoreboard[side]?.tower_state
          const b = g.scoreboard[side]?.barracks_state
          if (Number.isFinite(t) && Number.isFinite(b)) out.push({ t, b })
        }
      }
    }
    return out
  }

  function violations(states, bitFor) {
    let n = 0
    for (const s of states) {
      for (let lane = 0; lane < 3; lane++) {
        const t1b = (s.t >> bitFor(lane, 0)) & 1
        const t2b = (s.t >> bitFor(lane, 1)) & 1
        const t3b = (s.t >> bitFor(lane, 2)) & 1
        if (t1b === 1 && t2b === 0) n++
        if (t2b === 1 && t3b === 0) n++
        if (t3b === 1 && ((s.b >> (lane * 2)) & 3) !== 3) n++
      }
    }
    return n
  }

  it('lane-major layout survives every physically-enforced constraint', () => {
    const states = observedStates()
    expect(states).toHaveLength(146)
    expect(violations(states, (lane, tier) => lane * 3 + tier)).toBe(0)
  })

  it('discriminates against the competing tier-major layout', () => {
    // A test that only confirms the favoured hypothesis proves nothing; this one shows the
    // alternative is actually excluded by the same data.
    expect(violations(observedStates(), (lane, tier) => tier * 3 + lane)).toBeGreaterThan(0)
  })

  it('bit widths match the real board', () => {
    const states = observedStates()
    expect(Math.max(...states.map(s => s.t))).toBe(2047) // 11 bits: 9 towers + 2 tier-4
    expect(Math.max(...states.map(s => s.b))).toBe(63)   // 6 bits: 3 lanes x melee/ranged
  })

  it('decodes bits to lane/tier', () => {
    expect(decodeTowerBit(0)).toMatchObject({ lane: 'top', tier: 1 })
    expect(decodeTowerBit(8)).toMatchObject({ lane: 'bot', tier: 3 })
    expect(decodeTowerBit(9)).toMatchObject({ tier: 4 })
    expect(decodeBarracksBit(4)).toMatchObject({ lane: 'bot', kind: 'melee' })
    expect(decodeBarracksBit(5)).toMatchObject({ lane: 'bot', kind: 'ranged' })
  })

  it('flags lane naming as unverified until the OpenDota cross-check', () => {
    // The invariant test is symmetric under a top/bot swap, so it proves structure, not naming.
    expect(decodeTowerBit(0).laneVerified).toBe(false)
    expect(decodeBarracksBit(0).laneVerified).toBe(false)
  })

  it('rejects out-of-range bits', () => {
    expect(decodeTowerBit(11)).toBeNull()
    expect(decodeTowerBit(-1)).toBeNull()
    expect(decodeBarracksBit(6)).toBeNull()
  })
})

describe('OD building-objective parser + cross-check mechanism', () => {
  // IMPORTANT SCOPE NOTE: these tests verify that parseOdBuildingObjective and
  // crossCheckBuildingEvents work correctly as MECHANISMS. They do NOT close E12's lane-naming
  // question. The "every event confirms" test below manufactures its "derived" events by
  // re-encoding OD's own labels through this file's OWN decodeTowerBit assumption
  // (TOWER_LANES = ['top','mid','bot']) — so it is a round-trip check (decode(encode(x)) === x)
  // and would pass identically even if every lane were mislabeled, because both sides of the
  // comparison share the same assumption. It is a valid test that the CROSS-CHECK TOOL is
  // wired correctly. It is not evidence about which physical lane bit 0 actually is.
  //
  // Closing E12 for real requires two INDEPENDENTLY sourced observations of the SAME live match:
  // Valve's bit transitions (with real timestamps, captured live) and that match's own OpenDota
  // objectives (captured post-game, after it finishes and OD parses it). That pairing does not
  // exist yet — capture only started today. `crossCheckBuildingEvents` is the tool that performs
  // that comparison once it does; the admin page's crosscheck action runs it against real pairs
  // as tier-1 matches captured during the verification window complete.
  // A real finished tier-1-adjacent match, fully parsed (proMatches sample, 2026-08-05).
  // OpenDota's `key` field spells the side and lane out in plain text — this is the ground
  // truth the lane-major STRUCTURE (already proven above from bitmask invariants alone) gets
  // checked against to resolve which lane triple is actually "top" vs "bot".
  const odMatch = JSON.parse(
    readFileSync(join(here, 'fixtures', 'opendota-objectives', '8930545836.json'), 'utf8'),
  )

  it('parses OpenDota building_kill keys into {team, lane, tier}', () => {
    const towerEvents = odMatch.objectives.filter(o => o.type === 'building_kill')
    const parsed = towerEvents.map(parseOdBuildingObjective).filter(Boolean)
    // 12 building_kill entries in the fixture; 1 is the Ancient (`_fort`), which has no lane and
    // parses to null — so 11 lane-attributable results, not 12.
    expect(parsed).toHaveLength(11)
  })

  it('maps goodguys -> Radiant and badguys -> Dire, matching this codebase\'s convention', () => {
    const dire = parseOdBuildingObjective({ type: 'building_kill', key: 'npc_dota_badguys_tower1_bot', time: 605 })
    const radiant = parseOdBuildingObjective({ type: 'building_kill', key: 'npc_dota_goodguys_tower1_bot', time: 929 })
    expect(dire).toMatchObject({ team: TEAM_DIRE, lane: 'bot', tier: 1 })
    expect(radiant).toMatchObject({ team: TEAM_RADIANT, lane: 'bot', tier: 1 })
  })

  it('parses barracks kind (melee/ranged) from the key', () => {
    const melee = parseOdBuildingObjective({ type: 'building_kill', key: 'npc_dota_badguys_melee_rax_mid', time: 1700 })
    const ranged = parseOdBuildingObjective({ type: 'building_kill', key: 'npc_dota_badguys_range_rax_mid', time: 1769 })
    expect(melee).toMatchObject({ kind: 'barracks', raxKind: 'melee', lane: 'mid' })
    expect(ranged).toMatchObject({ kind: 'barracks', raxKind: 'ranged', lane: 'mid' })
  })

  it('returns null for non-building objectives and for the Ancient itself', () => {
    expect(parseOdBuildingObjective({ type: 'CHAT_MESSAGE_FIRSTBLOOD', key: '7' })).toBeNull()
    expect(parseOdBuildingObjective({ type: 'building_kill', key: 'npc_dota_badguys_fort' })).toBeNull()
  })

  it('confirms a correctly-decoded derived event against real OD ground truth', () => {
    // OD: Dire tier1 top tower at t=736. decodeTowerBit's lane-major layout puts top/tier1 at
    // bit 0 — the same bit this differ would emit for that exact tower.
    const derived = [{
      eventType: 'TowerDestroyed', team: TEAM_DIRE, gameTime: 736,
      payload: { bit: 0 }, confidence: 'uncertain',
    }]
    const [result] = crossCheckBuildingEvents(derived, odMatch.objectives)
    expect(result.verdict).toBe('confirmed')
    expect(result.decoded).toMatchObject({ lane: 'top', tier: 1 })
  })

  it('flags a lane mismatch when the decoded lane disagrees with OD ground truth', () => {
    // Same team/tier/time as the real "mid" tower kill (t=679), but the bit deliberately decoded
    // as "top" instead — this is exactly the failure mode E12 exists to catch before shipping
    // lane-named towers to a user.
    const derived = [{
      eventType: 'TowerDestroyed', team: TEAM_DIRE, gameTime: 679,
      payload: { bit: 0 }, confidence: 'uncertain', // bit 0 decodes to top, real event was mid
    }]
    const [result] = crossCheckBuildingEvents(derived, odMatch.objectives)
    expect(result.verdict).toBe('lane_mismatch')
  })

  it('reports no_match when nothing comparable exists in the OD data', () => {
    // Tier-4 (Ancient-adjacent) towers never occurred in this particular match.
    const derived = [{
      eventType: 'TowerDestroyed', team: TEAM_RADIANT, gameTime: 500,
      payload: { bit: 9 }, confidence: 'uncertain',
    }]
    const [result] = crossCheckBuildingEvents(derived, odMatch.objectives)
    expect(result.verdict).toBe('no_match')
  })

  it('round-trips every building_kill in this match through decode<->OD-parse consistently', () => {
    // NOT independent validation (see the describe-block note above) — this reconstructs each
    // derived event by re-encoding OD's own parsed lane/tier through THIS FILE'S OWN assumed
    // TOWER_LANES ordering, so a match here only proves crossCheckBuildingEvents' matching logic
    // (team/tier/time-window/lane comparison) is wired correctly, not that the ordering is right.
    const odBuildings = odMatch.objectives.filter(o => o.type === 'building_kill')
    const derived = odBuildings.map(o => {
      const parsed = parseOdBuildingObjective(o)
      if (!parsed) return null
      const team = parsed.team
      if (parsed.kind === 'tower') {
        const laneIdx = ['top', 'mid', 'bot'].indexOf(parsed.lane)
        const bit = laneIdx * 3 + (parsed.tier - 1)
        return { eventType: 'TowerDestroyed', team, gameTime: parsed.time, payload: { bit }, confidence: 'uncertain' }
      }
      const laneIdx = ['top', 'mid', 'bot'].indexOf(parsed.lane)
      const bit = laneIdx * 2 + (parsed.raxKind === 'melee' ? 0 : 1)
      return { eventType: 'BarracksDestroyed', team, gameTime: parsed.time, payload: { bit }, confidence: 'uncertain' }
    }).filter(Boolean)

    const results = crossCheckBuildingEvents(derived, odMatch.objectives)
    expect(results).toHaveLength(11)
    expect(results.every(r => r.verdict === 'confirmed')).toBe(true)
  })
})

describe('diffSnapshots — whole-response behavior', () => {
  const events = diffSnapshots(t0, t1, { marqueeItemIds: MARQUEE })

  it('derives events across every game present in both snapshots', () => {
    const matches = new Set(events.map(e => e.odMatchId))
    expect(matches.size).toBeGreaterThan(1)
    expect(matches.has(YAKULT)).toBe(true)
  })

  it('never emits a building event above uncertain confidence while E12 is open', () => {
    // Risk T3: uncertain events are never rendered. Shipping the raw bit is safe precisely
    // because the read path filters on this field.
    const buildings = events.filter(e => /Destroyed$/.test(e.eventType))
    expect(buildings.length).toBeGreaterThan(0)
    expect(buildings.every(e => e.confidence === 'uncertain')).toBe(true)
    expect(buildings.every(e => typeof e.payload.bit === 'number')).toBe(true)
    // No lane/tier claim may appear until the layout is cross-checked against OpenDota.
    expect(buildings.every(e => e.payload.lane === undefined)).toBe(true)
  })

  it('emits only marquee purchases', () => {
    const items = events.filter(e => e.eventType === 'ItemPurchased')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(e => MARQUEE.has(e.payload.itemId))).toBe(true)
  })

  it('skips games that have no baseline in the previous snapshot', () => {
    const onlyInNext = [...indexGamesById(t1).keys()].filter(id => !indexGamesById(t0).has(id))
    expect(onlyInNext.length).toBeGreaterThan(0)
    for (const id of onlyInNext) {
      expect(events.some(e => e.odMatchId === id)).toBe(false)
    }
  })
})

// Valve `GetLiveLeagueGames` -> live-surface payload shaping. Pure functions only, no I/O.
//
// Every field this module reads comes from Valve's own feed. Nothing here consults OpenDota or
// PandaScore: per the 2026-08-06 product constraint, PandaScore owns the match FRAMING (tournament
// name, bracket round, series format/score, stream links — none of which exist in Valve's feed at
// all) while Valve owns everything happening INSIDE the game. This module is the Valve half.
//
// Field-level provenance and confidence for everything below: `.claude/specs/live-story-valve-data-audit.md`.
// Bit layouts are NOT re-derived here — `decodeTowerBit`/`decodeBarracksBit` in `_liveStoryDiff.js`
// are the single source for that mapping (proven over 146 real observed states, 0/1,314 constraint
// violations) and this module calls them rather than hand-rolling a second copy that could drift.

import { decodeTowerBit, decodeBarracksBit } from './_liveStoryDiff.js'

// Valve's own side encoding inside `game.players[]`: 0=Radiant, 1=Dire, 2=broadcaster/caster.
// This is NOT the 2=Radiant/3=Dire convention used everywhere else in this codebase (see
// `_liveStoryDiff.js`'s TEAM_RADIANT/TEAM_DIRE) — normalize at this boundary, never leak it.
const VALVE_TEAM_RADIANT = 0
const VALVE_TEAM_DIRE = 1

// 11 tower bits (9 lane towers + 2 tier-4) and 6 barracks bits. A SET bit means the building is
// still STANDING; a bit clearing between snapshots is what the differ reads as a destruction.
const TOWER_BIT_COUNT = 11
const BARRACKS_BIT_COUNT = 6

/**
 * Decodes a `tower_state` bitmask into per-lane standing/destroyed state plus the tier-4 pair.
 *
 * Returns lanes as `{ top: [t1, t2, t3], mid: [...], bot: [...] }` where each entry is a boolean
 * "standing". `laneVerified` is passed through from the shared decoder and is still `false` — the
 * bit STRUCTURE is proven, but which lane triple is genuinely "top" vs "bot" rests on 2 of the 3
 * independently-validated matches the graduation bar requires. Callers must caption accordingly
 * rather than presenting lane names as settled fact.
 */
export function decodeTowerState(mask) {
  if (!Number.isFinite(mask) || mask < 0) return null
  const lanes = { top: [], mid: [], bot: [] }
  const tier4 = []
  // Starts FALSE and is only raised by positive evidence from the shared decoder. Starting true
  // and AND-ing down would report "lane names are verified" for an empty or fully-skipped loop —
  // the one direction this flag must never fail in, since the UI drops its provisional-lane
  // caption when it reads true.
  let laneVerified = false
  for (let bit = 0; bit < TOWER_BIT_COUNT; bit++) {
    const standing = ((mask >> bit) & 1) === 1
    const decoded = decodeTowerBit(bit)
    if (!decoded) continue
    if (decoded.laneVerified === true) laneVerified = true
    if (decoded.tier === 4) tier4.push(standing)
    else lanes[decoded.lane][decoded.tier - 1] = standing
  }
  return { lanes, tier4, laneVerified }
}

/**
 * Decodes a `barracks_state` bitmask into `{ top: { melee, ranged }, ... }` booleans.
 *
 * NOTE this is genuinely new capability on the live surface. The shipped tower map
 * (`DotaMinimap.jsx`) is fed by OpenDota's separate `building_state`, from which barracks are
 * provably NOT derivable (see `_buildingState.js`'s header — the same raw value occurred with 0
 * and 2 barracks destroyed in different lanes of one game, a direct disproof). Valve's dedicated
 * `barracks_state` field has no such ambiguity.
 */
export function decodeBarracksState(mask) {
  if (!Number.isFinite(mask) || mask < 0) return null
  const lanes = { top: {}, mid: {}, bot: {} }
  // Same fail-safe direction as decodeTowerState — see its comment.
  let laneVerified = false
  for (let bit = 0; bit < BARRACKS_BIT_COUNT; bit++) {
    const standing = ((mask >> bit) & 1) === 1
    const decoded = decodeBarracksBit(bit)
    if (!decoded) continue
    if (decoded.laneVerified === true) laneVerified = true
    lanes[decoded.lane][decoded.kind] = standing
  }
  return { lanes, laneVerified }
}

/**
 * Decodes the `ultimate_state` bitmask: bit 0 = unlocked, bit 1 = off cooldown.
 *
 * Empirically derived, not documented by Valve: across 394 real player-ticks, excluding the
 * trivial `state === 0` (not yet unlocked) case, 193/194 (99.5%) were consistent with
 * `(state & 2) === (cooldown === 0)`.
 *
 * `ready` is deliberately reported as `false` — never `true` — whenever the ultimate isn't
 * unlocked yet, so a level-1 hero can't render an "ultimate up" cue. When `cooldown` is a real
 * positive number it WINS over the bit: the bit is a 99.5% inference, the cooldown is a direct
 * reading, and disagreeing with an explicit non-zero cooldown would be the one case where the
 * known-fallible signal overrides the reliable one.
 */
export function decodeUltimateState(state, cooldown) {
  if (!Number.isFinite(state)) return { unlocked: false, ready: false, cooldown: null }
  const unlocked = (state & 1) === 1
  if (!unlocked) return { unlocked: false, ready: false, cooldown: null }
  const cd = Number.isFinite(cooldown) && cooldown > 0 ? Math.round(cooldown) : 0
  const ready = cd > 0 ? false : (state & 2) === 2
  return { unlocked: true, ready, cooldown: cd }
}

/**
 * Sums a side's per-player `net_worth`. Returns null when the side has no usable players, so a
 * caller can tell "no data" apart from a genuine 0 — never fabricate a 0-0 net-worth lead.
 */
export function sumNetWorth(players) {
  if (!Array.isArray(players) || players.length === 0) return null
  let total = 0
  let seen = 0
  for (const p of players) {
    if (!p || !Number.isFinite(p.net_worth)) continue
    total += p.net_worth
    seen++
  }
  return seen > 0 ? total : null
}

/**
 * Builds `account_id -> IGN` from the game's TOP-LEVEL `players[]`, which is the only place a live
 * IGN appears anywhere in the feed (the `scoreboard` players carry full telemetry but no name).
 * Broadcasters (`team === 2`) are dropped — they are not part of either five.
 */
export function indexLiveIgns(game) {
  const out = new Map()
  for (const p of game?.players || []) {
    if (!p || (p.team !== VALVE_TEAM_RADIANT && p.team !== VALVE_TEAM_DIRE)) continue
    if (p.account_id == null || !p.name) continue
    out.set(String(p.account_id), p.name)
  }
  return out
}

/**
 * Shapes one side's five players into the live board's row model.
 *
 * `heroId` 0 means "still drafting" and is passed through untouched — the frontend already renders
 * a placeholder tile for hero 0, the same as the finished-game draft strip, so this must not be
 * normalized to null here.
 */
export function shapeSidePlayers(side, igns) {
  if (!side || !Array.isArray(side.players)) return []
  return side.players.map(p => {
    const ult = decodeUltimateState(p?.ultimate_state, p?.ultimate_cooldown)
    const respawn = Number.isFinite(p?.respawn_timer) && p.respawn_timer > 0 ? Math.round(p.respawn_timer) : 0
    return {
      playerSlot: p?.player_slot ?? null,
      accountId: p?.account_id != null ? String(p.account_id) : null,
      name: p?.account_id != null ? (igns.get(String(p.account_id)) || null) : null,
      heroId: p?.hero_id ?? 0,
      level: Number.isFinite(p?.level) ? p.level : null,
      kills: Number.isFinite(p?.kills) ? p.kills : null,
      // Valve names this field `death`, singular — the rest of this codebase says `deaths`.
      // Renamed at this boundary so no frontend has to know Valve's spelling.
      deaths: Number.isFinite(p?.death) ? p.death : null,
      assists: Number.isFinite(p?.assists) ? p.assists : null,
      lastHits: Number.isFinite(p?.last_hits) ? p.last_hits : null,
      denies: Number.isFinite(p?.denies) ? p.denies : null,
      // Liquid, spendable gold — confirmed distinct from and much smaller than net worth
      // (e.g. 245 vs 10,530 for one player). Keep both; they answer different questions.
      gold: Number.isFinite(p?.gold) ? p.gold : null,
      netWorth: Number.isFinite(p?.net_worth) ? p.net_worth : null,
      gpm: Number.isFinite(p?.gold_per_min) ? p.gold_per_min : null,
      xpm: Number.isFinite(p?.xp_per_min) ? p.xp_per_min : null,
      // Exactly 6 slots — confirmed empirically, not assumed: no backpack or neutral-item field
      // exists anywhere in the 99-field schema across three independent captures. An empty slot
      // is -1 in the raw feed; normalized to 0 here to match the completed-match `ItemSlot`
      // contract, which already treats 0 as "empty".
      items: [p?.item0, p?.item1, p?.item2, p?.item3, p?.item4, p?.item5]
        .map(id => (Number.isFinite(id) && id > 0 ? id : 0)),
      respawnTimer: respawn,
      isDead: respawn > 0,
      ultimate: ult,
    }
  })
}

/**
 * Normalizes a picks/bans array to bare hero ids.
 *
 * Accepts BOTH shapes on purpose. `trimSide` (liveStoryCapture.js) already flattens Valve's raw
 * `{ hero_id }` objects to bare ids before anything reaches KV, so production always hands this
 * bare ids — but `shapeValvePulse` is also reachable with an untrimmed snapshot (fixtures, the
 * admin inspector, any future direct-fetch path), and silently passing objects through would
 * produce `heroes[{hero_id: 41}]` -> undefined at the render site, i.e. a hero list that renders
 * as "Hero [object Object]" rather than failing loudly. Normalizing here makes both callers
 * correct instead of making the contract depend on which path you arrived through.
 */
export function normalizeHeroIdList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(entry => (entry != null && typeof entry === 'object' ? entry.hero_id : entry))
    .filter(id => Number.isFinite(id))
}

/**
 * Collects the distinct, non-empty item ids held across both sides of a shaped pulse.
 *
 * Used to attach a SCOPED item-name map to the response — at most ~60 ids — instead of shipping
 * OpenDota's full ~1,500-entry constants blob to every viewer on every poll. Item id -> name is
 * patch-static reference data, not live telemetry, so sourcing it from the already-cached
 * OpenDota constants map is consistent with the Valve-only rule (which governs match data).
 */
export function collectItemIds(pulse) {
  const ids = new Set()
  for (const side of ['radiant', 'dire']) {
    for (const p of pulse?.players?.[side] || []) {
      for (const id of p.items || []) {
        if (id > 0) ids.add(id)
      }
    }
  }
  return [...ids]
}

/**
 * Shapes a full Valve game snapshot into the live surface payload.
 *
 * `radiantName`/`direName` are passed IN by the caller from the already-trusted PandaScore
 * opponent names — deliberately not read from Valve's own `radiant_team.team_name`, which is
 * absent on roughly half of all live league games and would otherwise make the header flicker
 * between a real name and a blank as coverage changes mid-series.
 */
export function shapeValvePulse(game, { radiantName, direName } = {}) {
  if (!game) return null
  const sb = game.scoreboard
  const igns = indexLiveIgns(game)

  // `duration` is a FLOAT (e.g. 1263.36669921875), not an int. Floor it — every downstream
  // consumer treats game time as whole seconds, and an unfloored value breaks natural-key dedupe.
  const gameTime = Number.isFinite(sb?.duration) ? Math.floor(sb.duration) : null

  const radiantPlayers = shapeSidePlayers(sb?.radiant, igns)
  const direPlayers = shapeSidePlayers(sb?.dire, igns)
  const radiantNw = sumNetWorth(radiantPlayers.map(p => ({ net_worth: p.netWorth })))
  const direNw = sumNetWorth(direPlayers.map(p => ({ net_worth: p.netWorth })))

  return {
    source: 'valve',
    matchId: String(game.match_id),
    radiantName: radiantName || null,
    direName: direName || null,
    gameTime,
    // Broadcast delay is a real, variable per-tournament setting (10/120/300/900 observed), not a
    // guessable constant — surfaced so the UI can tell a viewer how far ahead of the stream it is.
    streamDelayS: Number.isFinite(game.stream_delay_s) ? game.stream_delay_s : null,
    spectators: Number.isFinite(game.spectators) ? game.spectators : null,
    radiantScore: Number.isFinite(sb?.radiant?.score) ? sb.radiant.score : null,
    direScore: Number.isFinite(sb?.dire?.score) ? sb.dire.score : null,
    radiantNetWorth: radiantNw,
    direNetWorth: direNw,
    // Positive = Radiant ahead, matching the sign convention LiveGoldGraph/GoldGraph already use.
    radiantLead: radiantNw != null && direNw != null ? radiantNw - direNw : null,
    // Direct field, not aegis-inferred. 0 means Roshan is currently ALIVE. Valve does not name
    // which team killed him, so no attribution is invented here.
    roshanRespawnTimer: Number.isFinite(sb?.roshan_respawn_timer) ? sb.roshan_respawn_timer : null,
    towers: {
      radiant: decodeTowerState(sb?.radiant?.tower_state),
      dire: decodeTowerState(sb?.dire?.tower_state),
    },
    barracks: {
      radiant: decodeBarracksState(sb?.radiant?.barracks_state),
      dire: decodeBarracksState(sb?.dire?.barracks_state),
    },
    players: { radiant: radiantPlayers, dire: direPlayers },
    draft: {
      // Pick ORDER, distinct from the slot-ordered hero list on players[] — this is the only
      // place "who took what, when" exists. Bans have no other source in the feed at all.
      // Always bare hero ids out, whichever shape came in — see normalizeHeroIdList.
      radiantPicks: normalizeHeroIdList(sb?.radiant?.picks),
      direPicks: normalizeHeroIdList(sb?.dire?.picks),
      radiantBans: normalizeHeroIdList(sb?.radiant?.bans),
      direBans: normalizeHeroIdList(sb?.dire?.bans),
    },
  }
}

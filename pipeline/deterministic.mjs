/**
 * Deterministic match intelligence generation — zero LLM involvement.
 *
 * Takes a raw OpenDota /matches/{id} response and returns a structured
 * MatchIntelligence object that the editorial review console and public
 * match page consume directly.
 *
 * Every field in the output links back to a specific source field in the
 * raw match payload (see `raw` properties) — this is the traceability
 * foundation the editorial claim-verification system depends on.
 *
 * Usage as a module:
 *   import { generateMatchIntelligence } from './pipeline/deterministic.mjs'
 *   const intel = await generateMatchIntelligence(rawMatch)
 *
 * Usage as a script:
 *   node pipeline/deterministic.mjs <match_id>
 */

const OD_BASE = 'https://api.opendota.com/api'

// ── Constants ────────────────────────────────────────────────────────────────

let _heroMap = null
export async function getHeroMap() {
  if (_heroMap) return _heroMap
  const res = await fetch(`${OD_BASE}/heroes`)
  if (!res.ok) throw new Error(`OD /heroes failed: ${res.status}`)
  const heroes = await res.json()
  _heroMap = new Map(heroes.map(h => [h.id, h.localized_name]))
  return _heroMap
}

let _patchMap = null
export async function getPatchMap() {
  if (_patchMap) return _patchMap
  const res = await fetch(`${OD_BASE}/constants/patch`)
  if (!res.ok) throw new Error(`OD /constants/patch failed: ${res.status}`)
  const patches = await res.json()
  // Array of { id, name, date } — id is the integer patch field on matches
  _patchMap = new Map(patches.map(p => [p.id, p.name]))
  return _patchMap
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const SERIES_TYPE = { 0: 'BO1', 1: 'BO2', 2: 'BO3', 3: 'BO5' }

// objectives: team=2 → radiant, team=3 → dire (Valve convention)
function objTeam(n) {
  if (n === 2) return 'radiant'
  if (n === 3) return 'dire'
  return null
}

/**
 * Parse a building npc key into side + building type + human label.
 * The `key` field on building_kill objectives encodes everything:
 *   npc_dota_goodguys_tower1_top  → Radiant Tier 1 Tower (top)
 *   npc_dota_badguys_melee_rax_mid → Dire Melee Barracks (mid)
 *   npc_dota_goodguys_fort         → Radiant Ancient
 *
 * `destroyedSide` = the team whose building was killed
 * (opposite team did the destroying)
 */
function parseBuilding(key = '') {
  const k = key.toLowerCase()
  const destroyedSide = k.includes('goodguys') ? 'radiant'
    : k.includes('badguys') ? 'dire'
    : null

  let buildingType, tier
  if      (/fort/.test(k))          { buildingType = 'ancient';  tier = null }
  else if (/melee_rax/.test(k))     { buildingType = 'barracks'; tier = 'Melee' }
  else if (/range_rax/.test(k))     { buildingType = 'barracks'; tier = 'Ranged' }
  else if (/tower4/.test(k))        { buildingType = 'tower';    tier = 'T4' }
  else if (/tower3/.test(k))        { buildingType = 'tower';    tier = 'T3' }
  else if (/tower2/.test(k))        { buildingType = 'tower';    tier = 'T2' }
  else if (/tower1/.test(k))        { buildingType = 'tower';    tier = 'T1' }
  else                              { buildingType = 'building'; tier = null }

  const laneMatch = k.match(/_(top|mid|bot|bottom)/)
  const lane = laneMatch ? laneMatch[1].replace('bottom', 'bot') : null

  const label = [
    tier,
    buildingType === 'ancient' ? 'Ancient' : buildingType === 'barracks' ? 'Barracks' : buildingType === 'tower' ? 'Tower' : 'Building',
    lane ? `(${lane})` : null,
  ].filter(Boolean).join(' ')

  return { destroyedSide, buildingType, label }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// ── Core transformation ───────────────────────────────────────────────────────

/**
 * @param {object} raw - raw OpenDota /matches/{id} response
 * @returns {MatchIntelligence}
 */
export async function generateMatchIntelligence(raw) {
  const [heroMap, patchMap] = await Promise.all([getHeroMap(), getPatchMap()])
  const heroName = id => heroMap.get(id) ?? `Hero #${id}`
  const patchName = id => patchMap.get(id) ?? `patch_${id}`

  // player_slot lookup used by objective resolvers
  const playerBySlot = new Map((raw.players ?? []).map(p => [p.player_slot, p]))

  // ── Match summary ──────────────────────────────────────────────────────────
  const radiantWon = raw.radiant_win
  const summary = {
    matchId:         String(raw.match_id),
    seriesId:        String(raw.series_id),
    seriesType:      SERIES_TYPE[raw.series_type] ?? 'BO?',
    tournament: {
      leagueId:      raw.league?.leagueid,
      name:          raw.league?.name ?? 'Unknown Tournament',
    },
    patch:           patchName(raw.patch),
    startedAt:       new Date(raw.start_time * 1000).toISOString(),
    durationSeconds: raw.duration,
    duration:        fmtTime(raw.duration),
    radiant: {
      name:    raw.radiant_team?.name ?? 'Radiant',
      teamId:  raw.radiant_team?.team_id ?? null,
      won:     radiantWon,
    },
    dire: {
      name:    raw.dire_team?.name ?? 'Dire',
      teamId:  raw.dire_team?.team_id ?? null,
      won:     !radiantWon,
    },
    winner: radiantWon ? 'radiant' : 'dire',
  }

  // ── Draft ──────────────────────────────────────────────────────────────────
  // picks_bans is ordered by `order` field; team=0 → radiant, team=1 → dire
  const picks = [], bans = []
  for (const pb of (raw.picks_bans ?? [])) {
    const entry = {
      side:     pb.team === 0 ? 'radiant' : 'dire',
      heroId:   pb.hero_id,
      heroName: heroName(pb.hero_id),
      order:    pb.order,
    }
    if (pb.is_pick) picks.push(entry)
    else bans.push(entry)
  }
  picks.sort((a, b) => a.order - b.order)
  bans.sort((a, b) => a.order - b.order)
  const draft = { picks, bans }

  // ── Objectives ────────────────────────────────────────────────────────────
  const objectives = []
  for (const obj of (raw.objectives ?? [])) {
    let type, side, detail

    switch (obj.type) {
      case 'CHAT_MESSAGE_FIRSTBLOOD': {
        // player_slot on the event is the killing player
        const killer = playerBySlot.get(obj.player_slot)
        type   = 'first_blood'
        side   = killer ? (killer.team_number === 0 ? 'radiant' : 'dire') : null
        detail = killer
          ? `First blood: ${killer.name ?? killer.personaname} (${heroName(killer.hero_id)})`
          : 'First blood'
        break
      }

      case 'CHAT_MESSAGE_ROSHAN_KILL': {
        side   = objTeam(obj.team)
        type   = 'roshan'
        detail = `Roshan killed — ${capitalize(side) ?? 'Unknown'} gets Aegis`
        break
      }

      case 'CHAT_MESSAGE_AEGIS': {
        // player_slot of the aegis holder is on obj.player_slot
        const holder = playerBySlot.get(obj.player_slot)
        side   = holder ? (holder.team_number === 0 ? 'radiant' : 'dire') : null
        type   = 'aegis'
        detail = holder
          ? `Aegis → ${holder.name ?? holder.personaname} (${heroName(holder.hero_id)})`
          : 'Aegis picked up'
        break
      }

      case 'CHAT_MESSAGE_MINIBOSS_KILL': {
        // Tormentor — team that killed it, slot of the killing player
        const slayer = playerBySlot.get(obj.player_slot)
        side   = objTeam(obj.team)
        type   = 'tormentor'
        detail = `Tormentor killed by ${capitalize(side) ?? 'Unknown'}${slayer ? ` — ${slayer.name ?? slayer.personaname}` : ''}`
        break
      }

      case 'building_kill': {
        const building = parseBuilding(obj.key)
        type = building.buildingType   // 'tower' | 'barracks' | 'ancient' | 'building'
        side = building.destroyedSide  // side whose building was destroyed
        const attackerSide = side === 'radiant' ? 'Dire' : side === 'dire' ? 'Radiant' : 'Unknown'
        detail = `${attackerSide} destroys ${capitalize(building.destroyedSide) ?? 'Unknown'} ${building.label}`
        break
      }

      case 'CHAT_MESSAGE_COURIER_LOST': {
        // team = side that LOST the courier
        side   = objTeam(obj.team)
        type   = 'courier'
        detail = `${capitalize(side) ?? 'Unknown'} courier killed`
        break
      }

      default:
        // Unknown event type — skip but don't throw; new Dota mechanics may add types
        continue
    }

    objectives.push({
      timeSeconds: obj.time,
      time:        fmtTime(obj.time),
      type,
      side,
      detail,
      // Raw event preserved for claim traceability in editorial console
      _source: obj,
    })
  }

  // ── Players ───────────────────────────────────────────────────────────────
  const players = (raw.players ?? []).map(p => ({
    slot:         p.player_slot,
    side:         p.team_number === 0 ? 'radiant' : 'dire',
    accountId:    p.account_id,
    // Tier 1 matches have player.name (pro tag); lower tiers use Steam persona name
    displayName:  p.name ?? p.personaname ?? `Player ${p.player_slot}`,
    heroId:       p.hero_id,
    heroName:     heroName(p.hero_id),
    kills:        p.kills,
    deaths:       p.deaths,
    assists:      p.assists,
    kda:          `${p.kills}/${p.deaths}/${p.assists}`,
    gpm:          p.gold_per_min,
    xpm:          p.xp_per_min,
    netWorth:     p.net_worth,
    heroDamage:   p.hero_damage,
    towerDamage:  p.tower_damage,
    heroHealing:  p.hero_healing,
    lastHits:     p.last_hits,
    denies:       p.denies,
    level:        p.level,
    _source: {
      account_id: p.account_id,
      player_slot: p.player_slot,
      hero_id: p.hero_id,
    },
  }))

  return {
    ...summary,
    draft,
    objectives,
    players,
    // Per-minute gold/XP advantage from Radiant's perspective.
    // Positive = Radiant ahead, negative = Dire ahead.
    goldAdvantage: raw.radiant_gold_adv ?? [],
    xpAdvantage:   raw.radiant_xp_adv   ?? [],
  }
}

// ── CLI runner ────────────────────────────────────────────────────────────────
// node pipeline/deterministic.mjs <match_id>

if (process.argv[1].endsWith('deterministic.mjs')) {
  const matchId = process.argv[2]
  if (!matchId) {
    console.error('Usage: node pipeline/deterministic.mjs <match_id>')
    process.exit(1)
  }

  process.stderr.write(`→ GET ${OD_BASE}/matches/${matchId}\n`)
  const res = await fetch(`${OD_BASE}/matches/${matchId}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()

  const intel = await generateMatchIntelligence(raw)

  // ── Pretty print ──
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('  Deterministic Match Intelligence')
  console.log('╚══════════════════════════════════════════════════════════╝')

  console.log(`\n  ${intel.radiant.name} vs ${intel.dire.name}`)
  console.log(`  ${intel.tournament.name} · ${intel.seriesType} · Patch ${intel.patch}`)
  console.log(`  Winner: ${intel.winner === 'radiant' ? intel.radiant.name : intel.dire.name}`)
  console.log(`  Duration: ${intel.duration}`)
  console.log(`  Started: ${intel.startedAt}`)

  console.log('\n── Draft ────────────────────────────────────────────────────')
  console.log('  Picks:')
  for (const p of intel.draft.picks) {
    console.log(`    [${p.order.toString().padStart(2)}]  ${p.side.padEnd(8)}  ${p.heroName}`)
  }
  console.log('  Bans:')
  for (const b of intel.draft.bans) {
    console.log(`    [${b.order.toString().padStart(2)}]  ${b.side.padEnd(8)}  ${b.heroName}`)
  }

  console.log('\n── Objectives ───────────────────────────────────────────────')
  for (const o of intel.objectives) {
    console.log(`  [${o.time}]  ${o.type.padEnd(12)}  ${o.detail}`)
  }

  console.log('\n── Players ──────────────────────────────────────────────────')
  const radiantPlayers = intel.players.filter(p => p.side === 'radiant')
  const direPlayers    = intel.players.filter(p => p.side === 'dire')
  for (const [label, group] of [['Radiant', radiantPlayers], ['Dire', direPlayers]]) {
    console.log(`\n  ${label}:`)
    for (const p of group) {
      const kda  = p.kda.padEnd(10)
      const gpm  = `${p.gpm}gpm`.padEnd(8)
      const xpm  = `${p.xpm}xpm`.padEnd(8)
      const nw   = `$${p.netWorth.toLocaleString()}`
      console.log(`    ${p.displayName.padEnd(20)}  ${p.heroName.padEnd(22)}  ${kda}  ${gpm}  ${xpm}  ${nw}`)
    }
  }

  console.log('\n── Gold Advantage (per minute, Radiant perspective) ─────────')
  const goldLine = intel.goldAdvantage
    .map((v, i) => `${i + 1}m:${v > 0 ? '+' : ''}${v}`)
    .join('  ')
  console.log(`  ${goldLine}`)

  console.log()
}

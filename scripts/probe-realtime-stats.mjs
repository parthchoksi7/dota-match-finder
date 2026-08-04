/**
 * GetRealtimeStats feasibility probe — validates the E1/E2 experiments from
 * .claude/specs/live-ingestion-investigation.md before any pipeline code is written.
 *
 * Does NOT touch production tables. Read-only against OpenDota + the Steam Web API.
 *
 * E1 (does it work / what does it return): single-shot mode reports field presence
 * against the schema documented in the investigation doc §1, so a NULL/MISSING field
 * is visible immediately instead of silently breaking a future differ.
 *
 * E2 (broadcast delay): --watch mode polls on an interval and timestamps every
 * game_time change, so the printed log can be manually cross-referenced against the
 * same match's Twitch VOD/live timestamp to measure real delay. This script cannot
 * measure delay on its own — it has no access to the broadcast — it just produces
 * the timestamped game_time series a human compares by hand.
 *
 * Usage:
 *   STEAM_API_KEY=xxx node scripts/probe-realtime-stats.mjs                  # first live tier-1 game, single shot
 *   STEAM_API_KEY=xxx node scripts/probe-realtime-stats.mjs <server_steam_id>  # specific game, single shot
 *   STEAM_API_KEY=xxx node scripts/probe-realtime-stats.mjs --watch [server_steam_id] [intervalSec]
 *
 * Requires STEAM_API_KEY — get one free at https://steamcommunity.com/dev/apikey
 * (tied to a Steam account; the account itself never needs to log in or run Dota —
 * this is the sanctioned Web API path, not the Game Coordinator path).
 */

import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const STEAM_API_KEY = process.env.STEAM_API_KEY
const OD_LIVE_URL = 'https://api.opendota.com/api/live'
const STEAM_REALTIME_URL = 'https://api.steampowered.com/IDOTA2MatchStats_570/GetRealtimeStats/v1/'

const FIXTURE_DIR = join(__dirname, '../__tests__/fixtures/realtime-stats')

if (!STEAM_API_KEY) {
  console.error('✗ STEAM_API_KEY not set. Get a free key at https://steamcommunity.com/dev/apikey')
  console.error('  Then: STEAM_API_KEY=xxx node scripts/probe-realtime-stats.mjs')
  process.exit(1)
}

async function findLiveTier1Game() {
  const res = await fetch(OD_LIVE_URL)
  if (!res.ok) throw new Error(`OpenDota /live HTTP ${res.status}`)
  const games = await res.json()
  const tier1 = games.filter(g => Number(g.league_id) > 0 && g.team_name_radiant && g.team_name_dire && g.server_steam_id)
  return tier1
}

async function fetchRealtimeStats(serverSteamId) {
  const url = `${STEAM_REALTIME_URL}?key=${STEAM_API_KEY}&server_steam_id=${serverSteamId}`
  const res = await fetch(url)
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`Steam API HTTP ${res.status}: ${bodyText.slice(0, 300)}`)
  }
  return JSON.parse(bodyText)
}

// ─── Field presence report (E1) ─────────────────────────────────────────────

const EXPECTED_MATCH_FIELDS = ['server_steam_id', 'match_id', 'game_time', 'game_state', 'league_id']
const EXPECTED_TEAM_FIELDS = ['team_number', 'team_id', 'team_name', 'score', 'net_worth', 'players']
const EXPECTED_PLAYER_FIELDS = [
  'accountid', 'playerid', 'name', 'heroid', 'level',
  'kill_count', 'death_count', 'assists_count', 'denies_count', 'lh_count',
  'gold', 'x', 'y', 'net_worth', 'abilities', 'items',
]
const EXPECTED_BUILDING_FIELDS = ['team', 'heading', 'type', 'lane', 'tier', 'x', 'y', 'destroyed']

function report(label, obj, expectedFields) {
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`)
  if (!obj) {
    console.log('  ✗ MISSING ENTIRELY')
    return
  }
  for (const f of expectedFields) {
    const v = obj[f]
    const status = v === undefined ? 'MISSING' : v === null ? 'NULL' : Array.isArray(v) ? `ARRAY[${v.length}]` : String(v).slice(0, 40)
    const badge = v === undefined ? '✗' : v === null ? '∅' : '✓'
    console.log(`  ${badge}  ${f.padEnd(16)} ${status}`)
  }
}

function runFieldReport(data) {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('  E1 — GetRealtimeStats field presence check')
  console.log('╚══════════════════════════════════════════════════════════╝')

  report('match', data.match, EXPECTED_MATCH_FIELDS)

  const teams = data.teams || []
  console.log(`\n  teams: ${teams.length} present (expect 2)`)
  teams.forEach((t, i) => report(`teams[${i}]`, t, EXPECTED_TEAM_FIELDS))

  const allPlayers = teams.flatMap(t => t.players || [])
  console.log(`\n  total players across teams: ${allPlayers.length} (expect 10)`)
  if (allPlayers[0]) report('players[0] (sample)', allPlayers[0], EXPECTED_PLAYER_FIELDS)

  const buildings = data.buildings || []
  console.log(`\n  buildings: ${buildings.length} present`)
  if (buildings[0]) report('buildings[0] (sample)', buildings[0], EXPECTED_BUILDING_FIELDS)
  const destroyed = buildings.filter(b => b.destroyed).length
  console.log(`  destroyed so far: ${destroyed}/${buildings.length}`)

  console.log(`\n  graph_data.graph_gold: ${Array.isArray(data.graph_data?.graph_gold) ? `${data.graph_data.graph_gold.length} points` : 'MISSING'}`)

  const missingCritical = []
  if (!data.match?.game_time && data.match?.game_time !== 0) missingCritical.push('match.game_time')
  if (allPlayers.length !== 10) missingCritical.push(`players (got ${allPlayers.length}, want 10)`)
  if (buildings.length === 0) missingCritical.push('buildings')

  console.log(`\n${'═'.repeat(60)}`)
  if (missingCritical.length === 0) {
    console.log('  ✓ E1 PASS — schema matches investigation doc, ready to build the differ')
  } else {
    console.log(`  ✗ E1 CONCERNS: ${missingCritical.join(', ')}`)
  }
  console.log('═'.repeat(60))
}

// ─── Watch mode (E2 prep — timestamped game_time series for manual delay check) ──

async function watchLoop(serverSteamId, intervalSec) {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const fixturePath = join(FIXTURE_DIR, `${serverSteamId}-${Date.now()}.jsonl`)
  console.log(`\n  Watching server_steam_id=${serverSteamId} every ${intervalSec}s`)
  console.log(`  Snapshots also written to ${fixturePath} (fixture material for E3's differ tests later)`)
  console.log('  Compare the wall_clock/game_time pairs below against the same moment on the official')
  console.log('  Twitch broadcast to measure real delay (E2). Ctrl+C to stop.\n')

  let lastGameTime = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wallClock = new Date().toISOString()
    try {
      const data = await fetchRealtimeStats(serverSteamId)
      const gt = data.match?.game_time
      const changed = gt !== lastGameTime
      console.log(`  [${wallClock}]  game_state=${data.match?.game_state}  game_time=${gt}${changed ? '' : '  (unchanged)'}`)
      writeFileSync(fixturePath, JSON.stringify({ wall_clock: wallClock, data }) + '\n', { flag: 'a' })
      lastGameTime = gt
      if (data.match?.game_state && data.match.game_state >= 5 /* heuristic: post-game */) {
        console.log('\n  game_state suggests the match may have ended — stopping watch.')
        break
      }
    } catch (err) {
      console.log(`  [${wallClock}]  ✗ ${err.message}`)
    }
    await new Promise(r => setTimeout(r, intervalSec * 1000))
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const watchMode = args.includes('--watch')
  const positional = args.filter(a => a !== '--watch')

  let serverSteamId = positional[0]
  const intervalSec = Number(positional[1]) || 10

  if (!serverSteamId || !/^\d+$/.test(serverSteamId)) {
    console.log('  No server_steam_id given — looking up a live Tier 1 game from OpenDota...')
    const tier1 = await findLiveTier1Game()
    if (tier1.length === 0) {
      console.log('  ✗ No live Tier 1 games found right now. Pass a server_steam_id manually, or retry later.')
      process.exit(1)
    }
    console.log(`  Found ${tier1.length} live Tier 1 game(s):`)
    tier1.forEach(g => console.log(`    league ${g.league_id}  ${g.team_name_radiant} vs ${g.team_name_dire}  server_steam_id=${g.server_steam_id}  game_time=${g.game_time}`))
    serverSteamId = tier1[0].server_steam_id
    console.log(`\n  → Using ${tier1[0].team_name_radiant} vs ${tier1[0].team_name_dire} (server_steam_id=${serverSteamId})`)
  }

  if (watchMode) {
    await watchLoop(serverSteamId, intervalSec)
    return
  }

  const data = await fetchRealtimeStats(serverSteamId)
  runFieldReport(data)

  mkdirSync(FIXTURE_DIR, { recursive: true })
  const fixturePath = join(FIXTURE_DIR, `single-shot-${serverSteamId}-${Date.now()}.json`)
  writeFileSync(fixturePath, JSON.stringify(data, null, 2))
  console.log(`\n  Full raw response saved to ${fixturePath}`)
}

main().catch(err => {
  console.error('\n✗ Error:', err.message)
  process.exit(1)
})

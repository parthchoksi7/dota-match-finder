/**
 * OpenDota ingestion probe
 *
 * Fetches recent Tier 1 pro matches (using the existing getPremiumLeagueIds filter
 * from api/_shared.js) and drills into a match or full series to document exactly
 * which fields are available for the intelligence pipeline.
 *
 * Usage:
 *   node scripts/probe-od-match.mjs                  # latest Tier 1 match
 *   node scripts/probe-od-match.mjs <match_id>       # inspect a specific match
 *   node scripts/probe-od-match.mjs --series <id>    # fetch all games in a series
 */

import { buildPremiumLeagueIds } from '../api/_shared.js'

const OD_BASE = 'https://api.opendota.com/api'
const RATE_LIMIT_MS = 1000 // OD free tier: 1 req/sec to be safe

const args = process.argv.slice(2)
const seriesFlag = args.indexOf('--series')
const seriesIdArg = seriesFlag !== -1 ? args[seriesFlag + 1] : null
const matchIdArg = seriesFlag === -1 ? args[0] : null

async function get(path) {
  const url = `${OD_BASE}${path}`
  process.stderr.write(`→ GET ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fieldReport(obj, prefix = '') {
  const report = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v === null)            report.push({ field: key, status: 'NULL',    value: null })
    else if (v === undefined)  report.push({ field: key, status: 'MISSING', value: undefined })
    else if (Array.isArray(v)) report.push({ field: key, status: 'ARRAY',   value: `[${v.length} items]` })
    else if (typeof v === 'object') report.push({ field: key, status: 'OBJECT', value: '{…}' })
    else                       report.push({ field: key, status: 'OK',      value: v })
  }
  return report
}

function printSection(title, rows) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
  for (const { field, status, value } of rows) {
    const pad = field.padEnd(38)
    const badge = status === 'OK' ? '✓' : status === 'NULL' ? '∅' : status === 'MISSING' ? '✗' : '~'
    console.log(`  ${badge}  ${pad} ${String(value ?? '').slice(0, 60)}`)
  }
}

function checkField(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

// ─── Pipeline field requirements ─────────────────────────────────────────────
// These are the fields the intelligence pipeline depends on.
// Any NULL or MISSING here needs a mitigation plan.

const REQUIRED_FIELDS = [
  // Match summary
  'match_id', 'radiant_win', 'duration', 'start_time',
  'patch', 'game_mode', 'league.leagueid', 'league.name',
  'series_id', 'series_type',
  'radiant_team.name', 'radiant_team.team_id',
  'dire_team.name', 'dire_team.team_id',

  // Draft
  'picks_bans',

  // Objectives (Roshan, towers, barracks)
  'objectives',

  // Net worth / gold advantage
  'radiant_gold_adv', 'radiant_xp_adv',

  // Players
  'players',
]

const PLAYER_FIELDS = [
  'account_id', 'name', 'personaname',
  'hero_id', 'team_number',
  'kills', 'deaths', 'assists',
  'gold_per_min', 'xp_per_min',
  'hero_damage', 'tower_damage', 'hero_healing',
  'last_hits', 'denies',
  'level', 'net_worth',
  'purchase_log', 'item_0',
]

// ─── Series mode ─────────────────────────────────────────────────────────────

async function probeSeriesGames(seriesId) {
  console.log(`\n── Fetching all games in series ${seriesId} ─────────────────`)
  const proMatches = await get('/proMatches')
  await sleep(RATE_LIMIT_MS)

  const games = proMatches.filter(m => String(m.series_id) === String(seriesId))
  if (games.length === 0) {
    console.log('  ⚠️  No games found for this series_id in /proMatches')
    console.log('  Note: /proMatches only returns ~100 most recent matches. Older series may not appear.')
    return
  }

  console.log(`  Found ${games.length} game(s):`)
  for (const g of games) {
    const date = new Date(g.start_time * 1000).toISOString().split('T')[0]
    const radiant = g.radiant_name ?? '?'
    const dire    = g.dire_name    ?? '?'
    const winner  = g.radiant_win ? radiant : dire
    console.log(`  [${g.match_id}]  ${date}  ${radiant} vs ${dire}  →  ${winner} won  (${Math.floor(g.duration / 60)}m)`)
  }
  console.log('\n  → Re-run with each match_id to inspect individual games.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('  OpenDota Ingestion Probe')
  console.log('╚══════════════════════════════════════════════════════════╝')

  // Series mode — list all games in a series
  if (seriesIdArg) {
    await probeSeriesGames(seriesIdArg)
    return
  }

  let targetMatchId = matchIdArg ? parseInt(matchIdArg, 10) : null

  if (!targetMatchId) {
    // Fetch premium league IDs (same filter the site uses)
    console.log('\n  Loading Tier 1 league filter from OpenDota...')
    const leagues = await get('/leagues')
    await sleep(RATE_LIMIT_MS)
    const premiumIds = buildPremiumLeagueIds(leagues)
    console.log(`  Tier 1 leagues: ${premiumIds.size} premium IDs loaded`)

    const proMatches = await get('/proMatches')
    await sleep(RATE_LIMIT_MS)

    // Filter to Tier 1 only
    const tier1Matches = proMatches.filter(m => premiumIds.has(m.leagueid))

    console.log(`\n── Recent Tier 1 Matches (${tier1Matches.length} of ${proMatches.length} total) ──`)
    for (const m of tier1Matches.slice(0, 10)) {
      const date = new Date(m.start_time * 1000).toISOString().split('T')[0]
      const radiant = m.radiant_name ?? m.radiant_team_id ?? '(no team)'
      const dire    = m.dire_name    ?? m.dire_team_id    ?? '(no team)'
      const winner  = m.radiant_win ? radiant : dire
      console.log(`  [${m.match_id}]  ${date}  ${radiant} vs ${dire}  →  ${winner} won  (${Math.floor(m.duration / 60)}m)  league: ${m.league_name ?? m.leagueid}`)
    }

    const withTeams = tier1Matches.find(m => m.radiant_name && m.dire_name)
    targetMatchId = (withTeams ?? tier1Matches[0])?.match_id
    if (!targetMatchId) {
      console.log('\n  ⚠️  No Tier 1 matches found in recent /proMatches — try passing a match_id directly.')
      return
    }
    console.log(`\n  → Probing match ${targetMatchId}`)
  }

  // 2. Fetch full match detail
  await sleep(RATE_LIMIT_MS)
  const match = await get(`/matches/${targetMatchId}`)

  // 3. Required field check
  const requiredReport = REQUIRED_FIELDS.map(path => {
    const val = checkField(match, path)
    const status = val === null ? 'NULL' : val === undefined ? 'MISSING' : Array.isArray(val) ? 'ARRAY' : typeof val === 'object' ? 'OBJECT' : 'OK'
    return { field: path, status, value: Array.isArray(val) ? `[${val.length} items]` : val }
  })
  printSection('Required Pipeline Fields', requiredReport)

  const missing = requiredReport.filter(r => r.status === 'NULL' || r.status === 'MISSING')
  if (missing.length > 0) {
    console.log(`\n  ⚠️  ${missing.length} required field(s) absent: ${missing.map(r => r.field).join(', ')}`)
  } else {
    console.log('\n  ✓ All required fields present')
  }

  // 4. Player field check (first player as sample)
  if (Array.isArray(match.players) && match.players.length > 0) {
    const p = match.players[0]
    const playerReport = PLAYER_FIELDS.map(f => {
      const val = p[f]
      const status = val === null ? 'NULL' : val === undefined ? 'MISSING' : Array.isArray(val) ? 'ARRAY' : 'OK'
      return { field: f, status, value: Array.isArray(val) ? `[${val.length} items]` : val }
    })
    printSection(`Player Fields (sample: players[0] — ${p.name ?? p.personaname ?? p.account_id})`, playerReport)
  }

  // 5. Objectives breakdown
  if (Array.isArray(match.objectives) && match.objectives.length > 0) {
    // Categorise objective types seen — surfaces new mechanics (e.g. Tormentor)
    const typeCounts = {}
    for (const obj of match.objectives) typeCounts[obj.type] = (typeCounts[obj.type] ?? 0) + 1

    console.log(`\n${'─'.repeat(60)}`)
    console.log('  Objective Types (full breakdown)')
    console.log('─'.repeat(60))
    const KNOWN_TYPES = {
      'building_kill': 'tower/barracks/ancient',
      'CHAT_MESSAGE_ROSHAN_KILL': 'Roshan kill',
      'CHAT_MESSAGE_AEGIS': 'Aegis pickup',
      'CHAT_MESSAGE_FIRSTBLOOD': 'First blood',
      'CHAT_MESSAGE_COURIER_LOST': 'Courier kill',
      'CHAT_MESSAGE_MINIBOSS_KILL': 'Tormentor kill ⚠️ new mechanic',
    }
    for (const [type, count] of Object.entries(typeCounts)) {
      const label = KNOWN_TYPES[type] ?? '❓ UNKNOWN TYPE — add to pipeline parser'
      console.log(`  ${String(count).padStart(3)}×  ${type.padEnd(38)} ${label}`)
    }

    console.log('\n  Objectives timeline (first 15):')
    for (const obj of match.objectives.slice(0, 15)) {
      const t = `${Math.floor(obj.time / 60)}:${String(obj.time % 60).padStart(2, '0')}`
      console.log(`  [${t}]  type=${obj.type}  team=${obj.team ?? '?'}  ${JSON.stringify(obj).slice(0, 80)}`)
    }
  } else {
    console.log('\n  ⚠️  objectives: empty or missing — replay parse may not be complete yet')
  }

  // 6. Picks/bans
  if (Array.isArray(match.picks_bans) && match.picks_bans.length > 0) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log('  Draft (picks_bans)')
    console.log('─'.repeat(60))
    for (const pb of match.picks_bans) {
      const action = pb.is_pick ? 'PICK' : 'BAN '
      const side   = pb.team === 0 ? 'Radiant' : 'Dire   '
      console.log(`  ${action}  ${side}  hero_id=${pb.hero_id}  order=${pb.order}`)
    }
  } else {
    console.log('\n  ⚠️  picks_bans: empty or missing')
  }

  // 7. Net worth graph availability
  const hasGoldAdv = Array.isArray(match.radiant_gold_adv) && match.radiant_gold_adv.length > 0
  const hasXpAdv   = Array.isArray(match.radiant_xp_adv)   && match.radiant_xp_adv.length   > 0
  console.log(`\n${'─'.repeat(60)}`)
  console.log('  Gold / XP Advantage Arrays')
  console.log('─'.repeat(60))
  console.log(`  radiant_gold_adv  ${hasGoldAdv ? `✓ [${match.radiant_gold_adv.length} data points]` : '✗ missing — replay parse incomplete'}`)
  console.log(`  radiant_xp_adv    ${hasXpAdv   ? `✓ [${match.radiant_xp_adv.length} data points]`   : '✗ missing — replay parse incomplete'}`)

  // 8. Summary
  console.log(`\n${'═'.repeat(60)}`)
  console.log('  Summary')
  console.log('═'.repeat(60))
  console.log(`  match_id       ${match.match_id}`)
  console.log(`  radiant        ${match.radiant_team?.name ?? '(unnamed)'}`)
  console.log(`  dire           ${match.dire_team?.name ?? '(unnamed)'}`)
  console.log(`  winner         ${match.radiant_win ? 'Radiant' : 'Dire'}`)
  console.log(`  duration       ${Math.floor(match.duration / 60)}m ${match.duration % 60}s`)
  console.log(`  patch          ${match.patch ?? 'NULL — not yet parsed'}`)
  console.log(`  players        ${match.players?.length ?? 0}`)
  console.log(`  objectives     ${match.objectives?.length ?? 0}`)
  console.log(`  picks_bans     ${match.picks_bans?.length ?? 0}`)
  console.log(`  replay parsed  ${hasGoldAdv ? 'yes' : 'no — enriched fields absent'}`)
  console.log()
}

main().catch(err => {
  console.error('\n✗ Error:', err.message)
  process.exit(1)
})

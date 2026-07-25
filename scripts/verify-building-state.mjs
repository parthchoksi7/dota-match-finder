/**
 * Live Story R4.0 — building_state decode verification spike.
 *
 * OpenDota /live exposes `building_state` as an integer bitmask on every live game
 * (captured raw into live_game_map by api/_handlers/liveOdCapture.js since 2026-07-19 —
 * no decode at capture). This script empirically verifies what the bits mean before any
 * decoder ships, per the R4.0 gate in .claude/specs/live-story-r4-*.md: docs are a
 * hypothesis to test, not a spec to implement (same rigor as the team===0/1 draft-side
 * verification, 2026-07-16).
 *
 * Two modes:
 *
 *   node scripts/verify-building-state.mjs
 *     Static cross-check: for every od_match_id in live_game_map with a non-null
 *     building_state, fetch the completed match from OD /matches/{id} and cross-reference
 *     the captured game_time against the exact building_kill objectives timeline (each
 *     event names the destroyed building + exact time — ground truth, unlike the coarser
 *     post-game tower_status/barracks_status snapshot). Reports whether popcount(building_state)
 *     tracks the count of towers destroyed at/before the captured game_time.
 *
 *   node scripts/verify-building-state.mjs --watch <od_match_id> [--rounds N] [--interval S]
 *     Dynamic flip-check: polls OD /live directly (NOT live_game_map, which is upsert-only
 *     and holds no history) for one live match, diffing building_state between polls to
 *     catch individual bit transitions. This is the only way to observe which bit(s) move
 *     when a specific tower falls — a single end-state snapshot cannot disentangle that.
 *
 * Findings — RESOLVED 2026-07-24 (superseding the 2026-07-20 "inconclusive" pass below).
 *
 * First pass (2026-07-20, EPL Masters, via this script's static mode): capture proven
 * end-to-end, but the naive "popcount == towers destroyed" hypothesis failed (5/16 games),
 * and a --watch session caught non-monotonic single-bit transitions inconsistent with any
 * flat per-building bitmask. That ruled out the flat-mask model without replacing it.
 *
 * The actual crack did NOT come from this script. It came from offline analysis of the
 * dense per-game `building_state` timeseries that accretes passively in `live_game_gold`
 * (added 2026-07-21, see CONTEXT.md) — 885 points across 47 games by 2026-07-24. Diffing
 * consecutive points showed the bits cluster into two 9-bit blocks (bits 0-8, bits 16-24,
 * gap at 11-15) that are each three independent 3-bit binary counters (one per lane), not
 * one-hot flags — the earlier "non-monotonic flip" was that counter incrementing.
 *
 * CONFIRMED: standingTowers = clamp(4 - raw, 0, 3) per lane (bits 0-2/3-5/6-8 = Radiant
 * top/mid/bot; bits 16-18/19-21/22-24 = Dire, mirrored +16). Verified 46/47 exact on BOTH
 * sides against real OD building_kill timestamps across all 47 games. Barracks are
 * confirmed NOT decodable from this field (disproved, not just unresolved — see CONTEXT.md).
 * Bits 9-10/25-26 remain an unidentified "extra" field per side, doesn't overlap the lane
 * bits, not investigated further (out of R4.1 scope). Full writeup: CONTEXT.md, search
 * "R4.0 decode spike". Phase C (the decoder, `api/_buildingState.js`, wired into
 * liveGamePulse.js's owner-gated `pulse.objectives`) shipped 2026-07-24.
 *
 * This script (static popcount diff + --watch flip logger) is kept for reference/future
 * spikes but was NOT the tool that solved this one — the passive live_game_gold timeseries
 * was. See risk #1 in .claude/specs/live-story-r4-implementation-plan.md for that lesson.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { appendFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Append-only raw-snapshot log for offline bit-correlation analysis, accumulated across every
// --watch session (live building_state timeseries is the ONLY way to see which bit moves when a
// building falls — live_game_map is upsert-only and keeps no history). Gitignored; override with
// --out <path>. Each line: { ts, od_match_id, radiant_name, dire_name, game_time, building_state,
// spectators, source }.
const DEFAULT_SAMPLES_FILE = join(__dirname, 'building-state-samples.jsonl')

const OD_BASE = 'https://api.opendota.com/api'
// A browser-like UA avoids OpenDota's Cloudflare bot protection 403ing rapid unauthenticated
// requests — the same failure class documented in api/summarize.js's getMatchData().
const OD_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; SpectateEsportsBot/1.0)' }
const OD_RATE_LIMIT_MS = 1200

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function odGet(path) {
  const res = await fetch(`${OD_BASE}${path}`, { headers: OD_HEADERS })
  if (!res.ok) throw new Error(`OD ${path} -> HTTP ${res.status}`)
  return res.json()
}

// Number-safe bit extraction. JS bitwise ops (`1 << i`, `n & m`) coerce to 32-bit signed
// ints, so `1 << 32` wraps to `1 << 0` and re-detects low bits as phantom high bits — a real
// bug this script hit before the fix. building_state can exceed 31 bits (and defensively could
// approach 34), so test each bit via division, which is exact for integers up to 2^53.
function setBits(n) {
  const bits = []
  for (let i = 0; i < 40; i++) if (Math.floor(n / 2 ** i) % 2 === 1) bits.push(i)
  return bits
}

// ─── Static mode: cross-check captured building_state against the OD objectives ground truth ──

async function runStatic() {
  const { data: rows, error } = await supabase
    .from('live_game_map')
    .select('od_match_id, game_time, building_state, radiant_name, dire_name, captured_at')
    .not('building_state', 'is', null)
    .order('captured_at', { ascending: false })

  if (error) throw error
  if (!rows || rows.length === 0) {
    console.log('No captured building_state rows yet — nothing to verify. Wait for a live tier-1 game.')
    return
  }

  console.log(`${rows.length} captured row(s) with building_state. Checking which are completed+indexed...\n`)

  let checked = 0
  for (const row of rows) {
    await sleep(OD_RATE_LIMIT_MS)
    let match
    try {
      match = await odGet(`/matches/${row.od_match_id}`)
    } catch (err) {
      console.log(`  [${row.od_match_id}] OD fetch failed: ${err.message} — skipping`)
      continue
    }
    if (!match || match.error || match.duration == null) {
      console.log(`  [${row.od_match_id}] not yet indexed — skip (captured gt=${row.game_time})`)
      continue
    }

    checked++
    const bs = row.building_state
    const bits = setBits(bs)
    const objectives = (match.objectives || []).filter(o => o.type === 'building_kill')
    const towerEventsAtCapture = objectives.filter(
      o => /tower/.test(o.key) && o.time <= row.game_time
    )
    const rax = objectives.filter(o => /rax/.test(o.key) && o.time <= row.game_time)
    const fort = objectives.find(o => /fort/.test(o.key) && o.time <= row.game_time)

    const match_ok = bits.length === towerEventsAtCapture.length

    console.log(`${'='.repeat(70)}`)
    console.log(`[${row.od_match_id}] ${row.radiant_name} vs ${row.dire_name}`)
    console.log(`  captured game_time=${row.game_time}s (match duration=${match.duration}s)`)
    console.log(`  building_state=${bs}  popcount=${bits.length}  set bits=[${bits.join(',')}]`)
    console.log(`  tower/tower4 building_kill events at/before capture: ${towerEventsAtCapture.length}`)
    console.log(`  barracks fallen at/before capture: ${rax.length}  |  fort fallen: ${fort ? 'yes' : 'no'}`)
    console.log(`  ${match_ok ? '✓ MATCH' : '✗ MISMATCH'} — popcount ${match_ok ? '==' : '!='} tower-kill count`)
    if (!match_ok) {
      console.log(`  towers destroyed: ${towerEventsAtCapture.map(o => o.key.replace(/npc_dota_(good|bad)guys_/, '')).join(', ')}`)
    }
  }

  console.log(`\n${checked} game(s) checked against post-game ground truth.`)
  if (checked < 5) {
    console.log('Fewer than 5 samples — keep accumulating before treating the aggregate finding as settled.')
  }
}

// ─── Watch mode: poll OD /live directly to catch individual bit transitions ─────────────────

async function runWatch(matchId, rounds, intervalS, outFile) {
  const leagueOnly = g =>
    g && Number(g.league_id) > 0 && g.match_id && String(g.match_id) !== '0' &&
    g.team_name_radiant && g.team_name_dire
  const scope = matchId ? `od_match_id=${matchId}` : 'ALL live league games'
  console.log(`Watching ${scope} for ${rounds} rounds @ ${intervalS}s (~${Math.round(rounds * intervalS / 60)} min)`)
  console.log(`Persisting every snapshot to ${outFile}\n`)

  const prev = new Map() // od_match_id -> { bs, gt }
  let written = 0, flips = 0
  for (let i = 0; i < rounds; i++) {
    let games
    try {
      games = await odGet('/live')
    } catch (err) {
      console.log(`[${new Date().toISOString().slice(11, 19)}] /live fetch failed: ${err.message} — retry next round`)
      if (i < rounds - 1) await sleep(intervalS * 1000)
      continue
    }
    const watched = (games || []).filter(leagueOnly).filter(g => !matchId || String(g.match_id) === String(matchId))
    const wall = new Date().toISOString()
    const ts = wall.slice(11, 19)

    if (watched.length === 0) {
      console.log(`[${ts}] no ${matchId ? 'matching' : 'live league'} game in /live${matchId ? ' (ended or dropped)' : ''}`)
    }
    for (const g of watched) {
      const id = String(g.match_id)
      const bs = g.building_state
      const gt = g.game_time
      // Persist raw — one JSONL line per game per round. Offline analysis dedups by (id, game_time).
      appendFileSync(outFile, JSON.stringify({
        ts: wall, od_match_id: id, radiant_name: g.team_name_radiant, dire_name: g.team_name_dire,
        game_time: gt, building_state: bs, spectators: g.spectators ?? null, source: 'watch',
      }) + '\n')
      written++
      const p = prev.get(id)
      if (p && p.bs !== bs) {
        flips++
        const oldBits = new Set(setBits(p.bs))
        const newBits = new Set(setBits(bs))
        const on = [...newBits].filter(b => !oldBits.has(b)).sort((a, b) => a - b)
        const off = [...oldBits].filter(b => !newBits.has(b)).sort((a, b) => a - b)
        console.log(`[${ts}] *** FLIP *** ${g.team_name_radiant} vs ${g.team_name_dire}  gt ${p.gt}->${gt}  bs ${p.bs}->${bs}  ON:[${on}] OFF:[${off}]`)
      } else if (!matchId) {
        console.log(`[${ts}] ${id} gt=${gt} bs=${bs} (${g.team_name_radiant} vs ${g.team_name_dire})`)
      } else {
        console.log(`[${ts}] gt=${gt} bs=${bs} (${g.team_name_radiant} vs ${g.team_name_dire})`)
      }
      prev.set(id, { bs, gt })
    }
    if (i < rounds - 1) await sleep(intervalS * 1000)
  }
  console.log(`\n--- watch complete: ${written} snapshot(s), ${flips} flip(s) written to ${outFile} ---`)
  console.log('Cross-reference FLIP wall-clock timestamps against the broadcast VOD to confirm which')
  console.log('specific building fell at that moment — that is what nails exact bit identity.')
}

// ─── Entry ────────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : def
}
const watchIdx = args.indexOf('--watch')

if (watchIdx !== -1) {
  // matchId is optional: `--watch` alone (or `--watch all`) records EVERY live league game.
  // A bare od_match_id may follow --watch, but only if it isn't itself another flag.
  const next = args[watchIdx + 1]
  const matchId = next && !next.startsWith('--') && next !== 'all' ? next : null
  const rounds = parseInt(flag('--rounds', '20'), 10)
  const intervalS = parseInt(flag('--interval', '25'), 10)
  const outFile = flag('--out', DEFAULT_SAMPLES_FILE)
  await runWatch(matchId, rounds, intervalS, outFile)
} else {
  await runStatic()
}

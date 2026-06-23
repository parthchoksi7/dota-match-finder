/**
 * One-time backfill — fix corrupt per-game VOD offsets.
 *
 * Bug: api/match-streams.js used to persist every sibling game of a series with a single
 * shared `started_at` (the clicked game's ts), so games 2/3 inherited game 1's timestamp
 * and got game 1's VOD offset. (api/match-streams.js now writes per-game started_at — this
 * script repairs rows written before that fix.)
 *
 * Fix: find series (ps_match_id) where 2+ games share an identical `started_at`, look up
 * each game's authoritative start time from OpenDota (od_match_id → match.start_time),
 * write the corrected `started_at`, and null the vod_* fields so the normal `vod-enrich`
 * job re-resolves the offset against the correct time. Also clears any match_stream_vods
 * rows for affected games so they re-seed with corrected times.
 *
 *   node scripts/backfill-vod-offsets.mjs            # apply
 *   node scripts/backfill-vod-offsets.mjs --dry-run  # report only
 *   LOOKBACK_DAYS=60 node scripts/backfill-vod-offsets.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('backfill: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — aborting.')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const OD_BASE = 'https://api.opendota.com/api'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 60)
const OD_DELAY_MS = 1200 // OpenDota free tier ≈ 60 req/min — stay safely under
const DRY_RUN = process.argv.includes('--dry-run')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchOdStartTime(odMatchId) {
  const res = await fetch(`${OD_BASE}/matches/${odMatchId}`)
  if (!res.ok) throw new Error(`OD ${res.status}`)
  const data = await res.json()
  return typeof data?.start_time === 'number' ? data.start_time : null
}

async function main() {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000).toISOString()

  // Pass 1: rows with a known PS series — group by ps_match_id.
  const { data: psRows, error: psErr } = await supabase
    .from('match_stream_history')
    .select('od_match_id, ps_match_id, team_a, team_b, started_at, channel')
    .not('ps_match_id', 'is', null)
    .gte('started_at', cutoff)
    .order('ps_match_id', { ascending: false })
    .limit(5000)
  if (psErr) { console.error('query failed (ps rows):', psErr.message); process.exit(1) }

  // Pass 2: rows with no PS match (ts-fallback path) — group by (team_a, team_b, day).
  // These are produced by the warm-streams cron when PandaScore has no record of the series.
  const { data: noPs, error: noPsErr } = await supabase
    .from('match_stream_history')
    .select('od_match_id, ps_match_id, team_a, team_b, started_at, channel')
    .is('ps_match_id', null)
    .not('team_a', 'is', null)
    .not('team_b', 'is', null)
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(5000)
  if (noPsErr) { console.error('query failed (no-ps rows):', noPsErr.message); process.exit(1) }

  const suspects = []

  // Group ps rows by series id
  const byseries = {}
  for (const r of psRows) (byseries[r.ps_match_id] ||= []).push(r)
  for (const games of Object.values(byseries)) {
    if (games.length < 2) continue
    const counts = {}
    for (const g of games) counts[g.started_at] = (counts[g.started_at] || 0) + 1
    for (const g of games) if (counts[g.started_at] > 1) suspects.push(g)
  }

  // Group no-ps rows by (team_a, team_b, date) — same pair on the same UTC day = same series
  const byteam = {}
  for (const r of noPs) {
    const day = (r.started_at || '').slice(0, 10)
    const key = `${r.team_a?.toLowerCase()}|${r.team_b?.toLowerCase()}|${day}`
    ;(byteam[key] ||= []).push(r)
  }
  for (const games of Object.values(byteam)) {
    if (games.length < 2) continue
    const counts = {}
    for (const g of games) counts[g.started_at] = (counts[g.started_at] || 0) + 1
    for (const g of games) if (counts[g.started_at] > 1) suspects.push(g)
  }

  const totalScanned = psRows.length + noPs.length
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${totalScanned} rows scanned (${psRows.length} with PS, ${noPs.length} without), ${suspects.length} suspect game row(s) (shared started_at within a series)\n`)

  let fixed = 0, unchanged = 0, failed = 0
  for (const g of suspects) {
    const tag = `match ${g.od_match_id} (ps ${g.ps_match_id})`
    let odStart
    try {
      odStart = await fetchOdStartTime(g.od_match_id)
    } catch (err) {
      console.log(`  fail   ${tag}: ${err.message}`)
      failed++
      await sleep(OD_DELAY_MS)
      continue
    }
    if (odStart == null) {
      console.log(`  skip   ${tag}: OD has no start_time`)
      failed++
      await sleep(OD_DELAY_MS)
      continue
    }
    const odIso = new Date(odStart * 1000).toISOString()
    const same = new Date(g.started_at).getTime() === odStart * 1000
    if (same) {
      console.log(`  ok     ${tag}: already correct (${odIso})`)
      unchanged++
      await sleep(OD_DELAY_MS)
      continue
    }

    console.log(`  ${DRY_RUN ? 'would fix' : 'fix     '} ${tag}: ${g.started_at} → ${odIso}`)
    if (!DRY_RUN) {
      // Correct the time + reset VOD fields so vod-enrich re-resolves the offset.
      const { error: upErr } = await supabase
        .from('match_stream_history')
        .update({ started_at: odIso, twitch_vod_id: null, vod_offset_s: null, vod_resolved_at: null, vod_checked_at: null, vod_available: null })
        .eq('od_match_id', g.od_match_id)
      if (upErr) { console.log(`         ^ msh update failed: ${upErr.message}`); failed++; await sleep(OD_DELAY_MS); continue }
      // Clear alt-channel rows so they re-seed with the corrected started_at.
      await supabase.from('match_stream_vods').delete().eq('od_match_id', g.od_match_id)
        .then(({ error: e }) => { if (e) console.log(`         ^ msv delete failed: ${e.message}`) })
    }
    fixed++
    await sleep(OD_DELAY_MS)
  }

  console.log(`\nDone: ${fixed} ${DRY_RUN ? 'would be ' : ''}fixed, ${unchanged} already correct, ${failed} failed/skipped`)
  console.log('Next: run `npm run vod-enrich` (or wait for the cron) to re-resolve corrected rows.')
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1) })

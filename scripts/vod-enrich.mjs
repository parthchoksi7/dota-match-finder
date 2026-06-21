/**
 * VOD enrichment — Phase 1A of the VOD History feature.
 *
 * Resolves twitch_vod_id / vod_offset_s for completed match_stream_history rows and
 * persists them, so the "Watch VOD" surface has durable data that outlives the KV cache.
 *
 * IMPORTANT — does NOT touch the LOCKED VOD Replay System. It does not reimplement the
 * Helix VOD-window lookup. Instead it calls the existing, battle-tested resolver
 * (`/api/match-streams?mode=twitch-vod&channel=&ts=`) and parses its returned URL. That
 * resolver owns all cache keys, TTLs, the +600 pre-game buffer, and the live-miss fallback.
 * This script only reads/writes Supabase. See ".claude/claude_instructions_template.md"
 * (VOD Replay System — LOCKED) and ".claude/vod-history-spec.md".
 *
 * Per invocation: processes up to BATCH unresolved rows from the last 60 days
 * (Twitch archive VODs expire ~60 days, so older rows are unrecoverable).
 *
 * Miss handling:
 *   - resolver returns a VOD url           → write twitch_vod_id, vod_offset_s, vod_resolved_at, vod_available=true
 *   - miss, broadcast still live           → bump vod_checked_at only (VOD not published yet; retry next run)
 *   - miss, match < GRACE_HOURS old        → bump vod_checked_at only (Twitch indexing lag; retry next run)
 *   - miss, match older than GRACE_HOURS    → set vod_available=false (deleted/muted/no-VOD; stop retrying)
 *
 * Run from repo root:
 *   node scripts/vod-enrich.mjs            # or: npm run vod-enrich
 *   node scripts/vod-enrich.mjs --dry-run  # resolve + report, write nothing
 *   BATCH=50 node scripts/vod-enrich.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { classifyResolution, buildVodSeedRows } from './_vod-enrich-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

// Exit cleanly (no-op) when creds are absent so the scheduled GitHub Action doesn't
// fail-and-alert every run before the repo secrets are configured.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('vod-enrich: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping (no-op).')
  process.exit(0)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const API_BASE = (process.env.VOD_ENRICH_API_BASE || 'https://spectateesports.live').replace(/\/$/, '')
const BATCH = Number(process.env.BATCH || 20)        // rows per invocation (Twitch rate-limit headroom)
const SEED_DAYS = Number(process.env.SEED_DAYS || 7) // recent window scanned to seed per-channel rows
const LOOKBACK_DAYS = 60                              // Twitch archive VODs expire ~60 days
const GRACE_HOURS = 24                                // wait this long before marking a miss unavailable
const REQUEST_DELAY_MS = 400                          // gentle pacing between resolver calls
const DRY_RUN = process.argv.includes('--dry-run')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function resolveVod(channel, startedAtUnix) {
  const params = new URLSearchParams({ mode: 'twitch-vod', channel, ts: String(startedAtUnix) })
  const res = await fetch(`${API_BASE}/api/match-streams?${params}`)
  if (!res.ok) throw new Error(`resolver ${res.status}`)
  return res.json() // { url, channel, startedAt } on hit | { url:null, channel, live } on miss
}

// Resolve one (channel, started_at) via the LOCKED resolver and classify the outcome.
// Returns { outcome, update?, label } — update is the DB patch to apply (table-agnostic).
async function resolveRow(channel, started_at) {
  const startedUnix = Math.floor(new Date(started_at).getTime() / 1000)
  const ageHours = (Date.now() - new Date(started_at).getTime()) / 3_600_000
  let data
  try {
    data = await resolveVod(channel, startedUnix)
  } catch (err) {
    return { outcome: 'fail', label: `fail: ${err.message}` }
  }
  const r = classifyResolution(data, ageHours, { graceHours: GRACE_HOURS })
  if (r.outcome === 'resolved') return { outcome: 'resolved', update: r.update, label: `resolve → vod ${r.vodId} @ ${r.offset}s` }
  if (r.outcome === 'pending') return { outcome: 'pending', update: r.update, label: data.live ? 'pending (channel live)' : `pending (${ageHours.toFixed(1)}h < ${GRACE_HOURS}h grace)` }
  if (r.outcome === 'unavailable') return { outcome: 'unavailable', update: r.update, label: 'unavailable (no VOD past grace)' }
  return { outcome: 'fail', label: `fail: ${r.error}` }
}

const emptyCounts = () => ({ resolved: 0, pending: 0, unavailable: 0, failed: 0 })

// ── Pass 1: main channel (match_stream_history) ─ existing behavior, unchanged outputs.
async function enrichMainChannels() {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('match_stream_history')
    .select('id, od_match_id, channel, started_at')
    .is('twitch_vod_id', null)
    .not('vod_available', 'is', false) // skip rows already marked permanently unavailable
    .not('channel', 'is', null)
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(BATCH)
  if (error) { console.error('main: supabase query failed:', error.message); process.exit(1) }

  console.log(`\n[main channel] ${DRY_RUN ? '[DRY RUN] ' : ''}${rows.length} unresolved row(s) (last ${LOOKBACK_DAYS}d, batch ${BATCH})`)
  const c = emptyCounts()
  for (const row of rows) {
    const tag = `match ${row.od_match_id} (${row.channel})`
    const r = await resolveRow(row.channel, row.started_at)
    c[r.outcome === 'fail' ? 'failed' : r.outcome]++
    console.log(`  ${DRY_RUN ? 'would ' : ''}${r.label.padEnd(40)} ${tag}`)
    if (!DRY_RUN && r.update) {
      const { error: upErr } = await supabase.from('match_stream_history').update(r.update).eq('id', row.id)
      if (upErr) console.log(`         ^ update failed: ${upErr.message}`)
    }
    await sleep(REQUEST_DELAY_MS)
  }
  return c
}

// Seed match_stream_vods from recently-recorded series: one row per NON-main Twitch
// channel. Idempotent (ignoreDuplicates), so it only ever adds new (game, channel) pairs.
async function seedAltChannels() {
  const seedCutoff = new Date(Date.now() - SEED_DAYS * 86400 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('match_stream_history')
    .select('od_match_id, channel, started_at, streams_json')
    .gte('started_at', seedCutoff)
    .not('streams_json', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1000)
  if (error) { console.log(`  alt seed: query failed: ${error.message}`); return 0 }

  const seeds = buildVodSeedRows(rows)
  if (seeds.length && !DRY_RUN) {
    const { error: upErr } = await supabase
      .from('match_stream_vods')
      .upsert(seeds, { onConflict: 'od_match_id,channel', ignoreDuplicates: true })
    if (upErr) console.log(`  alt seed: upsert failed: ${upErr.message}`)
  }
  return seeds.length
}

// ── Pass 2: alternate channels (match_stream_vods) — per-channel deep-link coverage.
async function enrichAltChannels() {
  const seeded = await seedAltChannels()
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('match_stream_vods')
    .select('od_match_id, channel, started_at')
    .is('twitch_vod_id', null)
    .not('vod_available', 'is', false)
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(BATCH)
  if (error) { console.log(`alt: supabase query failed: ${error.message}`); return emptyCounts() }

  console.log(`\n[alt channels] ${DRY_RUN ? '[DRY RUN] ' : ''}seeded ${seeded} (last ${SEED_DAYS}d), ${rows.length} unresolved row(s) (last ${LOOKBACK_DAYS}d, batch ${BATCH})`)
  const c = emptyCounts()
  for (const row of rows) {
    const tag = `match ${row.od_match_id} (${row.channel}) [alt]`
    const r = await resolveRow(row.channel, row.started_at)
    c[r.outcome === 'fail' ? 'failed' : r.outcome]++
    console.log(`  ${DRY_RUN ? 'would ' : ''}${r.label.padEnd(40)} ${tag}`)
    if (!DRY_RUN && r.update) {
      const { error: upErr } = await supabase
        .from('match_stream_vods')
        .update(r.update)
        .eq('od_match_id', row.od_match_id)
        .eq('channel', row.channel)
      if (upErr) console.log(`         ^ update failed: ${upErr.message}`)
    }
    await sleep(REQUEST_DELAY_MS)
  }
  return c
}

async function main() {
  const main = await enrichMainChannels()
  const alt = await enrichAltChannels()
  console.log(`\nDone — main: ${main.resolved} resolved, ${main.pending} pending, ${main.unavailable} unavailable, ${main.failed} failed`)
  console.log(`     — alt:  ${alt.resolved} resolved, ${alt.pending} pending, ${alt.unavailable} unavailable, ${alt.failed} failed`)
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

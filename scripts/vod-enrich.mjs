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

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const API_BASE = (process.env.VOD_ENRICH_API_BASE || 'https://spectateesports.live').replace(/\/$/, '')
const BATCH = Number(process.env.BATCH || 20)        // rows per invocation (Twitch rate-limit headroom)
const LOOKBACK_DAYS = 60                              // Twitch archive VODs expire ~60 days
const GRACE_HOURS = 24                                // wait this long before marking a miss unavailable
const REQUEST_DELAY_MS = 400                          // gentle pacing between resolver calls
const DRY_RUN = process.argv.includes('--dry-run')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Parse "https://www.twitch.tv/videos/2401234567?t=1842s" → { vodId, offset }
function parseVodUrl(url) {
  const idMatch = url.match(/\/videos\/(\d+)/)
  const tMatch = url.match(/[?&]t=(\d+)s/)
  if (!idMatch) return null
  return { vodId: idMatch[1], offset: tMatch ? Number(tMatch[1]) : 0 }
}

async function resolveVod(channel, startedAtUnix) {
  const params = new URLSearchParams({ mode: 'twitch-vod', channel, ts: String(startedAtUnix) })
  const res = await fetch(`${API_BASE}/api/match-streams?${params}`)
  if (!res.ok) throw new Error(`resolver ${res.status}`)
  return res.json() // { url, channel, startedAt } on hit | { url:null, channel, live } on miss
}

async function main() {
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

  if (error) {
    console.error('Supabase query failed:', error.message)
    process.exit(1)
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Found ${rows.length} unresolved row(s) (last ${LOOKBACK_DAYS}d, batch ${BATCH})\n`)

  let resolved = 0, pending = 0, unavailable = 0, failed = 0

  for (const row of rows) {
    const startedUnix = Math.floor(new Date(row.started_at).getTime() / 1000)
    const ageHours = (Date.now() - new Date(row.started_at).getTime()) / 3_600_000
    const tag = `match ${row.od_match_id} (${row.channel})`

    let data
    try {
      data = await resolveVod(row.channel, startedUnix)
    } catch (err) {
      console.log(`  fail   ${tag}: ${err.message}`)
      failed++
      await sleep(REQUEST_DELAY_MS)
      continue
    }

    let update
    let outcome
    if (data.url) {
      const parsed = parseVodUrl(data.url)
      if (!parsed) {
        console.log(`  fail   ${tag}: unparseable url ${data.url}`)
        failed++
        await sleep(REQUEST_DELAY_MS)
        continue
      }
      update = {
        twitch_vod_id: parsed.vodId,
        vod_offset_s: parsed.offset,
        vod_resolved_at: new Date().toISOString(),
        vod_checked_at: new Date().toISOString(),
        vod_available: true,
      }
      outcome = `resolve → vod ${parsed.vodId} @ ${parsed.offset}s`
      resolved++
    } else if (data.live || ageHours < GRACE_HOURS) {
      // VOD not published yet (broadcast live) or Twitch indexing lag — retry next run.
      update = { vod_checked_at: new Date().toISOString() }
      outcome = data.live ? 'pending (channel live)' : `pending (${ageHours.toFixed(1)}h < ${GRACE_HOURS}h grace)`
      pending++
    } else {
      // Checked, no VOD, past grace window — stop retrying.
      update = { vod_checked_at: new Date().toISOString(), vod_available: false }
      outcome = 'unavailable (no VOD past grace)'
      unavailable++
    }

    console.log(`  ${DRY_RUN ? 'would ' : ''}${outcome.padEnd(40)} ${tag}`)

    if (!DRY_RUN) {
      const { error: upErr } = await supabase.from('match_stream_history').update(update).eq('id', row.id)
      if (upErr) console.log(`         ^ update failed: ${upErr.message}`)
    }

    await sleep(REQUEST_DELAY_MS)
  }

  console.log(`\nDone: ${resolved} resolved, ${pending} pending, ${unavailable} unavailable, ${failed} failed`)
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

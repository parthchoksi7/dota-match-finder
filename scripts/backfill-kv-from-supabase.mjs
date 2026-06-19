/**
 * Backfill stream:match:{od_match_id} KV entries from match_stream_history rows
 * whose KV entry is missing (e.g. due to a silent write failure in the PS fuzzy match).
 *
 * Only processes rows started within the last 14 days — beyond that the KV TTL
 * would have expired anyway so there is nothing useful to restore.
 *
 * Uses nx:true so existing valid KV entries are never overwritten.
 * TTL is set to the remaining lifetime (14d from match start), not a fresh 14d window.
 *
 * Run from repo root:
 *   node scripts/backfill-kv-from-supabase.mjs
 */

import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const STREAM_TTL = 60 * 60 * 24 * 14 // 14 days in seconds

async function main() {
  const cutoff = new Date(Date.now() - STREAM_TTL * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('match_stream_history')
    .select('od_match_id, channel, started_at')
    .gte('started_at', cutoff)
    .not('channel', 'is', null)
    .order('started_at', { ascending: false })

  if (error) {
    console.error('Supabase query failed:', error.message)
    process.exit(1)
  }

  console.log(`Found ${rows.length} rows within last 14 days`)

  let written = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const remainingTtl = Math.floor(
      (new Date(row.started_at).getTime() + STREAM_TTL * 1000 - Date.now()) / 1000
    )
    if (remainingTtl <= 0) {
      skipped++
      continue
    }

    try {
      const set = await kv.set(`stream:match:${row.od_match_id}`, row.channel, { ex: remainingTtl, nx: true })
      if (set === null) {
        console.log(`  skip  stream:match:${row.od_match_id} — already in KV`)
        skipped++
      } else {
        console.log(`  write stream:match:${row.od_match_id} → ${row.channel} (TTL ${remainingTtl}s)`)
        written++
      }
    } catch (err) {
      console.error(`  fail  stream:match:${row.od_match_id}: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${written} written, ${skipped} skipped, ${failed} failed`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

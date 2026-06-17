/**
 * One-time backfill: writes a Supabase row for every stream:match:{id} KV entry
 * that doesn't already exist in match_stream_history.
 *
 * Run from repo root:
 *   node scripts/backfill-stream-history.mjs
 *
 * Uses .env.local for credentials. Safe to re-run — ignoreDuplicates skips existing rows.
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

async function scanAllStreamMatchKeys() {
  const entries = [] // { odMatchId, channel }
  let cursor = 0
  do {
    const [next, keys] = await kv.scan(cursor, { match: 'stream:match:*', count: 100 })
    cursor = Number(next)
    if (keys.length > 0) {
      const values = await kv.mget(...keys)
      keys.forEach((key, i) => {
        const id = Number(key.replace('stream:match:', ''))
        if (!isNaN(id) && values[i]) {
          entries.push({ odMatchId: id, channel: String(values[i]) })
        }
      })
    }
  } while (cursor !== 0)
  return entries
}

async function fetchOdMatch(odMatchId) {
  const res = await fetch(`https://api.opendota.com/api/matches/${odMatchId}`)
  if (!res.ok) return null
  return res.json()
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('Scanning KV for stream:match:* entries...')
  const kvEntries = await scanAllStreamMatchKeys()
  console.log(`Found ${kvEntries.length} KV entries`)

  if (kvEntries.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  // Find which od_match_ids are already in Supabase
  const { data: existing, error: queryErr } = await supabase
    .from('match_stream_history')
    .select('od_match_id')
    .in('od_match_id', kvEntries.map(e => e.odMatchId))

  if (queryErr) {
    console.error('Supabase query failed:', queryErr.message)
    process.exit(1)
  }

  const existingIds = new Set((existing || []).map(r => Number(r.od_match_id)))
  const missing = kvEntries.filter(e => !existingIds.has(e.odMatchId))
  console.log(`${existingIds.size} already in Supabase, ${missing.length} to backfill`)

  if (missing.length === 0) {
    console.log('All entries already in Supabase.')
    return
  }

  const rows = []
  for (let i = 0; i < missing.length; i++) {
    const { odMatchId, channel } = missing[i]
    process.stdout.write(`[${i + 1}/${missing.length}] Match ${odMatchId} (${channel})... `)

    const match = await fetchOdMatch(odMatchId)
    if (!match || !match.start_time) {
      console.log('OD fetch failed or no start_time, skipping')
      await sleep(500)
      continue
    }

    const startedAt = new Date(match.start_time * 1000).toISOString()
    const teamA = match.radiant_team?.name || null
    const teamB = match.dire_team?.name || null

    rows.push({
      od_match_id: odMatchId,
      channel,
      started_at: startedAt,
      team_a: teamA,
      team_b: teamB,
    })

    console.log(`ok (${startedAt}, ${teamA ?? 'unknown'} vs ${teamB ?? 'unknown'})`)

    // Respect OD's informal rate limit
    await sleep(1000)
  }

  if (rows.length === 0) {
    console.log('No rows to insert after OD lookups.')
    return
  }

  console.log(`\nUpserting ${rows.length} rows to Supabase...`)
  const { error: upsertErr } = await supabase
    .from('match_stream_history')
    .upsert(rows, { onConflict: 'od_match_id', ignoreDuplicates: true })

  if (upsertErr) {
    console.error('Supabase upsert failed:', upsertErr.message)
    process.exit(1)
  }

  console.log(`Done. ${rows.length} rows written.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

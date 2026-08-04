/**
 * One-time migration: backfills push_subscriptions (Supabase) from the existing KV
 * push:sub:{userId} / push:teams:{userId} / push:prefs:{userId} keyspace (pending-refactors #16).
 *
 * MUST run before the Supabase-backed push-subscribe/dispatchPush code is deployed — otherwise
 * there is a window where the send path queries an empty table and no existing subscriber gets
 * notified until they next open the app with push permission already granted.
 *
 * Idempotent (upsert on user_id) — safe, and recommended, to re-run a second time immediately
 * before deploying to catch subscribers who wrote to KV during the gap between the first run and
 * the deploy landing.
 *
 * Team names are lowercased on write, matching the convention the new Supabase-backed
 * push-subscribe handler uses (push_subscriptions.teams is queried via the Postgres `overlaps`
 * operator, replacing the push:team:{name} reverse index — no reverse index means no case-folding
 * step at query time, so it has to happen at write time instead).
 *
 * normalizePrefs() below is a deliberate inline copy of the pure function in api/live-matches.js,
 * not an import — this script is a one-time tool, not a long-lived consumer of that module, so
 * duplicating ~10 lines here avoids dragging this script's execution into live-matches.js's full
 * import graph (KV/Supabase client construction, _shared.js, seriesLogic.js, etc.) for a function
 * this simple. If normalizePrefs's default shape changes before this script is deleted, update
 * both.
 *
 * Usage (run from repo root):
 *   node scripts/migrate-push-subscriptions.mjs [--dry-run]
 */

import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mirrors api/live-matches.js normalizePrefs() — see file header note.
function normalizePrefs(raw) {
  let p = raw
  if (typeof raw === 'string') { try { p = JSON.parse(raw) } catch { p = null } }
  p = p && typeof p === 'object' ? p : {}
  const t = p.types && typeof p.types === 'object' ? p.types : {}
  return {
    tz: typeof p.tz === 'string' ? p.tz : null,
    types: { soon: t.soon !== false, live: t.live !== false, replay: t.replay !== false, score: t.score === true },
    quietStart: Number.isInteger(p.quietStart) ? p.quietStart : null,
    quietEnd: Number.isInteger(p.quietEnd) ? p.quietEnd : null,
  }
}

// Handles both storage generations: direct array (current) and JSON.stringify'd string (legacy,
// same backward-compat the push-subscribe handler already reads) — see CONTEXT.md push section.
function parseTeams(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}

async function collectSubKeys() {
  const keys = []
  let cursor = '0'
  do {
    const [next, found] = await kv.scan(cursor, { match: 'push:sub:*', count: 100 })
    keys.push(...found)
    cursor = next
  } while (cursor !== '0')
  return keys
}

async function main() {
  const subKeys = await collectSubKeys()
  console.log(`Found ${subKeys.length} push:sub:* keys in KV`)

  const rows = []
  let skipped = 0
  let readFailed = 0

  for (const key of subKeys) {
    const userId = key.slice('push:sub:'.length)
    try {
      const [subRaw, teamsRaw, prefsRaw] = await Promise.all([
        kv.get(key),
        kv.get(`push:teams:${userId}`),
        kv.get(`push:prefs:${userId}`),
      ])
      if (!subRaw) { skipped++; continue }
      const sub = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw
      if (!sub?.endpoint) { skipped++; continue }

      rows.push({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh || null,
        auth: sub.keys?.auth || null,
        teams: parseTeams(teamsRaw).map(t => String(t).toLowerCase()),
        prefs: normalizePrefs(prefsRaw),
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error(`  fail  ${key}: ${err.message}`)
      readFailed++
    }
  }

  console.log(`Prepared ${rows.length} rows (${skipped} skipped — no valid sub, ${readFailed} read failures)`)

  if (DRY_RUN) {
    console.log('--dry-run: not writing to Supabase.')
    console.log('Sample rows:', JSON.stringify(rows.slice(0, 3), null, 2))
    return
  }

  let written = 0
  let writeFailed = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('push_subscriptions').upsert(chunk, { onConflict: 'user_id' })
    if (error) {
      console.error(`  chunk starting at ${i} failed: ${error.message}`)
      writeFailed += chunk.length
    } else {
      written += chunk.length
      console.log(`  wrote rows ${i}-${i + chunk.length - 1}`)
    }
  }

  console.log(`\nDone: ${written} written, ${skipped} skipped, ${readFailed} read failures, ${writeFailed} write failures`)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})

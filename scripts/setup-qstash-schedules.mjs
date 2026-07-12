#!/usr/bin/env node
/**
 * (Re)creates the QStash schedules that REPLACE the GitHub Actions stream-capture and
 * warm-streams crons.
 *
 * Why: GHA scheduled-workflow throttling fired those every-15-min crons only every ~1.5-4h
 * in practice (verified via `gh run list`), so completed series sat un-bound/un-enriched for
 * hours. QStash delivers a reliable cadence and runs on the Upstash account we already use
 * for KV.
 *
 * What each schedule does: an authenticated GET to a /api/live-matches cron mode, with
 * `Authorization: Bearer ${CRON_SECRET}` forwarded to the endpoint (the `Upstash-Forward-`
 * prefix tells QStash to pass the header through to the destination). The endpoints'
 * existing CRON_SECRET gate is unchanged — QStash is only a more reliable trigger.
 *
 * Run once after setting QSTASH_TOKEN + CRON_SECRET in .env.local:
 *   npm run setup-qstash
 *
 * Re-running is safe and idempotent: it deletes any existing schedule pointing at one of
 * our destinations before recreating it, so you never accumulate duplicates.
 *
 * Get QSTASH_TOKEN from console.upstash.com -> QStash -> "QSTASH_TOKEN".
 * Override the target host (e.g. a preview deployment) with QSTASH_TARGET_URL.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// QStash is region-specific: a US-region token rejects the default EU host. Vercel injects
// QSTASH_URL pointing at the right region (e.g. https://qstash-us-east-1.upstash.io); use it.
const QSTASH_BASE = `${(process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '')}/v2`
const QSTASH_TOKEN = process.env.QSTASH_TOKEN
const CRON_SECRET = process.env.CRON_SECRET
const SITE_URL = (process.env.QSTASH_TARGET_URL || 'https://spectateesports.live').replace(/\/$/, '')

// stream-capture / warm-streams / vod-enrich were declared `*/15 * * * *` on GHA; keep that
// cadence on QStash. push-scan is the "starting soon" trigger — it must run finer than 15 min
// so a T-5 alert actually lands ~2-5 min before kickoff (a */5 scan can slip to a 0-min lead),
// hence */3. Free plan allows 1,000 msgs/day + 10 schedules; 3 × 4/hr + 1 × 20/hr = 768/day
// across 4 schedules — within limits.
const SCHEDULES = [
  { name: 'stream-capture', path: '/api/live-matches?cron=1',            cron: '*/15 * * * *' },
  { name: 'warm-streams',   path: '/api/live-matches?cron=warm-streams', cron: '*/15 * * * *' },
  { name: 'vod-enrich',     path: '/api/pipeline?type=vod-enrich',        cron: '*/15 * * * *' },
  { name: 'push-scan',      path: '/api/live-matches?cron=push-scan',     cron: '*/3 * * * *'  },
]

if (!QSTASH_TOKEN) { console.error('Missing QSTASH_TOKEN — set it in .env.local (console.upstash.com -> QStash).'); process.exit(1) }
if (!CRON_SECRET) { console.error('Missing CRON_SECRET — set it in .env.local.'); process.exit(1) }

const auth = { Authorization: `Bearer ${QSTASH_TOKEN}` }

async function listSchedules() {
  const r = await fetch(`${QSTASH_BASE}/schedules`, { headers: auth })
  if (!r.ok) throw new Error(`list schedules failed: ${r.status} ${await r.text()}`)
  return r.json()
}

async function deleteSchedule(id) {
  const r = await fetch(`${QSTASH_BASE}/schedules/${id}`, { method: 'DELETE', headers: auth })
  if (!r.ok && r.status !== 404) throw new Error(`delete ${id} failed: ${r.status} ${await r.text()}`)
}

async function createSchedule({ path, cron }) {
  const destination = `${SITE_URL}${path}`
  const r = await fetch(`${QSTASH_BASE}/schedules/${destination}`, {
    method: 'POST',
    headers: {
      ...auth,
      'Upstash-Cron': cron,
      'Upstash-Method': 'GET',
      // Forwarded to the destination as `Authorization: Bearer <secret>`.
      'Upstash-Forward-Authorization': `Bearer ${CRON_SECRET}`,
    },
  })
  if (!r.ok) throw new Error(`create ${destination} failed: ${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  const existing = await listSchedules()
  // Match by path substring so host normalization in QStash's stored destination can't
  // cause a re-run to leave a stale duplicate behind.
  for (const sch of existing) {
    const dest = sch.destination || ''
    if (SCHEDULES.some(s => dest.includes(s.path))) {
      await deleteSchedule(sch.scheduleId)
      console.log(`deleted existing schedule ${sch.scheduleId} -> ${dest}`)
    }
  }
  for (const s of SCHEDULES) {
    const { scheduleId } = await createSchedule(s)
    console.log(`created ${s.name}: ${scheduleId} (${s.cron}) -> ${SITE_URL}${s.path}`)
  }
  console.log('\nDone. Verify in console.upstash.com -> QStash -> Schedules.')
}

main().catch(err => { console.error(err.message); process.exit(1) })

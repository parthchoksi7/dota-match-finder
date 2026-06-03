/**
 * Pipeline worker — processes one queued job per invocation.
 *
 * Steps:
 *   1. Claim next queued job (highest priority, oldest first)
 *   2. Fetch match telemetry from OpenDota
 *   3. Run deterministic generation
 *   4. Store intelligence in job, advance to 'generated'
 *   5. Log result (notification hook goes here when email is wired up)
 *
 * Usage:
 *   node pipeline/worker.mjs            # process one job from queue
 *   node pipeline/worker.mjs --loop     # keep processing until queue is empty
 *   node pipeline/worker.mjs --job <id> # force-process a specific job (bypasses queue claim)
 */

import { claimNextJob, getJob, transition, STATUS } from './job-queue.mjs'
import { generateMatchIntelligence } from './deterministic.mjs'

const OD_BASE = 'https://api.opendota.com/api'
const LOOP_MODE = process.argv.includes('--loop')
const FORCE_JOB = (() => {
  const idx = process.argv.indexOf('--job')
  return idx !== -1 ? process.argv[idx + 1] : null
})()

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(jobId, msg) {
  console.log(`[${new Date().toISOString()}] [${jobId}] ${msg}`)
}

async function fetchMatch(matchId) {
  const url = `${OD_BASE}/matches/${matchId}`
  process.stderr.write(`→ GET ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`OpenDota HTTP ${res.status} for match ${matchId}`)
  return res.json()
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

async function processJob(job) {
  const { jobId, matchId } = job
  log(jobId, `Starting pipeline — match ${matchId}, priority ${job.priority}`)

  // Step 1 — Fetch telemetry
  log(jobId, 'Fetching OpenDota match telemetry...')
  let rawMatch
  try {
    rawMatch = await fetchMatch(matchId)
  } catch (err) {
    // Return job to queue on fetch failure so it can be retried
    await transition(jobId, STATUS.queued, { lastError: err.message })
    log(jobId, `Fetch failed — returned to queue: ${err.message}`)
    return { success: false, retried: true }
  }

  // Step 2 — Deterministic generation (no LLM)
  log(jobId, 'Running deterministic generation...')
  let intelligence
  try {
    intelligence = await generateMatchIntelligence(rawMatch)
  } catch (err) {
    await transition(jobId, STATUS.queued, { lastError: err.message })
    log(jobId, `Deterministic generation failed — returned to queue: ${err.message}`)
    return { success: false, retried: true }
  }

  // Step 3 — Advance to 'generated' and store intelligence
  const generated = await transition(jobId, STATUS.generated, { intelligence })
  log(jobId, `Generated — ${intelligence.radiant.name} vs ${intelligence.dire.name}, ${intelligence.tournament.name}`)
  log(jobId, `  Winner: ${intelligence.winner === 'radiant' ? intelligence.radiant.name : intelligence.dire.name}`)
  log(jobId, `  Duration: ${intelligence.duration} · Patch ${intelligence.patch}`)
  log(jobId, `  Objectives: ${intelligence.objectives.length} · Players: ${intelligence.players.length}`)

  // Step 4 — Notify reviewer
  // TODO: send email/webhook when notification system is wired up
  log(jobId, 'Reviewer notification: [TODO — wire up email/webhook]')

  return { success: true, job: generated, intelligence }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runOnce() {
  let job

  if (FORCE_JOB) {
    job = await getJob(FORCE_JOB)
    if (!job) {
      console.error(`Job not found: ${FORCE_JOB}`)
      process.exit(1)
    }
    const prev = job.status
    // Reset to queued first if not already in a workable state
    if (!['queued', 'processing'].includes(job.status)) {
      job = await transition(FORCE_JOB, STATUS.queued)
    }
    if (job.status !== STATUS.processing) {
      job = await transition(FORCE_JOB, STATUS.processing)
    }
    console.log(`Force-processing job ${FORCE_JOB} (was ${prev})`)
  } else {
    job = await claimNextJob()
    if (!job) {
      console.log('Queue is empty — nothing to process.')
      return false
    }
  }

  const result = await processJob(job)
  return result.success
}

async function main() {
  if (LOOP_MODE) {
    console.log('Running in loop mode — processing until queue is empty...')
    let processed = 0
    while (true) {
      const didWork = await runOnce()
      if (!didWork) break
      processed++
      await new Promise(r => setTimeout(r, 1000)) // 1s between jobs
    }
    console.log(`\nDone — processed ${processed} job(s).`)
  } else {
    await runOnce()
  }
}

main().catch(err => {
  console.error('Worker error:', err)
  process.exit(1)
})

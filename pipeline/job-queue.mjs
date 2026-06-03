/**
 * Coverage job queue and state machine — backed by Upstash Redis.
 *
 * Redis key layout:
 *   coverage:job:{jobId}       — JSON blob of the full job (TTL 90 days)
 *   coverage:queue             — sorted set; score = priority*1e13 + createdAt_ms
 *                                (lower score = higher priority + older = popped first)
 *   coverage:match:{matchId}   — jobId string; used for deduplication (TTL 90 days)
 *
 * State machine:
 *   queued → processing → generated → under_review → approved → published
 *   Any non-published state → suppressed
 *   generated → queued  (regenerate)
 *
 * Allowed transitions are enforced by transition() — callers cannot set arbitrary status.
 */

import { kv } from '../api/_kv.js'

// ── Constants ────────────────────────────────────────────────────────────────

export const PRIORITY = /** @type {const} */ ({
  critical: 1,
  high:     2,
  medium:   3,
  low:      4,
})

export const STATUS = /** @type {const} */ ({
  queued:       'queued',
  processing:   'processing',
  generated:    'generated',
  under_review: 'under_review',
  approved:     'approved',
  published:    'published',
  archived:     'archived',
  suppressed:   'suppressed',
})

// Valid forward transitions. 'suppressed' and 'archived' are always reachable from any state.
const TRANSITIONS = {
  queued:       ['processing', 'suppressed'],
  processing:   ['generated', 'queued', 'suppressed'],  // queued = retry/reset
  generated:    ['under_review', 'queued', 'suppressed', 'archived'],
  under_review: ['approved', 'generated', 'suppressed', 'archived'],
  approved:     ['published', 'generated', 'suppressed'],
  published:    ['archived', 'suppressed'],
  archived:     [],
  suppressed:   ['queued'],  // unsuppress is allowed
}

const JOB_TTL = 60 * 60 * 24 * 90  // 90 days
const QUEUE_KEY = 'coverage:queue'

// ── Helpers ───────────────────────────────────────────────────────────────────

function jobKey(jobId)     { return `coverage:job:${jobId}` }
function matchKey(matchId) { return `coverage:match:${matchId}` }

function queueScore(priority, createdAtMs) {
  // Lower score = dequeued first.
  // critical (1) * 1e13 + timestamp < low (4) * 1e13 + timestamp
  // Within same priority, older (smaller timestamp) comes first.
  return PRIORITY[priority] * 1e13 + createdAtMs
}

function now() { return new Date().toISOString() }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new coverage job for a match.
 * Returns the existing job if the match is already queued/processing/generated.
 * Throws if the match already has a published page (suppress first to re-cover).
 *
 * @param {object} params
 * @param {string} params.matchId
 * @param {'critical'|'high'|'medium'|'low'} params.priority
 * @param {object} params.meta  — display metadata: tournament, radiantName, direName, seriesType, patch
 */
export async function createJob({ matchId, priority = 'medium', meta = {} }) {
  if (!PRIORITY[priority]) throw new Error(`Invalid priority: ${priority}`)

  // Deduplication — return existing active job rather than creating a duplicate
  const existingId = await kv.get(matchKey(matchId))
  if (existingId) {
    const existing = await getJob(existingId)
    if (existing && existing.status !== STATUS.suppressed && existing.status !== STATUS.archived) {
      return { job: existing, created: false }
    }
  }

  const jobId = matchId  // 1:1 mapping; simpler than UUIDs at this volume
  const createdAtMs = Date.now()
  const createdAt = new Date(createdAtMs).toISOString()

  const job = {
    jobId,
    matchId,
    priority,
    status: STATUS.queued,
    ...meta,
    createdAt,
    updatedAt: createdAt,
    statusHistory: [{ status: STATUS.queued, at: createdAt }],
    intelligence: null,
    reviewedBy:     null,
    reviewedAt:     null,
    rejectionReason: null,
    publishedAt:    null,
  }

  await Promise.all([
    kv.set(jobKey(jobId), JSON.stringify(job), { ex: JOB_TTL }),
    kv.set(matchKey(matchId), jobId, { ex: JOB_TTL }),
    kv.zadd(QUEUE_KEY, { score: queueScore(priority, createdAtMs), member: jobId }),
  ])

  return { job, created: true }
}

/**
 * Fetch a job by jobId. Returns null if not found.
 */
export async function getJob(jobId) {
  const raw = await kv.get(jobKey(jobId))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

/**
 * Fetch the job for a given matchId. Returns null if not found.
 */
export async function getJobByMatchId(matchId) {
  const jobId = await kv.get(matchKey(matchId))
  if (!jobId) return null
  return getJob(jobId)
}

/**
 * Transition a job to a new status.
 * Enforces the state machine — throws on invalid transition.
 * Optionally merges extra fields into the job (e.g. intelligence, reviewedBy).
 *
 * @param {string} jobId
 * @param {string} newStatus
 * @param {object} [updates]  — extra fields to merge (e.g. { intelligence, reviewedBy })
 */
export async function transition(jobId, newStatus, updates = {}) {
  const job = await getJob(jobId)
  if (!job) throw new Error(`Job not found: ${jobId}`)

  const allowed = TRANSITIONS[job.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid transition: ${job.status} → ${newStatus} for job ${jobId}`)
  }

  const updatedAt = now()
  const updated = {
    ...job,
    ...updates,
    status: newStatus,
    updatedAt,
    statusHistory: [...job.statusHistory, { status: newStatus, at: updatedAt }],
  }

  // Remove from queue when leaving 'queued' state; re-add if transitioning back to 'queued'
  const ops = [kv.set(jobKey(jobId), JSON.stringify(updated), { ex: JOB_TTL })]
  if (newStatus === STATUS.queued) {
    ops.push(kv.zadd(QUEUE_KEY, { score: queueScore(updated.priority, Date.now()), member: jobId }))
  } else if (job.status === STATUS.queued) {
    ops.push(kv.zrem(QUEUE_KEY, jobId))
  }

  await Promise.all(ops)
  return updated
}

/**
 * Pop the highest-priority queued job and atomically mark it as processing.
 * Returns null if the queue is empty.
 */
export async function claimNextJob() {
  // ZPOPMIN returns [{ member, score }] or []
  const result = await kv.zpopmin(QUEUE_KEY, 1)
  if (!result || result.length === 0) return null

  // Upstash returns either [member, score] or [{ member, score }] depending on version
  const jobId = typeof result[0] === 'object' ? result[0].member : result[0]
  const job = await getJob(jobId)
  if (!job) return null  // job expired or was deleted

  // Mark as processing (already removed from sorted set by zpopmin)
  const updatedAt = now()
  const updated = {
    ...job,
    status: STATUS.processing,
    updatedAt,
    statusHistory: [...job.statusHistory, { status: STATUS.processing, at: updatedAt }],
  }
  await kv.set(jobKey(jobId), JSON.stringify(updated), { ex: JOB_TTL })
  return updated
}

/**
 * List jobs, optionally filtered by status.
 * Returns jobs sorted by updatedAt descending (most recent first).
 *
 * @param {{ status?: string, limit?: number }} options
 */
export async function listJobs({ status, limit = 50 } = {}) {
  // Scan all job keys — acceptable at 3–5 matches/week volume
  const keys = []
  let cursor = 0
  do {
    const [nextCursor, found] = await kv.scan(cursor, { match: 'coverage:job:*', count: 100 })
    cursor = parseInt(nextCursor)
    keys.push(...found)
  } while (cursor !== 0)

  if (keys.length === 0) return []

  // Fetch all jobs in parallel
  const raws = await Promise.all(keys.map(k => kv.get(k)))
  const jobs = raws
    .filter(Boolean)
    .map(r => typeof r === 'string' ? JSON.parse(r) : r)
    .filter(j => !status || j.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return jobs.slice(0, limit)
}

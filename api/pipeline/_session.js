/**
 * Pipeline session management via Upstash KV.
 * One session per calendar day (UTC). 24h TTL.
 */
import { kv } from '../_kv.js'

const SESSION_TTL = 24 * 3600        // 24 hours
const RECENT_TOPICS_TTL = 7 * 24 * 3600  // 7 days

export function todayKey() {
  return `pipeline:session:${new Date().toISOString().slice(0, 10)}`
}

export async function getSession(key) {
  return kv.get(key)
}

export async function saveSession(key, session) {
  return kv.set(key, { ...session, updatedAt: new Date().toISOString() }, { ex: SESSION_TTL })
}

export async function deleteSession(key) {
  return kv.del(key)
}

// Track topic titles from recent sessions to avoid repeats (last 7 days × 3 topics)
export async function getRecentTopicTitles() {
  return (await kv.get('pipeline:recent-topics')) || []
}

export async function addRecentTopics(titles) {
  const existing = await getRecentTopicTitles()
  const combined = [...titles, ...existing].slice(0, 21)
  await kv.set('pipeline:recent-topics', combined, { ex: RECENT_TOPICS_TTL })
}

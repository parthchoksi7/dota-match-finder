import { kv } from '../_kv.js'
import { PANDASCORE_BASE, TIER1_TEAMS_SERVER } from '../_shared.js'
import { isTier1 } from './_tournamentUtils.js'

const KV_TEAMS_KEY = 'dota2:tier1_teams_dynamic_v1'
const TEAMS_TTL = 60 * 60 * 24 * 8 // 8 days - survives a missed cron day

export default async function handleSyncTeams(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  const toArr = async r => { if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : [] }

  const [runRes, upRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=50`, { headers }),
  ])
  const [running, upcoming] = await Promise.all([toArr(runRes), toArr(upRes)])

  const freshNames = []
  for (const t of [...running, ...upcoming]) {
    if (!isTier1(t)) continue
    for (const team of (t.teams || [])) {
      const name = team?.name
      if (name && name.length >= 2) freshNames.push(name)
    }
  }

  let existing = []
  try {
    const cached = await kv.get(KV_TEAMS_KEY)
    if (Array.isArray(cached)) existing = cached
  } catch (err) {
    console.warn('[sync-teams] KV read failed:', err?.message)
  }

  const merged = [...new Set([...TIER1_TEAMS_SERVER, ...existing, ...freshNames])]
  const added = freshNames.filter(n => !existing.includes(n) && !TIER1_TEAMS_SERVER.includes(n))

  if (merged.length > 0) {
    kv.set(KV_TEAMS_KEY, merged, { ex: TEAMS_TTL }).catch(err => {
      console.error('[sync-teams] KV write failed:', err?.message)
    })
  }

  console.log(`[sync-teams] ${merged.length} total teams, ${added.length} newly added: ${added.join(', ')}`)
  return res.status(200).json({
    total: merged.length,
    added,
    fetchedAt: new Date().toISOString(),
  })
}

import { kv } from '../_kv.js'
import { PANDASCORE_BASE, TIER1_TEAMS_SERVER, KV_TIER1_TEAMS_KEY, KV_TIER1_TEAMS_FULL_KEY } from '../_shared.js'
import { isTier1 } from './_tournamentUtils.js'

const KV_TEAMS_KEY = KV_TIER1_TEAMS_KEY
// Richer shape ({name, slug, acronym}) for UI consumers (Follow Teams search, Calendar
// team picker) that need a PandaScore slug, not just a display name. Kept as a SEPARATE
// key from KV_TEAMS_KEY (plain name strings) so api/news.js's entity-tagging consumer
// never has to change shape — one sync run writes both, zero risk to the existing reader.
const KV_TEAMS_FULL_KEY = KV_TIER1_TEAMS_FULL_KEY
const TEAMS_TTL = 60 * 60 * 24 * 8 // 8 days - survives a missed cron day

// Tournament stage names containing these are pre-qualification brackets for a tier-1
// league, not the tier-1 event itself — they surface amateur/unknown teams that never
// make the actual event. isTier1() still classifies them as tier-1 (by design, so the
// league keyword override isn't lost), so this is filtered separately, only when
// harvesting team names, not when deciding tournament tier elsewhere.
const QUALIFIER_STAGE_RE = /qualifier/i
const PLACEHOLDER_NAME_RE = /^(tbd|tba|to be (decided|announced))$/i

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
  const freshTeamsByName = new Map()
  for (const t of [...running, ...upcoming]) {
    if (!isTier1(t)) continue
    if (QUALIFIER_STAGE_RE.test(t?.name || '')) continue
    for (const team of (t.teams || [])) {
      const name = team?.name?.trim()
      if (!name || name.length < 2 || PLACEHOLDER_NAME_RE.test(name)) continue
      freshNames.push(name)
      if (!freshTeamsByName.has(name)) {
        freshTeamsByName.set(name, { name, slug: team.slug || null, acronym: team.acronym || null })
      }
    }
  }

  let existing = []
  try {
    const cached = await kv.get(KV_TEAMS_KEY)
    if (Array.isArray(cached)) existing = cached
  } catch (err) {
    console.warn('[sync-teams] KV read failed:', err?.message)
  }

  let existingFull = []
  try {
    const cachedFull = await kv.get(KV_TEAMS_FULL_KEY)
    if (Array.isArray(cachedFull)) existingFull = cachedFull
  } catch (err) {
    console.warn('[sync-teams] KV full-list read failed:', err?.message)
  }

  const merged = [...new Set([...TIER1_TEAMS_SERVER, ...existing, ...freshNames])]
  const added = freshNames.filter(n => !existing.includes(n) && !TIER1_TEAMS_SERVER.includes(n))

  // Merge full team objects: existing entries win on conflicting slug/acronym (fresh
  // data only fills in what a name-only static/legacy entry is missing). Also seeds from
  // `existing` (the legacy plain-name list) so a team accumulated there over past cron
  // runs — but currently out of active tournaments and not in the static base — still
  // gets a (name-only) entry here instead of silently disappearing from the full list.
  const fullByName = new Map(existingFull.map(t => [t.name, t]))
  for (const name of [...TIER1_TEAMS_SERVER, ...existing]) {
    if (!fullByName.has(name)) fullByName.set(name, { name, slug: null, acronym: null })
  }
  for (const [name, team] of freshTeamsByName) {
    const prior = fullByName.get(name)
    if (!prior) {
      fullByName.set(name, team)
    } else if (!prior.slug || !prior.acronym) {
      fullByName.set(name, { name, slug: prior.slug || team.slug, acronym: prior.acronym || team.acronym })
    }
  }
  const mergedFull = [...fullByName.values()]

  if (merged.length > 0) {
    kv.set(KV_TEAMS_KEY, merged, { ex: TEAMS_TTL }).catch(err => {
      console.error('[sync-teams] KV write failed:', err?.message)
    })
  }
  if (mergedFull.length > 0) {
    kv.set(KV_TEAMS_FULL_KEY, mergedFull, { ex: TEAMS_TTL }).catch(err => {
      console.error('[sync-teams] KV full-list write failed:', err?.message)
    })
  }

  console.log(`[sync-teams] ${merged.length} total teams, ${added.length} newly added: ${added.join(', ')}`)
  return res.status(200).json({
    total: merged.length,
    added,
    fetchedAt: new Date().toISOString(),
  })
}

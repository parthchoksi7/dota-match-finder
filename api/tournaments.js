import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_LIST_KEY = 'dota2:tournament_list_v2'
const KV_STATUS_KEY = 'dota2:tournament_statuses_v2'
const LIST_TTL = 60 * 60 * 24 * 30  // 30 days
const STATUS_TTL = 60 * 60 * 4      // 4 hours

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

const TIER1_KEYWORDS = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters'
]

function isTier1(leagueName, serieName) {
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()
  return TIER1_KEYWORDS.some(k => lower.includes(k))
}

function buildTournamentName(t) {
  const league = t.league?.name || ''
  const serie = t.serie?.full_name || t.serie?.name || ''
  const stage = t.name || ''
  if (league && serie) {
    const base = serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`
    return `${base}${stage && stage !== 'Season' ? ` — ${stage}` : ''}`
  }
  return league || serie || stage || 'Unknown'
}

function resolveXHandle(name) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('esl one') || lower.includes('dreamleague')) return 'ESL_Dota2'
  if (lower.includes('pgl')) return 'PGLDota2'
  if (lower.includes('weplay')) return 'WePlayDota2'
  if (lower.includes('beyond the summit') || lower.includes('bts')) return 'BTSDoTa2'
  if (lower.includes('the international') || lower.includes(' ti ')) return 'dota2ti'
  if (lower.includes('blast')) return 'BLASTDota2'
  if (lower.includes('riyadh') || lower.includes('ewc') || lower.includes('esports world cup')) return 'EsportsWC'
  if (lower.includes('fissure')) return 'FissureDota2'
  return 'dota2'
}

function mapTournament(t, status) {
  const name = buildTournamentName(t)
  const leagueName = t.league?.name || ''
  const serieName = t.serie?.full_name || t.serie?.name || ''
  return {
    id: t.id,
    name,
    shortname: leagueName || name,
    startdate: t.begin_at || null,
    enddate: t.end_at || null,
    status,
    league: leagueName,
    serie: serieName,
    liquipediaUrl: `https://liquipedia.net/dota2/${encodeURIComponent(leagueName.replace(/\s+/g, '_'))}`,
    pandascoreUrl: `https://pandascore.co/dota2/tournaments/${t.slug}`,
    xHandle: resolveXHandle(leagueName || name),
  }
}

async function fetchTournamentList(token) {
  const cached = await kv.get(KV_LIST_KEY)
  if (cached) {
    console.log('Tournament list: serving from KV cache')
    return cached
  }

  console.log('Tournament list: fetching from PandaScore')
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const [runningRes, upcomingRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=10`, { headers }),
  ])

  if (!runningRes.ok || !upcomingRes.ok) {
    throw new Error(`PandaScore error: ${runningRes.status} / ${upcomingRes.status}`)
  }

  const [running, upcoming] = await Promise.all([runningRes.json(), upcomingRes.json()])

  const list = {
    ongoing: (running || []).filter(t => isTier1(t.league?.name, t.serie?.full_name)).map(t => mapTournament(t, 'running')),
    upcoming: (upcoming || []).filter(t => isTier1(t.league?.name, t.serie?.full_name)).slice(0, 5).map(t => mapTournament(t, 'upcoming')),
    fetchedAt: new Date().toISOString(),
  }

  await kv.set(KV_LIST_KEY, list, { ex: LIST_TTL })
  return list
}

async function fetchTournamentStatuses(token) {
  const cached = await kv.get(KV_STATUS_KEY)
  if (cached) {
    console.log('Tournament statuses: serving from KV cache')
    return cached
  }

  console.log('Tournament statuses: fetching from PandaScore')
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const [runningRes, upcomingRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=10`, { headers }),
  ])

  const [running, upcoming] = await Promise.all([
    runningRes.ok ? runningRes.json() : [],
    upcomingRes.ok ? upcomingRes.json() : [],
  ])

  const statuses = {}
  for (const t of (running || [])) {
    if (isTier1(t.league?.name, t.serie?.full_name)) statuses[t.id] = 'running'
  }
  for (const t of (upcoming || [])) {
    if (isTier1(t.league?.name, t.serie?.full_name)) statuses[t.id] = 'upcoming'
  }

  await kv.set(KV_STATUS_KEY, statuses, { ex: STATUS_TTL })
  return statuses
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  if (req.query?.bust === '1') {
    await kv.del(KV_LIST_KEY)
    await kv.del(KV_STATUS_KEY)
    console.log('KV cache cleared')
  }

  try {
    const list = await fetchTournamentList(token)
    const statuses = await fetchTournamentStatuses(token)

    const allTournaments = [...list.ongoing, ...list.upcoming]
    const withFreshStatus = allTournaments.map(t => ({
      ...t,
      status: statuses[t.id] || t.status,
    }))

    const ongoing = withFreshStatus.filter(t => t.status === 'running')
    const upcoming = withFreshStatus.filter(t => t.status === 'upcoming').slice(0, 5)

    return res.status(200).json({
      ongoing,
      upcoming,
      meta: { listFetchedAt: list.fetchedAt, statusesFresh: Object.keys(statuses).length > 0 }
    })

  } catch (err) {
    console.error('Tournaments API error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

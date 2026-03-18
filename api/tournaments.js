import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_LIST_KEY = 'dota2:tournament_list_v4'
const KV_STATUS_KEY = 'dota2:tournament_statuses_v3'
const LIST_TTL = 60 * 60 * 6        // 6 hours — catches stage transitions (Group → Playoffs)
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

// For series objects: accept keyword match OR PandaScore tier 's'/'a' so upcoming
// events with slightly different names still show up.
function isTier1Series(s) {
  const name = ((s.league?.name || '') + ' ' + (s.full_name || s.name || '')).toLowerCase()
  const hasKeyword = TIER1_KEYWORDS.some(k => name.includes(k))
  const tier = (s.tier || s.tournaments?.[0]?.tier || '').toLowerCase()
  return hasKeyword || tier === 's' || tier === 'a'
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
    winner: t.winner?.type?.toLowerCase() === 'team' ? { id: t.winner.id, name: t.winner.name || null } : null,
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

  const [runningRes, upcomingRes, pastRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/past?sort=-end_at&page[size]=10`, { headers }),
  ])

  if (!runningRes.ok || !upcomingRes.ok) {
    throw new Error(`PandaScore error: ${runningRes.status} / ${upcomingRes.status}`)
  }

  const [running, upcoming, past] = await Promise.all([
    runningRes.json(),
    upcomingRes.json(),
    pastRes.ok ? pastRes.json() : Promise.resolve([]),
  ])

  const list = {
    ongoing: (running || []).filter(t => isTier1(t.league?.name, t.serie?.full_name)).map(t => mapTournament(t, 'running')),
    upcoming: (upcoming || []).filter(t => isTier1(t.league?.name, t.serie?.full_name)).slice(0, 5).map(t => mapTournament(t, 'upcoming')),
    completed: (past || []).filter(t => isTier1(t.league?.name, t.serie?.full_name)).slice(0, 3).map(t => mapTournament(t, 'completed')),
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
  // Track full tournament objects for newly-discovered running stages
  const newRunning = []

  for (const t of (running || [])) {
    if (isTier1(t.league?.name, t.serie?.full_name)) {
      statuses[t.id] = 'running'
      newRunning.push(t)
    }
  }
  for (const t of (upcoming || [])) {
    if (isTier1(t.league?.name, t.serie?.full_name)) statuses[t.id] = 'upcoming'
  }

  // Merge any newly-running tournaments into the list cache so stage transitions
  // (e.g. Group Stage → Playoffs) are picked up without waiting for list TTL to expire
  try {
    const listCached = await kv.get(KV_LIST_KEY)
    if (listCached && Array.isArray(listCached.ongoing)) {
      const existingIds = new Set(listCached.ongoing.map(t => t.id))
      const added = newRunning.filter(t => !existingIds.has(t.id)).map(t => mapTournament(t, 'running'))
      if (added.length > 0) {
        console.log(`Tournament statuses: merging ${added.length} new running stage(s) into list cache`)
        const updated = { ...listCached, ongoing: [...listCached.ongoing, ...added] }
        await kv.set(KV_LIST_KEY, updated, { ex: LIST_TTL })
      }
    }
  } catch {}

  await kv.set(KV_STATUS_KEY, statuses, { ex: STATUS_TTL })
  return statuses
}

// ── Series list mode (?mode=series) ─────────────────────────────────────────
// Used by /tournaments page and TournamentBar. Fetches PandaScore series
// (not individual sub-stages) so fans see "PGL Wallachia S7" as one entry.

const KV_SERIES_KEY = 'tournaments:dota2:series_list_v4'
const SERIES_TTL = 60 * 60 // 1 hour

function formatPrizePool(prize) {
  if (!prize) return null
  const match = String(prize).match(/[\d,]+/)
  if (!match) return prize
  const num = parseInt(match[0].replace(/,/g, ''))
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
  return `$${num}`
}

function mapSeries(serie, status) {
  const leagueName = serie.league?.name || ''
  const fullName = serie.full_name || serie.name || leagueName
  return {
    id: serie.id,
    slug: serie.slug || String(serie.id),
    name: fullName,
    leagueName,
    leagueSlug: serie.league?.slug || '',
    status,
    beginAt: serie.begin_at || null,
    endAt: serie.end_at || null,
    prizePool: formatPrizePool(serie.prizepool),
    winner: serie.winner?.type?.toLowerCase() === 'team' ? { id: serie.winner.id, name: serie.winner.name || null } : null,
    tournamentCount: (serie.tournaments || []).length,
    tournaments: (serie.tournaments || []).map(t => ({
      id: t.id,
      name: t.name,
      beginAt: t.begin_at || null,
      endAt: t.end_at || null,
      tier: t.tier || null,
    })),
  }
}

async function fetchSeriesList(token) {
  try {
    const cached = await kv.get(KV_SERIES_KEY)
    if (cached) {
      console.log('Series list: serving from KV cache')
      return cached
    }
  } catch (err) {
    console.warn('KV series cache read failed:', err?.message)
  }

  console.log('Series list: fetching from PandaScore')
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const [runningRes, upcomingRes, pastRes, runningToursRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=20`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=20`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/past?sort=-end_at&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=20`, { headers }),
  ])

  // All are non-fatal - a PandaScore blip shows empty sections, not an error banner.
  if (!runningRes.ok) console.warn('PandaScore running series failed:', runningRes.status)
  if (!upcomingRes.ok) console.warn('PandaScore upcoming series failed:', upcomingRes.status)
  if (!pastRes.ok) console.warn('PandaScore past series failed:', pastRes.status)
  if (!runningToursRes.ok) console.warn('PandaScore running tournaments failed:', runningToursRes.status)

  const [running, upcoming, past, runningTours] = await Promise.all([
    runningRes.ok ? runningRes.json() : Promise.resolve([]),
    upcomingRes.ok ? upcomingRes.json() : Promise.resolve([]),
    pastRes.ok ? pastRes.json() : Promise.resolve([]),
    runningToursRes.ok ? runningToursRes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
  ])

  // Build a set of serie_ids that still have active sub-tournaments.
  // PandaScore sometimes moves a series to /series/past before the final match ends.
  const runningTourSerieIds = new Set(
    (runningTours || []).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )

  // Fetch upcoming at the sub-stage (tournament) level as a fallback — PandaScore
  // creates series records late, but tournament sub-stage entries appear earlier.
  // Fetch tier s and a separately (comma syntax is unreliable on some plan tiers).
  const [upTourSRes, upTourARes] = await Promise.all([
    fetch(`https://api.pandascore.co/tournaments/upcoming?filter[videogame]=dota-2&filter[tier]=s&sort=begin_at&page[size]=20`, { headers }),
    fetch(`https://api.pandascore.co/tournaments/upcoming?filter[videogame]=dota-2&filter[tier]=a&sort=begin_at&page[size]=20`, { headers }),
  ])
  const [upTourS, upTourA] = await Promise.all([
    upTourSRes.ok ? upTourSRes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
    upTourARes.ok ? upTourARes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
  ])
  const upcomingTours = [...upTourS, ...upTourA]
  console.log(`Upcoming sub-stage tours: ${upcomingTours.length} (s:${upTourS.length} a:${upTourA.length})`)

  // Group sub-stage entries by serie_id; skip any serie_id already in the running list.
  const runningIds = new Set((running || []).map(s => s.id))
  const seenSerieIds = new Set()
  const syntheticUpcoming = []
  for (const t of (upcomingTours || [])) {
    const sid = t.serie_id || t.serie?.id
    if (!sid || runningIds.has(sid) || seenSerieIds.has(sid)) continue
    seenSerieIds.add(sid)
    syntheticUpcoming.push({
      id: sid,
      slug: t.serie?.slug || String(sid),
      name: t.serie?.full_name || t.serie?.name || t.league?.name || t.name || 'Upcoming Tournament',
      leagueName: t.league?.name || '',
      leagueSlug: t.league?.slug || '',
      status: 'upcoming',
      beginAt: t.begin_at || null,
      endAt: t.end_at || null,
      prizePool: formatPrizePool(t.prizepool),
      tournamentCount: 1,
      tournaments: [{ id: t.id, name: t.name, beginAt: t.begin_at, endAt: t.end_at, tier: t.tier }],
    })
  }

  // Merge series-level upcoming with synthetic entries; deduplicate by id.
  const allUpcoming = [
    ...(upcoming || []).filter(isTier1Series).map(s => mapSeries(s, 'upcoming')),
    ...syntheticUpcoming,
  ]
  const seenUpcomingIds = new Set()
  const deduplicatedUpcoming = allUpcoming.filter(s => {
    if (seenUpcomingIds.has(s.id)) return false
    seenUpcomingIds.add(s.id)
    return true
  })

  // Rescue any "past" series that still have running sub-tournaments — PandaScore
  // can move a series to /series/past before the Grand Finals match finishes.
  const completedFiltered = (past || []).filter(isTier1Series)
  const rescuedToLive = completedFiltered.filter(s => runningTourSerieIds.has(s.id))
  const trulyCompleted = completedFiltered.filter(s => !runningTourSerieIds.has(s.id))
  if (rescuedToLive.length > 0) {
    console.log(`Rescued ${rescuedToLive.length} series from past→live: ${rescuedToLive.map(s => s.full_name || s.name).join(', ')}`)
  }

  const payload = {
    live: [
      ...(running || []).filter(isTier1Series).map(s => mapSeries(s, 'live')),
      ...rescuedToLive.map(s => mapSeries(s, 'live')),
    ],
    upcoming: deduplicatedUpcoming,
    completed: trulyCompleted.slice(0, 5).map(s => mapSeries(s, 'completed')),
    fetchedAt: new Date().toISOString(),
  }

  try {
    await kv.set(KV_SERIES_KEY, payload, { ex: SERIES_TTL })
  } catch (err) {
    console.warn('KV series cache write failed:', err?.message)
  }

  return payload
}

// ── Grand Finals mode (?mode=grand-finals) ──────────────────────────────────
// Returns OpenDota match IDs (via PandaScore game.external_identifier) for
// recently completed Grand Final series. Used by LatestMatches/MyTeamsSection
// to detect and visually highlight Grand Final cards in the home feed.

const KV_GF_KEY = 'dota2:grand_final_match_ids_v1'
const GF_TTL = 60 * 60 // 1 hour

async function fetchGrandFinalMatchIds(token) {
  try {
    const cached = await kv.get(KV_GF_KEY)
    if (cached) {
      console.log('Grand finals: serving from KV cache')
      return cached
    }
  } catch (err) {
    console.warn('Grand finals KV read failed:', err?.message)
  }

  console.log('Grand finals: fetching from PandaScore')
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  // Step 1: Find recent Grand Final tournament stages by name.
  // Using the /tournaments endpoint with search[name] is more reliable than
  // scanning the last N past matches — those 100 matches can cover just a few
  // days and older Grand Finals simply won't appear.
  const tourRes = await fetch(
    `${PANDASCORE_BASE}/tournaments/past?search[name]=Grand+Final&sort=-end_at&page[size]=15`,
    { headers }
  )
  if (!tourRes.ok) throw new Error(`PandaScore tournaments error: ${tourRes.status}`)
  const tournaments = await tourRes.json()

  console.log(`Grand finals: found ${tournaments.length} Grand Final tournament stages`)

  if (!tournaments.length) {
    const empty = { matchIds: [], fetchedAt: new Date().toISOString() }
    await kv.set(KV_GF_KEY, empty, { ex: GF_TTL }).catch(() => {})
    return empty
  }

  // Step 2: Fetch the matches for each Grand Final stage in parallel.
  // Each match has games[].external_identifier which is the OpenDota match_id.
  const matchArrays = await Promise.all(
    tournaments.map(t =>
      fetch(`${PANDASCORE_BASE}/tournaments/${t.id}/matches?page[size]=10`, { headers })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  )

  const matchIds = []
  for (const matches of matchArrays) {
    for (const m of (matches || [])) {
      for (const g of (m.games || [])) {
        if (g.external_identifier) matchIds.push(String(g.external_identifier))
      }
    }
  }
  console.log(`Grand finals: ${tournaments.length} stages, ${matchIds.length} game IDs collected`)

  const payload = { matchIds, fetchedAt: new Date().toISOString() }
  try {
    await kv.set(KV_GF_KEY, payload, { ex: GF_TTL })
  } catch (err) {
    console.warn('Grand finals KV write failed:', err?.message)
  }
  return payload
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  // Grand Finals mode — returns OpenDota match IDs for Grand Final games
  if (req.query?.mode === 'grand-finals') {
    if (req.query?.bust === '1') {
      await kv.del(KV_GF_KEY).catch(() => {})
      console.log('Grand finals cache cleared')
    }
    try {
      const data = await fetchGrandFinalMatchIds(token)
      return res.status(200).json(data)
    } catch (err) {
      console.error('Grand finals error:', err?.message || err)
      // Fail open so the UI degrades gracefully
      return res.status(200).json({ matchIds: [], fetchedAt: new Date().toISOString(), error: err?.message })
    }
  }

  // Series list mode — for /tournaments page and TournamentBar
  if (req.query?.mode === 'series') {
    if (req.query?.bust === '1') {
      await kv.del(KV_SERIES_KEY).catch(() => {})
      console.log('Series list cache cleared')
    }
    try {
      const data = await fetchSeriesList(token)
      return res.status(200).json(data)
    } catch (err) {
      console.error('Series list error:', err?.message || err)
      return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
    }
  }

  // Default mode — existing TournamentHub behavior (tournament sub-stages)
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
      completed: list.completed || [],
      meta: { listFetchedAt: list.fetchedAt, statusesFresh: Object.keys(statuses).length > 0 }
    })

  } catch (err) {
    console.error('Tournaments API error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

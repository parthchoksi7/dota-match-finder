import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ─── iCal helpers (used by calendar modes) ────────────────────────────────────

const CRLF = '\r\n'

function icalEscapeText(str) {
  if (!str) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function icalFoldLine(line) {
  if (line.length <= 75) return line
  const parts = []
  let pos = 0
  parts.push(line.slice(0, 75))
  pos = 75
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + 74))
    pos += 74
  }
  return parts.join(CRLF)
}

function icalFormatDateUTC(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
}

function icalFormatDateOnly(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const pad = n => String(n).padStart(2, '0')
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
}

function icalMatchDurationHours(matchType) {
  if (!matchType) return 2
  const lower = matchType.toLowerCase()
  if (lower.includes('best_of_1')) return 1
  if (lower.includes('best_of_5')) return 3
  return 2
}

function icalFormatLabel(matchType) {
  if (!matchType) return 'Bo3'
  if (matchType === 'best_of_1') return 'Bo1'
  if (matchType === 'best_of_2') return 'Bo2'
  if (matchType === 'best_of_3') return 'Bo3'
  if (matchType === 'best_of_5') return 'Bo5'
  return matchType
}

function icalMatchEvent(match, dtstamp) {
  const beginAt = match.begin_at || match.scheduled_at
  if (!beginAt) return null
  const start = new Date(beginAt)
  if (isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + icalMatchDurationHours(match.match_type) * 3600000)
  const opponents = match.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const league = match.league?.name || ''
  const serie = match.serie?.full_name || match.serie?.name || ''
  const tournament = match.tournament?.name || ''
  const combined = league && serie
    ? (serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`)
    : league || serie || tournament || 'Unknown Tournament'
  const lines = [
    'BEGIN:VEVENT',
    `UID:spectate-match-${match.id}@spectateesports.live`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icalFormatDateUTC(start)}`,
    `DTEND:${icalFormatDateUTC(end)}`,
    `SUMMARY:${icalEscapeText(`${teamA} vs ${teamB} - ${combined}`)}`,
    `DESCRIPTION:${icalEscapeText(`Watch VODs at https://spectateesports.live\n\nTournament: ${combined}\nFormat: ${icalFormatLabel(match.match_type)}\nStage: ${tournament}`)}`,
    'URL:https://spectateesports.live',
    'STATUS:CONFIRMED',
    'CATEGORIES:Dota 2,Esports',
    'END:VEVENT',
  ]
  return lines.map(icalFoldLine).join(CRLF)
}

function icalSeriesDisplayName(series) {
  const league = series.league?.name || ''
  const raw = series.full_name || series.name || ''
  // Strip 4-digit year (e.g. "Birmingham 2026" → "Birmingham")
  const shortName = raw.replace(/\s*\b20\d\d\b/g, '').replace(/\s+/g, ' ').trim()
  if (league && shortName && !shortName.toLowerCase().startsWith(league.toLowerCase())) {
    return `${league} ${shortName} - Dota 2`
  }
  return `${shortName || 'Dota 2 Tournament'} - Dota 2`
}

function icalTournamentEvent(series, dtstamp, latestMatchEnd) {
  if (!series.begin_at) return null
  const start = new Date(series.begin_at)
  if (isNaN(start.getTime())) return null
  // Use end_at if available; fall back to latestMatchEnd; then start itself
  const endDate = series.end_at
    ? new Date(series.end_at)
    : (latestMatchEnd instanceof Date && !isNaN(latestMatchEnd) ? latestMatchEnd : start)
  const endPlus1 = new Date(endDate.getTime() + 86400000)
  const displayName = icalSeriesDisplayName(series)
  const descParts = [displayName]
  if (series.prizepool) descParts.push(`Prize Pool: $${Number(series.prizepool).toLocaleString()}`)
  if (series.location) descParts.push(`Location: ${series.location}`)
  descParts.push(`\nMore info: https://spectateesports.live/tournament/${series.id}`)
  const lines = [
    'BEGIN:VEVENT',
    `UID:spectate-series-${series.id}@spectateesports.live`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${icalFormatDateOnly(start)}`,
    `DTEND;VALUE=DATE:${icalFormatDateOnly(endPlus1)}`,
    `SUMMARY:${icalEscapeText(displayName)}`,
    `DESCRIPTION:${icalEscapeText(descParts.join('\n'))}`,
    'TRANSP:TRANSPARENT',
    'CATEGORIES:Dota 2,Esports,Tournament',
    'END:VEVENT',
  ]
  return lines.map(icalFoldLine).join(CRLF)
}

function icalWrapCalendar(calName, eventBlocks) {
  const header = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Spectate Esports//Dota 2 Match Calendar//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalEscapeText(calName)}`,
    'X-WR-TIMEZONE:UTC', 'X-PUBLISHED-TTL:PT1H',
  ].map(icalFoldLine).join(CRLF)
  const parts = [header, ...eventBlocks.filter(Boolean), 'END:VCALENDAR']
  return parts.join(CRLF) + CRLF
}

// ─── Team slug normalization (calendar modes) ─────────────────────────────────

const CAL_SLUG_ALIASES = {
  'liquid': 'team-liquid', 'teamliquid': 'team-liquid',
  'tundra': 'tundra-esports',
  'spirit': 'team-spirit', 'teamspirit': 'team-spirit',
  'betboom': 'betboom', 'bb': 'betboom',
  'yandex': 'team-yandex', 'teamyandex': 'team-yandex',
  'falcons': 'team-falcons', 'teamfalcons': 'team-falcons',
  'gaimin': 'gaimin-gladiators', 'gladiators': 'gaimin-gladiators', 'gaimingladiators': 'gaimin-gladiators',
  'aurora': 'aurora-gaming',
  'talon': 'talon-esports',
  'nouns': 'nouns-esports',
  'og': 'og',
  'navi': 'natus-vincere', 'natusvincere': 'natus-vincere',
  'virtuspro': 'virtus-pro', 'vp': 'virtus-pro',
  'secret': 'team-secret', 'teamsecret': 'team-secret',
  'aster': 'team-aster', 'teamaster': 'team-aster',
}

function normalizeTeamSlug(input) {
  const clean = input.toLowerCase().replace(/[\s\-_]/g, '')
  return CAL_SLUG_ALIASES[clean] || input.toLowerCase().trim()
}

const CAL_MATCHES_TTL = 60 * 30
const CAL_TEAM_ID_TTL = 60 * 60 * 24

async function calResolveTeamId(slug, token, kv) {
  const cacheKey = `calendar:team_id:${slug}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return cached
  } catch {}
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const res = await fetch(`${PANDASCORE_BASE}/teams?filter[slug]=${encodeURIComponent(slug)}&page[size]=1`, { headers })
  if (res.ok) {
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const id = data[0].id
      try { await kv.set(cacheKey, id, { ex: CAL_TEAM_ID_TTL }) } catch {}
      return id
    }
  }
  const searchRes = await fetch(`${PANDASCORE_BASE}/teams?search[name]=${encodeURIComponent(slug)}&page[size]=1`, { headers })
  if (!searchRes.ok) return null
  const searchData = await searchRes.json()
  if (!Array.isArray(searchData) || searchData.length === 0) return null
  const id = searchData[0].id
  try { await kv.set(cacheKey, id, { ex: CAL_TEAM_ID_TTL }) } catch {}
  return id
}

async function calFetchMatchesForTeam(teamId, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const sevenDaysAhead = new Date(Date.now() + 7 * 86400000).toISOString()
  const [upRes, runRes, pastRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/matches/upcoming?filter[opponent_id]=${teamId}&sort=scheduled_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/matches/running?filter[opponent_id]=${teamId}&page[size]=10`, { headers }),
    fetch(`${PANDASCORE_BASE}/matches/past?filter[opponent_id]=${teamId}&sort=-end_at&page[size]=20&range[end_at]=${sevenDaysAgo},${sevenDaysAhead}`, { headers }),
  ])
  const results = await Promise.allSettled([
    upRes.ok ? upRes.json() : Promise.resolve([]),
    runRes.ok ? runRes.json() : Promise.resolve([]),
    pastRes.ok ? pastRes.json() : Promise.resolve([]),
  ])
  return [
    ...(results[0].status === 'fulfilled' ? results[0].value || [] : []),
    ...(results[1].status === 'fulfilled' ? results[1].value || [] : []),
    ...(results[2].status === 'fulfilled' ? results[2].value || [] : []),
  ]
}

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_LIST_KEY = 'dota2:tournament_list_v4'
const KV_STATUS_KEY = 'dota2:tournament_statuses_v3'
const LIST_TTL = 60 * 60 * 6        // 6 hours — catches stage transitions (Group → Playoffs)
const STATUS_TTL = 60 * 60 * 4      // 4 hours

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'
// filter[tier] returns 400 on game-specific endpoints; use the generic base with
// filter[videogame]=dota-2 for any fetch that needs filter[tier] support.
const PANDASCORE_GENERIC_DOTA = 'https://api.pandascore.co/tournaments'
const DOTA2_VG = 'filter[videogame]=dota-2'

// Tournament objects from /tournaments/* have tier on their parent league.
function isTier1(t) {
  const tier = (t?.league?.tier || '').toLowerCase()
  return tier === 's' || tier === 'a'
}

// Series objects from /series/* carry tier directly on the series record.
function isTier1Series(s) {
  const tier = (s?.tier || '').toLowerCase()
  return tier === 's' || tier === 'a'
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
    fetch(`${PANDASCORE_GENERIC_DOTA}/running?${DOTA2_VG}&sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_GENERIC_DOTA}/upcoming?${DOTA2_VG}&sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_GENERIC_DOTA}/past?${DOTA2_VG}&sort=-end_at&page[size]=20`, { headers }),
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
    ongoing: (running || []).filter(isTier1).map(t => mapTournament(t, 'running')),
    upcoming: (upcoming || []).filter(isTier1).slice(0, 5).map(t => mapTournament(t, 'upcoming')),
    completed: (past || []).filter(isTier1).slice(0, 3).map(t => mapTournament(t, 'completed')),
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
    fetch(`${PANDASCORE_GENERIC_DOTA}/running?${DOTA2_VG}&sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_GENERIC_DOTA}/upcoming?${DOTA2_VG}&sort=begin_at&page[size]=50`, { headers }),
  ])
  const [running, upcoming] = await Promise.all([
    runningRes.ok ? runningRes.json() : Promise.resolve([]),
    upcomingRes.ok ? upcomingRes.json() : Promise.resolve([]),
  ])

  const statuses = {}
  // Track full tournament objects for newly-discovered running stages
  const newRunning = []

  for (const t of (running || [])) {
    if (isTier1(t)) {
      statuses[t.id] = 'running'
      newRunning.push(t)
    }
  }
  for (const t of (upcoming || [])) {
    if (isTier1(t)) statuses[t.id] = 'upcoming'
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

  // No filter[tier] on any endpoint -- use large page sizes and rely on client-side
  // isTier1 / isTier1Series filtering.
  const [runSerRes, upSerRes, pastSerRes, runTourRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/past?sort=-end_at&page[size]=20`, { headers }),
    fetch(`${PANDASCORE_GENERIC_DOTA}/running?${DOTA2_VG}&sort=begin_at&page[size]=50`, { headers }),
  ])

  const toArr = async (res) => {
    if (!res.ok) { console.warn('PandaScore series fetch failed:', res.status); return [] }
    const d = await res.json()
    return Array.isArray(d) ? d : []
  }
  const [running, upcoming, past, runningTours] = await Promise.all([
    toArr(runSerRes),
    toArr(upSerRes),
    toArr(pastSerRes),
    runTourRes.ok ? runTourRes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
  ])

  // Build a set of serie_ids that still have active sub-tournaments.
  // PandaScore sometimes moves a series to /series/past before the final match ends.
  const runningTourSerieIds = new Set(
    (runningTours || []).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )

  // Fetch upcoming at the sub-stage (tournament) level as a fallback — PandaScore
  // creates series records late, but tournament sub-stage entries appear earlier.
  const upTourRes = await fetch(`${PANDASCORE_GENERIC_DOTA}/upcoming?${DOTA2_VG}&sort=begin_at&page[size]=100`, { headers })
  const upcomingTours = upTourRes.ok ? await upTourRes.json().then(d => Array.isArray(d) ? d : []) : []
  console.log(`Upcoming sub-stage tours (all tiers, client-filtered): ${upcomingTours.length}`)

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

const KV_GF_KEY = 'dota2:grand_final_match_ids_v2'
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

  // Calendar team feed mode (?mode=calendar-team&teams=slug1,slug2)
  if (req.query?.mode === 'calendar-team') {
    const teamsParam = req.query?.teams || ''
    if (!teamsParam) {
      return res.status(400).send('Missing required parameter: teams')
    }
    const teamSlugs = teamsParam.split(',').map(s => s.trim()).filter(Boolean).map(normalizeTeamSlug).slice(0, 10)
    if (teamSlugs.length === 0) return res.status(400).send('No valid team slugs provided')

    console.log(`calendar-team: teams=${teamSlugs.join(',')}`)
    const cacheKey = `calendar:matches:${[...teamSlugs].sort().join(',')}`
    let matches = null
    try { matches = await kv.get(cacheKey) } catch {}

    if (!matches) {
      try {
        const teamIds = await Promise.all(teamSlugs.map(slug => calResolveTeamId(slug, token, kv)))
        const validIds = teamIds.filter(Boolean)
        if (validIds.length === 0) return res.status(404).send(`No teams found for: ${teamSlugs.join(', ')}`)
        const matchArrays = await Promise.all(validIds.map(id => calFetchMatchesForTeam(id, token).catch(() => [])))
        const seen = new Set()
        matches = []
        for (const arr of matchArrays) {
          for (const m of arr) { if (!seen.has(m.id)) { seen.add(m.id); matches.push(m) } }
        }
        matches.sort((a, b) => ((a.begin_at || a.scheduled_at || '') < (b.begin_at || b.scheduled_at || '') ? -1 : 1))
        try { await kv.set(cacheKey, matches, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
      } catch (err) {
        console.error('calendar-team error:', err?.message)
        return res.status(500).send(`Failed to fetch match data: ${err.message}`)
      }
    }

    const dtstamp = icalFormatDateUTC(new Date())
    const eventBlocks = matches.map(m => icalMatchEvent(m, dtstamp)).filter(Boolean)
    const icsContent = icalWrapCalendar(`Dota 2 - ${teamSlugs.join(', ')}`, eventBlocks)
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="dota2-matches.ics"')
    res.setHeader('Cache-Control', 'public, max-age=1800')
    return res.status(200).send(icsContent)
  }

  // All-tournaments calendar feed (?mode=calendar-all)
  // One subscription URL — every running/upcoming tournament and their matches appear automatically.
  if (req.query?.mode === 'calendar-all') {
    const cacheKey = 'calendar:all'
    if (req.query?.bust === '1') { try { await kv.del(cacheKey) } catch {} }
    let cached = null
    try { cached = await kv.get(cacheKey) } catch {}

    let allSeries, allMatches
    if (cached) {
      allSeries = cached.allSeries
      allMatches = cached.allMatches
    } else {
      try {
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        const toArr = async (r) => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
        // Fetch all running+upcoming series and all running+upcoming matches in parallel
        const [runSerR, upSerR, runMatchR, upMatchR] = await Promise.all([
          fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/running?sort=scheduled_at&page[size]=100`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=100`, { headers }),
        ])
        const [runSer, upSer, runMatch, upMatch] = await Promise.all([
          runSerR.ok ? toArr(runSerR) : Promise.resolve([]),
          upSerR.ok ? toArr(upSerR) : Promise.resolve([]),
          runMatchR.ok ? toArr(runMatchR) : Promise.resolve([]),
          upMatchR.ok ? toArr(upMatchR) : Promise.resolve([]),
        ])
        allSeries = [...runSer, ...upSer].filter(isTier1Series)
        const tier1SerieIds = new Set(allSeries.map(s => s.id))
        allMatches = [...runMatch, ...upMatch].filter(m => {
          const sid = m.serie_id || m.serie?.id
          return sid && tier1SerieIds.has(sid)
        })
        try { await kv.set(cacheKey, { allSeries, allMatches }, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
      } catch (err) {
        console.error('calendar-all error:', err?.message)
        return res.status(500).send(`Failed to fetch tournament data: ${err.message}`)
      }
    }

    const dtstamp = icalFormatDateUTC(new Date())
    // Build a map of latest match end per series for accurate banner event duration
    const matchEndBySeries = {}
    for (const m of allMatches) {
      const sid = m.serie_id || m.serie?.id
      if (!sid) continue
      const ts = new Date(m.end_at || m.begin_at || m.scheduled_at)
      if (isNaN(ts)) continue
      if (!matchEndBySeries[sid] || ts > matchEndBySeries[sid]) matchEndBySeries[sid] = ts
    }
    const seriesEvents = allSeries.map(s => icalTournamentEvent(s, dtstamp, matchEndBySeries[s.id] || null)).filter(Boolean)
    const matchEvents = allMatches.map(m => icalMatchEvent(m, dtstamp)).filter(Boolean)
    const icsContent = icalWrapCalendar('Dota 2 Esports', [...seriesEvents, ...matchEvents])
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="dota2-esports.ics"')
    res.setHeader('Cache-Control', 'public, max-age=1800')
    return res.status(200).send(icsContent)
  }

  // Calendar tournament feed mode (?mode=calendar-tournament&series={id})
  if (req.query?.mode === 'calendar-tournament') {
    const seriesId = parseInt(req.query?.series, 10)
    if (!seriesId || seriesId <= 0) return res.status(400).send('Missing or invalid parameter: series')

    console.log(`calendar-tournament: series=${seriesId}`)
    const cacheKey = `calendar:series:${seriesId}`
    if (req.query?.bust === '1') { try { await kv.del(cacheKey) } catch {} }
    let cached = null
    try { cached = await kv.get(cacheKey) } catch {}

    let series, matches
    if (cached) {
      series = cached.series
      matches = cached.matches
    } else {
      try {
        const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        // Direct /series/{id} returns 404 on current plan tier - use filter[id] on list endpoints instead
        const [runSR, upSR, pastSR] = await Promise.all([
          fetch(`${PANDASCORE_BASE}/series/running?filter[id]=${seriesId}`, { headers }),
          fetch(`${PANDASCORE_BASE}/series/upcoming?filter[id]=${seriesId}`, { headers }),
          fetch(`${PANDASCORE_BASE}/series/past?filter[id]=${seriesId}`, { headers }),
        ])
        const toArr = async (r) => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
        const [runSD, upSD, pastSD] = await Promise.all([
          runSR.ok ? toArr(runSR) : Promise.resolve([]),
          upSR.ok ? toArr(upSR) : Promise.resolve([]),
          pastSR.ok ? toArr(pastSR) : Promise.resolve([]),
        ])
        series = [...runSD, ...upSD, ...pastSD][0]
        if (!series) throw new Error(`Series ${seriesId} not found`)
        // Fetch matches using filter[serie_id] on running/upcoming/past endpoints
        const [runMR, upMR, pastMR] = await Promise.all([
          fetch(`${PANDASCORE_BASE}/matches/running?filter[serie_id]=${seriesId}&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/upcoming?filter[serie_id]=${seriesId}&sort=scheduled_at&page[size]=100`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/past?filter[serie_id]=${seriesId}&sort=-scheduled_at&page[size]=50`, { headers }),
        ])
        const [runMD, upMD, pastMD] = await Promise.all([
          runMR.ok ? toArr(runMR) : Promise.resolve([]),
          upMR.ok ? toArr(upMR) : Promise.resolve([]),
          pastMR.ok ? toArr(pastMR) : Promise.resolve([]),
        ])
        matches = [...runMD, ...upMD, ...pastMD]
        if (!Array.isArray(matches)) matches = []
        try { await kv.set(cacheKey, { series, matches }, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
      } catch (err) {
        console.error('calendar-tournament error:', err?.message)
        return res.status(500).send(`Failed to fetch tournament data: ${err.message}`)
      }
    }

    const dtstamp = icalFormatDateUTC(new Date())
    const matchEnds = matches.map(m => new Date(m.end_at || m.begin_at || m.scheduled_at)).filter(d => !isNaN(d))
    const latestMatchEnd = matchEnds.length ? new Date(Math.max(...matchEnds.map(d => d.getTime()))) : null
    const eventBlocks = [icalTournamentEvent(series, dtstamp, latestMatchEnd), ...matches.map(m => icalMatchEvent(m, dtstamp))].filter(Boolean)
    const icsContent = icalWrapCalendar(icalSeriesDisplayName(series), eventBlocks)
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="dota2-tournament-${seriesId}.ics"`)
    res.setHeader('Cache-Control', 'public, max-age=1800')
    return res.status(200).send(icsContent)
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

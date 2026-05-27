import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'

import { isTier1ByFields, isTier1 as isTier1Match, isTier1ByName, buildTournamentName as buildMatchTournamentName, parseBracketRound, PERMANENT_TIER1_NAMES as SHARED_PERMANENT_TIER1_NAMES, STREAM_TTL, KV_TIER1_NAMES_KEY, findOdMatchByTime, buildPremiumLeagueIds, trackError, checkServices, findLeague } from './_shared.js'

// ─── YouTube highlights config ────────────────────────────────────────────────

const YT_HIGHLIGHTS_TTL = 60 * 60 * 6 // 6 hours
const YT_HIGHLIGHTS_MAX_AGE_DAYS = 90

// Maps tournament name keywords to the official YouTube channel for that org.
// Channel IDs verified via youtube.com/channel/ URLs in May 2026.
const YT_CHANNEL_MAP = [
  { keywords: ['dreamleague', 'esl one'], channelId: 'UCaYLBJfw6d8XqmNlL204lNg', handle: '@ESLDota2' },
  { keywords: ['pgl', 'wallachia'],       channelId: 'UC5jpxDZx4yoBo324pMQ91Ww', handle: '@PGL_DOTA2' },
  { keywords: ['blast'],                  channelId: 'UCAvIC2XmBLLXFPdveirTrmw', handle: '@BLASTDota' },
  { keywords: ['weplay', 'omega league'], channelId: 'UCdIRwwGQY68S95bQuUVX0sA', handle: '@WePlayDota' },
  { keywords: ['the international', 'riyadh masters', 'beyond the summit'],
                                          channelId: 'UCTQKT5QqO3h7y32G8VzuySQ', handle: '@dota2' },
]

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

const KV_LIST_KEY = 'dota2:tournament_list_v7'
const KV_STATUS_KEY = 'dota2:tournament_statuses_v5'
const LIST_TTL = 60 * 60 * 6        // 6 hours - catches stage transitions (Group -> Playoffs)
const STATUS_TTL = 60 * 60 * 4      // 4 hours

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

// Adapter for tournament objects from /dota2/tournaments/* (tier on t.tier directly,
// not on t.league.tier which is always null). Delegates to the centralised
// isTier1ByFields in _shared.js so the league-name keyword override is applied here too.
// Also checks SHARED_PERMANENT_TIER1_NAMES so manually whitelisted organizers (e.g. 1win Essence)
// appear in the TournamentHub regardless of their PandaScore tier.
function isTier1(t) {
  if (isTier1ByFields(t?.tier, t?.league?.name)) return true
  const leagueName = (t?.league?.name || '').toLowerCase()
  return SHARED_PERMANENT_TIER1_NAMES.some(n => leagueName.includes(n.toLowerCase()))
}


function buildTournamentName(t) {
  const league = t.league?.name || ''
  const serie = t.serie?.full_name || t.serie?.name || ''
  const stage = t.name || ''
  if (league && serie) {
    const base = serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`
    return `${base}${stage && stage !== 'Season' ? ` - ${stage}` : ''}`
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
    serieId: t.serie_id || t.serie?.id || null,
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
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/past?sort=-end_at&page[size]=20`, { headers }),
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
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=50`, { headers }),
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

const KV_SERIES_KEY = 'tournaments:dota2:series_list_v8'
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

  // No filter[tier] on any endpoint -- use large page sizes and cross-reference
  // with tournament objects (which have t.tier) to derive tier for series.
  const [runSerRes, upSerRes, pastSerRes, runTourRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/series/past?sort=-end_at&page[size]=20`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
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

  console.log(`Series raw counts - running:${(running||[]).length} upcoming:${(upcoming||[]).length} past:${(past||[]).length}`)

  // Series objects from /dota2/series/* have no tier field (s.tier is always null).
  // Derive tier by cross-referencing with tournament objects (which have t.tier populated).
  // Build tier-1 serie_id sets from each tournament list.
  const tier1RunningSerieIds = new Set(
    (runningTours || []).filter(isTier1).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )

  // All running tournament serie_ids (regardless of tier) - used for the rescue logic.
  const runningTourSerieIds = new Set(
    (runningTours || []).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )

  // Fetch upcoming and past tournaments in parallel for tier derivation.
  // Upcoming: also used for syntheticUpcoming fallback (series records appear late).
  const [upTourRes, pastTourRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=100`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/past?sort=-end_at&page[size]=50`, { headers }),
  ])
  const upcomingTours = upTourRes.ok ? await upTourRes.json().then(d => Array.isArray(d) ? d : []) : []
  const pastTours = pastTourRes.ok ? await pastTourRes.json().then(d => Array.isArray(d) ? d : []) : []

  const tier1UpcomingSerieIds = new Set(
    (upcomingTours || []).filter(isTier1).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )
  const tier1PastSerieIds = new Set(
    (pastTours || []).filter(isTier1).map(t => t.serie_id || t.serie?.id).filter(Boolean)
  )

  console.log(`Tier-1 serie_ids - running:${tier1RunningSerieIds.size} upcoming:${tier1UpcomingSerieIds.size} past:${tier1PastSerieIds.size} | upcomingTours total:${upcomingTours.length} pastTours total:${pastTours.length}`)

  // Group upcoming sub-stage entries by serie_id.
  // Only skip a serie_id if it will actually appear in the live section (tier1RunningSerieIds),
  // not just because the series object exists in the running list (runningIds would be wrong
  // here because series objects have no tier info - a "running" series with no tier-1 running
  // tournaments would be blocked from upcoming but also absent from live).
  const seenSerieIds = new Set()
  const syntheticUpcoming = []
  for (const t of (upcomingTours || [])) {
    if (!isTier1(t)) continue
    const sid = t.serie_id || t.serie?.id
    if (!sid || tier1RunningSerieIds.has(sid) || seenSerieIds.has(sid)) continue
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

  // Merge series-level upcoming (filtered by tier-1 serie_id set) with synthetic entries.
  const allUpcoming = [
    ...(upcoming || []).filter(s => tier1UpcomingSerieIds.has(s.id)).map(s => mapSeries(s, 'upcoming')),
    ...syntheticUpcoming,
  ]
  const seenUpcomingIds = new Set()
  const deduplicatedUpcoming = allUpcoming.filter(s => {
    if (seenUpcomingIds.has(s.id)) return false
    seenUpcomingIds.add(s.id)
    return true
  })

  // Rescue any "past" series that still have running sub-tournaments - PandaScore
  // can move a series to /series/past before the Grand Finals match finishes.
  const completedFiltered = (past || []).filter(s => tier1PastSerieIds.has(s.id))
  const rescuedToLive = completedFiltered.filter(s => runningTourSerieIds.has(s.id))
  const trulyCompleted = completedFiltered.filter(s => !runningTourSerieIds.has(s.id))
  console.log(`After tier filter - live:${(running||[]).filter(s => tier1RunningSerieIds.has(s.id)).length}/${(running||[]).length} upcoming:${(upcoming||[]).filter(s => tier1UpcomingSerieIds.has(s.id)).length}/${(upcoming||[]).length} past:${completedFiltered.length}/${(past||[]).length} | synthetic:${syntheticUpcoming.length} deduped:${deduplicatedUpcoming.length}`)
  if (rescuedToLive.length > 0) {
    console.log(`Rescued ${rescuedToLive.length} series from past→live: ${rescuedToLive.map(s => s.full_name || s.name).join(', ')}`)
  }

  const payload = {
    live: [
      ...(running || []).filter(s => tier1RunningSerieIds.has(s.id)).map(s => mapSeries(s, 'live')),
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

// ── Tier 1 league names mode (?mode=tier1-leagues) ──────────────────────────
// Returns the unique PandaScore league names for Tier S/A tournaments.
// Used by src/api.js to filter OpenDota promatches to only Tier 1 events,
// replacing the broader OpenDota "professional" tier classification.

const TIER1_NAMES_TTL = 60 * 60 * 2 // 2 hours

// Permanent tier 1 league organizers — always included regardless of PandaScore
// tier assignment state. Covers the case where PandaScore creates a new series
// (e.g. DreamLeague S29) before assigning a tier to its tournament object.
const PERMANENT_TIER1_NAMES = [
  'DreamLeague',
  'ESL One',
  'PGL',
  'PGL Wallachia',
  'BLAST',
  'The International',
  'Beyond The Summit',
  'WePlay',
  'Riyadh Masters',
  '1win Essence',
]

async function fetchTier1LeagueNames(token) {
  try {
    const cached = await kv.get(KV_TIER1_NAMES_KEY)
    if (cached) {
      console.log('tier1-leagues: serving from KV cache')
      return cached
    }
  } catch (err) {
    console.warn('tier1-leagues KV read failed:', err?.message)
  }

  console.log('tier1-leagues: fetching from PandaScore')
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const toArr = async res => {
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  }

  // Fetch running, upcoming, and recent past (30 entries = ~6 months) tournaments.
  // Past window is intentionally small to avoid including leagues that were
  // temporarily Tier A years ago but are no longer relevant.
  const [runRes, upRes, pastRes] = await Promise.all([
    fetch(`${PANDASCORE_BASE}/tournaments/running?page[size]=50`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=100`, { headers }),
    fetch(`${PANDASCORE_BASE}/tournaments/past?sort=-end_at&page[size]=30`, { headers }),
  ])
  const [run, up, past] = await Promise.all([toArr(runRes), toArr(upRes), toArr(pastRes)])

  // isTier1 here is the LOCAL function (checks t?.tier directly on tournament objects).
  // min-length guard (>= 3 chars) prevents accidental broad matches from short org names.
  const dynamicNames = [...run, ...up, ...past]
    .filter(isTier1)
    .map(t => t.league?.name)
    .filter(n => n && n.length >= 3)

  // Merge permanent + dynamic; Set deduplicates when PandaScore also returns the same name.
  const names = [...new Set([...PERMANENT_TIER1_NAMES, ...dynamicNames])]

  console.log(`tier1-leagues: ${names.length} names — ${names.join(', ')}`)

  // Never cache an empty result — would poison the filter until TTL expires.
  if (names.length > 0) {
    kv.set(KV_TIER1_NAMES_KEY, names, { ex: TIER1_NAMES_TTL }).catch(() => {})
  }
  return names
}

// ── Recent Completed mode (?mode=recent-completed) ──────────────────────────
// Returns recently-completed tier-1 series from PandaScore, formatted as match
// objects shaped identically to fetchProMatches() output. Used by the frontend
// to bridge the 30min–several-hour OpenDota /promatches indexing lag.
// Kill scores are unavailable from PandaScore; radiantScore/direScore are null.

const KV_RC_KEY = 'dota2:recent_completed_v4'
const RC_TTL = 60 * 5  // 5 minutes

const FORMAT_TO_SERIES_TYPE_RC = { best_of_1: 0, best_of_2: 3, best_of_3: 1, best_of_5: 2 }

function calcDuration(game) {
  if (game.length != null) return new Date(game.length * 1000).toISOString().slice(11, 16)
  if (game.begin_at && game.end_at) {
    const secs = Math.max(0, Math.floor((new Date(game.end_at) - new Date(game.begin_at)) / 1000))
    return new Date(secs * 1000).toISOString().slice(11, 16)
  }
  return '00:00'
}

// Fetch OD promatches from the last 8h. Used to resolve PS game begin_at → OD match_id
// without relying on PS's external_identifier (which requires OD to have already indexed).
async function fetchOdPromatches() {
  try {
    const res = await fetch('https://api.opendota.com/api/promatches')
    if (!res.ok) return []
    const all = await res.json()
    const cutoff = Date.now() / 1000 - 8 * 3600
    return Array.isArray(all) ? all.filter(m => m.start_time > cutoff) : []
  } catch {
    return []
  }
}


async function fetchRecentCompleted(token, bust = false) {
  if (!bust) {
    try {
      const cached = await kv.get(KV_RC_KEY)
      if (cached) {
        console.log('recent-completed: serving from KV cache')
        return cached
      }
    } catch (err) {
      console.warn('recent-completed KV read failed:', err?.message)
    }
  }

  console.log('recent-completed: fetching from PandaScore + OD promatches')
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  const now = new Date().toISOString()
  // filter[tier] is not supported on /dota2/matches/* endpoints (returns 400) — fetch
  // without tier filter and apply isTier1Match / isTier1ByName client-side instead.
  const ago8h = new Date(Date.now() - 8 * 3600 * 1000).toISOString()
  const psUrl = `${PANDASCORE_BASE}/matches/past?sort=-end_at&page[size]=50&range[end_at]=${ago8h},${now}`

  let psMatches, odMatches
  try {
    ;[psMatches, odMatches] = await Promise.all([
      fetch(psUrl, { headers })
        .then(r => { if (!r.ok) throw new Error(`PS HTTP ${r.status}`); return r.json() })
        .then(d => Array.isArray(d) ? d : []),
      fetchOdPromatches(),
    ])
  } catch (err) {
    throw new Error(`recent-completed fetch failed: ${err.message}`)
  }

  // Build name list for isTier1ByName fallback (catches leagues where tier is null)
  let tier1Names = []
  try {
    const cached = await kv.get(KV_TIER1_NAMES_KEY)
    if (Array.isArray(cached)) tier1Names = cached.map(n => n.toLowerCase())
  } catch {}
  const permanentNames = SHARED_PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
  const allNames = [...new Set([...permanentNames, ...tier1Names])]

  const rawCount = psMatches.length
  psMatches = psMatches.filter(m => isTier1Match(m) || isTier1ByName(m, allNames))
  console.log(`recent-completed: ${rawCount} raw → ${psMatches.length} tier-1, ${odMatches.length} OD promatches in window`)

  const games = []

  for (const m of psMatches) {
    const opponents = m.opponents || []
    const matchGames = (m.games || []).filter(g => g.status === 'finished')
    if (matchGames.length === 0) continue

    const seriesType = FORMAT_TO_SERIES_TYPE_RC[m.match_type] ?? 1
    const tournamentName = buildMatchTournamentName(m)

    // Batch KV read: ID keys + fingerprint keys (written by Tier 2 backfill below)
    let kvVals = [], kvFps = []
    try {
      const idKeys = matchGames.map(g => `live:game:${m.id}:${g.position}`)
      const fpKeys = matchGames.map(g => `live:game:${m.id}:${g.position}:fp`)
      const allVals = await kv.mget(...idKeys, ...fpKeys)
      kvVals = allVals.slice(0, matchGames.length)
      kvFps  = allVals.slice(matchGames.length)
    } catch {}

    for (let i = 0; i < matchGames.length; i++) {
      const g = matchGames[i]

      // Tier 1: KV fast path (populated by live-matches cron during live phase)
      let resolvedId = kvVals[i] ? String(kvVals[i]) : null

      // Validate KV-cached ID against team names.
      // - In OD window (< 8h): validate against live OD data.
      // - Stale (>= 8h) with fingerprint: validate against stored team names so wrong
      //   IDs written by a prior buggy resolution don't survive indefinitely.
      // - Stale without fingerprint (written by live-matches cron): trust as before.
      if (resolvedId) {
        const sub = (x, y) => x.includes(y) || y.includes(x)
        const psTeams = opponents.map(o => (o.opponent?.name || '').toLowerCase()).filter(Boolean)
        const cachedOd = odMatches.find(m => String(m.match_id) === resolvedId)
        if (cachedOd) {
          const r = (cachedOd.radiant_name || '').toLowerCase()
          const d = (cachedOd.dire_name || '').toLowerCase()
          const valid = psTeams.length >= 2 && psTeams.every(t => sub(t, r) || sub(t, d))
          if (!valid) {
            console.warn(`recent-completed: KV cached ID ${resolvedId} teams (${r}/${d}) don't match PS opponents — re-resolving`)
            resolvedId = null
          }
        } else {
          const fp = kvFps[i] ? String(kvFps[i]) : null
          if (fp) {
            const [r, d] = fp.split('|')
            const valid = psTeams.length >= 2 && psTeams.every(t => sub(t, r) || sub(t, d))
            if (!valid) {
              console.warn(`recent-completed: stale KV ID ${resolvedId} fingerprint (${fp}) doesn't match PS opponents — re-resolving`)
              resolvedId = null
            }
          }
          // No fingerprint (live-matches cron entry): trust the cached ID
        }
      }

      // Tier 2: OD promatches timestamp lookup — same approach as match-streams.js
      // Resolves the OD match ID without needing PS external_identifier (which requires
      // OD to have already indexed the match — defeating the purpose of this fallback).
      if (!resolvedId && g.begin_at) {
        const beginAtUnix = Math.floor(new Date(g.begin_at).getTime() / 1000)
        const odMatch = findOdMatchByTime(odMatches, beginAtUnix, opponents)
        if (odMatch) {
          resolvedId = String(odMatch.match_id)
          // Backfill KV: ID key + team fingerprint for stale validation of future requests
          const r = (opponents[0]?.opponent?.name || '').toLowerCase()
          const d = (opponents[1]?.opponent?.name || '').toLowerCase()
          Promise.all([
            kv.set(`live:game:${m.id}:${g.position}`,      resolvedId, { ex: STREAM_TTL }),
            kv.set(`live:game:${m.id}:${g.position}:fp`, `${r}|${d}`, { ex: STREAM_TTL }),
          ]).catch(() => {})
        }
      }

      const extId = resolvedId || `_ps-${m.id}-${g.position}`

      const bRound = parseBracketRound(m.name)
      if (bRound && resolvedId) {
        kv.set(`bracket:match:${resolvedId}`, bRound, { ex: 14 * 24 * 3600 }).catch(() => {})
      }

      const radiantTeam = g.radiant_team?.name || opponents[0]?.opponent?.name || 'Radiant'
      const direTeam    = g.dire_team?.name    || opponents[1]?.opponent?.name || 'Dire'
      const radiantId   = g.radiant_team?.id ?? opponents[0]?.opponent?.id
      const radiantWin  = g.winner?.id != null && radiantId != null
        ? g.winner.id === radiantId
        : false
      const startTime   = g.begin_at ? Math.floor(new Date(g.begin_at).getTime() / 1000) : 0

      games.push({
        id: extId,
        tournament: tournamentName,
        bracketRound: parseBracketRound(m.name),
        date: new Date(startTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        radiantTeam,
        direTeam,
        radiantScore: null,
        direScore: null,
        radiantWin,
        duration: calcDuration(g),
        startTime,
        seriesId: m.id,
        seriesType,
        twitchVodId: null,
        twitchOffset: null,
        _fromPandaScore: true,
        _pandaMatchId: m.id,
        _tempId: !resolvedId,
      })
    }
  }

  const tempCount = games.filter(g => g._tempId).length
  console.log(`recent-completed: ${games.length} games (${tempCount} pending OD indexing)`)

  const payload = { games, fetchedAt: new Date().toISOString() }
  try {
    await kv.set(KV_RC_KEY, payload, { ex: RC_TTL })
  } catch (err) {
    console.warn('recent-completed KV write failed:', err?.message)
  }
  return payload
}

// ── Tier 1 team sync (?mode=sync-teams, GET, cron-only) ─────────────────────
// Fetches all teams participating in current tier-1 tournaments and accumulates
// them in KV. Used by api/news.js for entity tagging so new tournament rosters
// are automatically picked up. The list only grows - teams are never removed.
// Requires CRON_SECRET authorization.

const KV_TEAMS_KEY = 'dota2:tier1_teams_dynamic_v1'
const TEAMS_TTL = 60 * 60 * 24 * 8 // 8 days - survives a missed cron day

async function syncTier1Teams(req, res, token) {
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

  const { TIER1_TEAMS_SERVER } = await import('./_shared.js')
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

// ── Watchability scoring (?mode=watchability, POST) ─────────────────────────
// Moved from api/watchability.js to stay within the 12-function Vercel limit.
// Frontend: src/components/WatchBadge.jsx

const WATCH_CACHE_TTL = 60 * 60 * 24 * 30 // 30 days

function countGoldFlips(arr, threshold = 5000) {
  if (!Array.isArray(arr) || arr.length < 2) return 0
  let flips = 0, lastSide = arr[0] >= 0 ? 1 : -1, lastFlipValue = arr[0]
  for (let i = 1; i < arr.length; i++) {
    const val = arr[i], side = val >= 0 ? 1 : -1
    if (side !== lastSide && Math.abs(val - lastFlipValue) >= threshold) {
      flips++; lastSide = side; lastFlipValue = val
    }
  }
  return flips
}

function hasGoldComeback(arr, radiantWin, threshold = 15000) {
  if (!Array.isArray(arr) || arr.length < 2) return false
  return radiantWin
    ? Math.max(...arr.map(v => -v)) >= threshold
    : Math.max(...arr) >= threshold
}

function hasMegaComeback(m) {
  return m.radiant_win ? m.barracks_status_radiant === 0 : m.barracks_status_dire === 0
}

function scoreGame(m) {
  const signals = [], durationMin = (m.duration || 0) / 60
  let score = 0
  if (durationMin >= 35 && durationMin <= 65) { score++; signals.push('good_duration') }
  if ((m.radiant_score || 0) + (m.dire_score || 0) >= 50) { score++; signals.push('high_kills') }
  const gold = m.radiant_gold_adv
  if (hasGoldComeback(gold, m.radiant_win)) { score++; signals.push('gold_comeback') }
  if (hasMegaComeback(m)) { score++; signals.push('mega_comeback') }
  if (countGoldFlips(gold) >= 3) { score++; signals.push('back_and_forth') }
  return { score, signals }
}

function getWatchRating(score) {
  if (score >= 4) return 'must_watch'
  if (score === 3) return 'good'
  if (score === 2) return 'average'
  return 'skip'
}

async function handleWatchability(req, res) {
  const { seriesId, matchIds } = req.body || {}
  if (!seriesId || !Array.isArray(matchIds) || matchIds.length === 0) {
    return res.status(400).json({ error: 'Missing seriesId or matchIds' })
  }
  const cacheKey = `watchability:series:${seriesId}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return res.status(200).json({ ...cached, cached: true })
  } catch {}

  const results = await Promise.allSettled(
    matchIds.map(id => fetch(`https://api.opendota.com/api/matches/${id}`).then(r => {
      if (!r.ok) throw new Error(`OpenDota ${r.status}`)
      return r.json()
    }))
  )
  const gameScores = results
    .filter(r => r.status === 'fulfilled' && r.value?.match_id)
    .map(r => scoreGame(r.value))

  if (gameScores.length === 0) {
    return res.status(200).json({ rating: 'average', label: 'Average', signals: [] })
  }

  const best = gameScores.reduce((b, g) => g.score > b.score ? g : b, gameScores[0])
  const allSignals = [...new Set(gameScores.flatMap(g => g.signals))]
  const rating = getWatchRating(best.score)
  const labelMap = { must_watch: 'Must Watch', good: 'Good', average: 'Average', skip: 'Skip' }
  const payload = { rating, label: labelMap[rating], signals: allSignals, score: best.score }

  kv.set(cacheKey, payload, { ex: WATCH_CACHE_TTL }).catch(() => {})
  return res.status(200).json(payload)
}

async function analyzeWithClaude(recentErrors, services, byEndpoint) {
  if (!process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY not configured.'
  const serviceLines = Object.entries(services)
    .map(([name, info]) => `${name}: ${info.status}${info.error ? ` (${info.error})` : ''} — ${info.latency_ms}ms`)
    .join('\n')
  const prompt = `You are reviewing production error telemetry for Spectate Esports (Dota 2 esports tracker on Vercel).\n\nErrors in the last 2h by endpoint:\n${JSON.stringify(byEndpoint, null, 2)}\n\nSample errors (up to 10):\n${JSON.stringify(recentErrors.slice(0, 10), null, 2)}\n\nService health:\n${serviceLines}\n\nIn 2-3 sentences: what happened, is it user-impacting, and what (if anything) should be done right now? Be specific and direct. No fluff.`
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await response.json()
    return data.content?.[0]?.text || 'Analysis unavailable.'
  } catch (err) {
    return `Analysis failed: ${err.message}`
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Watchability scoring (POST, no PANDASCORE_TOKEN needed)
  if (req.method === 'POST' && req.query?.mode === 'watchability') {
    res.setHeader('Cache-Control', 'private, no-store')
    return handleWatchability(req, res)
  }

  // ── match-stats mode ────────────────────────────────────────────────────────
  // Returns per-player networth, items, and gold advantage array for a single match.
  // Cached 7 days in KV (match data is immutable once indexed by OpenDota).
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'match-stats') {
    const { id: matchId } = req.query
    if (!matchId) return res.status(400).json({ error: 'id required' })

    const STATS_TTL = 60 * 60 * 24 * 7 // 7 days — only for parsed matches (immutable)
    const STATS_TTL_UNPARSED = 60 * 30  // 30 min — match not yet parsed by OD; retry soon
    const ITEM_MAP_TTL = 60 * 60 * 24  // 24h — item names rarely change
    const STATS_KV_KEY = `stats:match:v5:${matchId}`
    const ITEM_MAP_KV_KEY = 'opendota:item_map_v2'

    const EMPTY = { radiantGoldAdv: [], players: [], events: [], itemNames: {}, firstBloodTime: null, roshanKills: 0, picksBans: [] }

    // KV cache hit
    try {
      const cached = await kv.get(STATS_KV_KEY)
      if (cached != null) {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
        return res.status(200).json(cached)
      }
    } catch (err) {
      console.warn('match-stats KV read failed:', err?.message)
    }

    // Fetch item ID → name map (shared across all match-stats calls)
    let itemNames = {}
    try {
      const cachedItems = await kv.get(ITEM_MAP_KV_KEY)
      if (cachedItems != null) {
        itemNames = cachedItems
      } else {
        const itemRes = await fetch('https://api.opendota.com/api/constants/items')
        if (itemRes.ok) {
          const itemData = await itemRes.json()
          // itemData shape: { item_name: { id: N, dname: "Display Name", ... } }
          // Store both the CDN key and the proper display name
          for (const [name, meta] of Object.entries(itemData)) {
            if (meta?.id != null) itemNames[meta.id] = { key: name, dname: meta.dname || name.replace(/_/g, ' ') }
          }
          kv.set(ITEM_MAP_KV_KEY, itemNames, { ex: ITEM_MAP_TTL })
            .catch(err => console.warn('item-map KV write failed:', err?.message))
        }
      }
    } catch (err) {
      console.warn('match-stats item map fetch failed:', err?.message)
    }

    // Fetch match data from OpenDota
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      let data
      try {
        const fetchRes = await fetch(`https://api.opendota.com/api/matches/${matchId}`, { signal: controller.signal })
        if (!fetchRes.ok) {
          console.warn(`match-stats OpenDota ${fetchRes.status} for ${matchId}`)
          res.setHeader('Cache-Control', 'public, s-maxage=60')
          return res.status(200).json(EMPTY)
        }
        data = await fetchRes.json()
      } finally {
        clearTimeout(timeout)
      }

      const isRadiantPlayer = (p) => (p.player_slot ?? 0) < 128

      // Extract rapier purchases and rampages (5 kills within 30s) for chart markers
      const extractMatchEvents = (players) => {
        const evts = []
        for (const p of players) {
          const team = isRadiantPlayer(p) ? 'radiant' : 'dire'
          const player = p.name || p.personaname || ''
          if (Array.isArray(p.purchase_log)) {
            for (const entry of p.purchase_log) {
              if (entry.key === 'rapier' && typeof entry.time === 'number' && entry.time >= 0) {
                evts.push({ type: 'rapier', team, player, time: entry.time })
              }
            }
          }
          if (Array.isArray(p.kills_log) && p.kills_log.length >= 5) {
            const times = p.kills_log.map(k => k.time).filter(t => typeof t === 'number').sort((a, b) => a - b)
            let skipUntil = -Infinity
            for (let i = 4; i < times.length; i++) {
              if (times[i - 4] > skipUntil && times[i] - times[i - 4] <= 30) {
                evts.push({ type: 'rampage', team, player, time: times[i - 4] })
                skipUntil = times[i] + 1
              }
            }
          }
        }
        return evts.sort((a, b) => a.time - b.time)
      }

      const stats = {
        radiantGoldAdv: data.radiant_gold_adv ?? [],
        players: (data.players || []).map(p => ({
          slot: p.player_slot ?? 0,
          heroId: p.hero_id ?? 0,
          name: p.name || p.personaname || '',
          netWorth: p.net_worth ?? 0,
          items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map(v => v ?? 0),
          backpackItems: [p.backpack_0, p.backpack_1, p.backpack_2].map(v => v ?? 0),
          permanentBuffs: (p.permanent_buffs || []).map(b => b.permanent_buff),
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          assists: p.assists ?? 0,
          isRadiant: isRadiantPlayer(p),
        })),
        events: (() => {
          const playerEvents = extractMatchEvents(data.players || [])
          const roshanEvents = (data.objectives || [])
            .filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL' && typeof o.time === 'number' && o.time >= 0 && (o.team === 2 || o.team === 3))
            .sort((a, b) => a.time - b.time)
            .map((o, idx) => ({ type: 'roshan', time: o.time, team: o.team === 2 ? 'radiant' : 'dire', index: idx + 1 }))
          return [...playerEvents, ...roshanEvents].sort((a, b) => a.time - b.time)
        })(),
        itemNames,
        firstBloodTime: data.first_blood_time ?? null,
        roshanKills: (data.objectives || []).filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL').length,
        picksBans: (data.picks_bans || []).map(p => ({
          isPick: !!p.is_pick,
          heroId: p.hero_id ?? 0,
          team: p.team ?? 0,
          order: p.order ?? 0,
        })),
      }

      // Use short TTL when OD hasn't parsed the replay yet — radiant_gold_adv will be
      // null until parsing completes, which can take hours. Long TTL here would cache
      // the empty gold array for 7 days even after OD finishes parsing.
      const cacheTtl = data.radiant_gold_adv != null ? STATS_TTL : STATS_TTL_UNPARSED
      kv.set(STATS_KV_KEY, stats, { ex: cacheTtl })
        .catch(err => console.warn('match-stats KV write failed:', err?.message))

      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json(stats)
    } catch (err) {
      console.warn('match-stats fetch error:', err?.message)
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json(EMPTY)
    }
  }

  // ── tournament-players mode (?mode=tournament-players) ──────────────────────
  // Per-tournament player performance leaderboard (top-5 per stat).
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'tournament-players') {
    const { id: tournamentId } = req.query
    if (!tournamentId) return res.status(400).json({ error: 'id required' })

    const PLAYERS_TTL = 60 * 60 * 3           // 3h — same as tournament heroes
    const PLAYERS_TTL_COMPLETED = 60 * 60 * 24 * 30  // 30d for completed events
    const LEAGUES_CACHE_TTL = 60 * 60 * 4     // 4h — short enough to pick up new tournaments
    const OPENDOTA_API = 'https://api.opendota.com/api'
    const KV_PLAYERS_KEY = `dota2:tournament_players_v3:${tournamentId}`
    const KV_LEAGUES_KEY = 'opendota:leagues_v2'

    const emptyStats = { kills: [], deaths: [], assists: [], netWorth: [], gpm: [] }

    if (req.query?.bust === '1') {
      await kv.del(KV_PLAYERS_KEY).catch(() => {})
    } else {
      try {
        const cached = await kv.get(KV_PLAYERS_KEY)
        if (cached) {
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
          return res.status(200).json(cached)
        }
      } catch {}
    }

    const fetchFreshLeagues = async () => {
      try {
        const r = await fetch(`${OPENDOTA_API}/leagues`)
        if (!r?.ok) return []
        const data = await r.json()
        kv.set(KV_LEAGUES_KEY, data, { ex: LEAGUES_CACHE_TTL }).catch(() => {})
        return data
      } catch { return [] }
    }

    // Unix timestamp lower bound — only include OD matches on/after this date
    let beginAtUnix = null
    if (req.query.begin_at) {
      const t = Math.floor(new Date(req.query.begin_at).getTime() / 1000)
      if (!isNaN(t) && t > 0) beginAtUnix = t
    }

    try {
      let name = req.query.name || null

      // Resolve tournament name and begin_at from PandaScore when either is missing
      if (!name || !beginAtUnix) {
        const token = process.env.PANDASCORE_TOKEN
        if (token) {
          const tRes = await fetch(`https://api.pandascore.co/tournaments/${tournamentId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
          })
          if (tRes.ok) {
            const t = await tRes.json()
            if (!name) name = t.serie?.full_name || t.serie?.name || t.league?.name || t.name || null
            if (!beginAtUnix && t.begin_at) {
              const ts = Math.floor(new Date(t.begin_at).getTime() / 1000)
              if (!isNaN(ts) && ts > 0) beginAtUnix = ts
            }
          }
        }
      }

      // Fetch OD leagues list (cached in KV; bust and retry if findLeague returns null
      // to catch cases where a new tournament was added to OD after the cache was warmed)
      let leagues = await (async () => {
        try { const c = await kv.get(KV_LEAGUES_KEY); if (c) return c } catch {}
        return fetchFreshLeagues()
      })()

      let league = findLeague(leagues, name)
      if (!league && leagues.length > 0) {
        // Cache may be stale — bust it and retry once with fresh OD data
        await kv.del(KV_LEAGUES_KEY).catch(() => {})
        leagues = await fetchFreshLeagues()
        league = findLeague(leagues, name)
      }
      if (!league) {
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        return res.status(200).json({ stats: emptyStats, gameCount: 0 })
      }

      // Fetch match list for the league
      const matchListRes = await fetch(`${OPENDOTA_API}/leagues/${league.leagueid}/matches`)
      if (!matchListRes.ok) {
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        return res.status(200).json({ stats: emptyStats, gameCount: 0 })
      }
      const rawMatchList = await matchListRes.json()
      if (!Array.isArray(rawMatchList) || !rawMatchList.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        return res.status(200).json({ stats: emptyStats, gameCount: 0 })
      }

      // Pre-filter by tournament start date — the OD league may span multiple seasons
      // (e.g. "BLAST SLAM I" covers S1+). Exclude matches before begin_at.
      // Matches with no start_time are included defensively.
      const matchList = beginAtUnix
        ? rawMatchList.filter(m => !m.start_time || m.start_time >= beginAtUnix)
        : rawMatchList

      if (!matchList.length) {
        res.setHeader('Cache-Control', 'public, s-maxage=60')
        return res.status(200).json({ stats: emptyStats, gameCount: 0 })
      }

      // Batch-fetch full match data: 10 concurrent, max 60 games, 7s time budget
      const CONCURRENCY = 10
      const MAX_GAMES = 60
      const TIME_BUDGET_MS = 7000
      const fetchStart = Date.now()
      const allMatches = []
      for (let i = 0; i < Math.min(matchList.length, MAX_GAMES); i += CONCURRENCY) {
        if (Date.now() - fetchStart > TIME_BUDGET_MS) break
        const batch = matchList.slice(i, i + CONCURRENCY)
        const results = await Promise.all(batch.map(async m => {
          const r = await fetch(`${OPENDOTA_API}/matches/${m.match_id}`)
          if (!r.ok) return null
          return r.json()
        }))
        allMatches.push(...results.filter(Boolean))
      }

      // Build leaderboard entries — one per player per game
      const gamesMap = {}   // accountId → total games played in tournament
      const allEntries = []

      for (const match of allMatches) {
        if (!Array.isArray(match.players) || !match.players.length) continue
        const isRadiantPlayer = p => (p.player_slot ?? 0) < 128
        for (const p of match.players) {
          const accountId = p.account_id
          if (!accountId) continue
          gamesMap[accountId] = (gamesMap[accountId] || 0) + 1
          allEntries.push({
            accountId,
            playerName: p.name || p.personaname || '',
            heroId:     p.hero_id ?? 0,
            teamName:   isRadiantPlayer(p) ? (match.radiant_name || '') : (match.dire_name || ''),
            matchId:    match.match_id,
            radiantName: match.radiant_name || '',
            direName:   match.dire_name || '',
            kills:      p.kills ?? 0,
            deaths:     p.deaths ?? 0,
            assists:    p.assists ?? 0,
            netWorth:   p.net_worth ?? 0,
            gpm:        p.gold_per_min ?? 0,
          })
        }
      }

      const top5 = (statKey) =>
        [...allEntries]
          .sort((a, b) => b[statKey] - a[statKey])
          .slice(0, 5)
          .map((e, i) => ({ ...e, value: e[statKey], rank: i + 1, gamesPlayed: gamesMap[e.accountId] || 1 }))

      const stats = {
        kills:    top5('kills'),
        deaths:   top5('deaths'),
        assists:  top5('assists'),
        netWorth: top5('netWorth'),
        gpm:      top5('gpm'),
      }

      const payload = { stats, gameCount: allMatches.length, league: league.name }
      const ttl = req.query?.completed === '1' ? PLAYERS_TTL_COMPLETED : PLAYERS_TTL
      kv.set(KV_PLAYERS_KEY, payload, { ex: ttl }).catch(() => {})

      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json(payload)
    } catch (err) {
      console.error('tournament-players error:', err?.message)
      await trackError('/api/tournaments?mode=tournament-players', 500, err?.message)
      res.setHeader('Cache-Control', 'public, s-maxage=60')
      return res.status(200).json({ stats: emptyStats, gameCount: 0 })
    }
  }

  // ── monitor mode (?mode=monitor) ───────────────────────────────────────────
  // Error telemetry dashboard — reads KV error lists written by trackError().
  // Protected by CRON_SECRET; called by the GitHub Actions log-monitor workflow.
  if (req.query?.mode === 'monitor') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const reportMode = req.query?.report === '1'
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
    const [todayRaw, yesterdayRaw, services] = await Promise.all([
      kv.lrange(`monitor:errors:${today}`, 0, -1).catch(() => []),
      kv.lrange(`monitor:errors:${yesterday}`, 0, -1).catch(() => []),
      checkServices(),
    ])
    const parse = (raw) => {
      if (raw && typeof raw === 'object' && raw.ts) return raw
      try { return JSON.parse(raw) } catch { return null }
    }
    const allErrors = [...todayRaw, ...yesterdayRaw].map(parse).filter(Boolean)
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000
    const twentyFourHoursAgo = Date.now() - 24 * 3600 * 1000
    const recentErrors = allErrors.filter(e => e.ts > twoHoursAgo)
    const dailyErrors = allErrors.filter(e => e.ts > twentyFourHoursAgo)
    const byEndpoint = {}
    for (const e of recentErrors) {
      byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] || 0) + 1
    }
    const serviceDown = Object.values(services).some(s => s.status === 'error')
    const criticalEndpoint = Object.entries(byEndpoint).find(([, count]) => count >= 3)
    const critical = !!(criticalEndpoint || serviceDown)
    let summary = null
    if (reportMode) {
      summary = (recentErrors.length > 0 || serviceDown)
        ? await analyzeWithClaude(recentErrors, services, byEndpoint)
        : 'No errors in the last 2 hours. All services healthy.'
    }
    return res.status(200).json({
      period_2h: `${new Date(twoHoursAgo).toISOString()} to ${now.toISOString()}`,
      error_count: recentErrors.length,
      error_count_24h: dailyErrors.length,
      errors_by_endpoint: byEndpoint,
      recent_errors: recentErrors.slice(0, 10),
      services,
      critical,
      summary,
      action_required: critical,
      checked_at: now.toISOString(),
    })
  }

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
        await trackError('/api/tournaments', 500, err?.message)
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
  // One subscription URL - every running/upcoming tournament and their matches appear automatically.
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
        // Fetch series, matches, and tournaments in parallel.
        // Series objects have no tier field; derive tier from tournament objects (t.tier).
        const [runSerR, upSerR, runMatchR, upMatchR, runTourR, upTourR] = await Promise.all([
          fetch(`${PANDASCORE_BASE}/series/running?sort=begin_at&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/series/upcoming?sort=begin_at&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/running?sort=scheduled_at&page[size]=100`, { headers }),
          fetch(`${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=100`, { headers }),
          fetch(`${PANDASCORE_BASE}/tournaments/running?sort=begin_at&page[size]=50`, { headers }),
          fetch(`${PANDASCORE_BASE}/tournaments/upcoming?sort=begin_at&page[size]=100`, { headers }),
        ])
        const [runSer, upSer, runMatch, upMatch, runTour, upTour] = await Promise.all([
          runSerR.ok ? toArr(runSerR) : Promise.resolve([]),
          upSerR.ok ? toArr(upSerR) : Promise.resolve([]),
          runMatchR.ok ? toArr(runMatchR) : Promise.resolve([]),
          upMatchR.ok ? toArr(upMatchR) : Promise.resolve([]),
          runTourR.ok ? toArr(runTourR) : Promise.resolve([]),
          upTourR.ok ? toArr(upTourR) : Promise.resolve([]),
        ])
        // Build tier-1 serie_id set from tournament objects (which have t.tier populated).
        const calTier1SerieIds = new Set(
          [...(runTour || []), ...(upTour || [])].filter(isTier1).map(t => t.serie_id || t.serie?.id).filter(Boolean)
        )
        allSeries = [...runSer, ...upSer].filter(s => calTier1SerieIds.has(s.id))
        const tier1SerieIds = new Set(allSeries.map(s => s.id))
        allMatches = [...runMatch, ...upMatch].filter(m => {
          const sid = m.serie_id || m.serie?.id
          return sid && tier1SerieIds.has(sid)
        })
        try { await kv.set(cacheKey, { allSeries, allMatches }, { ex: CAL_MATCHES_TTL }) } catch (err) { console.warn('KV write:', err?.message) }
      } catch (err) {
        console.error('calendar-all error:', err?.message)
        await trackError('/api/tournaments', 500, err?.message)
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
        await trackError('/api/tournaments', 500, err?.message)
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

  // Tier 1 league names mode - returns PandaScore tier S/A league names for client-side filtering
  // Tier 1 team sync (cron-only, requires CRON_SECRET)
  if (req.query?.mode === 'sync-teams') {
    return syncTier1Teams(req, res, token)
  }

  if (req.query?.mode === 'tier1-leagues') {
    if (req.query?.bust === '1') {
      try { await kv.del(KV_TIER1_NAMES_KEY) } catch {}
      console.log('tier1-leagues cache cleared')
    }
    const names = await fetchTier1LeagueNames(token)
    return res.status(200).json({ names })
  }

  // Match enrichment mode — combines match-formats and match-brackets in a single KV round-trip.
  // Returns { formats, brackets } keyed by OpenDota match ID. For bracket misses falls back to
  // a PandaScore past-matches lookup (same logic as the standalone match-brackets mode).
  if (req.query?.mode === 'match-enrichment') {
    const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
    if (ids.length === 0) return res.status(200).json({ formats: {}, brackets: {} })
    const formats = {}
    const brackets = {}
    try {
      const fmtKeys = ids.map(id => `format:match:${id}`)
      const bktKeys = ids.map(id => `bracket:match:${id}`)
      const allVals = await kv.mget(...fmtKeys, ...bktKeys)
      const fmtVals = allVals.slice(0, ids.length)
      const bktVals = allVals.slice(ids.length)
      ids.forEach((id, i) => {
        if (fmtVals[i]) formats[id] = fmtVals[i]
        if (bktVals[i]) brackets[id] = bktVals[i]
      })
    } catch (err) {
      console.warn('match-enrichment KV read failed:', err?.message)
    }
    const missing = ids.filter(id => !brackets[id])
    const psToken = process.env.PANDASCORE_TOKEN
    if (missing.length > 0 && psToken) {
      try {
        const ago7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        const now = new Date().toISOString()
        const psUrl = `${PANDASCORE_BASE}/matches/past?sort=-end_at&page[size]=100&range[end_at]=${ago7d},${now}`
        const psRes = await fetch(psUrl, { headers: { 'Authorization': `Bearer ${psToken}`, 'Accept': 'application/json' } })
        if (psRes.ok) {
          const psMatches = await psRes.json()
          const missingSet = new Set(missing.map(String))
          const writes = []
          for (const m of (Array.isArray(psMatches) ? psMatches : [])) {
            const br = parseBracketRound(m.name)
            if (!br) continue
            for (const g of (m.games || [])) {
              const extId = String(g.external_identifier || '')
              if (!extId || !missingSet.has(extId)) continue
              brackets[extId] = br
              writes.push(kv.set(`bracket:match:${extId}`, br, { ex: 14 * 24 * 3600 }).catch(() => {}))
            }
          }
          if (writes.length) await Promise.allSettled(writes)
        }
      } catch (err) {
        console.warn('match-enrichment PS fallback failed:', err?.message)
      }
    }
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ formats, brackets })
  }

  // Match formats mode - returns PandaScore-sourced format ('best_of_2' etc.) keyed by OpenDota match ID.
  // Used by the frontend to correct series_type when OpenDota reports the wrong format.
  if (req.query?.mode === 'match-formats') {
    const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
    if (ids.length === 0) return res.status(200).json({ formats: {} })
    try {
      const values = await kv.mget(...ids.map(id => `format:match:${id}`))
      const formats = {}
      ids.forEach((id, i) => { if (values[i]) formats[id] = values[i] })
      return res.status(200).json({ formats })
    } catch (err) {
      console.warn('match-formats KV read failed:', err?.message)
      return res.status(200).json({ formats: {} })
    }
  }

  // Match brackets mode - returns bracket round (e.g. "Grand Final") keyed by OpenDota match ID.
  // First checks KV (written by live-matches cron + recent-completed handler). For any cache miss,
  // falls back to a 7-day PS past-matches lookup using external_identifier (reliable once OD has indexed).
  if (req.query?.mode === 'match-brackets') {
    const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
    if (ids.length === 0) return res.status(200).json({ brackets: {} })
    const brackets = {}
    try {
      const values = await kv.mget(...ids.map(id => `bracket:match:${id}`))
      ids.forEach((id, i) => { if (values[i]) brackets[id] = values[i] })
    } catch {}
    const missing = ids.filter(id => !brackets[id])
    const psToken = process.env.PANDASCORE_TOKEN
    if (missing.length > 0 && psToken) {
      try {
        const ago7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        const now = new Date().toISOString()
        const psUrl = `${PANDASCORE_BASE}/matches/past?sort=-end_at&page[size]=100&range[end_at]=${ago7d},${now}`
        const psRes = await fetch(psUrl, { headers: { 'Authorization': `Bearer ${psToken}`, 'Accept': 'application/json' } })
        if (psRes.ok) {
          const psMatches = await psRes.json()
          const missingSet = new Set(missing.map(String))
          const writes = []
          for (const m of (Array.isArray(psMatches) ? psMatches : [])) {
            const br = parseBracketRound(m.name)
            if (!br) continue
            for (const g of (m.games || [])) {
              const extId = String(g.external_identifier || '')
              if (!extId || !missingSet.has(extId)) continue
              brackets[extId] = br
              writes.push(kv.set(`bracket:match:${extId}`, br, { ex: 14 * 24 * 3600 }).catch(() => {}))
            }
          }
          if (writes.length) await Promise.allSettled(writes)
        }
      } catch (err) {
        console.warn('match-brackets PS fallback failed:', err?.message)
      }
    }
    return res.status(200).json({ brackets })
  }

  // Proxy for OpenDota /api/leagues — returns premium league IDs to avoid client-side CORS errors.
  if (req.query?.mode === 'premium-league-ids') {
    try {
      const odRes = await fetch('https://api.opendota.com/api/leagues')
      if (!odRes.ok) return res.status(200).json({ ids: [] })
      const leagues = await odRes.json()
      const ids = [...buildPremiumLeagueIds(leagues)]
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json({ ids })
    } catch (err) {
      console.warn('premium-league-ids: OpenDota fetch failed:', err?.message)
      return res.status(200).json({ ids: [] })
    }
  }

  // Proxy for OpenDota /api/promatches — avoids client-side CORS restrictions.
  if (req.query?.mode === 'promatches-proxy') {
    const lessThan = req.query?.less_than
    const odUrl = lessThan
      ? `https://api.opendota.com/api/promatches?less_than_match_id=${lessThan}`
      : 'https://api.opendota.com/api/promatches'
    try {
      const odRes = await fetch(odUrl)
      if (!odRes.ok) return res.status(200).json([])
      const data = await odRes.json()
      return res.status(200).json(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn('promatches-proxy: OpenDota fetch failed:', err?.message)
      return res.status(200).json([])
    }
  }

  // Recent completed mode — PandaScore fallback for series not yet indexed by OpenDota.
  if (req.query?.mode === 'recent-completed') {
    const bust = req.query?.bust === '1'
    if (bust) {
      await kv.del(KV_RC_KEY).catch(() => {})
      console.log('recent-completed cache cleared')
    }
    try {
      const data = await fetchRecentCompleted(token, bust)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(data)
    } catch (err) {
      console.error('recent-completed error:', err?.message)
      return res.status(200).json({ games: [], fetchedAt: new Date().toISOString(), error: err?.message })
    }
  }

  // Live series games mode — returns the OpenDota game IDs for each position in a
  // PandaScore live match. Used by the drawer to show G1/G2 details while G3 is live.
  if (req.query?.mode === 'live-series-games') {
    const pandaId = req.query?.id
    if (!pandaId) return res.status(400).json({ gameIds: [] })
    try {
      const positions = [1, 2, 3, 4, 5]
      const keys = positions.map(p => `live:game:${pandaId}:${p}`)
      const values = await kv.mget(...keys)
      const fromCache = values
        .map((v, i) => (v ? { pos: positions[i], id: String(v) } : null))
        .filter(Boolean)
        .sort((a, b) => a.pos - b.pos)

      if (fromCache.length > 0) {
        return res.status(200).json({ gameIds: fromCache.map(x => x.id) })
      }

      // Redis miss (e.g. series started before this code was deployed) — fetch
      // the individual match from PandaScore which sets external_identifier on
      // finished games even when the bulk running endpoint does not.
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      const psRes = await fetch(`${PANDASCORE_BASE}/matches/${pandaId}`, { headers })
      if (!psRes.ok) {
        console.warn(`live-series-games: PandaScore match ${pandaId} returned ${psRes.status}`)
        return res.status(200).json({ gameIds: [] })
      }
      const detail = await psRes.json()
      const finished = (detail.games || [])
        .filter(g => g.status === 'finished' && g.external_identifier)
        .sort((a, b) => a.position - b.position)

      // Backfill Redis so the next click is instant.
      if (finished.length > 0) {
        Promise.all(
          finished.map(g =>
            kv.set(`live:game:${pandaId}:${g.position}`, String(g.external_identifier), { ex: STREAM_TTL })
          )
        ).catch(err => console.warn('live-series-games backfill failed:', err?.message))
      }

      const gameIds = finished.map(g => String(g.external_identifier))
      console.log(`live-series-games: PS fallback for ${pandaId} → [${gameIds.join(', ')}]`)
      return res.status(200).json({ gameIds })
    } catch (err) {
      console.warn('live-series-games failed:', err?.message)
      return res.status(200).json({ gameIds: [] })
    }
  }

  // Series list mode - for /tournaments page and TournamentBar
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
      await trackError('/api/tournaments', 500, err?.message)
      return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
    }
  }

  // YouTube highlights mode
  if (req.query?.mode === 'highlights') {
    const rawName = (req.query?.name || '').trim()
    if (!rawName) return res.status(400).json({ error: 'name param required' })
    const rawBeginAt = req.query?.beginAt || null
    const rawEndAt = req.query?.endAt || null

    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      console.warn('[highlights] YOUTUBE_API_KEY not set')
      return res.status(200).json({ videos: [], channelHandle: null })
    }

    const nameLower = rawName.toLowerCase()
    const channel = YT_CHANNEL_MAP.find(c => c.keywords.some(k => nameLower.includes(k)))
    if (!channel) return res.status(200).json({ videos: [], channelHandle: null })

    // Clean up the name to get the best YouTube search term:
    // - Strip stage suffixes like "- Group A", "- Group Stage", "- Playoffs", etc.
    // - Strip trailing year (ESL video titles don't include "2026")
    // - Strip "Season N": orgs use different conventions (ESL: "S29", BLAST: "VII",
    //   PGL: "Season 7"). The date filter (publishedAfter/publishedBefore) scopes to
    //   the correct season when tournament dates are available, making the season number
    //   in the search term redundant and harmful for Roman-numeral orgs like BLAST.
    const searchTerm = rawName
      .replace(/\s*[-–—]\s*(group [a-z]|group stage|playoffs|upper bracket|lower bracket|qualifier|open qualifier|closed qualifier|main event)\s*/gi, '')
      .replace(/\s+\d{4}\b/, '')
      .replace(/\bseason\s+\d+\b/gi, '')
      .trim()

    const slugKey = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)
    const dateKey = rawBeginAt ? new Date(rawBeginAt).toISOString().slice(0, 10) : 'nodate'
    const cacheKey = `dota2:yt_highlights:v1:${channel.channelId}:${slugKey}:${dateKey}`

    if (req.query?.bust !== '1') {
      try {
        const cached = await kv.get(cacheKey)
        if (cached) return res.status(200).json({ ...cached, cached: true })
      } catch (e) {
        console.warn('[highlights] KV read failed:', e?.message)
      }
    }

    // Date window: use tournament dates when available; else fall back to 90-day window.
    // Start 5 days before the event begin date to capture pre-event content (trailers,
    // team previews, day-0 uploads) that orgs post before the first match day.
    let publishedAfter, publishedBefore
    if (rawBeginAt) {
      const d = new Date(rawBeginAt)
      d.setUTCDate(d.getUTCDate() - 5)
      publishedAfter = d.toISOString()
    } else {
      publishedAfter = new Date(Date.now() - YT_HIGHLIGHTS_MAX_AGE_DAYS * 86400_000).toISOString()
    }
    if (rawEndAt) {
      const d = new Date(rawEndAt)
      d.setUTCDate(d.getUTCDate() + 1)
      publishedBefore = d.toISOString()
    }

    // Use uploads playlist (playlistItems.list) instead of search.list:
    // - No indexing lag: videos appear immediately after upload
    // - 1 quota unit vs 100 for search.list
    // Uploads playlist ID = channel ID with "UC" → "UU" prefix.
    const uploadsPlaylistId = channel.channelId.replace(/^UC/, 'UU')
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    ytUrl.searchParams.set('part', 'snippet')
    ytUrl.searchParams.set('playlistId', uploadsPlaylistId)
    ytUrl.searchParams.set('maxResults', '25')
    ytUrl.searchParams.set('key', apiKey)

    try {
      const ytRes = await fetch(ytUrl.toString())
      if (!ytRes.ok) {
        const body = await ytRes.text()
        console.error('[highlights] YouTube API error:', ytRes.status, body.slice(0, 200))
        return res.status(200).json({ videos: [], channelHandle: channel.handle, error: `YouTube ${ytRes.status}` })
      }
      const ytData = await ytRes.json()
      const afterMs = new Date(publishedAfter).getTime()
      const beforeMs = publishedBefore ? new Date(publishedBefore).getTime() : Infinity
      const videos = (ytData.items || [])
        .map(item => ({
          videoId: item.snippet?.resourceId?.videoId,
          title: item.snippet?.title,
          thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
          publishedAt: item.snippet?.publishedAt,
        }))
        .filter(v => {
          if (!v.videoId || !v.title) return false
          const pub = new Date(v.publishedAt).getTime()
          return pub >= afterMs && pub <= beforeMs
        })
        .slice(0, 12)

      const result = { videos, channelHandle: channel.handle }
      // Cache hits and misses. Empty results cached briefly (30 min) to avoid burning
      // YouTube API quota on repeated page loads when no videos exist yet.
      const ttl = videos.length > 0 ? YT_HIGHLIGHTS_TTL : 60 * 30
      kv.set(cacheKey, result, { ex: ttl }).catch(e => {
        console.error('[highlights] KV write failed:', e?.message)
      })
      return res.status(200).json(result)
    } catch (err) {
      console.error('[highlights] fetch error:', err?.message)
      return res.status(200).json({ videos: [], channelHandle: channel.handle, error: err?.message })
    }
  }

  // ── llms-data mode (?mode=llms-data) ──────────────────────────────────────
  // Structured entity JSON for AI systems (RAG pipelines, citation engines,
  // knowledge graph builders). Returns site identity, live tournaments, top
  // organizers, glossary index, and machine-readable API endpoints.
  // Cached 1 hour; reuses the already-warm series list cache for tournament data.
  if (req.query?.mode === 'llms-data') {
    const LLMS_DATA_TTL = 60 * 60
    const LLMS_DATA_KV_KEY = 'spectate:llms_data_v1'
    try {
      const cached = await kv.get(LLMS_DATA_KV_KEY)
      if (cached && req.query?.bust !== '1') {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
        return res.status(200).json(cached)
      }
    } catch {}

    let seriesData = { live: [], upcoming: [], completed: [] }
    try { seriesData = await fetchSeriesList(token) } catch {}

    const glossaryIndex = [
      { id: 'draft', term: 'Draft / Pick-Ban', shortDef: 'The pre-game hero selection phase where teams alternate banning and picking heroes.' },
      { id: 'gpm', term: 'GPM', shortDef: "Gold Per Minute — measures a player's gold income rate. Carries typically have the highest GPM." },
      { id: 'roshan', term: 'Roshan', shortDef: 'A powerful neutral boss whose kill grants the Aegis of the Immortal.' },
      { id: 'rampage', term: 'Rampage', shortDef: 'Killing 5 enemies within ~40 seconds. The highest kill streak in Dota 2.' },
      { id: 'divine-rapier', term: 'Divine Rapier', shortDef: 'High-risk high-reward item granting massive damage but dropping on death.' },
      { id: 'aegis', term: 'Aegis of the Immortal', shortDef: 'Item dropped by Roshan that grants one free death (respawn in place).' },
      { id: 'mega-creeps', term: 'Mega Creeps', shortDef: 'Empowered lane creeps spawned when all barracks of one team are destroyed.' },
      { id: 'buyback', term: 'Buyback', shortDef: 'Spending gold to immediately respawn after death. A critical late-game decision.' },
      { id: 'net-worth', term: 'Net Worth', shortDef: 'Total gold value of items plus bank gold. Key metric for team economy comparison.' },
      { id: 'first-blood', term: 'First Blood', shortDef: 'The first hero kill of a game, awarding bonus gold.' },
      { id: 'smoke-of-deceit', term: 'Smoke of Deceit', shortDef: 'Consumable that grants team invisibility for coordinated ganks.' },
      { id: 'ancient', term: 'Ancient', shortDef: 'The main structure each team must destroy to win the game.' },
      { id: 'barracks', term: 'Barracks', shortDef: 'Lane structures that unlock Mega Creeps when destroyed.' },
      { id: 'bkb', term: 'BKB (Black King Bar)', shortDef: 'Item that grants temporary magic immunity. A core defensive item.' },
      { id: 'tp-scroll', term: 'TP Scroll', shortDef: 'Town Portal Scroll — teleports a hero to a friendly structure. Essential for defense.' },
      { id: 'courier', term: 'Courier', shortDef: 'Flying unit that delivers items from the shop to heroes on the map.' },
      { id: 'carry', term: 'Carry (Position 1)', shortDef: 'Late-game scaling role. Farms gold early to become the primary damage dealer.' },
      { id: 'support', term: 'Support (Position 4/5)', shortDef: 'Utility and vision roles that sacrifice farm for team-enabling abilities.' },
      { id: 'offlane', term: 'Offlane (Position 3)', shortDef: 'The hard-lane solo hero, often tanky or initiating.' },
      { id: 'mid-lane', term: 'Mid Lane (Position 2)', shortDef: 'Solo center-lane hero, typically a playmaking or tempo-setting role.' },
      { id: 'last-hit', term: 'Last Hit', shortDef: 'Killing a creep to claim its gold. Core farming mechanic in Dota 2.' },
      { id: 'deny', term: 'Deny', shortDef: 'Killing an allied creep to prevent the enemy from gaining gold.' },
      { id: 'teamfight', term: 'Teamfight', shortDef: 'A multi-hero engagement over map objectives or positioning.' },
      { id: 'bounty-rune', term: 'Bounty Rune', shortDef: 'Gold-granting rune spawning every 3 minutes. Contested by both teams.' },
      { id: 'true-sight', term: 'True Sight', shortDef: 'The ability to see invisible units, granted by specific items or towers.' },
    ]

    const pickTournamentFields = s => ({
      id: s.id,
      name: s.name,
      leagueName: s.leagueName,
      beginAt: s.beginAt,
      endAt: s.endAt,
      prizePool: s.prizePool,
      ...(s.winner ? { winner: s.winner } : {}),
    })

    const payload = {
      site: {
        name: 'Spectate Esports',
        url: 'https://spectateesports.live',
        description: 'Real-time pro Dota 2 esports platform. Live match scores, timestamped Twitch VODs, hero drafts, gold advantage graphs, player stats, tournament brackets, and AI match summaries.',
        sport: 'Dota 2',
        coverage: 'Tier 1 international professional matches only',
        founded: 2026,
        social: { x: 'https://x.com/SpectateDota2' },
      },
      tournaments: {
        live:      (seriesData.live      || []).map(pickTournamentFields),
        upcoming:  (seriesData.upcoming  || []).map(pickTournamentFields),
        completed: (seriesData.completed || []).map(pickTournamentFields),
      },
      tier1Organizers: [
        'DreamLeague (ESL Gaming / DreamHack)',
        'ESL One',
        'PGL',
        'BLAST',
        'WePlay',
        'The International (Valve)',
        'Riyadh Masters',
        'Beyond The Summit',
      ],
      dataSources: [
        { name: 'OpenDota API', url: 'https://api.opendota.com', description: 'Match results, player stats, draft data, gold advantage graphs', lag: '30–90 minutes after match end' },
        { name: 'PandaScore API', url: 'https://pandascore.co', description: 'Live scores, tournament brackets, team rosters, stream links', lag: 'Real-time, cached 2 minutes' },
        { name: 'Twitch Helix API', url: 'https://dev.twitch.tv', description: 'VOD links timestamped to game start' },
        { name: 'Steam Community RSS', url: 'https://www.dota2.com', description: 'Official Valve announcements and patch notes' },
        { name: 'Liquipedia MediaWiki API', url: 'https://liquipedia.net/dota2', description: 'Roster transfers and team news' },
      ],
      apiEndpoints: [
        { url: 'https://spectateesports.live/api/live-matches',              format: 'JSON', description: 'Currently live Tier 1 matches with scores and stream links' },
        { url: 'https://spectateesports.live/api/upcoming-matches',          format: 'JSON', description: 'Upcoming scheduled Tier 1 matches' },
        { url: 'https://spectateesports.live/api/tournaments?mode=series',   format: 'JSON', description: 'All live, upcoming, and completed tournament series' },
        { url: 'https://spectateesports.live/api/tournaments?mode=llms-data',format: 'JSON', description: 'Structured entity data for AI systems (this endpoint)' },
        { url: 'https://spectateesports.live/api/news',                      format: 'JSON', description: 'Aggregated Dota 2 news from Steam, Liquipedia, and editorial sources' },
        { url: 'https://spectateesports.live/api/news?format=rss',           format: 'RSS',  description: 'Same news feed in RSS 2.0 format' },
        { url: 'https://spectateesports.live/sitemap.xml',                   format: 'XML',  description: 'Full sitemap including match pages, tournament pages, and glossary' },
        { url: 'https://spectateesports.live/llms.txt',                      format: 'text', description: 'Machine-readable site index for LLMs' },
        { url: 'https://spectateesports.live/llms-full.txt',                 format: 'text', description: 'Extended LLM index with full entity data' },
      ],
      glossaryIndex,
      generatedAt: new Date().toISOString(),
    }

    kv.set(LLMS_DATA_KV_KEY, payload, { ex: LLMS_DATA_TTL }).catch(() => {})
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
    return res.status(200).json(payload)
  }

  // ── match-indicators mode ──────────────────────────────────────────────────
  if (req.query?.mode === 'match-indicators') {
    const { ids } = req.query
    if (!ids) return res.status(400).json({ error: 'ids required' })

    const matchIds = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 15)
    if (matchIds.length === 0) return res.status(400).json({ error: 'no valid ids' })

    const INDICATORS_TTL = 60 * 60 * 24 * 7 // 7 days - match data is immutable
    const KV_PREFIX = 'indicators:match:v4:' // v4 — added rampage detection
    const result = {}

    // ?bust=1 clears the KV cache for the requested IDs so they recompute from OpenDota.
    // Use when a match was cached before OpenDota fully indexed it (e.g. multi_kills missing).
    if (req.query?.bust === '1') {
      try {
        const keys = matchIds.map(id => `${KV_PREFIX}${id}`)
        await Promise.all(keys.map(k => kv.del(k)))
        console.log('match-indicators cache busted for:', matchIds.join(','))
      } catch (err) {
        console.warn('match-indicators KV bust failed:', err?.message)
      }
    }

    // Batch Redis read
    try {
      const keys = matchIds.map(id => `${KV_PREFIX}${id}`)
      const cached = await kv.mget(...keys)
      matchIds.forEach((id, i) => { if (cached[i] != null) result[id] = cached[i] })
    } catch (err) {
      console.warn('match-indicators KV read failed:', err?.message)
    }

    const uncached = matchIds.filter(id => !result[id])

    if (uncached.length > 0) {
      const computeIndicators = (data) => {
        const RAPIER_ID = 133
        const isRadiant = (p) => (p.player_slot ?? 0) < 128
        const boughtRapier = (p) => {
          const purchase = p.purchase || {}
          if ((purchase['rapier'] || 0) > 0) return true
          const log = p.purchase_log || []
          if (log.some(e => e.key === 'rapier')) return true
          return [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].includes(RAPIER_ID)
        }
        const radiantHasRapier = (data.players || []).some(p => isRadiant(p) && boughtRapier(p))
        const direHasRapier = (data.players || []).some(p => !isRadiant(p) && boughtRapier(p))

        // goldSwingWinner = team that came back from a 20k+ gold deficit
        const goldAdv = data.radiant_gold_adv || []
        let goldSwingWinner = null
        let radiantPeak = 0
        for (const adv of goldAdv) {
          if (adv > radiantPeak) radiantPeak = adv
          if (radiantPeak >= 20000 && adv <= 0) { goldSwingWinner = 'dire'; break }
        }
        if (!goldSwingWinner) {
          let direPeak = 0
          for (const adv of goldAdv) {
            if (-adv > direPeak) direPeak = -adv
            if (direPeak >= 20000 && adv >= 0) { goldSwingWinner = 'radiant'; break }
          }
        }

        // megaComebackWinner = team that won despite all their barracks being destroyed
        let megaComebackWinner = null
        if (data.barracks_status_radiant === 0 && data.radiant_win === true) {
          megaComebackWinner = 'radiant'
        } else if (data.barracks_status_dire === 0 && data.radiant_win === false) {
          megaComebackWinner = 'dire'
        }

        // rampage = team had at least one player achieve a 5-kill streak
        const hadRampage = (p) => {
          const mk = p.multi_kills || {}
          return (mk[5] || mk['5'] || 0) > 0
        }
        const radiantHasRampage = (data.players || []).some(p => isRadiant(p) && hadRampage(p))
        const direHasRampage = (data.players || []).some(p => !isRadiant(p) && hadRampage(p))

        return {
          radiantHasRapier, direHasRapier, goldSwingWinner, megaComebackWinner,
          radiantHasRampage, direHasRampage,
          // legacy booleans — consumed by MatchCard game rows via GameIndicators
          hasRapier: radiantHasRapier || direHasRapier,
          hasGoldSwing: goldSwingWinner !== null,
          hasMegaComeback: megaComebackWinner !== null,
          hasRampage: radiantHasRampage || direHasRampage,
        }
      }

      const settled = await Promise.allSettled(
        uncached.map(async id => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 8000)
          try {
            const fetchRes = await fetch(`https://api.opendota.com/api/matches/${id}`, { signal: controller.signal })
            if (!fetchRes.ok) throw new Error(`OpenDota ${fetchRes.status}`)
            const data = await fetchRes.json()
            return { id, indicators: computeIndicators(data) }
          } finally {
            clearTimeout(timeout)
          }
        })
      )

      const toCache = []
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value) {
          const { id, indicators } = outcome.value
          result[id] = indicators
          toCache.push({ id, indicators })
        }
      }

      if (toCache.length > 0) {
        Promise.all(
          toCache.map(({ id, indicators }) =>
            kv.set(`${KV_PREFIX}${id}`, indicators, { ex: INDICATORS_TTL })
          )
        ).catch(err => console.warn('match-indicators KV write failed:', err?.message))
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(result)
  }

  // Default mode - existing TournamentHub behavior (tournament sub-stages)
  if (req.query?.bust === '1') {
    await kv.del(KV_LIST_KEY)
    await kv.del(KV_STATUS_KEY)
    console.log('KV cache cleared')
  }

  try {
    const list = await fetchTournamentList(token)
    const statuses = await fetchTournamentStatuses(token)

    const allTournaments = [...new Map([...list.ongoing, ...list.upcoming].map(t => [t.id, t])).values()]
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
    await trackError('/api/tournaments', 500, err?.message)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

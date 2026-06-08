/**
 * Tournament/series list utilities.
 * Shared by the router and multiple handler files.
 */

import { kv } from '../_kv.js'
import {
  isTier1ByFields,
  isTier1 as isTier1Match,
  isTier1ByName,
  PANDASCORE_BASE,
  KV_TIER1_NAMES_KEY,
  PERMANENT_TIER1_NAMES as SHARED_PERMANENT_TIER1_NAMES,
  STREAM_TTL,
  parseBracketRound,
  findOdMatchByTime,
  buildTournamentName as buildMatchTournamentName,
} from '../_shared.js'

// ── Tournament list ──────────────────────────────────────────────────────────

export const KV_LIST_KEY = 'dota2:tournament_list_v7'
export const KV_STATUS_KEY = 'dota2:tournament_statuses_v5'
export const LIST_TTL = 60 * 60 * 6        // 6 hours - catches stage transitions (Group -> Playoffs)
export const STATUS_TTL = 60 * 60 * 4      // 4 hours

// Adapter for tournament objects from /dota2/tournaments/* (tier on t.tier directly,
// not on t.league.tier which is always null). Delegates to the centralised
// isTier1ByFields in _shared.js so the league-name keyword override is applied here too.
// Also checks SHARED_PERMANENT_TIER1_NAMES so manually whitelisted organizers (e.g. 1win Essence)
// appear in the TournamentHub regardless of their PandaScore tier.
export function isTier1(t) {
  if (isTier1ByFields(t?.tier, t?.league?.name)) return true
  const leagueName = (t?.league?.name || '').toLowerCase()
  return SHARED_PERMANENT_TIER1_NAMES.some(n => leagueName.includes(n.toLowerCase()))
}

export function buildTournamentName(t) {
  const league = t.league?.name || ''
  const serie = t.serie?.full_name || t.serie?.name || ''
  const stage = t.name || ''
  if (league && serie) {
    const base = serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`
    return `${base}${stage && stage !== 'Season' ? ` - ${stage}` : ''}`
  }
  return league || serie || stage || 'Unknown'
}

export function resolveXHandle(name) {
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

export function mapTournament(t, status) {
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

export async function fetchTournamentList(token) {
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

export async function fetchTournamentStatuses(token) {
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

// ── Series list ──────────────────────────────────────────────────────────────

export const KV_SERIES_KEY = 'tournaments:dota2:series_list_v8'
export const SERIES_TTL = 60 * 60 // 1 hour

export function formatPrizePool(prize) {
  if (!prize) return null
  const match = String(prize).match(/[\d,]+/)
  if (!match) return prize
  const num = parseInt(match[0].replace(/,/g, ''))
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
  return `$${num}`
}

export function mapSeries(serie, status) {
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

export async function fetchSeriesList(token) {
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
  // Also passes series whose league name matches a known major brand — catches regional qualifier
  // series that PandaScore creates in /series/upcoming before their tournament sub-stages exist.
  const allUpcoming = [
    ...(upcoming || []).filter(s =>
      tier1UpcomingSerieIds.has(s.id) ||
      isTier1ByFields(null, s.league?.name)
    ).map(s => mapSeries(s, 'upcoming')),
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
  console.log(`After tier filter - live:${(running||[]).filter(s => tier1RunningSerieIds.has(s.id) || isTier1ByFields(null, s.league?.name)).length}/${(running||[]).length} upcoming:${(upcoming||[]).filter(s => tier1UpcomingSerieIds.has(s.id) || isTier1ByFields(null, s.league?.name)).length}/${(upcoming||[]).length} past:${completedFiltered.length}/${(past||[]).length} | synthetic:${syntheticUpcoming.length} deduped:${deduplicatedUpcoming.length}`)
  if (rescuedToLive.length > 0) {
    console.log(`Rescued ${rescuedToLive.length} series from past→live: ${rescuedToLive.map(s => s.full_name || s.name).join(', ')}`)
  }

  const payload = {
    live: [
      ...(running || []).filter(s => tier1RunningSerieIds.has(s.id) || isTier1ByFields(null, s.league?.name)).map(s => mapSeries(s, 'live')),
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

// ── Tier 1 league names ──────────────────────────────────────────────────────

export const TIER1_NAMES_TTL = 60 * 60 * 2 // 2 hours

export async function fetchTier1LeagueNames(token) {
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
  const names = [...new Set([...SHARED_PERMANENT_TIER1_NAMES, ...dynamicNames])]

  console.log(`tier1-leagues: ${names.length} names — ${names.join(', ')}`)

  // Never cache an empty result — would poison the filter until TTL expires.
  if (names.length > 0) {
    kv.set(KV_TIER1_NAMES_KEY, names, { ex: TIER1_NAMES_TTL }).catch(() => {})
  }
  return names
}

// ── Recent Completed ─────────────────────────────────────────────────────────

export const KV_RC_KEY = 'dota2:recent_completed_v4'
export const RC_TTL = 60 * 5  // 5 minutes

export const FORMAT_TO_SERIES_TYPE_RC = { best_of_1: 0, best_of_2: 3, best_of_3: 1, best_of_5: 2 }

export function calcDuration(game) {
  if (game.length != null) return new Date(game.length * 1000).toISOString().slice(11, 16)
  if (game.begin_at && game.end_at) {
    const secs = Math.max(0, Math.floor((new Date(game.end_at) - new Date(game.begin_at)) / 1000))
    return new Date(secs * 1000).toISOString().slice(11, 16)
  }
  return '00:00'
}

// Fetch OD promatches from the last 8h. Used to resolve PS game begin_at → OD match_id
// without relying on PS's external_identifier (which requires OD to have already indexed).
export async function fetchOdPromatches() {
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

export async function fetchRecentCompleted(token, bust = false) {
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

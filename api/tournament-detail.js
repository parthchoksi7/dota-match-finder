import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const BASE = 'https://api.pandascore.co'
const TTL = 60 * 3 // 3 minutes — bracket/standings change during live matches

function parseBracketPosition(name) {
  const n = (name || '').trim()
  const lower = n.toLowerCase()

  // Grand Final
  if (lower.includes('grand final')) {
    return { section: 'grand_final', round: 99, label: n || 'Grand Final' }
  }

  // Detect bracket section
  let section = 'main'
  if (lower.includes('upper bracket') || lower.startsWith('ub ')) {
    section = 'upper'
  } else if (lower.includes('lower bracket') || lower.startsWith('lb ')) {
    section = 'lower'
  }

  // Detect round ordering within section (higher = later in tournament)
  let round = 1
  const numMatch = n.match(/Round\s+(\d+)/i)
  if (numMatch) {
    round = parseInt(numMatch[1])
  } else if (lower.includes('quarterfinal') || lower.includes('quarter-final') || lower.includes('quarter final')) {
    round = 10
  } else if (lower.includes('semifinal') || lower.includes('semi-final') || lower.includes('semi final')) {
    round = 20
  } else if (lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) {
    round = 30
  }

  // Extract match position within this round (e.g. "Round 1 Match 3" → 3)
  const matchPosMatch = n.match(/Match\s+(\d+)/i)
  const matchPosition = matchPosMatch ? parseInt(matchPosMatch[1]) : null

  // Strip section prefix from label so column headers show "Quarterfinal" not "Upper Bracket Quarterfinal"
  const shortLabel = n
    .replace(/^upper\s+bracket\s*/i, '')
    .replace(/^lower\s+bracket\s*/i, '')
    .replace(/^ub\s+/i, '')
    .replace(/^lb\s+/i, '')
    .trim()

  let label = shortLabel || n || 'Round'
  if (lower.includes('quarterfinal') || lower.includes('quarter-final') || lower.includes('quarter final')) {
    label = 'Quarterfinal'
  } else if (lower.includes('semifinal') || lower.includes('semi-final') || lower.includes('semi final')) {
    label = 'Semifinal'
  } else if (lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) {
    label = 'Final'
  } else if (numMatch) {
    label = `Round ${numMatch[1]}`
  } else if (lower.includes(' vs ')) {
    // PandaScore sometimes names bracket rounds after the first match (e.g. "Tundra vs RNX").
    // These are not meaningful round labels, so clear them to avoid showing team names as headers.
    label = ''
  }
  return { section, round, label, matchPosition }
}

/**
 * Infer tournament format from PandaScore fields.
 * PandaScore has no explicit `format` field, so we derive it from:
 *  - `has_bracket`: false = group/swiss stage, true = elimination bracket
 *  - `name`: "Group Stage", "Playoffs", "Main Event", etc.
 *  - Round count + team count heuristics
 */
function inferFormat(tournament, roundCounts) {
  const name = (tournament.name || '').toLowerCase()
  const hasBracket = tournament.has_bracket

  // Group stages are never elimination brackets, even if PandaScore sets has_bracket: true
  if (name.includes('group')) {
    const numRounds = Object.keys(roundCounts).length
    const numTeams = tournament.teams?.length || 0
    if (numTeams > 0 && numRounds < numTeams - 1) return 'Swiss'
    if (numRounds > 0) return 'Swiss'
    return 'Group Stage'
  }

  if (hasBracket) {
    // Elimination bracket — Dota 2 tier-1 events use double elimination for playoffs
    if (name.includes('playoff') || name.includes('main event') || name.includes('upper') || name.includes('lower')) {
      return 'Double Elimination'
    }
    return 'Bracket'
  }

  return null // unknown
}

function normalizeMatch(m, matchPosition = null) {
  const opA = m.opponents?.[0]?.opponent
  const opB = m.opponents?.[1]?.opponent
  const resA = opA ? (m.results || []).find(r => r.team_id === opA.id)?.score ?? null : null
  const resB = opB ? (m.results || []).find(r => r.team_id === opB.id)?.score ?? null : null
  const winnerId = m.winner_id || null
  return {
    id: m.id,
    status: m.status,
    teamA: opA?.name || 'TBD',
    teamB: opB?.name || 'TBD',
    scoreA: resA,
    scoreB: resB,
    winnerName: winnerId === opA?.id ? opA?.name : winnerId === opB?.id ? opB?.name : null,
    scheduledAt: m.scheduled_at || m.begin_at || null,
    numberOfGames: m.number_of_games,
    matchPosition,
  }
}

// ── Series detail mode (?series=1) ──────────────────────────────────────────
// Used by /tournament/:id page. Fetches a PandaScore series (not a sub-stage)
// including rosters and standings for each tournament stage within it.

const SERIES_DETAIL_TTL = 60 * 30 // 30 minutes

function formatPrizePool(prize) {
  if (!prize) return null
  const match = String(prize).match(/[\d,]+/)
  if (!match) return prize
  const num = parseInt(match[0].replace(/,/g, ''))
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
  return `$${num}`
}

function mapSeriesPlayer(p) {
  return {
    id: p.player?.id || p.id,
    name: p.player?.name || p.name || null,
    firstName: p.player?.first_name || p.first_name || null,
    lastName: p.player?.last_name || p.last_name || null,
    nationality: p.player?.nationality || p.nationality || null,
    role: p.player?.role || p.role || null,
    imageUrl: p.player?.image_url || p.image_url || null,
  }
}

function mapSeriesTeam(t, qualified) {
  const name = t.team?.name || t.name || 'Unknown'
  const location = t.team?.location || t.location || null
  console.log(`[team-location] ${name}: ${location}`)
  return {
    id: t.team?.id || t.id,
    name,
    acronym: t.team?.acronym || t.acronym || null,
    location,
    imageUrl: t.team?.image_url || t.image_url || null,
    qualified,
    players: (t.players || []).map(mapSeriesPlayer),
  }
}

async function fetchSeriesRosters(tournamentId, headers) {
  try {
    const res = await fetch(`${BASE}/tournaments/${tournamentId}/rosters`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

async function fetchSeriesStandings(tournamentId, headers) {
  try {
    const res = await fetch(`${BASE}/tournaments/${tournamentId}/standings`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

async function fetchStageBracket(tournamentId, headers) {
  try {
    const res = await fetch(`${BASE}/tournaments/${tournamentId}/brackets`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function parseRawBracket(bracketsRaw) {
  const roundMap = {}
  for (const m of (Array.isArray(bracketsRaw) ? bracketsRaw : [])) {
    const { section, round, label, matchPosition } = parseBracketPosition(m.name)
    const key = `${section}__${round}`
    if (!roundMap[key]) roundMap[key] = { section, round, label, matches: [] }
    roundMap[key].matches.push(normalizeMatch(m, matchPosition))
  }
  for (const r of Object.values(roundMap)) {
    r.matches.sort((a, b) => {
      if (a.matchPosition !== null && b.matchPosition !== null) return a.matchPosition - b.matchPosition
      return a.id - b.id
    })
  }
  const SECTION_ORDER = { upper: 0, lower: 1, main: 2, grand_final: 3 }
  return Object.values(roundMap).sort((a, b) =>
    (SECTION_ORDER[a.section] - SECTION_ORDER[b.section]) || (a.round - b.round)
  )
}

async function handleSeriesDetail(req, res, token) {
  const seriesId = req.query?.id
  const cacheKey = `tournament:detail:series:v5:${seriesId}`

  if (req.query?.bust === '1') {
    await kv.del(cacheKey).catch(() => {})
    console.log(`Series detail cache cleared for ${seriesId}`)
  } else {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        console.log(`Series detail: serving from KV cache for ${seriesId}`)
        return res.status(200).json(cached)
      }
    } catch (err) {
      console.warn('KV cache read failed:', err?.message)
    }
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  // Single-entity /dota2/series/{id} returns 404 on the current plan tier.
  // Use parallel filter calls on the list endpoints instead (confirmed working).
  const [runR, upR, pastR] = await Promise.all([
    fetch(`${BASE}/dota2/series/running?filter[id]=${seriesId}`, { headers }),
    fetch(`${BASE}/dota2/series/upcoming?filter[id]=${seriesId}`, { headers }),
    fetch(`${BASE}/dota2/series/past?filter[id]=${seriesId}`, { headers }),
  ])
  const toArr = async (r) => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
  const [runData, upData, pastData] = await Promise.all([
    runR.ok ? toArr(runR) : Promise.resolve([]),
    upR.ok ? toArr(upR) : Promise.resolve([]),
    pastR.ok ? toArr(pastR) : Promise.resolve([]),
  ])
  const serie = [...runData, ...upData, ...pastData][0]
  if (!serie) return res.status(404).json({ error: 'Tournament not found' })
  const tournaments = serie.tournaments || []

  const stageData = await Promise.all(
    tournaments.map(async (t) => {
      const [rosters, standings, bracketsRaw] = await Promise.all([
        fetchSeriesRosters(t.id, headers),
        fetchSeriesStandings(t.id, headers),
        t.has_bracket ? fetchStageBracket(t.id, headers) : Promise.resolve([]),
      ])
      return { tournament: t, rosters, standings, bracketsRaw }
    })
  )

  const teamMap = new Map()
  for (const stage of stageData) {
    const stageName = (stage.tournament.name || '').toLowerCase()
    const isQualifier = stageName.includes('qualifier') || stageName.includes('qual')
    for (const roster of (stage.rosters || [])) {
      const teamId = roster.team?.id || roster.id
      if (!teamId) continue
      if (teamMap.has(teamId)) {
        // Qualifier status wins: if we see a team in a qualifier stage, upgrade
        // their label even if they were already seen in the main event roster.
        if (isQualifier) teamMap.get(teamId).qualified = 'qualified'
        continue
      }
      teamMap.set(teamId, mapSeriesTeam(roster, isQualifier ? 'qualified' : 'invited'))
    }
  }

  // Fallback: if rosters are unavailable (e.g. upcoming events), build teams from standings.
  // Standings objects from PandaScore include the full team (name, acronym, location, image_url).
  // Players will be empty, which TeamRoster displays as "Roster unavailable".
  for (const stage of stageData) {
    for (const s of (stage.standings || [])) {
      const team = s.team
      if (!team?.id || teamMap.has(team.id)) continue
      teamMap.set(team.id, {
        id: team.id,
        name: team.name || 'Unknown',
        acronym: team.acronym || null,
        location: team.location || null,
        imageUrl: team.image_url || null,
        qualified: 'invited',
        players: [],
      })
    }
  }

  const leagueName = serie.league?.name || ''
  const now = new Date()
  const begin = serie.begin_at ? new Date(serie.begin_at) : null
  const end = serie.end_at ? new Date(serie.end_at) : null
  let status = 'upcoming'
  if (end && end < now) status = 'completed'
  else if (begin && begin <= now) status = 'live'

  let streamUrl = null
  if (status === 'live') {
    const lower = leagueName.toLowerCase()
    if (lower.includes('pgl')) streamUrl = 'https://twitch.tv/pgl_dota2'
    else if (lower.includes('esl') || lower.includes('dreamleague')) streamUrl = 'https://twitch.tv/esl_dota2'
    else if (lower.includes('beyond the summit') || lower.includes('bts')) streamUrl = 'https://twitch.tv/beyond_the_summit'
    else if (lower.includes('blast')) streamUrl = 'https://twitch.tv/blast_dota2'
    else if (lower.includes('weplay')) streamUrl = 'https://twitch.tv/weplaydota'
    else if (lower.includes('the international')) streamUrl = 'https://twitch.tv/dota2ti'
  }

  const payload = {
    id: serie.id,
    slug: serie.slug || String(serie.id),
    name: serie.full_name || serie.name || leagueName,
    leagueName,
    leagueSlug: serie.league?.slug || '',
    status,
    beginAt: serie.begin_at || null,
    endAt: serie.end_at || null,
    prizePool: formatPrizePool(serie.prizepool),
    winner: (() => {
      // Prefer rank-1 from the last completed stage with standings — more accurate
      // than serie.winner which PandaScore sometimes sets incorrectly.
      const finalStage = stageData
        .filter(s => s.standings?.length > 0)
        .sort((a, b) => new Date(b.tournament.end_at || 0) - new Date(a.tournament.end_at || 0))[0]
      const top = finalStage?.standings?.find(s => s.rank === 1)
      if (top?.team?.name) return { id: top.team.id, name: top.team.name }
      // Fall back to PandaScore's winner field if no standings available
      if (serie.winner?.type?.toLowerCase() === 'team' && serie.winner.name) {
        return { id: serie.winner.id, name: serie.winner.name }
      }
      return null
    })(),
    liquipediaUrl: `https://liquipedia.net/dota2/${encodeURIComponent((serie.league?.slug || leagueName).replace(/\s+/g, '_'))}`,
    streamUrl,
    stages: stageData.map(({ tournament: t, standings, bracketsRaw }) => ({
      id: t.id,
      name: t.name,
      beginAt: t.begin_at || null,
      endAt: t.end_at || null,
      tier: t.tier || null,
      prizePool: formatPrizePool(t.prizepool),
      hasBracket: t.has_bracket || false,
      standings: (standings || []).map(s => ({
        rank: s.rank,
        teamId: s.team?.id,
        teamName: s.team?.name || 'TBD',
        wins: s.wins ?? null,
        losses: s.losses ?? null,
        points: s.total?.points ?? null,
      })),
      bracket: t.has_bracket ? parseRawBracket(bracketsRaw) : [],
    })),
    teams: Array.from(teamMap.values()),
    fetchedAt: new Date().toISOString(),
  }

  const cacheTtl = status === 'completed' ? 60 * 60 * 24 * 30 : SERIES_DETAIL_TTL
  kv.set(cacheKey, payload, { ex: cacheTtl }).catch(() => {})
  return res.status(200).json(payload)
}

export default async function handler(req, res) {
  const tournamentId = req.query?.id
  if (!tournamentId) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

  res.setHeader('Access-Control-Allow-Origin', '*')

  // Series detail mode — for /tournament/:id page
  if (req.query?.series === '1') {
    try {
      return await handleSeriesDetail(req, res, token)
    } catch (err) {
      console.error('Series detail error:', err?.message || err)
      return res.status(500).json({ error: 'Failed to fetch tournament details', message: err?.message })
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180')

  const KV_KEY = `dota2:tournament_detail_v3:${tournamentId}`

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY).catch(() => {})
  } else {
    try {
      const cached = await kv.get(KV_KEY)
      if (cached) return res.status(200).json(cached)
    } catch {}
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

  try {
    // Fetch tournament metadata, standings, and bracket in parallel
    const [tRes, standingsRes, bracketsRes] = await Promise.all([
      fetch(`${BASE}/tournaments/${tournamentId}`, { headers }),
      fetch(`${BASE}/tournaments/${tournamentId}/standings`, { headers }),
      fetch(`${BASE}/tournaments/${tournamentId}/brackets`, { headers }),
    ])

    const [tournament, standingsRaw, bracketsRaw] = await Promise.all([
      tRes.ok ? tRes.json() : {},
      standingsRes.ok ? standingsRes.json() : [],
      bracketsRes.ok ? bracketsRes.json() : [],
    ])

    // Group bracket matches by section + round
    const roundMap = {}
    for (const m of (Array.isArray(bracketsRaw) ? bracketsRaw : [])) {
      const { section, round, label, matchPosition } = parseBracketPosition(m.name)
      const key = `${section}__${round}`
      if (!roundMap[key]) roundMap[key] = { section, round, label, matches: [] }
      roundMap[key].matches.push(normalizeMatch(m, matchPosition))
    }
    // Sort matches within each round by their position so SVG connector indices are correct
    for (const r of Object.values(roundMap)) {
      r.matches.sort((a, b) => {
        if (a.matchPosition !== null && b.matchPosition !== null)
          return a.matchPosition - b.matchPosition
        return a.id - b.id
      })
    }
    // Sort: upper first, lower second, main third, grand_final last; within section by round
    const SECTION_ORDER = { upper: 0, lower: 1, main: 2, grand_final: 3 }
    const bracket = Object.values(roundMap)
      .sort((a, b) =>
        (SECTION_ORDER[a.section] - SECTION_ORDER[b.section]) || (a.round - b.round)
      )

    // Count rounds for format inference (only main/upper rounds)
    const roundCounts = {}
    for (const m of (Array.isArray(bracketsRaw) ? bracketsRaw : [])) {
      const { section, round } = parseBracketPosition(m.name)
      if (section === 'main' || section === 'upper') {
        roundCounts[round] = (roundCounts[round] || 0) + 1
      }
    }

    // Fetch sibling stages from the same serie to show full event structure.
    // Query running + upcoming + past separately — the generic endpoint excludes upcoming stages.
    let eventStages = []
    if (tournament.serie_id) {
      try {
        const [runStagesRes, upStagesRes, pastStagesRes] = await Promise.all([
          fetch(`${BASE}/dota2/tournaments/running?filter[serie_id]=${tournament.serie_id}&page[size]=20`, { headers }),
          fetch(`${BASE}/dota2/tournaments/upcoming?filter[serie_id]=${tournament.serie_id}&page[size]=20`, { headers }),
          fetch(`${BASE}/dota2/tournaments/past?filter[serie_id]=${tournament.serie_id}&page[size]=20`, { headers }),
        ])
        const toArr = async r => { try { const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] } }
        const [runStages, upStages, pastStages] = await Promise.all([
          runStagesRes.ok ? toArr(runStagesRes) : [],
          upStagesRes.ok ? toArr(upStagesRes) : [],
          pastStagesRes.ok ? toArr(pastStagesRes) : [],
        ])

        // Deduplicate by id first, then by name — prefer running > upcoming > past
        // (PandaScore sometimes creates multiple stage IDs for the same named group)
        const seenIds = new Set()
        const seenNames = new Set()
        const stages = [...runStages, ...upStages, ...pastStages].filter(s => {
          if (seenIds.has(s.id)) return false
          seenIds.add(s.id)
          const name = (s.name || '').trim().toLowerCase()
          if (name && seenNames.has(name)) return false
          if (name) seenNames.add(name)
          return true
        })

        const now = new Date()
        eventStages = stages
          .sort((a, b) => {
            const ta = a.begin_at ? new Date(a.begin_at).getTime() : Infinity
            const tb = b.begin_at ? new Date(b.begin_at).getTime() : Infinity
            if (ta !== tb) return ta - tb
            return (a.name || '').localeCompare(b.name || '')
          })
          .map(s => ({
            id: s.id,
            name: s.name,
            status: s.end_at && new Date(s.end_at) < now ? 'finished'
              : s.begin_at && new Date(s.begin_at) > now ? 'upcoming'
              : 'running',
            format: inferFormat(s, {}),
            beginAt: s.begin_at || null,
            endAt: s.end_at || null,
            hasBracket: s.has_bracket,
          }))
      } catch {}
    }

    const format = inferFormat(tournament, roundCounts)
    const totalRounds = Object.keys(roundCounts).filter(r => r !== '999').length
    const teamCount = tournament.teams?.length || 0

    // Normalize standings
    const standings = Array.isArray(standingsRaw)
      ? standingsRaw
          .sort((a, b) => (a.rank - b.rank) || (b.wins - a.wins))
          .map(s => ({
            rank: s.rank,
            team: s.team?.name || 'TBD',
            wins: s.wins ?? 0,
            losses: s.losses ?? 0,
          }))
      : []

    const payload = {
      format,          // e.g. 'Swiss', 'Double Elimination', 'Group Stage'
      totalRounds,     // number of swiss/bracket rounds
      teamCount,       // teams in this stage
      eventStages,     // all stages of the same event (Group Stage → Playoffs)
      standings,
      bracket,
      fetchedAt: new Date().toISOString(),
    }

    kv.set(KV_KEY, payload, { ex: TTL }).catch(() => {})

    return res.status(200).json(payload)
  } catch (err) {
    console.error('Tournament detail error:', err?.message)
    return res.status(500).json({ error: 'Failed to fetch tournament detail' })
  }
}

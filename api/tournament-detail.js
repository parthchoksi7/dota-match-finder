import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const BASE = 'https://api.pandascore.co'
const TTL = 60 * 3 // 3 minutes — bracket/standings change during live matches

function parseRound(name) {
  const m = (name || '').match(/Round\s+(\d+)/i)
  return m ? parseInt(m[1]) : 999
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

  if (hasBracket) {
    // Elimination bracket — Dota 2 tier-1 events use double elimination for playoffs
    if (name.includes('playoff') || name.includes('main event') || name.includes('upper') || name.includes('lower')) {
      return 'Double Elimination'
    }
    return 'Bracket'
  }

  // No bracket flag — group/swiss stage
  if (name.includes('group')) {
    // Swiss: each team plays the same number of rounds, not everyone meets everyone.
    // Round-robin: every team plays every other team.
    // Dota 2 tier-1 events have used Swiss since ~2022. Heuristic: if rounds < teams, likely Swiss.
    const numRounds = Object.keys(roundCounts).length
    const numTeams = tournament.teams?.length || 0
    if (numTeams > 0 && numRounds < numTeams - 1) return 'Swiss'
    if (numRounds > 0) return 'Swiss' // default for group stages in Dota 2
    return 'Group Stage'
  }

  return null // unknown
}

function normalizeMatch(m) {
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
  }
}

export default async function handler(req, res) {
  const tournamentId = req.query?.id
  if (!tournamentId) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

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

    // Group bracket matches by round
    const roundMap = {}
    for (const m of (Array.isArray(bracketsRaw) ? bracketsRaw : [])) {
      const round = parseRound(m.name)
      if (!roundMap[round]) roundMap[round] = []
      roundMap[round].push(normalizeMatch(m))
    }
    const bracket = Object.entries(roundMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([round, matches]) => ({ round: Number(round), matches }))

    // Count rounds for format inference
    const roundCounts = {}
    for (const m of (Array.isArray(bracketsRaw) ? bracketsRaw : [])) {
      const r = parseRound(m.name)
      roundCounts[r] = (roundCounts[r] || 0) + 1
    }

    // Fetch sibling stages from the same serie to show full event structure
    let eventStages = []
    if (tournament.serie_id) {
      try {
        const stagesRes = await fetch(
          `${BASE}/dota2/tournaments?filter[serie_id]=${tournament.serie_id}&page[size]=20`,
          { headers }
        )
        if (stagesRes.ok) {
          const stages = await stagesRes.json()
          if (Array.isArray(stages)) {
            eventStages = stages
              .sort((a, b) => new Date(a.begin_at || 0) - new Date(b.begin_at || 0))
              .map(s => ({
                id: s.id,
                name: s.name,
                status: s.end_at && new Date(s.end_at) < new Date() ? 'finished'
                  : s.begin_at && new Date(s.begin_at) > new Date() ? 'upcoming'
                  : 'running',
                format: inferFormat(s, {}),
                beginAt: s.begin_at || null,
                endAt: s.end_at || null,
                hasBracket: s.has_bracket,
              }))
          }
        }
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

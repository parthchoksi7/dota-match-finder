import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const TTL = 60 * 30 // 30 minutes
const PANDASCORE_BASE = 'https://api.pandascore.co'

function formatPrizePool(prize) {
  if (!prize) return null
  const match = String(prize).match(/[\d,]+/)
  if (!match) return prize
  const num = parseInt(match[0].replace(/,/g, ''))
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`
  return `$${num}`
}

function mapPlayer(p) {
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

function mapTeam(t, qualified) {
  return {
    id: t.team?.id || t.id,
    name: t.team?.name || t.name || 'Unknown',
    acronym: t.team?.acronym || t.acronym || null,
    location: t.team?.location || t.location || null,
    imageUrl: t.team?.image_url || t.image_url || null,
    qualified,
    players: (t.players || []).map(mapPlayer),
  }
}

async function fetchRosters(tournamentId, headers) {
  try {
    const res = await fetch(`${PANDASCORE_BASE}/tournaments/${tournamentId}/rosters`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return data || []
  } catch {
    return []
  }
}

async function fetchStandings(tournamentId, headers) {
  try {
    const res = await fetch(`${PANDASCORE_BASE}/tournaments/${tournamentId}/standings`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return data || []
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  const seriesId = req.query?.id
  if (!seriesId) {
    return res.status(400).json({ error: 'Missing id parameter' })
  }

  const cacheKey = `tournament:detail:series:${seriesId}`

  if (req.query?.bust === '1') {
    await kv.del(cacheKey)
    console.log(`Series detail cache cleared for ${seriesId}`)
  }

  try {
    const cached = await kv.get(cacheKey)
    if (cached) {
      console.log(`Series detail: serving from KV cache for ${seriesId}`)
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  try {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

    // Fetch the series
    const seriesRes = await fetch(`${PANDASCORE_BASE}/dota2/series/${seriesId}`, { headers })
    if (seriesRes.status === 404) {
      return res.status(404).json({ error: 'Tournament not found' })
    }
    if (!seriesRes.ok) {
      throw new Error(`PandaScore series error: ${seriesRes.status}`)
    }

    const serie = await seriesRes.json()

    const tournaments = serie.tournaments || []

    // Fetch rosters and standings for each tournament stage in parallel
    const stageData = await Promise.all(
      tournaments.map(async (t) => {
        const [rosters, standings] = await Promise.all([
          fetchRosters(t.id, headers),
          fetchStandings(t.id, headers),
        ])
        return { tournament: t, rosters, standings }
      })
    )

    // Collect all unique teams across all stages
    const teamMap = new Map()
    for (const stage of stageData) {
      const stageName = (stage.tournament.name || '').toLowerCase()
      const isQualifier = stageName.includes('qualifier') || stageName.includes('qual')

      for (const roster of stage.rosters) {
        const teamId = roster.team?.id || roster.id
        if (!teamId) continue
        if (!teamMap.has(teamId)) {
          teamMap.set(teamId, mapTeam(roster, isQualifier ? 'qualified' : 'invited'))
        }
      }
    }

    const leagueName = serie.league?.name || ''
    const fullName = serie.full_name || serie.name || leagueName

    // Determine status
    const now = new Date()
    const begin = serie.begin_at ? new Date(serie.begin_at) : null
    const end = serie.end_at ? new Date(serie.end_at) : null
    let status = 'upcoming'
    if (end && end < now) status = 'completed'
    else if (begin && begin <= now) status = 'live'

    // Find live stream if running
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

    const liquipediaUrl = `https://liquipedia.net/dota2/${encodeURIComponent((serie.league?.slug || leagueName).replace(/\s+/g, '_'))}`

    const payload = {
      id: serie.id,
      slug: serie.slug || String(serie.id),
      name: fullName,
      leagueName,
      leagueSlug: serie.league?.slug || '',
      status,
      beginAt: serie.begin_at || null,
      endAt: serie.end_at || null,
      prizePool: formatPrizePool(serie.prizepool),
      liquipediaUrl,
      streamUrl,
      stages: stageData.map(({ tournament: t, standings }) => ({
        id: t.id,
        name: t.name,
        beginAt: t.begin_at || null,
        endAt: t.end_at || null,
        tier: t.tier || null,
        prizePool: formatPrizePool(t.prizepool),
        hasBracket: t.has_bracket || false,
        standings: standings.map(s => ({
          rank: s.rank,
          teamId: s.team?.id,
          teamName: s.team?.name || 'TBD',
          wins: s.wins ?? null,
          losses: s.losses ?? null,
          points: s.total?.points ?? null,
        })),
      })),
      teams: Array.from(teamMap.values()),
      fetchedAt: new Date().toISOString(),
    }

    try {
      await kv.set(cacheKey, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    return res.status(200).json(payload)

  } catch (err) {
    console.error('Series detail error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch tournament details', message: err?.message })
  }
}

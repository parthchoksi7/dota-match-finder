import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:live_matches_v2'
const TTL = 60 * 2 // 2 minutes

import { isTier1, getTwitchStreams, CHANNEL_LABELS, PANDASCORE_BASE, STREAM_TTL } from './_shared.js'

function getSeriesLabel(matchType, numberOfGames) {
  if (matchType === 'best_of_1') return 'BO1'
  if (matchType === 'best_of_2') return 'BO2'
  if (matchType === 'best_of_3') return 'BO3'
  if (matchType === 'best_of_5') return 'BO5'
  if (matchType === 'best_of' && numberOfGames) return `BO${numberOfGames}`
  return null
}


function buildTournamentName(m) {
  const league = m.league?.name || ''
  const serie = m.serie?.full_name || m.serie?.name || ''
  const rawName = league && serie
    ? (serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`)
    : league || serie || 'Unknown'
  return rawName
    .replace(/\bseason\s+(\d+)\b/gi, 'S$1')
    .replace(/\s+\d{4}$/, '')
    .trim()
}

function getSeriesScore(m) {
  const opponents = m.opponents || []
  const results = m.results || []
  if (!results.length || opponents.length < 2) return null

  const teamAId = opponents[0]?.opponent?.id
  const teamBId = opponents[1]?.opponent?.id
  const scoreA = results.find(r => r.team_id === teamAId)?.score ?? 0
  const scoreB = results.find(r => r.team_id === teamBId)?.score ?? 0
  return `${scoreA}-${scoreB}`
}

function getCurrentGame(m) {
  const games = m.games || []
  const running = games.find(g => g.status === 'running')
  return running ? running.position : null
}

function mapGames(m) {
  const opponents = m.opponents || []
  const games = m.games || []
  return games
    .filter(g => g.position != null)
    .sort((a, b) => a.position - b.position)
    .map(g => {
      const winnerId = g.winner?.id
      const winnerOpponent = winnerId
        ? opponents.find(o => o.opponent?.id === winnerId)
        : null
      return {
        position: g.position,
        status: g.status,
        winnerName: winnerOpponent?.opponent?.name || null,
        matchId: g.external_identifier || null,
        beginAt: g.begin_at || null,
      }
    })
}

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const leagueName = m.league?.name || ''
  const serieName = m.serie?.full_name || m.serie?.name || ''

  return {
    id: m.id,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    seriesScore: getSeriesScore(m),
    currentGame: getCurrentGame(m),
    games: mapGames(m),
    streams: getTwitchStreams(m.streams_list, leagueName, serieName),
  }
}

/**
 * For matches that have multiple official English streams in the bulk response,
 * fetch individual match data — the per-match endpoint sets main:true on exactly
 * the sub-channel assigned to that match, which the bulk endpoint does not.
 */
async function enrichMultiStreamMatches(matches, headers) {
  const multi = matches.filter(m => {
    const official = (m.streams_list || []).filter(s => s.official && s.language === 'en' && s.raw_url)
    return official.length > 1
  })
  if (multi.length === 0) return
  await Promise.all(multi.map(async m => {
    try {
      const r = await fetch(`${PANDASCORE_BASE}/matches/${m.id}`, { headers })
      if (!r.ok) {
        console.warn(`enrichMultiStream: match ${m.id} fetch failed (${r.status})`)
        return
      }
      const detail = await r.json()
      const en = (detail.streams_list || []).filter(s => s.official && s.language === 'en')
      console.log(`enrichMultiStream: match ${m.id} →`, en.map(s => `${s.raw_url}(main=${s.main})`).join(', '))
      if (detail.streams_list) m.streams_list = detail.streams_list
    } catch (err) {
      console.warn(`enrichMultiStream: match ${m.id} exception:`, err?.message)
    }
  }))
}

/**
 * Writes stream:match and stream:ts KV entries for all running games.
 * Called by both the normal handler (client poll) and the cron mode.
 * nx=true on stream:match so the first recorded channel is never overwritten.
 */
async function cacheRunningStreams(rawMatches) {
  const streamWrites = []
  const tsBuckets = {} // roundedTs → Set<channel>

  for (const m of rawMatches) {
    const streams = getTwitchStreams(m.streams_list, m.league?.name, m.serie?.full_name || m.serie?.name)
    if (streams.length !== 1) continue
    const channel = streams[0].url.replace('https://www.twitch.tv/', '')
    for (const game of m.games || []) {
      if (!game.begin_at || game.status !== 'running') continue
      const ts = Math.floor(new Date(game.begin_at).getTime() / 1000)
      const roundedTs = Math.floor(ts / 300) * 300
      if (!tsBuckets[roundedTs]) tsBuckets[roundedTs] = new Set()
      tsBuckets[roundedTs].add(channel)
      const matchId = game.external_identifier || null
      if (matchId) {
        // nx: true — write-once. First recorded channel is never overwritten.
        streamWrites.push(kv.set(`stream:match:${matchId}`, channel, { ex: STREAM_TTL, nx: true }))
      }
    }
  }

  // Write each ts bucket as a JSON array of all channels active in that window.
  // This replaces the old single-value write that caused last-write-wins collisions.
  for (const [roundedTs, channels] of Object.entries(tsBuckets)) {
    streamWrites.push(kv.set(`stream:ts:${roundedTs}`, [...channels], { ex: STREAM_TTL }))
  }

  if (streamWrites.length > 0) {
    await Promise.all(streamWrites).catch(err => console.warn('Stream mapping write failed:', err?.message))
  }
  return streamWrites.length
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  // Cron mode: called every 30 min by GitHub Actions to cache stream channels server-side.
  // Bypasses the KV read cache so it always fetches fresh data from PandaScore.
  // Uses nx:true writes so the first recorded channel is never overwritten.
  if (req.query?.cron === '1') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end()
    }
    try {
      const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      const response = await fetch(`${PANDASCORE_BASE}/matches/running?sort=begin_at&page[size]=20`, { headers })
      if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)
      const data = await response.json()
      const tier1 = (data || []).filter(m => isTier1(m) && m.opponents?.length === 2)
      await enrichMultiStreamMatches(tier1, headers)
      const written = await cacheRunningStreams(tier1)
      console.log(`live-matches cron: ${written} stream writes`)
      return res.status(200).json({ written })
    } catch (err) {
      console.error('live-matches cron error:', err?.message)
      return res.status(500).json({ error: err?.message })
    }
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    console.log('Live matches cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      console.log('Live matches: serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  try {
    console.log('Live matches: fetching from PandaScore')
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    const response = await fetch(`${PANDASCORE_BASE}/matches/running?sort=begin_at&page[size]=20`, { headers })
    if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)

    const data = await response.json()
    const tier1Raw = (data || [])
      .filter(m => isTier1(m))
      .filter(m => m.opponents?.length === 2)
    await enrichMultiStreamMatches(tier1Raw, headers)
    const matches = tier1Raw.map(mapMatch)

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    // Store game start timestamp → channel for single-stream matches.
    // Keyed by begin_at rounded to 5 min so OpenDota's start_time (close but not identical) can look it up.
    await cacheRunningStreams(tier1Raw)

    return res.status(200).json(payload)

  } catch (err) {
    console.error('Live matches error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch live matches', message: err?.message })
  }
}

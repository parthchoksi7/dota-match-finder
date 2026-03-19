import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:live_matches_v1'
const TTL = 60 * 2 // 2 minutes

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

function getSeriesLabel(matchType) {
  if (matchType === 'best_of_1') return 'BO1'
  if (matchType === 'best_of_2') return 'BO2'
  if (matchType === 'best_of_3') return 'BO3'
  if (matchType === 'best_of_5') return 'BO5'
  return null
}

const CHANNEL_LABELS = {
  pgl_dota2: 'PGL',
  pgl_dota2en2: 'PGL EN2',
  esl_dota2: 'ESL',
  esl_dota2ember: 'ESL Ember',
  esl_dota2storm: 'ESL Storm',
  esl_dota2earth: 'ESL Earth',
  beyond_the_summit: 'BTS',
  dota2ti: 'TI',
  blast_dota2: 'BLAST',
  weplaydota: 'WePlay',
}

function getTwitchStreams(streamsList, leagueName, serieName) {
  // Use PandaScore streams_list if available — filters to official English streams only
  const official = (streamsList || []).filter(s => s.official && s.language === 'en' && s.raw_url)
  if (official.length > 0) {
    return official.map(s => {
      const channel = s.raw_url.replace('https://www.twitch.tv/', '')
      return { label: CHANNEL_LABELS[channel] || channel, url: s.raw_url }
    })
  }

  // Fallback: static mapping by tournament name
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()
  if (lower.includes('pgl')) return [
    { label: 'PGL', url: 'https://twitch.tv/pgl_dota2' },
    { label: 'PGL EN2', url: 'https://twitch.tv/pgl_dota2en2' },
  ]
  if (lower.includes('esl one')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
    { label: 'ESL Storm', url: 'https://twitch.tv/esl_dota2storm' },
    { label: 'ESL Earth', url: 'https://twitch.tv/esl_dota2earth' },
  ]
  if (lower.includes('dreamleague')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
  ]
  if (lower.includes('beyond the summit') || lower.includes('bts')) return [
    { label: 'BTS', url: 'https://twitch.tv/beyond_the_summit' },
  ]
  if (lower.includes('blast')) return [
    { label: 'BLAST', url: 'https://twitch.tv/blast_dota2' },
  ]
  if (lower.includes('weplay')) return [
    { label: 'WePlay', url: 'https://twitch.tv/weplaydota' },
  ]
  if (lower.includes('the international') || lower.includes(' ti ')) return [
    { label: 'TI', url: 'https://twitch.tv/dota2ti' },
  ]
  return []
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
    seriesLabel: getSeriesLabel(m.match_type),
    seriesScore: getSeriesScore(m),
    currentGame: getCurrentGame(m),
    games: mapGames(m),
    streams: getTwitchStreams(m.streams_list, leagueName, serieName),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

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
    const matches = (data || [])
      .filter(m => isTier1(m.league?.name, m.serie?.full_name))
      .filter(m => m.opponents?.length === 2)
      .map(mapMatch)

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    // Store game start timestamp → channel for single-stream matches.
    // Keyed by begin_at rounded to 5 min so OpenDota's start_time (close but not identical) can look it up.
    const STREAM_TTL = 60 * 60 * 24 * 14 // 14 days
    const streamWrites = []
    for (const match of matches) {
      if (match.streams.length === 1) {
        const channel = match.streams[0].url.replace('https://www.twitch.tv/', '')
        for (const game of match.games) {
          if (game.beginAt && game.status !== 'not_started') {
            const ts = Math.floor(new Date(game.beginAt).getTime() / 1000)
            const roundedTs = Math.floor(ts / 300) * 300
            streamWrites.push(kv.set(`stream:ts:${roundedTs}`, channel, { ex: STREAM_TTL }))
          }
        }
      }
    }
    if (streamWrites.length > 0) {
      await Promise.all(streamWrites).catch(err => console.warn('Stream mapping write failed:', err?.message))
    }

    return res.status(200).json(payload)

  } catch (err) {
    console.error('Live matches error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch live matches', message: err?.message })
  }
}

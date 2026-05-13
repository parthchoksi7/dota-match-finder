import { Redis } from '@upstash/redis'
import webpush from 'web-push'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KV_KEY = 'dota2:live_matches_v3'
const TTL = 60 * 2 // 2 minutes
const PUSH_SUB_TTL = 30 * 24 * 3600 // 30 days

if (process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@spectateesports.live',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

import { isTier1, isTier1ByName, getTwitchStreams, CHANNEL_LABELS, PANDASCORE_BASE, STREAM_TTL, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES } from './_shared.js'

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
const FORMAT_MATCH_TTL = 7 * 24 * 3600 // 7 days — survives full group stage duration

async function cacheRunningStreams(rawMatches) {
  const streamWrites = []
  const tsBuckets = {} // roundedTs → Set<channel>

  for (const m of rawMatches) {
    const format = m.match_type // 'best_of_2', 'best_of_3', etc.
    const streams = getTwitchStreams(m.streams_list, m.league?.name, m.serie?.full_name || m.serie?.name)

    for (const game of m.games || []) {
      const matchId = game.external_identifier || null
      if (!matchId) continue

      // Cache PandaScore format keyed by OpenDota match ID so completed-match
      // feed can correct series_type when OpenDota reports the wrong format (e.g.
      // DreamLeague S29 group stage BO2 reported as series_type 1 = BO3).
      if (format) {
        streamWrites.push(kv.set(`format:match:${matchId}`, format, { ex: FORMAT_MATCH_TTL }))
      }

      // Record which OpenDota game ID belongs to which position in this PandaScore match.
      // Written when the game is running (the only time external_identifier is reliable);
      // persists across cron runs so G1/G2 IDs remain available while G3 is live.
      if (game.status === 'running') {
        streamWrites.push(kv.set(`live:game:${m.id}:${game.position}`, String(matchId), { ex: STREAM_TTL }))
      }

      if (streams.length !== 1 || !game.begin_at || game.status !== 'running') continue
      const channel = streams[0].url.replace('https://www.twitch.tv/', '')
      const ts = Math.floor(new Date(game.begin_at).getTime() / 1000)
      const roundedTs = Math.floor(ts / 300) * 300
      if (!tsBuckets[roundedTs]) tsBuckets[roundedTs] = new Set()
      tsBuckets[roundedTs].add(channel)
      // nx: true — write-once. First recorded channel is never overwritten.
      streamWrites.push(kv.set(`stream:match:${matchId}`, channel, { ex: STREAM_TTL, nx: true }))
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

async function sendPushNotificationsForMatches(matches) {
  if (!process.env.VAPID_PRIVATE_KEY) return
  const pushOps = []
  for (const match of matches) {
    const teams = [match.teamA, match.teamB].filter(Boolean)
    const userIds = new Set()
    for (const team of teams) {
      const key = `push:team:${team.toLowerCase()}`
      const ids = await kv.get(key).catch(() => null)
      if (Array.isArray(ids)) ids.forEach(id => userIds.add(id))
    }
    for (const userId of userIds) {
      const sentKey = `push:sent:${match.id}:${userId}`
      const alreadySent = await kv.get(sentKey).catch(() => null)
      if (alreadySent) continue
      const subRaw = await kv.get(`push:sub:${userId}`).catch(() => null)
      if (!subRaw) continue
      const sub = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw
      const teamNames = teams.join(' vs ')
      pushOps.push(
        webpush.sendNotification(sub, JSON.stringify({
          title: `${teamNames} is live`,
          body: `${match.tournament || 'Pro match'} - Watch on Spectate Esports`,
          url: '/',
        }))
          .then(() => kv.set(sentKey, '1', { ex: 24 * 3600 }))
          .catch(err => {
            if (err.statusCode === 410) {
              // Subscription expired - remove it
              kv.del(`push:sub:${userId}`, `push:teams:${userId}`).catch(() => {})
            }
          })
      )
    }
  }
  if (pushOps.length > 0) await Promise.all(pushOps)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  // Push subscription: store endpoint + team list in KV.
  if (req.method === 'POST' && req.query?.mode === 'push-subscribe') {
    try {
      const { subscription, teamNames, userId } = req.body || {}
      if (!subscription || !userId) return res.status(400).json({ error: 'Missing subscription or userId' })
      const teams = Array.isArray(teamNames) ? teamNames : []
      await Promise.all([
        kv.set(`push:sub:${userId}`, JSON.stringify(subscription), { ex: PUSH_SUB_TTL }),
        kv.set(`push:teams:${userId}`, JSON.stringify(teams), { ex: PUSH_SUB_TTL }),
        ...teams.map(async name => {
          const key = `push:team:${name.toLowerCase()}`
          const existing = await kv.get(key).catch(() => null)
          const ids = Array.isArray(existing) ? existing : []
          if (!ids.includes(userId)) {
            await kv.set(key, [...ids, userId], { ex: PUSH_SUB_TTL })
          }
        }),
      ])
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('push-subscribe error:', err?.message)
      return res.status(500).json({ error: 'Failed to store subscription' })
    }
  }

  // Cron mode: cache stream channels and send push notifications for live matches.
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
      const [data, tier1NamesCron] = await Promise.all([
        response.json(),
        kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
      ])
      const hardcoded = PERMANENT_TIER1_NAMES.map(n => n.toLowerCase())
      const namesCron = [...new Set([
        ...(Array.isArray(tier1NamesCron) ? tier1NamesCron.map(n => n.toLowerCase()) : []),
        ...hardcoded,
      ])]
      const tier1 = (data || []).filter(m => (isTier1(m) || isTier1ByName(m, namesCron)) && m.opponents?.length === 2)
      await enrichMultiStreamMatches(tier1, headers)
      const written = await cacheRunningStreams(tier1)
      const mappedForPush = tier1.map(mapMatch)
      await sendPushNotificationsForMatches(mappedForPush).catch(err => console.warn('push error:', err?.message))
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
    const [response, tier1Names] = await Promise.all([
      fetch(`${PANDASCORE_BASE}/matches/running?sort=begin_at&page[size]=20`, { headers }),
      kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
    ])
    if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)

    const names = [...new Set([
      ...(Array.isArray(tier1Names) ? tier1Names.map(n => n.toLowerCase()) : []),
      ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
    ])]
    const data = await response.json()
    const tier1Raw = (data || [])
      .filter(m => isTier1(m) || isTier1ByName(m, names))
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

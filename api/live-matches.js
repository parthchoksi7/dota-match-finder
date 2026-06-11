import webpush from 'web-push'
import { createHmac } from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'
import { getSupabaseAdmin } from './_supabase.js'

const KV_KEY = 'dota2:live_matches_v4'
const TTL = 60 * 2 // 2 minutes
const PUSH_SUB_TTL = 30 * 24 * 3600 // 30 days

if (process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@spectateesports.live',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

import { isTier1, isTier1ByName, getTwitchStreams, CHANNEL_LABELS, PANDASCORE_BASE, STREAM_TTL, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES, buildTournamentName, trackError, parseBracketRound, getSeriesLabel, setCorsHeaders, createLogger } from './_shared.js'



export function winsRequired(matchType, numberOfGames) {
  if (matchType === 'best_of_1') return 1
  if (matchType === 'best_of_2') return 2
  if (matchType === 'best_of_3') return 2
  if (matchType === 'best_of_5') return 3
  if (matchType === 'best_of' && numberOfGames) return Math.ceil(numberOfGames / 2)
  return Infinity
}

function getSeriesScore(m) {
  const opponents = m.opponents || []
  const results = m.results || []
  if (!results.length || opponents.length < 2) return null

  const teamAId = opponents[0]?.opponent?.id
  const teamBId = opponents[1]?.opponent?.id
  const scoreA = results.find(r => r.team_id === teamAId)?.score ?? 0
  const scoreB = results.find(r => r.team_id === teamBId)?.score ?? 0
  const max = winsRequired(m.match_type, m.number_of_games)
  return `${Math.min(scoreA, max)}-${Math.min(scoreB, max)}`
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
        length: g.length || null,
      }
    })
}

function getYoutubeStream(streamsList) {
  const s = (streamsList || []).find(s => s.language === 'en' && s.raw_url?.includes('youtube.com'))
  return s?.raw_url || null
}

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  return {
    id: m.id,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    bracketRound: parseBracketRound(m.name),
    seriesScore: getSeriesScore(m),
    currentGame: getCurrentGame(m),
    games: mapGames(m),
    streams: getTwitchStreams(m.streams_list),
    youtubeStream: getYoutubeStream(m.streams_list),
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
      const r = await fetch(`https://api.pandascore.co/matches/${m.id}`, { headers })
      if (!r.ok) {
        console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id} fetch failed`, status: r.status, ts: Date.now() }))
        return
      }
      const detail = await r.json()
      const en = (detail.streams_list || []).filter(s => s.official && s.language === 'en')
      console.log(JSON.stringify({ level: 'info', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id}`, streams: en.map(s => `${s.raw_url}(main=${s.main})`), ts: Date.now() }))
      if (detail.streams_list) m.streams_list = detail.streams_list
    } catch (err) {
      console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: `enrichMultiStream: match ${m.id} exception`, error: err?.message, ts: Date.now() }))
    }
  }))
}

/**
 * Writes stream:match and stream:ts KV entries for all running games.
 * Called by both the normal handler (client poll) and the cron mode.
 * nx=true on stream:match so the first recorded channel is never overwritten.
 */
const FORMAT_MATCH_TTL = 14 * 24 * 3600 // 14 days

async function cacheRunningStreams(rawMatches) {
  const streamWrites = []
  const tsBuckets = {} // roundedTs → Set<channel>
  const supabaseRows = []

  for (const m of rawMatches) {
    const format = m.match_type // 'best_of_2', 'best_of_3', etc.
    const streams = getTwitchStreams(m.streams_list)

    for (const game of m.games || []) {
      // Always record in the ts-bucket for running single-stream games, even when
      // external_identifier is null (personal/qualifier streams where PS hasn't linked
      // to OD yet). This ensures the ts fallback in match-streams.js can find the
      // channel after the game ends, even if stream:match was never written.
      if (streams.length === 1 && game.begin_at && game.status === 'running') {
        const tsChannel = streams[0].url.replace('https://www.twitch.tv/', '')
        const gameTs = Math.floor(new Date(game.begin_at).getTime() / 1000)
        const roundedTs = Math.floor(gameTs / 300) * 300
        if (!tsBuckets[roundedTs]) tsBuckets[roundedTs] = new Set()
        tsBuckets[roundedTs].add(tsChannel)
      }

      const matchId = game.external_identifier || null
      if (!matchId) continue

      // Cache PandaScore format and bracket round keyed by OpenDota match ID so the
      // completed-match feed can correct series_type and show grand final styling.
      if (format) {
        streamWrites.push(kv.set(`format:match:${matchId}`, format, { ex: FORMAT_MATCH_TTL }))
      }
      const bracketRound = parseBracketRound(m.name)
      if (bracketRound) {
        streamWrites.push(kv.set(`bracket:match:${matchId}`, bracketRound, { ex: FORMAT_MATCH_TTL }))
      }

      // Record which OpenDota game ID belongs to which position in this PandaScore match.
      // Written when the game is running (the only time external_identifier is reliable);
      // persists across cron runs so G1/G2 IDs remain available while G3 is live.
      if (game.status === 'running') {
        streamWrites.push(kv.set(`live:game:${m.id}:${game.position}`, String(matchId), { ex: STREAM_TTL }))
      }

      if (streams.length !== 1 || !game.begin_at || game.status !== 'running') continue
      const channel = streams[0].url.replace('https://www.twitch.tv/', '')
      // nx: true — write-once. First recorded channel is never overwritten.
      streamWrites.push(kv.set(`stream:match:${matchId}`, channel, { ex: STREAM_TTL, nx: true }))

      const allOfficialStreams = (m.streams_list || [])
        .filter(s => s.official && s.raw_url)
        .map(s => ({ raw_url: s.raw_url, language: s.language || null, official: true, main: s.main || false }))

      supabaseRows.push({
        od_match_id: Number(matchId),
        ps_match_id: m.id,
        channel,
        started_at: game.begin_at,
        team_a: m.opponents?.[0]?.opponent?.name || null,
        team_b: m.opponents?.[1]?.opponent?.name || null,
        tournament: buildTournamentName(m),
        match_type: m.match_type || null,
        game_position: game.position || null,
        bracket_round: parseBracketRound(m.name) || null,
        streams_json: allOfficialStreams.length > 0 ? allOfficialStreams : null,
      })
    }
  }

  // Write each ts bucket as a JSON array of all channels active in that window.
  // This replaces the old single-value write that caused last-write-wins collisions.
  for (const [roundedTs, channels] of Object.entries(tsBuckets)) {
    streamWrites.push(kv.set(`stream:ts:${roundedTs}`, [...channels], { ex: STREAM_TTL }))
  }

  if (streamWrites.length > 0) {
    await Promise.all(streamWrites).catch(err => console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'stream mapping write failed', error: err?.message, ts: Date.now() })))
  }

  // Permanent write-through to Supabase. ignoreDuplicates replicates nx:true — first channel wins.
  if (supabaseRows.length > 0) {
    getSupabaseAdmin()
      .from('match_stream_history')
      .upsert(supabaseRows, { onConflict: 'od_match_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'match_stream_history upsert failed', error: error.message, ts: Date.now() })) })
      .catch(err => console.error(JSON.stringify({ level: 'warn', endpoint: '/api/live-matches', msg: 'match_stream_history upsert failed', error: err?.message, ts: Date.now() })))
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
  const log = createLogger('/api/live-matches')
  if (setCorsHeaders(req, res, { allowAll: true })) return

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  // Push subscription: store endpoint + team list in KV.
  if (req.method === 'POST' && req.query?.mode === 'push-subscribe') {
    try {
      const { subscription, teamNames } = req.body || {}
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription endpoint' })
      if (!process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Push not configured' })
      const userId = createHmac('sha256', process.env.VAPID_PRIVATE_KEY)
        .update(subscription.endpoint)
        .digest('hex')
        .slice(0, 32)
      const teams = Array.isArray(teamNames) ? teamNames : []

      // Fetch previous team list to diff — required to clean up removed team indexes.
      // Without this, users receive notifications for teams they unfollowed (stale reverse index).
      // Handle both formats: old entries were JSON.stringify'd strings; new entries are direct arrays.
      const prevTeamsRaw = await kv.get(`push:teams:${userId}`).catch(() => null)
      let prevTeams = []
      if (Array.isArray(prevTeamsRaw)) {
        prevTeams = prevTeamsRaw
      } else if (typeof prevTeamsRaw === 'string') {
        try { prevTeams = JSON.parse(prevTeamsRaw) } catch { prevTeams = [] }
      }

      const removedTeams = prevTeams.filter(t => !teams.includes(t))
      const addedTeams = teams.filter(t => !prevTeams.includes(t))

      // Remove userId from indexes of unfollowed teams
      const removeOps = removedTeams.map(async name => {
        const key = `push:team:${name.toLowerCase()}`
        const existing = await kv.get(key).catch(() => null)
        const ids = Array.isArray(existing) ? existing.filter(id => id !== userId) : []
        if (ids.length > 0) {
          await kv.set(key, ids, { ex: PUSH_SUB_TTL })
        } else {
          await kv.del(key).catch(() => {})
        }
      })

      // Add userId to indexes of newly followed teams
      const addOps = addedTeams.map(async name => {
        const key = `push:team:${name.toLowerCase()}`
        const existing = await kv.get(key).catch(() => null)
        const ids = Array.isArray(existing) ? existing : []
        if (!ids.includes(userId)) {
          await kv.set(key, [...ids, userId], { ex: PUSH_SUB_TTL })
        }
      })

      await Promise.all([
        kv.set(`push:sub:${userId}`, JSON.stringify(subscription), { ex: PUSH_SUB_TTL }),
        kv.set(`push:teams:${userId}`, teams, { ex: PUSH_SUB_TTL }),  // store as direct array going forward
        ...removeOps,
        ...addOps,
      ])
      return res.status(200).json({ ok: true })
    } catch (err) {
      log.error('push-subscribe error', { error: err?.message })
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
      await sendPushNotificationsForMatches(mappedForPush).catch(err => log.warn('push error', { error: err?.message }))
      log.info('cron complete', { written })
      return res.status(200).json({ written })
    } catch (err) {
      await trackError('/api/live-matches', 500, err?.message)
      log.error('cron error', { error: err?.message })
      return res.status(500).json({ error: err?.message })
    }
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    log.info('cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      log.info('serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    log.warn('KV cache read failed', { error: err?.message })
  }

  try {
    log.info('fetching from PandaScore')
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

    // Enrich finished games with OD match IDs from KV (live:game:{psId}:{position}).
    // external_identifier is only populated while a game is running; once it finishes
    // we rely on the KV entry written by cacheRunningStreams() during that window.
    const finishedGames = [] // { matchIdx, gameIdx, psMatchId, position }
    matches.forEach((match, mi) => {
      match.games.forEach((game, gi) => {
        if (game.status === 'finished' && !game.matchId) {
          finishedGames.push({ matchIdx: mi, gameIdx: gi, psMatchId: match.id, position: game.position })
        }
      })
    })
    if (finishedGames.length > 0) {
      try {
        const kvKeys = finishedGames.map(({ psMatchId, position }) => `live:game:${psMatchId}:${position}`)
        const kvValues = await kv.mget(...kvKeys)
        finishedGames.forEach(({ matchIdx, gameIdx }, i) => {
          if (kvValues[i]) matches[matchIdx].games[gameIdx].matchId = String(kvValues[i])
        })
      } catch (err) {
        log.warn('live:game KV enrichment failed', { error: err?.message })
      }
    }

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      log.warn('KV cache write failed', { error: err?.message })
    }

    // Store game start timestamp → channel for single-stream matches.
    // Keyed by begin_at rounded to 5 min so OpenDota's start_time (close but not identical) can look it up.
    await cacheRunningStreams(tier1Raw)

    return res.status(200).json(payload)

  } catch (err) {
    await trackError('/api/live-matches', 500, err?.message)
    log.error('fetch failed', { error: err?.message })
    return res.status(500).json({ error: 'Failed to fetch live matches', message: err?.message })
  }
}

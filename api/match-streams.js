import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'
import { getSupabaseAdmin } from './_supabase.js'
import { PANDASCORE_BASE, STREAM_TTL, getTwitchStreams, normalizeAllStreams, buildTournamentName, parseBracketRound, teamPairMatch, trackError, setCorsHeaders, createLogger, validateId } from './_shared.js'

/**
 * Returns true if the PandaScore opponents fuzzy-match the two OpenDota team names.
 * Delegates to the shared teamPairMatch() so both substring direction (name truncation,
 * e.g. "BetBoom Team" vs "BetBoom") and separator normalization (e.g. OD "ggboom" vs
 * PS "GG Boom", "Virtus.pro" vs "Virtuspro") stay identical to findOdMatchByTime().
 */
function teamsMatch(psOpponents, radiantTeam, direTeam) {
  if (!psOpponents || psOpponents.length < 2) return false
  return teamPairMatch(psOpponents[0]?.opponent?.name, psOpponents[1]?.opponent?.name, radiantTeam, direTeam)
}

async function getOrFetchTwitchToken() {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const cached = await kv.get('twitch:token:v1')
    if (cached) return cached
  } catch {}
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    )
    if (!tokenRes.ok) return null
    const { access_token, expires_in } = await tokenRes.json()
    const payload = { token: access_token, clientId }
    const ttl = Math.max(3600, (expires_in || 5_184_000) - 3600)
    kv.set('twitch:token:v1', payload, { ex: ttl }).catch(() => {})
    return payload
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', endpoint: '/api/match-streams', msg: 'Twitch token fetch failed', error: err?.message, ts: Date.now() }))
    return null
  }
}

function parseTwitchDuration(duration) {
  if (duration == null || typeof duration !== 'string') return 0
  const match = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  if (!match) return 0
  const hours = parseInt(match[1] || 0, 10)
  const minutes = parseInt(match[2] || 0, 10)
  const seconds = parseInt(match[3] || 0, 10)
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * GET /api/match-streams?ids=123,456&ts=1234567890&radiantTeam=Tundra&direTeam=REKONIX
 *
 * Lookup flow per match ID:
 * 1. KV `stream:match:{id}` — fast path, written when external_identifier is available
 *    or when a prior PandaScore fuzzy match cached it.
 * 2. PandaScore fuzzy match — query by ±1h time window, match by team names.
 *    Caches result to KV for future lookups.
 * 3. ts fallback — if fuzzy match finds nothing, read `stream:ts:{bucket}` which now
 *    stores a JSON array of all channels that were live in that time window.
 *    Returned as `_candidates` so the frontend can narrow its Twitch VOD search.
 *
 * GET /api/match-streams?mode=twitch-vod&channel={channel}&ts={matchStartTime}
 * Fetches the Twitch VOD for a match server-side. OAuth token never reaches the browser.
 * Caches channel user-id (30d) and VOD result (24h hit / 30min miss) in KV.
 */
export default async function handler(req, res) {
  const log = createLogger('/api/match-streams')
  if (setCorsHeaders(req, res, { allowAll: true })) return

  if (req.query?.mode === 'twitch-vod') {
    const { channel, ts } = req.query
    if (!channel || !ts) return res.status(400).json({ error: 'channel and ts required' })
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(channel)) return res.status(400).json({ error: 'invalid channel' })
    const tsV = validateId(ts, { name: 'ts', numeric: true, maxLen: 12 })
    if (!tsV.ok) return res.status(400).json({ error: tsV.error })
    const matchStartTime = parseInt(ts, 10)
    if (isNaN(matchStartTime)) return res.status(400).json({ error: 'ts must be a number' })

    const vodCacheKey = `twitch:vod:v2:${channel}:${matchStartTime}`

    try {
      const cached = await kv.get(vodCacheKey)
      if (cached !== null) return res.status(200).json(cached)
    } catch {}

    const auth = await getOrFetchTwitchToken()
    if (!auth) return res.status(503).json({ error: 'Twitch credentials not configured' })

    const headers = {
      'Client-ID': auth.clientId,
      'Authorization': `Bearer ${auth.token}`,
    }

    try {
      // Resolve channel login → user_id (cached 30d)
      const uidCacheKey = `twitch:channel-uid:v1:${channel}`
      let userId
      try { userId = await kv.get(uidCacheKey) } catch {}

      if (!userId) {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers })
        if (!userRes.ok) return res.status(502).json({ error: 'Twitch users fetch failed' })
        const userData = await userRes.json()
        userId = userData.data?.[0]?.id
        if (!userId) {
          const miss = { url: null, channel, live: false }
          const missTtl = matchStartTime > Date.now() / 1000 - 86400 ? 300 : 1800
          kv.set(vodCacheKey, miss, { ex: missTtl }).catch(() => {})
          return res.status(200).json(miss)
        }
        kv.set(uidCacheKey, userId, { ex: 30 * 24 * 3600 }).catch(() => {})
      }

      const vodRes = await fetch(
        `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=30`,
        { headers }
      )
      if (!vodRes.ok) return res.status(502).json({ error: 'Twitch videos fetch failed' })
      const vodData = await vodRes.json()

      for (const vod of vodData.data || []) {
        const vodStart = new Date(vod.created_at).getTime() / 1000
        const vodEnd = vodStart + parseTwitchDuration(vod.duration)
        if (matchStartTime >= vodStart && matchStartTime <= vodEnd) {
          const offset = Math.floor(matchStartTime - vodStart + 600)
          const result = {
            url: `https://www.twitch.tv/videos/${vod.id}?t=${offset}s`,
            channel,
            startedAt: vod.created_at,
          }
          kv.set(vodCacheKey, result, { ex: 24 * 3600 }).catch(() => {})
          return res.status(200).json(result)
        }
      }

      // No archived VOD window contained matchStartTime. Twitch DOES expose the in-progress
      // broadcast via /videos (it appears as an archive whose duration grows in near-real-time),
      // so completed earlier moments of a live broadcast resolve in the loop above. A miss here
      // means the requested time sits at/near the live edge (duration lag of a few minutes) or
      // before the channel's oldest stored VOD. For recent matches, check /streams so the client
      // can offer a "Watch Live" link instead of a dead end.
      const isRecent = matchStartTime > Date.now() / 1000 - 86400
      let live = false
      if (isRecent) {
        try {
          const liveRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, { headers })
          if (liveRes.ok) {
            const liveData = await liveRes.json()
            live = (liveData.data?.length || 0) > 0
          }
        } catch (err) {
          log.warn('twitch live-status check failed', { channel, error: err?.message })
        }
      }
      const miss = { url: null, channel, live }
      // Use a shorter 5-min TTL for recent matches so a VOD that isn't indexed yet
      // (or a broadcast that just ended) auto-retries quickly instead of staying absent
      // for 30 minutes. The cached `live` flag is bounded by the same 5-min TTL.
      const missTtl = isRecent ? 300 : 1800
      kv.set(vodCacheKey, miss, { ex: missTtl }).catch(() => {})
      return res.status(200).json(miss)
    } catch (err) {
      log.error('twitch-vod fetch failed', { error: err?.message })
      await trackError('/api/match-streams', 502, err?.message)
      return res.status(502).json({ error: 'Twitch VOD fetch failed' })
    }
  }

  const { ids, ts, radiantTeam, direTeam } = req.query
  if (!ids) return res.status(400).json({ error: 'ids required' })
  if (ids.length > 500) return res.status(400).json({ error: 'ids param too long' })

  const result = {}

  const matchIds = ids.split(',').map(s => s.trim()).filter(s => /^\d{1,15}$/.test(s)).slice(0, 50)

  // Optional per-game start times (unix seconds), "id1:ts1,id2:ts2". Lets sibling rows
  // persist their OWN started_at instead of inheriting the primary game's `ts` — that
  // shared-ts write corrupted per-game VOD offsets (game 2/3 got game 1's offset).
  // Resolution logic (PS-fuzzy window, ts-bucket) still uses the primary `ts` unchanged;
  // this only affects the started_at VALUE written to match_stream_history.
  const startById = {}
  if (typeof req.query.starts === 'string') {
    for (const pair of req.query.starts.split(',')) {
      const [id, t] = pair.split(':')
      if (/^\d{1,15}$/.test(id) && /^\d{1,12}$/.test(t)) startById[id] = parseInt(t, 10)
    }
  }
  const startedAtIso = (id, fallbackSec) => new Date((startById[id] ?? fallbackSec) * 1000).toISOString()

  // Step 1: KV lookup by match ID
  try {
    if (matchIds.length > 0) {
      const keys = matchIds.map(id => `stream:match:${id}`)
      const values = await kv.mget(...keys)
      matchIds.forEach((id, i) => { if (values[i]) result[id] = values[i] })
    }
  } catch (err) {
    log.warn('KV read failed', { error: err?.message })
  }

  // Persist KV hits to Supabase so the permanent record exists even when the
  // fuzzy match (Step 2) is bypassed because the channel is already cached.
  // ignoreDuplicates makes this a no-op for rows that are already written.
  const kvHitIds = matchIds.filter(id => result[id])
  if (kvHitIds.length > 0 && ts && radiantTeam && direTeam) {
    const startTime = parseInt(ts, 10)
    if (!isNaN(startTime)) {
      const rows = kvHitIds.map(id => ({
        od_match_id: Number(id),
        channel: result[id],
        started_at: startedAtIso(id, startTime),
        team_a: radiantTeam || null,
        team_b: direTeam || null,
      }))
      try {
        getSupabaseAdmin()
          .from('match_stream_history')
          .upsert(rows, { onConflict: 'od_match_id', ignoreDuplicates: true })
          .then(({ error }) => { if (error) log.warn('supabase kv-path upsert failed', { error: error.message }) })
          .catch(err => log.warn('supabase kv-path upsert failed', { error: err?.message }))
      } catch (err) {
        log.warn('supabase kv-path upsert failed', { error: err?.message })
      }
    }
  }

  const missingIds = matchIds.filter(id => !result[id])

  // Step 2: PandaScore fuzzy match for missing IDs
  if (missingIds.length > 0 && ts && radiantTeam && direTeam && process.env.PANDASCORE_TOKEN) {
    try {
      const startTime = parseInt(ts, 10)
      if (!isNaN(startTime)) {
        // ±2h window: PandaScore range[begin_at] filters on the series-level begin_at
        // (game 1's scheduled time), but `startTime` here is the OD start_time of a
        // specific game. In long BO5s a late game's start can drift >1h past the series
        // begin_at, falling outside a ±1h window and silently missing the channel.
        // teamsMatch() still disambiguates within the window, and page[size]=50 keeps the
        // target in range on busy multi-region days.
        const startIso = new Date((startTime - 7200) * 1000).toISOString()
        const endIso = new Date((startTime + 7200) * 1000).toISOString()
        const psRes = await fetch(
          `${PANDASCORE_BASE}/matches?range[begin_at]=${startIso},${endIso}&sort=begin_at&page[size]=50`,
          { headers: { Authorization: `Bearer ${process.env.PANDASCORE_TOKEN}`, Accept: 'application/json' } }
        )
        if (psRes.ok) {
          const psMatches = await psRes.json()
          const psMatch = (psMatches || []).find(m => teamsMatch(m.opponents, radiantTeam, direTeam))
          if (psMatch) {
            // Log all streams PandaScore returned so we can debug VOD misses
            const streamsLog = (psMatch.streams_list || []).map(s => `${s.language}|official=${s.official}|main=${s.main}|${s.raw_url}`)
            log.info('PS streams found', { match: `${radiantTeam} vs ${direTeam}`, streams: streamsLog })

            const streams = getTwitchStreams(psMatch.streams_list)
            // All streams (every language/source, official AND unofficial) for permanent
            // storage — shared shape with live-matches.js so the persisted row is identical
            // regardless of which write-path lands first.
            const allStreams = normalizeAllStreams(psMatch.streams_list)
            // Single primary OFFICIAL twitch login from getTwitchStreams (VOD anchor —
            // unchanged resolution logic). Null when PandaScore has no official Twitch
            // stream (e.g. YouTube-only broadcasts) — the archival row below is written
            // regardless; only the KV fast-path + `result[id]` require a resolved channel.
            const channel = streams.length > 0 ? streams[0].url.replace('https://www.twitch.tv/', '') : null

            // Permanent record once PandaScore confirms the match exists — independent of
            // whether an official Twitch channel resolved. Mirrors the write condition in
            // cacheRunningStreams() (allStreams.length > 0) so a YouTube-only series still
            // gets archived instead of being silently dropped from match_stream_history.
            // Awaited (not fire-and-forget): when `channel` is null there is no further
            // await in this request, so an un-awaited upsert here would race the function's
            // return and, on Vercel, frequently lose — verified in production, the row never
            // persisted for a YouTube-only match despite the upsert call executing every time.
            if (allStreams.length > 0) {
              const rows = missingIds.map(id => ({
                od_match_id: Number(id),
                ps_match_id: psMatch.id,
                channel,
                started_at: startedAtIso(id, startTime),
                team_a: radiantTeam || null,
                team_b: direTeam || null,
                tournament: buildTournamentName(psMatch),
                match_type: psMatch.match_type || null,
                bracket_round: parseBracketRound(psMatch.name) || null,
                streams_json: allStreams,
              }))
              try {
                const { error } = await getSupabaseAdmin()
                  .from('match_stream_history')
                  .upsert(rows, { onConflict: 'od_match_id', ignoreDuplicates: true })
                if (error) log.warn('supabase upsert failed', { error: error.message })
              } catch (err) {
                log.warn('supabase upsert failed', { error: err?.message })
              }
            }

            if (channel) {
              for (const id of missingIds) {
                result[id] = channel
                await kv.set(`stream:match:${id}`, channel, { ex: STREAM_TTL }).catch(err => log.warn('KV write failed', { id, error: err?.message }))
              }
              log.info('fuzzy match resolved', { match: `${radiantTeam} vs ${direTeam}`, channel })
            }
          }
        }
      }
    } catch (err) {
      log.warn('PS fuzzy match failed', { error: err?.message })
    }
  }

  // Step 3: ts fallback — return candidate channels from the time bucket
  const stillMissing = matchIds.filter(id => !result[id])
  if (stillMissing.length > 0 && ts) {
    try {
      const rawTs = parseInt(ts, 10)
      if (!isNaN(rawTs)) {
        const rounded = Math.floor(rawTs / 300) * 300
        const tsKeys = [rounded - 300, rounded, rounded + 300].map(t => `stream:ts:${t}`)
        const tsValues = await kv.mget(...tsKeys)
        const hit = tsValues.find(v => v != null)
        if (hit) {
          // New format: JSON array of channels. Legacy format: plain string.
          const candidates = Array.isArray(hit) ? hit : [hit]
          result._candidates = candidates

          // When exactly one channel was live in the window, the match is unambiguous.
          // Persist to KV and Supabase so future lookups hit the fast path and the
          // match has a permanent DB record. nx:true prevents overwriting a real entry
          // from the cron or PS fuzzy match.
          if (candidates.length === 1) {
            const channel = candidates[0]
            for (const id of stillMissing) {
              kv.set(`stream:match:${id}`, channel, { ex: STREAM_TTL, nx: true })
                .catch(err => log.warn('KV ts-candidate write failed', { id, error: err?.message }))
            }
            const rows = stillMissing.map(id => ({
              od_match_id: Number(id),
              channel,
              started_at: startedAtIso(id, rawTs),
              team_a: radiantTeam || null,
              team_b: direTeam || null,
            }))
            try {
              getSupabaseAdmin()
                .from('match_stream_history')
                .upsert(rows, { onConflict: 'od_match_id', ignoreDuplicates: true })
                .then(({ error }) => { if (error) log.warn('supabase ts-candidate upsert failed', { error: error.message }) })
                .catch(err => log.warn('supabase ts-candidate upsert failed', { error: err?.message }))
            } catch (err) {
              log.warn('supabase ts-candidate upsert failed', { error: err?.message })
            }
          }
        }
      }
    } catch (err) {
      log.warn('ts fallback failed', { error: err?.message })
    }
  }

  return res.status(200).json(result)
}

import { matchesTier1Names, winsRequiredForSeries } from './utils'

const OPENDOTA_BASE = 'https://api.opendota.com/api'

// OpenDota sometimes uses abbreviations that differ from the team's full name.
// Map abbrev → canonical name so team display, fuzzy stream matching, and follow
// logic all see the same string.
const TEAM_NAME_MAP = {
  'BB': 'BetBoom Team',
}

/**
 * Returns true if the series already has a winner (one team has enough wins).
 * Tracks wins by team name so a team that wins as both radiant and dire is
 * correctly counted (e.g. a 2-0 sweep where sides alternate).
 */
export function seriesHasWinner(games) {
  if (!games || games.length === 0) return false
  const seriesType = games[0]?.series_type
  const winsNeeded = winsRequiredForSeries(seriesType)
  const teamWins = {}
  for (const m of games) {
    const winner = m.radiant_win
      ? (m.radiant_name || 'radiant')
      : (m.dire_name || 'dire')
    teamWins[winner] = (teamWins[winner] || 0) + 1
  }
  const maxWins = Math.max(0, ...Object.values(teamWins))
  return maxWins >= winsNeeded
}

// Module-level caches; persist for the browser session so successive
// "load more" calls skip network round-trips.
let _tier1LeagueNames = null
let _premiumLeagueIds = null

async function fetchTier1LeagueNames() {
  if (_tier1LeagueNames !== null) return _tier1LeagueNames
  try {
    const res = await fetch('/api/tournaments?mode=tier1-leagues')
    if (res.ok) {
      const data = await res.json()
      _tier1LeagueNames = (data.names || []).map(n => n.toLowerCase())
    }
  } catch {}
  return _tier1LeagueNames || []
}

async function fetchPremiumLeagueIds() {
  if (_premiumLeagueIds) return _premiumLeagueIds
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${OPENDOTA_BASE}/leagues`, { signal: controller.signal })
    if (res.ok) {
      const leagues = await res.json()
      _premiumLeagueIds = new Set(
        (Array.isArray(leagues) ? leagues : [])
          .filter(l => l.tier === 'premium')
          .map(l => l.leagueid)
      )
    }
  } catch {} finally {
    clearTimeout(timeoutId)
  }
  return _premiumLeagueIds || new Set()
}


export async function fetchProMatches(lastMatchId = null) {
  const url = lastMatchId
    ? `${OPENDOTA_BASE}/promatches?less_than_match_id=${lastMatchId}`
    : `${OPENDOTA_BASE}/promatches`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)

  let res
  const [tier1Names, premiumIds] = await Promise.all([
    fetchTier1LeagueNames(),
    fetchPremiumLeagueIds(),
    (async () => {
      try {
        res = await fetch(url, { signal: controller.signal })
      } finally {
        clearTimeout(timeoutId)
      }
    })(),
  ])

  if (!res.ok) throw new Error(`OpenDota promatches error: ${res.status}`)
  const data = await res.json()

  if (!Array.isArray(data) || data.length === 0) {
    return { matches: [], nextMatchId: lastMatchId }
  }

  const allMatches = data.filter(m => {
    if (premiumIds.has(m.leagueid)) return true                      // rule 1: OpenDota premium
    return matchesTier1Names(m.league_name, tier1Names) === true     // rules 2+3: PandaScore tier s/a OR permanent list
  })
  const cursor = data[data.length - 1].match_id

  // Drop the last series only if it is genuinely incomplete (could be cut off by pagination).
  // Never drop series_id=0 (standalone BO1s) and never drop a series that already has a winner.
  const last = allMatches[allMatches.length - 1]
  const lastSeriesId = last?.series_id
  let filtered = allMatches
  if (lastSeriesId != null && lastSeriesId !== 0) {
    const lastSeriesGames = allMatches.filter(m => m.series_id === lastSeriesId)
    // Note: BO2 draw (1-1) is intentionally not checked here — this guard only asks
    // "could more games still be played?", not "has the series ended?".
    if (!seriesHasWinner(lastSeriesGames)) {
      filtered = allMatches.filter(m => m.series_id !== lastSeriesId)
    }
  }

  const matches = filtered.map((m) => ({
    id: String(m.match_id),
    tournament: m.league_name,
    date: new Date(m.start_time * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }),
    radiantTeam: TEAM_NAME_MAP[m.radiant_name] || m.radiant_name || 'Radiant',
    direTeam: TEAM_NAME_MAP[m.dire_name] || m.dire_name || 'Dire',
    radiantScore: m.radiant_score,
    direScore: m.dire_score,
    radiantWin: m.radiant_win,
    duration: new Date((m.duration || 0) * 1000).toISOString().slice(11, 16),
    startTime: m.start_time,
    seriesId: m.series_id,
    seriesType: m.series_type,
    twitchVodId: null,
    twitchOffset: null,
  }))

  // Normalize null series_id: OpenDota occasionally omits series_id on the final game
  // of a BO3 (e.g. game 3 returned with series_id: null). This breaks seriesMatchMap in
  // App.jsx (which keys by seriesId) so the G3 tab never appears in the drawer.
  // Fix: find the matching numbered series by teams + tournament + ±12h, then copy its
  // seriesId and seriesType onto the orphan game.
  const TWELVE_HOURS_S = 12 * 3600
  const seriesRepresentatives = {}
  for (const m of matches) {
    if (m.seriesId != null && m.seriesId !== 0 && !seriesRepresentatives[m.seriesId]) {
      seriesRepresentatives[m.seriesId] = m
    }
  }
  for (const m of matches) {
    if (m.seriesId != null && m.seriesId !== 0) continue
    const teams = [m.radiantTeam, m.direTeam].sort().join('|')
    for (const [sid, rep] of Object.entries(seriesRepresentatives)) {
      if (rep.tournament !== m.tournament) continue
      if ([rep.radiantTeam, rep.direTeam].sort().join('|') !== teams) continue
      if (Math.abs(m.startTime - rep.startTime) > TWELVE_HOURS_S) continue
      m.seriesId = Number(sid)
      if (m.seriesType == null) m.seriesType = rep.seriesType
      break
    }
  }

  // Enrich seriesType using PandaScore format cached in Redis by the live-matches cron.
  // Fixes cases where OpenDota reports the wrong series_type (e.g. BO2 group stage as BO3).
  try {
    const ids = matches.map(m => m.id).join(',')
    const fmtRes = await fetch(`/api/tournaments?mode=match-formats&ids=${ids}`)
    if (fmtRes.ok) {
      const { formats } = await fmtRes.json()
      const FORMAT_TO_SERIES_TYPE = { 'best_of_1': 0, 'best_of_2': 3, 'best_of_3': 1, 'best_of_5': 2 }
      for (const match of matches) {
        const fmt = formats?.[match.id]
        if (fmt && FORMAT_TO_SERIES_TYPE[fmt] !== undefined) {
          match.seriesType = FORMAT_TO_SERIES_TYPE[fmt]
        }
      }
    }
  } catch {}

  return { matches, nextMatchId: cursor }
}

/**
 * Fetches recently completed Grand Final match IDs from the backend.
 * Returns an array of OpenDota match ID strings (via PandaScore external_identifier).
 * Falls back to [] on any error so callers degrade gracefully.
 */
export async function fetchGrandFinalMatchIds() {
  try {
    const res = await fetch('/api/tournaments?mode=grand-finals')
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.matchIds) ? data.matchIds : []
  } catch {
    return []
  }
}

async function getTwitchToken() {
  const res = await fetch(
    'https://id.twitch.tv/oauth2/token?client_id=' + import.meta.env.VITE_TWITCH_CLIENT_ID + '&client_secret=' + import.meta.env.VITE_TWITCH_CLIENT_SECRET + '&grant_type=client_credentials',
    { method: 'POST' }
  )
  const data = await res.json()
  return data.access_token
}

// Human-readable label for VOD channel (for "Watch on Twitch (ESL Ember)" etc.).
// Keep in sync with CHANNEL_LABELS in api/_shared.js (same entries, different runtime).
export const VOD_CHANNEL_LABELS = {
  esl_dota2: 'ESL',
  esl_dota2ember: 'ESL Ember',
  esl_dota2storm: 'ESL Storm',
  esl_dota2earth: 'ESL Earth',
  dota2ti: 'TI',
  beyond_the_summit: 'BTS',
  pgl_dota2: 'PGL',
  pgl_dota2en2: 'PGL EN2',
  blast_dota2: 'BLAST',
  weplaydota: 'WePlay',
}

async function findVodOnChannel(channelName, matchStartTime, headers) {
  const userRes = await fetch('https://api.twitch.tv/helix/users?login=' + channelName, { headers })
  const userData = await userRes.json()
  const userId = userData.data?.[0]?.id
  if (!userId) return null
  const vodRes = await fetch('https://api.twitch.tv/helix/videos?user_id=' + userId + '&type=archive&first=30', { headers })
  const vodData = await vodRes.json()
  for (const vod of vodData.data || []) {
    const vodStart = new Date(vod.created_at).getTime() / 1000
    const durationSeconds = parseTwitchDuration(vod.duration)
    const vodEnd = vodStart + durationSeconds
    if (matchStartTime >= vodStart && matchStartTime <= vodEnd) {
      const offset = Math.floor(matchStartTime - vodStart + 600)
      return {
        vodId: vod.id,
        offset,
        url: 'https://www.twitch.tv/videos/' + vod.id + '?t=' + offset + 's',
        channel: channelName
      }
    }
  }
  return null
}

/**
 * Look up which Twitch channel(s) streamed the given match IDs.
 * Returns a map of matchId → channel name for matches we have a definitive record for.
 */
export async function fetchMatchStreams(matchIds, startTime = null, radiantTeam = null, direTeam = null) {
  if (!matchIds || matchIds.length === 0) return {}
  try {
    const params = new URLSearchParams()
    params.set('ids', matchIds.join(','))
    if (startTime) params.set('ts', String(startTime))
    if (radiantTeam) params.set('radiantTeam', radiantTeam)
    if (direTeam) params.set('direTeam', direTeam)
    const res = await fetch(`/api/match-streams?${params}`)
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * Find the Twitch VOD for a match.
 *
 * PandaScore is the authoritative source for which channel streamed a match.
 * - preferredChannel: exact channel resolved from PandaScore via /api/match-streams.
 *   Searched exclusively — no fallback to other channels if the VOD isn't there yet.
 */
export async function findTwitchVod(matchStartTime, _tournamentName, preferredChannel = null) {
  const token = await getTwitchToken()
  const headers = {
    'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID,
    'Authorization': 'Bearer ' + token
  }

  // PandaScore told us the exact channel — trust it. Don't fall back to other channels
  // to avoid returning a wrong VOD (e.g. an ESL stream airing at the same time).
  if (preferredChannel) {
    const vod = await findVodOnChannel(preferredChannel, matchStartTime, headers)
    if (vod) return { url: vod.url, channel: vod.channel, allVods: [vod] }
  }

  return { url: null, channel: null, allVods: [] }
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
export async function fetchMatchSummary(matchId) {
  const matchRes = await fetch(OPENDOTA_BASE + '/matches/' + matchId)
  const matchData = await matchRes.json()

  // Replace persona names with pro names
  if (matchData.players) {
    matchData.players = matchData.players.map(p => ({
      ...p,
      personaname: p.name || p.personaname
    }))
  }

  const summaryRes = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchData })
  })

  const data = await summaryRes.json()

  if (!summaryRes.ok) {
    const msg = data.message || data.error || summaryRes.statusText
    throw new Error(msg || 'Failed to generate summary')
  }

  if (typeof data.summary !== 'string') {
    throw new Error('Invalid response from summary service')
  }

  return data.summary
}

const _indicatorsCache = new Map()
const _statsCache = new Map()

/**
 * Fetch game indicators for one or more match IDs.
 * Returns a map of matchId → { hasRapier, hasGoldSwing, hasMegaComeback }.
 * Results are cached in-memory for the browser session (the backend also caches in Redis).
 */
export async function fetchMatchIndicators(matchIds) {
  if (!matchIds || matchIds.length === 0) return {}
  const uncached = matchIds.filter(id => !_indicatorsCache.has(id))
  if (uncached.length > 0) {
    try {
      const res = await fetch(`/api/tournaments?mode=match-indicators&ids=${uncached.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        for (const [id, indicators] of Object.entries(data)) {
          _indicatorsCache.set(id, indicators)
        }
      }
    } catch {}
  }
  const result = {}
  for (const id of matchIds) {
    if (_indicatorsCache.has(id)) result[id] = _indicatorsCache.get(id)
  }
  return result
}

/**
 * Fetch end-game stats for a single match: player networth, items, and gold advantage array.
 * Results cached in-memory for the browser session (backend also caches in Redis for 7 days).
 * Returns { radiantGoldAdv, players, itemNames } or null on failure.
 */
export async function fetchMatchStats(matchId) {
  if (!matchId) return null
  const key = String(matchId)
  if (_statsCache.has(key)) return _statsCache.get(key)
  try {
    const res = await fetch(`/api/tournaments?mode=match-stats&id=${key}`)
    if (!res.ok) return null
    const data = await res.json()
    _statsCache.set(key, data)
    return data
  } catch {
    return null
  }
}

let heroCache = null

export async function fetchHeroes() {
  if (heroCache) return heroCache
  const res = await fetch('https://api.opendota.com/api/heroes')
  const data = await res.json()
  heroCache = {}
  for (const h of data) {
    heroCache[h.id] = {
      name: h.localized_name,
      key: h.name.replace('npc_dota_hero_', '')
    }
  }
  return heroCache
}
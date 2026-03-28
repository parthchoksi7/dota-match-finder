const OPENDOTA_BASE = 'https://api.opendota.com/api'
const TIER1_KEYWORDS = [
  'dreamleague',
  'esl one',
  'esl challenger',
  'pgl wallachia',
  'pgl',
  'beyond the summit',
  'weplay',
  'starladder',
  'the international',
  'blast slam',
  'blast',
  'fissure',
  'ewc',
  'esports world cup',
  'riyadh masters',
]

function isTier1League(leagueName) {
  if (!leagueName) return false
  const lower = leagueName.toLowerCase()
  return TIER1_KEYWORDS.some(k => lower.includes(k))
}
export async function fetchProMatches(lastMatchId = null) {
  const TARGET_TIER1 = 20 // fetch until we have at least 20 tier 1 matches per call
  const MAX_PAGES = 8

  let allTier1 = []
  let cursor = lastMatchId
  let pages = 0

  while (allTier1.length < TARGET_TIER1 && pages < MAX_PAGES) {
    const url = cursor
      ? `${OPENDOTA_BASE}/promatches?less_than_match_id=${cursor}`
      : `${OPENDOTA_BASE}/promatches`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    let res
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    if (!res.ok) throw new Error(`OpenDota promatches error: ${res.status}`)
    const data = await res.json()

    if (!Array.isArray(data) || data.length === 0) break

    const tier1 = data.filter(m => isTier1League(m.league_name))
    allTier1 = allTier1.concat(tier1)
    cursor = data[data.length - 1].match_id
    pages++
  }

  // Drop the last series only if it is genuinely incomplete (could be cut off by pagination).
  // Never drop series_id=0 (standalone BO1s) and never drop a series that already has a winner.
  const last = allTier1[allTier1.length - 1]
  const lastSeriesId = last?.series_id
  let filtered = allTier1
  if (lastSeriesId != null && lastSeriesId !== 0) {
    const lastSeriesGames = allTier1.filter(m => m.series_id === lastSeriesId)
    const seriesType = lastSeriesGames[0]?.series_type
    const winsNeeded = seriesType === 2 ? 3 : seriesType === 0 ? 1 : 2
    const teamWins = {}
    for (const m of lastSeriesGames) {
      const winner = m.radiant_win ? 'radiant' : 'dire'
      teamWins[winner] = (teamWins[winner] || 0) + 1
    }
    const maxWins = Math.max(0, ...Object.values(teamWins))
    if (maxWins < winsNeeded) {
      filtered = allTier1.filter(m => m.series_id !== lastSeriesId)
    }
  }

  const matches = filtered.map((m) => ({
    id: String(m.match_id),
    tournament: m.league_name,
    date: new Date(m.start_time * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }),
    radiantTeam: m.radiant_name || 'Radiant',
    direTeam: m.dire_name || 'Dire',
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

/** ESL main + sub-channels (Ember/Storm/Earth for concurrent DreamLeague matches). Language re-broadcasts (e.g. esl_dota2_es) omitted. */
const VOD_CHANNELS = [
  'esl_dota2',
  'esl_dota2ember',
  'esl_dota2storm',
  'esl_dota2earth',
  'dota2ti',
  'beyond_the_summit',
  'pgl_dota2',
  'pgl_dota2en2',
]

/** Human-readable label for VOD channel (for "Watch on Twitch (ESL Ember)" etc.). */
export const VOD_CHANNEL_LABELS = {
  esl_dota2: 'ESL',
  esl_dota2ember: 'ESL Ember',
  esl_dota2storm: 'ESL Storm',
  esl_dota2earth: 'ESL Earth',
  dota2ti: 'TI',
  beyond_the_summit: 'BTS',
  pgl_dota2: 'PGL',
  pgl_dota2en2: 'PGL EN2',
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

const CHANNEL_GROUPS = {
  pgl:  ['pgl_dota2', 'pgl_dota2en2'],
  esl:  ['esl_dota2', 'esl_dota2ember', 'esl_dota2storm', 'esl_dota2earth'],
  bts:  ['beyond_the_summit'],
  ti:   ['dota2ti'],
}

function getChannelGroup(tournamentName) {
  if (!tournamentName) return null
  const lower = tournamentName.toLowerCase()
  if (lower.includes('pgl')) return CHANNEL_GROUPS.pgl
  if (lower.includes('esl') || lower.includes('dreamleague')) return CHANNEL_GROUPS.esl
  if (lower.includes('beyond the summit') || lower.includes('bts')) return CHANNEL_GROUPS.bts
  if (lower.includes('the international')) return CHANNEL_GROUPS.ti
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
 * Find the Twitch VOD for a match by searching all known channels in parallel.
 * If preferredChannel is provided (from our stream mapping), only that channel
 * is searched — giving a single, definitive result with no ambiguity.
 * Falls back to the full group-based search if the preferred channel has no VOD.
 */
export async function findTwitchVod(matchStartTime, tournamentName, preferredChannel = null, candidateChannels = null) {
  const token = await getTwitchToken()
  const headers = {
    'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID,
    'Authorization': 'Bearer ' + token
  }

  // If we know exactly which channel had this match, search only that one.
  if (preferredChannel) {
    const vod = await findVodOnChannel(preferredChannel, matchStartTime, headers)
    if (vod) return { url: vod.url, channel: vod.channel, allVods: [vod] }
    // VOD not found on preferred channel (may not be published yet) — fall through
  }

  // Narrow to ts-derived candidate channels if available, otherwise search all known channels.
  const channelsToSearch = candidateChannels
    ? VOD_CHANNELS.filter(ch => candidateChannels.includes(ch))
    : VOD_CHANNELS

  const results = await Promise.allSettled(
    channelsToSearch.map((ch) => findVodOnChannel(ch, matchStartTime, headers))
  )
  const hits = results
    .filter(r => r.status === 'fulfilled' && r.value != null)
    .map(r => r.value)

  if (hits.length === 0) return { url: null, channel: null, allVods: [] }

  const group = getChannelGroup(tournamentName)
  const filtered = group ? hits.filter(h => group.includes(h.channel)) : hits
  const finalHits = filtered.length > 0 ? filtered : hits

  // Primary channel is first in the group definition
  finalHits.sort((a, b) => {
    const ai = group ? group.indexOf(a.channel) : -1
    const bi = group ? group.indexOf(b.channel) : -1
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  return { url: finalHits[0].url, channel: finalHits[0].channel, allVods: finalHits }
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
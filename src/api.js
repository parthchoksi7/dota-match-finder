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

    const res = await fetch(url)
    const data = await res.json()

    if (!Array.isArray(data) || data.length === 0) break

    const tier1 = data.filter(m => isTier1League(m.league_name))
    allTier1 = allTier1.concat(tier1)
    cursor = data[data.length - 1].match_id
    pages++
  }

  // Drop incomplete last series
  const last = allTier1[allTier1.length - 1]
  const lastSeriesId = last?.series_id
  const filtered = lastSeriesId != null
    ? allTier1.filter(m => m.series_id !== lastSeriesId)
    : allTier1

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
  'pgldota2'
]

/** Human-readable label for VOD channel (for "Watch on Twitch (ESL Ember)" etc.). */
export const VOD_CHANNEL_LABELS = {
  esl_dota2: 'ESL',
  esl_dota2ember: 'ESL Ember',
  esl_dota2storm: 'ESL Storm',
  esl_dota2earth: 'ESL Earth',
  dota2ti: 'TI',
  beyond_the_summit: 'BTS',
  pgldota2: 'PGL'
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
 * Find the Twitch VOD for a match by searching all known channels in parallel.
 * Returns the first hit so the user is sent to the channel that actually broadcast the match
 * (e.g. ESL main vs ESL Ember/Storm/Earth for concurrent DreamLeague games).
 */
export async function findTwitchVod(matchStartTime) {
  const token = await getTwitchToken()
  const headers = {
    'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID,
    'Authorization': 'Bearer ' + token
  }
  const results = await Promise.allSettled(
    VOD_CHANNELS.map((ch) => findVodOnChannel(ch, matchStartTime, headers))
  )
  const hits = results
    .filter(r => r.status === 'fulfilled' && r.value != null)
    .map(r => r.value)

  if (hits.length === 0) return { url: null, channel: null, allVods: [] }
  return { url: hits[0].url, channel: hits[0].channel, allVods: hits }
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
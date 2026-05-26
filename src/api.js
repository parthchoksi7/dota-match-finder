import { matchesTier1Names, winsRequiredForSeries, trackEvent, STORAGE_KEYS } from './utils'

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

/**
 * Mutates raw OpenDota match objects in-place: assigns series_id/series_type to
 * games that OpenDota returned with series_id=null (e.g. G3 of a BO3). Matches
 * by same league + same team pair + start time within 12 hours of a numbered game
 * in the same batch. Must run before the pagination boundary guard so the guard
 * can count all games in a series when deciding whether to drop it.
 */
export function normalizeRawNullSeriesIds(matches) {
  const TWELVE_HOURS_S = 12 * 3600
  const reps = {}
  for (const m of matches) {
    if (m.series_id != null && m.series_id !== 0 && !reps[m.series_id]) reps[m.series_id] = m
  }
  for (const m of matches) {
    if (m.series_id != null && m.series_id !== 0) continue
    const teams = [m.radiant_name, m.dire_name].sort().join('|')
    for (const [sid, rep] of Object.entries(reps)) {
      if (rep.league_name !== m.league_name) continue
      if ([rep.radiant_name, rep.dire_name].sort().join('|') !== teams) continue
      if (Math.abs(m.start_time - rep.start_time) > TWELVE_HOURS_S) continue
      m.series_id = Number(sid)
      if (m.series_type == null) m.series_type = rep.series_type
      break
    }
  }
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
  try {
    const res = await fetch('/api/tournaments?mode=premium-league-ids')
    if (res.ok) {
      const data = await res.json()
      _premiumLeagueIds = new Set(Array.isArray(data.ids) ? data.ids : [])
    }
  } catch {}
  return _premiumLeagueIds || new Set()
}


export async function fetchProMatches(lastMatchId = null) {
  const proxyUrl = lastMatchId
    ? `/api/tournaments?mode=promatches-proxy&less_than=${lastMatchId}`
    : `/api/tournaments?mode=promatches-proxy`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)

  let res
  const [tier1Names, premiumIds] = await Promise.all([
    fetchTier1LeagueNames(),
    fetchPremiumLeagueIds(),
    (async () => {
      try {
        res = await fetch(proxyUrl, { signal: controller.signal })
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

  // Pre-normalize null series_id on raw matches so groupIntoSeries can count
  // all games (including a G3 returned by OpenDota without a series_id).
  normalizeRawNullSeriesIds(allMatches)

  // No per-page boundary guard here. HomeFeed's groupIntoSeries already drops the
  // oldest incomplete series from the accumulated allMatches state, and it operates
  // on the full combined dataset rather than a single page. A per-page guard here
  // caused a data-loss bug: when a BO3 was split so that the older game fell on the
  // next page (e.g. game 1 on page N+1, games 2+3 on page N), the guard permanently
  // dropped games 2+3 from the page N output. Page N+1 then only contributed game 1,
  // leaving the series permanently incomplete and invisible. Without this guard,
  // all games reach allMatches and the HomeFeed guard + auto-load together ensure the
  // full series appears once enough pages are loaded.

  const matches = allMatches.map((m) => ({
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

  // Enrich seriesType and bracketRound from PandaScore KV data (written by live-matches cron).
  // Single round-trip via match-enrichment (replaces separate match-formats + match-brackets calls).
  try {
    const ids = matches.map(m => m.id).join(',')
    const enrichRes = await fetch(`/api/tournaments?mode=match-enrichment&ids=${ids}`)
    const FORMAT_TO_SERIES_TYPE = { 'best_of_1': 0, 'best_of_2': 3, 'best_of_3': 1, 'best_of_5': 2 }
    if (enrichRes.ok) {
      const { formats, brackets } = await enrichRes.json()
      for (const match of matches) {
        const fmt = formats?.[match.id]
        if (fmt && FORMAT_TO_SERIES_TYPE[fmt] !== undefined) match.seriesType = FORMAT_TO_SERIES_TYPE[fmt]
        const br = brackets?.[match.id]
        if (br && !/\bvs\.?\b/i.test(br)) match.bracketRound = br
      }
    }
  } catch {}

  return { matches, nextMatchId: cursor }
}

let _twitchAuth = null
async function getTwitchToken() {
  if (_twitchAuth) return _twitchAuth
  try {
    const res = await fetch('/api/match-streams?mode=twitch-token')
    if (!res.ok) return null
    _twitchAuth = await res.json()
    return _twitchAuth
  } catch {
    return null
  }
}

// Pre-warm the Twitch token so the first drawer open has no waterfall.
getTwitchToken().catch(() => {})

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
  const auth = await getTwitchToken()
  if (!auth?.token || !auth?.clientId) return { url: null, channel: null, allVods: [] }
  const headers = {
    'Client-ID': auth.clientId,
    'Authorization': 'Bearer ' + auth.token
  }

  // PandaScore told us the exact channel — trust it. Don't fall back to other channels
  // to avoid returning a wrong VOD (e.g. an ESL stream airing at the same time).
  if (preferredChannel) {
    const vod = await findVodOnChannel(preferredChannel, matchStartTime, headers)
    if (vod) return { url: vod.url, channel: vod.channel, allVods: [vod] }
    trackEvent('vod_not_found', { had_channel: true, channel: preferredChannel })
    return { url: null, channel: null, allVods: [] }
  }

  trackEvent('vod_not_found', { had_channel: false, channel: null })
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

const _tournamentPlayersCache = new Map()

export async function fetchTournamentPlayers(tournamentId, serieName, isCompleted = false, beginAt = null) {
  const key = String(tournamentId)
  if (_tournamentPlayersCache.has(key)) return _tournamentPlayersCache.get(key)
  try {
    const name = encodeURIComponent(serieName || '')
    const completed = isCompleted ? '&completed=1' : ''
    const begin = beginAt ? `&begin_at=${encodeURIComponent(beginAt)}` : ''
    const res = await fetch(`/api/tournaments?mode=tournament-players&id=${key}&name=${name}${completed}${begin}`)
    if (!res.ok) return null
    const data = await res.json()
    _tournamentPlayersCache.set(key, data)
    return data
  } catch {
    return null
  }
}

let heroCache = null

export async function fetchHeroes() {
  if (heroCache) return heroCache
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.HEROES)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < 24 * 3600 * 1000) {
        heroCache = data
        return heroCache
      }
    }
  } catch {}
  const res = await fetch('https://api.opendota.com/api/heroes')
  const data = await res.json()
  heroCache = {}
  for (const h of data) {
    heroCache[h.id] = {
      name: h.localized_name,
      key: h.name.replace('npc_dota_hero_', '')
    }
  }
  try {
    localStorage.setItem(STORAGE_KEYS.HEROES, JSON.stringify({ ts: Date.now(), data: heroCache }))
  } catch {}
  return heroCache
}
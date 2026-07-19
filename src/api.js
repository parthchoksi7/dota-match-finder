import { matchesTier1Names, winsRequiredForSeries, trackEvent, STORAGE_KEYS } from './utils'
import { TIER1_TEAMS_FALLBACK } from './data/tier1TeamsFallback.js'

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

/**
 * Look up which Twitch channel(s) streamed the given match IDs.
 * Returns a map of matchId → channel name for matches we have a definitive record for.
 */
export async function fetchMatchStreams(matchIds, startTime = null, radiantTeam = null, direTeam = null, startTimes = null) {
  if (!matchIds || matchIds.length === 0) return {}
  try {
    const params = new URLSearchParams()
    params.set('ids', matchIds.join(','))
    if (startTime) params.set('ts', String(startTime))
    if (radiantTeam) params.set('radiantTeam', radiantTeam)
    if (direTeam) params.set('direTeam', direTeam)
    // Per-game start times so each sibling row persists its OWN started_at (correct
    // per-game VOD offsets). Resolution still keys off the primary `ts`.
    if (startTimes) {
      const pairs = Object.entries(startTimes)
        .filter(([, t]) => t != null)
        .map(([id, t]) => `${id}:${Math.floor(Number(t))}`)
      if (pairs.length > 0) params.set('starts', pairs.join(','))
    }
    const res = await fetch(`/api/match-streams?${params}`)
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * Find the Twitch VOD for a match.
 * Delegates Helix API calls to the server so the OAuth token never reaches the browser.
 */
export async function findTwitchVod(matchStartTime, _tournamentName, preferredChannel = null) {
  if (!preferredChannel) {
    trackEvent('vod_not_found', { had_channel: false, channel: null })
    return { url: null, channel: null, allVods: [] }
  }
  try {
    const params = new URLSearchParams({ mode: 'twitch-vod', channel: preferredChannel, ts: String(matchStartTime) })
    const res = await fetch(`/api/match-streams?${params}`)
    if (!res.ok) return { url: null, channel: null, allVods: [] }
    const data = await res.json()
    if (data.url) return { url: data.url, channel: data.channel, allVods: [data] }
    trackEvent('vod_not_found', { had_channel: true, channel: preferredChannel })
    return { url: null, channel: null, allVods: [] }
  } catch {
    return { url: null, channel: null, allVods: [] }
  }
}

const STORED_REPLAY_TIMEOUT_MS = 2500

/**
 * Supabase-first replay lookup. Reads the persisted replay data for a single game
 * from match_stream_history + match_stream_vods (via /api/pipeline?type=replay) —
 * no KV, no Helix. Returns the full stored shape whenever a row exists:
 *   { hasRow: true, main, others }
 * where main/others entries carry { url, channel, language, source, official,
 * deep_link, kind }. The caller (resolveMatchStreams) decides how to use it: a
 * timestamped start-point main is a complete hit; anything else still runs the
 * LOCKED live resolver for the primary slot, keeping the multi-language others.
 * Returns null on 404/error/timeout so the caller falls back entirely — the abort
 * timer guarantees a slow Supabase degrades to the KV backup fast.
 */
export async function fetchStoredReplay(odMatchId) {
  if (odMatchId == null) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STORED_REPLAY_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/pipeline?type=replay&id=${encodeURIComponent(odMatchId)}`, { signal: controller.signal })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return {
      hasRow: true,
      main: data.main?.url ? data.main : null,
      others: Array.isArray(data.others) ? data.others.filter(o => o?.url) : [],
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchMatchSummary(matchId) {
  // Server fetches OpenDota itself (api/summarize.js) — not from the browser. OpenDota's Cloudflare
  // bot protection can 403 direct browser requests and drop the CORS header on that response, which
  // the browser reports as a CORS failure rather than the underlying 403 (the same failure class
  // that broke fetchHeroes() sitewide, fixed via ?mode=heroes-proxy).
  const summaryRes = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId })
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
const _statsInFlight = new Map()

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
 *
 * Dedups concurrent calls for the SAME matchId into one request — the live-series companion
 * mounts SeriesGameDraftStrip and SeriesGameScore together for every finished game, and on a
 * cold cache both would otherwise fire independent requests for identical data.
 */
export async function fetchMatchStats(matchId) {
  if (!matchId) return null
  const key = String(matchId)
  if (_statsCache.has(key)) return _statsCache.get(key)
  if (_statsInFlight.has(key)) return _statsInFlight.get(key)
  const promise = (async () => {
    try {
      const res = await fetch(`/api/tournaments?mode=match-stats&id=${key}`)
      if (!res.ok) return null
      const data = await res.json()
      _statsCache.set(key, data)
      return data
    } catch {
      return null
    } finally {
      _statsInFlight.delete(key)
    }
  })()
  _statsInFlight.set(key, promise)
  return promise
}

// Resolve OpenDota match_ids for the finished games of a live/just-ended PandaScore series via
// the resolver (?mode=live-series-games). Returns { [position]: matchId } for games it resolved.
// Not cached: a live series resolves more games as they finish, and it's only called on
// companion-open, so freshness beats shaving a sub-second call.
export async function fetchLiveSeriesGameIds(psMatchId) {
  if (!psMatchId) return {}
  try {
    const res = await fetch(`/api/tournaments?mode=live-series-games&id=${encodeURIComponent(psMatchId)}`)
    if (!res.ok) return {}
    const data = await res.json()
    const byPosition = {}
    for (const g of data.games || []) {
      if (g && g.position != null && g.matchId) byPosition[g.position] = String(g.matchId)
    }
    return byPosition
  } catch {
    return {}
  }
}

// Live pulse (gold lead, kill score, live draft) for the CURRENTLY RUNNING game of a series, via
// the resolver (?mode=live-game-pulse). Returns null when nothing resolves (not yet captured,
// PS unavailable, or the game hasn't started). Not cached — intended to be polled while the
// companion is open on a running game.
// isOwner requests the Live Story gold-graph history alongside the pulse (owner-only during the
// pre-launch window — see api/_handlers/liveGamePulse.js). Defaults to false so existing callers
// are unaffected and simply never receive `history`.
export async function fetchLiveGamePulse(psMatchId, isOwner = false) {
  if (!psMatchId) return null
  try {
    const ownerParam = isOwner ? '&owner=1' : ''
    const res = await fetch(`/api/tournaments?mode=live-game-pulse&id=${encodeURIComponent(psMatchId)}${ownerParam}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.pulse || null
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

const _highlightsCache = new Map()

export async function fetchHighlights(tournamentName) {
  if (!tournamentName) return []
  if (_highlightsCache.has(tournamentName)) return _highlightsCache.get(tournamentName)
  try {
    const res = await fetch(`/api/tournaments?mode=highlights&name=${encodeURIComponent(tournamentName)}`)
    if (!res.ok) { _highlightsCache.set(tournamentName, []); return [] }
    const data = await res.json()
    const videos = data.videos || []
    _highlightsCache.set(tournamentName, videos)
    return videos
  } catch {
    _highlightsCache.set(tournamentName, [])
    return []
  }
}

// Generate match tokens for a team name: full name + a stripped version without
// common prefixes ("Team ") and suffixes (" Esports", " Gaming", " Team").
// BLAST, ESL, and PGL often abbreviate names in titles (e.g. "SPIRIT" for "Team Spirit").
function teamTokens(name) {
  if (!name) return []
  const n = name.toLowerCase().trim()
  const stripped = n
    .replace(/^team\s+/, '')
    .replace(/\s+esports?$/, '')
    .replace(/\s+gaming$/, '')
    .replace(/\s+team$/, '')
    .trim()
  return stripped && stripped !== n ? [n, stripped] : [n]
}

export function matchHighlightsToSeries(videos, radiantTeam, direTeam, seriesStartTime) {
  const norm = s => s?.toLowerCase() ?? ''
  const raTokens = teamTokens(radiantTeam)
  const diTokens = teamTokens(direTeam)
  const startMs = seriesStartTime ? seriesStartTime * 1000 : 0
  return videos
    .filter(v => {
      const t = norm(v.title)
      // Require "vs"/"vs." — all match highlights use a "Team A vs[.] Team B" format.
      // Filters out celebration posts, Shorts, and general tournament content.
      // Optional trailing period tolerates channels (e.g. @EWC_Extra) that write "vs.".
      if (!/\bvs\.?\s/.test(t)) return false
      const matchesRa = raTokens.length > 0 && raTokens.some(tok => t.includes(tok))
      const matchesDi = diTokens.length > 0 && diTokens.some(tok => t.includes(tok))
      return matchesRa || matchesDi
    })
    .filter(v => startMs === 0 || new Date(v.publishedAt).getTime() >= startMs)
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))[0] ?? null
}

let heroCache = null
let heroFetchPromise = null

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
  // Dedup concurrent cold-cache callers (multiple components mount and call fetchHeroes() in
  // the same tick) into a single network request rather than one fetch per caller.
  if (heroFetchPromise) return heroFetchPromise
  heroFetchPromise = (async () => {
    // Routed through our own backend, not OpenDota directly: OpenDota's Cloudflare bot
    // protection can 403 direct browser requests and drop the CORS header on that response,
    // which browsers then report as a CORS failure rather than the underlying 403.
    const res = await fetch('/api/tournaments?mode=heroes-proxy')
    const data = await res.json()
    const map = {}
    for (const h of data) {
      map[h.id] = {
        name: h.localized_name,
        key: h.name.replace('npc_dota_hero_', '')
      }
    }
    heroCache = map
    try {
      localStorage.setItem(STORAGE_KEYS.HEROES, JSON.stringify({ ts: Date.now(), data: heroCache }))
    } catch {}
    return heroCache
  })()
  try {
    return await heroFetchPromise
  } finally {
    heroFetchPromise = null
  }
}

let tier1TeamsCache = null
let tier1TeamsFetchPromise = null
const TIER1_TEAMS_CACHE_MS = 3600 * 1000 // 1h — matches ?mode=teams' CDN s-maxage

// Live tier-1 team list (name/slug/acronym/aliases) for Follow Teams search
// (ManageTeamsModal.jsx) and the Calendar team picker (Calendar.jsx). Backed by
// GET /api/tournaments?mode=teams, which is populated by the sync-teams cron from
// PandaScore tournament rosters — new tier-1 teams appear here without a code change.
// Falls back to the static TIER1_TEAMS_FALLBACK on any fetch/parse error (never throws),
// and does NOT cache that fallback in-memory so the next call retries the network.
export async function fetchTier1Teams() {
  if (tier1TeamsCache) return tier1TeamsCache
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.TIER1_TEAMS)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < TIER1_TEAMS_CACHE_MS && Array.isArray(data) && data.length > 0) {
        tier1TeamsCache = data
        return tier1TeamsCache
      }
    }
  } catch {}

  if (tier1TeamsFetchPromise) return tier1TeamsFetchPromise
  tier1TeamsFetchPromise = (async () => {
    try {
      const res = await fetch('/api/tournaments?mode=teams')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data?.teams) || data.teams.length === 0) throw new Error('empty teams list')
      tier1TeamsCache = data.teams
      try {
        localStorage.setItem(STORAGE_KEYS.TIER1_TEAMS, JSON.stringify({ ts: Date.now(), data: tier1TeamsCache }))
      } catch {}
      return tier1TeamsCache
    } catch {
      return TIER1_TEAMS_FALLBACK
    }
  })()
  try {
    return await tier1TeamsFetchPromise
  } finally {
    tier1TeamsFetchPromise = null
  }
}

// Resolve a search query string to a hero entry { id, name, key } or null.
// Uses the cached hero list — always fast after the first fetchHeroes() call.
export async function resolveHeroByName(query) {
  if (!query || query.length < 2) return null
  const heroes = await fetchHeroes()
  const q = query.toLowerCase()
  const entry = Object.entries(heroes).find(([, h]) =>
    h.name.toLowerCase().includes(q)
  )
  if (!entry) return null
  return { id: Number(entry[0]), name: entry[1].name, key: entry[1].key }
}

// Fetch tier-1 pro matches where the given hero was picked.
// cursor: Unix timestamp — returns picks older than this value (for pagination).
export async function fetchHeroMatches(heroId, cursor = null) {
  const params = new URLSearchParams({ mode: 'hero-matches', hero_id: String(heroId) })
  if (cursor) params.set('cursor', String(cursor))
  const res = await fetch(`/api/tournaments?${params}`)
  if (!res.ok) throw new Error(`Hero matches fetch failed: ${res.status}`)
  return res.json()
}
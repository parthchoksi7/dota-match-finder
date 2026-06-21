/**
 * Shared utilities for API serverless functions.
 * This file is prefixed with _ so Vercel does NOT deploy it as a serverless function.
 * It does NOT count toward the 12-function limit.
 */

import { Redis } from '@upstash/redis'

// ── Canonical data shapes ─────────────────────────────────────────────────────

/**
 * @typedef {Object} PSMatch
 * @property {number} id
 * @property {string} status - 'running' | 'finished' | 'not_started'
 * @property {string|null} begin_at - ISO timestamp
 * @property {string|null} end_at   - ISO timestamp
 * @property {number} number_of_games
 * @property {{ opponent: { id: number, name: string } }[]} opponents
 * @property {{ id: number, name: string }|null} league
 * @property {{ id: number, name: string, full_name: string|null }|null} serie
 * @property {{ id: number, name: string }|null} tournament
 * @property {{ raw_url: string, official: boolean, main: boolean, language: string }[]} streams_list
 */

/**
 * @typedef {Object} ODMatch
 * @property {number} match_id
 * @property {number} start_time - Unix timestamp
 * @property {boolean} radiant_win
 * @property {string|null} radiant_name
 * @property {string|null} dire_name
 * @property {number|null} radiant_team_id
 * @property {number|null} dire_team_id
 * @property {number} league_id
 * @property {number} series_id
 * @property {number} series_type - 0=BO1, 1=BO3, 2=BO5, 3=BO2
 */

/**
 * @typedef {Object} SeriesGame
 * @property {number} matchId
 * @property {boolean} radiantWin
 * @property {number|null} radiantScore
 * @property {number|null} direScore
 * @property {number|null} duration  - seconds
 * @property {number} startTime      - Unix timestamp
 * @property {string|null} radiant_name
 * @property {string|null} dire_name
 */

/**
 * @typedef {Object} SeriesGroup
 * @property {string} id              - unique series identifier
 * @property {string} team1
 * @property {string} team2
 * @property {number|null} team1Id
 * @property {number|null} team2Id
 * @property {number} seriesType
 * @property {SeriesGame[]} games
 * @property {string|null} leagueName
 * @property {string|null} serieName
 * @property {string|null} tournamentName
 * @property {number|null} beginAt    - Unix timestamp of first game
 * @property {boolean} isComplete
 */

/**
 * @typedef {Object} StreamResult
 * @property {string} url            - Twitch channel URL
 * @property {string|null} language
 * @property {boolean} official
 */

/**
 * @typedef {Object} GameIndicators
 * @property {boolean} radiantHasRapier
 * @property {boolean} direHasRapier
 * @property {boolean} hasRapier
 * @property {'radiant'|'dire'|null} goldSwingWinner
 * @property {boolean} hasGoldSwing
 * @property {'radiant'|'dire'|null} megaComebackWinner
 * @property {boolean} hasMegaComeback
 * @property {boolean} radiantHasRampage
 * @property {boolean} direHasRampage
 * @property {boolean} hasRampage
 */

/**
 * Known top-tier league name keywords. Single source of truth for the league-name override.
 *
 * PandaScore inconsistently assigns lower tiers to qualifier stages of major events
 * (e.g. DreamLeague Season 29 closed qualifiers receive a lower API tier even though
 * the main event is tier 's'). Any tournament or match whose league.name contains one
 * of these keywords is treated as tier 1 regardless of the API tier value, so qualifiers
 * for known major events are never silently excluded.
 */
export const TIER1_LEAGUE_KEYWORDS = ['dreamleague', 'pgl', 'esl one', 'blast', 'weplay', 'the international']

/**
 * Core tier-1 decision used by both match and tournament adapters below.
 * Accepts the raw tier string and league name from whichever object type the caller holds.
 *
 * @param {string|null} tier       - PandaScore tier field ('s', 'a', 'b', ...)
 * @param {string|null} leagueName - league.name (e.g. "DreamLeague", "PGL Wallachia")
 */
export function isTier1ByFields(tier, leagueName) {
  const t = (tier || '').toLowerCase()
  if (t === 's' || t === 'a') return true
  return TIER1_LEAGUE_KEYWORDS.some(k => (leagueName || '').toLowerCase().includes(k))
}

/**
 * Returns true if the given PandaScore MATCH object is tier 1.
 * Match objects from /dota2/matches/* carry tier on match.tournament.tier.
 * (match.league.tier and match.serie.tier are always null.)
 * NOTE: tournament objects from /dota2/tournaments/* carry tier on t.tier directly.
 * Use isTier1ByFields(t?.tier, t?.league?.name) as a one-liner adapter for those
 * (tournaments.js does this via its local isTier1 wrapper).
 *   tier 's' - elite international LANs (TI, Majors, DreamLeague, ESL One, ...)
 *   tier 'a' - second-tier professional events (ESL Challenger, regional circuits, ...)
 *   lower tier + known league name - qualifier stages of major events (league-name override)
 */
export const isTier1 = (match) =>
  isTier1ByFields(match?.tournament?.tier || match?.league?.tier, match?.league?.name)

/**
 * Fallback tier check using league names cached in KV by ?mode=tier1-leagues.
 * PandaScore sometimes creates new series (e.g. DreamLeague S29) before assigning
 * a tier to the tournament object — isTier1() returns false even for top-tier events.
 * This check uses the league name against the already-cached tier S/A name list.
 * Call only when isTier1(m) is false and match.tournament.tier is null/empty.
 * @param {object} match - PandaScore match object
 * @param {string[]} tier1Names - array of lowercase league names from KV cache
 */
export const isTier1ByName = (match, tier1Names) => {
  if (!tier1Names || tier1Names.length === 0) return false
  const leagueName = (match?.league?.name || '').toLowerCase()
  if (!leagueName) return false
  return tier1Names.some(n => n.length >= 3 && leagueName.includes(n))
}

/**
 * Extracts a display-ready bracket round label from a PandaScore match name.
 * PandaScore encodes round context in m.name as "Upper Bracket Final: TEAM vs TEAM".
 * This strips the team part (after the first colon) and applies title case.
 * Returns null when no name is present or the label is empty.
 * @param {string|null} name - raw PandaScore match name (e.g. "Grand final: TBD vs TBD")
 * @returns {string|null} e.g. "Grand Final", "Lower Bracket Semifinal"
 */
export function parseBracketRound(name) {
  if (!name) return null
  const label = name.split(':')[0].trim()
  if (!label) return null
  // If the label is just a team matchup (contains "vs"), it's not a bracket round
  if (/\bvs\.?\b/i.test(label)) return null
  return label.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ')
}

/** KV key for the tier1 league names cache (written by api/tournaments.js ?mode=tier1-leagues) */
export const KV_TIER1_NAMES_KEY = 'dota2:tier1_league_names_v1'

/**
 * Builds a Set of OpenDota league IDs whose tier is "premium"
 * (Valve-sponsored events: TI, Majors — the OpenDota equivalent of PandaScore tier S).
 * The broader "professional" tier is intentionally excluded because OpenDota classifies
 * many lower-tier online leagues as professional, which bleeds non-tier-1 events into
 * the homepage feed. Regional qualifiers for known major events are caught by rule 2+3
 * (tier1Names name-matching) instead.
 * Pure function; accepts the raw array returned by GET /api/leagues.
 */
export function buildPremiumLeagueIds(leagues) {
  return new Set(
    (leagues || []).filter(l => l.tier === 'premium').map(l => l.leagueid)
  )
}

// Module-level cache so successive calls within the same Lambda warm-up
// (or browser session for client-side consumers) skip the network round-trip.
// TTL prevents a long-lived warm instance from serving a stale set after a new
// premium league is added to OpenDota (e.g. a new Major or TI).
let _premiumLeagueIds = null
let _premiumLeagueIdsAt = 0
const _PREMIUM_LEAGUES_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

/**
 * Fetches the OpenDota league list and returns a Set of premium-tier league IDs.
 * Result is cached in memory for up to 4 hours per process/session.
 */
export async function getPremiumLeagueIds() {
  if (_premiumLeagueIds && Date.now() - _premiumLeagueIdsAt < _PREMIUM_LEAGUES_TTL_MS) {
    return _premiumLeagueIds
  }
  const res = await fetch('https://api.opendota.com/api/leagues')
  if (!res.ok) throw new Error(`OpenDota leagues error: ${res.status}`)
  const leagues = await res.json()
  _premiumLeagueIds = buildPremiumLeagueIds(leagues)
  _premiumLeagueIdsAt = Date.now()
  return _premiumLeagueIds
}

/**
 * Fires two parallel PandaScore requests (one for tier=s, one for tier=a) and
 * returns a merged, deduplicated array. PandaScore does not accept comma-separated
 * values in filter[tier] -- "s,a" is treated as a literal string, returning nothing.
 * Throws if BOTH requests fail so callers that cache results don't poison the cache.
 * @param {string} url - base URL already containing a '?' query string
 * @param {object} headers - Authorization + Accept headers for PandaScore
 */
export async function fetchByTiers(url, headers) {
  const [sRes, aRes] = await Promise.all([
    fetch(`${url}&filter[tier]=s`, { headers }),
    fetch(`${url}&filter[tier]=a`, { headers }),
  ])
  if (!sRes.ok && !aRes.ok) {
    throw new Error(`PandaScore tier fetch failed: ${sRes.status} / ${aRes.status}`)
  }
  const [sData, aData] = await Promise.all([
    sRes.ok ? sRes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
    aRes.ok ? aRes.json().then(d => Array.isArray(d) ? d : []) : Promise.resolve([]),
  ])
  const seen = new Set()
  return [...sData, ...aData].filter(t => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
}

export const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

export const STREAM_TTL = 60 * 60 * 24 * 14 // 14 days

export function getSeriesLabel(matchType, numberOfGames) {
  if (matchType === 'best_of_1') return 'BO1'
  if (matchType === 'best_of_2') return 'BO2'
  if (matchType === 'best_of_3') return 'BO3'
  if (matchType === 'best_of_5') return 'BO5'
  if (matchType === 'best_of' && numberOfGames) return `BO${numberOfGames}`
  return null
}

export const CHANNEL_LABELS = {
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

/**
 * Maps a PandaScore streams_list to Twitch stream objects.
 * Returns an array of { label, url } for display and channel-detection purposes.
 * Returns [] if PandaScore has no official Twitch stream for this match.
 */
export function getTwitchStreams(streamsList) {
  const allTwitchOfficial = (streamsList || []).filter(s => s.official && s.raw_url?.includes('twitch.tv'))
  // Prefer English; fall back to any language for regional events (CIS/Chinese qualifiers).
  const enOfficial = allTwitchOfficial.filter(s => s.language === 'en')
  const official = enOfficial.length > 0 ? enOfficial : allTwitchOfficial
  if (official.length === 0) return []

  // When multiple concurrent matches share sub-channels, PandaScore marks exactly one
  // stream main:true per match on the individual endpoint. Narrow to it.
  // If no stream is marked main (bulk endpoint omits the flag), pick the first one.
  const mainStreams = official.filter(s => s.main)
  const toUse = mainStreams.length > 0 ? mainStreams : official.slice(0, 1)
  return toUse.map(s => {
    const channel = s.raw_url.replace('https://www.twitch.tv/', '')
    return { label: CHANNEL_LABELS[channel] || channel, url: s.raw_url }
  })
}

// Normalize every stream PandaScore returns (all languages, official AND unofficial,
// all sources) for persistence in match_stream_history.streams_json. Drives the internal
// VOD-URL browser and the future multi-language stream picker. `source` classifies the
// platform; `channel` is the twitch login when applicable (used later for per-channel
// VOD deep-link enrichment). Shared by both Supabase write-paths (live-matches.js
// cacheRunningStreams and match-streams.js fuzzy resolver) so the persisted shape is
// identical regardless of which path writes the row first.
export function normalizeAllStreams(streamsList) {
  return (streamsList || [])
    .filter(s => s.raw_url)
    .map(s => {
      const url = s.raw_url
      let source = 'other'
      let channel = null
      if (url.includes('twitch.tv')) {
        source = 'twitch'
        channel = url.replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/\/$/, '') || null
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        source = 'youtube'
      }
      return {
        raw_url: url,
        language: s.language || null,
        official: !!s.official,
        main: !!s.main,
        source,
        channel,
      }
    })
}

// Server-side tier-1 team list for entity tagging in news ingestion.
// Kept separate from the frontend TIER1_TEAMS in src/pages/Calendar.jsx
// because they run in different runtimes (Node.js vs browser).
export const TIER1_TEAMS_SERVER = [
  'Team Liquid', 'Tundra Esports', 'Team Spirit', 'BetBoom Team',
  'Team Falcons', 'Gaimin Gladiators', 'Aurora Gaming', 'OG',
  'Natus Vincere', 'Virtus.pro', 'Team Secret', 'Team Aster',
  'Talon Esports', 'Nouns Esports', 'Team Yandex', 'PSG.LGD',
  'Nigma Galaxy', 'Evil Geniuses', 'beastcoast', 'Thunder Awaken',
]

// RSS sources for the news aggregation feature (api/news.js).
// Add new sources here; set disabled: true to temporarily pause a source
// without redeploying. categoryFilter receives the RSS categories array
// and must return true for the article to be included.
export const NEWS_SOURCES = [
  {
    id: 'steam-dota2',
    name: 'Dota 2 Official',
    feedUrl: 'https://steamcommunity.com/games/dota2/rss/',
    games: ['dota2'],
    reliability: 5,
    baseUrl: 'https://www.dota2.com',
    categoryFilter: null,
  },
  {
    id: 'pcgamesn',
    name: 'PCGamesN',
    feedUrl: 'https://www.pcgamesn.com/dota-2/feed',
    games: ['dota2'],
    reliability: 4,
    baseUrl: 'https://www.pcgamesn.com',
    categoryFilter: null,
  },
  {
    id: 'dotesports',
    name: 'Dot Esports',
    feedUrl: 'https://dotesports.com/feed',
    games: ['dota2'],
    reliability: 4,
    baseUrl: 'https://dotesports.com',
    // General feed covers all esports; filter by URL path since category tags are unreliable
    categoryFilter: (categories, url) =>
      categories.some(c => c.toLowerCase().includes('dota')) ||
      (url || '').toLowerCase().includes('/dota'),
  },
  {
    id: 'gosugamers',
    name: 'Gosugamers',
    feedUrl: 'https://www.gosugamers.net/dota2/news/rss',
    games: ['dota2'],
    reliability: 5,
    baseUrl: 'https://www.gosugamers.net',
    categoryFilter: null,
  },
  {
    id: 'esportsgg',
    name: 'Esports.gg',
    feedUrl: 'https://esports.gg/news/dota2/feed/',
    games: ['dota2'],
    reliability: 4,
    baseUrl: 'https://esports.gg',
    categoryFilter: null,
  },
]

/**
 * Builds a display name for a PandaScore match/series object.
 * Combines league + serie names, normalises "Season N" to "SN", strips trailing years.
 */
export function buildTournamentName(m) {
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

// Match a PS game (by begin_at Unix seconds + opponents array) against a list of OD promatches.
// Uses the same bidirectional substring logic as teamsMatch() in match-streams.js.
// Timestamp is the primary key (±15 min window); team names break ties when multiple candidates.
// Window is 900s (not 300s) — PS begin_at is the scheduled series time; OD start_time is the
// actual in-engine start after drafting, which empirically diverges by 7–10 minutes.
// Returns the best OD match object, or null if nothing is within the time window.
export function findOdMatchByTime(odMatches, beginAtUnix, psOpponents) {
  const candidates = odMatches.filter(m => Math.abs(m.start_time - beginAtUnix) < 900)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const names = (psOpponents || []).map(o => (o.opponent?.name || '').toLowerCase())
  if (names.length >= 2) {
    const sub = (x, y) => x.includes(y) || y.includes(x)
    const exact = candidates.find(c => {
      const r = (c.radiant_name || c.radiant_team?.name || '').toLowerCase()
      const d = (c.dire_name || c.dire_team?.name || '').toLowerCase()
      if (!r || !d) return false  // skip OD matches with missing team names — empty string matches everything
      return (sub(names[0], r) || sub(names[0], d)) && (sub(names[1], r) || sub(names[1], d))
    })
    if (exact) return exact
  }
  // Prefer candidates where both team names are known; fall back to all candidates
  // only when every candidate has at least one null team name (very rare).
  const named = candidates.filter(m =>
    (m.radiant_name || m.radiant_team?.name) && (m.dire_name || m.dire_team?.name)
  )
  const pool = named.length > 0 ? named : candidates
  return pool.reduce((best, m) =>
    Math.abs(m.start_time - beginAtUnix) < Math.abs(best.start_time - beginAtUnix) ? m : best
  )
}

// Permanent tier1 league organizers -- always included regardless of PandaScore
// tier assignment state. Covers the case where PandaScore creates a new series
// before assigning a tier to its tournament object (e.g. DreamLeague S29 SEA qualifier
// showing tournament.tier = "c" while still being a DreamLeague broadcast event).
// Exported so live-matches.js can merge this into its names array as a cold-KV fallback.
export const PERMANENT_TIER1_NAMES = [
  'DreamLeague',
  'ESL One',
  'PGL',
  'PGL Wallachia',
  'BLAST',
  'The International',
  'Beyond The Summit',
  'WePlay',
  'Riyadh Masters',
  '1win Essence',
]

// ── OpenDota league fuzzy-matching ───────────────────────────────────────────

// Multi-char Roman numerals only — single-char (i, v, x) are already filtered
// by the token length check and must stay as-is so "BLAST SLAM I" (no season number)
// never contradicts an Arabic season search.
const _ROMAN_MAP = { xx:20, xix:19, xviii:18, xvii:17, xvi:16, xv:15, xiv:14, xiii:13, xii:12, xi:11, ix:9, viii:8, vii:7, vi:6, iv:4, iii:3, ii:2 }
const _ROMAN_RE = new RegExp('\\b(' + Object.keys(_ROMAN_MAP).join('|') + ')\\b', 'gi')
const _romanToArabic = s => s.replace(_ROMAN_RE, m => String(_ROMAN_MAP[m.toLowerCase()]))

/**
 * Find the OpenDota league whose name best matches a PandaScore tournament name.
 * Uses token-overlap so "PGL Wallachia Season 7" matches "PGL Wallachia 2026 Season 7".
 * On tie, prefers non-qualifier over qualifier (e.g. main event over qualifier stage).
 *
 * Multi-char Roman numerals in league names (e.g. "BLAST SLAM VII") are normalized to
 * Arabic before tokenizing so "VI" (6) correctly contradicts a search for season 7.
 * Single-char Roman numerals (I, V, X) are left as-is — the length filter removes them,
 * keeping "BLAST SLAM I" as a number-free name that never contradicts any season search.
 */
export function findLeague(leagues, search) {
  if (!search || !leagues?.length) return null
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
  const tokens = s => _romanToArabic(s).toLowerCase().split(/[\s\-_]+/).filter(t => (t.length > 1 || /^\d+$/.test(t)) && !STOP.has(t))
  const searchTokens = new Set(tokens(search))

  const candidates = []
  for (const league of leagues) {
    // Deduplicate league tokens before scoring so repeated tokens (e.g. "1 VS 1" has
    // three "1"s) don't inflate the overlap count over the correct match.
    const lt = [...new Set(tokens(league.name || ''))]
    const overlap = lt.filter(t => searchTokens.has(t)).length
    if (overlap < 2) continue
    candidates.push({ league, overlap, tokenCount: lt.length })
  }

  if (candidates.length === 0) return null

  // Sort by overlap descending; on ties use precision (overlap/tokenCount) to prefer
  // tight matches (e.g. "1win Essence I" 2/2=100% beats "CARL DOTA TOURNAMENT S1 2026" 2/5=40%);
  // on further ties prefer non-qualifier over qualifier.
  candidates.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    const precA = a.overlap / a.tokenCount
    const precB = b.overlap / b.tokenCount
    if (Math.abs(precB - precA) > 0.001) return precB - precA
    const aQ = (a.league.name || '').toLowerCase().includes('qualifier')
    const bQ = (b.league.name || '').toLowerCase().includes('qualifier')
    if (aQ && !bQ) return 1
    if (!aQ && bQ) return -1
    return 0
  })

  // Return the first candidate whose own numeric tokens don't contradict the search.
  // "Contradict" = league has a number not in the search's numeric set (e.g. says
  // "Season 6" when search wants "Season 7"). Leagues with no Arabic numeric tokens
  // (e.g. "BLAST SLAM I" where single-char "I" is filtered) never contradict and
  // always pass — handles cross-source season numbering differences (OD: "BLAST SLAM I",
  // PS: "BLAST Slam Season 7 2026").
  const numericSearchSet = new Set([...searchTokens].filter(t => /^\d+$/.test(t)))
  for (const { league } of candidates) {
    if (numericSearchSet.size > 0) {
      const leagueNumerics = [...new Set(tokens(league.name || '').filter(t => /^\d+$/.test(t)))]
      if (leagueNumerics.some(t => !numericSearchSet.has(t))) continue
    }
    return league
  }

  return null
}

// ── Structured logging ───────────────────────────────────────────────────────

/**
 * Returns a logger bound to an endpoint + requestId. Each log method writes a
 * single-line JSON object to stdout so Vercel's log viewer can filter by field.
 * @param {string} endpoint - e.g. '/api/match-streams'
 * @param {string} [requestId] - short correlation ID, defaults to a fresh UUID slice
 */
export function createLogger(endpoint, requestId) {
  const rid = requestId || (typeof crypto !== 'undefined' ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10))
  const write = (level, msg, extras = {}) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level, endpoint, requestId: rid, msg, ts: Date.now(), ...extras }))
  }
  return {
    requestId: rid,
    info:  (msg, extras) => write('info',  msg, extras),
    warn:  (msg, extras) => write('warn',  msg, extras),
    error: (msg, extras) => write('error', msg, extras),
  }
}

// ── Input validation ─────────────────────────────────────────────────────────

/**
 * Validates a numeric or string ID query parameter.
 * Returns { ok: true, value } or { ok: false, error } string.
 * @param {string|undefined} val
 * @param {{ name?: string, numeric?: boolean, maxLen?: number }} [opts]
 */
export function validateId(val, { name = 'id', numeric = true, maxLen = 15 } = {}) {
  if (val == null || val === '') return { ok: false, error: `${name} is required` }
  if (val.length > maxLen) return { ok: false, error: `${name} too long` }
  if (numeric && !/^\d+$/.test(val)) return { ok: false, error: `${name} must be numeric` }
  return { ok: true, value: val }
}

/**
 * Validates that a string param is one of a known set of values.
 * @param {string|undefined} val
 * @param {string[]} allowed
 * @param {string} [name]
 */
export function validateEnum(val, allowed, name = 'param') {
  if (val == null) return { ok: false, error: `${name} is required` }
  if (!allowed.includes(val)) return { ok: false, error: `${name} must be one of: ${allowed.join(', ')}` }
  return { ok: true, value: val }
}

// ── Error telemetry ──────────────────────────────────────────────────────────

let _monitorKv = null
function _getMonitorKv() {
  if (!_monitorKv && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    _monitorKv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
  }
  return _monitorKv
}

// Sliding-window IP rate limiter. Returns true if the request should proceed,
// false if the caller has exceeded maxPerMin requests in the last 60 seconds.
// Fails open on any KV error so a temporary outage never blocks legitimate users.
export async function rateLimitByIp(req, kv, limitKey, maxPerMin = 10) {
  const ip = String(
    req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown'
  ).split(',')[0].trim()
  const key = `rl:${limitKey}:${ip}`
  try {
    const count = await kv.incr(key)
    if (count === 1) await kv.expire(key, 60)
    return count <= maxPerMin
  } catch {
    return true
  }
}

// Fire-and-forget error telemetry. Writes to a daily KV list capped at 100
// entries with a 3-day TTL. Never throws or blocks the calling handler.
export async function trackError(endpoint, statusCode, detail) {
  try {
    const client = _getMonitorKv()
    if (!client) return
    const key = `monitor:errors:${new Date().toISOString().slice(0, 10)}`
    const entry = JSON.stringify({ endpoint, statusCode, detail: String(detail).slice(0, 200), ts: Date.now() })
    await client.lpush(key, entry)
    await client.ltrim(key, 0, 99)
    await client.expire(key, 259200) // 3 days
  } catch (_) {}
}

// Probes the three external dependencies used by most endpoints.
// Returns { pandascore, opendota, kv } each with { status, latency_ms[, error] }.
/**
 * Set CORS headers on a response. Returns true if the request was an OPTIONS preflight
 * (caller should `return` immediately after). Call this at the top of every handler.
 *
 * allowAll: true  → Access-Control-Allow-Origin: *   (public read endpoints)
 * allowAll: false → Access-Control-Allow-Origin: https://spectateesports.live (sensitive endpoints)
 */
export function setCorsHeaders(req, res, { allowAll = false } = {}) {
  res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : 'https://spectateesports.live')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-analytics-password')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

export async function checkServices() {
  const probe = async (name, fn) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const start = Date.now()
    try {
      await fn(controller.signal)
      clearTimeout(timer)
      return { status: 'ok', latency_ms: Date.now() - start }
    } catch (err) {
      clearTimeout(timer)
      return { status: 'error', error: err.name === 'AbortError' ? 'timeout' : err.message, latency_ms: Date.now() - start }
    }
  }

  const [pandascore, opendota, kv] = await Promise.all([
    probe('pandascore', signal =>
      fetch(`${PANDASCORE_BASE}/leagues?page[size]=1`, {
        signal,
        headers: { Authorization: `Bearer ${process.env.PANDASCORE_TOKEN}` },
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`) })
    ),
    probe('opendota', signal =>
      fetch('https://api.opendota.com/api/metadata', { signal })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`) })
    ),
    probe('kv', async (signal) => {
      const client = _getMonitorKv()
      if (!client) throw new Error('KV not configured')
      const timeoutRace = new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))
      )
      await Promise.race([client.set('monitor:_health', 1, { ex: 60 }), timeoutRace])
    }),
  ])

  return { pandascore, opendota, kv }
}

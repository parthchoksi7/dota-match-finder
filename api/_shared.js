/**
 * Shared utilities for API serverless functions.
 * This file is prefixed with _ so Vercel does NOT deploy it as a serverless function.
 * It does NOT count toward the 12-function limit.
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
 * Builds a Set of OpenDota league IDs whose tier is "premium" or "professional"
 * (the OpenDota equivalents of PandaScore tiers S and A respectively).
 * Pure function; accepts the raw array returned by GET /api/leagues.
 */
export function buildPremiumLeagueIds(leagues) {
  return new Set(
    (leagues || []).filter(l => l.tier === 'premium' || l.tier === 'professional').map(l => l.leagueid)
  )
}

// Module-level cache so successive calls within the same Lambda warm-up
// (or browser session for client-side consumers) skip the network round-trip.
let _premiumLeagueIds = null

/**
 * Fetches the OpenDota league list and returns a Set of premium-tier league IDs.
 * Result is cached in memory for the lifetime of the process/session.
 */
export async function getPremiumLeagueIds() {
  if (_premiumLeagueIds) return _premiumLeagueIds
  const res = await fetch('https://api.opendota.com/api/leagues')
  if (!res.ok) throw new Error(`OpenDota leagues error: ${res.status}`)
  const leagues = await res.json()
  _premiumLeagueIds = buildPremiumLeagueIds(leagues)
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
 * Maps a PandaScore streams_list + tournament name to Twitch stream objects.
 * Returns an array of { label, url } for display and channel-detection purposes.
 */
export function getTwitchStreams(streamsList, leagueName, serieName) {
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()

  // Use PandaScore streams_list if available — filters to official Twitch streams (any language).
  // Language is NOT restricted to English: regional qualifiers (China, CIS) have official
  // streams with language='zh' or 'ru' that are still the correct VOD source.
  // Exception: for ESL One tournaments, PandaScore consistently returns only esl_dota2 (main hub)
  // even when the actual broadcast is on a sub-channel (esl_dota2earth/storm/ember).
  // In that case, fall through to the static mapping so all sub-channels are shown.
  const allTwitchOfficial = (streamsList || []).filter(s => s.official && s.raw_url?.includes('twitch.tv'))
  // Prefer English streams to preserve existing behaviour for main events; fall back to any language
  const enOfficial = allTwitchOfficial.filter(s => s.language === 'en')
  const official = enOfficial.length > 0 ? enOfficial : allTwitchOfficial
  if (official.length > 0) {
    // When multiple concurrent matches share sub-channels (e.g. ESL One, DreamLeague), PandaScore
    // marks exactly one stream main:true per match on the individual endpoint. Narrow to it.
    // If no stream is marked main (bulk endpoint omits the flag), pick the first one.
    const mainStreams = official.filter(s => s.main)
    const hasMainFlag = mainStreams.length > 0
    const toUse = hasMainFlag ? mainStreams : official.slice(0, 1)
    const streams = toUse.map(s => {
      const channel = s.raw_url.replace('https://www.twitch.tv/', '')
      return { label: CHANNEL_LABELS[channel] || channel, url: s.raw_url }
    })
    // Only fall through to the static ESL One mapping when there is no main flag at all
    // (bulk endpoint data) and we're guessing esl_dota2. If PandaScore explicitly assigned
    // main:true to esl_dota2, that match really is on the main hub — trust it.
    const isEslOneMainOnly = !hasMainFlag
      && lower.includes('esl one')
      && streams.length === 1
      && streams[0].url === 'https://www.twitch.tv/esl_dota2'
    if (!isEslOneMainOnly) return streams
    // Fall through to static mapping below
  }

  // Fallback: static mapping by tournament name
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

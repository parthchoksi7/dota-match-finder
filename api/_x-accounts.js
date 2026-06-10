// X (Twitter) handle repository for tournaments, teams, and talent.
// All lookups use case-insensitive substring matching unless marked exact.
// Live data is stored in KV (`x-accounts:handles:v1`) so handles can be
// updated without a deploy. Static constants below serve as the fallback.

import { kv } from './_kv.js'

const HANDLES_KV_KEY = 'x-accounts:handles:v1'
const HANDLES_CACHE_TTL = 3600 * 1000 // 1h

let _live = null
let _liveExpiry = 0

// Call once per handler invocation to hydrate the in-memory cache from KV.
// Safe to call multiple times — re-reads only when TTL has expired.
export async function refreshHandles() {
  if (Date.now() < _liveExpiry) return
  try {
    const data = await kv.get(HANDLES_KV_KEY)
    if (data?.teams && data?.tournaments) {
      _live = data
      _liveExpiry = Date.now() + HANDLES_CACHE_TTL
    }
  } catch {}
}

const TOURNAMENT_HANDLES = [
  { patterns: ['blast slam', 'blast dota'], handle: 'BLASTDota' },
  { patterns: ['dreamleague'], handle: 'ESLDota2' },
  { patterns: ['esl'], handle: 'ESLDota2' },
  { patterns: ['pgl'], handle: 'pgldota2' },
]

// Order matters: more-specific patterns must appear before shorter ones that
// could match the same substring (e.g. 'betboom' before 'boom').
const TEAM_HANDLES = [
  { patterns: ['team liquid', 'liquid'], handle: 'teamliquiddota' },
  { patterns: ['team spirit', 'spirit'], handle: 'TSpirit_Dota2' },
  { patterns: ['team secret', 'secret'], handle: 'teamsecret' },
  { patterns: ['betboom'], handle: 'BetBoomTeam' },
  { patterns: ['boom esports', 'boom'], handle: 'boomesportsid' },
  { patterns: ['nigma'], handle: 'NigmaGalaxy' },
  { patterns: ['natus vincere', 'navi'], handle: 'natusvincere' },
  { patterns: ['virtus.pro', 'virtus'], handle: 'virtuspro' },
  { patterns: ['aurora'], handle: 'AuroraDota2_GG' },
  { patterns: ['tundra'], handle: 'TundraEsports' },
  { patterns: ['parivision', 'pari visions', 'pari'], handle: 'PARIVISIONdota2' },
  { patterns: ['xtreme gaming', 'xtreme'], handle: 'xtremegamingcn' },
  { patterns: ['glyph'], handle: 'glyphdota' },
  { patterns: ['og esports', 'og'], exact: true, handle: 'OGesports' },
]

// Talent pools keyed by tournament handle. Add talent for other tournaments here.
export const TOURNAMENT_TALENT = {
  BLASTDota: [
    '_NatTea', 'TeaGuvnor', 'ccncdota2', 'KheZu', 'sheepsticked',
    'ODPixel', 'Foggeddota', 'syndereNDota', 'SUNSfanTV', 'zquixotix',
    'Danog', 'rkryptic', 'Ares_HD',
  ],
}

export function lookupTournamentHandle(name) {
  if (!name) return null
  const lower = name.toLowerCase()
  const source = _live?.tournaments ?? TOURNAMENT_HANDLES
  for (const { patterns, handle } of source) {
    if (patterns.some(p => lower.includes(p))) return handle
  }
  return null
}

export function lookupTeamHandle(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  const source = _live?.teams ?? TEAM_HANDLES
  for (const { patterns, exact, handle } of source) {
    if (exact
      ? patterns.some(p => lower === p)
      : patterns.some(p => lower.includes(p))
    ) return handle
  }
  return null
}

// Returns `count` randomly-chosen talent handles for the tournament, or [] if none known.
export function pickTournamentTalent(tournamentHandle, count = 2) {
  if (!tournamentHandle) return []
  const talentSource = _live?.talent ?? TOURNAMENT_TALENT
  const pool = talentSource[tournamentHandle]
  if (!pool?.length) return []
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

// Returns the current handles blob (live from KV if available, else static fallback).
// Used by the admin update endpoint to read-then-patch the data.
export function getHandlesSnapshot() {
  return _live ?? { teams: TEAM_HANDLES, tournaments: TOURNAMENT_HANDLES, talent: TOURNAMENT_TALENT }
}

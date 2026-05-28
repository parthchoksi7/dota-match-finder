// X (Twitter) handle repository for tournaments, teams, and talent.
// All lookups use case-insensitive substring matching unless marked exact.

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
  for (const { patterns, handle } of TOURNAMENT_HANDLES) {
    if (patterns.some(p => lower.includes(p))) return handle
  }
  return null
}

export function lookupTeamHandle(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  for (const { patterns, exact, handle } of TEAM_HANDLES) {
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
  const pool = TOURNAMENT_TALENT[tournamentHandle]
  if (!pool?.length) return []
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

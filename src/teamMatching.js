// Pure PS↔OD team-name matching, shared between the client (favorites highlighting, via
// src/utils.js re-export) and server (api/_shared.js, which imports and re-exports these for
// its own call sites). Zero imports on purpose — this file must be safe to load in a Vercel
// serverless function, unlike src/utils.js (which pulls in @vercel/analytics, a browser-
// oriented package) — same pattern as src/seriesLogic.js. Keep it that way: do not add an
// import here without checking it's Node-safe.

// Alias groups for team-name pairs known to diverge with no substring relationship at all.
// Each entry is a group of normalizeTeamName() outputs known to
// refer to the same org; membership is checked ADDITIVELY alongside substring matching in
// namesEquivalent() below — it never replaces or rewrites a name's own normalized form, so a
// name's ordinary substring relationship with every OTHER team is untouched. (An earlier
// version of this rewrote normalizeTeamName's output directly; that broke "BetBoom Team"
// matching any OD row that legitimately calls them "BetBoom" — caught by
// __tests__/team-name-match.test.js before it shipped.)
const TEAM_NAME_ALIAS_GROUPS = [
  // Tier-1 scrub, 2026-07-07: OpenDota's persistent team registry (team_id 8255888, 667
  // recorded wins) still carries "BoomBoys" — PandaScore's own team search returns zero
  // hits for that name, only "BetBoom Team" (id 130768) — confirming it's a legacy/OD-side
  // name for the same org, not a different team. Confirmed live in an EWC 2026 match
  // (PS opponent "BetBoom Team" vs OD radiant_name "BoomBoys", same game, same time window).
  ['betboomteam', 'boomboys'],
  // 2026-07-15: "1win Team" inherited Tundra Esports' roster in June 2026 (flagged as
  // unconfirmed in .claude/pending-refactors.md pending a live match to check against).
  // Confirmed now: PandaScore's opponent name for today's EWC 2026 Round 2 match (id
  // 1565904) is "1win", but OpenDota still has no "1win" team_id at all — team_id 8291895's
  // most recent match (OD match 8815912139, ~2026-05) carries radiant_name "Tundra Esports",
  // the pre-roster-swap identity (OD ties team_id to Steam group continuity, not org
  // branding). No substring relationship between "1win" and "tundraesports", so this needs
  // an explicit alias entry, not just normalizeTeamName. Revisit/remove once OD's per-match
  // name catches up to "1win".
  ['1win', 'tundraesports'],
]

export function namesAlias(x, y) {
  return TEAM_NAME_ALIAS_GROUPS.some(g => g.includes(x) && g.includes(y))
}

// Normalize a team name for fuzzy PS↔OD matching: lowercase, then strip every
// separator/punctuation char (spaces, dots, hyphens, apostrophes) while keeping
// Unicode letters/digits. This lets cosmetically different spellings of the same
// team match — e.g. OD "ggboom" vs PS "GG Boom", or "Virtus.pro" vs "Virtuspro".
// Returns '' for empty/missing input (callers must guard so '' never matches all).
export function normalizeTeamName(name) {
  return (name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

// True when two normalized names refer to the same team: either a substring relationship
// (truncation/abbreviation, e.g. "betboomteam" ⊃ "betboom") or a known alias pair
// (TEAM_NAME_ALIAS_GROUPS, for names with no substring relationship at all).
function namesEquivalent(x, y) {
  return x.includes(y) || y.includes(x) || namesAlias(x, y)
}

// True when a PS opponent pair fuzzy-matches an OD team pair, order-independent,
// using bidirectional substring on NORMALIZED names. The single source of truth for
// PS↔OD team matching — shared by match-streams.js teamsMatch() and findOdMatchByTime().
// Returns false if any name normalizes to '' so a missing/TBD name never matches all.
export function teamPairMatch(psNameA, psNameB, odNameR, odNameD) {
  const a = normalizeTeamName(psNameA)
  const b = normalizeTeamName(psNameB)
  const r = normalizeTeamName(odNameR)
  const d = normalizeTeamName(odNameD)
  if (!a || !b || !r || !d) return false
  return (namesEquivalent(a, r) || namesEquivalent(a, d)) && (namesEquivalent(b, r) || namesEquivalent(b, d))
}

// Counts how many of the two OD team names a PS opponent pair partially matches (0-2),
// using the same normalize + bidirectional-substring/alias rule as teamPairMatch. A lower-
// confidence signal than teamPairMatch (only needs ONE side to overlap, not both) — used
// exclusively by findBestPsMatch() in api/_shared.js as a same-time-window tiebreaker, never
// as a standalone pass/fail check, since a score of 1 alone can't rule out a false positive.
export function teamPairScore(psNameA, psNameB, odNameA, odNameB) {
  const a = normalizeTeamName(psNameA)
  const b = normalizeTeamName(psNameB)
  const r = normalizeTeamName(odNameA)
  const d = normalizeTeamName(odNameB)
  if (!a || !b || !r || !d) return 0
  return (namesEquivalent(a, r) || namesEquivalent(a, d) ? 1 : 0) + (namesEquivalent(b, r) || namesEquivalent(b, d) ? 1 : 0)
}

// Minimum normalized length for a name to safely anchor a bidirectional-substring match in
// isTeamFollowed. namesEquivalent's substring rule is safe inside teamPairMatch because BOTH
// sides of a pairing must match simultaneously — a false positive needs two independent
// coincidences in the same time window. isTeamFollowed checks one followed name against one
// arbitrary candidate name with no such cross-validation, so a short name is dangerous:
// normalizeTeamName('OG') === 'og', which is a substring of "Zero Gaming", "Turbo Gaming", and
// "Dogs" — real tier-1-adjacent collisions (OG is itself one of this app's curated tier-1
// teams), not contrived ones. resolveFollowedTeamName() below hits the same hazard and avoids
// it entirely by using exact-or-alias only, never substring; isTeamFollowed keeps substring
// (real value for legitimate truncations like PS "Aurora" / OD "Aurora Gaming") but gates it
// behind a minimum length so a 2-3 char name can only match by exact equality or alias.
const MIN_FOLLOWED_SUBSTRING_LEN = 4

function followedNameEquivalent(followedName, candidateName) {
  if (followedName === candidateName) return true
  if (namesAlias(followedName, candidateName)) return true
  if (followedName.length < MIN_FOLLOWED_SUBSTRING_LEN || candidateName.length < MIN_FOLLOWED_SUBSTRING_LEN) return false
  return followedName.includes(candidateName) || candidateName.includes(followedName)
}

// True when any of a user's followed team names fuzzy-matches any of the given match team
// names. This is what lets a team followed under its OpenDota name (e.g. "Tundra Esports",
// starred from a completed match, since the follow star only ever appears on played matches)
// still highlight that same team's PandaScore-sourced upcoming fixture (e.g. "1win") — the two
// API providers routinely use divergent names for the same org, sometimes with no substring
// relationship at all (see the "1win"/"tundraesports" TEAM_NAME_ALIAS_GROUPS entry above).
// Read-only "should this render as followed" check — NOT for driving the follow-star's own
// filled/toggle state, which must stay an exact string match against the literal name that was
// clicked, or add/remove would desync from a fuzzy-matched display and silently pile up
// near-duplicate entries in followedTeams.
export function isTeamFollowed(followedTeams, ...teamNames) {
  if (!followedTeams?.length) return false
  const normalizedFollowed = followedTeams.map(normalizeTeamName).filter(Boolean)
  if (!normalizedFollowed.length) return false
  return teamNames.some(name => {
    const n = normalizeTeamName(name)
    return !!n && normalizedFollowed.some(f => followedNameEquivalent(f, n))
  })
}

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
  // "bb" added 2026-08-01: OpenDota's promatches feed sometimes abbreviates radiant_name/
  // dire_name to the bare "BB" for this org (previously handled by a since-removed hand-rolled
  // TEAM_NAME_MAP in src/api.js) — exact alias-group membership only, no substring risk (unlike
  // TEAM_NICKNAMES' fuzzy search matching, `namesAlias` requires exact equality with a group
  // member, so this can't misfire the way a 2-char *substring* match could).
  ['betboomteam', 'boomboys', 'bb'],
  // 2026-07-15: "1win Team" inherited Tundra Esports' roster in June 2026 (flagged as
  // unconfirmed in .claude/pending-refactors.md pending a live match to check against).
  // Confirmed then: PandaScore's opponent name for that EWC 2026 Round 2 match (id 1565904)
  // was "1win", but OpenDota still had no "1win" team_id at all — team_id 8291895's most
  // recent match (OD match 8815912139, ~2026-05) carried radiant_name "Tundra Esports", the
  // pre-roster-swap identity (OD ties team_id to Steam group continuity, not org branding).
  // 2026-08-01: owner-confirmed the org has since rebranded again, from "1win" to "1w Team"
  // — PandaScore's own synced team list (?mode=teams) still returns "1win" as of this date
  // (not yet caught up, same lag pattern as the original Tundra→1win transition), and
  // OpenDota's per-match name is the short form "1W". None of "1wteam"/"1w"/"1win"/
  // "tundraesports" have a substring relationship with each other, so all four need explicit
  // alias membership, not just normalizeTeamName. Revisit/prune the older entries once
  // PandaScore's sync and OD's per-match name both catch up to "1w Team".
  ['1wteam', '1w', '1win', 'tundraesports'],
  // TI 2026 rebrand scrub, 2026-08-02 (`.claude/specs/ti-2026-day-one-spec.md` T0.2): PandaScore's
  // "Iron Wing" (team id 138994, confirmed via live `dota2/teams` search) is backed by OpenDota
  // Steam group 10150413 — PandaScore's own logo asset for this team is literally named
  // `10150413.png`. OD's per-match radiant_name/dire_name for that same team_id still reads
  // "Tundra Esports" as of its most recent indexed match (2026-05-30) — a second, UNRELATED
  // OD-side "Tundra Esports" label from the org's pre-rebrand identity, distinct from the
  // 8291895/1win lineage above. This is NOT the same org as the real, currently active "Tundra
  // Esports" (PandaScore id 128439, roster incl. Saksa, still competing under its own name) — that
  // org's own matches carry the literal "Tundra Esports" name on BOTH sides and need no alias at
  // all. Scoped as its own group (not merged into the 1win group above) precisely so a future
  // cleanup doesn't collapse three distinct orgs that all happen to touch the string
  // "tundraesports" into one.
  ['ironwing', 'tundraesports'],
]

export function namesAlias(x, y) {
  return TEAM_NAME_ALIAS_GROUPS.some(g => g.includes(x) && g.includes(y))
}

// Curated tier-1 org roster + known slugs/nicknames, used by canonicalTeamName() below and by
// several server-only features (?mode=teams, sync-teams cron, news team-tagging). Lives here
// (not api/_shared.js) so canonicalTeamName can run client-side too — api/_shared.js imports and
// re-exports all four unchanged so none of its existing server call sites need to change.
//
// Reconciled 2026-07-15 against a live PandaScore /videogames/dota-2/teams sweep across every
// tracked tier-1 league: one removal (Xtreme Gaming's old "PSG.Y" tag — PandaScore no longer
// returns the old name at all) and twelve additions (real EWC group-stage/playoffs or BLAST Slam
// Playoffs participants that had no entry here, 1win among them — it inherited Tundra Esports'
// roster in June 2026, see TEAM_NAME_ALIAS_GROUPS above).
// 2026-08-01: "1win" renamed to "1w Team" (owner-confirmed; PandaScore's own sync hasn't
// caught up yet, see the alias-group comment above — "1win"/"1w"/"tundraesports" all resolve
// here via alias). "Tundra Esports" is kept as its own separate entry (not merged into this
// one) so a genuinely historical OD match from before the 1win/1w Team roster swap still
// displays "Tundra Esports" — exact equality is checked before alias fallback, so it wins for
// any OD name that's still literally "Tundra Esports".
export const TIER1_TEAMS_SERVER = [
  'Team Liquid', '1w Team', 'Tundra Esports', 'Team Spirit', 'BetBoom Team',
  'Team Falcons', 'Gaimin Gladiators', 'Aurora', 'OG',
  'Natus Vincere', 'Virtus.pro', 'Team Secret', 'Team Aster',
  'Talon Esports', 'Nouns Esports', 'Team Yandex', 'LGD Gaming',
  'Nigma Galaxy', 'Evil Geniuses', 'beastcoast', 'Thunder Awaken',
  'Parivision', 'Xtreme Gaming', 'Vici Gaming', 'Rune Eaters',
  'GamerLegion', 'MOUZ', 'Team Nemesis', 'L1ga Team', 'Level UP',
  'PlayTime', 'Poor Rangers', 'Inner Circle x Insanity', 'REKONIX',
]

// Known PandaScore slugs for the TIER1_TEAMS_SERVER fallback teams, taken directly from a live
// PandaScore team object per name (not guessed — three earlier guesses here were wrong: BetBoom
// Team is "betboom-team" not "betboom", Team Falcons is "team-falcons-dota-2" not "team-falcons",
// Parivision is "parivision-dota-2" not "parivision"). ?mode=teams uses this to give its own
// fallback (KV_TIER1_TEAMS_FULL_KEY empty/unreachable — e.g. right after this feature first
// deploys, before the sync-teams cron has ever run) real, usable slugs instead of null —
// Calendar.jsx's team picker requires a non-null slug per team, so a null-slug fallback would
// silently empty it out until KV is populated.
export const TIER1_TEAMS_SERVER_SLUGS = {
  'Team Liquid': 'team-liquid',
  'Tundra Esports': 'tundra-esports',
  'Team Spirit': 'team-spirit',
  'BetBoom Team': 'betboom-team',
  'Team Falcons': 'team-falcons-dota-2',
  'Gaimin Gladiators': 'gaimin-gladiators',
  'Aurora': 'aurora-dota-2',
  'OG': 'og',
  'Natus Vincere': 'natus-vincere',
  'Virtus.pro': 'virtus-pro',
  'Team Secret': 'team-secret',
  'Team Aster': 'team-aster',
  'Talon Esports': 'talon-esports',
  'Nouns Esports': 'nouns-esports',
  'Team Yandex': 'team-yandex',
  'LGD Gaming': 'lgd-gaming-dota-2',
  'Nigma Galaxy': 'nigma-galaxy',
  'Evil Geniuses': 'evil-geniuses',
  'beastcoast': 'beastcoast',
  'Thunder Awaken': 'thunder-awaken',
  'Parivision': 'parivision-dota-2',
  'Xtreme Gaming': 'xtreme-gaming',
  // Carried over from the pre-rename "1win" slug — unverified against the "1w Team" rename
  // (PandaScore's own sync hasn't caught up yet as of 2026-08-01, see TIER1_TEAMS_SERVER
  // comment). This is only the last-resort static fallback (?mode=teams prefers the live
  // KV-synced slug); worst case until confirmed is Calendar's team picker excludes this org.
  '1w Team': '1win-dota-2',
  'Vici Gaming': 'vici-gaming-dota-2',
  'Rune Eaters': 'rune-eaters',
  'GamerLegion': 'gamerlegion-dota-2',
  'MOUZ': 'mouz-dota-2',
  'Team Nemesis': 'team-nemesis',
  'L1ga Team': 'l1ga-team',
  'Level UP': 'level-up',
  'PlayTime': 'playtime',
  'Poor Rangers': 'poor-rangers',
  'Inner Circle x Insanity': 'inner-circle',
  'REKONIX': 'rekonix',
}

// Community nicknames/shorthand that don't appear as a substring of the official team name, so
// plain substring search can't find them — hand-maintained since PandaScore has no concept of a
// fan nickname. Keyed by the exact official name used elsewhere in this list. Extend as new
// nicknames come up; no need to cover every team, only ones whose common short form isn't
// already substring-matchable.
export const TEAM_NICKNAMES = {
  'BetBoom Team': ['boomboys', 'bb'],
  'Parivision': ['pvision'],
  'Natus Vincere': ['navi'],
  'Virtus.pro': ['vp'],
  'Team Liquid': ['tl'],
  // "1win"/"1W" are the pre-rename names fans and older content still search by — no
  // substring relationship with "1w Team" (renamed 2026-08-01, see TIER1_TEAMS_SERVER).
  '1w Team': ['1win', '1win team', '1w'],
  'Aurora': ['aurora gaming'],
  // LGD Gaming dropped the PSG sponsorship in its name; PandaScore no longer returns "PSG.LGD"
  // at all (confirmed 2026-07-19), but plenty of existing content/muscle memory still calls
  // them that.
  'LGD Gaming': ['psg.lgd', 'psg'],
}

// Maps a raw team name (typically an OpenDota radiant_name/dire_name) to the canonical org name
// in TIER1_TEAMS_SERVER — the single source of truth for "always show the PandaScore/official
// name" across upcoming, live, and completed matches (originally built for the push follower
// index, so also exported as resolveFollowedTeamName below for that call site's own clarity).
// Matches ONLY on full normalized equality or an explicit alias group — NOT the bidirectional
// substring rule teamPairMatch uses. Substring is safe for a disambiguated PAIR but not for a
// single short org: "OG" (normalized "og") is a substring of "zerogaming", "turbogaming", etc.,
// which would misfire onto OG's identity. OD uses full registered names for the tier-1 orgs, so
// equality + alias covers every real divergence; add a TEAM_NAME_ALIAS_GROUPS entry if a new one
// appears. Returns the input unchanged when it matches no tier-1 org, so a non-tier-1 name is
// never silently dropped or misattributed.
//
// Exact-equality is checked across the WHOLE roster before any alias fallback, in its own pass
// — not a single combined predicate. Two TIER1_TEAMS_SERVER entries can legitimately share one
// alias group at once (e.g. "1w Team" and "Tundra Esports", kept separate so a genuinely
// historical OD match from before the roster/branding swap still displays "Tundra Esports"); a
// combined single-pass predicate would let array order alone decide the winner for an EXACT
// match too (whichever entry `.find()` reached first), which broke the historical-accuracy
// case — caught in review 2026-08-01 before shipping. With exact-first, alias-fallback array
// order only matters for names that exactly match NEITHER entry (e.g. OD's abbreviated "1W"),
// where it deliberately prefers whichever entry is listed first in TIER1_TEAMS_SERVER — keep the
// current/preferred name of any such pair ahead of the retired one in that array.
export function canonicalTeamName(name) {
  const n = normalizeTeamName(name)
  if (!n) return name
  const exact = TIER1_TEAMS_SERVER.find(t => normalizeTeamName(t) === n)
  if (exact) return exact
  return TIER1_TEAMS_SERVER.find(t => namesAlias(normalizeTeamName(t), n)) || name
}

// Alias kept for the push-follower-index call site (api/live-matches.js), which predates the
// name display use case above — same function, just a name that reads clearly in that context.
export const resolveFollowedTeamName = canonicalTeamName

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

// Resolves which of a PS opponent pair was the Radiant side of a specific OD game, so a caller
// can attribute an OD-only result (radiantWin) onto an already-trusted PS team name instead of
// ever rendering a raw OD name next to it (the exact naming-mismatch class TEAM_NAME_ALIAS_GROUPS
// exists to paper over — see "1win"/"tundraesports" above). Returns 'A' when psNameA was Radiant,
// 'B' when psNameB was Radiant, or null when the pairing doesn't cleanly resolve to exactly one
// side (missing name, no match, or the rare ambiguous case where both orderings match) — callers
// must treat null as "don't guess" and fall back to not showing a name at all.
export function resolveRadiantSide(psNameA, psNameB, odRadiantName, odDireName) {
  const a = normalizeTeamName(psNameA)
  const b = normalizeTeamName(psNameB)
  const r = normalizeTeamName(odRadiantName)
  const d = normalizeTeamName(odDireName)
  if (!a || !b || !r || !d) return null
  const aIsRadiant = namesEquivalent(a, r) && namesEquivalent(b, d)
  const bIsRadiant = namesEquivalent(b, r) && namesEquivalent(a, d)
  if (aIsRadiant === bIsRadiant) return null // neither resolves, or both do (ambiguous) — don't guess
  return aIsRadiant ? 'A' : 'B'
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

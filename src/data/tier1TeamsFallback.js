// Last-resort fallback for fetchTier1Teams() (src/api.js) — used only when the live
// GET /api/tournaments?mode=teams fetch fails (offline, API error) and no cached copy
// exists yet in localStorage. The live, auto-updated list (populated by the sync-teams
// cron from PandaScore tournament rosters) is the source of truth; this static list only
// keeps Follow Teams (ManageTeamsModal.jsx) and the Calendar team picker (Calendar.jsx)
// functional without it.
//
// `slug` is the PandaScore team slug, used by Calendar.jsx to build calendar
// subscription URLs. `aliases` mirrors TEAM_NICKNAMES in src/teamMatching.js so alias search
// (e.g. "boomboys" -> BetBoom Team) still works offline.
//
// 2026-07-19: cross-checked every slug against a live PandaScore fetch and added every
// tier-S/A Esports World Cup 2026 + BLAST Slam participant that had no entry here (1win
// among them). Mirrors TIER1_TEAMS_SERVER / TIER1_TEAMS_SERVER_SLUGS / TEAM_NICKNAMES in
// src/teamMatching.js (moved there 2026-08-01, formerly api/_shared.js) — keep both in sync.
export const TIER1_TEAMS_FALLBACK = [
  // Renamed "1win" -> "1w Team" 2026-08-01, then "1w Team" -> "Iron Wing" 2026-08-10
  // (owner-confirmed both times; PandaScore's own sync may not have caught up, see
  // TIER1_TEAMS_SERVER in src/teamMatching.js) — slug carried over from "1win-dota-2" and
  // unverified against the rename. This entry also absorbs the former standalone "Tundra
  // Esports" fallback row (removed 2026-08-10, same owner confirmation — see teamMatching.js).
  { name: 'Iron Wing', slug: '1win-dota-2', acronym: null, aliases: ['1win', '1win team', '1w', '1w team', 'tundra', 'tundra esports'] },
  { name: 'Aurora', slug: 'aurora-dota-2', acronym: null, aliases: ['aurora gaming'] },
  { name: 'beastcoast', slug: 'beastcoast', acronym: null, aliases: [] },
  { name: 'BetBoom Team', slug: 'betboom-team', acronym: null, aliases: ['boomboys', 'bb'] },
  { name: 'Evil Geniuses', slug: 'evil-geniuses', acronym: null, aliases: [] },
  { name: 'GamerLegion', slug: 'gamerlegion-dota-2', acronym: null, aliases: [] },
  { name: 'Gaimin Gladiators', slug: 'gaimin-gladiators', acronym: null, aliases: [] },
  { name: 'Inner Circle x Insanity', slug: 'inner-circle', acronym: null, aliases: [] },
  { name: 'L1ga Team', slug: 'l1ga-team', acronym: null, aliases: [] },
  { name: 'LGD Gaming', slug: 'lgd-gaming-dota-2', acronym: null, aliases: ['psg.lgd', 'psg'] },
  { name: 'Level UP', slug: 'level-up', acronym: null, aliases: [] },
  { name: 'MOUZ', slug: 'mouz-dota-2', acronym: null, aliases: [] },
  { name: 'Natus Vincere', slug: 'natus-vincere', acronym: null, aliases: ['navi'] },
  { name: 'Nigma Galaxy', slug: 'nigma-galaxy', acronym: null, aliases: [] },
  { name: 'Nouns Esports', slug: 'nouns-esports', acronym: null, aliases: [] },
  { name: 'OG', slug: 'og', acronym: null, aliases: [] },
  { name: 'Parivision', slug: 'parivision-dota-2', acronym: null, aliases: ['pvision'] },
  { name: 'PlayTime', slug: 'playtime', acronym: null, aliases: [] },
  { name: 'Poor Rangers', slug: 'poor-rangers', acronym: null, aliases: [] },
  { name: 'REKONIX', slug: 'rekonix', acronym: null, aliases: [] },
  { name: 'Rune Eaters', slug: 'rune-eaters', acronym: null, aliases: [] },
  { name: 'Talon Esports', slug: 'talon-esports', acronym: null, aliases: [] },
  { name: 'Team Aster', slug: 'team-aster', acronym: null, aliases: [] },
  { name: 'Team Falcons', slug: 'team-falcons-dota-2', acronym: null, aliases: [] },
  { name: 'Team Liquid', slug: 'team-liquid', acronym: null, aliases: ['tl'] },
  { name: 'Team Nemesis', slug: 'team-nemesis', acronym: null, aliases: [] },
  { name: 'Team Secret', slug: 'team-secret', acronym: null, aliases: [] },
  { name: 'Team Spirit', slug: 'team-spirit', acronym: null, aliases: [] },
  { name: 'Team Yandex', slug: 'team-yandex', acronym: null, aliases: [] },
  { name: 'Thunder Awaken', slug: 'thunder-awaken', acronym: null, aliases: [] },
  { name: 'Vici Gaming', slug: 'vici-gaming-dota-2', acronym: null, aliases: [] },
  { name: 'Virtus.pro', slug: 'virtus-pro', acronym: null, aliases: ['vp'] },
  { name: 'Xtreme Gaming', slug: 'xtreme-gaming', acronym: null, aliases: [] },
]

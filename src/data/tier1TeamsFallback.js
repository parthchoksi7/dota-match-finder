// Last-resort fallback for fetchTier1Teams() (src/api.js) — used only when the live
// GET /api/tournaments?mode=teams fetch fails (offline, API error) and no cached copy
// exists yet in localStorage. The live, auto-updated list (populated by the sync-teams
// cron from PandaScore tournament rosters) is the source of truth; this static list only
// keeps Follow Teams (ManageTeamsModal.jsx) and the Calendar team picker (Calendar.jsx)
// functional without it.
//
// `slug` is the PandaScore team slug, used by Calendar.jsx to build calendar
// subscription URLs. `aliases` mirrors TEAM_NICKNAMES in api/_shared.js so alias search
// (e.g. "boomboys" -> BetBoom Team) still works offline.
export const TIER1_TEAMS_FALLBACK = [
  { name: 'Aurora Gaming', slug: 'aurora-gaming', acronym: null, aliases: [] },
  { name: 'beastcoast', slug: 'beastcoast', acronym: null, aliases: [] },
  { name: 'BetBoom Team', slug: 'betboom', acronym: null, aliases: ['boomboys', 'bb'] },
  { name: 'Evil Geniuses', slug: 'evil-geniuses', acronym: null, aliases: [] },
  { name: 'Gaimin Gladiators', slug: 'gaimin-gladiators', acronym: null, aliases: [] },
  { name: 'Natus Vincere', slug: 'natus-vincere', acronym: null, aliases: ['navi'] },
  { name: 'Nigma Galaxy', slug: 'nigma-galaxy', acronym: null, aliases: [] },
  { name: 'Nouns Esports', slug: 'nouns-esports', acronym: null, aliases: [] },
  { name: 'OG', slug: 'og', acronym: null, aliases: [] },
  { name: 'Parivision', slug: 'parivision', acronym: null, aliases: ['pvision'] },
  { name: 'PSG.LGD', slug: 'psg-lgd', acronym: null, aliases: [] },
  { name: 'Talon Esports', slug: 'talon-esports', acronym: null, aliases: [] },
  { name: 'Team Aster', slug: 'team-aster', acronym: null, aliases: [] },
  { name: 'Team Falcons', slug: 'team-falcons', acronym: null, aliases: [] },
  { name: 'Team Liquid', slug: 'team-liquid', acronym: null, aliases: ['tl'] },
  { name: 'Team Secret', slug: 'team-secret', acronym: null, aliases: [] },
  { name: 'Team Spirit', slug: 'team-spirit', acronym: null, aliases: [] },
  { name: 'Team Yandex', slug: 'team-yandex', acronym: null, aliases: [] },
  { name: 'Thunder Awaken', slug: 'thunder-awaken', acronym: null, aliases: [] },
  { name: 'Tundra Esports', slug: 'tundra-esports', acronym: null, aliases: [] },
  { name: 'Virtus.pro', slug: 'virtus-pro', acronym: null, aliases: ['vp'] },
  { name: 'Xtreme Gaming', slug: 'xtreme-gaming', acronym: null, aliases: [] },
]

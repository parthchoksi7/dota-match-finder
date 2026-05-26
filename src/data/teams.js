// Tier 1 Dota 2 organizations — historical facts and identity only.
// See .claude/staleness-checklist.md for what to review and when.
//
// Rules for this file:
//   DO NOT add player rosters, coach names, or current standings.
//   DO NOT make claims about current competitive status.
//   Only add fields that are either immutable (tiWins) or very slow to change.

// ⚠ STALE-RISK — region: competitive region. Rarely changes, but verify annually.
// ⚠ STALE-RISK — about/shortDesc: org identity text. Review annually; edit if org
//   fundamentally changes (e.g. disbands, rebrands, drops out of Tier 1 permanently).
// ✓ SAFE — tiWins: immutable historical record. Add new entry after each TI concludes.
// ✓ SAFE — basedIn: org HQ. Changes only on major ownership restructuring.
// ✓ SAFE — liquipedia: URL slug. Liquipedia rarely renames org pages.

export const REGION_LABELS = {
  WEU: 'Western Europe',
  EEU: 'Eastern Europe',
  CN: 'China',
  SEA: 'Southeast Asia',
  NA: 'North America',
  SA: 'South America',
}

export const TIER1_TEAMS = [
  // ── Western Europe ─────────────────────────────────────────────────────────
  {
    id: 'og',
    name: 'OG',
    region: 'WEU',
    basedIn: 'Europe',
    tiWins: [2018, 2019],
    shortDesc: 'The only organization to win The International twice — back-to-back in 2018 and 2019.',
    about: 'OG is a Western European esports organization and the most decorated team in The International history. They are the only organization to have won Dota 2\'s world championship back-to-back, claiming TI8 (2018) and TI9 (2019). Their TI8 victory is widely regarded as the greatest achievement in Dota 2 competitive history — the team qualified through an open qualifier after a last-minute roster rebuild and went on to defeat all opponents in their path. OG competes in the Western European Dota 2 region.',
    liquipedia: 'https://liquipedia.net/dota2/OG',
  },
  {
    id: 'gaimin-gladiators',
    name: 'Gaimin Gladiators',
    region: 'WEU',
    basedIn: 'Europe',
    tiWins: [],
    shortDesc: 'One of the most consistent Western European Dota 2 organizations of the modern pro circuit era.',
    about: 'Gaimin Gladiators is a Western European esports organization that has established itself as one of the most consistent Tier 1 Dota 2 contenders of the modern era. They reached the Grand Final of The International 2023 (TI12), falling to Team Spirit. Gaimin Gladiators competes in the Western European Dota 2 region and is a regular presence at DreamLeague, ESL One, PGL, and BLAST events.',
    liquipedia: 'https://liquipedia.net/dota2/Gaimin_Gladiators',
  },
  {
    id: 'team-liquid',
    name: 'Team Liquid',
    region: 'WEU',
    basedIn: 'Netherlands',
    tiWins: [],
    shortDesc: 'Three consecutive TI Grand Final appearances (TI7, TI8, TI9) — a streak unmatched by any other org.',
    about: 'Team Liquid is a Netherlands-based esports organization with one of the most consistent TI records in Dota 2 history. They reached three consecutive International Grand Finals — TI7 (2017), TI8 (2018), and TI9 (2019) — a streak of Grand Final appearances unmatched by any other organization. Team Liquid has been a mainstay of the Western European Dota 2 region across multiple competitive eras.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Liquid',
  },
  {
    id: 'tundra-esports',
    name: 'Tundra Esports',
    region: 'WEU',
    basedIn: 'United Kingdom',
    tiWins: [2022],
    shortDesc: 'The International 2022 (TI11) champions. UK-based Western European organization.',
    about: 'Tundra Esports is a United Kingdom-based esports organization that won The International 2022 (TI11) with a dominant, methodical run through the event. Their disciplined, strategy-focused approach defined their championship year. Tundra competes in the Western European Dota 2 region.',
    liquipedia: 'https://liquipedia.net/dota2/Tundra_Esports',
  },
  {
    id: 'team-falcons',
    name: 'Team Falcons',
    region: 'WEU',
    basedIn: 'Saudi Arabia',
    tiWins: [],
    shortDesc: 'Saudi Arabia-backed organization competing in the Western European Dota 2 circuit via Gamers8.',
    about: 'Team Falcons is backed by Gamers8, Saudi Arabia\'s major esports investment organization. They compete in the Western European region of the Dota 2 pro circuit and are part of a broader initiative to establish the Middle East as an international esports hub. Gamers8 also organizes the Riyadh Masters, one of the largest prize-pool Dota 2 events.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Falcons',
  },
  {
    id: 'nigma-galaxy',
    name: 'Nigma Galaxy',
    region: 'WEU',
    basedIn: 'Europe',
    tiWins: [],
    shortDesc: 'Western European Dota 2 organization formed in 2020, competing in the Tier 1 circuit.',
    about: 'Nigma Galaxy is a Western European Dota 2 organization formed in 2020, with origins in Team Liquid\'s 2019 competitive roster. The organization competed at the Tier 1 level under the Nigma name before merging branding with Galaxy Racer. They have been a presence in the Western European Dota 2 region across the DPC era.',
    liquipedia: 'https://liquipedia.net/dota2/Nigma_Galaxy',
  },

  // ── Eastern Europe ─────────────────────────────────────────────────────────
  {
    id: 'team-spirit',
    name: 'Team Spirit',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [2021, 2023],
    shortDesc: 'Two-time Dota 2 world champions (TI10 2021, TI12 2023). The most decorated EEU org in Dota 2 history.',
    about: 'Team Spirit is a Russian esports organization that became Dota 2\'s most successful modern dynasty. They won The International 2021 (TI10) as massive underdogs and repeated the achievement at The International 2023 (TI12). Their back-to-back victories make them one of only two organizations ever to win multiple TI titles (alongside OG). Team Spirit competes in the Eastern Europe region of the Dota 2 pro circuit and is the defending two-time world champion.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Spirit',
  },
  {
    id: 'betboom-team',
    name: 'BetBoom Team',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [],
    shortDesc: 'Eastern European Dota 2 organization consistently competing at the Tier 1 level.',
    about: 'BetBoom Team is a Russian esports organization that has established itself as a consistent presence in Tier 1 Eastern European Dota 2 competition, regularly qualifying for and competing at international events including DreamLeague and PGL tournaments.',
    liquipedia: 'https://liquipedia.net/dota2/BetBoom_Team',
  },
  {
    id: 'virtus-pro',
    name: 'Virtus.pro',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [],
    shortDesc: 'One of the oldest and most storied Russian esports organizations, with a long history in Tier 1 Dota 2.',
    about: 'Virtus.pro is one of the oldest esports organizations in Russia and Eastern Europe, with roots going back to the early 2000s. In Dota 2, they have been a consistent Tier 1 Eastern European organization across multiple competitive eras, with appearances at numerous international events and The International qualifiers.',
    liquipedia: 'https://liquipedia.net/dota2/Virtus.pro',
  },

  // ── China ──────────────────────────────────────────────────────────────────
  {
    id: 'xtreme-gaming',
    name: 'Xtreme Gaming',
    region: 'CN',
    basedIn: 'China',
    tiWins: [],
    shortDesc: 'Chinese Dota 2 organization competing at the international Tier 1 level.',
    about: 'Xtreme Gaming is a Chinese esports organization competing in Tier 1 Dota 2. China has historically been one of the strongest Dota 2 regions, and Xtreme Gaming has represented CN at multiple major international events, including DreamLeague and The International.',
    liquipedia: 'https://liquipedia.net/dota2/Xtreme_Gaming',
  },
  {
    id: 'azure-ray',
    name: 'Azure Ray',
    region: 'CN',
    basedIn: 'China',
    tiWins: [],
    shortDesc: 'Chinese Dota 2 organization established in the 2022–2023 competitive season.',
    about: 'Azure Ray is a Chinese Dota 2 organization that emerged during the 2022–2023 competitive season and has since established itself as a Tier 1 CN representative at international events. They compete under the Chinese regional circuit of the Dota 2 pro scene.',
    liquipedia: 'https://liquipedia.net/dota2/Azure_Ray',
  },

  // ── Southeast Asia ─────────────────────────────────────────────────────────
  {
    id: 'talon-esports',
    name: 'Talon Esports',
    region: 'SEA',
    basedIn: 'Thailand',
    tiWins: [],
    shortDesc: 'Southeast Asian esports organization based in Thailand, representing SEA at Tier 1 international events.',
    about: 'Talon Esports is a Bangkok-based esports organization that represents Southeast Asia at the highest level of professional Dota 2. They have been one of the most prominent SEA organizations competing in international Tier 1 events, regularly participating in The International and major Dota 2 tournaments.',
    liquipedia: 'https://liquipedia.net/dota2/Talon_Esports',
  },

  // ── North America ──────────────────────────────────────────────────────────
  {
    id: 'evil-geniuses',
    name: 'Evil Geniuses',
    region: 'NA',
    basedIn: 'United States',
    tiWins: [2015],
    shortDesc: 'The International 2015 (TI5) champions — the first Western organization to win Dota 2\'s world championship.',
    about: 'Evil Geniuses is an iconic North American esports organization with one of the longest histories in professional Dota 2. They won The International 2015 (TI5), becoming the first Western organization to claim Dota 2\'s world championship. Their TI5 victory is a landmark moment in esports history — at the time, the event awarded the largest prize pool ever in esports. Evil Geniuses competes in the North American Dota 2 region.',
    liquipedia: 'https://liquipedia.net/dota2/Evil_Geniuses',
  },
]

export const TIER1_TEAMS_MAP = Object.fromEntries(TIER1_TEAMS.map(t => [t.id, t]))

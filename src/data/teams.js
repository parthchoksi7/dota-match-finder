// Tier 1 Dota 2 organizations — historical facts and identity only.
// See .claude/staleness-checklist.md for what to review and when.
//
// Rules for this file:
//   DO NOT add player rosters or current standings.
//   iconicPlayers: legendary/defining players historically associated with the org.
//     Handles only — no years, no active/former labels.
//
// Sources: Liquipedia (https://liquipedia.net/dota2/)
//          TI history: https://liquipedia.net/dota2/The_International
//
// ⚠ STALE-RISK — about/shortDesc: org identity text. Review annually.
// ⚠ STALE-RISK — iconicPlayers: extend as new legends emerge; never remove past icons.
// ✓ SAFE — tiWins: immutable historical record. Add new entry after each TI concludes.
// ✓ SAFE — basedIn: org HQ. Changes only on major ownership restructuring.
// ✓ SAFE — liquipedia: URL slug. Liquipedia rarely renames org pages.
// ✓ SAFE — disbanded: immutable once set (orgs do not un-disband).

export const TIER1_TEAMS = [
  {
    id: 'og',
    name: 'OG',
    region: 'WEU',
    basedIn: 'Europe',
    tiWins: [2018, 2019],
    iconicPlayers: ['N0tail', 'Fly', 'ana', 'Topson', 'Ceb'],
    shortDesc: 'The first team to win back-to-back Internationals. Two-time TI champions.',
    about: 'OG was founded on October 31, 2015, emerging from the roster of (monkey) Business. They won the Frankfurt Major in their debut tournament, defeating TI5 champions Evil Geniuses in the grand final. After winning the Kiev Major in 2017, OG became the first team in Dota 2 history to win four Dota Major Championships. At TI8 (2018), OG became the first team to win The International from the open qualifiers. They defended their title at TI9 (2019), becoming the first back-to-back TI champions in the game\'s history.',
    liquipedia: 'https://liquipedia.net/dota2/OG',
  },
  {
    id: 'team-liquid',
    name: 'Team Liquid',
    region: 'WEU',
    basedIn: 'Netherlands',
    tiWins: [2017, 2024],
    iconicPlayers: ['KuroKy', 'Miracle-', 'MATUMBAMAN', 'GH', 'MinD_ContRoL'],
    shortDesc: 'Two-time TI champions. The first organization to win The International with two different rosters.',
    about: 'Team Liquid was founded in 2000 in the Netherlands and established its Dota 2 division in December 2012. The organization won The International 2017 with a roster led by KuroKy, Miracle-, MATUMBAMAN, GH, and MinD_ContRoL. In 2024, a rebuilt roster led by miCKe and Nisha captured The International 2024. Team Liquid is the first organization to win The International with two entirely different rosters.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Liquid',
  },
  {
    id: 'team-spirit',
    name: 'Team Spirit',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [2021, 2023],
    iconicPlayers: ['Yatoro', 'Collapse', 'TORONTOTOKYO', 'Miposhka', 'Mira'],
    shortDesc: 'Two-time TI champions from Eastern Europe. The second team after OG to win multiple Internationals.',
    about: 'Team Spirit was founded in December 2015 in Russia. The organization transformed in late 2020 with a young roster featuring Yatoro, Collapse, TORONTOTOKYO, and Miposhka under coach Silent. This squad won The International 2021 as underdogs, becoming the second Eastern European organization to win TI after Natus Vincere. Team Spirit captured their second International title in 2023, becoming the second team after OG to win two TIs.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Spirit',
  },
  {
    id: 'tundra-esports',
    name: 'Tundra Esports',
    region: 'WEU',
    disbanded: true,
    basedIn: 'United Kingdom',
    tiWins: [2022],
    iconicPlayers: ['skiter', 'Nine', '33', 'Saksa', 'Sneyking'],
    shortDesc: 'The International 2022 champions. Exited competitive Dota 2 in June 2026, with their entire roster transferring to 1win.',
    about: 'Tundra Esports was founded on January 25, 2021, based in London, United Kingdom. The organization entered competitive Dota 2 by acquiring the mudgolems roster. Their defining moment came at The International 2022, where they dropped only one game across the entire playoff stage before defeating Team Secret 3-0 in the Grand Final to claim the TI11 championship. On June 1, 2026, Tundra announced their exit from competitive Dota 2, transferring their entire active roster and coaching staff to 1win — including their TI 2026 direct invite.',
    liquipedia: 'https://liquipedia.net/dota2/Tundra_Esports',
  },
  {
    id: '1win',
    name: '1win Team',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [],
    iconicPlayers: [],
    shortDesc: 'Russian Dota 2 organization that signed the full Tundra Esports roster in June 2026, inheriting their TI 2026 direct invite.',
    about: '1win entered competitive Dota 2 in February 2024. On June 1, 2026, the organization signed the full Tundra Esports lineup along with their TI 2026 direct invite, following Tundra\'s exit from the scene. The acquisition made 1win Team the home of one of the most tournament-decorated rosters of the 2025–2026 era, with the squad bootcamping in Belgrade ahead of the Esports World Cup and The International 2026. Due to Valve regulations prohibiting multiple affiliated teams in official tournaments, the previous 1win Dota 2 squad departed to compete independently.',
    liquipedia: 'https://liquipedia.net/dota2/1win_Team',
  },
  {
    id: 'team-falcons',
    name: 'Team Falcons',
    region: 'WEU',
    basedIn: 'Saudi Arabia',
    tiWins: [2025],
    iconicPlayers: ['skiter', 'Malr1ne', 'ATF', 'Cr1t-', 'Sneyking'],
    shortDesc: 'The International 2025 champions. Entered Dota 2 in 2023 and won TI within two years.',
    about: 'Team Falcons is a Saudi Arabian esports organization founded in 2017 that entered Dota 2 in November 2023. The team won DreamLeague Season 22, 23, and 24 consecutively before claiming The International 2025, defeating Xtreme Gaming 3-2 in the Grand Final. They became TI champions less than two years after entering the Dota 2 competitive scene.',
    liquipedia: 'https://liquipedia.net/dota2/Team_Falcons',
  },
  {
    id: 'evil-geniuses',
    name: 'Evil Geniuses',
    region: 'NA',
    disbanded: true,
    basedIn: 'United States',
    tiWins: [2015],
    iconicPlayers: ['Fear', 'SumaiL', 'UNiVeRsE', 'ppd', 'Arteezy'],
    shortDesc: 'The International 2015 champions. The first North American organization to win The International. Dota 2 division disbanded in November 2023.',
    about: 'Evil Geniuses established their Dota 2 division in October 2011. They became the first North American organization to win The International, claiming TI5 in 2015 with a roster of Fear, ppd, Arteezy, UNiVeRsE, and SumaiL. The organization was a consistent Tier 1 presence for over a decade. Evil Geniuses disbanded their Dota 2 division in November 2023.',
    liquipedia: 'https://liquipedia.net/dota2/Evil_Geniuses',
  },
  {
    id: 'nigma-galaxy',
    name: 'Nigma Galaxy',
    region: 'WEU',
    basedIn: 'United Arab Emirates',
    tiWins: [],
    iconicPlayers: ['Miracle-', 'KuroKy', 'GH', 'MinD_ContRoL', 'w33'],
    shortDesc: 'Founded in 2019 by four members of Team Liquid\'s The International 2017 championship roster.',
    about: 'Nigma Galaxy was founded on November 25, 2019, by four members of Team Liquid\'s The International 2017 championship squad: KuroKy, Miracle-, GH, and MinD_ContRoL. The organization merged with Galaxy Racer\'s competitive division in September 2021, adopting the Nigma Galaxy name. The team competed at The International 2025, finishing 5th–6th place.',
    liquipedia: 'https://liquipedia.net/dota2/Nigma_Galaxy',
  },
  {
    id: 'betboom-team',
    name: 'BetBoom Team',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [],
    iconicPlayers: ['save-', 'gpk', 'TORONTOTOKYO', 'Nightfall', 'SoNNeikO'],
    shortDesc: 'Russian Dota 2 organization established in 2022, competing consistently in Tier 1 international events.',
    about: 'BetBoom Team was established in April 2022 by acquiring the former Winstrike roster. The squad was rebuilt around captain save-, gpk, and TORONTOTOKYO, establishing itself as a CIS region contender. The team claimed the BLAST Slam I title in 2024 and has competed consistently across DreamLeague, ESL, and PGL circuits.',
    liquipedia: 'https://liquipedia.net/dota2/BetBoom_Team',
  },
  {
    id: 'virtus-pro',
    name: 'Virtus.pro',
    region: 'EEU',
    basedIn: 'Russia',
    tiWins: [],
    iconicPlayers: ['No[o]ne', 'RAMZES666', 'Solo', '9pasha', 'RodjER'],
    shortDesc: 'Russian esports institution in Dota 2 since 2012. Won five major championships in 2017–2018.',
    about: 'Virtus.pro entered Dota 2 in 2012 and has competed at the top level across multiple eras. The team\'s most dominant period was 2017–2018, during which they won five major championships including ESL One Hamburg 2017, The Bucharest Major, ESL One Birmingham 2018, and The Kuala Lumpur Major. The organization is now headquartered in Armenia and continues to compete internationally.',
    liquipedia: 'https://liquipedia.net/dota2/Virtus.pro',
  },
  {
    id: 'xtreme-gaming',
    name: 'Xtreme Gaming',
    region: 'CN',
    basedIn: 'China',
    tiWins: [],
    iconicPlayers: ['Ame', 'Xm', 'XinQ', 'Xxs'],
    shortDesc: 'Chinese Dota 2 organization and The International 2025 runners-up.',
    about: 'Xtreme Gaming was founded in January 2021 and is based in China. The team went 4-0 in the group stage at The International 2025, claiming the top playoff seed, before falling to Team Falcons 2-3 in the Grand Final. They represent China\'s competitive Dota 2 scene alongside victories at the Elite League Season 1 (2024) and other international events.',
    liquipedia: 'https://liquipedia.net/dota2/Xtreme_Gaming',
  },
]

export const TIER1_TEAMS_MAP = Object.fromEntries(TIER1_TEAMS.map(t => [t.id, t]))

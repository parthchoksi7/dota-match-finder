// Editorial articles — one entry per published piece.
// Add new articles to the front of the array (newest first).
// Each article is reviewed and approved before being added here.

export const ARTICLES = [
  {
    slug: 'blast-slam-vii-lcq-preview',
    title: 'Six Teams, Two Copenhagen Spots: Inside the BLAST Slam VII Last Chance Qualifier',
    subtitle: 'Team Liquid won this tournament six months ago. Tomorrow they play a qualifier just to reach the LAN.',
    publishedAt: '2026-05-29',
    tournament: 'blast-slam-vii',
    tournamentLabel: 'BLAST Slam VII',
    category: 'Preview',
    readingTime: 4,
    watchQuery: 'blast slam',
    watchLabel: 'Watch LCQ VODs on Spectate',
    excerpt: 'LGD Gaming won the group. Falcons finished fourth. The defending BLAST Slam VI champions are in the Last Chance Qualifier. Everything you need to know before tomorrow.',
    sections: [
      {
        type: 'paragraph',
        text: 'LGD Gaming won the BLAST Slam VII group stage. The Chinese team, who entered through regional qualifiers, finished 8-3 — ahead of PARIVISION, ahead of Team Falcons, ahead of everyone. The team most people were not discussing at the start of the week topped the field.',
      },
      {
        type: 'paragraph',
        text: 'Team Falcons, the defending TI14 world champions, finished fourth. They go to the Upper Bracket Quarterfinals in Copenhagen instead of straight to the semifinals — a meaningful difference in bracket advantage. The group stage produced results that nobody had pencilled in.',
      },
      {
        type: 'paragraph',
        text: 'Six teams did not make it through directly. Tomorrow, May 30, they play for their tournament lives.',
      },
      {
        type: 'heading',
        text: 'What Is the Last Chance Qualifier?',
      },
      {
        type: 'paragraph',
        text: 'Six teams. Two spots. All matches are Bo3. Win and you\'re heading to Copenhagen. Lose, and BLAST Slam VII is over before the LAN begins.',
      },
      {
        type: 'paragraph',
        text: 'The two teams who advance go directly to the Upper Bracket Quarterfinals at BLAST Studios Copenhagen, joining the four direct qualifiers from the group stage. Everyone else goes home.',
      },
      {
        type: 'paragraph',
        text: 'Bo3 changes everything. The group stage was Bo1 — one game, one result, move on. A single bad draft ended your day. Tomorrow, teams get to adapt. Captains can respond and correct. Teams that looked inconsistent through the week have a real chance to reset. Teams that survive Round 1 face Round 2 already battle-hardened.',
      },
      {
        type: 'heading',
        text: 'The Bracket',
      },
      {
        type: 'paragraph',
        text: 'LCQ Round 1: Team Spirit vs. OG, Aurora Gaming vs. Tundra Esports. Winners advance to Round 2. LCQ Round 2: Team Yandex vs. Round 1 winner, Team Liquid vs. Round 1 winner. Top two from Round 2 reach Copenhagen.',
      },
      {
        type: 'heading',
        text: 'The Biggest Story: Team Liquid',
      },
      {
        type: 'paragraph',
        text: 'Six months ago, Team Liquid defeated Natus Vincere in the BLAST Slam VI grand final in Malta. They were the best team in the world that week.',
      },
      {
        type: 'paragraph',
        text: 'Tomorrow they play a Bo3 qualifier to reach the LAN stage of the same tournament.',
      },
      {
        type: 'paragraph',
        text: 'Liquid finished sixth at 6-5. Four teams went directly to Copenhagen. Liquid and Yandex go through Round 2 of the LCQ. Win and the defending champions reach the LAN. Lose and they go home.',
      },
      {
        type: 'paragraph',
        text: 'That is not a storyline. That is a possible reality.',
      },
      {
        type: 'paragraph',
        text: 'Defending champion eliminations happen in Dota. But rarely this quietly, this early. If Liquid win tomorrow, the Copenhagen narrative writes itself — the champions fought their way back from the edge. If they lose, it becomes one of the steepest falls a BLAST champion has taken.',
      },
      {
        type: 'heading',
        text: "Team Spirit's Fight",
      },
      {
        type: 'paragraph',
        text: 'Spirit finished eighth at 5-6 and face OG in Round 1. They came into this tournament after a last-minute roster change — swapping Panto for notme before DreamLeague Season 29, where they finished third. That result raised expectations for BLAST Slam VII. The group stage did not deliver on them.',
      },
      {
        type: 'paragraph',
        text: 'OG are a dangerous Round 1 opponent — a team with deep institutional experience at high-pressure formats who underperformed their pedigree this tournament and will be motivated tomorrow. Spirit need to show that the DreamLeague result was a sign of something real, not a ceiling they have already reached.',
      },
      {
        type: 'heading',
        text: 'What to Watch',
      },
      {
        type: 'paragraph',
        text: 'Aurora vs Tundra in Round 1 is the bracket\'s quieter match — two teams with LAN ambitions and nothing left to lose. Both play aggressive, forward Dota and a three-game series between them will be contested from the first draft.',
      },
      {
        type: 'paragraph',
        text: 'Spirit vs OG is Round 1\'s headline match. Two experienced rosters, two teams who expected more from this week, one Bo3 to decide who gets another day.',
      },
      {
        type: 'paragraph',
        text: 'Watch Round 2 for Liquid. Their series will tell you whether this team still has championship-level conviction.',
      },
      {
        type: 'paragraph',
        text: 'The LCQ is tomorrow. Two spots available. Six teams want them.',
      },
    ],
  },
  // Article removed — Yandex dropped to 3rd (6-3) after group stage Day 4;
  // "Nobody predicted Yandex would lead" was no longer accurate.
  // New article will cover the final group stage standings.
  /*
  {
    slug: 'team-yandex-blast-slam-vii-dark-horse',
    title: 'Nobody Predicted Team Yandex Would Lead BLAST Slam VII',
    subtitle: "Here's Why They Might Actually Win This Thing",
    publishedAt: '2026-05-28',
    tournament: 'blast-slam-vii',
    tournamentLabel: 'BLAST Slam VII',
    category: 'Analysis',
    readingTime: 4,
    excerpt:
      "Team Yandex added their offlaner four days before the tournament started. They're tied for first. This is the story nobody is covering.",
    sections: [
      {
        type: 'paragraph',
        text: 'When the BLAST Slam VII group stage began on Tuesday, the conversation was about three teams: Team Falcons (the defending world champions), PARIVISION (DreamLeague Season 29 winners), and the lingering question of whether Team Liquid could reverse a worrying slide from their BLAST Slam VI title. Nobody was talking about Team Yandex.',
      },
      {
        type: 'paragraph',
        text: 'Seventy-two hours later, Yandex are tied for first place at 5–1 alongside Falcons — sitting above PARIVISION and ahead of everyone else. They are, right now, one of the two best teams at this tournament.',
      },
      {
        type: 'paragraph',
        text: 'There is a reason this is surprising. On May 24 — four days before the first match — Team Yandex announced a roster change. They added Dmitry "DM" Dorokhin as their offlaner. Not a reshuffle. Not a standby. A new player, four days out. Teams don\'t do that without a reason. The fact that they did, and are currently leading the group stage, tells you something about this roster.',
      },
      {
        type: 'heading',
        text: 'Who Is Team Yandex?',
      },
      {
        type: 'paragraph',
        text: "If you haven't been following the EEU circuit closely, Yandex may read as a corporate newcomer. The reality is more interesting. Yandex entered Dota 2 in June 2025 by acquiring the Cyber Goose roster — a team that had been building quietly in the EEU region. Yandex is best known outside Dota as Russia's dominant search engine and technology conglomerate, but their entry into esports was not ornamental. They wanted to win.",
      },
      {
        type: 'paragraph',
        text: 'The team they built reflects that. Ranked second globally out of 118 tracked teams entering this tournament, they came off a first-place finish at PGL Wallachia Season 7 — a $300,000 win against top competition. These are not credentials you manufacture. They earned them.',
      },
      {
        type: 'heading',
        text: 'The Roster',
      },
      {
        type: 'paragraph',
        text: 'The most unusual thing about Yandex is their squad construction. The lineup features Saksa — a veteran Finnish support player who has competed at the highest level of Dota 2 for nearly a decade. Saksa is the kind of player you build team chemistry around: experienced, studied, capable of making in-game calls under pressure.',
      },
      {
        type: 'paragraph',
        text: "Surrounding him are watson and Malady, both ex-Gaimin Gladiators players from Kazakhstan, who bring experience from one of the more disciplined Western European team structures in recent memory. CHIRA_JUNIOR rounds out the lineup.",
      },
      {
        type: 'paragraph',
        text: "And then there's DM — who arrived on May 24 and, apparently, slotted right in.",
      },
      {
        type: 'heading',
        text: 'What Is Happening in the Group Stage',
      },
      {
        type: 'paragraph',
        text: "BLAST Slam VII's group stage is a Bo1 round robin. Every match is a coin flip in format, and with no ability to adapt between games, cohesion matters more than innovation. The team that executes their own strategy most cleanly tends to rise.",
      },
      {
        type: 'paragraph',
        text: "What Yandex appear to be doing is exactly that: executing. They are 5–1 in a field that includes the defending world champions. They added a new offlaner four days ago. Either they had exceptional pre-existing chemistry, or DM's individual quality is high enough that minimal preparation was enough. Both possibilities reflect well on this team.",
      },
      {
        type: 'paragraph',
        text: "The group stage ends Friday. The top two seeds go directly to the Copenhagen semifinals. Yandex are currently in that position. If they hold it, they walk into BLAST Studios on June 4 as one of the favorites.",
      },
      {
        type: 'heading',
        text: 'What a Win Would Mean',
      },
      {
        type: 'paragraph',
        text: "If Team Yandex leave Copenhagen as BLAST Slam VII champions, it would be a statement about the state of the EEU region post-TI era. A Russian tech-backed team with a multinational roster — veterans from Western European orgs, CIS-origin players, a Finnish anchor — defeating Falcons and PARIVISION in their current form would constitute a genuine tier-one win at a $1M tournament.",
      },
      {
        type: 'paragraph',
        text: "It would also validate what this organization has been building. The PGL Wallachia win showed they could win. BLAST Slam VII will show whether they can do it on the biggest stages. Copenhagen starts June 4.",
      },
      {
        type: 'paragraph',
        text: 'They are worth watching before then.',
      },
    ],
  },
  */
]

export const ARTICLES_MAP = Object.fromEntries(ARTICLES.map(a => [a.slug, a]))

// Articles grouped by tournament slug
export function getArticlesByTournament(tournamentSlug) {
  return ARTICLES.filter(a => a.tournament === tournamentSlug)
}

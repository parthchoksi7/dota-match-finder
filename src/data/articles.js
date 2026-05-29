// Editorial articles — one entry per published piece.
// Add new articles to the front of the array (newest first).
// Each article is reviewed and approved before being added here.

export const ARTICLES = [
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
]

export const ARTICLES_MAP = Object.fromEntries(ARTICLES.map(a => [a.slug, a]))

// Articles grouped by tournament slug
export function getArticlesByTournament(tournamentSlug) {
  return ARTICLES.filter(a => a.tournament === tournamentSlug)
}

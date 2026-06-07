/**
 * One-shot publish script for the 7.41d BLAST Slam VII patch analysis article.
 * Run: node scripts/publish-patch-article.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'blast-slam-vii-741d-patch-analysis',
  title: 'The Earthquake in Copenhagen',
  subtitle: 'Patch 7.41d landed mid-tournament. Three days later, here is what the data actually shows happened — and what it means for tomorrow\'s Grand Final.',
  publishedAt: '2026-06-06',
  tournament: 'blast-slam-vii',
  tournamentLabel: 'BLAST Slam VII',
  category: 'Analysis',
  readingTime: 8,
  watchQuery: 'blast slam',
  watchLabel: 'Watch BLAST Slam VII on Spectate',
  excerpt: 'Valve dropped patch 7.41d the night before playoffs. LGD survived 111 minutes in the lower bracket. Yandex solved the meta cleanest. Here is the full data analysis of every hero pick before and after the patch — and what it means for tomorrow\'s Grand Final.',
  sections: [
    {
      type: 'paragraph',
      text: 'Somewhere in Copenhagen on the night of June 4th, Dota 2 coaches were awake at their laptops running draft simulations they\'d never practiced. Not because their players had underperformed. Not because their reads were wrong. Because Valve dropped patch 7.41d — and the game they\'d spent weeks preparing for no longer existed.',
    },
    {
      type: 'paragraph',
      text: 'BLAST Slam VII had a clear meta story coming out of the group stage. Clockwerk was contested in nearly every match, finishing with a 67% win rate across 63 games. Lone Druid was banned in 92% of series before it could ever become a problem. LGD Gaming read all of it perfectly — an 8-3 record, first seed, the best performance in the building. They arrived in Copenhagen looking like a team that had solved the tournament.',
    },
    {
      type: 'paragraph',
      text: 'Then the patch dropped. Clockwerk, Kez, Hoodwink, Invoker, Tiny. The exact heroes that defined the group stage — all nerfed, some significantly. The playbook got torn up overnight. Three days later, here is what the data actually shows happened.',
    },
    {
      type: 'heading',
      text: 'What the Numbers Say: A Meta Turned Inside Out',
    },
    {
      type: 'paragraph',
      text: 'The analysis below is based on 63 group stage matches played on patch 7.41c (May 26–29) and 21 playoff matches played on patch 7.41d (June 4–6). All data sourced from OpenDota, league ID 19101.',
    },
    {
      type: 'paragraph',
      text: 'Clockwerk: group stage 67% win rate, 18 picks and 45 bans — a near-100% contest rate. Post-patch in the playoffs: still 62% win rate, 8 picks, 9 bans. The nerf was real, but the structural value didn\'t evaporate. Teams are still contesting it in nearly every series.',
    },
    {
      type: 'paragraph',
      text: 'Hoodwink was the most-picked hero in the group stage — 27 picks — but at only a 30% win rate. Post-patch it dropped to 9 picks at 44% win rate. The nerf didn\'t kill Hoodwink; it killed the bad Hoodwink picks. Teams stopped panic-drafting it, and the ones who picked it with specific intent started winning with it more often.',
    },
    {
      type: 'paragraph',
      text: 'Puck is the story nobody expected. Banned in 37 of 63 group stage matches — teams treated it as untouchable. Patch 7.41d didn\'t touch Puck at all. But it freed up the ban slots that were locked onto Clockwerk, Kez, and Hoodwink. The result: 7 picks in the playoffs at a 71% win rate. The best-performing flex hero at this tournament is one that wasn\'t even in the patch notes.',
    },
    {
      type: 'paragraph',
      text: 'Axe collapsed entirely. Group stage: 58% win rate, 19 picks — solid and reliable. Post-patch: 20% win rate across 5 picks. Every team that drafted it without the precise support structure lost. Windranger followed a similar path: 36% win rate in groups became 22% in the playoffs. Both heroes were overvalued in the 7.41c meta and the patch stripped away the conditions that made them viable.',
    },
    {
      type: 'heading',
      text: 'The Heroes Nobody Expected',
    },
    {
      type: 'paragraph',
      text: 'The two most surprising data points from the playoffs are Treant Protector and Ember Spirit — both nerfed in 7.41d, both winning at 83% in the playoffs.',
    },
    {
      type: 'paragraph',
      text: 'Treant Protector in the group stage was a persistent disappointment: 16 picks at only 31% win rate. Teams kept reaching for it and kept losing. The post-patch shift isn\'t about the hero getting better in isolation — it\'s about a playoff environment with fewer dominant supports crowding the draft. BetBoom Team identified this first. Their system built around Treant Protector plus Undying — sustained aura pressure — won them the Upper Bracket Semifinal against Team Falcons 2-0 and pushed Team Yandex to three games in the UB Final.',
    },
    {
      type: 'paragraph',
      text: 'Ember Spirit is the stranger case. Nerfed. Still being banned 11 times in 21 playoff games. And yet the six times it made it through, the drafting team won five of them. The fear is justified. Teams found the meta conditions where it thrives, and when it got through, it delivered.',
    },
    {
      type: 'heading',
      text: 'The Bane Story Nobody Told',
    },
    {
      type: 'paragraph',
      text: 'The narrative you\'ll read elsewhere is that Bane "disappeared" from the playoff meta after dominating groups with a 67% win rate on 21 picks. That\'s wrong.',
    },
    {
      type: 'paragraph',
      text: 'In the group stage, teams were too consumed banning Clockwerk, Kez, and Lone Druid to spend a ban on Bane. It slipped through constantly and won 67% of the time. When the patch freed those ban slots in the playoffs, teams immediately redirected them at Bane. Its ban rate went from 27% in groups to 61% in the playoffs — more than doubled. When Bane did make it through, it won at 80%.',
    },
    {
      type: 'paragraph',
      text: 'The hero didn\'t get worse. Teams finally had the bandwidth to respect it. And in the biggest moment of today\'s lower bracket — a deciding Game 3 that ran for 111 minutes — LGD Gaming picked Bane as their cornerstone. It held the line for an hour and fifty-one minutes. LGD survived.',
    },
    {
      type: 'heading',
      text: 'Today\'s Results: What Actually Happened',
    },
    {
      type: 'subheading',
      text: 'Upper Bracket Final — Team Yandex 2-1 BetBoom Team',
    },
    {
      type: 'paragraph',
      text: 'The pattern across this series was plain. Every time Yandex ran their system — Treant Protector anchoring, Snapfire providing sustained teamfight presence, Invoker enabling flexible mid pressure — they won. In Game 3, they added Enigma for a full five-man combination and closed the series. BetBoom\'s losses in Games 2 and 3 came with Clockwerk and Axe in their drafts — two heroes losing at high rates in this playoff meta. Yandex\'s system had answers for both.',
    },
    {
      type: 'paragraph',
      text: 'Team Yandex entered this tournament through the Last Chance Qualifier. They barely made the playoffs. They have now beaten the group stage first seed (LGD, 3 games) and the Upper Bracket Semifinalist (BetBoom, 3 games) back to back. They are in the Grand Final, rested, and they know exactly what they want to draft.',
    },
    {
      type: 'subheading',
      text: 'Lower Bracket Semifinal — LGD Gaming 2-1 Aurora Gaming',
    },
    {
      type: 'paragraph',
      text: 'Game 1 was Aurora at their best. They got Lone Druid through — the most-banned hero at this event — and paired it with Phoenix and Ember Spirit. LGD\'s response was a scattered draft with Techies that never found its footing. Aurora won in 50 minutes and looked like a team that had finally cracked the post-patch meta.',
    },
    {
      type: 'paragraph',
      text: 'LGD changed everything in Game 2. They abandoned every familiar hero and drafted physical brawlers — Axe, Batrider, Viper, Sven with Grimstroke lockdown. The exact hero that had been losing all tournament. They won in 49 minutes. Aurora had no prepared read on that style.',
    },
    {
      type: 'paragraph',
      text: 'Game 3 ran 111 minutes. LGD drafted an ultra-late defensive system: Bane, Grimstroke, Beastmaster, Zeus, Vengeful Spirit. Built to never lose a single fight. Only to stall, defend, and grind. Aurora came with Windranger — a hero sitting at 22% win rate in these playoffs — and tried to break through for nearly two hours. They couldn\'t. LGD are through.',
    },
    {
      type: 'heading',
      text: 'Tomorrow: Lower Bracket Final and Grand Final',
    },
    {
      type: 'subheading',
      text: 'Lower Bracket Final — BetBoom Team vs LGD Gaming — 11:00 CEST',
    },
    {
      type: 'paragraph',
      text: 'BetBoom has more rest. LGD just played 111 minutes under elimination pressure. That gap is real. But LGD carries something BetBoom doesn\'t: proven draft range across three completely different compositions in a single series — experimental (loss), physical brawl (win), ultra-late marathon (win).',
    },
    {
      type: 'paragraph',
      text: 'BetBoom\'s system is coherent and battle-tested: Treant Protector plus Undying creates unkillable front-lines, Lone Druid scales into a two-hero carry threat. The draft battle comes down to whether LGD can suppress both Lone Druid and Treant simultaneously while BetBoom tries to ban away Puck, Bane, and Timbersaw — LGD\'s three strongest remaining options. Neither team can ban everything they need to. The first three picks will define the series.',
    },
    {
      type: 'subheading',
      text: 'Grand Final — Team Yandex vs LB Winner — 15:00 CEST',
    },
    {
      type: 'paragraph',
      text: 'Yandex are rested. They know exactly what they want. Their Treant plus Snapfire plus Invoker system has won every decisive game it has been deployed in at this tournament. The LB finalist — whoever it is — will arrive having played two full series in the last 36 hours against an opponent that has been sitting and preparing.',
    },
    {
      type: 'paragraph',
      text: 'BetBoom already lost to Yandex\'s system 1-2 and will arrive knowing exactly what to prepare for. LGD have never faced it in these playoffs. The unknown opponent may carry a different edge. Either way, Treant Protector at 83% win rate in this playoff bracket is the single most important ban decision of the Grand Final. If Yandex gets Treant plus Invoker without early ban pressure, it could be a short series.',
    },
    {
      type: 'heading',
      text: 'The Tournament Ends Tomorrow',
    },
    {
      type: 'paragraph',
      text: 'Three days ago a meta shift landed in the middle of a million-dollar LAN. The teams that adapted won. The teams that couldn\'t went home. Team Yandex solved it cleanest. LGD Gaming survived through draft range and 111 minutes of grit. BetBoom built a coherent system and pushed the best team in the field to their limit. Aurora Gaming played the same losing hero in their final game as they had all week.',
    },
    {
      type: 'paragraph',
      text: 'Every remaining match tomorrow has a specific story attached to it. The Grand Final is one day away. The window closes at 15:00 CEST on June 7th. If you are watching any Dota 2 this weekend, it has to be now.',
    },
  ],
}

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log(`✓ Published: ${url}`)

  console.log('Updating metadata files (llms.txt + sitemap)...')
  const sha = await updateMetadataFiles(article)
  console.log(`✓ Metadata committed: ${sha}`)

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

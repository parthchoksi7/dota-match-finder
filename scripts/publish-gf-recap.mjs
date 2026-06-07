/**
 * One-shot publish script for the BLAST Slam VII Grand Finals recap.
 *
 * Prerequisites — run once in Supabase SQL editor before executing:
 *   ALTER TABLE articles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
 *
 * Run: node scripts/publish-gf-recap.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, postXTweet, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'blast-slam-vii-grand-finals-recap',
  title: 'They Came Through the Back Door. They Left As Champions.',
  subtitle: 'Team Yandex won BLAST Slam VII 3-1 over LGD Gaming. The complete story of a tournament nobody predicted correctly.',
  publishedAt: '2026-06-07',
  expiresAt: '2026-06-08',
  tournament: 'blast-slam-vii',
  tournamentLabel: 'BLAST Slam VII',
  category: 'Analysis',
  readingTime: 9,
  watchQuery: 'blast slam',
  watchLabel: 'Watch BLAST Slam VII on Spectate',
  excerpt: 'Team Yandex entered BLAST Slam VII through the Last Chance Qualifier. They beat the group stage leaders twice. The TI14 world champions went home in the lower bracket. LGD ran the full lower bracket in 48 hours including a 111-minute game. Yandex won the Grand Final 3-1. This is the complete story.',
  sections: [
    {
      type: 'paragraph',
      text: 'Team Yandex entered BLAST Slam VII through the Last Chance Qualifier. They won the Grand Final 3-1 against LGD Gaming. The space between those two facts contains every match you watched this week, every upset nobody predicted, and one of the most complete tournament performances professional Dota 2 has produced in 2026.',
    },
    {
      type: 'heading',
      text: 'The Bracket, Told Plainly',
    },
    {
      type: 'paragraph',
      text: 'Eight teams opened the Copenhagen LAN on June 4. Here is what happened to them.',
    },
    {
      type: 'subheading',
      text: 'Upper Bracket Quarterfinals',
    },
    {
      type: 'paragraph',
      text: 'Team Yandex beat Aurora Gaming 2-0 — an authoritative opening statement from a team that had, two days earlier, been fighting in the Last Chance Qualifier just to be there. Team Falcons beat Team Liquid 2-0, ending the BLAST Slam VI defending champions\' tournament at the first hurdle of the LAN they had won six months ago.',
    },
    {
      type: 'subheading',
      text: 'Upper Bracket Semifinals',
    },
    {
      type: 'paragraph',
      text: 'Yandex beat LGD Gaming 2-1, ending the group stage first seed\'s direct path to the Grand Final. BetBoom Team swept Team Falcons 2-0 — the world champions were in the lower bracket.',
    },
    {
      type: 'subheading',
      text: 'Upper Bracket Final',
    },
    {
      type: 'paragraph',
      text: 'Yandex beat BetBoom 2-1. A Grand Final spot secured. A full day to prepare.',
    },
    {
      type: 'subheading',
      text: 'Lower Bracket',
    },
    {
      type: 'paragraph',
      text: 'Aurora beat Falcons 2-1, eliminating the TI14 world champions. LGD swept Liquid 2-0. LGD beat Aurora 2-1 in a 111-minute deciding game. LGD beat BetBoom 2-1 in the Lower Bracket Final.',
    },
    {
      type: 'subheading',
      text: 'Grand Final',
    },
    {
      type: 'paragraph',
      text: 'Team Yandex 3-1 LGD Gaming. Team Yandex are BLAST Slam VII champions.',
    },
    {
      type: 'heading',
      text: 'The World Champions Went Home Early',
    },
    {
      type: 'paragraph',
      text: 'The story that defined this tournament\'s lower bracket begins with Team Falcons.',
    },
    {
      type: 'paragraph',
      text: 'Falcons arrived in Copenhagen as TI14 world champions — but not with their full roster. Their starting mid, Malr1ne, had his visa denied in time to travel. For the entire LAN, Falcons played with Syed "SumaiL" Hassan as standin: a TI5 champion and one of the most decorated mid players in the history of the game. It was the tournament\'s second visa casualty after PARIVISION\'s exit before the bracket began, and it meant the defending world champions took the stage without the player they had built their mid-game identity around.',
    },
    {
      type: 'paragraph',
      text: 'With SumaiL, Falcons finished fourth in the group stage. They beat Team Liquid 2-0 in the upper bracket quarterfinals. The circumstances were difficult, but the results were there — right up until they weren\'t.',
    },
    {
      type: 'paragraph',
      text: 'Then BetBoom Team swept them 2-0 in the upper bracket semifinal. Falcons dropped to the lower bracket, one series from elimination at a tournament they were supposed to contend for.',
    },
    {
      type: 'paragraph',
      text: 'Aurora Gaming was waiting. Aurora — who had arrived in Copenhagen through the Last Chance Qualifier, who had beaten Tundra Esports and Team Liquid just to earn the right to be there — won 2-1. The TI14 world champions were eliminated in the lower bracket quarterfinals by one of the two LCQ qualifiers in the field.',
    },
    {
      type: 'paragraph',
      text: 'That result mattered beyond its scoreline. Aurora used the momentum to reach the Lower Bracket Semifinal, where they pushed LGD to a 111-minute deciding game. LGD used that 111-minute game to arrive at the Grand Final with proven strategic range. Every chain in the lower bracket runs through Aurora beating Falcons.',
    },
    {
      type: 'heading',
      text: "LGD's Lower Bracket Run",
    },
    {
      type: 'paragraph',
      text: 'After losing the upper bracket semifinal to Yandex, LGD Gaming had a clear and brutal path: win four consecutive elimination series or go home.',
    },
    {
      type: 'paragraph',
      text: 'They won four consecutive elimination series.',
    },
    {
      type: 'paragraph',
      text: 'LGD swept Team Liquid 2-0 in the lower bracket quarterfinals — a clean result against a team that, through a chain of visa complications and Neustadtl tiebreakers, had been given a second chance at the tournament they were originally eliminated from.',
    },
    {
      type: 'paragraph',
      text: 'Then came Aurora. The lower bracket semifinal\'s deciding game ran 111 minutes — the longest match of the entire event. LGD\'s approach was patient and methodical: TaiLung\'s Zeus built three Divine Rapiers and an economic foundation so lopsided that a nearly even kill count became irrelevant. Aurora killed LGD 46 times. LGD killed Aurora 45 times. LGD\'s net worth advantage stood at approximately 71,000 gold. Aurora fought for nearly two hours and left with nothing. It was the most strategically absorbing match of the Copenhagen LAN.',
    },
    {
      type: 'paragraph',
      text: 'Then LGD beat BetBoom 2-1 in the Lower Bracket Final. BetBoom had swept the world champions and pushed Yandex to three games in the UB Final. LGD won anyway.',
    },
    {
      type: 'paragraph',
      text: 'By the time LGD reached the Grand Final, they had demonstrated more strategic range than any team in the field: experimental chaos drafts, physical brawl compositions, and an ultra-late economic patience game — all deployed under elimination pressure within 48 hours. It was one of the most demanding lower bracket runs at a $1M LAN in recent Dota history.',
    },
    {
      type: 'heading',
      text: 'The Grand Final',
    },
    {
      type: 'paragraph',
      text: 'Team Yandex entered the Grand Final with structural advantages that the bracket had been building since the upper bracket semifinal.',
    },
    {
      type: 'paragraph',
      text: 'They had been sitting for a full day while LGD played two back-to-back elimination series. They had watched LGD\'s entire strategic range unfold in real time — the Zeus ultra-late game, the response to BetBoom\'s system, the exact conditions under which LGD won and lost each game. Yandex prepared for one specific opponent with complete information. LGD prepared for the same opponent while also playing the most demanding schedule in the field.',
    },
    {
      type: 'paragraph',
      text: 'The series ended 3-1. Yandex\'s Treant Protector and Invoker system — which had won at 83% across the playoffs, across a mid-tournament patch that nerfed Invoker, across opponents who had spent days trying to solve it — delivered in the Grand Final. LGD took one game. Yandex won three.',
    },
    {
      type: 'paragraph',
      text: 'A 3-1 result in a Bo5 is not the score of a close series. It is the score of a team that arrived knowing exactly what to expect and executed against it.',
    },
    {
      type: 'heading',
      text: 'What Team Yandex Proved',
    },
    {
      type: 'paragraph',
      text: 'The tournament arrived in Copenhagen already reshaped by disruption. PARIVISION — group stage second seed — never made it due to visa complications. Malr1ne couldn\'t travel with Team Falcons. Team Liquid entered a LAN they had been eliminated from. A mid-tournament patch rewrote the meta overnight. By the time the bracket concluded, every pre-event assumption had been overturned.',
    },
    {
      type: 'paragraph',
      text: 'Patch 7.41d landed the night before playoffs began, nerfing Clockwerk, Kez, and Hoodwink — the three most contested heroes in the group stage. Every team that had built their preparation around that meta had to rebuild overnight. Yandex\'s system used none of those heroes. When the meta shifted beneath everyone else, Yandex kept executing the same framework and it kept working.',
    },
    {
      type: 'paragraph',
      text: 'That is not luck. Luck does not produce four series wins and zero series losses in a $1M double-elimination tournament. What produces that result is a coherent system, the organizational capacity to integrate a new offlaner four days before the group stage and arrive in Copenhagen ready, and the draft intelligence to operate outside the meta rather than inside it.',
    },
    {
      type: 'paragraph',
      text: 'BetBoom won BLAST Slam I in 2024 — the tournament series\' original champions. Falcons won TI14 last October. LGD ran the most demanding lower bracket path of the event. Against all of them, Yandex had answers.',
    },
    {
      type: 'paragraph',
      text: 'They entered this tournament through the back door. They never lost a series. They beat the group stage first seed twice.',
    },
    {
      type: 'paragraph',
      text: 'Team Yandex are BLAST Slam VII champions.',
    },
  ],
}

const xPost = `Team Yandex entered BLAST Slam VII through the Last Chance Qualifier.

They won the Grand Final 3-1 over LGD Gaming.

The complete story of the most unpredictable $1M tournament of 2026.

spectateesports.live/articles/blast-slam-vii-grand-finals-recap`

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log(`✓ Published: ${url}`)

  console.log('Updating metadata files (llms.txt + sitemap)...')
  const sha = await updateMetadataFiles(article)
  console.log(`✓ Metadata committed: ${sha}`)

  console.log('Posting to X (@SpectateDota2)...')
  const tweet = await postXTweet(xPost)
  console.log(`✓ X post: ${tweet.url}`)

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

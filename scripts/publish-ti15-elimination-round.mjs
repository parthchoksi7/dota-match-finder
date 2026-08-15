/**
 * One-shot publish script for the TI 2026 Elimination Round preview/predictions article.
 * Run: node scripts/publish-ti15-elimination-round.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'ti-2026-elimination-round-preview',
  title: 'Ten Teams, One Match Each: Who\'s Still Alive at The International 2026',
  subtitle: 'The Group Stage is over. Three teams are through, three are already out, and ten teams play a single win-or-go-home match to reach the Main Event. Here\'s who\'s who, and our predictions for all five matches.',
  publishedAt: '2026-08-15',
  tournament: 'the-international-2026',
  tournamentLabel: 'The International 2026',
  category: 'Preview',
  readingTime: 6,
  watchQuery: '/tournament/the-international-2026-10828',
  watchLabel: 'Watch The International 2026 on Spectate',
  excerpt: 'The International 2026 Group Stage is over. Three teams are through to the Main Event, three are eliminated, and ten teams play a single win-or-go-home match today and tomorrow. Here\'s who\'s already through, who\'s already out, and our data-backed predictions for all five elimination matches.',
  sections: [
    {
      type: 'paragraph',
      text: 'Last year\'s champions are one loss away from going home before the tournament they won even reaches its playoffs. A two-time former champion already has gone home, swept out this week in its first International appearance in four years.',
    },
    {
      type: 'paragraph',
      text: 'That\'s where The International 2026 stands right now. The Group Stage in Shanghai just wrapped up, sorting all 16 teams into three groups: teams already through to the big show, teams already sent home, and ten teams who each have exactly one match left to save their tournament. Win it, and you\'re through to the Main Event with a shot at the trophy. Lose it, and you\'re done. That\'s what\'s playing out today and tomorrow, August 15 and 16.',
    },
    { type: 'heading', text: 'How the Elimination Round Works' },
    {
      type: 'paragraph',
      text: 'Every team played a round-robin-style group stage, a qualifying round where win-loss records sorted everyone out. The 3 teams with the best records skipped straight to the Main Event. The 3 teams with the worst records are already eliminated. The 10 teams stuck in the middle now play one more match each: win it and you\'re in the Main Event too, lose it and your tournament is over. No second chances, no next round, just one match. Each of these matches is a "best-of-3," meaning the first team to win 2 games wins the match. It can be over in two quick games, or come down to a nail-biting third.',
    },
    { type: 'heading', text: 'The 3 Teams Already Through' },
    {
      type: 'paragraph',
      text: 'TEAM VISION, Team Liquid, and Nigma Galaxy finished with the best records and don\'t need to play today at all. They\'re already locked into the Main Event, which starts August 20. Worth knowing: TEAM VISION played under the name PARIVISION until a few weeks ago, before renaming to comply with a tournament sponsorship rule. Same team, same roster, new name.',
    },
    { type: 'heading', text: 'The 3 Teams Already Out' },
    {
      type: 'paragraph',
      text: 'HULIGANI and Xtreme Gaming were eliminated earlier in the week. The bigger story is OG, a team that has won this tournament twice and is one of the most storied names in Dota. OG hadn\'t even played at The International since 2022, and their comeback ended in the worst way possible: swept 2-0 by GamerLegion in their last group-stage match. They\'re out, finishing 14th-15th.',
    },
    { type: 'heading', text: 'The 10 Teams Playing Win-or-Go-Home Matches Right Now' },
    {
      type: 'paragraph',
      text: 'These are the matches to actually watch. Each pairs a team that finished the group stage 3 wins-2 losses against a team that finished 2 wins-3 losses: Team Falcons vs Vici Gaming, Aurora Gaming vs BoomBoys, Team Spirit vs Team Resilience, Iron Wing vs GamerLegion, and LGD Gaming vs Team Yandex.',
    },
    {
      type: 'paragraph',
      text: 'A few of these carry real stories. Team Falcons are the team that won last year\'s tournament, and they\'re supposed to be here, not fighting for their lives on day one, especially against Vici Gaming, who already beat them once at a different tournament last month. Iron Wing is a new name but not a new team: it\'s the rebrand of last year\'s Tundra Esports roster. Team Yandex went into the tournament as one of the names experts expected to do well, but stumbled through the group stage, and now they\'re the "worse record" team fighting to prove the doubters wrong. And OG\'s conquerors, GamerLegion, are still alive too, getting another shot today against Iron Wing.',
    },
    { type: 'heading', text: 'Our Predictions' },
    {
      type: 'paragraph',
      text: 'Everything above this is confirmed fact from the group stage results. What follows is our opinion about who wins each match, not a guarantee. We looked at each team\'s long-term track record (using match-history data from OpenDota, a stats site that tracks pro Dota results) plus how they\'ve actually played this week in Shanghai, and picked a side for each match. Think of these like betting-odds favorites, not locks. Best-of-3 upsets happen all the time. We label each pick High confidence (the evidence points clearly one direction), Medium confidence (a real lean, but a genuine reason it could go the other way), or Low confidence (closer to a coin flip).',
    },
    { type: 'subheading', text: 'Team Falcons vs Vici Gaming — Pick: Team Falcons (Medium confidence)' },
    {
      type: 'paragraph',
      text: 'Falcons have the much stronger track record over time, and that usually matters. But we\'re not fully confident, because Vici already beat Falcons once last month at another event, so this isn\'t a case where the "better" team has a clean record against this exact opponent.',
    },
    { type: 'subheading', text: 'Aurora Gaming vs BoomBoys — Pick: Aurora Gaming (Medium-High confidence)' },
    {
      type: 'paragraph',
      text: 'Two things line up here: Aurora has the stronger overall track record, and the two teams already played each other this week, with Aurora winning 2-0. When the stats and the recent head-to-head agree, that\'s a stronger signal.',
    },
    { type: 'subheading', text: 'Team Spirit vs Team Resilience — Pick: Team Spirit (High confidence)' },
    {
      type: 'paragraph',
      text: 'This is our most confident pick. Spirit\'s only two losses this week were to the two best teams in the whole tournament, which isn\'t a red flag, just what happens facing tough opponents. Resilience, meanwhile, only beat teams that are now already eliminated. The gap here looks real.',
    },
    { type: 'subheading', text: 'Iron Wing vs GamerLegion — Pick: Iron Wing (Low-Medium confidence)' },
    {
      type: 'paragraph',
      text: 'Iron Wing actually beat the defending champions, Team Falcons, this week, which is impressive. But their team is so new under this name that stats sites don\'t have a full track record for them yet, since they just rebranded from Tundra. We\'re going with what we\'ve seen this week over incomplete historical data, but flagging this as a softer read than the others.',
    },
    { type: 'subheading', text: 'LGD Gaming vs Team Yandex — Pick: LGD Gaming (Low-Medium confidence)' },
    {
      type: 'paragraph',
      text: 'This is the one pick where the "smart money" and the actual results disagree. Before the tournament, most people expected Yandex to be the stronger team. But in Shanghai this week, LGD has had the better run, including a win over Vici Gaming, while Yandex has looked shakier than expected. We\'re going with what\'s actually happened over what was predicted beforehand, but this could easily go either way.',
    },
    { type: 'heading', text: 'What\'s Actually at Stake' },
    {
      type: 'paragraph',
      text: 'Every one of these 10 teams has already guaranteed themselves at least $52,267 just for making it this far, that\'s the floor no matter what happens today. But the real prize is what today\'s winners get: a place in the Main Event, August 20-23, and a shot at the tournament\'s grand prize of over $1.2 million and the Aegis of Champions, Dota\'s version of a championship trophy.',
    },
    {
      type: 'paragraph',
      text: 'Five of today\'s ten teams will be back in Shanghai next week playing for that. The other five go home. Nobody knows which is which yet, that\'s the whole reason to watch. Our predictions are educated guesses based on team stats and this week\'s results, not certainties, so treat every pick above as "who we\'d lean toward," not "who\'s guaranteed to win."',
    },
    { type: 'heading', text: 'FAQ: The International 2026 Elimination Round' },
    { type: 'subheading', text: 'How many teams advance from the TI 2026 Elimination Round?' },
    { type: 'paragraph', text: 'Five teams advance. The Elimination Round pairs the five teams that finished the group stage 3-2 against the five that finished 2-3; the winner of each best-of-3 match advances to the Main Event, and the loser is eliminated.' },
    { type: 'subheading', text: 'Which teams already qualified for the TI 2026 Main Event without playing the Elimination Round?' },
    { type: 'paragraph', text: 'TEAM VISION, Team Liquid, and Nigma Galaxy finished with the best group stage records and advanced directly to the Main Event, which runs August 20-23 in Shanghai.' },
    { type: 'subheading', text: 'Which teams are already eliminated from TI 2026?' },
    { type: 'paragraph', text: 'HULIGANI, Xtreme Gaming, and OG finished with the worst group stage records and were eliminated before the Elimination Round began. OG\'s exit ended a four-year absence from The International.' },
    { type: 'subheading', text: 'What do teams win just for reaching the Elimination Round?' },
    { type: 'paragraph', text: 'Every team that reaches the Elimination Round is guaranteed at least $52,267 in prize money, the 9th-13th place payout, regardless of how their Elimination Round match goes.' },
  ],
}

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log('Live at:', url)

  console.log('Updating metadata files (llms.txt + sitemap)...')
  const sha = await updateMetadataFiles(article)
  console.log('Committed:', sha)

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

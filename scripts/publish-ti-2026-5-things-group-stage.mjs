/**
 * One-shot publish script for the "5 Things We Learned" TI 2026 Group Stage /
 * Elimination Round data-analysis article.
 * Run: node scripts/publish-ti-2026-5-things-group-stage.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: '5-things-we-learned-ti-2026-group-stage-elimination-round',
  title: "5 Things We Learned From The International 2026's Group Stage and Elimination Round",
  subtitle: "We went through all 109 games — every draft, every gold graph, every objective — and found the signals the broadcast doesn't have time to show you.",
  publishedAt: '2026-08-16',
  tournament: 'the-international-2026',
  tournamentLabel: 'The International 2026',
  category: 'Analysis',
  readingTime: 6,
  watchQuery: '/tournament/the-international-2026-10828',
  watchLabel: 'Watch The International 2026 on Spectate',
  excerpt: "All 109 games of TI 2026's Group Stage and Elimination Round, broken down: when a gold lead actually means the game is over, why first blood barely matters compared to first Roshan, and the hero every team either bans or takes.",
  sections: [
    {
      type: 'paragraph',
      text: "The International 2026's Group Stage and Elimination Round are over: 109 games, 16 teams down to 8. We went through every one of them — every draft, every gold graph, every objective timestamp — looking for what actually predicts winning, not just what happened. Some of it confirms what you'd guess. Most of it doesn't.",
    },
    { type: 'heading', text: 'The Point of No Return' },
    {
      type: 'paragraph',
      text: "Here's a usable number: across all 109 games, a team holding an 8,000+ gold lead at the 25-to-30-minute mark went on to win 90.7% of the time — 49 out of 54 games. If you're deciding whether a game is still worth your evening once you see that gap on the broadcast overlay, that's close to your answer. But there's a wrinkle worth knowing before you trust gold leads too early: at exactly the 20-minute mark, a small lead — under 2,000 gold — was actually worse than a coin flip. Teams \"ahead\" by a sliver at minute 20 only went on to win 39% of the time (9 of 23 games). That's a smaller sample, so don't treat it as gospel, but it's consistent enough to say out loud: a slim lead at 20 minutes tells you almost nothing. It might even be a red flag.",
    },
    { type: 'heading', text: 'Not All "Firsts" Matter Equally' },
    {
      type: 'paragraph',
      text: "Every broadcast reacts to first blood. The data says you shouldn't. Across the tournament, the team that got first blood went on to win only 55.6% of games (60 of 108) — statistically no different from a coin flip. First Tormentor, the newer neutral boss, is a real but modest signal: teams that secured it first won 63.0% of the time (63 of 100). First Roshan is a different animal entirely: 78.1% (82 of 105 games). That's not a small edge — it's the strongest single predictor in the entire dataset, bigger than the gold-lead threshold above. The objective that gets the least airtime reaction is the one that actually tells you who's going to win.",
    },
    { type: 'heading', text: '[Treant Protector](/heroes/treant) Isn\'t Banned Out of Caution. It\'s Banned Out of Certainty.' },
    {
      type: 'paragraph',
      text: "Treant Protector was banned in 101 of 109 games — 92.7%, and that number barely moved across all four tournament days, never dropping below 89% on any single day. That much you could guess just watching a few drafts. Here's what you'd have to go looking for: of the 8 games where Treant Protector wasn't banned, it was picked in all 8. Not \"usually.\" Every time. Zero games where both teams let it go unbanned and then also let it go unpicked. And when it was picked, it won 7 of those 8 games. That's a small sample on the pick side, but the ban-then-instant-pick pattern across the full 109-game census isn't a small sample — it's a hero every single team has already made up its mind about.",
    },
    { type: 'heading', text: 'The TI 2026 Meta Graveyard' },
    {
      type: 'paragraph',
      text: "Twenty-two heroes were picked zero times and banned zero times across all 109 games of this event. Not \"rarely seen\" — completely, totally absent from the draft conversation at the biggest tournament in the game. The list includes some heroes that would've been auto-picks at past Internationals: [Anti-Mage](/heroes/antimage), [Phantom Assassin](/heroes/phantom_assassin), [Sniper](/heroes/sniper), [Medusa](/heroes/medusa), [Chaos Knight](/heroes/chaos_knight), [Wraith King](/heroes/skeleton_king). The full graveyard: Abaddon, Anti-Mage, Bristleback, Broodmother, Chaos Knight, Chen, Disruptor, Lich, Marci, Medusa, Meepo, Nyx Assassin, Ogre Magi, Omniknight, Phantom Assassin, Silencer, Skywrath Mage, Sniper, Venomancer, Visage, Warlock, Wraith King. This is a complete count, not a sample — for these 109 games, these 22 heroes simply did not exist.",
    },
    { type: 'heading', text: 'The Rarest Things That Happened All Tournament' },
    {
      type: 'paragraph',
      text: "In 109 games, there were exactly 4 Rampages and 3 Aegis Steals. That's a five-man kill streak roughly once every 27 games, and someone pulling off the notoriously hard play of killing Roshan's holder to steal the Aegis roughly once every 36. Here's a small, fun thread that's too small to call a trend but too clean not to mention: every single team that landed an Aegis steal this tournament went on to win that game — 3 for 3. Call it a superstition until someone breaks it in the Main Event.",
    },
    { type: 'heading', text: 'What This Means Going Into the Main Event' },
    {
      type: 'paragraph',
      text: "None of this shows up in a bracket graphic, but it's worth carrying into the Main Event starting August 20: [Iron Wing](/teams/1win) vs. [Team Spirit](/teams/team-spirit), TEAM VISION vs. [BoomBoys](/teams/betboom-team), [Team Liquid](/teams/team-liquid) vs. Team Yandex, and [Nigma Galaxy](/teams/nigma-galaxy) vs. [Team Falcons](/teams/team-falcons). Watch who takes the first Roshan, not just who gets the first kill. Watch what happens to the gold lead specifically at minute 25, not minute 20. And watch the ban phase — if Treant Protector somehow slips through again, you already know what happens next.",
    },
    { type: 'heading', text: 'FAQ: TI 2026 Group Stage and Elimination Round Stats' },
    { type: 'subheading', text: 'What is the win rate for the team that gets first blood at TI 2026?' },
    { type: 'paragraph', text: '55.6% (60 of 108 games) — statistically about the same as a coin flip.' },
    { type: 'subheading', text: 'What is the win rate for the team that takes the first Roshan at TI 2026?' },
    { type: 'paragraph', text: '78.1% (82 of 105 games) — the strongest single predictor of the winner found across the Group Stage and Elimination Round.' },
    { type: 'subheading', text: 'How often was Treant Protector banned at TI 2026?' },
    { type: 'paragraph', text: '92.7% of games (101 of 109), consistent across every day of the Group Stage and Elimination Round.' },
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

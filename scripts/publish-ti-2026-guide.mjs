/**
 * One-shot publish script for "How to Watch The International 2026" viewer-features guide.
 * Run: node scripts/publish-ti-2026-guide.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, postXTweet, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'how-to-watch-the-international-2026',
  title: 'How to Watch The International 2026: Every Way to Follow TI on Spectate Esports',
  subtitle: 'Live feed, calendar, tournament tracking, timestamped replays, MVP scores, Rampage/Rapier/comeback tracking, and search — every tool Spectate gives you to follow TI 2026 without missing a moment.',
  publishedAt: '2026-08-10',
  tournament: 'the-international-2026',
  tournamentLabel: 'The International 2026',
  category: 'Preview',
  readingTime: 6,
  watchQuery: '/tournament/the-international-2026-10828',
  watchLabel: 'Watch The International 2026 on Spectate',
  excerpt: 'The International 2026 runs August 13–23 in Shanghai. Here is every feature on Spectate Esports built to help you follow it — live feed, calendar, replays, MVP scores, and big-moment tracking.',
  sections: [
    {
      type: 'paragraph',
      text: 'The International 2026 runs August 13–23 in Shanghai — Group Stage August 13–16, Main Stage August 20–23 — as 16 of the world\'s best teams chase Dota 2\'s biggest trophy. Here\'s every tool Spectate Esports gives you to follow it, minute by minute, moment by moment, match by match.',
    },
    {
      type: 'paragraph',
      text: 'TI week breaks most people\'s routines. Games run late, series run long, and the moments that matter — a Rampage on the Ancient, a Divine Rapier buy that flips a game, a 20,000-gold swing in the final ten minutes — happen fast and don\'t wait for you to tab back in. Spectate Esports was built around one question: how do you actually keep up with The International without missing what matters? Here\'s everything on the site, and how to use it during TI 2026.',
    },
    { type: 'heading', text: 'The Live Match Feed' },
    {
      type: 'paragraph',
      text: 'When a TI 2026 series is live, Spectate surfaces it on the homepage feed with a live pulse — open it and you get a real-time view of the game without needing a second monitor for a stats overlay. Inside the live feed you get a live event feed of kills, Roshan kills, and marquee item buys as they happen, grouped by team fight so you can read the shape of a skirmish at a glance, plus a live gold/net worth graph tracking the lead in real time, before the match even finishes.',
    },
    {
      type: 'paragraph',
      text: 'Spectate also tracks momentum bands — not just who\'s ahead, but how ahead, scaled to how far into the game you are. A 5k lead at minute 10 reads very differently from a 5k lead at minute 45, and the feed labels each state (Even / Ahead / Far Ahead) accordingly. It\'s built to communicate state, not fate — a big lead is a position, not a foregone conclusion.',
    },
    { type: 'heading', text: 'TI 2026 Calendar — Subscribe, Don\'t Check Back' },
    {
      type: 'paragraph',
      text: 'You shouldn\'t have to remember when your team plays next. Spectate\'s calendar lets you subscribe to a feed for the teams and tournaments you care about — TI 2026 included — so every match lands directly in your Google Calendar, Apple Calendar, or Outlook automatically, with no manual refreshing required. Pick your Tier-1 teams once and the calendar keeps itself current for the rest of the tournament.',
    },
    { type: 'heading', text: 'Tournament Tracking — Brackets, Standings, Group Stage' },
    {
      type: 'paragraph',
      text: 'The TI 2026 tournament hub tracks the event structure itself: group stage standings, bracket progression into the Main Stage, and match-by-match results as they\'re locked in. Instead of piecing together the bracket from a dozen tabs, it\'s one page that updates as the tournament moves.',
    },
    { type: 'heading', text: 'Timestamped Replays — Jump Straight to the Moment' },
    {
      type: 'paragraph',
      text: 'This is the one that saves the most time. Most fans don\'t want to rewatch a full 45-minute game to relive one moment — they want the Rampage, the Rapier steal, the throw. On Spectate, the big-moment markers on a match\'s gold graph are clickable, and clicking one deep-links straight into the VOD at that exact second. No scrubbing, no guessing the timestamp — click the Rampage icon, land on the Rampage.',
    },
    { type: 'heading', text: 'Player Impact Score & MVP' },
    {
      type: 'paragraph',
      text: 'Every completed match gets a per-player Impact score, powered by STRATZ, on a -100 to +100 scale that captures how much a player actually swung the outcome of the game — not just their kill count. The standout performer in a match is flagged with an MVP badge, so you can tell at a glance who actually won the game for their team, beyond the scoreboard.',
    },
    { type: 'heading', text: 'Big-Moment Tracking: Rampages, Rapiers, Gold Swings, Mega-Comebacks' },
    {
      type: 'paragraph',
      text: 'TI is remembered in moments, not box scores, so Spectate flags the moments automatically on every match card and inside the game view: Rampage, a five-kill streak from a single hero; Divine Rapier, flagged the moment someone buys the highest-risk, highest-reward item in Dota; Gold Swing, when a team claws back from a 20,000+ gold deficit to win; and Mega-Comeback, when a team wins after their barracks are razed and megacreeps are already on the map for the enemy — one of the rarest, hardest comebacks in competitive Dota. These show up as icon chips you can scan across a full day of TI matches to instantly find the games with the wild swings, without watching all of them.',
    },
    { type: 'heading', text: 'Search by Hero, Team, or Tournament' },
    {
      type: 'paragraph',
      text: 'Want every TI 2026 game a specific hero showed up in? Every match a team played? Everything under the TI 2026 banner? Spectate\'s search resolves hero names, team names, and tournament names directly — search "Invoker" and go straight to that hero\'s page, matches and all.',
    },
    { type: 'heading', text: 'Gold Graph — Live and Post-Game' },
    {
      type: 'paragraph',
      text: 'Every match, live or completed, gets a net-worth graph tracking the gold lead over time, with the big-moment markers (Rampage, Rapier, comebacks) plotted directly on the line. It\'s the fastest way to see the shape of a game — a stomp, a slow bleed, or a nail-biter that swung in the final minutes — before you commit to watching the VOD.',
    },
    { type: 'heading', text: 'Draft Display — See the Picks and Bans' },
    {
      type: 'paragraph',
      text: 'Every match includes a full draft display — pick order, ban order, both sides — with a spoiler-free mode if you want to watch the draft unfold before seeing who won. Draft is where a lot of TI series are actually decided, and Spectate treats it as a first-class part of the match, not an afterthought.',
    },
    { type: 'heading', text: '"Just Ended" — Results Before the Rest of the Internet' },
    {
      type: 'paragraph',
      text: 'TI produces stacked series, and stat sites can lag 30-90 minutes behind a game actually finishing. Spectate\'s "Just Ended" section surfaces results within about a minute of a series ending — before the usual stats pipelines have even indexed the game — so you know who won without waiting.',
    },
    { type: 'heading', text: 'TI History — Every Champion Since 2011' },
    {
      type: 'paragraph',
      text: 'Fifteen years of The International, one page. Spectate\'s TI History tracks every champion from TI1 through TI2025, so when someone brings up "the last team to win back-to-back" or "who won the first TI," the answer\'s one click away — useful context while TI 2026 is being written into that same history.',
    },
    { type: 'heading', text: 'Why This Matters for TI 2026' },
    {
      type: 'paragraph',
      text: 'The International only happens once a year. Sixteen teams, one bracket, elimination stakes from the moment the Main Stage starts on August 20. You don\'t need to watch every second of every game to follow it properly — you need the tools to know what happened, what it meant, and how to get back to the moment that mattered. That\'s what Spectate Esports is built for. Anyone searching for how to watch, follow, or catch up on The International should land here.',
    },
    { type: 'heading', text: 'FAQ: The International 2026 on Spectate Esports' },
    { type: 'subheading', text: 'When is The International 2026?' },
    { type: 'paragraph', text: 'The International 2026 runs August 13-23 in Shanghai, China, with the Group Stage from August 13-16 and the Main Stage (playoffs) from August 20-23.' },
    { type: 'subheading', text: 'Where can I watch TI 2026 VODs with timestamps to the best moments?' },
    { type: 'paragraph', text: 'Spectate Esports links directly to match VODs and lets you jump straight to key moments — Rampages, Divine Rapier buys, gold swings, and mega-comebacks — by clicking the moment marker on the match\'s gold graph.' },
    { type: 'subheading', text: 'How do I get a calendar of all TI 2026 matches?' },
    { type: 'paragraph', text: 'Subscribe to Spectate\'s calendar feed for your favorite TI 2026 teams and every match is added automatically to your Google, Apple, or Outlook calendar — no manual checking required.' },
    { type: 'subheading', text: 'What is a Dota 2 Impact score / MVP badge?' },
    { type: 'paragraph', text: 'Spectate shows a per-player Impact score (STRATZ, -100 to +100) for every completed match, along with an MVP badge for the standout performer — a way to measure who actually swung the game, not just who has the highest kill count.' },
    { type: 'subheading', text: 'How can I find every match a specific hero or team played at TI 2026?' },
    { type: 'paragraph', text: 'Search any hero, team, or tournament name on Spectate to go straight to their page and full TI 2026 match history.' },
  ],
}

const xPostText = `The International 2026 starts August 13 in Shanghai.\n\nLive feed, calendar sync, timestamped replays, MVP scores, and Rampage/Rapier/comeback tracking — everything you need to follow TI 2026 is on Spectate.\n\nhttps://spectateesports.live/articles/${article.slug}`

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log('Live at:', url)

  console.log('Posting to X...')
  const tweet = await postXTweet(xPostText)
  console.log('Tweeted:', tweet.url)

  console.log('Committing metadata files to GitHub...')
  const sha = await updateMetadataFiles(article)
  console.log('Committed:', sha)
}

main().catch((err) => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

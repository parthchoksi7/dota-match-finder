/**
 * One-shot publish script for the EWC 2026 Survival Stage explainer.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN, GITHUB_REPO in .env.local.
 * Run: node scripts/publish-ewc-survival-explainer.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'ewc-2026-survival-stage-explained',
  title: "The Survival Stage, Explained: How EWC 2026's Do-or-Die Bracket Works",
  subtitle: 'Four teams already have next week off. Twenty don\'t.',
  publishedAt: '2026-07-13',
  tournament: 'esports-world-cup-2026',
  tournamentLabel: 'Esports World Cup 2026',
  category: 'Preview',
  readingTime: 3,
  watchQuery: 'esports world cup',
  watchLabel: 'Watch EWC 2026 on Spectate',
  excerpt: 'Groups wrapped July 12. Four teams go straight to Playoffs. Everyone else has to survive a single-elimination gauntlet first — here is exactly how it works, who plays who, and when.',
  sections: [
    {
      type: 'paragraph',
      text: 'Group play at the Esports World Cup wrapped July 12, and the standings set up something a lot of newer viewers haven\'t seen before: a stage called Survival that decides who actually gets a shot at the $2 million Dota 2 prize pool.',
    },
    {
      type: 'paragraph',
      text: 'Four teams skipped it entirely. Team Falcons, Nigma Galaxy, PARIVISION, and Team Yandex won their groups outright and go straight to the Playoffs quarterfinals on July 16. Everyone else who survived groups — the eight teams that finished 3rd or 4th, plus the four that finished 2nd — has to fight through Survival first.',
    },
    {
      type: 'heading',
      text: 'How Survival Works',
    },
    {
      type: 'paragraph',
      text: 'Survival is single-elimination. Lose once, and the run is over — no group-stage safety net, no bracket reset. Every match is best-of-3.',
    },
    {
      type: 'subheading',
      text: 'Round 1 — July 14',
    },
    {
      type: 'paragraph',
      text: 'The eight teams that finished 3rd or 4th in their groups play off in pairs: Team Liquid vs. Xtreme Gaming and Rune Eaters vs. Virtus.pro both start at 11:00 UTC (13:00 CEST), followed by LGD Gaming vs. MOUZ and Vici Gaming vs. PlayTime at 14:30 UTC (16:30 CEST).',
    },
    {
      type: 'subheading',
      text: 'Round 2 — July 15',
    },
    {
      type: 'paragraph',
      text: 'The four Round 1 winners face the four group runners-up. BetBoom Team plays the LGD Gaming/MOUZ winner and 1win plays the Vici Gaming/PlayTime winner, both at 11:00 UTC (13:00 CEST). Defending champions Team Spirit play the Team Liquid/Xtreme Gaming winner, and Aurora play the Rune Eaters/Virtus.pro winner, both at 14:30 UTC (16:30 CEST).',
    },
    {
      type: 'heading',
      text: "What's Next",
    },
    {
      type: 'paragraph',
      text: 'The four teams that win Round 2 join the four group winners in an eight-team, single-elimination Playoffs bracket running July 16-19: best-of-3 through the quarterfinals and semifinals, best-of-5 for the grand final.',
    },
    {
      type: 'paragraph',
      text: 'By the end of July 15, half the field that started July 7 in Paris will be gone, and the eight-team Playoffs bracket will be completely set.',
    },
  ],
}

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log(`Published: ${url}`)

  console.log('Updating metadata files (llms.txt + sitemap)...')
  const sha = await updateMetadataFiles(article)
  console.log(`Metadata committed: ${sha}`)

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

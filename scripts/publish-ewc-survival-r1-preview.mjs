/**
 * One-shot publish script for the EWC 2026 Survival Round 1 match preview.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN, GITHUB_REPO in .env.local.
 * Run: node scripts/publish-ewc-survival-r1-preview.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb, updateMetadataFiles } from '../api/pipeline/_publisher.js'

const article = {
  slug: 'ewc-2026-survival-round-1-preview',
  title: 'Four Elimination Matches Tomorrow — Which One to Watch First',
  subtitle: "All four Survival Round 1 matches are win-or-go-home. Here's where to start.",
  publishedAt: '2026-07-13',
  tournament: 'esports-world-cup-2026',
  tournamentLabel: 'Esports World Cup 2026',
  category: 'Preview',
  readingTime: 3,
  watchQuery: 'esports world cup',
  watchLabel: 'Watch EWC 2026 on Spectate',
  excerpt: "Survival Round 1 hits July 14 with four win-or-go-home best-of-3s. One of them sends its winner straight into a match against the reigning champion the very next day.",
  sections: [
    {
      type: 'paragraph',
      text: "Survival Round 1 hits July 14, and all four matches carry the same baseline stakes: lose, and your EWC 2026 run ends today. But one of these best-of-3s carries a bigger prize for winning than the other three — a shot at the reigning champion.",
    },
    {
      type: 'subheading',
      text: '1. Team Liquid vs. Xtreme Gaming — 11:00 UTC / 13:00 CEST',
    },
    {
      type: 'paragraph',
      text: "The winner doesn't just survive — they walk into Round 2 against Team Spirit, the 2025 EWC champions. Team Liquid enter off a middling group stage, finishing 3rd in Group B behind Nigma Galaxy and Aurora, but they're a two-time International champion organization — the only org to win TI with two different rosters, in 2017 and 2024. Xtreme Gaming finished 3rd in Group A. Whoever wins this one gets the single highest-profile Round 2 assignment on the board.",
    },
    {
      type: 'subheading',
      text: '2. Vici Gaming vs. PlayTime — 14:30 UTC / 16:30 CEST',
    },
    {
      type: 'paragraph',
      text: "Vici Gaming quietly posted the best raw record of any team dropping into Round 1 — more series wins in Group C than any other 3rd or 4th-place finisher — and still didn't escape the group thanks to Team Spirit and PARIVISION both finishing ahead of them unbeaten. That's a team that's been playing well and getting nothing to show for it yet. The winner faces 1win in Round 2.",
    },
    {
      type: 'subheading',
      text: '3. LGD Gaming vs. MOUZ — 14:30 UTC / 16:30 CEST',
    },
    {
      type: 'paragraph',
      text: 'Two teams that finished 3rd and 4th in Groups D and C respectively. The winner meets BetBoom Team in Round 2.',
    },
    {
      type: 'subheading',
      text: '4. Rune Eaters vs. Virtus.pro — 11:00 UTC / 13:00 CEST',
    },
    {
      type: 'paragraph',
      text: "Group A and Group D's 4th-place finishers. The winner meets Aurora in Round 2.",
    },
    {
      type: 'heading',
      text: 'If You Only Watch One',
    },
    {
      type: 'paragraph',
      text: "Team Liquid vs. Xtreme Gaming — not because either team is favored, but because it's the only Round 1 match where the reward for winning is a match against the defending champions the very next day.",
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

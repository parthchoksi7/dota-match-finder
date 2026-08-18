/**
 * One-shot publish script for the TI 2026 playoff bracket prediction article.
 * Run: node scripts/publish-ti-2026-bracket-prediction.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { publishToDb } from '../api/pipeline/_publisher.js'
// NOTE: updateMetadataFiles() is intentionally NOT called on re-runs of this script.
// It already ran once for this slug (commit eb809a6) — patchLlms() has no dedupe-by-slug
// check, so calling it again would insert a second llms.txt line for the same article.
// publishToDb() is a Supabase upsert keyed on slug, so it's safe to re-run for content edits.

const article = {
  slug: 'ti-2026-playoff-bracket-prediction',
  title: 'The International 2026 Playoff Bracket: Our Prediction for Every Match',
  subtitle: 'We simulated the playoff bracket 300,000 times. Here is the pick for every series — and the 8-2 team whose group stage record we think is a mirage.',
  publishedAt: '2026-08-17',
  expiresAt: '2026-08-25',
  tournament: 'the-international-2026',
  tournamentLabel: 'The International 2026',
  category: 'Preview',
  readingTime: 6,
  watchQuery: '/tournament/the-international-2026-10828',
  watchLabel: 'Watch The International 2026 on Spectate',
  excerpt: "We built a skill rating from 7,812 professional games, tested it on TI 2026's own group stage, then simulated the playoff bracket 300,000 times. TEAM VISION came out on top most often — but the more interesting finding is Nigma Galaxy, who went 8-2 in the group stage and gets a 1.6% title chance from our model.",
  sections: [
    {
      type: 'paragraph',
      text: "We built a skill rating for every team from 7,812 professional games played since October 2025, then tested it against the 109 games of TI 2026's own group stage — games it had never seen — to check whether it actually predicts real results. It picked the correct winner 61.5% of the time, a real edge over a coin flip but not a crystal ball. We then used it to play out the playoff bracket 300,000 times.",
    },
    {
      type: 'paragraph',
      text: "TEAM VISION came out on top most often, which won't surprise anyone who has watched them this year — nor anyone who read our [group stage data breakdown](/articles/5-things-we-learned-ti-2026-group-stage-elimination-round). Below is our pick for every match in the bracket, plus the team whose group stage record we think the standings flattered far more than it should have.",
    },
    { type: 'heading', text: 'The Odds' },
    {
      type: 'paragraph',
      text: "Out of 300,000 simulated runs of the tournament, here is how often each of [TEAM VISION](/teams/parivision-dota-2), [Team Falcons](/teams/team-falcons-dota-2), [Team Yandex](/teams/team-yandex), [Team Liquid](/teams/team-liquid), [Iron Wing](/teams/1win-dota-2), [Team Spirit](/teams/team-spirit), [BoomBoys](/teams/betboom-team) and [Nigma Galaxy](/teams/nigma-galaxy) won it — one clear favorite, then six teams bunched close together. Below the top seed, this is close to an even field, and who a team happens to face in the bracket matters about as much as how good they are.",
    },
    {
      type: 'ranking',
      items: [
        { label: 'TEAM VISION', value: '26.9%' },
        { label: 'Team Falcons', value: '16.9%' },
        { label: 'Team Yandex', value: '14.4%' },
        { label: 'Team Liquid', value: '11.7%' },
        { label: 'Iron Wing', value: '9.8%' },
        { label: 'Team Spirit', value: '9.8%' },
        { label: 'BoomBoys', value: '9.0%' },
        { label: 'Nigma Galaxy', value: '1.6%' },
      ],
    },
    { type: 'heading', text: 'The Bracket' },
    {
      type: 'paragraph',
      text: "Every match is BO3 except the Grand Final, which is BO5. Two of the four opening matches are close to a coin flip — treat those as leans, not calls. The odds of every one of these fourteen matches landing exactly as picked below are only about 1 in 3,000.",
    },
    {
      type: 'bracket',
      bracket: [
        { section: 'upper', round: 0, label: 'Quarterfinals — Aug 20', matches: [
          { id: 'u-qf-1', teamA: 'Iron Wing', teamB: 'Team Spirit', predicted: true, winner: 1, pct: 50 },
          { id: 'u-qf-2', teamA: 'TEAM VISION', teamB: 'BoomBoys', predicted: true, winner: 0, pct: 64 },
          { id: 'u-qf-3', teamA: 'Team Liquid', teamB: 'Team Yandex', predicted: true, winner: 1, pct: 52 },
          { id: 'u-qf-4', teamA: 'Nigma Galaxy', teamB: 'Team Falcons', predicted: true, winner: 1, pct: 73 },
        ]},
        { section: 'upper', round: 1, label: 'Semifinals — Aug 21', matches: [
          { id: 'u-sf-1', teamA: 'TEAM VISION', teamB: 'Team Spirit', predicted: true, winner: 0, pct: 63 },
          { id: 'u-sf-2', teamA: 'Team Yandex', teamB: 'Team Falcons', predicted: true, winner: 1, pct: 51 },
        ]},
        { section: 'upper', round: 2, label: 'Upper Final — Aug 22', matches: [
          { id: 'u-f', teamA: 'TEAM VISION', teamB: 'Team Falcons', predicted: true, winner: 0, pct: 59 },
        ]},
        { section: 'lower', round: 0, label: 'Round 1 — Aug 21', matches: [
          { id: 'l-r1-1', teamA: 'Iron Wing', teamB: 'BoomBoys', predicted: true, winner: 0, pct: 52 },
          { id: 'l-r1-2', teamA: 'Team Liquid', teamB: 'Nigma Galaxy', predicted: true, winner: 0, pct: 70 },
        ]},
        { section: 'lower', round: 1, label: 'Quarterfinals — Aug 22', matches: [
          { id: 'l-qf-1', teamA: 'Iron Wing', teamB: 'Team Yandex', predicted: true, winner: 1, pct: 53, note: '+ loser of Falcons–Yandex' },
          { id: 'l-qf-2', teamA: 'Team Liquid', teamB: 'Team Spirit', predicted: true, winner: 0, pct: 51, note: '+ loser of VISION–Spirit' },
        ]},
        { section: 'lower', round: 2, label: 'Semifinal — Aug 22', matches: [
          { id: 'l-sf', teamA: 'Team Yandex', teamB: 'Team Liquid', predicted: true, winner: 0, pct: 52 },
        ]},
        { section: 'lower', round: 3, label: 'Final — Aug 23', matches: [
          { id: 'l-f', teamA: 'Team Falcons', teamB: 'Team Yandex', predicted: true, winner: 0, pct: 51, note: '+ loser of Upper Bracket Final' },
        ]},
        { section: 'grand_final', round: 0, label: 'Grand Final · BO5', matches: [
          { id: 'gf', teamA: 'TEAM VISION', teamB: 'Team Falcons', predicted: true, winner: 0, pct: 61 },
        ]},
      ],
    },
    {
      type: 'paragraph',
      text: "Our single most likely path ends with TEAM VISION beating Team Falcons 3 games to 1 in the Grand Final — a 61% series win once both teams get there.",
    },
    { type: 'heading', text: 'Why TEAM VISION' },
    {
      type: 'paragraph',
      text: "They went 4-0 in the group stage, and theirs is the pick nearly every outlet has landed on, so we'll keep this short. They were ahead on gold at every point in the game we checked, and by a growing margin each time — a +5,109 lead on average by minute 25, the largest of any playoff team. Their carry, Alan “Satanic” Gallyamov, earned gold faster than anyone else at the event across all ten of his games. And this same roster, playing as PARIVISION, won the Esports World Cup in July, going 16-3 and beating BoomBoys in the final — their second title-level run in a month. The case against them: Team Liquid have actually beaten them more often than not this year (6-4), and history isn't kind to group stage leaders — the last five TI champions averaged third place in their group, not first. That's why our number is 26.9%, not something higher.",
    },
    { type: 'heading', text: 'The Fade: Nigma Galaxy Went 8-2. We Give Them 1.6%.' },
    {
      type: 'paragraph',
      text: "Nigma tied TEAM VISION for the best game record in the group stage and took a direct playoff spot. Our model gives them less than a fifth of the next-worst team's title chances. That gap needs an explanation.",
    },
    {
      type: 'paragraph',
      text: "Start with a basic fact, drawn from 8,439 professional games since October 2025: in the 6,198 cases where a team was down more than 2,000 gold at the 20-minute mark, they went on to win only 15.3% of the time. Nigma found themselves in exactly that spot five times in the group stage — and won three of them, a 60% comeback rate, about four times the norm. We checked this systematically: mapping every TI 2026 team's gold lead or deficit at minute 20 onto that same win curve, Nigma should have finished with about 3.9 wins from their ten group stage games. They finished with 8 — four wins clear of what their in-game position predicted. Every other playoff team landed within about one win of their expected total. Nobody else is close to Nigma's gap.",
    },
    {
      type: 'paragraph',
      text: "Their average win took 57 minutes to close out; their average loss took 41. They've also stuck to the smallest set of heroes of any playoff team, and across all of 2026 they are 0 wins and 10 losses against TEAM VISION, BoomBoys, Team Falcons and Iron Wing — every genuinely top-tier team they've faced. Their wins have come against Team Liquid and Team Spirit only. We're not calling Nigma a bad team, or comebacks a fluke — but a 60% comeback rate from five games is a small sample, and a BO3 bracket gives them fewer chances to find the deficit they've relied on all tournament.",
    },
    { type: 'heading', text: 'FAQ: TI 2026 Playoff Bracket Predictions' },
    { type: 'subheading', text: 'What is the TI 2026 playoff format?' },
    { type: 'paragraph', text: 'Eight teams in a double-elimination bracket, played August 20 to 23 in Shanghai. Every match is BO3 except the Grand Final, which is BO5.' },
    { type: 'subheading', text: 'Who is favored to win The International 2026?' },
    { type: 'paragraph', text: 'TEAM VISION, at 26.9% in our simulation model — the clear favorite, but still more likely to lose the tournament than win it.' },
    { type: 'subheading', text: "What are Team Falcons' odds to win TI 2026?" },
    { type: 'paragraph', text: '16.9%, second-highest in our model, built on the easiest realistic path to the Grand Final of any non-favorite.' },
    { type: 'subheading', text: 'Why does Nigma Galaxy have low title odds despite an 8-2 group stage record?' },
    { type: 'paragraph', text: "Their record was built on unusually frequent comebacks from large gold deficits, a pattern our model expects to regress. Judged by in-game position rather than final score, their group stage results are about four wins better than expected — the largest gap of any team in the field." },
    { type: 'subheading', text: 'Who wins the TI 2026 Grand Final in this prediction?' },
    { type: 'paragraph', text: 'TEAM VISION over Team Falcons, 3 games to 1 — our single most likely path through the bracket, though the odds of every match landing exactly this way are only about 1 in 3,000.' },
  ],
}

async function main() {
  console.log('Publishing to Supabase...')
  const url = await publishToDb(article)
  console.log('Live at:', url)
  console.log('\nDone. (Metadata files already updated on first publish — skipped.)')
}

main().catch((err) => {
  console.error('Publish failed:', err.message)
  process.exit(1)
})

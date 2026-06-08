import { kv } from '../_kv.js'
import { fetchSeriesList } from './_tournamentUtils.js'

export default async function handleLlmsData(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const LLMS_DATA_TTL = 60 * 60
  const LLMS_DATA_KV_KEY = 'spectate:llms_data_v1'
  try {
    const cached = await kv.get(LLMS_DATA_KV_KEY)
    if (cached && req.query?.bust !== '1') {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
      return res.status(200).json(cached)
    }
  } catch {}

  let seriesData = { live: [], upcoming: [], completed: [] }
  try { seriesData = await fetchSeriesList(token) } catch {}

  const glossaryIndex = [
    { id: 'draft', term: 'Draft / Pick-Ban', shortDef: 'The pre-game hero selection phase where teams alternate banning and picking heroes.' },
    { id: 'gpm', term: 'GPM', shortDef: "Gold Per Minute — measures a player's gold income rate. Carries typically have the highest GPM." },
    { id: 'roshan', term: 'Roshan', shortDef: 'A powerful neutral boss whose kill grants the Aegis of the Immortal.' },
    { id: 'rampage', term: 'Rampage', shortDef: 'Killing 5 enemies within ~40 seconds. The highest kill streak in Dota 2.' },
    { id: 'divine-rapier', term: 'Divine Rapier', shortDef: 'High-risk high-reward item granting massive damage but dropping on death.' },
    { id: 'aegis', term: 'Aegis of the Immortal', shortDef: 'Item dropped by Roshan that grants one free death (respawn in place).' },
    { id: 'mega-creeps', term: 'Mega Creeps', shortDef: 'Empowered lane creeps spawned when all barracks of one team are destroyed.' },
    { id: 'buyback', term: 'Buyback', shortDef: 'Spending gold to immediately respawn after death. A critical late-game decision.' },
    { id: 'net-worth', term: 'Net Worth', shortDef: 'Total gold value of items plus bank gold. Key metric for team economy comparison.' },
    { id: 'first-blood', term: 'First Blood', shortDef: 'The first hero kill of a game, awarding bonus gold.' },
    { id: 'smoke-of-deceit', term: 'Smoke of Deceit', shortDef: 'Consumable that grants team invisibility for coordinated ganks.' },
    { id: 'ancient', term: 'Ancient', shortDef: 'The main structure each team must destroy to win the game.' },
    { id: 'barracks', term: 'Barracks', shortDef: 'Lane structures that unlock Mega Creeps when destroyed.' },
    { id: 'bkb', term: 'BKB (Black King Bar)', shortDef: 'Item that grants temporary magic immunity. A core defensive item.' },
    { id: 'tp-scroll', term: 'TP Scroll', shortDef: 'Town Portal Scroll — teleports a hero to a friendly structure. Essential for defense.' },
    { id: 'courier', term: 'Courier', shortDef: 'Flying unit that delivers items from the shop to heroes on the map.' },
    { id: 'carry', term: 'Carry (Position 1)', shortDef: 'Late-game scaling role. Farms gold early to become the primary damage dealer.' },
    { id: 'support', term: 'Support (Position 4/5)', shortDef: 'Utility and vision roles that sacrifice farm for team-enabling abilities.' },
    { id: 'offlane', term: 'Offlane (Position 3)', shortDef: 'The hard-lane solo hero, often tanky or initiating.' },
    { id: 'mid-lane', term: 'Mid Lane (Position 2)', shortDef: 'Solo center-lane hero, typically a playmaking or tempo-setting role.' },
    { id: 'last-hit', term: 'Last Hit', shortDef: 'Killing a creep to claim its gold. Core farming mechanic in Dota 2.' },
    { id: 'deny', term: 'Deny', shortDef: 'Killing an allied creep to prevent the enemy from gaining gold.' },
    { id: 'teamfight', term: 'Teamfight', shortDef: 'A multi-hero engagement over map objectives or positioning.' },
    { id: 'bounty-rune', term: 'Bounty Rune', shortDef: 'Gold-granting rune spawning every 3 minutes. Contested by both teams.' },
    { id: 'true-sight', term: 'True Sight', shortDef: 'The ability to see invisible units, granted by specific items or towers.' },
  ]

  const pickTournamentFields = s => ({
    id: s.id,
    name: s.name,
    leagueName: s.leagueName,
    beginAt: s.beginAt,
    endAt: s.endAt,
    prizePool: s.prizePool,
    ...(s.winner ? { winner: s.winner } : {}),
  })

  const payload = {
    site: {
      name: 'Spectate Esports',
      url: 'https://spectateesports.live',
      description: 'Real-time pro Dota 2 esports platform. Live match scores, timestamped Twitch VODs, hero drafts, gold advantage graphs, player stats, tournament brackets, and AI match summaries.',
      sport: 'Dota 2',
      coverage: 'Tier 1 international professional matches only',
      founded: 2026,
      social: { x: 'https://x.com/SpectateDota2' },
    },
    tournaments: {
      live:      (seriesData.live      || []).map(pickTournamentFields),
      upcoming:  (seriesData.upcoming  || []).map(pickTournamentFields),
      completed: (seriesData.completed || []).map(pickTournamentFields),
    },
    tier1Organizers: [
      'DreamLeague (ESL Gaming / DreamHack)',
      'ESL One',
      'PGL',
      'BLAST',
      'WePlay',
      'The International (Valve)',
      'Riyadh Masters',
      'Beyond The Summit',
    ],
    dataSources: [
      { name: 'OpenDota API', url: 'https://api.opendota.com', description: 'Match results, player stats, draft data, gold advantage graphs', lag: '30–90 minutes after match end' },
      { name: 'PandaScore API', url: 'https://pandascore.co', description: 'Live scores, tournament brackets, team rosters, stream links', lag: 'Real-time, cached 2 minutes' },
      { name: 'Twitch Helix API', url: 'https://dev.twitch.tv', description: 'VOD links timestamped to game start' },
      { name: 'Steam Community RSS', url: 'https://www.dota2.com', description: 'Official Valve announcements and patch notes' },
      { name: 'Liquipedia MediaWiki API', url: 'https://liquipedia.net/dota2', description: 'Roster transfers and team news' },
    ],
    apiEndpoints: [
      { url: 'https://spectateesports.live/api/live-matches',              format: 'JSON', description: 'Currently live Tier 1 matches with scores and stream links' },
      { url: 'https://spectateesports.live/api/upcoming-matches',          format: 'JSON', description: 'Upcoming scheduled Tier 1 matches' },
      { url: 'https://spectateesports.live/api/tournaments?mode=series',   format: 'JSON', description: 'All live, upcoming, and completed tournament series' },
      { url: 'https://spectateesports.live/api/tournaments?mode=llms-data',format: 'JSON', description: 'Structured entity data for AI systems (this endpoint)' },
      { url: 'https://spectateesports.live/api/news',                      format: 'JSON', description: 'Aggregated Dota 2 news from Steam, Liquipedia, and editorial sources' },
      { url: 'https://spectateesports.live/api/news?format=rss',           format: 'RSS',  description: 'Same news feed in RSS 2.0 format' },
      { url: 'https://spectateesports.live/sitemap.xml',                   format: 'XML',  description: 'Full sitemap including match pages, tournament pages, and glossary' },
      { url: 'https://spectateesports.live/llms.txt',                      format: 'text', description: 'Machine-readable site index for LLMs' },
      { url: 'https://spectateesports.live/llms-full.txt',                 format: 'text', description: 'Extended LLM index with full entity data' },
    ],
    glossaryIndex,
    generatedAt: new Date().toISOString(),
  }

  kv.set(LLMS_DATA_KV_KEY, payload, { ex: LLMS_DATA_TTL }).catch(() => {})
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
  return res.status(200).json(payload)
}

export const config = {
  matcher: [
    '/match/:matchId*',
    '/news',
    '/tournaments',
    '/tournament/:seriesId*',
    '/about',
    '/release-notes',
    '/calendar',
    '/glossary',
    '/glossary/:termId*',
    '/teams',
    '/teams/:slug*',
    '/articles',
    '/articles/:slug*',
    '/heroes',
    '/heroes/:slug*',
  ],
}

// Tier 1 team data (kept inline — edge middleware cannot import from src/)
// Source of truth: src/data/teams.js — keep in sync manually.
// Sources: Liquipedia (https://liquipedia.net/dota2/)
// DO NOT add player rosters. See .claude/staleness-checklist.md for review schedule.
const TIER1_TEAMS_SSR = [
  { id: 'og', name: 'OG', region: 'WEU', basedIn: 'Europe', tiWins: [2018, 2019], shortDesc: 'The first team to win back-to-back Internationals. Two-time TI champions.', liquipedia: 'https://liquipedia.net/dota2/OG' },
  { id: 'team-liquid', name: 'Team Liquid', region: 'WEU', basedIn: 'Netherlands', tiWins: [2017, 2024], shortDesc: 'Two-time TI champions. The first organization to win The International with two different rosters.', liquipedia: 'https://liquipedia.net/dota2/Team_Liquid' },
  { id: 'team-spirit', name: 'Team Spirit', region: 'EEU', basedIn: 'Russia', tiWins: [2021, 2023], shortDesc: 'Two-time TI champions from Eastern Europe. The second team after OG to win multiple Internationals.', liquipedia: 'https://liquipedia.net/dota2/Team_Spirit' },
  { id: 'tundra-esports', name: 'Tundra Esports', region: 'WEU', disbanded: true, basedIn: 'United Kingdom', tiWins: [2022], shortDesc: 'The International 2022 champions. Exited competitive Dota 2 in June 2026, with their entire roster transferring to 1win.', liquipedia: 'https://liquipedia.net/dota2/Tundra_Esports' },
  { id: '1win', name: '1win Team', region: 'EEU', basedIn: 'Russia', tiWins: [], shortDesc: 'Russian Dota 2 organization that signed the full Tundra Esports roster in June 2026, inheriting their TI 2026 direct invite.', liquipedia: 'https://liquipedia.net/dota2/1win_Team' },
  { id: 'team-falcons', name: 'Team Falcons', region: 'WEU', basedIn: 'Saudi Arabia', tiWins: [2025], shortDesc: 'The International 2025 champions. Entered Dota 2 in 2023 and won TI within two years.', liquipedia: 'https://liquipedia.net/dota2/Team_Falcons' },
  { id: 'evil-geniuses', name: 'Evil Geniuses', region: 'NA', disbanded: true, basedIn: 'United States', tiWins: [2015], shortDesc: 'The International 2015 champions. The first North American organization to win The International. Dota 2 division disbanded in November 2023.', liquipedia: 'https://liquipedia.net/dota2/Evil_Geniuses' },
  { id: 'nigma-galaxy', name: 'Nigma Galaxy', region: 'WEU', basedIn: 'United Arab Emirates', tiWins: [], shortDesc: 'Founded in 2019 by four members of Team Liquid\'s The International 2017 championship roster.', liquipedia: 'https://liquipedia.net/dota2/Nigma_Galaxy' },
  { id: 'betboom-team', name: 'BetBoom Team', region: 'EEU', basedIn: 'Russia', tiWins: [], shortDesc: 'Russian Dota 2 organization established in 2022, competing consistently in Tier 1 international events.', liquipedia: 'https://liquipedia.net/dota2/BetBoom_Team' },
  { id: 'virtus-pro', name: 'Virtus.pro', region: 'EEU', basedIn: 'Russia', tiWins: [], shortDesc: 'Russian esports institution in Dota 2 since 2012. Won five major championships in 2017–2018.', liquipedia: 'https://liquipedia.net/dota2/Virtus.pro' },
  { id: 'xtreme-gaming', name: 'Xtreme Gaming', region: 'CN', basedIn: 'China', tiWins: [], shortDesc: 'Chinese Dota 2 organization and The International 2025 runners-up.', liquipedia: 'https://liquipedia.net/dota2/Xtreme_Gaming' },
]
const TIER1_TEAMS_MAP_SSR = Object.fromEntries(TIER1_TEAMS_SSR.map(t => [t.id, t]))

// Glossary term definitions (kept inline — edge middleware cannot import from src/)
const GLOSSARY_TERMS_SSR = [
  { id: 'draft', term: 'Draft', shortDef: 'The hero pick-and-ban phase before each Dota 2 game.', definition: 'The draft is the strategic pre-game phase where teams alternate banning and picking heroes. In Captains Mode — used in all professional play — banned heroes cannot be picked by either side, and no hero appears on both teams. The draft is the most strategically complex phase of professional Dota 2. Teams prepare custom strategies targeting opponents, exploiting weaknesses, or counter-picking predicted lineups.' },
  { id: 'gpm', term: 'GPM (Gold Per Minute)', shortDef: 'A stat measuring a player\'s average gold income rate throughout the game.', definition: 'GPM (Gold Per Minute) equals total gold earned divided by game duration in minutes. Carry players typically achieve 700–900 GPM; supports average 200–400 GPM. High GPM indicates effective farming, kill participation, and bounty rune collection. GPM is the primary metric for evaluating carry performance and net-worth leads.' },
  { id: 'roshan', term: 'Roshan', shortDef: 'The most powerful neutral monster in Dota 2. Killing it grants the Aegis of the Immortal.', definition: 'Roshan is a unique neutral monster in the river pit. Killing him grants the Aegis of the Immortal (revives carrier once) and, after the first kill, Cheese. He respawns 8–11 minutes after death. Roshan is the most contested objective in professional Dota 2 — teams plan entire match strategies around his timing windows.' },
  { id: 'rampage', term: 'Rampage', shortDef: 'Killing all 5 enemy heroes within approximately 40 seconds — the highest kill streak in Dota 2.', definition: 'A Rampage is achieved when a single hero kills all 5 enemy heroes within ~40 seconds. It is extremely rare in professional play. A distinct global audio cue plays on achievement. On Spectate Esports, a Rampage badge appears on the match card and draft for any player who scored one.' },
  { id: 'divine-rapier', term: 'Divine Rapier', shortDef: 'A 6,200-gold item granting massive damage that drops on death — a desperation or decisive-push purchase.', definition: 'Divine Rapier costs 6,200 gold and grants +330 attack damage — the highest raw damage item. Its drawback: it drops when the carrier dies and the enemy can pick it up permanently. A Rapier purchase signals an imminent high-stakes teamfight. On Spectate Esports, a sword badge appears when a team held a Rapier.' },
  { id: 'aegis', term: 'Aegis of the Immortal', shortDef: 'An item dropped by Roshan that revives the carrier in place after death.', definition: 'The Aegis is dropped by Roshan when killed — not purchasable. The carrier is resurrected with full health and mana if they die. The Aegis expires after 5 minutes unused. Professional teams almost always give it to their carry, enabling high-risk plays and base dives that would otherwise be fatal.' },
  { id: 'mega-creeps', term: 'Mega Creeps', shortDef: 'Empowered creep waves that spawn when all of a team\'s barracks are destroyed.', definition: 'Mega Creeps spawn when all six barracks of a team are destroyed. They are significantly stronger than regular creeps — more damage, more health. The defending team must win a decisive teamfight or use buybacks, as heroes cannot hold lanes solo against Mega Creep pressure.' },
  { id: 'buyback', term: 'Buyback', shortDef: 'Spending gold to immediately respawn after death — a critical comeback and defense mechanic.', definition: 'Buyback lets any hero pay ~(100 + net_worth/13) gold to instantly respawn, bypassing the respawn timer. Late-game buybacks cost 2,000–4,000+ gold. After buyback, there is a 25-second grace period before another can be used. Buyback decisions are among the most strategically significant moments in any professional match.' },
  { id: 'net-worth', term: 'Net Worth', shortDef: 'The total gold value of a player\'s items plus unspent gold — the primary team economy metric.', definition: 'Net worth is the gold value of all items in a player\'s inventory plus unspent gold. Spectate Esports tracks combined team net worth over time in the gold advantage graph. A 10,000 gold lead is significant; 20,000+ indicates dominance. Large net-worth swings correspond to teamfight outcomes and map control shifts.' },
  { id: 'first-blood', term: 'First Blood', shortDef: 'The first hero kill of the game — earns the killer bonus gold.', definition: 'First Blood is the first hero kill of a Dota 2 game. The scorer receives bonus gold and a distinct global audio cue plays. It reveals strategic information: which lane lost a hero, how aggressive each team is playing, and which hero the enemy is targeting.' },
  { id: 'smoke-of-deceit', term: 'Smoke of Deceit', shortDef: 'A consumable that makes a group of heroes invisible and grants movement speed — used for coordinated ganks.', definition: 'Smoke of Deceit (50 gold) makes the user and nearby allies invisible with +15% movement speed. Invisibility breaks within ~1,025 units of an enemy hero or tower. Used to coordinate unseen rotations to ambush isolated enemies or set up Roshan. Professional teams buy 5–10 smokes per game.' },
  { id: 'ancient', term: 'Ancient', shortDef: 'The main structure each team must destroy to win the game.', definition: 'The Ancient is the primary win-condition structure at each team\'s base. Destroying the enemy Ancient ends the game instantly regardless of any other game state. Teams must fight through towers and barracks to reach it. Sometimes teams delay the final push to secure an Aegis or avoid a buyback window.' },
  { id: 'barracks', term: 'Barracks', shortDef: 'Structures behind Tier 3 towers that, when destroyed, grant the enemy empowered creeps.', definition: 'Each lane has two barracks (ranged and melee). Destroying an enemy barracks upgrades your own creeps in that lane. Destroying all six spawns Mega Creeps. In professional play, taking barracks allows a carry to farm elsewhere while empowered creep waves push autonomously.' },
  { id: 'bkb', term: 'BKB (Black King Bar)', shortDef: 'A 4,050-gold item granting 9–5 seconds of magic immunity — standard in professional matches.', definition: 'Black King Bar (4,050 gold) grants Avatar status when activated — immunity to magic damage and most disabling spells for 9 seconds, decreasing by 1 second per use (minimum 5 seconds). Carries build BKB to survive crowd control in teamfights. "BKB out" signals a window to chain-disable an enemy carry.' },
  { id: 'tp-scroll', term: 'TP Scroll (Town Portal Scroll)', shortDef: 'A 100-gold consumable that teleports a hero to any friendly structure after a 3-second channel.', definition: 'The TP Scroll (100 gold) teleports a hero to any friendly tower or barracks after a 3-second channel. 65-second cooldown. Essential for map coverage — defending towers, responding to ganks, and converging on objectives. Being "caught without TP" is a frequent strategic mistake in professional play.' },
  { id: 'courier', term: 'Courier', shortDef: 'A personal unit that delivers items from the base stash to heroes anywhere on the map.', definition: 'Each player starts with a personal courier in modern Dota 2. It automatically carries purchased items from the base to the hero on the map. Killing an enemy courier early denies critical item delivery. Courier efficiency is a key support responsibility in professional play.' },
  { id: 'carry', term: 'Carry (Position 1)', shortDef: 'The primary late-game damage dealer who farms to scale into the most powerful hero.', definition: 'Carries (Position 1) are weak early but dominant late game once core items are assembled. They spend the first 15–25 minutes farming to maximize GPM and net worth. Carry farm efficiency, item timing, and teamfight impact are primary professional performance metrics. Common carries: Juggernaut, Anti-Mage, Morphling, Terrorblade.' },
  { id: 'support', term: 'Support (Position 4 / Position 5)', shortDef: 'Utility roles who buy vision wards and sacrifice farm to enable teammates.', definition: 'Supports (Position 4 soft support, Position 5 hard support) sacrifice personal farm to buy vision (observer wards, sentry wards), smoke of deceit, and utility items. Hard supports have the lowest gold income of any role. Support quality — vision control, stun timing, save spells — is frequently the differentiating factor between professional teams.' },
  { id: 'offlane', term: 'Offlane (Position 3)', shortDef: 'The solo lane role — plays opposite the enemy carry to disrupt their farm.', definition: 'The offlaner (Position 3) plays in the "hard" lane opposite the enemy carry, typically facing a 1v2 or 1v3 situation. They require high durability and strong utility. Their goal is denying carry farm while creating lane pressure, then transitioning to a teamfight role. Iconic offlaners: Axe, Tidehunter, Centaur Warrunner.' },
  { id: 'mid-lane', term: 'Mid Lane (Position 2)', shortDef: 'The solo center lane role — high-mobility heroes who rotate to create early advantages.', definition: 'Mid laners (Position 2) play the center lane in a 1v1 matchup. The mid lane is the shortest on the map and has nearby rune spawns. Mid laners aim to win their lane and rotate to create kills elsewhere. Common mids: Lina, Storm Spirit, Puck, Invoker, Shadow Fiend.' },
  { id: 'last-hit', term: 'Last Hit', shortDef: 'Dealing the killing blow to a creep or building to collect the gold bounty.', definition: 'Only the hero landing the killing blow on a creep receives gold. This makes farming a skill-intensive mechanical discipline. Professional carries achieve 600+ last-hits by minute 30. Last-hit count versus deny count (e.g. 150/15) is the standard laning-phase performance metric.' },
  { id: 'deny', term: 'Deny', shortDef: 'Killing your own low-health creep to prevent the enemy from collecting its gold or experience.', definition: 'A deny is killing an allied creep below 50% health before an enemy can last-hit it. This prevents the enemy from collecting the gold bounty and reduces their experience gain. Denial is a core Dota 2 mechanic that distinguishes it from other MOBAs, where denying your own creeps is impossible.' },
  { id: 'teamfight', term: 'Teamfight', shortDef: 'A multi-hero engagement where three or more heroes from each team clash over objectives.', definition: 'Teamfights are the climactic moments of Dota 2 — they determine map control, Roshan, and barracks. Professional teams build entire strategies around forcing or avoiding fights under specific conditions: BKBs active vs. on cooldown, after key ultimates are ready, or from smoke-ambush positions. Gold swings of 15,000–25,000 are common after decisive teamfights.' },
  { id: 'bounty-rune', term: 'Bounty Rune', shortDef: 'A gold-granting rune spawning every 3 minutes at fixed map locations.', definition: 'Bounty Runes spawn every 3 minutes at fixed map locations, granting gold worth ~40 + (game_minutes × 3). Four spawn simultaneously each cycle. In professional play, supports contest Bounty Runes and dedicated rotations happen to secure or deny them. Efficient rune control represents 1,500–3,000+ gold per player over a full game.' },
  { id: 'true-sight', term: 'True Sight', shortDef: 'The ability to see invisible units — essential for countering Smoke of Deceit and invisible heroes.', definition: 'True sight reveals invisible units and wards. Sentry Wards provide true sight in a radius. Many heroes and Smoke of Deceit use invisibility — true sight counters them. An invisible hero channeling a TP Scroll is revealed to both teams. Constant dewarding (destroying enemy wards) and counter-warding is called the "vision war."' },
]

const GLOSSARY_TERM_MAP_SSR = Object.fromEntries(GLOSSARY_TERMS_SSR.map(t => [t.id, t]))

// Article metadata is now served dynamically from /api/pipeline?type=articles (Supabase).
// The functions below fetch from that endpoint with a short timeout.

const BASE_URL = 'https://spectateesports.live'
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`
const SITE_NAME = 'Spectate Esports'

const LLM_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'claude-web', 'anthropic-ai',
  'Google-Extended',
  'PerplexityBot',
  'Bytespider',
  'CCBot',
  'DiffBot',
  'FacebookBot',
  'cohere-ai',
  'YouBot',
  'Applebot-Extended',
]

export default async function middleware(req) {
  const url = new URL(req.url)
  const { pathname } = url

  const ua = req.headers.get('user-agent') || ''
  const matchedBot = LLM_BOTS.find(b => ua.toLowerCase().includes(b.toLowerCase()))
  if (matchedBot) {
    console.log(JSON.stringify({ event: 'llm_bot_visit', bot: matchedBot, ua, path: pathname, ts: new Date().toISOString() }))
  }

  if (pathname === '/news') return handleNews(url)
  if (pathname === '/tournaments') return handleTournaments(url)
  if (pathname.startsWith('/tournament/')) return handleTournamentDetail(url)
  if (pathname === '/about') return handleAbout(url)
  if (pathname === '/release-notes') return handleReleaseNotes(url)
  if (pathname === '/calendar') return handleCalendar(url)
  if (pathname.startsWith('/match/')) return handleMatch(url)
  if (pathname === '/glossary') return handleGlossary(url)
  if (pathname.startsWith('/glossary/')) return handleGlossaryTerm(url)
  if (pathname === '/teams') return handleTeams(url)
  if (pathname.startsWith('/teams/')) return handleTeamDetail(url)
  if (pathname === '/articles') return handleArticles(url)
  if (pathname.startsWith('/articles/')) return handleArticleDetail(url)
  if (pathname === '/heroes') return handleHeroes(url)
  if (pathname.startsWith('/heroes/')) return handleHeroDetail(url)

  return new Response(null, { status: 302, headers: { Location: '/' } })
}

// ─── /news ───────────────────────────────────────────────────────────────────

async function handleNews(url) {
  const title = 'Dota 2 Esports News | Spectate Esports'
  const description = 'Latest Dota 2 pro match results, roster moves, patch notes, and tournament updates. Aggregated from Steam, Liquipedia, and top esports editorial sources.'
  const canonical = `${BASE_URL}/news`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([{ name: 'News', url: canonical }]),
      },
      {
        '@type': 'NewsMediaOrganization',
        '@id': `${BASE_URL}/#newsmedia`,
        'name': SITE_NAME,
        'url': BASE_URL,
        'description': 'Dota 2 esports news aggregator covering pro match results, roster transfers, tournament updates, and Valve patch notes.',
        'publishingPrinciples': `${BASE_URL}/about`,
      },
    ],
  }
  // Fetch live article headlines to inject into server-rendered HTML
  let articleListHtml = ''
  try {
    const newsController = new AbortController()
    const newsTimeout = setTimeout(() => newsController.abort(), 2000)
    const newsRes = await fetch(`${BASE_URL}/api/news?limit=10`, { signal: newsController.signal }).catch(() => null)
    clearTimeout(newsTimeout)
    if (newsRes?.ok) {
      const newsData = await newsRes.json().catch(() => null)
      const articles = newsData?.articles || []
      if (articles.length > 0) {
        const items = articles.map(a =>
          `<li style="margin-bottom:8px"><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a> <span style="color:#888;font-size:0.85em">(${escapeHtml(a.source?.name || '')})</span></li>`
        ).join('')
        articleListHtml = `<h2>Recent Headlines</h2><ul>${items}</ul>`
      }
    }
  } catch (_) {
    // graceful fallback — no headlines injected
  }

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › News</nav>
      <h1>Dota 2 Esports News</h1>
      <p>Latest Dota 2 pro match results, roster moves, patch notes, and tournament updates. Sources: Steam Community (official Valve announcements), Liquipedia (player transfers and roster changes), PCGamesN, Dot Esports, and Currents API. Updated every 30 minutes.</p>
      <p>Coverage includes Tier 1 teams: Team Spirit, Team Liquid, Team Falcons, OG, Tundra Esports, BetBoom Team, Virtus.pro, Xtreme Gaming, and all DreamLeague, ESL One, PGL, BLAST, and WePlay participants.</p>
      ${articleListHtml}
    </main>`

  const rssLink = `<link rel="alternate" type="application/rss+xml" title="Spectate Esports — Dota 2 News" href="${BASE_URL}/api/news?format=rss" />`
  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent, rssLink)
}

// ─── /tournaments ─────────────────────────────────────────────────────────────

async function handleTournaments(url) {
  const title = 'Dota 2 Esports Tournaments — Standings, Brackets & Rosters | Spectate Esports'
  const description = 'Browse all active and upcoming Tier 1 Dota 2 tournaments. View standings, playoffs brackets, team rosters, hero statistics, and live match schedules.'
  const canonical = `${BASE_URL}/tournaments`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'about': {
          '@type': 'SportsOrganization',
          'name': 'Dota 2 Esports',
          'sport': 'Dota 2',
        },
        'breadcrumb': breadcrumb([{ name: 'Tournaments', url: canonical }]),
      },
    ],
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Tournaments</nav>
      <h1>Dota 2 Esports Tournaments</h1>
      <p>Active and upcoming Tier 1 professional Dota 2 tournaments. Includes group stage standings, double-elimination playoff brackets, team rosters with player details, hero pick/ban statistics, and full match schedules.</p>
      <h2>Tier 1 Tournaments Covered</h2>
      <ul>
        <li>DreamLeague — ESL Gaming's premier European LAN circuit</li>
        <li>ESL One — International LAN events (Birmingham, Kuala Lumpur)</li>
        <li>PGL — Major international organizer (PGL Wallachia, PGL Lausanne)</li>
        <li>BLAST — International circuit (BLAST Slam, BLAST Bounty)</li>
        <li>WePlay — International esports events</li>
        <li>The International (TI) — Valve's annual world championship, largest prize pool in esports</li>
        <li>Riyadh Masters — Saudi Arabia super tournament by Gamers8</li>
        <li>Beyond The Summit (BTS) — Boutique production events</li>
      </ul>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /tournament/:id ─────────────────────────────────────────────────────────

async function handleTournamentDetail(url) {
  const pathPart = url.pathname.replace('/tournament/', '').split('/')[0]
  const seriesId = pathPart || null

  if (!seriesId) {
    return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/tournaments` } })
  }

  const canonical = `${BASE_URL}/tournament/${seriesId}`

  // Default fallback values
  let title = `Dota 2 Tournament — ${SITE_NAME}`
  let description = 'View tournament standings, playoff bracket, team rosters, hero statistics, and AI match summaries on Spectate Esports.'
  let jsonLd = null
  let rootContent = null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const apiRes = await fetch(`${BASE_URL}/api/tournament-detail?series=1&id=${seriesId}`, {
      signal: controller.signal,
    }).catch(() => null)
    clearTimeout(timeoutId)

    if (apiRes?.ok) {
      const data = await apiRes.json().catch(() => null)
      if (data?.name) {
        const tName = data.name
        const league = data.leagueName || ''
        const prizeStr = data.prizePool ? ` — $${(data.prizePool / 1000).toFixed(0)}K prize pool` : ''
        const statusStr = data.status === 'running' ? ' (Live)' : data.status === 'upcoming' ? ' (Upcoming)' : ''
        const teamCount = data.teams?.length ?? 0

        title = `${tName}${statusStr} — Standings, Bracket & Rosters | ${SITE_NAME}`
        description = `${tName}: full tournament standings, playoff bracket, team rosters${prizeStr}. ${teamCount > 0 ? `${teamCount} teams competing.` : ''} Hero pick/ban stats and AI summary on Spectate Esports.`

        const contestants = (data.teams || []).map(t => ({
          '@type': 'SportsTeam',
          'name': t.name,
          ...(t.imageUrl ? { 'image': t.imageUrl } : {}),
        }))

        const sportsEventNode = data.beginAt ? {
          '@type': 'SportsEvent',
          '@id': `${canonical}#event`,
          'name': tName,
          'url': canonical,
          'sport': 'Dota 2',
          'eventStatus': data.status === 'running' || data.status === 'upcoming'
            ? 'https://schema.org/EventScheduled'
            : 'https://schema.org/EventCompleted',
          'startDate': data.beginAt,
          ...(data.endAt ? { 'endDate': data.endAt } : {}),
          'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
          'location': { '@type': 'VirtualLocation', 'url': `${BASE_URL}/tournament/${seriesId}` },
          'image': data.imageUrl || DEFAULT_OG_IMAGE,
          ...(data.prizePool ? { 'description': `${tName}. Prize pool: $${data.prizePool.toLocaleString()} USD.` } : {}),
          'organizer': {
            '@type': 'SportsOrganization',
            'name': league || SITE_NAME,
            'sport': 'Dota 2',
            'url': data.liquipediaUrl || BASE_URL,
          },
          ...(contestants.length > 0 ? { 'competitor': contestants, 'performer': contestants } : {}),
          'offers': {
            '@type': 'Offer',
            'name': 'Free to watch',
            'price': 0,
            'priceCurrency': 'USD',
            'availability': 'https://schema.org/InStock',
            'url': canonical,
            'validFrom': data.beginAt,
          },
        } : null

        jsonLd = {
          '@context': 'https://schema.org',
          '@graph': [
            ...(sportsEventNode ? [sportsEventNode] : []),
            {
              '@type': 'WebPage',
              '@id': `${canonical}#webpage`,
              'name': title,
              'description': description,
              'url': canonical,
              'isPartOf': { '@id': `${BASE_URL}/#website` },
              'breadcrumb': breadcrumb([
                { name: 'Tournaments', url: `${BASE_URL}/tournaments` },
                { name: tName, url: canonical },
              ]),
            },
          ],
        }

        const teamListItems = (data.teams || []).slice(0, 16).map(t => {
          const players = (t.players || []).map(p => p.name).join(', ')
          return `<li><strong>${escapeHtml(t.name)}</strong>${players ? ` — ${escapeHtml(players)}` : ''}</li>`
        }).join('')

        const standingRows = (data.standings || []).slice(0, 8).map(s =>
          `<tr><td>${s.rank}</td><td>${escapeHtml(s.teamName)}</td><td>${s.wins}-${s.losses}</td></tr>`
        ).join('')

        rootContent = `
          <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
            <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/tournaments">Tournaments</a> › ${escapeHtml(tName)}</nav>
            <h1>${escapeHtml(tName)}${statusStr}</h1>
            <p>${escapeHtml(description)}</p>
            ${data.standings?.length > 0 ? `<h2>Standings</h2><table><thead><tr><th>Rank</th><th>Team</th><th>W-L</th></tr></thead><tbody>${standingRows}</tbody></table>` : ''}
            ${data.teams?.length > 0 ? `<h2>Teams (${teamCount})</h2><ul>${teamListItems}</ul>` : ''}
          </main>`
      }
    }
  } catch (_) {
    // fallback to defaults above
  }

  if (!jsonLd) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': title,
      'description': description,
      'url': canonical,
      'isPartOf': { '@id': `${BASE_URL}/#website` },
    }
  }

  if (!rootContent) {
    rootContent = `
      <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
        <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/tournaments">Tournaments</a></nav>
        <h1>Dota 2 Tournament</h1>
        <p>${escapeHtml(description)}</p>
      </main>`
  }

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /about ───────────────────────────────────────────────────────────────────

async function handleAbout(url) {
  const title = `About — ${SITE_NAME}`
  const description = 'Spectate Esports is a pro Dota 2 esports platform providing live match scores, timestamped Twitch VODs, hero drafts, gold graphs, and AI match summaries. Data sourced from OpenDota, PandaScore, and Twitch.'
  const canonical = `${BASE_URL}/about`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([{ name: 'About', url: canonical }]),
        'about': { '@id': `${BASE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${BASE_URL}/#organization`,
        'name': SITE_NAME,
        'url': BASE_URL,
        'description': description,
        'sameAs': ['https://x.com/SpectateDota2'],
      },
    ],
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › About</nav>
      <h1>About Spectate Esports</h1>
      <p>Spectate Esports is a pro Dota 2 match viewer and esports intelligence platform. It provides direct timestamped Twitch VOD links for any professional Dota 2 match, the full hero pick-and-ban draft, per-minute gold advantage graphs, end-game player statistics, and AI-generated match summaries.</p>
      <h2>Data Sources</h2>
      <ul>
        <li><strong>OpenDota</strong> — Match statistics, drafts, gold graphs (open-source community API)</li>
        <li><strong>PandaScore</strong> — Live scores, upcoming schedules, tournament structure</li>
        <li><strong>Twitch Helix API</strong> — VOD discovery and timestamping</li>
        <li><strong>Steam Community RSS</strong> — Official Valve announcements</li>
        <li><strong>Liquipedia</strong> — Player roster transfers</li>
        <li><strong>Anthropic Claude</strong> — AI match and tournament summaries</li>
      </ul>
      <h2>Coverage</h2>
      <p>Tier 1 professional Dota 2 only: DreamLeague, ESL One, PGL, BLAST, WePlay, The International, Riyadh Masters, Beyond The Summit.</p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /release-notes ──────────────────────────────────────────────────────────

async function handleReleaseNotes(url) {
  const title = `Release Notes — ${SITE_NAME}`
  const description = 'Feature changelog and version history for Spectate Esports, the pro Dota 2 match viewer.'
  const canonical = `${BASE_URL}/release-notes`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    'name': title,
    'description': description,
    'url': canonical,
    'isPartOf': { '@id': `${BASE_URL}/#website` },
    'breadcrumb': breadcrumb([{ name: 'Release Notes', url: canonical }]),
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Release Notes</nav>
      <h1>Release Notes</h1>
      <p>Spectate Esports feature changelog and version history. Recent additions include gold advantage graphs with interactive event markers, player performance leaderboards, AI tournament summaries, push notifications for followed teams, and PWA (installable app) support.</p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /calendar ────────────────────────────────────────────────────────────────

async function handleCalendar(url) {
  const title = `Dota 2 Tournament Calendar — Subscribe to Pro Match Schedules | ${SITE_NAME}`
  const description = 'Subscribe to live-updating .ics calendar feeds for Dota 2 pro matches. Add all Tier 1 tournaments, specific teams, or individual events to Google Calendar, Apple Calendar, or Outlook. Auto-updates as schedules change.'
  const canonical = `${BASE_URL}/calendar`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonical}#webpage`,
    'name': title,
    'description': description,
    'url': canonical,
    'isPartOf': { '@id': `${BASE_URL}/#website` },
    'breadcrumb': breadcrumb([{ name: 'Calendar', url: canonical }]),
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Calendar</nav>
      <h1>Dota 2 Pro Match Calendar</h1>
      <p>Subscribe to auto-updating .ics calendar feeds for professional Dota 2 matches. Compatible with Google Calendar, Apple Calendar (iCal), and Microsoft Outlook.</p>
      <h2>Feed Types</h2>
      <ul>
        <li><strong>All Tournaments</strong> — Every Tier 1 Dota 2 match, auto-updating</li>
        <li><strong>Team Feed</strong> — Select specific teams (e.g. "Team Spirit", "Team Liquid")</li>
        <li><strong>Per-Tournament Feed</strong> — Individual tournament event calendars</li>
      </ul>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /match/:id ──────────────────────────────────────────────────────────────

async function handleMatch(url) {
  const pathPart = url.pathname.replace('/match/', '').split('/')[0]
  const matchIdMatch = pathPart.match(/(\d+)$/)
  const matchId = matchIdMatch ? matchIdMatch[1] : null

  if (!matchId) {
    return new Response(null, { status: 302, headers: { Location: '/' } })
  }

  const canonical = `${url.origin}${url.pathname}`

  let title = `Pro Dota 2 Match — ${SITE_NAME}`
  let description = 'Watch pro Dota 2 matches with direct Twitch VOD links, draft analysis, and AI summaries.'
  let imageUrl = `${url.origin}/api/og`
  let jsonLd = null

  try {
    const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
    const data = await res.json()

    if (data?.match_id) {
      const radiantTeam = data.radiant_name || 'Radiant'
      const direTeam = data.dire_name || 'Dire'
      const winner = data.radiant_win ? radiantTeam : direTeam
      const loser = data.radiant_win ? direTeam : radiantTeam
      const radiantScore = data.radiant_score
      const direScore = data.dire_score
      const winnerScore = data.radiant_win ? radiantScore : direScore
      const loserScore = data.radiant_win ? direScore : radiantScore
      const league = data.league?.name || ''

      const hasScore = winnerScore != null && loserScore != null
      const scoreStr = hasScore ? `${winnerScore}-${loserScore}` : 'WIN'

      title = `${winner} ${scoreStr} ${loser} — ${SITE_NAME}`
      description = `${winner} defeated ${loser} ${scoreStr}. Watch the VOD, see the draft, and get an AI match summary on Spectate Esports.`
      if (league) {
        description += ` ${league}.`
      }
      imageUrl = `${url.origin}/api/og?matchId=${matchId}`

      const matchCompetitors = [
        { '@type': 'SportsTeam', 'name': radiantTeam },
        { '@type': 'SportsTeam', 'name': direTeam },
      ]
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SportsEvent',
            '@id': `${canonical}#event`,
            'name': `${radiantTeam} vs ${direTeam}`,
            'url': canonical,
            'sport': 'Dota 2',
            'description': description,
            'eventStatus': 'https://schema.org/EventCompleted',
            'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
            ...(data.start_time ? { 'startDate': new Date(data.start_time * 1000).toISOString() } : {}),
            'location': { '@type': 'VirtualLocation', 'url': canonical },
            'image': imageUrl,
            ...(league ? {
              'organizer': {
                '@type': 'SportsOrganization',
                'name': league,
                'sport': 'Dota 2',
                'url': BASE_URL,
              },
            } : {}),
            'competitor': matchCompetitors,
            'performer': matchCompetitors,
            ...(data.radiant_win != null ? {
              'winner': { '@type': 'SportsTeam', 'name': winner },
            } : {}),
            'offers': {
              '@type': 'Offer',
              'name': 'Free to watch',
              'price': 0,
              'priceCurrency': 'USD',
              'availability': 'https://schema.org/InStock',
              'url': canonical,
              ...(data.start_time ? { 'validFrom': new Date(data.start_time * 1000).toISOString() } : {}),
            },
          },
          {
            '@type': 'WebPage',
            '@id': `${canonical}#webpage`,
            'name': title,
            'description': description,
            'url': canonical,
            'isPartOf': { '@id': `${BASE_URL}/#website` },
            'breadcrumb': breadcrumb([
              { name: 'Match', url: `${BASE_URL}/match` },
              { name: `${radiantTeam} vs ${direTeam}`, url: canonical },
            ]),
          },
        ],
      }
    }
  } catch (_) {
    // fallback to defaults
  }

  if (!jsonLd) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': title,
      'description': description,
      'url': canonical,
    }
  }

  const indexRes = await fetch(`${url.origin}/index.html`)
  let html = await indexRes.text()

  const ogTags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
  `

  html = html.replace(/<title>[^<]*<\/title>/gi, '')
  html = html.replace(/<meta[^>]*property="og:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace(/<meta[^>]*name="twitter:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace('</head>', ogTags + '</head>')
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div></div>`
  )

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ─── /glossary ────────────────────────────────────────────────────────────────

async function handleGlossary(url) {
  const title = 'Dota 2 Glossary — Key Terms for Pro Dota 2 | Spectate Esports'
  const description = 'Definitions for professional Dota 2 terms: draft, GPM, Roshan, Rampage, Divine Rapier, Aegis, Mega Creeps, BKB, and more. Essential reference for esports viewers and analysts.'
  const canonical = `${BASE_URL}/glossary`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTermSet',
        '@id': `${canonical}#termset`,
        'name': 'Dota 2 Glossary',
        'description': description,
        'url': canonical,
        'inLanguage': 'en',
      },
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([{ name: 'Glossary', url: canonical }]),
      },
    ],
  }
  const termListItems = GLOSSARY_TERMS_SSR.map(t =>
    `<li><a href="${BASE_URL}/glossary/${t.id}"><strong>${escapeHtml(t.term)}</strong></a> — ${escapeHtml(t.shortDef)}</li>`
  ).join('')
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Glossary</nav>
      <h1>Dota 2 Glossary</h1>
      <p>Definitions for essential professional Dota 2 terminology covering game mechanics, hero roles, items, and objectives used in Tier 1 esports competition.</p>
      <ul>${termListItems}</ul>
    </main>`
  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /glossary/:term ──────────────────────────────────────────────────────────

async function handleGlossaryTerm(url) {
  const termId = url.pathname.replace('/glossary/', '').split('/')[0]
  const term = GLOSSARY_TERM_MAP_SSR[termId]

  if (!term) {
    return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/glossary` } })
  }

  const canonical = `${BASE_URL}/glossary/${termId}`
  const title = `${term.term} — Dota 2 Glossary | Spectate Esports`
  const description = term.shortDef
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        '@id': `${canonical}#term`,
        'name': term.term,
        'description': term.definition,
        'url': canonical,
        'inLanguage': 'en',
        'inDefinedTermSet': { '@id': `${BASE_URL}/glossary#termset` },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([
          { name: 'Glossary', url: `${BASE_URL}/glossary` },
          { name: term.term, url: canonical },
        ]),
      },
    ],
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/glossary">Glossary</a> › ${escapeHtml(term.term)}</nav>
      <h1>${escapeHtml(term.term)}</h1>
      <p><em>${escapeHtml(term.shortDef)}</em></p>
      <p>${escapeHtml(term.definition)}</p>
    </main>`
  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /teams ───────────────────────────────────────────────────────────────────

async function handleTeams(url) {
  const title = 'Dota 2 Pro Teams — Tier 1 Organizations & TI History | Spectate Esports'
  const description = 'Tier 1 professional Dota 2 organizations. OG, Team Liquid, Team Spirit (each 2× TI champion), Team Falcons, Tundra Esports, Evil Geniuses, and more. Championship history and iconic players.'
  const canonical = `${BASE_URL}/teams`

  const champions = TIER1_TEAMS_SSR.filter(t => t.tiWins.length > 0)
  const championItems = champions.map(t =>
    `<li><a href="${BASE_URL}/teams/${t.id}"><strong>${escapeHtml(t.name)}</strong></a> — TI ${t.tiWins.join(', TI ')} Champion${t.tiWins.length > 1 ? 's' : ''}${t.disbanded ? ' (disbanded)' : ''}</li>`
  ).join('')
  const allTeamItems = TIER1_TEAMS_SSR.map(t =>
    `<li><a href="${BASE_URL}/teams/${t.id}"><strong>${escapeHtml(t.name)}</strong></a> — ${escapeHtml(t.shortDesc)}</li>`
  ).join('')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'about': { '@type': 'SportsOrganization', 'name': 'Dota 2 Esports', 'sport': 'Dota 2' },
        'breadcrumb': breadcrumb([{ name: 'Pro Teams', url: canonical }]),
      },
      ...TIER1_TEAMS_SSR.filter(t => t.tiWins.length > 0).map(t => ({
        '@type': 'SportsTeam',
        '@id': `${BASE_URL}/teams/${t.id}#team`,
        'name': t.name,
        'url': `${BASE_URL}/teams/${t.id}`,
        'sport': 'Dota 2',
        'memberOf': { '@type': 'SportsOrganization', 'name': 'Dota 2 Esports', 'sport': 'Dota 2' },
      })),
    ],
  }

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Pro Teams</nav>
      <h1>Dota 2 Pro Teams</h1>
      <p>Tier 1 professional Dota 2 organizations competing at DreamLeague, ESL One, PGL, BLAST, WePlay, and The International. Championship history and iconic players.</p>
      <h2>TI Champions</h2>
      <ul>${championItems}</ul>
      <h2>All Tier 1 Organizations</h2>
      <ul>${allTeamItems}</ul>
      <p><em>For current player rosters, see <a href="https://liquipedia.net/dota2/Portal:Teams">Liquipedia</a>.</em></p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /teams/:slug ─────────────────────────────────────────────────────────────

async function handleTeamDetail(url) {
  const slug = url.pathname.replace('/teams/', '').split('/')[0]
  const team = TIER1_TEAMS_MAP_SSR[slug]

  if (!team) {
    return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/teams` } })
  }

  const canonical = `${BASE_URL}/teams/${team.id}`
  const tiStr = team.tiWins.length > 0
    ? ` TI Champion${team.tiWins.length > 1 ? 's' : ''} (${team.tiWins.join(', ')}).`
    : ''
  const title = `${team.name} — Dota 2 Esports Organization | Spectate Esports`
  const description = `${team.name}${team.disbanded ? ' (disbanded)' : ''} — Dota 2 organization based in ${team.basedIn}.${tiStr} ${team.shortDesc}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SportsTeam',
        '@id': `${canonical}#team`,
        'name': team.name,
        'url': canonical,
        'sport': 'Dota 2',
        'memberOf': { '@type': 'SportsOrganization', 'name': 'Dota 2 Esports', 'sport': 'Dota 2' },
        ...(team.tiWins.length > 0 ? { 'description': `${team.name} won The International in ${team.tiWins.join(' and ')}.` } : {}),
        'sameAs': [team.liquipedia],
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([
          { name: 'Pro Teams', url: `${BASE_URL}/teams` },
          { name: team.name, url: canonical },
        ]),
      },
    ],
  }

  const tiSection = team.tiWins.length > 0
    ? `<h2>The International Record</h2><p>${team.name} won The International in ${team.tiWins.join(' and ')}.</p>`
    : ''

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/teams">Pro Teams</a> › ${escapeHtml(team.name)}</nav>
      <h1>${escapeHtml(team.name)}</h1>
      <p><strong>Based in:</strong> ${escapeHtml(team.basedIn)}${team.disbanded ? ' | <strong>Status:</strong> Inactive (disbanded)' : ''}</p>
      ${tiSection}
      <p>${escapeHtml(team.shortDesc)}</p>
      <p><em>For current player roster, see <a href="${team.liquipedia}">Liquipedia</a>.</em></p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /articles ────────────────────────────────────────────────────────────────

async function handleArticles(url) {
  const tournamentFilter = url.searchParams.get('tournament')
  let articles = []
  try {
    const apiUrl = tournamentFilter
      ? `${BASE_URL}/api/pipeline?type=articles&mode=meta&tournament=${encodeURIComponent(tournamentFilter)}`
      : `${BASE_URL}/api/pipeline?type=articles&mode=meta`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(apiUrl, { signal: controller.signal }).catch(() => null)
    clearTimeout(timer)
    if (res?.ok) {
      const data = await res.json().catch(() => null)
      articles = data?.articles || []
    }
  } catch (_) { /* serve with empty articles if API is unavailable */ }

  const isHub = tournamentFilter === 'blast-slam-vii'
  const title = isHub
    ? 'BLAST Slam VII Coverage — Daily Articles | Spectate Esports'
    : 'Dota 2 Esports Articles — Tournament Coverage | Spectate Esports'
  const description = isHub
    ? 'Daily editorial coverage of BLAST Slam VII (May 26–June 7, 2026, Copenhagen). One article per day covering storylines, team analysis, and match previews.'
    : 'Tournament analysis, team narratives, and editorial coverage of professional Dota 2 esports. Covers BLAST Slam, DreamLeague, PGL, and The International.'
  const canonical = tournamentFilter
    ? `${BASE_URL}/articles?tournament=${tournamentFilter}`
    : `${BASE_URL}/articles`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'about': { '@type': 'SportsEvent', 'name': 'BLAST Slam VII', 'sport': 'Dota 2' },
        'breadcrumb': breadcrumb([{ name: 'Articles', url: `${BASE_URL}/articles` }]),
      },
    ],
  }

  const articleItems = articles.map(a =>
    `<li style="margin-bottom:12px"><a href="${BASE_URL}/articles/${escapeHtml(a.slug)}"><strong>${escapeHtml(a.title)}</strong></a> <span style="color:#888;font-size:0.85em">${escapeHtml(a.publishedAt)} · ${escapeHtml(a.category)}</span><br/>${escapeHtml(a.excerpt)}</li>`
  ).join('')

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Articles</nav>
      <h1>${isHub ? 'BLAST Slam VII — Daily Coverage' : 'Dota 2 Esports Articles'}</h1>
      <p>${description}</p>
      ${articles.length > 0 ? `<ul>${articleItems}</ul>` : '<p>No articles published yet.</p>'}
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── /articles/:slug ──────────────────────────────────────────────────────────

async function handleArticleDetail(url) {
  const slug = url.pathname.replace('/articles/', '').split('/')[0]
  let article = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(
      `${BASE_URL}/api/pipeline?type=articles&slug=${encodeURIComponent(slug)}&mode=meta`,
      { signal: controller.signal }
    ).catch(() => null)
    clearTimeout(timer)
    if (res?.ok) {
      const data = await res.json().catch(() => null)
      article = data?.article || null
    }
  } catch (_) { /* fall through to 302 redirect below */ }

  if (!article) {
    return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/articles` } })
  }

  const canonical = `${BASE_URL}/articles/${slug}`
  const title = `${article.title} | Spectate Esports`
  const description = article.excerpt
  const publishedDate = article.publishedAt

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        'headline': article.title,
        'description': description,
        'url': canonical,
        'datePublished': publishedDate,
        'dateModified': publishedDate,
        'author': {
          '@type': 'Organization',
          'name': 'Spectate Esports',
          '@id': `${BASE_URL}/#organization`,
        },
        'publisher': {
          '@type': 'Organization',
          'name': 'Spectate Esports',
          'url': BASE_URL,
        },
        'about': {
          '@type': 'SportsEvent',
          'name': article.tournamentLabel,
          'sport': 'Dota 2',
        },
        'isPartOf': { '@id': `${BASE_URL}/#website` },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'datePublished': publishedDate,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'breadcrumb': breadcrumb([
          { name: 'Articles', url: `${BASE_URL}/articles` },
          { name: article.tournamentLabel, url: `${BASE_URL}/articles?tournament=${article.tournament}` },
          { name: article.title, url: canonical },
        ]),
      },
    ],
  }

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/articles">Articles</a> › <a href="${BASE_URL}/articles?tournament=${escapeHtml(article.tournament)}">${escapeHtml(article.tournamentLabel)}</a></nav>
      <p style="color:#888;font-size:0.85em;text-transform:uppercase">${escapeHtml(article.category)} · ${escapeHtml(article.publishedAt)}</p>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.subtitle ? `<p><em>${escapeHtml(article.subtitle)}</em></p>` : ''}
      <p>${escapeHtml(article.excerpt)}</p>
    </main>`

  const articleMetaTags = `
    <meta property="article:published_time" content="${publishedDate}" />
    <meta property="article:author" content="Spectate Esports" />
    <meta property="article:section" content="${escapeHtml(article.category)}" />`
  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent, articleMetaTags, 'article')
}

// ─── /heroes ─────────────────────────────────────────────────────────────────

function heroSlugToDisplayName(slug) {
  // e.g. "anti_mage" → "Anti Mage", "keeper_of_the_light" → "Keeper Of The Light"
  return (slug || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

async function handleHeroes(url) {
  const canonical = `${BASE_URL}/heroes`
  const title = 'Dota 2 Hero Match History | Spectate Esports'
  const description = 'Browse every Dota 2 hero and find recent tier-1 professional matches where they were picked. Includes Twitch VOD links, draft context, and match results.'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'about': { '@type': 'VideoGame', 'name': 'Dota 2' },
        'breadcrumb': breadcrumb([{ name: 'Heroes', url: canonical }]),
      },
    ],
  }
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › Heroes</nav>
      <h1>Dota 2 Heroes — Pro Match History</h1>
      <p>Find recent Tier 1 professional Dota 2 matches for any hero. Each hero page shows the last 100 tier-1 picks with direct Twitch VOD links, draft context, and match results. Data sourced from OpenDota.</p>
      <p>Search for a hero by name on the <a href="${BASE_URL}">homepage</a> to jump directly to their match history.</p>
    </main>`
  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

async function handleHeroDetail(url) {
  const slug = url.pathname.replace('/heroes/', '').split('/')[0]
  if (!slug) return new Response(null, { status: 302, headers: { Location: `${BASE_URL}/heroes` } })

  const displayName = heroSlugToDisplayName(slug)
  const canonical = `${BASE_URL}/heroes/${slug}`
  const title = `${displayName} Pro Matches — Tier 1 VODs & Drafts | Spectate Esports`
  const description = `Recent Tier 1 professional Dota 2 matches where ${displayName} was picked. Includes Twitch VOD links timestamped to game start, full hero draft, and match results.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Thing',
        '@id': `${canonical}#hero`,
        'name': displayName,
        'description': `${displayName} is a hero in Dota 2. This page shows recent tier-1 professional matches where ${displayName} was picked, with VOD links and draft context.`,
        'url': canonical,
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        'name': title,
        'description': description,
        'url': canonical,
        'isPartOf': { '@id': `${BASE_URL}/#website` },
        'about': { '@id': `${canonical}#hero` },
        'breadcrumb': breadcrumb([
          { name: 'Heroes', url: `${BASE_URL}/heroes` },
          { name: displayName, url: canonical },
        ]),
      },
    ],
  }

  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › <a href="${BASE_URL}/heroes">Heroes</a> › ${escapeHtml(displayName)}</nav>
      <h1>${escapeHtml(displayName)} — Pro Match History</h1>
      <p>Recent Tier 1 professional Dota 2 matches where <strong>${escapeHtml(displayName)}</strong> was picked. Each match includes a direct Twitch VOD link timestamped to game start, the full hero pick-and-ban draft, and match results. Data sourced from OpenDota and covers DreamLeague, ESL One, PGL, BLAST, WePlay, The International, and Riyadh Masters events.</p>
      <p><a href="${BASE_URL}">Back to Spectate Esports</a> · <a href="${BASE_URL}/heroes">All Heroes</a></p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function breadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': SITE_NAME, 'item': BASE_URL },
      ...items.map((item, i) => ({
        '@type': 'ListItem',
        'position': i + 2,
        'name': item.name,
        'item': item.url,
      })),
    ],
  }
}

async function buildResponse(url, title, description, canonical, imageUrl, jsonLd, rootContent, extraHeadTags = '', ogType = 'website') {
  const indexRes = await fetch(`${url.origin}/index.html`)
  let html = await indexRes.text()

  const injected = `
    <meta property="og:type" content="${ogType}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
    ${extraHeadTags}
  `

  html = html.replace(/<title>[^<]*<\/title>/gi, '')
  html = html.replace(/<meta[^>]*property="og:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace(/<meta[^>]*name="twitter:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace('</head>', injected + '</head>')
  html = html.replace('<div id="root"></div>', `<div id="root">${rootContent}</div>`)

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

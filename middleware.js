export const config = {
  matcher: [
    '/match/:matchId*',
    '/news',
    '/tournaments',
    '/tournament/:seriesId*',
    '/about',
    '/release-notes',
    '/calendar',
  ],
}

const BASE_URL = 'https://spectateesports.live'
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`
const SITE_NAME = 'Spectate Esports'

export default async function middleware(req) {
  const url = new URL(req.url)
  const { pathname } = url

  if (pathname === '/news') return handleNews(url)
  if (pathname === '/tournaments') return handleTournaments(url)
  if (pathname.startsWith('/tournament/')) return handleTournamentDetail(url)
  if (pathname === '/about') return handleAbout(url)
  if (pathname === '/release-notes') return handleReleaseNotes(url)
  if (pathname === '/calendar') return handleCalendar(url)
  if (pathname.startsWith('/match/')) return handleMatch(url)

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
  const rootContent = `
    <main style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px">
      <nav><a href="${BASE_URL}">Spectate Esports</a> › News</nav>
      <h1>Dota 2 Esports News</h1>
      <p>Latest Dota 2 pro match results, roster moves, patch notes, and tournament updates. Sources: Steam Community (official Valve announcements), Liquipedia (player transfers and roster changes), PCGamesN, Dot Esports, and Currents API. Updated every 30 minutes.</p>
      <p>Coverage includes Tier 1 teams: Team Spirit, Gaimin Gladiators, Tundra Esports, Team Liquid, OG, BetBoom Team, Virtus.pro, and all DreamLeague, ESL One, PGL, BLAST, and WePlay participants.</p>
    </main>`

  return buildResponse(url, title, description, canonical, DEFAULT_OG_IMAGE, jsonLd, rootContent)
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

        jsonLd = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'SportsEvent',
              '@id': `${canonical}#event`,
              'name': tName,
              'url': canonical,
              'sport': 'Dota 2',
              'eventStatus': data.status === 'running'
                ? 'https://schema.org/EventScheduled'
                : data.status === 'upcoming'
                  ? 'https://schema.org/EventScheduled'
                  : 'https://schema.org/EventPostponed',
              ...(data.beginAt ? { 'startDate': data.beginAt } : {}),
              ...(data.endAt ? { 'endDate': data.endAt } : {}),
              ...(data.prizePool ? { 'description': `${tName}. Prize pool: $${data.prizePool.toLocaleString()} USD.` } : {}),
              'organizer': {
                '@type': 'SportsOrganization',
                'name': league || SITE_NAME,
                'sport': 'Dota 2',
              },
              ...(contestants.length > 0 ? { 'competitor': contestants } : {}),
            },
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
        'sameAs': ['https://x.com/spectateesports'],
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
        <li><strong>Team Feed</strong> — Select specific teams (e.g. "Team Spirit", "Gaimin Gladiators")</li>
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
            ...(league ? { 'organizer': { '@type': 'SportsOrganization', 'name': league, 'sport': 'Dota 2' } } : {}),
            'competitor': [
              { '@type': 'SportsTeam', 'name': radiantTeam },
              { '@type': 'SportsTeam', 'name': direTeam },
            ],
            ...(data.radiant_win != null ? {
              'winner': { '@type': 'SportsTeam', 'name': winner },
            } : {}),
            'eventStatus': 'https://schema.org/EventPostponed',
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

async function buildResponse(url, title, description, canonical, imageUrl, jsonLd, rootContent) {
  const indexRes = await fetch(`${url.origin}/index.html`)
  let html = await indexRes.text()

  const injected = `
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
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
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

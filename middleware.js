export const config = {
  matcher: '/match/:matchId*',
}

export default async function middleware(req) {
  const url = new URL(req.url)
  const matchId = url.pathname.replace('/match/', '').split('/')[0]

  if (!matchId || !/^\d+$/.test(matchId)) {
    return new Response(null, { status: 302, headers: { Location: '/' } })
  }

  let title = 'Pro Dota 2 Match — Spectate Esports'
  let description = 'Watch pro Dota 2 matches with direct Twitch VOD links, draft analysis, and AI summaries.'
  let imageUrl = `${url.origin}/api/og`

  try {
    const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
    const data = await res.json()

    if (data && data.match_id) {
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

      title = `${winner} ${scoreStr} ${loser}${league ? ` - ${league}` : ''} - Spectate Esports`
      description = `${winner} defeated ${loser} ${scoreStr}. Watch the VOD, see the draft, and get an AI match summary on Spectate Esports.`
      imageUrl = `${url.origin}/api/og?matchId=${matchId}`
    }
  } catch (_) {
    // fallback to defaults
  }

  const indexRes = await fetch(`${url.origin}/index.html`)
  let html = await indexRes.text()

  const ogTags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Spectate Esports" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${url.href}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <title>${escapeHtml(title)}</title>
  `

  // Strip ALL existing og/twitter meta tags and title so ours take full precedence
  html = html.replace(/<title>[^<]*<\/title>/gi, '')
  html = html.replace(/<meta[^>]*property="og:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace(/<meta[^>]*name="twitter:[^>]*"[^>]*\/?>/gi, '')
  html = html.replace('</head>', ogTags + '</head>')

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

import { getPremiumLeagueIds } from './_shared.js'

const GLOSSARY_TERM_IDS = [
  'draft', 'gpm', 'roshan', 'rampage', 'divine-rapier', 'aegis', 'mega-creeps',
  'buyback', 'net-worth', 'first-blood', 'smoke-of-deceit', 'ancient', 'barracks',
  'bkb', 'tp-scroll', 'courier', 'carry', 'support', 'offlane', 'mid-lane',
  'last-hit', 'deny', 'teamfight', 'bounty-rune', 'true-sight',
]

const TEAM_SLUGS = [
  'og', 'team-liquid', 'team-spirit', 'tundra-esports', 'team-falcons',
  'evil-geniuses', 'nigma-galaxy', 'betboom-team', 'virtus-pro', 'xtreme-gaming',
]

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function getMatchSlug(match) {
  return [
    slugify(match.radiantTeam),
    'vs',
    slugify(match.direTeam),
    slugify(match.tournament),
    match.id,
  ].filter(Boolean).join('-')
}

export default async function handler(req, res) {
  const BASE_URL = 'https://spectateesports.live'

  try {
    // Fetch article slugs/tournaments and match data in parallel.
    let articleSlugs = []
    let articleTournaments = []
    try {
      const artRes = await fetch(`${BASE_URL}/api/pipeline?type=articles&mode=slugs`).catch(() => null)
      if (artRes?.ok) {
        const artData = await artRes.json().catch(() => null)
        articleSlugs = artData?.slugs || []
        articleTournaments = artData?.tournaments || []
      }
    } catch (_) { /* use empty lists if articles API is unavailable */ }

    // Fetch recent pro matches and premium league IDs in parallel.
    const [page1, premiumIds] = await Promise.all([
      fetch('https://api.opendota.com/api/proMatches').then(r => r.json()),
      getPremiumLeagueIds(),
    ])
    const lastId = Array.isArray(page1) && page1.length ? page1[page1.length - 1].match_id : null
    const page2 = lastId
      ? await fetch(`https://api.opendota.com/api/proMatches?less_than_match_id=${lastId}`).then(r => r.json()).catch(() => [])
      : []
    const raw = [...(Array.isArray(page1) ? page1 : []), ...(Array.isArray(page2) ? page2 : [])].filter(Boolean)

    const matches = raw
      .filter(m => premiumIds.has(m.leagueid))
      .slice(0, 200)
      .map(m => ({
        id: String(m.match_id),
        radiantTeam: m.radiant_name || 'Radiant',
        direTeam: m.dire_name || 'Dire',
        tournament: m.league_name || '',
        startTime: m.start_time,
      }))

    // Deduplicate by match ID
    const seen = new Set()
    const unique = matches.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    const urls = unique.map(m => {
      const slug = getMatchSlug(m)
      const date = m.startTime
        ? new Date(m.startTime * 1000).toISOString().slice(0, 10)
        : ''
      return `  <url>
    <loc>${BASE_URL}/match/${slug}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}
    <changefreq>never</changefreq>
    <priority>0.6</priority>
  </url>`
    })

    // Fetch tournament series for /tournament/:id URLs
    let tournamentUrls = []
    try {
      const seriesRes = await fetch(`${BASE_URL}/api/tournaments?mode=series`).catch(() => null)
      if (seriesRes?.ok) {
        const seriesData = await seriesRes.json().catch(() => null)
        const allSeries = [
          ...(seriesData?.running || []),
          ...(seriesData?.upcoming || []),
          ...(Array.isArray(seriesData?.completed) ? seriesData.completed.slice(0, 10) : []),
        ]
        tournamentUrls = allSeries.map(s => {
          const date = s.beginAt ? new Date(s.beginAt).toISOString().slice(0, 10) : ''
          const changefreq = s.status === 'running' ? 'hourly' : s.status === 'upcoming' ? 'daily' : 'never'
          const priority = s.status === 'running' ? '0.9' : s.status === 'upcoming' ? '0.8' : '0.6'
          return `  <url>
    <loc>${BASE_URL}/tournament/${s.id}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
        })
      }
    } catch (_) {
      // silently skip — match URLs still included
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/release-notes</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/tournaments</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/calendar</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${BASE_URL}/news</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/articles</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
${articleTournaments.map(t => `  <url>
    <loc>${BASE_URL}/articles?tournament=${t}</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/articles?tournament=blast-slam-vii</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('\n')}
${articleSlugs.map(slug => `  <url>
    <loc>${BASE_URL}/articles/${slug}</loc>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
  <url>
    <loc>${BASE_URL}/llms.txt</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${BASE_URL}/glossary</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
${GLOSSARY_TERM_IDS.map(id => `  <url>
    <loc>${BASE_URL}/glossary/${id}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
  <url>
    <loc>${BASE_URL}/teams</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
${TEAM_SLUGS.map(slug => `  <url>
    <loc>${BASE_URL}/teams/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n')}
${tournamentUrls.join('\n')}
${urls.join('\n')}
</urlset>`

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).send(xml)

  } catch (err) {
    console.error('Sitemap error:', err?.message)
    return res.status(500).send('Failed to generate sitemap')
  }
}

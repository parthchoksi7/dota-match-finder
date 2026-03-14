const TIER1_KEYWORDS = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters'
]

function isTier1(leagueName) {
  const lower = (leagueName || '').toLowerCase()
  return TIER1_KEYWORDS.some(k => lower.includes(k))
}

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
    // Fetch recent pro matches — grab enough to filter down to ~100 Tier 1
    const page1 = await fetch('https://api.opendota.com/api/proMatches').then(r => r.json())
    const lastId = Array.isArray(page1) && page1.length ? page1[page1.length - 1].match_id : null
    const page2 = lastId
      ? await fetch(`https://api.opendota.com/api/proMatches?less_than_match_id=${lastId}`).then(r => r.json()).catch(() => [])
      : []
    const raw = [...(Array.isArray(page1) ? page1 : []), ...(Array.isArray(page2) ? page2 : [])].filter(Boolean)

    const matches = raw
      .filter(m => isTier1(m.league_name))
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

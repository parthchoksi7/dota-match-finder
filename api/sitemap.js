import { getPremiumLeagueIds, pingIndexNow } from './_shared.js'
import { getSupabaseAdmin } from './_supabase.js'

const BASE_URL = 'https://spectateesports.live'

const GLOSSARY_TERM_IDS = [
  'draft', 'gpm', 'roshan', 'rampage', 'divine-rapier', 'aegis', 'mega-creeps',
  'buyback', 'net-worth', 'first-blood', 'smoke-of-deceit', 'ancient', 'barracks',
  'bkb', 'tp-scroll', 'courier', 'carry', 'support', 'offlane', 'mid-lane',
  'last-hit', 'deny', 'teamfight', 'bounty-rune', 'true-sight',
]

// Keep in sync with TIER1_TEAMS_SSR in middleware.js — only include slugs that return 200
const TEAM_SLUGS = [
  'og', 'team-liquid', 'team-spirit', 'tundra-esports', 'team-falcons',
  'evil-geniuses', 'nigma-galaxy', 'betboom-team', 'virtus-pro', 'xtreme-gaming',
  '1win',
]

export function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function matchUrlFromHistory(row) {
  const slug = [
    slugify(row.team_a),
    'vs',
    slugify(row.team_b),
    slugify(row.tournament),
    String(row.od_match_id),
  ].filter(Boolean).join('-')
  return `${BASE_URL}/match/${slug}`
}

export function matchUrlFromOd(m) {
  const slug = [
    slugify(m.radiant_name || 'Radiant'),
    'vs',
    slugify(m.dire_name || 'Dire'),
    slugify(m.league_name || ''),
    String(m.match_id),
  ].filter(Boolean).join('-')
  return `${BASE_URL}/match/${slug}`
}

export default async function handler(req, res) {
  try {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // ── Primary: Supabase match_stream_history ─────────────────────────────────
    // Covers all observed live matches including qualifiers, and uses PandaScore
    // team names (same source as the live-matches feed) so slugs don't 404.
    let historyMatches = []
    try {
      const { data } = await getSupabaseAdmin()
        .from('match_stream_history')
        .select('od_match_id, team_a, team_b, tournament, started_at')
        .not('od_match_id', 'is', null)
        .not('team_a', 'is', null)
        .gte('started_at', cutoff30d)
        .order('started_at', { ascending: false })
        .limit(500)
      historyMatches = data || []
    } catch (_) { /* fall through to OpenDota */ }

    // ── Fallback: OpenDota proMatches ──────────────────────────────────────────
    // Covers tier-1 matches that pre-date Phase 0 (before June 6 2026) or were
    // missed by the live observer. Filtered to premium leagues only.
    const seenIds = new Set(historyMatches.map(r => String(r.od_match_id)))
    let odMatches = []
    try {
      const [page1, premiumIds] = await Promise.all([
        fetch('https://api.opendota.com/api/proMatches').then(r => r.json()).catch(() => []),
        getPremiumLeagueIds(),
      ])
      const lastId = Array.isArray(page1) && page1.length ? page1[page1.length - 1].match_id : null
      const page2 = lastId
        ? await fetch(`https://api.opendota.com/api/proMatches?less_than_match_id=${lastId}`).then(r => r.json()).catch(() => [])
        : []
      const raw = [...(Array.isArray(page1) ? page1 : []), ...(Array.isArray(page2) ? page2 : [])]
      odMatches = raw
        .filter(m => m?.match_id && premiumIds.has(m.leagueid) && !seenIds.has(String(m.match_id)))
        .slice(0, 200)
    } catch (_) {}

    // ── Build match URL entries ────────────────────────────────────────────────
    const matchUrls = []
    for (const row of historyMatches) {
      const url = matchUrlFromHistory(row)
      const date = row.started_at ? row.started_at.slice(0, 10) : ''
      const isRecent = row.started_at >= cutoff48h
      matchUrls.push(`  <url>
    <loc>${url}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}
    <changefreq>${isRecent ? 'daily' : 'never'}</changefreq>
    <priority>${isRecent ? '0.8' : '0.6'}</priority>
  </url>`)
    }
    for (const m of odMatches) {
      const url = matchUrlFromOd(m)
      const date = m.start_time ? new Date(m.start_time * 1000).toISOString().slice(0, 10) : ''
      matchUrls.push(`  <url>
    <loc>${url}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ''}
    <changefreq>never</changefreq>
    <priority>0.6</priority>
  </url>`)
    }

    // ── Hero slugs ─────────────────────────────────────────────────────────────
    let heroUrls = []
    try {
      const heroRes = await fetch('https://api.opendota.com/api/heroes').catch(() => null)
      if (heroRes?.ok) {
        const heroData = await heroRes.json().catch(() => null)
        if (Array.isArray(heroData)) {
          heroUrls = heroData
            .map(h => h.name.replace('npc_dota_hero_', ''))
            .filter(Boolean)
            .map(slug => `  <url>
    <loc>${BASE_URL}/heroes/${slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`)
        }
      }
    } catch (_) {}

    // ── Article slugs ──────────────────────────────────────────────────────────
    let articleSlugs = []
    let articleTournaments = []
    try {
      const artRes = await fetch(`${BASE_URL}/api/pipeline?type=articles&mode=slugs`).catch(() => null)
      if (artRes?.ok) {
        const artData = await artRes.json().catch(() => null)
        articleSlugs = artData?.slugs || []
        articleTournaments = artData?.tournaments || []
      }
    } catch (_) {}

    // ── Tournament series ──────────────────────────────────────────────────────
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
    } catch (_) {}

    // ── Build XML ──────────────────────────────────────────────────────────────
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
  <url>
    <loc>${BASE_URL}/heroes</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
${heroUrls.join('\n')}
${tournamentUrls.join('\n')}
${matchUrls.join('\n')}
</urlset>`

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(xml)

    // Ping IndexNow for recent matches (< 48h) so Bing indexes them within minutes.
    // Fired after the response is sent; fire-and-forget, never blocks the sitemap.
    const recentUrls = historyMatches
      .filter(r => r.started_at >= cutoff48h)
      .map(matchUrlFromHistory)
    if (recentUrls.length > 0) {
      pingIndexNow(recentUrls).catch(() => {})
    }

  } catch (err) {
    console.error('Sitemap error:', err?.message)
    res.status(500).send('Failed to generate sitemap')
  }
}

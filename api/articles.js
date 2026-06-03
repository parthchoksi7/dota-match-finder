import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getSupabaseAnon } from './_supabase.js'

function mapRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: row.published_at,
    tournament: row.tournament,
    tournamentLabel: row.tournament_label,
    category: row.category,
    readingTime: row.reading_time,
    watchQuery: row.watch_query,
    watchLabel: row.watch_label,
    excerpt: row.excerpt,
    sections: row.sections,
  }
}

function mapMetaRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: row.published_at,
    tournament: row.tournament,
    tournamentLabel: row.tournament_label,
    category: row.category,
    excerpt: row.excerpt,
  }
}

export default async function handler(req, res) {
  const db = getSupabaseAnon()
  const { slug, tournament, mode } = req.query || {}

  try {
    // Single article by slug
    if (slug) {
      const cols = mode === 'meta'
        ? 'slug,title,subtitle,published_at,tournament,tournament_label,category,excerpt'
        : '*'
      const { data, error } = await db
        .from('articles')
        .select(cols)
        .eq('slug', slug)
        .eq('status', 'published')
        .single()
      if (error || !data) return res.status(404).json({ error: 'Article not found' })
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json({ article: mode === 'meta' ? mapMetaRow(data) : mapRow(data) })
    }

    // Slugs + tournaments for sitemap
    if (mode === 'slugs') {
      const { data, error } = await db
        .from('articles')
        .select('slug,tournament')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
      if (error) throw error
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json({
        slugs: (data || []).map(r => r.slug),
        tournaments: [...new Set((data || []).map(r => r.tournament))],
      })
    }

    // Metadata-only list for middleware OG tag generation
    if (mode === 'meta') {
      let q = db
        .from('articles')
        .select('slug,title,subtitle,published_at,tournament,tournament_label,category,excerpt')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(50)
      if (tournament) q = q.eq('tournament', tournament)
      const { data, error } = await q
      if (error) throw error
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json({ articles: (data || []).map(mapMetaRow) })
    }

    // Full articles list (default)
    let q = db
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100)
    if (tournament) q = q.eq('tournament', tournament)
    const { data, error } = await q
    if (error) throw error
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ articles: (data || []).map(mapRow) })

  } catch (err) {
    console.error('articles API error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * One-time migration: seeds existing articles from src/data/articles.js into Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-articles.mjs
 *
 * Or with .env.local:
 *   node --env-file=.env.local scripts/migrate-articles.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { ARTICLES } from '../src/data/articles.js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const rows = ARTICLES.map(a => ({
  slug: a.slug,
  title: a.title,
  subtitle: a.subtitle ?? null,
  published_at: a.publishedAt,
  tournament: a.tournament,
  tournament_label: a.tournamentLabel,
  category: a.category,
  reading_time: a.readingTime ?? 3,
  watch_query: a.watchQuery ?? null,
  watch_label: a.watchLabel ?? null,
  excerpt: a.excerpt,
  sections: a.sections,
  status: 'published',
}))

console.log(`Migrating ${rows.length} articles...`)

const { data, error } = await supabase
  .from('articles')
  .upsert(rows, { onConflict: 'slug' })
  .select('slug')

if (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
}

console.log('Done. Migrated slugs:')
data.forEach(r => console.log(' -', r.slug))

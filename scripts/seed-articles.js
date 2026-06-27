/**
 * One-shot seed: inserts all articles from src/data/articles.js into Supabase.
 * Run from repo root: node scripts/seed-articles.js
 * Requires .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { ARTICLES } from '../src/data/articles.js'

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const rows = ARTICLES.map(a => ({
  slug:            a.slug,
  title:           a.title,
  subtitle:        a.subtitle ?? null,
  published_at:    a.publishedAt,
  tournament:      a.tournament,
  tournament_label: a.tournamentLabel,
  category:        a.category,
  reading_time:    a.readingTime,
  watch_query:     a.watchQuery ?? null,
  watch_label:     a.watchLabel ?? null,
  excerpt:         a.excerpt,
  sections:        a.sections,
  status:          'published',
}))

console.log(`Upserting ${rows.length} article(s)...`)
for (const row of rows) {
  console.log(` → ${row.slug}`)
}

const { error } = await db.from('articles').upsert(rows, { onConflict: 'slug' })

if (error) {
  console.error('Upsert failed:', error.message)
  process.exit(1)
}

console.log(`Done — ${rows.length} article(s) in Supabase.`)

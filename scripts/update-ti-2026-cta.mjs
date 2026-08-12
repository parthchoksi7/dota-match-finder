/**
 * One-shot update: point the TI 2026 guide's watch CTA at the actual
 * tournament page instead of a homepage search query. DB-only — does not
 * re-post to X or re-commit metadata files (already done at initial publish).
 * Run: node scripts/update-ti-2026-cta.mjs
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getSupabaseAdmin } from '../api/_supabase.js'

const { error } = await getSupabaseAdmin()
  .from('articles')
  .update({ watch_query: '/tournament/the-international-2026-10828' })
  .eq('slug', 'how-to-watch-the-international-2026')

if (error) {
  console.error('Update failed:', error.message)
  process.exit(1)
}
console.log('Updated watch_query for how-to-watch-the-international-2026')

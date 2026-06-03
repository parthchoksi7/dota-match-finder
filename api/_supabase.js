/**
 * Supabase client singletons.
 * Prefixed with _ so Vercel does NOT deploy this as a serverless function.
 *
 * Use getSupabaseAnon() for public reads (articles endpoint).
 * Use getSupabaseAdmin() for server-side writes (pipeline publisher).
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

let _anon = null
let _admin = null

export function getSupabaseAnon() {
  if (!_anon) {
    _anon = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )
  }
  return _anon
}

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return _admin
}

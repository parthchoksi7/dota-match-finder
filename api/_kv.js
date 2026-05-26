/**
 * Shared Upstash Redis client singleton.
 * Imported by all serverless functions instead of each constructing their own.
 * Prefixed with _ so Vercel does NOT deploy this as a serverless function.
 */
import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

export const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

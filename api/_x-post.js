/**
 * Shared Twitter/X posting utilities (OAuth 1.0a + v2 tweets + polls).
 * Prefixed with _ so Vercel does NOT deploy this as a serverless function.
 */
import { createHmac, randomBytes } from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

function pct(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A')
}

function buildOAuthHeader(method, url) {
  const cred = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  }
  const paramStr = Object.keys(cred).sort().map(k => `${pct(k)}=${pct(cred[k])}`).join('&')
  const base = `${method.toUpperCase()}&${pct(url)}&${pct(paramStr)}`
  const key = `${pct(process.env.TWITTER_API_SECRET)}&${pct(process.env.TWITTER_ACCESS_TOKEN_SECRET)}`
  cred.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return 'OAuth ' + Object.keys(cred).sort().map(k => `${pct(k)}="${pct(cred[k])}"`).join(', ')
}

export async function uploadMedia(pngBuffer) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json'
  const boundary = `TwitterBoundary${Date.now()}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"\r\n\r\n`),
    pngBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: buildOAuthHeader('POST', url),
    },
    body,
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.media_id_string || null
}

// replyToId: tweet ID to reply to (null = thread root)
export async function postTweet(text, mediaId = null, replyToId = null) {
  const url = 'https://api.twitter.com/2/tweets'
  const payload = { text }
  if (mediaId) payload.media = { media_ids: [mediaId] }
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: buildOAuthHeader('POST', url) },
    body: JSON.stringify(payload),
  })
  return res.json()
}

// options: string[] (2–4 items, max 25 chars each)
// durationMinutes: 5–10080 (Twitter limits)
export async function postPoll(text, options, durationMinutes = 360) {
  const url = 'https://api.twitter.com/2/tweets'
  const payload = {
    text,
    poll: {
      options: options.map(o => String(o).slice(0, 25)),
      duration_minutes: durationMinutes,
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: buildOAuthHeader('POST', url) },
    body: JSON.stringify(payload),
  })
  return res.json()
}

export function checkTwitterEnv() {
  return ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET']
    .filter(k => !process.env[k])
}

/**
 * Shared Twitter/X utilities (OAuth 1.0a + v2 tweets + polls + timeline reads).
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

// queryParams must be included in the signature base for GET requests.
// POST callers pass no queryParams (empty default), so existing calls are unaffected.
function buildOAuthHeader(method, url, queryParams = {}) {
  const cred = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0',
  }
  const allParams = { ...cred, ...queryParams }
  const paramStr = Object.keys(allParams).sort().map(k => `${pct(k)}=${pct(allParams[k])}`).join('&')
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

// Resolve a Twitter @handle to a numeric user ID.
// Returns null if the account is not found or the request fails.
export async function fetchUserIdByHandle(handle) {
  const url = `https://api.twitter.com/2/users/by/username/${handle}`
  const res = await fetch(url, { headers: { Authorization: buildOAuthHeader('GET', url) } })
  if (!res.ok) return null
  const data = await res.json()
  return data.data?.id || null
}

// Fetch recent tweets from a user by numeric ID.
// sinceId: only return tweets newer than this ID (avoids re-processing old tweets).
// Returns newest-first array of { id, text } objects, or [] on failure.
export async function fetchRecentTweets(userId, sinceId = null) {
  const baseUrl = `https://api.twitter.com/2/users/${userId}/tweets`
  const qp = { max_results: '20' }
  if (sinceId) qp.since_id = sinceId
  const qs = new URLSearchParams(qp).toString()
  const res = await fetch(`${baseUrl}?${qs}`, {
    headers: { Authorization: buildOAuthHeader('GET', baseUrl, qp) },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.data || []
}

export function checkTwitterEnv() {
  return ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET']
    .filter(k => !process.env[k])
}

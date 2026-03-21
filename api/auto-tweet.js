import { Redis } from '@upstash/redis'
import { createHmac, randomBytes } from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// ── Twitter OAuth 1.0a ──────────────────────────────────────────────────────

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

async function postTweet(text) {
  const url = 'https://api.twitter.com/2/tweets'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: buildOAuthHeader('POST', url) },
    body: JSON.stringify({ text }),
  })
  return res.json()
}

// ── Claude text generation ──────────────────────────────────────────────────

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  return data.content?.[0]?.text?.trim() || null
}

async function makeGameTweet(gameNumber, seriesLabel, team1, team2, winner, duration, tournament, link) {
  const gameCtx = seriesLabel !== 'BO1' ? ` — Game ${gameNumber} of ${seriesLabel}` : ''
  return callClaude(`Write one X/Twitter post about this Dota 2 pro match result.

${team1} vs ${team2}${gameCtx} — ${tournament}
${winner} won${duration ? ` in ${duration}` : ''}

Rules:
- Under 200 characters (not counting the link)
- Natural tone like a Dota 2 scene follower, not a press release
- No hashtags
- End with this exact link on its own line: ${link}

Return ONLY the tweet text, nothing else.`)
}

async function makeSeriesTweet(team1, team2, winner, score, seriesLabel, tournament, link) {
  return callClaude(`Write one X/Twitter post summarizing a completed Dota 2 pro series.

${team1} vs ${team2} — ${tournament} (${seriesLabel})
${winner} won ${score}

Rules:
- Under 220 characters (not counting the link)
- Natural tone, mention both teams, final score, and format
- No hashtags
- End with this exact link on its own line: ${link}

Return ONLY the tweet text, nothing else.`)
}

// ── OpenDota / series helpers ────────────────────────────────────────────────

const TIER1_KW = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters',
]
const isTier1 = name => !!name && TIER1_KW.some(k => name.toLowerCase().includes(k))

function winsNeeded(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  return 2
}

function seriesComplete(games, seriesType) {
  const wins = {}
  for (const g of games) {
    const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
    wins[w] = (wins[w] || 0) + 1
  }
  return Math.max(0, ...Object.values(wins)) >= winsNeeded(seriesType)
}

function seriesResult(games) {
  const wins = {}
  for (const g of games) {
    const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
    wins[w] = (wins[w] || 0) + 1
  }
  const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
  return { winner: sorted[0][0], score: sorted.map(([, v]) => v).join('-') }
}

// ── URL helpers ─────────────────────────────────────────────────────────────

const slugify = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function matchSlug(m) {
  return [slugify(m.radiant_name), 'vs', slugify(m.dire_name), slugify(m.league_name), m.match_id].join('-')
}

function gameUrl(m, n) {
  return `https://spectateesports.live/match/${matchSlug(m)}?utm_source=twitter&utm_medium=social&utm_campaign=game-recap&utm_content=game-${n}`
}

function seriesUrl(m) {
  return `https://spectateesports.live/match/${matchSlug(m)}?utm_source=twitter&utm_medium=social&utm_campaign=series-recap`
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Verify Vercel cron secret (set CRON_SECRET in Vercel env vars)
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const missing = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET', 'ANTHROPIC_API_KEY']
    .filter(k => !process.env[k])
  if (missing.length) {
    return res.status(503).json({ error: `Missing env vars: ${missing.join(', ')}` })
  }

  // Fetch one page of recent pro matches from OpenDota
  const odRes = await fetch('https://api.opendota.com/api/promatches')
  if (!odRes.ok) return res.status(502).json({ error: 'OpenDota unavailable' })
  const raw = await odRes.json()
  if (!Array.isArray(raw)) return res.status(502).json({ error: 'Bad OpenDota response' })

  const tier1 = raw.filter(m => isTier1(m.league_name))
  if (!tier1.length) return res.status(200).json({ tweeted: 0, message: 'No tier 1 matches' })

  // Group matches into series
  const seriesMap = {}
  for (const m of tier1) {
    const key = m.series_id && m.series_id !== 0
      ? String(m.series_id)
      : `${m.radiant_name}|${m.dire_name}|${m.league_name}|${new Date(m.start_time * 1000).toDateString()}`
    if (!seriesMap[key]) seriesMap[key] = { key, type: m.series_type, games: [] }
    seriesMap[key].games.push(m)
  }
  for (const s of Object.values(seriesMap)) {
    s.games.sort((a, b) => a.start_time - b.start_time)
  }

  // Batch-check what's already been tweeted via a single mget
  const seriesList = Object.values(seriesMap)
  const gameKvKeys = seriesList.flatMap(s => s.games.map(g => `auto-tweet:game:${g.match_id}`))
  const seriesKvKeys = seriesList.map(s => `auto-tweet:series:${s.key}`)
  const allKvKeys = [...gameKvKeys, ...seriesKvKeys]
  const kvValues = allKvKeys.length > 0 ? await kv.mget(...allKvKeys) : []
  const alreadyTweeted = new Set(allKvKeys.filter((_, i) => kvValues[i] != null))

  const results = []
  let count = 0
  const MAX_PER_RUN = 5 // cap to avoid function timeouts

  for (const s of seriesList) {
    if (count >= MAX_PER_RUN) break
    const { key: seriesKey, type: seriesType, games } = s
    const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : 'BO3'

    // ── Per-game tweets ──────────────────────────────────────────────────────
    for (let i = 0; i < games.length; i++) {
      if (count >= MAX_PER_RUN) break
      const g = games[i]
      const gk = `auto-tweet:game:${g.match_id}`
      if (alreadyTweeted.has(gk)) continue

      const winner = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
      const dur = g.duration ? new Date(g.duration * 1000).toISOString().slice(11, 16) : null
      const link = gameUrl(g, i + 1)
      const text = await makeGameTweet(i + 1, seriesLabel, g.radiant_name || 'Radiant', g.dire_name || 'Dire', winner, dur, g.league_name, link)
      if (!text) continue

      const twRes = await postTweet(text)
      if (twRes.data?.id) {
        await kv.set(gk, 1, { ex: 2592000 }) // 30-day TTL
        count++
        results.push({ type: 'game', matchId: g.match_id, gameNumber: i + 1, tweetId: twRes.data.id })
      } else {
        console.error('Game tweet failed:', g.match_id, JSON.stringify(twRes))
      }
    }

    // ── Series summary tweet (only when series is decided) ───────────────────
    if (count >= MAX_PER_RUN) break
    const sk = `auto-tweet:series:${seriesKey}`
    if (alreadyTweeted.has(sk)) continue
    if (!seriesComplete(games, seriesType)) continue

    const { winner, score } = seriesResult(games)
    const link = seriesUrl(games[0])
    const text = await makeSeriesTweet(
      games[0].radiant_name || 'Radiant', games[0].dire_name || 'Dire',
      winner, score, seriesLabel, games[0].league_name, link
    )
    if (!text) continue

    const twRes = await postTweet(text)
    if (twRes.data?.id) {
      await kv.set(sk, 1, { ex: 2592000 })
      count++
      results.push({ type: 'series', key: seriesKey, tweetId: twRes.data.id })
    } else {
      console.error('Series tweet failed:', seriesKey, JSON.stringify(twRes))
    }
  }

  return res.status(200).json({ tweeted: count, items: results })
}

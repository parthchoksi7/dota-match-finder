import { Redis } from '@upstash/redis'
import { createHmac, randomBytes } from 'crypto'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ── Cron / auto-tweet: Redis client ─────────────────────────────────────────

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

// ── Cron / auto-tweet: Twitter OAuth 1.0a ───────────────────────────────────

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

async function uploadMedia(pngBuffer) {
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
  const data = await res.json()
  return data.media_id_string || null
}

// replyToId: tweet ID to reply to (null = thread root)
async function postTweet(text, mediaId = null, replyToId = null) {
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

// ── Cron / auto-tweet: Claude generation ────────────────────────────────────

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
  const gameCtx = seriesLabel !== 'BO1' ? ` - Game ${gameNumber} of ${seriesLabel}` : ''
  return callClaude(`Write one X/Twitter post about this Dota 2 pro match result.

${team1} vs ${team2}${gameCtx} - ${tournament}
${winner} won${duration ? ` in ${duration}` : ''}

Rules:
- Under 200 characters (not counting the link)
- Natural tone like a Dota 2 scene follower, not a press release
- No hashtags
- End with this exact link on its own line: ${link}

Return ONLY the tweet text, nothing else.`)
}

async function makeSeriesTweet(team1, team2, winner, score, seriesLabel, tournament, link) {
  const loser = winner === team1 ? team2 : team1
  return callClaude(`Write one X/Twitter post summarizing a completed Dota 2 pro series.

${team1} vs ${team2} - ${tournament} (${seriesLabel})
${winner} won ${score}

Rules:
- The very first line MUST be exactly: "${winner} ${score} ${loser}" (e.g. "Team Liquid 2-1 OG") - no changes
- After that first line, add 1-2 lines of natural commentary (under 180 total characters before the link)
- No hashtags
- End with this exact link on its own line: ${link}

Return ONLY the tweet text, nothing else.`)
}

// ── Cron / auto-tweet: series helpers (exported for unit tests) ──────────────

const TIER1_KW = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters',
]
export const isTier1 = name => !!name && TIER1_KW.some(k => name.toLowerCase().includes(k))

export function winsNeeded(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  return 2
}

export function seriesComplete(games, seriesType) {
  const wins = {}
  for (const g of games) {
    const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
    wins[w] = (wins[w] || 0) + 1
  }
  return Math.max(0, ...Object.values(wins)) >= winsNeeded(seriesType)
}

export function seriesResult(games) {
  const wins = {}
  for (const g of games) {
    const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
    wins[w] = (wins[w] || 0) + 1
  }
  const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
  return { winner: sorted[0][0], score: sorted.map(([, v]) => v).join('-') }
}

// ── Cron / auto-tweet: URL helpers ───────────────────────────────────────────

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

// ── Cron / auto-tweet: core logic ────────────────────────────────────────────

async function runAutoTweet(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const missing = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET', 'ANTHROPIC_API_KEY']
    .filter(k => !process.env[k])
  if (missing.length) {
    return res.status(503).json({ error: `Missing env vars: ${missing.join(', ')}` })
  }

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

  // Batch-fetch tweet IDs from KV in one mget call.
  // Values are the tweet IDs themselves (used for thread reply chaining).
  const seriesList = Object.values(seriesMap)
  const gameKvKeys = seriesList.flatMap(s => s.games.map(g => `auto-tweet:game:${g.match_id}`))
  const seriesKvKeys = seriesList.map(s => `auto-tweet:series:${s.key}`)
  const allKvKeys = [...gameKvKeys, ...seriesKvKeys]
  const kvValues = allKvKeys.length > 0 ? await kv.mget(...allKvKeys) : []

  const kvMap = {}
  allKvKeys.forEach((key, i) => { if (kvValues[i] != null) kvMap[key] = String(kvValues[i]) })

  // Track tweet IDs posted in this run so game N can immediately reply to game N-1
  // even when both are new in the same cron execution.
  const localTweetIds = {}
  function getGameTweetId(matchId) {
    const key = `auto-tweet:game:${matchId}`
    return localTweetIds[key] || kvMap[key] || null
  }

  const results = []
  let count = 0
  const MAX_PER_RUN = 5

  for (const s of seriesList) {
    if (count >= MAX_PER_RUN) break
    const { key: seriesKey, type: seriesType, games } = s
    const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : 'BO3'

    // Per-game tweets, chained as a thread
    for (let i = 0; i < games.length; i++) {
      if (count >= MAX_PER_RUN) break
      const g = games[i]
      const gk = `auto-tweet:game:${g.match_id}`
      if (kvMap[gk] != null) continue

      const winner = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
      const dur = g.duration ? new Date(g.duration * 1000).toISOString().slice(11, 16) : null
      const link = gameUrl(g, i + 1)
      const text = await makeGameTweet(i + 1, seriesLabel, g.radiant_name || 'Radiant', g.dire_name || 'Dire', winner, dur, g.league_name, link)
      if (!text) continue

      // Game 1 is the thread root; subsequent games reply to the previous
      const prevTweetId = i > 0 ? getGameTweetId(games[i - 1].match_id) : null
      const twRes = await postTweet(text, null, prevTweetId)
      if (twRes.data?.id) {
        const tweetId = twRes.data.id
        await kv.set(gk, tweetId, { ex: 2592000 })
        localTweetIds[gk] = tweetId
        count++
        results.push({ type: 'game', matchId: g.match_id, gameNumber: i + 1, tweetId, replyTo: prevTweetId })
      } else {
        console.error('Game tweet failed:', g.match_id, JSON.stringify(twRes))
      }
    }

    // Series summary tweet: replies to last game, closing the thread; includes score image
    if (count >= MAX_PER_RUN) break
    const sk = `auto-tweet:series:${seriesKey}`
    if (kvMap[sk] != null) continue
    if (!seriesComplete(games, seriesType)) continue

    const { winner, score } = seriesResult(games)
    const team1 = games[0].radiant_name || 'Radiant'
    const team2 = games[0].dire_name || 'Dire'
    const link = seriesUrl(games[0]) // always links to the first match
    const text = await makeSeriesTweet(team1, team2, winner, score, seriesLabel, games[0].league_name, link)
    if (!text) continue

    let mediaId = null
    try {
      const ogParams = new URLSearchParams({
        mode: 'series', team1, team2, winner, score,
        tournament: games[0].league_name || '',
        seriesType: String(seriesType),
      })
      const imgRes = await fetch(`https://spectateesports.live/api/og?${ogParams}`)
      if (imgRes.ok) {
        mediaId = await uploadMedia(Buffer.from(await imgRes.arrayBuffer()))
      }
    } catch (e) {
      console.error('OG image upload failed:', e.message)
    }

    const lastGameTweetId = getGameTweetId(games[games.length - 1].match_id)
    const twRes = await postTweet(text, mediaId, lastGameTweetId)
    if (twRes.data?.id) {
      await kv.set(sk, twRes.data.id, { ex: 2592000 })
      count++
      results.push({ type: 'series', key: seriesKey, tweetId: twRes.data.id, replyTo: lastGameTweetId, hasImage: !!mediaId })
    } else {
      console.error('Series tweet failed:', seriesKey, JSON.stringify(twRes))
    }
  }

  return res.status(200).json({ tweeted: count, items: results })
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  const type = body.type || 'x'

  // Cron mode: fetch new match results and auto-post to X as a series thread
  if (type === 'cron') {
    return runAutoTweet(req, res)
  }

  // ── Existing draft-posts logic (type: 'x' or 'reddit') ───────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Service unavailable' })
  }

  const { team1, team2, tournament, seriesType, seriesScore, seriesWinner, games, seriesLink, date } = body
  if (!team1 || !team2 || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : 'BO3'

  let prompt, maxTokens

  if (type === 'reddit') {
    const dateStr = date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const gamesList = games.map(g =>
      `- ${team1} vs ${team2} - Game ${g.gameNumber} | Link: ${g.spectateUrl}`
    ).join('\n')

    maxTokens = 1200
    prompt = `Generate two Reddit posts about a Dota 2 pro series. Return ONLY a valid JSON object. No explanation, no markdown fences.

=== POST 1: VOD ROUNDUP (for r/DotaVods or r/Dota2) ===

You are a Dota 2 esports fan who watches pro matches regularly. You help other fans catch up on matches they missed by posting spoiler-free VOD roundups on Reddit.

STRICT RULES:
- NEVER reveal who won any match or game
- NEVER reveal the series score (e.g. 2-1, 2-0)
- NEVER hint at results through language like "you won't believe what happened" or "this one was insane" - that implies excitement which is itself a spoiler
- NEVER use em dashes anywhere. Use hyphens or rewrite the sentence.
- Keep the tone casual and helpful, like a fan posting for other fans
- Do NOT sound like you are marketing or promoting a product

FORMAT:
- Title: "[${tournament}] ${seriesLabel} - VOD Replay Links"
- Body: Brief 1-2 sentence intro, then list each game link as: **${team1} vs ${team2} - Game N** - [Watch](url)
- End with a short note that links jump to the match start on Twitch and that spoiler-free mode on the site hides results
- Keep the whole post under 150 words

MATCH DATA:
Tournament: ${tournament}
Format: ${seriesLabel}
Date: ${dateStr}
Games:
${gamesList}

=== POST 2: MATCH THREAD COMMENT (for r/Dota2 post-match discussion) ===

You are a Dota 2 esports fan. This series just finished. Write a short Reddit comment for the post-match discussion thread that lets people know they can watch the VODs with timestamped links.

STRICT RULES:
- You CAN reference the result since the thread itself is a spoiler zone, but keep it minimal. Focus on the VOD links, not a recap.
- NEVER use em dashes anywhere. Use hyphens or rewrite.
- Sound like a regular fan dropping a helpful link, not an ad
- Keep it to 2-4 sentences max
- Do NOT say "I built this" or "check out my site." Just share the link naturally.

MATCH DATA:
Teams: ${team1} vs ${team2}
Tournament: ${tournament} (${seriesLabel})
Result: ${seriesWinner} won ${seriesScore}
Link: ${seriesLink}

Return ONLY a valid JSON object with this exact shape:
{"matchPost": {"title": "...", "body": "..."}, "dayComment": "..."}`

  } else {
    const gamesText = games.map(g =>
      `Game ${g.gameNumber}: ${g.winner} won (${g.duration}) - Replay: ${g.spectateUrl}`
    ).join('\n')
    const summaryLinkLine = seriesLink ? `\nSeries link: ${seriesLink}` : ''

    maxTokens = 1500
    prompt = `You write X/Twitter posts for Dota 2 esports results. Generate one post per game for this series, plus one series summary post.

Series: ${team1} vs ${team2} - ${tournament} (${seriesLabel})
Final result: ${seriesWinner} won ${seriesScore}
Games:
${gamesText}${summaryLinkLine}

Rules for per-game posts:
- Write exactly ${games.length} post${games.length > 1 ? 's' : ''}, one per game
- Each post must sound noticeably different from the others - vary the structure, tone, angle, and opening
- Natural and human - like someone who follows the Dota 2 pro scene, not a press release
- Under 200 characters each excluding the link (the replay link must appear at the end of every post)
- Mention which team won Game N and include a brief natural observation about the result
- Always end with the exact replay link provided - do not modify or shorten it
- No hashtags. No forced enthusiasm. Vary whether or not you use emojis across posts
- ${games.length > 1 ? 'Think about the narrative arc: opener, momentum shift, decider - each game has a different weight' : "Keep it punchy since it's a single game"}
- Never start two posts the same way

Rules for the series summary post:
- Summarizes the full series outcome in one punchy post
- Mention both teams, the final score (${seriesScore}), and the series format (${seriesLabel})
- Natural and human, not a press release - this is the main series tweet
- Under 220 characters excluding the link${seriesLink ? '\n- End with the series link: ' + seriesLink : ''}
- No hashtags. Vary tone from the per-game posts

Return ONLY a valid JSON object, no explanation, no markdown:
{"summary": "...", "posts": [{"game": 1, "post": "..."}, ...]}`
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || response.statusText
      return res.status(502).json({ error: 'Failed to generate posts', message: msg })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      return res.status(502).json({ error: 'Invalid response from AI service' })
    }

    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    if (type === 'reddit') {
      return res.status(200).json({
        matchPost: parsed.matchPost || null,
        dayComment: parsed.dayComment || null,
      })
    } else {
      // Support both new format {summary, posts} and legacy array format
      const posts = Array.isArray(parsed) ? parsed : parsed.posts
      const summaryPost = Array.isArray(parsed) ? null : (parsed.summary || null)
      return res.status(200).json({ posts, summaryPost })
    }
  } catch (err) {
    console.error('draft-posts error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to generate posts', message: err?.message })
  }
}

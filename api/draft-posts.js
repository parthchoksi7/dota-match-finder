import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'
import { uploadMedia, postTweet, postPoll, checkTwitterEnv } from './_x-post.js'

// ── Cron / auto-tweet: tweet template ───────────────────────────────────────

// handles = { team1Handle, team2Handle, tournamentHandle, talentTags: [] }
// All handle fields are optional; falls back to bare names when absent.
export function makeSeriesTweet(team1, team2, winner, score, seriesLabel, tournament, link, isDraw = false, handles = {}) {
  const { team1Handle, team2Handle, tournamentHandle, talentTags = [] } = handles
  const tournamentStr = tournament || 'Unknown Tournament'

  const t1Display = team1Handle ? `@${team1Handle}` : team1
  const t2Display = team2Handle ? `@${team2Handle}` : team2
  const tournamentDisplay = tournamentHandle ? `${tournamentStr} | @${tournamentHandle}` : tournamentStr
  const talentLine = talentTags.length > 0 ? `\n${talentTags.map(t => `@${t}`).join(' ')}` : ''

  if (isDraw) {
    return `${t1Display} and ${t2Display} split the series 1-1\n${seriesLabel} | ${tournamentDisplay}\n${link}${talentLine}`
  }

  const winnerDisplay = winner === team1 ? t1Display : t2Display
  const loserDisplay = winner === team1 ? t2Display : t1Display
  return `${winnerDisplay} win ${score} over ${loserDisplay}\n${seriesLabel} | ${tournamentDisplay}\n${link}${talentLine}`
}

// ── Cron / auto-tweet: series helpers (exported for unit tests) ──────────────

import { getPremiumLeagueIds, trackError, PERMANENT_TIER1_NAMES, KV_TIER1_NAMES_KEY, isTier1ByName, isTier1, buildTournamentName, getSeriesLabel } from './_shared.js'
import { lookupTournamentHandle, lookupTeamHandle, pickTournamentTalent } from './_x-accounts.js'

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

export function winsNeeded(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  if (seriesType === 3) return 2 // BO2
  return 2
}

export function seriesComplete(games, seriesType) {
  const wins = {}
  for (const g of games) {
    const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
    wins[w] = (wins[w] || 0) + 1
  }
  const maxWins = Math.max(0, ...Object.values(wins))
  if (maxWins >= winsNeeded(seriesType)) return true
  // BO2 draw: 1-1 after 2 games is a valid final result
  const isBO2 = seriesType === 3 || seriesType === 1
  if (isBO2 && games.length >= 2 && maxWins === 1 && Object.keys(wins).length === 2) return true
  return false
}

export function seriesResult(games) {
  const wins = {}
  for (const g of games) {
    const radiant = g.radiant_name || 'Radiant'
    const dire = g.dire_name || 'Dire'
    if (!wins[radiant]) wins[radiant] = 0
    if (!wins[dire]) wins[dire] = 0
    const w = g.radiant_win ? radiant : dire
    wins[w] += 1
  }
  const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
  return { winner: sorted[0][0], score: sorted.map(([, v]) => v).join('-') }
}

// ── Cron / auto-tweet: URL helpers ───────────────────────────────────────────

const slugify = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function matchSlug(m) {
  return [slugify(m.radiant_name), 'vs', slugify(m.dire_name), slugify(m.league_name), m.match_id].join('-')
}

function seriesUrl(m) {
  return `spectateesports.live/match/${matchSlug(m)}`
}

// ── Cron / auto-tweet: core logic ────────────────────────────────────────────

async function runAutoTweet(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const missing = checkTwitterEnv()
  if (missing.length) {
    return res.status(503).json({ error: `Missing env vars: ${missing.join(', ')}` })
  }

  const [odRes, premiumIds, kvNames] = await Promise.all([
    fetch('https://api.opendota.com/api/promatches'),
    // Fix: if OD leagues endpoint is down, fall back to empty Set so the
    // isTier1ByName() name-based filter still runs (covers BLAST, PGL, etc.)
    getPremiumLeagueIds().catch(() => new Set()),
    kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
  ])
  if (!odRes.ok) return res.status(502).json({ error: 'OpenDota unavailable' })
  const raw = await odRes.json()
  if (!Array.isArray(raw)) return res.status(502).json({ error: 'Bad OpenDota response' })

  // Same filter the website uses for "Latest Results": premiumIds OR tier1 league name.
  // tier1Names is the same KV value (PandaScore tier S/A names) the website reads,
  // merged with the permanent hardcoded list as a cold-KV fallback.
  const tier1Names = [...new Set([
    ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
    ...(Array.isArray(kvNames) ? kvNames.map(n => n.toLowerCase()) : []),
  ])]
  // isTier1ByName expects match.league.name; adapt OpenDota's flat league_name field.
  const tier1 = raw.filter(m =>
    premiumIds.has(m.leagueid) ||
    isTier1ByName({ league: { name: m.league_name } }, tier1Names)
  )
  if (!tier1.length) return res.status(200).json({ tweeted: 0, message: 'No premium-tier matches' })

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

  // Batch-fetch series dedup keys from KV in one mget call.
  const seriesList = Object.values(seriesMap)
  const seriesKvKeys = seriesList.map(s => `auto-tweet:series:${s.key}`)
  const kvValues = seriesKvKeys.length > 0 ? await kv.mget(...seriesKvKeys) : []

  const kvMap = {}
  seriesKvKeys.forEach((key, i) => { if (kvValues[i] != null) kvMap[key] = String(kvValues[i]) })

  const results = []
  const failures = []
  let count = 0
  const MAX_PER_RUN = 5

  for (const s of seriesList) {
    if (count >= MAX_PER_RUN) break
    const { key: seriesKey, type: seriesType, games } = s
    // Detect BO2: seriesType 1 where the series ends 1-1 (both teams win exactly 1 game)
    const finalWins = {}
    for (const g of games) {
      const w = g.radiant_win ? (g.radiant_name || 'Radiant') : (g.dire_name || 'Dire')
      finalWins[w] = (finalWins[w] || 0) + 1
    }
    const finalMax = Math.max(0, ...Object.values(finalWins))
    const isBO2Draw = (seriesType === 3 || seriesType === 1) && games.length >= 2 && finalMax === 1 && Object.keys(finalWins).length === 2
    const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : seriesType === 3 ? 'BO2' : isBO2Draw ? 'BO2' : 'BO3'

    const sk = `auto-tweet:series:${seriesKey}`
    if (kvMap[sk] != null) continue
    if (!seriesComplete(games, seriesType)) continue

    const { winner, score } = seriesResult(games)
    const team1 = games[0].radiant_name || 'Radiant'
    const team2 = games[0].dire_name || 'Dire'
    const link = seriesUrl(games[0]) // always links to the first match
    const tournamentHandle = lookupTournamentHandle(games[0].league_name)
    const handles = {
      team1Handle: lookupTeamHandle(team1),
      team2Handle: lookupTeamHandle(team2),
      tournamentHandle,
      talentTags: pickTournamentTalent(tournamentHandle),
    }
    const text = makeSeriesTweet(team1, team2, winner, score, seriesLabel, games[0].league_name, link, isBO2Draw, handles)

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

    const twRes = await postTweet(text, mediaId, null)
    if (twRes.data?.id) {
      await kv.set(sk, twRes.data.id, { ex: 2592000 })
      count++
      results.push({ type: 'series', key: seriesKey, tweetId: twRes.data.id, hasImage: !!mediaId })
    } else {
      const errDetail = twRes.errors?.[0]?.message || twRes.title || JSON.stringify(twRes)
      console.error('Series tweet failed:', seriesKey, errDetail)
      failures.push({ key: seriesKey, error: errDetail })
    }
  }

  // If eligible series were found but every tweet attempt failed, return 500
  // so GitHub Actions --fail-with-body triggers the monitoring alert issue.
  if (failures.length > 0 && count === 0) {
    return res.status(500).json({ tweeted: 0, error: 'Twitter API errors on all attempts', failures })
  }

  return res.status(200).json({ tweeted: count, items: results })
}

// ── Daily digest: "Today in pro Dota" schedule tweet ─────────────────────────

async function fetchTodayMatches(token) {
  const now = new Date()
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const url = `${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=50&range[scheduled_at]=${now.toISOString()},${endOfDay.toISOString()}`
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const [response, tier1Names] = await Promise.all([
    fetch(url, { headers }),
    kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
  ])
  if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)
  const names = [...new Set([
    ...(Array.isArray(tier1Names) ? tier1Names.map(n => n.toLowerCase()) : []),
    ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
  ])]
  const data = await response.json()
  return (data || [])
    .filter(m => isTier1(m) || isTier1ByName(m, names))
    .filter(m => {
      const opps = m.opponents || []
      return opps.length === 2 && opps.every(o => o.opponent?.name && o.opponent.name !== 'TBD')
    })
}

function formatUtcTime(isoStr) {
  const d = new Date(isoStr)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function buildDigestTweet(matches) {
  const header = 'Today in pro Dota:\n\n'
  const footer = '\nspectateesports.live/calendar'
  const lines = matches.map(m => {
    const time = formatUtcTime(m.scheduled_at || m.begin_at)
    const teamA = m.opponents[0].opponent.name
    const teamB = m.opponents[1].opponent.name
    const tournament = buildTournamentName(m)
    const series = getSeriesLabel(m.match_type, m.number_of_games)
    return `${time} UTC — ${teamA} vs ${teamB} | ${tournament}${series ? ` ${series}` : ''}`
  })
  let body = ''
  let shown = 0
  for (let i = 0; i < lines.length; i++) {
    const candidate = body + lines[i] + '\n'
    if ((header + candidate + footer).length > 280) {
      const remaining = lines.length - shown
      if (remaining > 0) body += `+${remaining} more`
      break
    }
    body += lines[i] + '\n'
    shown++
  }
  return header + body + footer
}

async function runDailyDigest(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const missing = checkTwitterEnv()
  if (missing.length) return res.status(503).json({ error: `Missing env vars: ${missing.join(', ')}` })
  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

  const today = new Date().toISOString().slice(0, 10)
  const kvKey = `x-digest:${today}`
  const existing = await kv.get(kvKey).catch(() => null)
  if (existing) return res.status(200).json({ posted: false, reason: 'Already posted today' })

  let matches
  try {
    matches = await fetchTodayMatches(token)
  } catch (err) {
    await trackError('/api/draft-posts?type=digest', 502, err?.message)
    return res.status(502).json({ error: err.message })
  }
  if (matches.length === 0) return res.status(200).json({ posted: false, reason: 'No tier-1 matches today' })

  const text = buildDigestTweet(matches)
  const twRes = await postTweet(text)
  if (!twRes.data?.id) {
    const detail = twRes.errors?.[0]?.message || twRes.title || JSON.stringify(twRes)
    await trackError('/api/draft-posts?type=digest', 500, detail)
    return res.status(500).json({ error: 'Twitter post failed', detail })
  }
  await kv.set(kvKey, twRes.data.id, { ex: 172800 })
  return res.status(200).json({ posted: true, tweetId: twRes.data.id, matchCount: matches.length })
}

// ── Pre-match prediction poll ─────────────────────────────────────────────────

// Poll fires 90–240 min before match start. The 2-hour cron cadence and 150-minute
// window guarantees every match is caught by exactly one run.
const POLL_WINDOW_MIN_MS = 90 * 60 * 1000
const POLL_WINDOW_MAX_MS = 240 * 60 * 1000
const POLL_DURATION_MINUTES = 360
const POLL_SERIES_PRIORITY = { BO5: 3, BO3: 2, BO2: 1, BO1: 0 }

async function fetchPollWindowMatches(token) {
  const now = new Date()
  const windowStart = new Date(now.getTime() + POLL_WINDOW_MIN_MS)
  const windowEnd = new Date(now.getTime() + POLL_WINDOW_MAX_MS)
  const url = `${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=50&range[scheduled_at]=${windowStart.toISOString()},${windowEnd.toISOString()}`
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const [response, tier1Names] = await Promise.all([
    fetch(url, { headers }),
    kv.get(KV_TIER1_NAMES_KEY).catch(() => null),
  ])
  if (!response.ok) throw new Error(`PandaScore error: ${response.status}`)
  const names = [...new Set([
    ...(Array.isArray(tier1Names) ? tier1Names.map(n => n.toLowerCase()) : []),
    ...PERMANENT_TIER1_NAMES.map(n => n.toLowerCase()),
  ])]
  const data = await response.json()
  return (data || [])
    .filter(m => isTier1(m) || isTier1ByName(m, names))
    .filter(m => {
      const opps = m.opponents || []
      return opps.length === 2 && opps.every(o => o.opponent?.name && o.opponent.name !== 'TBD')
    })
    .sort((a, b) => {
      const pa = POLL_SERIES_PRIORITY[getSeriesLabel(a.match_type, a.number_of_games)] ?? -1
      const pb = POLL_SERIES_PRIORITY[getSeriesLabel(b.match_type, b.number_of_games)] ?? -1
      return pb - pa
    })
}

export function buildPollTweet(m) {
  const teamA = m.opponents[0].opponent.name
  const teamB = m.opponents[1].opponent.name
  const handleA = lookupTeamHandle(teamA)
  const handleB = lookupTeamHandle(teamB)
  // Only post when we can @mention both teams — that's what drives distribution
  if (!handleA || !handleB) return null
  const tournament = buildTournamentName(m)
  const series = getSeriesLabel(m.match_type, m.number_of_games)
  const text = `@${handleA} vs @${handleB} — who takes it?\n\n${tournament}${series ? ` | ${series}` : ''}\nspectateesports.live/calendar`
  return { text, options: [teamA, teamB] }
}

async function runMatchPoll(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const missing = checkTwitterEnv()
  if (missing.length) return res.status(503).json({ error: `Missing env vars: ${missing.join(', ')}` })
  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

  let matches
  try {
    matches = await fetchPollWindowMatches(token)
  } catch (err) {
    await trackError('/api/draft-posts?type=poll', 502, err?.message)
    return res.status(502).json({ error: err.message })
  }
  if (matches.length === 0) return res.status(200).json({ posted: 0, reason: 'No eligible matches in window' })

  let posted = 0
  const results = []
  const failures = []

  for (const m of matches) {
    if (posted >= 3) break
    const kvKey = `x-poll:match:${m.id}`
    const existing = await kv.get(kvKey).catch(() => null)
    if (existing) continue
    const poll = buildPollTweet(m)
    if (!poll) continue
    const twRes = await postPoll(poll.text, poll.options, POLL_DURATION_MINUTES)
    if (twRes.data?.id) {
      await kv.set(kvKey, twRes.data.id, { ex: 86400 })
      posted++
      results.push({ matchId: m.id, tweetId: twRes.data.id })
    } else {
      const detail = twRes.errors?.[0]?.message || twRes.title || JSON.stringify(twRes)
      console.error('Poll tweet failed:', m.id, detail)
      failures.push({ matchId: m.id, error: detail })
    }
  }

  if (failures.length > 0 && posted === 0) {
    await trackError('/api/draft-posts?type=poll', 500, failures[0]?.error)
    return res.status(500).json({ posted: 0, error: 'Twitter API errors on all attempts', failures })
  }
  return res.status(200).json({ posted, items: results })
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // GET = Vercel Cron trigger or GitHub Actions cron. Routes by ?type= param.
  if (req.method === 'GET') {
    const type = req.query?.type
    if (type === 'digest') return runDailyDigest(req, res)
    if (type === 'poll') return runMatchPoll(req, res)
    return runAutoTweet(req, res)
  }

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
    prompt = `You're a passionate Dota 2 fan who runs @SpectateDota2. You post about pro match results the way someone genuinely invested in the scene would — knowledgeable, occasionally emotional, never corporate. Generate one post per game for this series, plus one series summary post.

Series: ${team1} vs ${team2} - ${tournament} (${seriesLabel})
Final result: ${seriesWinner} won ${seriesScore}
Games:
${gamesText}${summaryLinkLine}

Examples of the right tone (do not copy — reference only):
- "Nobody's going 3-0 here. Spirit claw back and force a Game 3."
- "How does Entity keep doing this? Down all game, buyback into a throne race, series tied."
- "Tundra drop Game 2. Their draft had no answer for the lategame and it showed."

Rules for per-game posts:
- Write exactly ${games.length} post${games.length > 1 ? 's' : ''}, one per game
- Each post must use a different format — rotate through: single punchy sentence, question that fans want to answer, loser-focused, bold take + result detail, in-game moment, casual texting-a-friend style
- Under 200 characters each excluding the link (the replay link must appear at the end of every post)
- Always end with the exact replay link provided - do not modify or shorten it
- No hashtags. Vary whether or not you use emojis across posts
- ${games.length > 1 ? 'Think about the narrative arc: opener, momentum shift, decider — each game has a different weight' : "Keep it punchy since it's a single game"}
- Never start two posts the same way

Rules for the series summary post:
- Summarizes the full series outcome in one punchy post
- Mention both teams, the final score (${seriesScore}), and the series format (${seriesLabel})
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
    await trackError('/api/draft-posts', 500, err?.message)
    console.error('draft-posts error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to generate posts', message: err?.message })
  }
}

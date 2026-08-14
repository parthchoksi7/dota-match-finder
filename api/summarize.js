// Headroom above the 10s default: match-summary mode now does two serial fetches before the
// (unbounded-latency) Anthropic call — getMatchData (up to 8s) and, on a rare heroes-cache miss,
// getHeroNames (up to 5s) — where before 2026-07-19 the OpenDota fetch happened in the browser and
// never counted against this function's execution budget. Matches the headroom pattern already
// used by other multi-fetch handlers (api/live-matches.js, api/pipeline.js).
export const config = { maxDuration: 30 }

/** Allowed player fields for summary prompt (max 10 players). */
const PLAYER_FIELDS = ['hero_id', 'personaname', 'name', 'isRadiant', 'kills', 'deaths', 'assists', 'net_worth', 'hero_damage', 'lane_role']

/**
 * Trim match data before sending to Claude. Match level: duration, radiant_win, radiant_score, dire_score.
 * Per player (max 10): hero_id, personaname, isRadiant, kills, deaths, assists, net_worth, hero_damage.
 * Removes picks_bans, tower_damage, hero_healing, all item fields, and everything else.
 */
export function trimMatchDataForSummary(matchData) {
  if (!matchData || typeof matchData !== 'object') return matchData

  const out = {
    duration: matchData.duration,
    radiant_win: matchData.radiant_win,
    radiant_score: matchData.radiant_score,
    dire_score: matchData.dire_score,
    radiant_name: matchData.radiant_name,
    dire_name: matchData.dire_name,
  }

  // Include picks and bans for draft analysis
  if (Array.isArray(matchData.picks_bans)) {
    out.picks_bans = matchData.picks_bans.map(pb => ({
      is_pick: pb.is_pick,
      hero_id: pb.hero_id,
      team: pb.team,
      // pb.team: 0 = radiant, 1 = dire (OpenDota convention). Resolved server-side so the
      // model never has to re-derive team identity from a bare index at generation time —
      // that join was the root cause of players being attributed to the wrong team in the
      // prose output (e.g. a Team Spirit player's action credited to Aurora Gaming). Left
      // undefined (not defaulted to dire) when pb.team is neither 0 nor 1, so a malformed
      // record produces a gap the prompt-builder can skip rather than a confidently wrong label.
      team_name: pb.team === 0 ? out.radiant_name : pb.team === 1 ? out.dire_name : undefined,
      order: pb.order
    }))
  }

  if (Array.isArray(matchData.players)) {
    out.players = matchData.players.slice(0, 10).map((p) => {
      const trimmed = {}
      for (const key of PLAYER_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(p, key)) {
          trimmed[key] = p[key]
        }
      }
      // Use pro name if available
      trimmed.personaname = p.name || p.personaname
      if (trimmed.isRadiant === undefined && p.player_slot != null) {
        trimmed.isRadiant = p.player_slot < 128
      }
      // Same rationale as picks_bans.team_name above — give the model a ready-made,
      // unambiguous team label instead of an isRadiant boolean it has to cross-reference
      // against radiant_name/dire_name itself on every mention. Strict === check (not a
      // truthy check) so a player with no isRadiant AND no player_slot — trimmed.isRadiant
      // stays undefined — gets no team_name rather than silently defaulting to dire_name.
      if (trimmed.isRadiant === true) trimmed.team_name = out.radiant_name
      else if (trimmed.isRadiant === false) trimmed.team_name = out.dire_name
      return trimmed
    })
  }

  return out
}
// Fetch hero names from OpenDota. KV-cached 7 days (heroes don't change between patches).
// Falls back to empty map on any error so a slow OpenDota response never hangs the handler.
export async function getHeroNames() {
  const HERO_KV_KEY = 'opendota:hero_names_v1'
  const HERO_TTL = 60 * 60 * 24 * 7
  try {
    const cached = await _kv.get(HERO_KV_KEY)
    if (cached) return cached
  } catch {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch('https://api.opendota.com/api/heroes', { signal: controller.signal })
    if (!res.ok) return {}
    const data = await res.json()
    const map = {}
    for (const h of data) map[h.id] = h.localized_name
    _kv.set(HERO_KV_KEY, map, { ex: HERO_TTL }).catch(() => {})
    return map
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}
export const MATCH_SUMMARY_MODEL = 'claude-haiku-4-5-20251001'
// Lowered from the API default of 1.0 (2026-08-13): this is a factual/analytical task, not a
// creative one, and a lower temperature reduces the model's tendency to embellish beyond what's
// in the data (inventing narrative beats, rounding/misquoting stats) at negligible cost to
// fluency. Kept above 0 so summaries for similar matches don't read as robotically identical.
export const MATCH_SUMMARY_TEMPERATURE = 0.3

/**
 * Builds the full match-summary prompt from hero-name-resolved trimmed match data.
 * Exported (not just used by the handler below) so scripts/eval-match-summary.mjs exercises the
 * exact production prompt rather than a hand-copied approximation of it — a prompt eval that
 * tests a drifted copy would pass or fail independently of what actually ships (see
 * scripts/verify-prod.mjs's findLeague import for the same lesson learned the hard way).
 */
export function buildMatchSummaryPrompt(trimmedWithHeroNames, heroes) {
  const trimmed = {
    ...trimmedWithHeroNames,
    players: Array.isArray(trimmedWithHeroNames.players)
      ? trimmedWithHeroNames.players.map(p => ({ ...p, hero_name: p.hero_name || heroes[p.hero_id] || 'Unknown Hero' }))
      : trimmedWithHeroNames.players,
    picks_bans: Array.isArray(trimmedWithHeroNames.picks_bans)
      ? trimmedWithHeroNames.picks_bans.map(pb => ({ ...pb, hero_name: pb.hero_name || heroes[pb.hero_id] || 'Unknown Hero' }))
      : trimmedWithHeroNames.picks_bans,
  }

  // Pre-resolved roster text, grouped by team, given to the model as ready-made ground
  // truth. Fixes a real bug: without this, the model had to re-derive each player's team
  // from an isRadiant boolean at generation time and would drift mid-summary (e.g.
  // crediting a Team Spirit player's action to Aurora Gaming in the STRATEGY section
  // while correctly attributing the same player to Team Spirit in MVP).
  // Strict === checks (not truthy/falsy) so a player whose team couldn't be resolved
  // (isRadiant left undefined by trimMatchDataForSummary) is omitted from both rosters
  // rather than falling into the dire bucket by default — an omission the model can't act
  // on wrongly, versus a confident-but-wrong label it would.
  const radiantRoster = (trimmed.players || [])
    .filter(p => p.isRadiant === true)
    .map(p => `${p.personaname} (${p.hero_name})`)
    .join(', ')
  const direRoster = (trimmed.players || [])
    .filter(p => p.isRadiant === false)
    .map(p => `${p.personaname} (${p.hero_name})`)
    .join(', ')

  return `You are a professional Dota 2 analyst. Analyze this match and give a summary in exactly 4 sections. Do NOT use markdown, hashtags, asterisks, or any special formatting. Use plain text only.

TEAM ROSTERS (ground truth — every player belongs to exactly one of these two teams, for the entire match, no exceptions):
${trimmed.radiant_name}: ${radiantRoster}
${trimmed.dire_name}: ${direRoster}

Before writing any sentence that names a player, find that player in the roster above and use only the team listed next to them. Never attribute a player's action, stat, or strategy to the other team. Every player object in the JSON below also carries an explicit team_name field — trust that field, do not infer team from anything else.

Format your response exactly like this:

DRAFT ANALYSIS
Draft Winner: [Team Name]
[2-3 sentences using ONLY the draft data above — analyze hero synergies, win conditions, counters, and team composition. Do NOT reference kills, deaths, damage, gold, game duration, or who actually won. Judge the draft purely on hero picks and the players/teams assigned to them, as if the game had not been played yet. If the draft was very even, say so.]

STRATEGY
[One sentence on each team's game plan and execution]

MVP
[Player name] — [Why they were the standout based on stats and impact]

HIGHLIGHT
[One exceptional moment or stat that defined the match]

Rules:
- Use pro player names from the personaname field
- Use team names (radiant_name, dire_name), never say Radiant or Dire
- Be specific and analytical, not generic
- Keep the whole summary under 250 words
- No markdown formatting whatsoever
- Every number you state (kills, deaths, assists, net worth, hero damage) must be quoted exactly from the data below, not rounded, estimated, or invented
- Only describe moments or stats present in the data below. Do not invent narrative events (e.g. a specific kill, gank, or team fight) that isn't backed by a field in the data

Draft data (picks and bans only — use this for DRAFT ANALYSIS): ${JSON.stringify({
  radiant_name: trimmed.radiant_name,
  dire_name: trimmed.dire_name,
  picks_bans: trimmed.picks_bans,
  players: (trimmed.players || []).map(p => ({ personaname: p.personaname, hero_name: p.hero_name, team_name: p.team_name, lane_role: p.lane_role }))
})}

Full match data (use this for STRATEGY, MVP, and HIGHLIGHT only): ${JSON.stringify(trimmed)}`
}

// ── Tournament summary handler ───────────────────────────────────────────────
// Called with POST { type: 'tournament', seriesId, name, leagueName, ... }
// Caches 24h for live/upcoming, 30 days for completed.

import { kv as _kv } from './_kv.js'
import { trackError, rateLimitByIp, setCorsHeaders, createLogger, validateId } from './_shared.js'

// Fetches a match server-side. OpenDota's Cloudflare bot protection can 403 direct browser
// requests and drop the CORS header on that response (the browser then reports a CORS failure,
// not the underlying 403) — the same failure class that broke fetchHeroes() sitewide (fixed via
// ?mode=heroes-proxy). Mirrors getHeroNames()'s fail-open shape: any error (timeout, network,
// non-2xx, bad JSON) returns null rather than throwing, so the caller has one check to make.
export async function getMatchData(matchId, log) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`, { signal: controller.signal })
    if (!res.ok) {
      log.warn('OpenDota match fetch failed', { matchId, status: res.status })
      return null
    }
    return await res.json()
  } catch (err) {
    log.warn('OpenDota match fetch threw', { matchId, error: err?.message })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function handleTournamentSummary(req, res) {
  const { seriesId, name, leagueName, status, beginAt, endAt, prizePool, teams, stages } = req.body || {}

  if (!seriesId || !name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const isCompleted = status === 'completed'
  const TTL = isCompleted ? 60 * 60 * 24 * 30 : 60 * 60 * 24
  const cacheKey = `tournament:summary:${seriesId}`

  try {
    const cached = await _kv.get(cacheKey)
    if (cached) return res.status(200).json({ summary: cached })
  } catch {}

  const teamNames = (teams || []).slice(0, 16).map(t => t.name).join(', ')
  const stageNames = (stages || []).map(s => s.name).join(', ')
  let dateRange = ''
  if (beginAt && endAt) {
    const start = new Date(beginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const end = new Date(endAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    dateRange = `${start} - ${end}`
  }

  const prompt = `You are a professional Dota 2 esports analyst. Write a short summary paragraph about this tournament for fans visiting the tournament page.

Tournament: ${name}
Organizer: ${leagueName || 'Unknown'}
Status: ${status}
Dates: ${dateRange || 'Unknown'}
Prize Pool: ${prizePool || 'Unknown'}
Stages: ${stageNames || 'Unknown'}
Teams: ${teamNames || 'Unknown'}

Write 3-5 sentences covering why this tournament matters, notable aspects (prize pool, format, prestige), and what fans should watch for (or the result if completed). Rules: never use em dashes, plain text only, no markdown, maximum 100 words.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const msg = data.error?.message || response.statusText
    return res.status(502).json({ error: 'Failed to generate summary', message: msg })
  }

  const text = data.content?.[0]?.text
  if (typeof text !== 'string') return res.status(502).json({ error: 'Invalid response from summary service' })

  _kv.set(cacheKey, text, { ex: TTL }).catch(e => console.error(JSON.stringify({ level: 'error', endpoint: '/api/summarize', msg: 'KV write failed', error: e?.message, ts: Date.now() })))
  return res.status(200).json({ summary: text })
}

export default async function handler(req, res) {
  const log = createLogger('/api/summarize')
  if (setCorsHeaders(req, res)) return
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.error('ANTHROPIC_API_KEY not set')
    return res.status(503).json({
      error: 'Summary service unavailable',
      message: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.'
    })
  }

  const allowed = await rateLimitByIp(req, _kv, 'summarize', 10)
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' })

  // Tournament summary mode
  if (req.body?.type === 'tournament') {
    try {
      return await handleTournamentSummary(req, res)
    } catch (err) {
      log.error('tournament summary error', { error: err?.message })
      return res.status(500).json({ error: 'Failed to generate summary', message: err?.message })
    }
  }

  const { matchId } = req.body || {}
  const idV = validateId(matchId, { name: 'matchId' })
  if (!idV.ok) {
    return res.status(400).json({ error: idV.error })
  }

  const matchData = await getMatchData(idV.value, log)
  if (!matchData) {
    return res.status(502).json({ error: 'Failed to fetch match data', message: 'OpenDota is unavailable or the match was not found' })
  }

  const trimmed = trimMatchDataForSummary(matchData)

  try {
    const heroes = await getHeroNames()
    const prompt = buildMatchSummaryPrompt(trimmed, heroes)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MATCH_SUMMARY_MODEL,
        max_tokens: 400,
        temperature: MATCH_SUMMARY_TEMPERATURE,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || data.message || response.statusText
      log.error('Anthropic API error', { status: response.status, msg })
      return res.status(response.status >= 500 ? 502 : 400).json({
        error: 'Failed to generate summary',
        message: msg
      })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      log.error('unexpected Anthropic response shape', { preview: JSON.stringify(data).slice(0, 200) })
      return res.status(502).json({ error: 'Invalid response from summary service' })
    }

    return res.status(200).json({ summary: text })
  } catch (error) {
    await trackError('/api/summarize', 500, error?.message, error)
    log.error('summarize error', { error: error?.message })
    return res.status(500).json({
      error: 'Failed to generate summary',
      message: error?.message || 'Internal server error'
    })
  }
}
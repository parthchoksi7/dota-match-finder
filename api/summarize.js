/** Allowed player fields for summary prompt (max 10 players). */
const PLAYER_FIELDS = ['hero_id', 'personaname', 'name', 'isRadiant', 'kills', 'deaths', 'assists', 'net_worth', 'hero_damage', 'lane_role']

/**
 * Trim match data before sending to Claude. Match level: duration, radiant_win, radiant_score, dire_score.
 * Per player (max 10): hero_id, personaname, isRadiant, kills, deaths, assists, net_worth, hero_damage.
 * Removes picks_bans, tower_damage, hero_healing, all item fields, and everything else.
 */
function trimMatchDataForSummary(matchData) {
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
      return trimmed
    })
  }

  return out
}
// Fetch hero names from OpenDota
async function getHeroNames() {
  const res = await fetch('https://api.opendota.com/api/heroes')
  const data = await res.json()
  const map = {}
  for (const h of data) {
    map[h.id] = h.localized_name
  }
  return map
}
// ── Tournament summary handler ───────────────────────────────────────────────
// Called with POST { type: 'tournament', seriesId, name, leagueName, ... }
// Caches 24h for live/upcoming, 30 days for completed.

import { Redis } from '@upstash/redis'

const _kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

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

  _kv.set(cacheKey, text, { ex: TTL }).catch(() => {})
  return res.status(200).json({ summary: text })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Summarize API: ANTHROPIC_API_KEY is not set')
    return res.status(503).json({
      error: 'Summary service unavailable',
      message: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.'
    })
  }

  // Tournament summary mode
  if (req.body?.type === 'tournament') {
    try {
      return await handleTournamentSummary(req, res)
    } catch (err) {
      console.error('Tournament summary error:', err?.message || err)
      return res.status(500).json({ error: 'Failed to generate summary', message: err?.message })
    }
  }

  const { matchData } = req.body || {}
  if (!matchData) {
    return res.status(400).json({ error: 'Missing matchData in request body' })
  }

  const trimmed = trimMatchDataForSummary(matchData)
    // Resolve hero IDs to names
const heroes = await getHeroNames()

if (Array.isArray(trimmed.players)) {
  trimmed.players = trimmed.players.map(p => ({
    ...p,
    hero_name: heroes[p.hero_id] || 'Unknown Hero'
  }))
}

if (Array.isArray(trimmed.picks_bans)) {
  trimmed.picks_bans = trimmed.picks_bans.map(pb => ({
    ...pb,
    hero_name: heroes[pb.hero_id] || 'Unknown Hero'
  }))
}
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: `You are a professional Dota 2 analyst. Analyze this match and give a summary in exactly 4 sections. Do NOT use markdown, hashtags, asterisks, or any special formatting. Use plain text only.

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

Draft data (picks and bans only — use this for DRAFT ANALYSIS): ${JSON.stringify({
  radiant_name: trimmed.radiant_name,
  dire_name: trimmed.dire_name,
  picks_bans: trimmed.picks_bans,
  players: (trimmed.players || []).map(p => ({ personaname: p.personaname, hero_name: p.hero_name, isRadiant: p.isRadiant, lane_role: p.lane_role }))
})}

Full match data (use this for STRATEGY, MVP, and HIGHLIGHT only): ${JSON.stringify(trimmed)}`
          }
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || data.message || response.statusText
      console.error('Anthropic API error:', response.status, msg)
      return res.status(response.status >= 500 ? 502 : 400).json({
        error: 'Failed to generate summary',
        message: msg
      })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      console.error('Unexpected Anthropic response shape:', JSON.stringify(data).slice(0, 200))
      return res.status(502).json({ error: 'Invalid response from summary service' })
    }

    return res.status(200).json({ summary: text })
  } catch (error) {
    console.error('Summarize API error:', error?.message || error)
    return res.status(500).json({
      error: 'Failed to generate summary',
      message: error?.message || 'Internal server error'
    })
  }
}
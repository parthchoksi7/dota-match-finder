import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
import { generateCalendar, generateMatchEvent, formatDateUTC } from './ics-utils.js'

dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'
const MATCHES_TTL = 60 * 30 // 30 minutes
const TEAM_ID_TTL = 60 * 60 * 24 // 24 hours

// Known Tier 1 team slug -> PandaScore slug mapping
const TEAM_SLUG_ALIASES = {
  'liquid': 'team-liquid',
  'teamliquid': 'team-liquid',
  'tundra': 'tundra-esports',
  'spirit': 'team-spirit',
  'teamspirit': 'team-spirit',
  'betboom': 'betboom',
  'bb': 'betboom',
  'yandex': 'team-yandex',
  'teamyandex': 'team-yandex',
  'falcons': 'team-falcons',
  'teamfalcons': 'team-falcons',
  'gaimin': 'gaimin-gladiators',
  'gladiators': 'gaimin-gladiators',
  'gaimingladiators': 'gaimin-gladiators',
  'aurora': 'aurora-gaming',
  'talon': 'talon-esports',
  'nouns': 'nouns-esports',
  'og': 'og',
  'navi': 'natus-vincere',
  'natusvincere': 'natus-vincere',
  'virtuspro': 'virtus-pro',
  'vp': 'virtus-pro',
  'secret': 'team-secret',
  'teamsecret': 'team-secret',
  'aster': 'team-aster',
  'teamaster': 'team-aster',
}

function normalizeSlug(input) {
  const clean = input.toLowerCase().replace(/[\s-_]/g, '')
  return TEAM_SLUG_ALIASES[clean] || input.toLowerCase().trim()
}

async function resolveTeamId(slug, token) {
  const cacheKey = `calendar:team_id:${slug}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return cached
  } catch {}

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  const url = `${PANDASCORE_BASE}/teams?filter[slug]=${encodeURIComponent(slug)}&page[size]=1`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`PandaScore teams lookup failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) {
    // Try searching by name
    const searchUrl = `${PANDASCORE_BASE}/teams?search[name]=${encodeURIComponent(slug)}&page[size]=1`
    const searchRes = await fetch(searchUrl, { headers })
    if (!searchRes.ok) throw new Error(`PandaScore team search failed: ${searchRes.status}`)
    const searchData = await searchRes.json()
    if (!Array.isArray(searchData) || searchData.length === 0) return null
    const teamId = searchData[0].id
    try { await kv.set(cacheKey, teamId, { ex: TEAM_ID_TTL }) } catch {}
    return teamId
  }
  const teamId = data[0].id
  try { await kv.set(cacheKey, teamId, { ex: TEAM_ID_TTL }) } catch {}
  return teamId
}

async function fetchMatchesForTeam(teamId, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  // Fetch upcoming + running + recent past (7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const [upcomingRes, runningRes, pastRes] = await Promise.all([
    fetch(
      `${PANDASCORE_BASE}/matches/upcoming?filter[opponent_id]=${teamId}&sort=scheduled_at&page[size]=50`,
      { headers }
    ),
    fetch(
      `${PANDASCORE_BASE}/matches/running?filter[opponent_id]=${teamId}&page[size]=10`,
      { headers }
    ),
    fetch(
      `${PANDASCORE_BASE}/matches/past?filter[opponent_id]=${teamId}&sort=-end_at&page[size]=20&range[end_at]=${sevenDaysAgo},${sevenDaysAhead}`,
      { headers }
    ),
  ])

  const results = await Promise.allSettled([
    upcomingRes.ok ? upcomingRes.json() : Promise.resolve([]),
    runningRes.ok ? runningRes.json() : Promise.resolve([]),
    pastRes.ok ? pastRes.json() : Promise.resolve([]),
  ])

  const upcoming = results[0].status === 'fulfilled' ? (results[0].value || []) : []
  const running = results[1].status === 'fulfilled' ? (results[1].value || []) : []
  const past = results[2].status === 'fulfilled' ? (results[2].value || []) : []

  return [...running, ...upcoming, ...past]
}

export default async function handler(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    res.status(503).send('PANDASCORE_TOKEN not configured')
    return
  }

  const teamsParam = req.query?.teams || ''
  if (!teamsParam) {
    res.status(400).send('Missing required parameter: teams')
    return
  }

  const teamSlugs = teamsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeSlug)
    .slice(0, 10) // max 10 teams

  if (teamSlugs.length === 0) {
    res.status(400).send('No valid team slugs provided')
    return
  }

  console.log(`calendar/team: request for teams=${teamSlugs.join(',')}`)

  const sortedSlugs = [...teamSlugs].sort()
  const cacheKey = `calendar:matches:${sortedSlugs.join(',')}`

  let matches = null
  try {
    matches = await kv.get(cacheKey)
    if (matches) console.log('calendar/team: serving from KV cache')
  } catch (err) {
    console.warn('KV read failed:', err?.message)
  }

  if (!matches) {
    try {
      // Resolve team IDs in parallel
      const teamIds = await Promise.all(
        teamSlugs.map(slug => resolveTeamId(slug, token))
      )
      const validIds = teamIds.filter(Boolean)

      if (validIds.length === 0) {
        res.status(404).send(`No teams found for slugs: ${teamSlugs.join(', ')}`)
        return
      }

      // Fetch matches for each team
      const matchArrays = await Promise.all(
        validIds.map(id => fetchMatchesForTeam(id, token).catch(() => []))
      )

      // Deduplicate by match ID
      const seen = new Set()
      matches = []
      for (const arr of matchArrays) {
        for (const m of arr) {
          if (!seen.has(m.id)) {
            seen.add(m.id)
            matches.push(m)
          }
        }
      }

      // Sort by scheduled time
      matches.sort((a, b) => {
        const ta = a.begin_at || a.scheduled_at || ''
        const tb = b.begin_at || b.scheduled_at || ''
        return ta < tb ? -1 : ta > tb ? 1 : 0
      })

      try {
        await kv.set(cacheKey, matches, { ex: MATCHES_TTL })
      } catch (err) {
        console.warn('KV write failed:', err?.message)
      }
    } catch (err) {
      console.error('calendar/team error:', err?.message)
      res.status(500).send(`Failed to fetch match data: ${err.message}`)
      return
    }
  }

  console.log(`calendar/team: generating .ics for ${matches.length} matches, teams=${teamSlugs.join(',')}`)

  const dtstamp = formatDateUTC(new Date())
  const eventBlocks = matches.map(m => generateMatchEvent(m, dtstamp)).filter(Boolean)

  const calName = `Dota 2 - ${teamSlugs.join(', ')}`
  const icsContent = generateCalendar(calName, eventBlocks)

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="dota2-matches.ics"')
  res.setHeader('Cache-Control', 'public, max-age=1800')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).send(icsContent)
}

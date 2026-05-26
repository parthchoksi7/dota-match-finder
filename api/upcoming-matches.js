import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'

const KV_KEY = 'dota2:upcoming_matches_v6'
const TTL = 60 * 15 // 15 minutes

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

import { isTier1, isTier1ByName, getTwitchStreams, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES, buildTournamentName, trackError, parseBracketRound, getSeriesLabel } from './_shared.js'

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  const leagueName = m.league?.name || ''
  const serieName = m.serie?.full_name || m.serie?.name || ''

  return {
    id: m.id,
    scheduledAt: m.scheduled_at || m.begin_at || null,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    bracketRound: parseBracketRound(m.name),
    streams: getTwitchStreams(m.streams_list, leagueName, serieName),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  if (req.query?.bust === '1') {
    await kv.del(KV_KEY)
    console.log('Upcoming matches cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      console.log('Upcoming matches: serving from KV cache')
      return res.status(200).json(cached)
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  try {
    console.log('Upcoming matches: fetching from PandaScore')
    const now = new Date()
    const cutoff = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    const url = `${PANDASCORE_BASE}/matches/upcoming?sort=scheduled_at&page[size]=50&range[scheduled_at]=${now.toISOString()},${cutoff}`

    // Fetch tier1 names alongside matches — used as a fallback when PandaScore
    // hasn't assigned a tier to a new series yet (e.g. DreamLeague S29 at launch).
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
    const filtered = (data || [])
      .filter(m => isTier1(m) || isTier1ByName(m, names))

    // PandaScore sometimes creates stale duplicate entries when fixture pairings are
    // corrected (e.g. team A's opponent changes from B to C, leaving both the old A-B
    // and new A-C entries in the feed). Deduplicate by (teamId, scheduledAt): for each
    // slot, keep the highest match ID. A match is canonical only if every one of its
    // teams' slots still points back to it — otherwise the slot was claimed by a newer
    // match and this one is stale. TBD slots (no teamId) are always kept.
    const byTeamTime = new Map()
    for (const m of filtered) {
      const t = m.scheduled_at || m.begin_at || ''
      for (const opp of (m.opponents || [])) {
        const teamId = opp.opponent?.id
        if (!teamId) continue
        const key = `${teamId}|${t}`
        if (!byTeamTime.has(key) || m.id > byTeamTime.get(key).id) byTeamTime.set(key, m)
      }
    }
    const matches = filtered.filter(m => {
      const t = m.scheduled_at || m.begin_at || ''
      return (m.opponents || []).every(opp => {
        const teamId = opp.opponent?.id
        if (!teamId) return true
        return byTeamTime.get(`${teamId}|${t}`)?.id === m.id
      })
    }).map(mapMatch)

    const payload = { matches, fetchedAt: new Date().toISOString() }

    try {
      await kv.set(KV_KEY, payload, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    return res.status(200).json(payload)

  } catch (err) {
    await trackError('/api/upcoming-matches', 500, err?.message)
    console.error('Upcoming matches error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to fetch upcoming matches', message: err?.message })
  }
}

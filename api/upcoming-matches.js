import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from './_kv.js'

const KV_KEY = 'dota2:upcoming_matches_v6'
const TTL = 60 * 15 // 15 minutes

// Last-known-good payload, served instead of a 500 when the regen fails (PandaScore 429 being the
// observed cause -- Sentry JAVASCRIPT-A: 160 events in one unbroken 14-min window). A SECOND key is
// required: the `kv.get(KV_KEY)` early-return below means the fetch is only reached once KV_KEY has
// already been evicted, so there is nothing stale left to re-read. Not deleted by `?bust=1` --
// busting forces a fresh regen, it does not ask for the safety net to be dropped. An upcoming
// schedule ages far more gracefully than a live feed, so the 1h TTL costs little here.
// NOTE: the hold-down below deliberately breaks that invariant for up to STALE_HOLDDOWN_TTL_S.
// The held-down payload is tagged `stale: true` and the early return checks for it.
const LAST_GOOD_KEY = 'dota2:upcoming_matches_last_good'
const LAST_GOOD_TTL_S = 3600 // 1h

// See the equivalent block in api/live-matches.js for the full reasoning: without this, serving
// stale re-runs the PandaScore fetch on every origin request and AMPLIFIES the outage it absorbs
// (~12 req/hr normally -> ~120/hr while stale, against an already-exhausted account-wide bucket).
// Held far longer than live-matches' 60s on purpose: this endpoint serves the next 72h of
// SCHEDULED fixtures, which do not meaningfully change minute to minute, so there is no reason to
// pay for a fast retry here. 300s matches its normal s-maxage, i.e. no PANDASCORE amplification.
// Origin invocations do still rise (the stale header is s-maxage=30 here too, so ~12/hr -> ~120/hr
// for the duration), but those are cheap KV hits rather than quota spend. If the Fluid CPU budget
// ever matters more than recovery latency on this endpoint, raise its stale s-maxage rather than
// the hold-down.
const STALE_HOLDDOWN_TTL_S = 300
const STALE_CACHE_CONTROL = 's-maxage=30, stale-while-revalidate=30'

const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

import { isTier1, isTier1ByName, getTwitchStreams, KV_TIER1_NAMES_KEY, PERMANENT_TIER1_NAMES, buildTournamentName, trackError, parseBracketRound, getSeriesLabel, createLogger, recordPsQuota } from './_shared.js'

function mapMatch(m) {
  const opponents = m.opponents || []
  const teamA = opponents[0]?.opponent?.name || 'TBD'
  const teamB = opponents[1]?.opponent?.name || 'TBD'
  return {
    id: m.id,
    scheduledAt: m.scheduled_at || m.begin_at || null,
    teamA,
    teamB,
    tournament: buildTournamentName(m),
    seriesLabel: getSeriesLabel(m.match_type, m.number_of_games),
    bracketRound: parseBracketRound(m.name),
    streams: getTwitchStreams(m.streams_list),
  }
}

export default async function handler(req, res) {
  const log = createLogger('/api/upcoming-matches')
  res.setHeader('Access-Control-Allow-Origin', '*')
  // 60 -> 300 (2026-08-09, Fluid Active CPU budget). Unlike /api/live-matches this payload is a
  // SCHEDULE, not live state — its KV TTL is already 15 min (`TTL` above), so callers have always
  // tolerated multi-minute age here. The saving is real for a solo viewer specifically BECAUSE 300s
  // exceeds the client's 120s poll interval: only requests landing inside s-maxage avoid an origin
  // invocation (past it, stale-while-revalidate still revalidates in the background), so a TTL
  // below the poll interval would save nothing at all.
  // swr is held at 300 (not 900) so total edge age stays bounded at ~10 min; worst-case served age
  // is ~15 min KV + ~10 min edge. That bound also caps how long a `?bust=1` stays invisible to real
  // users, since busting deletes KV but cannot purge the normal key's already-cached response.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })
  }

  if (req.query?.bust === '1') {
    // `?bust=1` is its own edge cache key — without this it would cache the busted response and
    // defeat the next bust.
    res.setHeader('Cache-Control', 'no-store')
    await kv.del(KV_KEY)
    log.info('cache cleared')
  }

  try {
    const cached = await kv.get(KV_KEY)
    if (cached) {
      // A held-down stale payload lives under this same key and must not inherit the normal 300s
      // edge header — see STALE_HOLDDOWN_TTL_S.
      if (cached.stale && req.query?.bust !== '1') {
        res.setHeader('Cache-Control', STALE_CACHE_CONTROL)
      }
      log.info('serving from KV cache', cached.stale ? { stale: true } : undefined)
      return res.status(200).json(cached)
    }
  } catch (err) {
    log.warn('KV cache read failed', { error: err?.message })
  }

  try {
    log.info('fetching from PandaScore')
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
    // Before the throw on purpose: a 429 response still carries the quota header, and that is
    // the single most diagnostic reading there is. Un-awaited on the happy path (telemetry must
    // add no latency there; it never throws), but AWAITED before throwing — below the low-water
    // mark it does three Upstash round-trips, and Vercel freezes the lambda once the response is
    // flushed, which would drop exactly the exhaustion sample this exists to capture.
    const quota = recordPsQuota(response, 'upcoming-matches:public')
    if (!response.ok) {
      await quota
      throw new Error(`PandaScore error: ${response.status}`)
    }

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
      await Promise.all([
        kv.set(KV_KEY, payload, { ex: TTL }),
        kv.set(LAST_GOOD_KEY, payload, { ex: LAST_GOOD_TTL_S }),
      ])
    } catch (err) {
      log.warn('KV cache write failed', { error: err?.message })
    }

    return res.status(200).json(payload)

  } catch (err) {
    // try/catch, not .catch(): a synchronous throw from the Upstash client (argument validation,
    // for one) escapes a promise .catch() entirely and would surface as an unhandled rejection and
    // a bare platform 500 with no trackError. The D1 regression test proves sync throws from this
    // client are reachable in practice.
    let lastGood = null
    try { lastGood = await kv.get(LAST_GOOD_KEY) } catch { lastGood = null }
    if (lastGood) {
      // Recorded at 200, not 500 — see the matching note in api/live-matches.js.
      // Sentry deliberately skipped: this is a HANDLED failure the visitor never saw, and an
      // absorbed 429 storm would otherwise burn hundreds of Sentry events for a non-incident. It
      // stays fully visible in ?mode=monitor's errors_by_endpoint and in the structured logs.
      await trackError('/api/upcoming-matches', 200, `absorbed, served last-known-good: ${err?.message}`, err, { sentry: false })
      log.warn('serving last-known-good payload', { error: err?.message, fetchedAt: lastGood.fetchedAt })
      if (req.query?.bust !== '1') res.setHeader('Cache-Control', STALE_CACHE_CONTROL)
      const stalePayload = { ...lastGood, stale: true }
      // Hold-down write: bounds how often the origin retries PandaScore while it is failing.
      // Skipped under ?bust=1 — that request just deleted KV_KEY deliberately, and writing stale
      // straight back would re-poison the cache an operator explicitly asked to be emptied, making
      // the NEXT normal request serve stale instead of retrying.
      if (req.query?.bust !== '1') {
        try {
          await kv.set(KV_KEY, stalePayload, { ex: STALE_HOLDDOWN_TTL_S })
        } catch { /* hold-down is an optimisation; never fail the response for it */ }
      }
      return res.status(200).json(stalePayload)
    }
    // 4-arg (passes the real `err`) and deliberately NOT normalized to match live-matches.js's
    // 3-arg hard-500 path: this one already passed `err` before the last-known-good work, so
    // leaving it is the no-change option. live-matches.js stays 3-arg to avoid re-fingerprinting
    // Sentry JAVASCRIPT-7 mid-investigation. Do not "tidy" these into agreement without deciding
    // which Sentry issue you are willing to split.
    await trackError('/api/upcoming-matches', 500, err?.message, err)
    log.error('upcoming matches fetch failed', { error: err?.message })
    return res.status(500).json({ error: 'Failed to fetch upcoming matches', message: err?.message })
  }
}

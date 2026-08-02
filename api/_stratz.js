/**
 * STRATZ GraphQL client — post-game match enrichment only (position/role/imp/award).
 * Prefixed with _ so Vercel does NOT deploy this as a serverless function.
 *
 * Scope guard (see .claude/specs/stratz-api-audit.md): do NOT build against `live` or
 * `league.*` here — both are unavailable for the leagues/events this product covers.
 * Match-level data is the only verified-working surface.
 */

import { createLogger } from './_shared.js'

const STRATZ_ENDPOINT = 'https://api.stratz.com/graphql'

// `User-Agent: STRATZ_API` is mandatory on every request — verified Node's fetch
// actually transmits it; some HTTP clients silently drop custom UAs.
const STRATZ_USER_AGENT = 'STRATZ_API'

const log = createLogger('/api/_stratz')

const MATCH_ENRICHMENT_QUERY = `
  query MatchEnrichment($matchId: Long!) {
    match(id: $matchId) {
      players {
        heroId
        position
        role
        imp
        award
      }
    }
  }
`

/**
 * Fetches per-player position/role/imp/award for one match.
 * Returns the raw STRATZ players array, or null on any failure/miss (fails open —
 * callers must treat null as "no enrichment available right now", never an error state).
 */
export async function fetchStratzMatchEnrichment(matchId) {
  const token = process.env.STRATZ_TOKEN
  if (!token) {
    log.warn('STRATZ_TOKEN not configured — enrichment disabled', { matchId })
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(STRATZ_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': STRATZ_USER_AGENT,
      },
      body: JSON.stringify({
        query: MATCH_ENRICHMENT_QUERY,
        variables: { matchId: Number(matchId) },
      }),
    })
    if (!res.ok) {
      log.warn('STRATZ API error', { status: res.status, matchId })
      return null
    }

    const json = await res.json()
    if (json?.errors) {
      log.warn('STRATZ GraphQL error', { errors: json.errors, matchId })
      return null
    }

    const players = json?.data?.match?.players
    if (!Array.isArray(players) || players.length === 0) {
      log.warn('STRATZ returned no players', { matchId })
      return null
    }
    return players
  } catch (err) {
    log.warn('STRATZ fetch failed', { error: err?.message, matchId })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// STRATZ position enum → the Carry/Mid/Offlane/Soft Support/Hard Support terminology
// fans actually use (not STRATZ's internal POSITION_N jargon).
const POSITION_LABELS = {
  POSITION_1: 'Carry',
  POSITION_2: 'Mid',
  POSITION_3: 'Offlane',
  POSITION_4: 'Soft Support',
  POSITION_5: 'Hard Support',
}

const POSITION_NUMBERS = {
  POSITION_1: 1,
  POSITION_2: 2,
  POSITION_3: 3,
  POSITION_4: 4,
  POSITION_5: 5,
}

// Fallback label when `position` is null but the coarser `role` isn't — role can only
// disambiguate LIGHT_SUPPORT (pos 4) vs HARD_SUPPORT (pos 5) from CORE (pos 1-3, ambiguous).
// A role-only fallback never carries a position number.
const ROLE_FALLBACK_LABELS = {
  LIGHT_SUPPORT: 'Soft Support',
  HARD_SUPPORT: 'Hard Support',
  CORE: 'Core',
}

export function stratzPositionNumber(position) {
  return POSITION_NUMBERS[position] ?? null
}

export function stratzPositionLabel(position, role) {
  return POSITION_LABELS[position] || ROLE_FALLBACK_LABELS[role] || null
}

// STRATZ's `award` enum, confirmed live against real match data (2026-08-01): `NONE`
// (no award — the common case), `MVP`, `TOP_CORE`, `TOP_SUPPORT`. By product decision
// only MVP is surfaced — TOP_CORE/TOP_SUPPORT are deliberately treated the same as NONE
// (no badge), keeping the trophy badge scoped to the single highest-value distinction
// per match rather than diluting it across three per-match recognitions.
export function stratzAwardLabel(award) {
  return award === 'MVP' ? 'MVP' : null
}

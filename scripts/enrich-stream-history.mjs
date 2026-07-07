/**
 * Enrichment pass: fills in ps_match_id, tournament, match_type, bracket_round,
 * and streams_json for match_stream_history rows that have null tournament.
 *
 * Run from repo root:
 *   node scripts/enrich-stream-history.mjs
 *
 * Safe to re-run — skips rows that already have tournament set.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { findBestPsMatch } from '../api/_shared.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PS_TOKEN = process.env.PANDASCORE_TOKEN
const PS_BASE = 'https://api.pandascore.co/dota2'
const PS_HEADERS = { Authorization: `Bearer ${PS_TOKEN}`, Accept: 'application/json' }

// Only enrich recent rows by default. Older null rows are either already past PandaScore's
// indexing window or series PS will never list, so re-querying them every run wastes PS
// calls. Set ENRICH_LOOKBACK_HOURS=0 to scan the entire table (one-off full backfill).
// Any invalid value falls back to 48 so a typo can't trigger an unbounded full scan.
const rawLookback = (process.env.ENRICH_LOOKBACK_HOURS ?? '').trim()
const LOOKBACK_HOURS = rawLookback !== '' && Number.isFinite(Number(rawLookback)) && Number(rawLookback) >= 0
  ? Number(rawLookback)
  : 48

function buildTournamentName(m) {
  const parts = [m.league?.name, m.serie?.full_name || m.serie?.name, m.tournament?.name].filter(Boolean)
  return parts.join(' — ') || null
}

function parseBracketRound(name) {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('grand final')) return 'Grand Final'
  if (n.includes('upper bracket final') || n.includes('winners final')) return 'Upper Bracket Final'
  if (n.includes('lower bracket final') || n.includes('losers final')) return 'Lower Bracket Final'
  if (n.includes('upper bracket semifinal') || n.includes('winners semifinal')) return 'Upper Bracket Semifinal'
  if (n.includes('lower bracket semifinal') || n.includes('losers semifinal')) return 'Lower Bracket Semifinal'
  if (n.includes('upper bracket') || n.includes('winners bracket')) return 'Upper Bracket'
  if (n.includes('lower bracket') || n.includes('losers bracket')) return 'Lower Bracket'
  if (n.includes('semifinal')) return 'Semifinal'
  if (n.includes('quarterfinal')) return 'Quarterfinal'
  if (n.includes('final')) return 'Final'
  return null
}

async function fetchPsMatch(startedAt, teamA, teamB) {
  const startTime = new Date(startedAt).getTime() / 1000
  const fromIso = new Date((startTime - 3600) * 1000).toISOString()
  const toIso   = new Date((startTime + 3600) * 1000).toISOString()
  const url = `${PS_BASE}/matches?range[begin_at]=${fromIso},${toIso}&sort=begin_at&page[size]=20`
  const res = await fetch(url, { headers: PS_HEADERS })
  if (!res.ok) return null
  const matches = await res.json()
  return findBestPsMatch(matches, teamA, teamB)
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  if (!PS_TOKEN) { console.error('PANDASCORE_TOKEN not set'); process.exit(1) }

  // Fetch rows that still need PS enrichment, limited to the lookback window.
  let query = supabase
    .from('match_stream_history')
    .select('id, od_match_id, started_at, team_a, team_b, channel')
    .is('tournament', null)
    .order('started_at', { ascending: true })
  if (LOOKBACK_HOURS > 0) {
    const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString()
    query = query.gte('started_at', cutoff)
  }
  const { data: rows, error } = await query

  if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }
  console.log(`${rows.length} rows need PS enrichment` + (LOOKBACK_HOURS > 0 ? ` (last ${LOOKBACK_HOURS}h)` : ' (full table)'))

  let updated = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    process.stdout.write(`[${i + 1}/${rows.length}] Match ${row.od_match_id} (${row.team_a} vs ${row.team_b})... `)

    if (!row.team_a || !row.team_b) {
      console.log('no team names, skipping')
      skipped++
      continue
    }

    const psMatch = await fetchPsMatch(row.started_at, row.team_a, row.team_b)
    if (!psMatch) {
      console.log('no PS match found')
      skipped++
      await sleep(200)
      continue
    }

    const allOfficialStreams = (psMatch.streams_list || [])
      .filter(s => s.official && s.raw_url)
      .map(s => ({ raw_url: s.raw_url, language: s.language || null, official: true, main: s.main || false }))

    const update = {
      ps_match_id: psMatch.id,
      tournament: buildTournamentName(psMatch),
      match_type: psMatch.match_type || null,
      bracket_round: parseBracketRound(psMatch.name) || null,
      streams_json: allOfficialStreams.length > 0 ? allOfficialStreams : null,
    }

    const { error: updateErr } = await supabase
      .from('match_stream_history')
      .update(update)
      .eq('id', row.id)

    if (updateErr) {
      console.log(`update failed: ${updateErr.message}`)
    } else {
      console.log(`ok — ${update.tournament || 'unknown tournament'} (${update.match_type || '?'})`)
      updated++
    }

    await sleep(200)
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped (no team names or no PS match).`)
}

main().catch(err => { console.error(err); process.exit(1) })

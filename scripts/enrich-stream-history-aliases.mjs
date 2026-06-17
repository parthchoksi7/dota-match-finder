/**
 * Third enrichment pass: handles team name aliases where OD abbreviations
 * don't substring-match PS full names (e.g. "BB" vs "BetBoom Team").
 *
 * Queries PS with a wider ±6h window and applies alias expansion before matching.
 *
 * Run after enrich-stream-history-siblings.mjs:
 *   node scripts/enrich-stream-history-aliases.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PS_TOKEN = process.env.PANDASCORE_TOKEN
const PS_BASE = 'https://api.pandascore.co/dota2'
const PS_HEADERS = { Authorization: `Bearer ${PS_TOKEN}`, Accept: 'application/json' }

// Known OD abbreviation → PS full name expansions
const ALIASES = {
  'bb': ['betboom', 'bet boom'],
  'og': ['og '],
  'vp': ['virtus.pro', 'virtuspro'],
  'navi': ['natus vincere'],
}

function expand(name) {
  const lower = name?.toLowerCase() || ''
  return [lower, ...(ALIASES[lower] || [])]
}

function teamsMatchWithAliases(psOpponents, teamA, teamB) {
  if (!psOpponents || psOpponents.length < 2) return false
  const names = psOpponents.map(o => o.opponent?.name?.toLowerCase() || '')
  const aCandidates = expand(teamA)
  const bCandidates = expand(teamB)
  const matches = (psName, candidates) => candidates.some(c => psName.includes(c) || c.includes(psName))
  return (matches(names[0], aCandidates) || matches(names[0], bCandidates)) &&
         (matches(names[1], aCandidates) || matches(names[1], bCandidates))
}

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

async function fetchPsMatchWide(startedAt, teamA, teamB) {
  const startTime = new Date(startedAt).getTime() / 1000
  // ±6h window to catch series that started hours before this game
  const fromIso = new Date((startTime - 6 * 3600) * 1000).toISOString()
  const toIso   = new Date((startTime + 3600) * 1000).toISOString()
  const url = `${PS_BASE}/matches?range[begin_at]=${fromIso},${toIso}&sort=begin_at&page[size]=20`
  const res = await fetch(url, { headers: PS_HEADERS })
  if (!res.ok) return null
  const matches = await res.json()
  return (matches || []).find(m => teamsMatchWithAliases(m.opponents, teamA, teamB)) || null
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  if (!PS_TOKEN) { console.error('PANDASCORE_TOKEN not set'); process.exit(1) }

  const { data: rows, error } = await supabase
    .from('match_stream_history')
    .select('id, od_match_id, started_at, team_a, team_b')
    .is('tournament', null)
    .order('started_at', { ascending: true })

  if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }
  console.log(`${rows.length} rows still need enrichment`)

  let updated = 0
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    process.stdout.write(`[${i + 1}/${rows.length}] Match ${row.od_match_id} (${row.team_a} vs ${row.team_b})... `)

    if (!row.team_a || !row.team_b) { skipped++; console.log('no team names'); continue }

    const psMatch = await fetchPsMatchWide(row.started_at, row.team_a, row.team_b)
    if (!psMatch) { skipped++; console.log('no PS match found (qualifier or untracked)'); await sleep(200); continue }

    const allOfficialStreams = (psMatch.streams_list || [])
      .filter(s => s.official && s.raw_url)
      .map(s => ({ raw_url: s.raw_url, language: s.language || null, official: true, main: s.main || false }))

    const { error: updateErr } = await supabase
      .from('match_stream_history')
      .update({
        ps_match_id:   psMatch.id,
        tournament:    buildTournamentName(psMatch),
        match_type:    psMatch.match_type || null,
        bracket_round: parseBracketRound(psMatch.name) || null,
        streams_json:  allOfficialStreams.length > 0 ? allOfficialStreams : null,
      })
      .eq('id', row.id)

    if (updateErr) { console.log(`update failed: ${updateErr.message}`); skipped++ }
    else { console.log(`ok — ${buildTournamentName(psMatch)}`); updated++ }

    await sleep(200)
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`)
}

main().catch(err => { console.error(err); process.exit(1) })

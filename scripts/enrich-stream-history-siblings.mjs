/**
 * Second enrichment pass: copies ps_match_id / tournament / match_type /
 * bracket_round / streams_json from a sibling game row (same two teams,
 * already enriched) to rows that still have null tournament.
 *
 * This handles games 2 and 3 of a BO3 whose PS match begin_at predates
 * each game's start_time, causing the ±1h PS query to miss them.
 *
 * Run after enrich-stream-history.mjs:
 *   node scripts/enrich-stream-history-siblings.mjs
 *
 * Safe to re-run — skips rows that already have tournament set.
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

async function main() {
  // Fetch all rows so we can cross-reference in memory
  const { data: all, error } = await supabase
    .from('match_stream_history')
    .select('id, od_match_id, started_at, team_a, team_b, tournament, ps_match_id, match_type, bracket_round, streams_json')
    .order('started_at', { ascending: true })

  if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }

  const enriched  = all.filter(r => r.tournament !== null)
  const unenriched = all.filter(r => r.tournament === null)

  console.log(`${enriched.length} enriched, ${unenriched.length} still need sibling match`)

  let updated = 0
  let skipped = 0

  for (const row of unenriched) {
    const a = row.team_a?.toLowerCase()
    const b = row.team_b?.toLowerCase()
    if (!a || !b) { skipped++; continue }

    // Find an enriched sibling: same two teams (either order), started within 12h
    const rowTime = new Date(row.started_at).getTime()
    const sibling = enriched.find(e => {
      const ea = e.team_a?.toLowerCase()
      const eb = e.team_b?.toLowerCase()
      if (!ea || !eb) return false
      const sameTeams = (ea === a && eb === b) || (ea === b && eb === a)
      const withinWindow = Math.abs(new Date(e.started_at).getTime() - rowTime) < 12 * 3600 * 1000
      return sameTeams && withinWindow
    })

    if (!sibling) {
      process.stdout.write(`Match ${row.od_match_id} (${row.team_a} vs ${row.team_b}): no sibling found\n`)
      skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('match_stream_history')
      .update({
        ps_match_id:   sibling.ps_match_id,
        tournament:    sibling.tournament,
        match_type:    sibling.match_type,
        bracket_round: sibling.bracket_round,
        streams_json:  sibling.streams_json,
      })
      .eq('id', row.id)

    if (updateErr) {
      process.stdout.write(`Match ${row.od_match_id}: update failed — ${updateErr.message}\n`)
    } else {
      process.stdout.write(`Match ${row.od_match_id} (${row.team_a} vs ${row.team_b}): copied from sibling ${sibling.od_match_id} — ${sibling.tournament}\n`)
      // Add to enriched pool so later siblings can find this one too
      enriched.push({ ...row, ps_match_id: sibling.ps_match_id, tournament: sibling.tournament, match_type: sibling.match_type, bracket_round: sibling.bracket_round, streams_json: sibling.streams_json })
      updated++
    }
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`)
}

main().catch(err => { console.error(err); process.exit(1) })

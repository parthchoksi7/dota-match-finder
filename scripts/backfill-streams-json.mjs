/**
 * Backfill: widen match_stream_history.streams_json to include ALL streams
 * (every language, official AND unofficial) by re-fetching PandaScore streams_list.
 *
 * Rows are normally written once (ignoreDuplicates), so rows captured before the
 * all-languages change hold only the official/primary streams. This pass re-fetches
 * each row's PandaScore match and rewrites streams_json with the full normalized set
 * (the same shape produced by the live write-paths) WHEN PandaScore returns streams
 * the row does not already have.
 *
 * It never shrinks a row: PandaScore only carries streams_list for running /
 * recently-completed matches, so a long-finished match returns an empty list — those
 * rows are left untouched (their existing streams_json still renders via the read-time
 * normalizer in api/pipeline/_vod-urls.js). The backfill is therefore most effective on
 * recent rows; bound the scan with --days=N (default 14).
 *
 * Run from repo root:
 *   node scripts/backfill-streams-json.mjs              # last 14 days
 *   node scripts/backfill-streams-json.mjs --days=30
 *   node scripts/backfill-streams-json.mjs --dry-run    # report only, no writes
 *
 * Safe + idempotent — a row is only updated when the refetched set ADDS a stream URL.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { normalizeAllStreams, teamPairMatch } from '../api/_shared.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const daysArg = args.find(a => a.startsWith('--days='))
const DAYS = daysArg ? Number(daysArg.split('=')[1]) : 14

const PS_TOKEN = process.env.PANDASCORE_TOKEN
const PS_BASE = 'https://api.pandascore.co/dota2'
const PS_HEADERS = { Authorization: `Bearer ${PS_TOKEN}`, Accept: 'application/json' }

function teamsMatch(psOpponents, teamA, teamB) {
  if (!psOpponents || psOpponents.length < 2) return false
  return teamPairMatch(psOpponents[0]?.opponent?.name, psOpponents[1]?.opponent?.name, teamA, teamB)
}

async function fetchPsMatch(startedAt, teamA, teamB) {
  // ±2h window mirrors the locked match-streams.js resolver (widened Jun 19) so late
  // games of long BO5s — whose OD start_time drifts past the series begin_at — still match.
  const startTime = new Date(startedAt).getTime() / 1000
  const fromIso = new Date((startTime - 7200) * 1000).toISOString()
  const toIso = new Date((startTime + 7200) * 1000).toISOString()
  const url = `${PS_BASE}/matches?range[begin_at]=${fromIso},${toIso}&sort=begin_at&page[size]=20`
  const res = await fetch(url, { headers: PS_HEADERS })
  if (!res.ok) return null
  const matches = await res.json()
  return (matches || []).find(m => teamsMatch(m.opponents, teamA, teamB)) || null
}

function existingUrls(streamsJson) {
  if (!Array.isArray(streamsJson)) return new Set()
  return new Set(streamsJson.map(s => s?.raw_url).filter(Boolean))
}

/**
 * Pure decision: given a row's current streams_json and PandaScore's streams_list,
 * return the full normalized set, which URLs it adds, and whether to write. Never
 * shrinks a row — only updates when at least one new stream URL appears.
 */
export function computeStreamsBackfill(streamsJson, psStreamsList) {
  const allStreams = normalizeAllStreams(psStreamsList)
  const have = existingUrls(streamsJson)
  const added = allStreams.filter(s => !have.has(s.raw_url))
  const shouldUpdate = allStreams.length > 0 && added.length > 0
  return { allStreams, added, shouldUpdate }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!PS_TOKEN) { console.error('PANDASCORE_TOKEN not set'); process.exit(1) }
  if (!Number.isFinite(DAYS) || DAYS <= 0) { console.error('--days must be a positive number'); process.exit(1) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const sinceIso = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('match_stream_history')
    .select('id, od_match_id, ps_match_id, started_at, team_a, team_b, streams_json')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: true })

  if (error) { console.error('Supabase fetch failed:', error.message); process.exit(1) }
  console.log(`${rows.length} rows in the last ${DAYS} day(s)${DRY_RUN ? ' (dry-run)' : ''}`)

  let updated = 0, unchanged = 0, skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const tag = `[${i + 1}/${rows.length}] Match ${row.od_match_id} (${row.team_a} vs ${row.team_b})`

    if (!row.team_a || !row.team_b) { console.log(`${tag}... no team names, skipping`); skipped++; continue }

    const psMatch = await fetchPsMatch(row.started_at, row.team_a, row.team_b)
    if (!psMatch) { console.log(`${tag}... no PS match`); skipped++; await sleep(200); continue }

    const { allStreams, added, shouldUpdate } = computeStreamsBackfill(row.streams_json, psMatch.streams_list)

    if (!shouldUpdate) {
      console.log(`${tag}... no new streams (${existingUrls(row.streams_json).size} already stored)`)
      unchanged++
      await sleep(200)
      continue
    }

    const update = { streams_json: allStreams }
    if (row.ps_match_id == null) update.ps_match_id = psMatch.id

    if (DRY_RUN) {
      console.log(`${tag}... WOULD add ${added.length}: ${added.map(s => `${s.language || '?'}/${s.official ? 'off' : 'unoff'}/${s.channel || s.source}`).join(', ')}`)
      updated++
      await sleep(200)
      continue
    }

    const { error: updErr } = await supabase.from('match_stream_history').update(update).eq('id', row.id)
    if (updErr) {
      console.log(`${tag}... update failed: ${updErr.message}`)
      skipped++
    } else {
      console.log(`${tag}... +${added.length} stream(s): ${added.map(s => s.language || s.source).join(', ')}`)
      updated++
    }
    await sleep(200)
  }

  console.log(`\nDone. ${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ${unchanged} unchanged, ${skipped} skipped.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1) })
}

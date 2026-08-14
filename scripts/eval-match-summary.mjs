/**
 * Eval harness for the AI match summary prompt (api/summarize.js).
 *
 * Pulls N recent real pro matches from OpenDota, runs them through the actual production
 * prompt-building code (imported, not reimplemented — a copy would drift and the eval would
 * stop meaning anything), calls the real Anthropic API, and runs deterministic checks against
 * the output. Built after a real bug: the model attributed a Team Spirit player's action to
 * Aurora Gaming mid-summary. The TEAM_GROUNDING check below exists specifically to catch a
 * regression of that bug class before it ships again.
 *
 * This calls the real Anthropic API and costs real money per run (same spend concern that
 * caps /api/summarize at 10 req/min in production, see CONTEXT.md). It is a manual dev tool,
 * not wired into CI or `npm test` — run it by hand after changing the summary prompt.
 *
 * Usage:
 *   npm run eval:summary            # evals 5 recent matches
 *   EVAL_N=10 npm run eval:summary  # evals 10
 */

import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const {
  trimMatchDataForSummary,
  getHeroNames,
  buildMatchSummaryPrompt,
  MATCH_SUMMARY_MODEL,
  MATCH_SUMMARY_TEMPERATURE,
} = await import('../api/summarize.js')

const N = Number(process.env.EVAL_N) || 5
const SECTION_HEADERS = ['DRAFT ANALYSIS', 'STRATEGY', 'MVP', 'HIGHLIGHT']

function pass(msg) { console.log(`    PASS  ${msg}`) }
function fail(msg) { console.log(`    FAIL  ${msg}`) }
function warn(msg) { console.log(`    WARN  ${msg}`) }

// ── Fixture selection ────────────────────────────────────────────────────────
async function pickRecentMatchIds(n) {
  const res = await fetch('https://api.opendota.com/api/promatches')
  if (!res.ok) throw new Error(`OpenDota promatches fetch failed: ${res.status}`)
  const list = await res.json()
  const ids = []
  for (const m of list) {
    if (m.radiant_name && m.dire_name && m.duration > 600) ids.push(m.match_id)
    if (ids.length >= n) break
  }
  return ids
}

async function fetchFullMatch(matchId) {
  const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
  if (!res.ok) return null
  return res.json()
}

// ── Checks ────────────────────────────────────────────────────────────────────
// Each returns { name, status: 'pass'|'fail'|'warn', detail }

function checkFormat(text) {
  let cursor = -1
  for (const header of SECTION_HEADERS) {
    const idx = text.indexOf(header, cursor + 1)
    if (idx === -1 || idx <= cursor) {
      return { name: 'FORMAT', status: 'fail', detail: `missing or out-of-order section: ${header}` }
    }
    cursor = idx
  }
  return { name: 'FORMAT', status: 'pass', detail: 'all 4 sections present in order' }
}

function checkNoMarkdown(text) {
  const offenders = text.match(/(\*\*|##|__|^\s*[-*]\s)/m)
  if (offenders) return { name: 'NO_MARKDOWN', status: 'fail', detail: `found markdown-like token: ${JSON.stringify(offenders[0])}` }
  return { name: 'NO_MARKDOWN', status: 'pass', detail: 'no markdown tokens found' }
}

function checkWordCount(text) {
  const words = text.trim().split(/\s+/).length
  if (words > 300) return { name: 'WORD_COUNT', status: 'fail', detail: `${words} words (limit ~250, hard ceiling 300)` }
  if (words > 260) return { name: 'WORD_COUNT', status: 'warn', detail: `${words} words (asked for under 250)` }
  return { name: 'WORD_COUNT', status: 'pass', detail: `${words} words` }
}

function checkUnknownHeroLeak(text) {
  if (text.includes('Unknown Hero')) return { name: 'HERO_NAMES', status: 'fail', detail: '"Unknown Hero" leaked into output' }
  return { name: 'HERO_NAMES', status: 'pass', detail: 'no unresolved hero names' }
}

// The core regression check for the team-misattribution bug. For each sentence, if exactly one
// of the two team names appears alongside a known player name, that player's real team must
// match the team name in the sentence.
function checkTeamGrounding(text, trimmed) {
  const { radiant_name: rName, dire_name: dName, players } = trimmed
  if (!rName || !dName || !Array.isArray(players)) {
    return { name: 'TEAM_GROUNDING', status: 'warn', detail: 'insufficient roster data to check' }
  }
  const teamByPlayer = new Map(players.map(p => [p.personaname, p.team_name]))
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)

  // KNOWN GAP: a sentence naming both teams is skipped entirely, even if it also misattributes
  // a player (e.g. "While Team Spirit split-pushed, Aurora Gaming's Miposhka rotated" would slip
  // through if Miposhka is actually on Team Spirit). Accepted trade-off to avoid false positives
  // on legitimate two-team comparison sentences, which are common in STRATEGY. This check is the
  // primary regression guard for the original team-misattribution bug, so treat a "pass" here as
  // "no single-team-attribution violation found," not "definitely no misattribution anywhere."
  const violations = []
  for (const sentence of sentences) {
    const hasR = sentence.includes(rName)
    const hasD = sentence.includes(dName)
    if (hasR === hasD) continue // both or neither team named — not a single-team attribution, skip

    const mentionedTeam = hasR ? rName : dName
    for (const [playerName, actualTeam] of teamByPlayer) {
      if (!sentence.includes(playerName)) continue
      if (actualTeam && actualTeam !== mentionedTeam) {
        violations.push(`"${playerName}" (actually ${actualTeam}) attributed to ${mentionedTeam} in: "${sentence.trim()}"`)
      }
    }
  }

  if (violations.length) return { name: 'TEAM_GROUNDING', status: 'fail', detail: violations.join(' | ') }
  return { name: 'TEAM_GROUNDING', status: 'pass', detail: 'no cross-team player misattribution detected' }
}

// Spot-checks that numbers named in the MVP paragraph belong to the MVP player's real stats
// (or are the match duration), catching invented/misquoted stats.
function checkMvpNumericGrounding(text, trimmed) {
  const mvpMatch = text.match(/MVP\s*\n([^\n]+)/)
  if (!mvpMatch) return { name: 'MVP_NUMBERS', status: 'warn', detail: 'could not locate MVP line' }
  const mvpLine = mvpMatch[1]
  const nameMatch = mvpLine.match(/^([^—-]+?)\s*[—-]/)
  const mvpName = nameMatch ? nameMatch[1].trim() : null
  const player = (trimmed.players || []).find(p => p.personaname === mvpName)
  if (!player) return { name: 'MVP_NUMBERS', status: 'warn', detail: `could not resolve MVP player "${mvpName}" against roster` }

  const knownNumbers = new Set(
    [player.kills, player.deaths, player.assists, player.net_worth, player.hero_damage, Math.floor((trimmed.duration || 0) / 60)]
      .filter(v => v != null)
      .map(String)
  )

  // No minimum-digit filter: kills/deaths/assists are commonly single digits and are exactly
  // the stats most likely to be misquoted, so excluding them would defeat the point of this
  // check. Stays WARN-severity (not FAIL) because short numbers can legitimately be things this
  // check has no ground truth for (a rank, a score reference) — see the return below.
  const restOfMvpSection = text.slice(text.indexOf('MVP'), text.indexOf('HIGHLIGHT') === -1 ? undefined : text.indexOf('HIGHLIGHT'))
  const numbersInText = (restOfMvpSection.match(/\d[\d,]*/g) || []).map(n => n.replace(/,/g, ''))

  const unmatched = numbersInText.filter(n => !knownNumbers.has(n))
  if (unmatched.length) {
    return { name: 'MVP_NUMBERS', status: 'warn', detail: `numbers in MVP section not found in ${mvpName}'s raw stats: ${unmatched.join(', ')} (may be legitimate context, e.g. rank or score)` }
  }
  return { name: 'MVP_NUMBERS', status: 'pass', detail: `all MVP numbers trace to ${mvpName}'s real stats or match duration` }
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function evalOneMatch(matchId, heroes) {
  console.log(`\nMatch ${matchId}`)
  const matchData = await fetchFullMatch(matchId)
  if (!matchData || !matchData.players || !matchData.picks_bans) {
    console.log('  SKIP  incomplete OpenDota data')
    return null
  }

  const trimmed = trimMatchDataForSummary(matchData)
  console.log(`  ${trimmed.radiant_name} vs ${trimmed.dire_name}`)

  const prompt = buildMatchSummaryPrompt(trimmed, heroes)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MATCH_SUMMARY_MODEL,
      max_tokens: 400,
      temperature: MATCH_SUMMARY_TEMPERATURE,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const text = data.content?.[0]?.text
  if (typeof text !== 'string') {
    console.log(`  SKIP  Anthropic call failed: ${data.error?.message || res.statusText}`)
    return null
  }

  // trimmed used by buildMatchSummaryPrompt has hero_name resolved as a side effect (players
  // are rebuilt internally); resolve it here too so the checks see the same shape.
  const withHeroNames = {
    ...trimmed,
    players: (trimmed.players || []).map(p => ({ ...p, hero_name: heroes[p.hero_id] || 'Unknown Hero' })),
  }

  const results = [
    checkFormat(text),
    checkNoMarkdown(text),
    checkWordCount(text),
    checkUnknownHeroLeak(text),
    checkTeamGrounding(text, withHeroNames),
    checkMvpNumericGrounding(text, withHeroNames),
  ]

  for (const r of results) {
    if (r.status === 'pass') pass(`${r.name}: ${r.detail}`)
    else if (r.status === 'warn') warn(`${r.name}: ${r.detail}`)
    else fail(`${r.name}: ${r.detail}`)
  }

  return results
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set (check .env.local). Aborting.')
    process.exit(1)
  }

  console.log(`Selecting ${N} recent pro matches from OpenDota...`)
  const matchIds = await pickRecentMatchIds(N)
  if (!matchIds.length) {
    console.error('No eligible matches found.')
    process.exit(1)
  }

  const heroes = await getHeroNames()
  const allResults = []
  for (const id of matchIds) {
    const results = await evalOneMatch(id, heroes)
    if (results) allResults.push(...results)
  }

  const failCount = allResults.filter(r => r.status === 'fail').length
  const warnCount = allResults.filter(r => r.status === 'warn').length
  const passCount = allResults.filter(r => r.status === 'pass').length

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`${passCount} passed, ${warnCount} warned, ${failCount} failed (${allResults.length} checks across ${matchIds.length} matches)`)

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Eval run crashed:', err)
  process.exit(1)
})

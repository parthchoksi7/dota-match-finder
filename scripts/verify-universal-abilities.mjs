/**
 * Regression guard for `UNIVERSAL_ABILITY_IDS` (api/_liveStoryDiff.js).
 *
 * That Set is a hardcoded, empirically-derived list of ability ids that belong to no specific
 * hero — Glyph/Scan, the Roshan/outpost capture slot, the twin-gate warp, Dota Plus cosmetics,
 * and the generic +stats talent. It was derived 2026-08-06 from one live poll (44 games, 64
 * side-instances) by a throwaway script that was never committed, so nothing in this repo can
 * currently notice when a Valve patch adds or removes a universal slot. When that happens,
 * `attributeAbility()` silently degrades from its measured 99.1% accuracy with no test failing.
 *
 * This script IS that derivation, made repeatable. Run it before shipping anything that consumes
 * `attributeAbility()` — the `AbilityLearned` event is the obvious one (deliberately not wired
 * into `diffGame`/`diffSnapshots` yet, per `.claude/specs/live-story-valve-data-audit.md`).
 *
 * It is NOT a unit test and deliberately does not live in `__tests__/`: the derivation needs a
 * live poll with real hero diversity, which is not a thing a hermetic test can have. A fixture
 * would only ever re-prove what was true on the day it was captured — precisely the staleness
 * this guards against.
 *
 *   THE DERIVATION: `scoreboard.{side}.abilities[]` is a flat, TEAM-level array — not nested per
 *   player. An ability owned by a hero appears only in side-instances where that hero was picked.
 *   A UNIVERSAL ability appears exactly once in EVERY side-instance, regardless of composition.
 *   So: count occurrences per side-instance, and keep the ids that are present exactly once in
 *   all of them. This is only as strong as the hero diversity in the sample, which is why the
 *   script refuses to render a verdict on a thin poll.
 *
 * Usage:
 *   STEAM_API_KEY=xxx node scripts/verify-universal-abilities.mjs
 *   STEAM_API_KEY=xxx node scripts/verify-universal-abilities.mjs --rounds 4 --interval 60
 *   STEAM_API_KEY=xxx node scripts/verify-universal-abilities.mjs --min-instances 40
 *
 * `--rounds`/`--interval` accumulate side-instances across several polls, for when a single poll
 * lands on a quiet slate. Polls are deduped by (match_id, side) — re-polling the same games adds
 * confidence about nothing, so a repeat instance replaces rather than double-counts.
 *
 * Exit codes: 0 = the live sample agrees with the hardcoded Set. 1 = drift (or too thin a sample
 * to tell) — read the report before touching the Set.
 *
 * OBSERVED 2026-08-19, first real run (11 side-instances, TI 2026 playoff slate — too thin for a
 * verdict, but instructive): the derivation reproduced 9 of the 10 hardcoded ids exactly. The one
 * that dropped out was 730 `special_bonus_attributes`, the generic "+stats" talent — because in an
 * early-game instance nobody has taken it yet, so it is absent rather than present-once. That
 * makes 730 universal in KIND but not present in every instance, which the strict test cannot
 * express. Left unhandled it would have made this script report false DRIFT on essentially every
 * honest run and advise deleting a correct entry, so 730 is listed in `STAGE_CONDITIONAL_IDS`
 * below and confirmed by a relaxed test instead. Re-verified 2026-08-20 on a 30-instance /
 * 77-hero slate: 9 confirmed strictly, 730 confirmed by the relaxed test, no drift.
 *
 * NOTE on reaching the floor: instances dedupe by (match_id, side), so re-polling the same six
 * games does not grow the sample. Accumulating past 40 needs polls spread across DIFFERENT games
 * — a group-stage slate reaches it in one poll, a playoff day needs something like
 * `--rounds 8 --interval 900` to catch successive series.
 *
 * Requires STEAM_API_KEY — free at https://steamcommunity.com/dev/apikey. Reads ALL live league
 * games, not just tier-1: this is a question about Dota's ability tables, not about our coverage,
 * and a wider slate means more hero diversity, which is the whole constraint.
 */

import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { UNIVERSAL_ABILITY_IDS } from '../api/_liveStoryDiff.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env.local') })

const STEAM_API_KEY = process.env.STEAM_API_KEY
const GLLG_URL = 'https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/'
const ABILITY_IDS_URL = 'https://api.opendota.com/api/constants/ability_ids'

// Below this many side-instances the "appears in every instance" test cannot distinguish a
// universal ability from an ability belonging to a hero that simply got picked in every game —
// a real risk in a single-tournament meta with a contested S-tier pick. 40 is the floor because
// the original derivation used 64 and reported clean separation.
const DEFAULT_MIN_INSTANCES = 40

// Ids that are universal in KIND but not present in every instance, because whether they appear
// depends on game stage rather than on hero composition. `730 special_bonus_attributes` is the
// +stats talent: universal in that any hero can take it, absent until somebody actually does.
// The strict "exactly once in every instance" test therefore fails it on any sample containing an
// early-game instance — which is nearly every real sample — so testing these strictly would make
// the script cry wolf on every honest run and, worse, advise deleting an entry that is correct.
//
// These get a RELAXED test instead: never more than once in any instance (still not hero-owned),
// and present in at least one. That test is much weaker — a hero-owned ability would also pass it
// — so it can only ever CONFIRM an id already known to be universal, never discover one. That is
// exactly why this is a hand-maintained allowlist and not a general rule.
const STAGE_CONDITIONAL_IDS = new Set([730])

function parseArgs(argv) {
  const num = (flag, dflt) => {
    const i = argv.indexOf(flag)
    if (i === -1) return dflt
    const v = Number(argv[i + 1])
    if (!Number.isInteger(v) || v <= 0) {
      console.error(`✗ ${flag} needs a positive whole number`)
      process.exit(1)
    }
    return v
  }
  return {
    rounds: num('--rounds', 1),
    interval: num('--interval', 60),
    minInstances: num('--min-instances', DEFAULT_MIN_INSTANCES),
  }
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000))

async function fetchLiveGames() {
  const res = await fetch(`${GLLG_URL}?key=${STEAM_API_KEY}`)
  if (!res.ok) throw new Error(`GetLiveLeagueGames HTTP ${res.status}`)
  const raw = await res.json()
  return raw?.result?.games || []
}

async function fetchAbilityNames() {
  // Best-effort: names make the report readable but the verdict never depends on them. Some ids
  // in the current Set are not in OpenDota's constants at all (1877/1878/1879), which is itself
  // documented in _liveStoryDiff.js — an unresolved name is not evidence of anything.
  try {
    const res = await fetch(ABILITY_IDS_URL)
    if (!res.ok) return {}
    const raw = await res.json()
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const byId = {}
    for (const [key, name] of Object.entries(raw)) {
      // ONE observed key is a comma-joined compound ("3060,1617" -> one name); split, don't assume 1:1.
      for (const part of key.split(',')) byId[Number(part)] = name
    }
    return byId
  } catch {
    return {}
  }
}

/**
 * One side of one live game: the ability-id multiset, plus the heroes that were on it.
 * Keyed by `${match_id}:${side}` so repeated polls of the same game don't inflate the sample.
 */
function collectSideInstances(games, into) {
  for (const game of games) {
    const sb = game?.scoreboard
    if (!sb) continue
    for (const side of ['radiant', 'dire']) {
      const team = sb[side]
      const abilities = team?.abilities
      const players = team?.players
      // A side mid-draft has players but no abilities yet; that is an empty instance, not a
      // universal-ability-free one, and counting it would mark every real universal as "missing".
      if (!Array.isArray(abilities) || abilities.length === 0) continue
      if (!Array.isArray(players) || players.length === 0) continue

      const counts = new Map()
      for (const a of abilities) {
        const id = Number(a?.ability_id)
        if (!Number.isFinite(id)) continue
        counts.set(id, (counts.get(id) || 0) + 1)
      }
      if (counts.size === 0) continue

      into.set(`${game.match_id}:${side}`, {
        counts,
        heroIds: players.map((p) => Number(p?.hero_id)).filter((h) => Number.isFinite(h) && h > 0),
      })
    }
  }
}

/**
 * Ids that never exceed one occurrence in any instance and appear in at least one. Weak on its
 * own (a hero-owned ability passes too) — only ever applied to STAGE_CONDITIONAL_IDS.
 */
function passesRelaxed(instances, id) {
  let seen = 0
  for (const inst of instances.values()) {
    const n = inst.counts.get(id) || 0
    if (n > 1) return false
    seen += n
  }
  return seen > 0
}

/**
 * Heroes present in EVERY side-instance. Their abilities are indistinguishable from universal
 * ones by this script's test, so any surprise "extra" is suspect while such a hero exists. This
 * is the precise form of the confound the instance floor only gestures at.
 */
function omnipresentHeroes(instances) {
  const all = [...instances.values()]
  if (all.length === 0) return new Set()
  let shared = new Set(all[0].heroIds)
  for (const inst of all.slice(1)) {
    shared = new Set([...shared].filter((h) => inst.heroIds.includes(h)))
    if (shared.size === 0) break
  }
  return shared
}

/** Ids present EXACTLY once in every side-instance. */
function deriveUniversalIds(instances) {
  const all = [...instances.values()]
  if (all.length === 0) return new Set()
  const candidates = new Set()
  for (const [id, n] of all[0].counts) if (n === 1) candidates.add(id)
  for (const inst of all.slice(1)) {
    for (const id of [...candidates]) {
      if (inst.counts.get(id) !== 1) candidates.delete(id)
    }
    if (candidates.size === 0) break
  }
  return candidates
}

async function main() {
  if (!STEAM_API_KEY) {
    console.error('✗ STEAM_API_KEY not set. Get a free key at https://steamcommunity.com/dev/apikey')
    console.error('  Then: STEAM_API_KEY=xxx node scripts/verify-universal-abilities.mjs')
    process.exit(1)
  }
  const { rounds, interval, minInstances } = parseArgs(process.argv.slice(2))

  const instances = new Map()
  for (let round = 1; round <= rounds; round++) {
    const games = await fetchLiveGames()
    const before = instances.size
    collectSideInstances(games, instances)
    console.log(
      `poll ${round}/${rounds}: ${games.length} live league games, ` +
      `${instances.size} side-instances total (+${instances.size - before} new)`
    )
    if (round < rounds) await sleep(interval)
  }

  const heroes = new Set()
  for (const inst of instances.values()) for (const h of inst.heroIds) heroes.add(h)

  console.log('')
  console.log(`Sample: ${instances.size} side-instances, ${heroes.size} distinct heroes observed`)

  if (instances.size === 0) {
    console.error('✗ No side-instances with an abilities[] array. Nothing live, or all games are still drafting.')
    process.exit(1)
  }

  const derived = deriveUniversalIds(instances)
  const names = await fetchAbilityNames()
  const label = (id) => `${id}${names[id] ? ` (${names[id]})` : ' (name unresolved in OD constants)'}`

  // An id in the Set that failed the strict test is only real drift if it ALSO fails the relaxed
  // test, or was never known to be stage-conditional in the first place.
  const strictMissing = [...UNIVERSAL_ABILITY_IDS].filter((id) => !derived.has(id))
  const conditionalOk = strictMissing.filter((id) => STAGE_CONDITIONAL_IDS.has(id) && passesRelaxed(instances, id))
  const missing = strictMissing.filter((id) => !conditionalOk.includes(id))
  const extra = [...derived].filter((id) => !UNIVERSAL_ABILITY_IDS.has(id)) // in live data, not in the Set

  console.log(`Hardcoded UNIVERSAL_ABILITY_IDS: ${UNIVERSAL_ABILITY_IDS.size}`)
  console.log(`Derived from this sample:        ${derived.size} (strict test)`)
  for (const id of conditionalOk) {
    console.log(`  ✓ ${label(id)} — confirmed by the relaxed stage-conditional test, not strict. Expected.`)
  }
  const omnipresent = omnipresentHeroes(instances)
  if (omnipresent.size > 0) {
    console.log(
      `  ! hero id(s) ${[...omnipresent].join(', ')} appear in EVERY instance — their abilities are\n` +
      `    indistinguishable from universal ones here, so treat any "extra" below with suspicion.`
    )
  }
  console.log('')

  // A thin sample cannot separate "universal" from "a hero everyone picked", so it is reported as
  // inconclusive rather than as a pass. Silence on weak evidence is exactly the failure mode this
  // script exists to prevent.
  if (instances.size < minInstances) {
    console.error(
      `✗ INCONCLUSIVE — ${instances.size} side-instances is below the ${minInstances} floor.\n` +
      `  Re-run during a busier slate, or accumulate: --rounds 4 --interval 120.\n` +
      `  (Override with --min-instances only if you understand what a thin sample cannot prove.)`
    )
    if (missing.length || extra.length) {
      console.error('  Provisional diff on this thin sample, NOT a verdict:')
      for (const id of missing) console.error(`    - missing: ${label(id)}`)
      for (const id of extra) console.error(`    + extra:   ${label(id)}`)
    }
    process.exit(1)
  }

  if (!missing.length && !extra.length) {
    console.log(
      conditionalOk.length
        ? `✓ PASS — every id in the hardcoded Set is confirmed by this sample (${conditionalOk.length} via the\n` +
          `  relaxed stage-conditional test, the rest strictly), and the sample adds none. No drift.`
        : '✓ PASS — the live sample derives exactly the hardcoded Set. No drift.'
    )
    process.exit(0)
  }

  console.error('✗ DRIFT — the hardcoded Set no longer matches live data.')
  if (missing.length) {
    console.error('\n  In UNIVERSAL_ABILITY_IDS but NOT universal in this sample:')
    for (const id of missing) console.error(`    - ${label(id)}`)
    console.error('    Either the slot was removed by a patch, or it is now hero-owned. Removing it')
    console.error('    from the Set makes attributeAbility() start attributing it — check that is right.')
    console.error('    These already failed BOTH the strict and the stage-conditional test, so a merely')
    console.error('    early-game sample does not explain them.')
  }
  if (extra.length) {
    console.error('\n  Universal in this sample but NOT in UNIVERSAL_ABILITY_IDS:')
    for (const id of extra) console.error(`    + ${label(id)}`)
    console.error('    Before adding: confirm it is a real universal slot and not an ability belonging')
    console.error('    to a hero that happened to be picked in every single game of this sample.')
  }
  console.error('\n  Do NOT edit the Set from this output alone — re-run on a second, independent slate first.')
  process.exit(1)
}

main().catch((err) => {
  console.error('✗ Failed:', err?.message || err)
  process.exit(1)
})

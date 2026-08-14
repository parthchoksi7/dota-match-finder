/**
 * Post-deploy production health check for API endpoints.
 *
 * Run after every production deploy that touches API logic:
 *   node scripts/verify-prod.mjs
 *
 * Exits 0 if everything looks healthy, 1 if any check fails.
 * On failure, read Vercel runtime logs and fix before marking the deploy done.
 */

// The league matcher is IMPORTED from production rather than reimplemented (2026-08-13). It used
// to be an inlined copy annotated "mirrors api/_shared.js exactly", which had silently drifted:
// production dedupes league tokens, converts roman numerals, and tie-breaks on a precision ratio
// (overlap/tokenCount), none of which the copy did. The drift made the verifier resolve a
// DIFFERENT league than the site for several tracked events — "The International 2026" matched the
// excluded-tier "Lyceum International 2026" (0 games) and failed a correct production deploy on
// 2026-08-13, while production itself resolved it fine. A verifier scoring differently from the
// thing it verifies can both fail good deploys and pass broken ones, so there must be exactly one
// implementation. Importing is safe: _shared.js has no module-scope side effects that need env
// vars (its Redis and Sentry clients are both lazily constructed).
import { findLeague } from '../api/_shared.js'

const BASE = 'https://spectateesports.live'

// How stale is too stale for "live" news? (hours)
// Dota 2 news can go quiet for 5-6 days between patches/majors. 168h (7 days)
// flags genuine fetch failures without false-alarming during quiet periods.
const MAX_ARTICLE_AGE_HOURS = 168

let failed = false

function pass(msg) { console.log(`  PASS  ${msg}`) }
function fail(msg) { console.error(`  FAIL  ${msg}`); failed = true }
function info(msg) { console.log(`        ${msg}`) }

async function fetchJson(url, label) {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      fail(`${label}: HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    fail(`${label}: ${err.message}`)
    return null
  }
}

// Same as fetchJson but logs errors at INFO level (for external APIs we don't control).
async function fetchJsonOptional(url, label) {
  try {
    const res = await fetch(url)
    if (!res.ok) { info(`${label}: HTTP ${res.status} (external API, skipping)`); return null }
    return await res.json()
  } catch (err) {
    info(`${label}: ${err.message} (skipping)`)
    return null
  }
}

// ── News API ──────────────────────────────────────────────────────────────────

async function checkNewsApi() {
  console.log('\n[news] /api/news')

  // Bust the cache so we see a fresh fetch, not a cached stale result
  const data = await fetchJson(`${BASE}/api/news?bust=1&limit=60`, 'news bust')
  if (!data) return

  const sources = data.meta?.sources ?? []
  const articles = data.articles ?? []

  if (articles.length === 0) {
    fail('No articles returned at all')
    return
  }
  pass(`${articles.length} articles returned`)

  // Check each source contributed at least one article
  const expectedSources = ['steam-news-api', 'liquipedia', 'currents']
  for (const srcId of expectedSources) {
    const src = sources.find(s => s.id === srcId)
    if (!src) {
      fail(`Source "${srcId}" missing from meta.sources entirely`)
      continue
    }
    if (src.count === 0) {
      fail(`Source "${srcId}" returned 0 articles - check Vercel logs for fetch errors`)
    } else {
      pass(`Source "${srcId}": ${src.count} articles`)
    }
  }

  // Check that at least one article is fresh (not stale)
  const newestPub = articles
    .map(a => new Date(a.publishedAt).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => b - a)[0]

  if (!newestPub) {
    fail('Could not parse publishedAt on any article')
    return
  }

  const ageHours = (Date.now() - newestPub) / 3_600_000
  if (ageHours > MAX_ARTICLE_AGE_HOURS) {
    fail(`Most recent article is ${ageHours.toFixed(1)}h old (threshold: ${MAX_ARTICLE_AGE_HOURS}h) - news may be stale`)
  } else {
    pass(`Most recent article is ${ageHours.toFixed(1)}h old`)
  }

  // Spot-check: Liquipedia articles should link to liquipedia.net
  const liquipediaArticles = articles.filter(a => a.source?.id === 'liquipedia')
  if (liquipediaArticles.length > 0) {
    const badLinks = liquipediaArticles.filter(a => !a.url.includes('liquipedia.net'))
    if (badLinks.length > 0) {
      fail(`${badLinks.length} Liquipedia article(s) have non-liquipedia.net URLs`)
    } else {
      pass(`Liquipedia article URLs all point to liquipedia.net`)
    }
    info(`Sample Liquipedia article: "${liquipediaArticles[0].title}"`)
  }
}

// ── Live matches API ──────────────────────────────────────────────────────────

async function checkLiveMatchesApi() {
  console.log('\n[live] /api/live-matches')
  // bust=1 so we see the output of the deployed code, not a stale cached response
  const data = await fetchJson(`${BASE}/api/live-matches?bust=1`, 'live-matches')
  if (!data) return
  // Live matches may legitimately be empty (no matches running right now)
  if (!Array.isArray(data) && !Array.isArray(data.matches) && !Array.isArray(data.live)) {
    fail('Unexpected response shape - expected an array or object with matches/live key')
  } else {
    pass('Endpoint responded with expected shape')
  }
}

// ── Tournaments API ───────────────────────────────────────────────────────────

async function checkTournamentsApi() {
  console.log('\n[tournaments] /api/tournaments')
  // bust=1 so we see the output of the deployed code, not a stale cached response
  const data = await fetchJson(`${BASE}/api/tournaments?bust=1`, 'tournaments')
  if (!data) return
  // Response shape is {ongoing, upcoming, completed, meta} — not a flat array
  const list = Array.isArray(data)
    ? data
    : [
        ...(data.ongoing ?? []),
        ...(data.upcoming ?? []),
        ...(data.completed ?? []),
        ...(data.tournaments ?? []),
        ...(data.data ?? []),
      ]
  if (list.length === 0) {
    fail('No tournaments returned in any category - tier filter or data source may be broken')
  } else {
    const ongoing = (data.ongoing ?? []).length
    const upcoming = (data.upcoming ?? []).length
    pass(`${list.length} tournament(s) total (${ongoing} ongoing, ${upcoming} upcoming)`)
  }
}

// ── OD game count vs PS series count for an active tournament ────────────────
//
// Catches regressions where findLeague() stops mapping a tournament name to an
// OD league, or where the OD game-count pipeline drops/duplicates games.
//
// Checks:
//  1. If PS bracket shows finished series → OD game count must be > 0
//  2. Game count must not exceed seriesPlayed * 5 (max 5 games for a BO5), where
//     seriesPlayed is the largest of the PS bracket count, the PS standings win
//     count, and OD's own distinct-series count — see the comment on that check
//     for why the most generous signal is the correct one
//  3. Spectate's game count is cross-validated against OD's direct count

async function checkOdTournamentConsistency() {
  console.log('\n[od-consistency] OD game count vs PS series count')

  const tournamentsData = await fetchJson(`${BASE}/api/tournaments`, 'tournaments list')
  if (!tournamentsData) return

  const ongoing = tournamentsData.ongoing ?? []
  if (ongoing.length === 0) {
    info('No ongoing tournaments — skipping OD consistency check')
    return
  }

  const tournament = ongoing[0]
  const { id: tournamentId } = tournament
  // Mirror TournamentHub.jsx: buildTournamentName(league, serie) — omits stage suffix
  // so findLeague() matches the overall OD league, not a Playoffs-specific entry.
  const leagueName = tournament.league || ''
  const serieName = tournament.serie || ''
  const tournamentName = (leagueName && serieName)
    ? (serieName.toLowerCase().includes(leagueName.toLowerCase()) ? serieName : `${leagueName} ${serieName}`)
    : (leagueName || serieName || tournament.name || '')
  info(`Tournament: "${tournament.name}" (OD search name: "${tournamentName}", PS id: ${tournamentId})`)

  // NOTE: do NOT pass bust=1 to tournament-detail?mode=heroes. For large tournaments (100+ games)
  // the cold fetch times out within Vercel's function limit. Use the cached result,
  // which is correct once the function has completed at least once via normal traffic.
  // tournament-heroes was merged into tournament-detail?mode=heroes in commit 8ada845.
  const [detailData, heroesData] = await Promise.all([
    fetchJson(`${BASE}/api/tournament-detail?id=${tournamentId}&bust=1`, 'tournament-detail'),
    fetchJson(`${BASE}/api/tournament-detail?mode=heroes&id=${tournamentId}&name=${encodeURIComponent(tournamentName)}${tournament.startdate ? `&begin_at=${encodeURIComponent(tournament.startdate)}` : ''}`, 'tournament-heroes'),
  ])
  if (!detailData) return

  // heroesData is null when tournament-heroes returned an HTTP error (e.g. 504 timeout).
  // fetchJson already called fail() for that. Don't double-fail with the OD cross-check.
  const heroesErrored = heroesData === null

  const allBracketMatches = (detailData.bracket ?? []).flatMap(r => r.matches ?? [])
  const finishedSeries = allBracketMatches.filter(m => m.status === 'finished').length
  const standings = detailData.standings ?? []
  const totalStandingWins = standings.reduce((sum, s) => sum + (s.wins || 0), 0)
  const spectateGameCount = heroesData?.gameCount ?? 0

  info(`PS finished series (bracket): ${finishedSeries}`)
  info(`PS standings total wins: ${totalStandingWins}`)
  info(`OD game count (via spectate cache): ${spectateGameCount}${heroesErrored ? ' (endpoint errored)' : ''}`)

  const hasAnyPlayedGames = finishedSeries > 0 || totalStandingWins > 0
  if (!hasAnyPlayedGames) {
    info('No finished PS series or standings wins yet — too early to compare')
    return
  }

  // Direct OD cross-check — always run so we can confirm OD has data.
  let odGameCount = null
  let odSeriesCount = null
  let odLeagueName = null
  try {
    const odLeagues = await fetchJsonOptional('https://api.opendota.com/api/leagues', 'OD leagues list')
    if (Array.isArray(odLeagues)) {
      const found = findLeague(odLeagues, tournamentName)
      if (found) {
        odLeagueName = found.name
        info(`OD league: "${found.name}" (id: ${found.leagueid})`)
        const matchList = await fetchJsonOptional(`https://api.opendota.com/api/leagues/${found.leagueid}/matches`, 'OD match list')
        if (Array.isArray(matchList)) {
          odGameCount = matchList.length
          // Distinct series in OD's own game list, falling back to match_id for ungrouped
          // games (series_id null/0) so each counts as its own series. Same grouping key as
          // api/live-matches.js:557 and api/draft-posts.js:131.
          odSeriesCount = new Set(matchList.map(m =>
            (m.series_id && m.series_id !== 0) ? `s:${m.series_id}` : `m:${m.match_id}`
          )).size
        }
      } else {
        info(`findLeague() found no OD match for "${tournamentName}" (may be new or not yet indexed)`)
      }
    }
  } catch (err) {
    info(`Direct OD check unavailable: ${err.message}`)
  }

  if (odGameCount !== null) info(`OD direct game count: ${odGameCount} across ${odSeriesCount} distinct series`)

  // If the endpoint itself errored (e.g. 504 timeout), fetchJson already logged the
  // failure. Don't also fire the "OD has games but spectate shows 0" check — the 504
  // explains the 0.
  if (heroesErrored) return

  // Only hard-fail when we have positive confirmation from OD that games exist
  // but spectate's pipeline returned 0 cleanly (not via HTTP error).
  if (spectateGameCount === 0) {
    if (odGameCount !== null && odGameCount > 0) {
      fail(`OD directly has ${odGameCount} games for "${odLeagueName}" but spectate/api/tournament-detail?mode=heroes returned 0 — findLeague or fetch pipeline broken`)
    } else {
      info(`OD game count is 0 — cache may be cold or tournament is new. Verify: /api/tournament-detail?mode=heroes&id=${tournamentId}&name=${encodeURIComponent(tournamentName)}`)
    }
    return
  }

  // Upper-bound sanity check when spectate has data.
  // We don't enforce a lower bound: OD picks_bans requires server-side match parsing,
  // and recent games in an ongoing tournament often aren't parsed yet. Having any
  // parsed games (> 0, already checked above) means the pipeline is working.
  //
  // The denominator is the most GENEROUS plausible "series played so far" count, because this
  // is only an overcounting guard — an under-counted denominator is what makes it false-alarm,
  // and each available signal is blind to a different tournament format:
  //   - finishedSeries (PS bracket)      blind to round-robin/group progress. The bracket API
  //                                      doesn't track round-robin completions the way it tracks
  //                                      elimination ones, so it flatlines while a group stage is
  //                                      still playing out (EWC 2026 Group A: stuck at 3 all day
  //                                      while real completed games climbed to 18 → false FAIL).
  //   - totalStandingWins (PS standings) blind to bracket-only tournaments, which have no
  //                                      standings rows at all.
  //   - odSeriesCount (OD match list)    distinct series in OD's own game list — the only signal
  //                                      that tracks round-robin progress. League-wide, so it can
  //                                      overshoot a single-stage PS tournament; that only loosens
  //                                      an upper bound, and the game-count cross-check below is
  //                                      the tighter, real duplication detector. Null when OD is
  //                                      unreachable, in which case the PS signals still apply.
  if (finishedSeries > 0 || totalStandingWins > 0) {
    const signals = [
      { label: 'PS bracket finished series', value: finishedSeries },
      { label: 'PS standings wins', value: totalStandingWins },
      ...(odSeriesCount !== null ? [{ label: 'OD distinct series', value: odSeriesCount }] : []),
    ]
    const denom = signals.reduce((best, s) => (s.value > best.value ? s : best))
    const maxExpected = denom.value * 5
    if (spectateGameCount > maxExpected) {
      fail(`OD game count ${spectateGameCount} exceeds max of ${maxExpected} (${denom.value} series × 5 games, denominator: ${denom.label}) — possible overcounting bug`)
    } else {
      pass(`${spectateGameCount} OD parsed games ≤ ${maxExpected} max (${denom.value} series × 5, denominator: ${denom.label}; some games may be unparsed by OD)`)
    }
  }

  // Cross-validate spectate count vs OD direct count.
  // tournament-heroes counts only matches with picks_bans and caps at 60. It writes
  // to a 3h KV cache, so the spectate count reflects OD's state at cache-write time,
  // not now. OD can drop or re-index games between cache write and verify time, so
  // a small overage (≤15 games) is expected and self-correcting once the cache expires.
  // Only fail on a large discrepancy that indicates a real duplication/pipeline bug.
  if (odGameCount !== null) {
    const HEROES_MAX_GAMES = 60
    const odEffective = Math.min(odGameCount, HEROES_MAX_GAMES)
    const TOLERANCE = Math.max(15, Math.floor(odEffective * 0.20))
    if (spectateGameCount > odEffective + TOLERANCE) {
      fail(`Spectate shows ${spectateGameCount} OD games but capped OD count is only ${odEffective} (raw: ${odGameCount}) — overcounting beyond tolerance (${TOLERANCE})`)
    } else if (spectateGameCount > odEffective) {
      pass(`Spectate OD count (${spectateGameCount}) slightly above OD direct (${odEffective}) — within tolerance (${TOLERANCE}), likely stale cache`)
    } else {
      pass(`Spectate OD count (${spectateGameCount}) ≤ OD effective cap (${odEffective} of ${odGameCount}) — consistent`)
    }
  }
}

// ── Tier-1 league names (homepage match filter) ───────────────────────────────

async function checkTier1LeaguesApi() {
  console.log('\n[tier1] /api/tournaments?mode=tier1-leagues')
  // This KV key controls which matches appear on the homepage.
  // Fewer than 8 entries means DreamLeague, ESL One, PGL, or other majors
  // are missing from completed match results.
  const data = await fetchJson(`${BASE}/api/tournaments?mode=tier1-leagues&bust=1`, 'tier1-leagues')
  if (!data) return
  const names = data.names ?? []
  if (names.length < 8) {
    fail(`Only ${names.length} tier-1 league name(s) returned (expected >= 8) — homepage match filter is likely broken`)
    if (names.length > 0) info(`Names returned: ${names.join(', ')}`)
  } else {
    pass(`${names.length} tier-1 league names returned`)
    info(`Sample: ${names.slice(0, 5).join(', ')}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Verifying production at ${BASE}`)
  console.log(`Timestamp: ${new Date().toISOString()}`)

  await checkNewsApi()
  await checkLiveMatchesApi()
  await checkTournamentsApi()
  await checkTier1LeaguesApi()
  await checkOdTournamentConsistency()

  console.log('')
  if (failed) {
    console.error('One or more checks FAILED. Do not mark this deploy as done.')
    console.error('Next steps:')
    console.error('  1. If the site is broken for users: Vercel dashboard → Deployments → previous deploy → Promote to Production (instant rollback)')
    console.error('  2. Open Vercel → Functions tab → check runtime logs for the failing endpoint')
    console.error('  3. Fix the issue, commit, and redeploy')
    console.error('  4. Re-run: node scripts/verify-prod.mjs')
    process.exit(1)
  } else {
    console.log('All checks passed.')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('verify-prod crashed:', err.message)
  process.exit(1)
})

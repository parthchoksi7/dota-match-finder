/**
 * Post-deploy production health check for API endpoints.
 *
 * Run after every production deploy that touches API logic:
 *   node scripts/verify-prod.mjs
 *
 * Exits 0 if everything looks healthy, 1 if any check fails.
 * On failure, read Vercel runtime logs and fix before marking the deploy done.
 */

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
//  2. Game count must fall in [finishedSeries, finishedSeries * 5]
//     (minimum 1 game per series, max 5 for a BO5)
//  3. For group-stage tournaments (no bracket): game count > 0 if standings
//     show any wins (i.e. at least one series has been played)

// Inlined findLeague logic — mirrors api/_shared.js exactly.
// Collects all candidates with ≥2 overlap, sorts by overlap (non-qualifier wins ties),
// then iterates with an inverted numeric guard: skip a candidate only if it has a
// numeric token NOT present in the search set. Leagues with no Arabic numerics
// (e.g. "BLAST SLAM I") always pass, handling cross-source season numbering.
const _STOP = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'and', 'or', 'season'])
function _tokens(s) {
  return s.toLowerCase().split(/[\s\-_]+/).filter(t => (t.length > 1 || /^\d+$/.test(t)) && !_STOP.has(t))
}
function _findLeague(leagues, search) {
  if (!search || !leagues?.length) return null
  const searchTokens = new Set(_tokens(search))
  const candidates = []
  for (const league of leagues) {
    const lt = _tokens(league.name || '')
    const overlap = lt.filter(t => searchTokens.has(t)).length
    if (overlap < 2) continue
    candidates.push({ league, overlap })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    const aQ = (a.league.name || '').toLowerCase().includes('qualifier')
    const bQ = (b.league.name || '').toLowerCase().includes('qualifier')
    if (aQ && !bQ) return 1
    if (!aQ && bQ) return -1
    return 0
  })
  const numericSearchSet = new Set([...searchTokens].filter(t => /^\d+$/.test(t)))
  for (const { league } of candidates) {
    if (numericSearchSet.size > 0) {
      const leagueNumerics = _tokens(league.name || '').filter(t => /^\d+$/.test(t))
      if (leagueNumerics.some(t => !numericSearchSet.has(t))) continue
    }
    return league
  }
  return null
}

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

  // NOTE: do NOT pass bust=1 to tournament-heroes. For large tournaments (100+ games)
  // the cold fetch times out within Vercel's function limit. Use the cached result,
  // which is correct once the function has completed at least once via normal traffic.
  const [detailData, heroesData] = await Promise.all([
    fetchJson(`${BASE}/api/tournament-detail?id=${tournamentId}&bust=1`, 'tournament-detail'),
    fetchJson(`${BASE}/api/tournament-heroes?id=${tournamentId}&name=${encodeURIComponent(tournamentName)}${tournament.startdate ? `&begin_at=${encodeURIComponent(tournament.startdate)}` : ''}`, 'tournament-heroes'),
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
  let odLeagueName = null
  try {
    const odLeagues = await fetchJsonOptional('https://api.opendota.com/api/leagues', 'OD leagues list')
    if (Array.isArray(odLeagues)) {
      const found = _findLeague(odLeagues, tournamentName)
      if (found) {
        odLeagueName = found.name
        info(`OD league: "${found.name}" (id: ${found.leagueid})`)
        const matchList = await fetchJsonOptional(`https://api.opendota.com/api/leagues/${found.leagueid}/matches`, 'OD match list')
        if (Array.isArray(matchList)) odGameCount = matchList.length
      } else {
        info(`findLeague() found no OD match for "${tournamentName}" (may be new or not yet indexed)`)
      }
    }
  } catch (err) {
    info(`Direct OD check unavailable: ${err.message}`)
  }

  if (odGameCount !== null) info(`OD direct game count: ${odGameCount}`)

  // If the endpoint itself errored (e.g. 504 timeout), fetchJson already logged the
  // failure. Don't also fire the "OD has games but spectate shows 0" check — the 504
  // explains the 0.
  if (heroesErrored) return

  // Only hard-fail when we have positive confirmation from OD that games exist
  // but spectate's pipeline returned 0 cleanly (not via HTTP error).
  if (spectateGameCount === 0) {
    if (odGameCount !== null && odGameCount > 0) {
      fail(`OD directly has ${odGameCount} games for "${odLeagueName}" but spectate/api/tournament-heroes returned 0 — findLeague or fetch pipeline broken`)
    } else {
      info(`OD game count is 0 — cache may be cold or tournament is new. Verify: /api/tournament-heroes?id=${tournamentId}&name=${encodeURIComponent(tournamentName)}`)
    }
    return
  }

  // Upper-bound sanity check when spectate has data.
  // We don't enforce a lower bound: OD picks_bans requires server-side match parsing,
  // and recent games in an ongoing tournament often aren't parsed yet. Having any
  // parsed games (> 0, already checked above) means the pipeline is working.
  //
  // For group-stage-heavy tournaments (e.g. BLAST Slam Group Stage), totalStandingWins
  // far exceeds finishedSeries (bracket only captures a few matches). In that case use
  // standings wins as the denominator so group-stage game counts don't false-alarm.
  if (finishedSeries > 0 || totalStandingWins > 0) {
    const effectiveSeries = totalStandingWins > finishedSeries * 3
      ? totalStandingWins   // group-stage dominant: standings wins are the real count
      : finishedSeries      // bracket dominant: use bracket count
    const maxExpected = effectiveSeries * 5
    if (spectateGameCount > maxExpected) {
      fail(`OD game count ${spectateGameCount} exceeds max of ${maxExpected} (${effectiveSeries} effective series × 5 games) — possible overcounting bug`)
    } else if (finishedSeries > 0 && totalStandingWins <= finishedSeries * 3) {
      pass(`${spectateGameCount} OD parsed games / ${finishedSeries} PS series (some games may be unparsed by OD)`)
    } else {
      pass(`OD game count ${spectateGameCount} > 0 for group-stage tournament (${totalStandingWins} standings wins)`)
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

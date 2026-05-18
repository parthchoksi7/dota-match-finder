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
  const res = await fetch(url)
  if (!res.ok) {
    fail(`${label}: HTTP ${res.status}`)
    return null
  }
  return res.json()
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
  const data = await fetchJson(`${BASE}/api/live-matches`, 'live-matches')
  if (!data) return
  // Live matches may legitimately be empty (no matches running)
  // Just verify the endpoint responds with the expected shape
  if (!Array.isArray(data) && !Array.isArray(data.matches) && !Array.isArray(data.live)) {
    fail('Unexpected response shape - expected an array or object with matches/live key')
  } else {
    pass('Endpoint responded with expected shape')
  }
}

// ── Tournaments API ───────────────────────────────────────────────────────────

async function checkTournamentsApi() {
  console.log('\n[tournaments] /api/tournaments')
  const data = await fetchJson(`${BASE}/api/tournaments`, 'tournaments')
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Verifying production at ${BASE}`)
  console.log(`Timestamp: ${new Date().toISOString()}`)

  await checkNewsApi()
  await checkLiveMatchesApi()
  await checkTournamentsApi()

  console.log('')
  if (failed) {
    console.error('One or more checks FAILED. Do not mark this deploy as done.')
    console.error('Next steps:')
    console.error('  1. Open Vercel dashboard → Functions tab → check runtime logs for errors')
    console.error('  2. Fix the issue, commit, and redeploy')
    console.error('  3. Re-run: node scripts/verify-prod.mjs')
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

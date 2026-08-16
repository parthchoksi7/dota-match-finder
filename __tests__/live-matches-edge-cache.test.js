/**
 * Pinned cache contract for /api/live-matches (2026-08-15 Fluid Active CPU pass).
 *
 * This endpoint is ~66% of the entire Fluid Active CPU budget, and three of its constants are
 * coupled in ways that are NOT visible from any one of them:
 *   - `s-maxage` must EXCEED App.jsx's live poll interval, with margin.
 *   - `stale-while-revalidate` must be PRESENT but SHORT. (2026-08-16: this line previously read
 *     "costs worst-case staleness while saving ZERO invocations". That was measured false — swr is
 *     what collapses the per-expiry request herd, worth ~44x on this endpoint. See the swr test.)
 *   - `TTL` is the nominal observation cadence ONE_SIDED_DWELL's wall-clock meaning depends on —
 *     nominal because while `s-maxage` > `TTL`, the REAL regen cadence is `s-maxage`. See below.
 *
 * Modelled on __tests__/live-pulse-edge-cache.test.js, and for the same reason its LOCK_TTL_S test
 * gives: a relationship-only assertion let a 60 -> 45 regression through with a green suite. Where
 * a number IS the cost axis, pin it exactly and make the reader justify changing it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { ONE_SIDED_DWELL } from '../src/utils/liveSignal.js'

const read = p => readFileSync(path.resolve(process.cwd(), p), 'utf8')
const LIVE_MATCHES_SRC = read('api/live-matches.js')
const APP_SRC = read('src/App.jsx')

// "2 * 60 * 1000" -> 120000
const evalProduct = expr => expr.split('*').map(n => Number(n.trim())).reduce((a, b) => a * b, 1)

const EXPECTED_S_MAXAGE = 150
const EXPECTED_TTL_S = 120

// Guarded so a legitimate reshaping of the header (e.g. normalising to the
// `public, max-age=0, s-maxage=...` form used by teamsList.js/livePulseCombined.js) fails with a
// readable message instead of a bare TypeError on [1] of null.
const must = (re, src, what) => {
  const m = re.exec(src)
  if (!m) throw new Error(`live-matches cache contract: could not find ${what}. If the shape changed intentionally, update this test deliberately — it guards a cost axis.`)
  return m
}

const cacheControlValue = must(/res\.setHeader\('Cache-Control', '([^']*s-maxage[^']*)'\)/, LIVE_MATCHES_SRC, 'the read-path Cache-Control header')[1]
const sMaxAge = Number(must(/s-maxage=(\d+)/, cacheControlValue, 's-maxage in the read-path header')[1])
const ttlS = evalProduct(must(/^const TTL = ([0-9*\s]+?)\s*\/\//m, LIVE_MATCHES_SRC, 'the KV TTL constant')[1])
const pollMs = evalProduct(must(/useVisiblePolling\(fetchLiveData,\s*([0-9*\s]+)\)/, APP_SRC, "App.jsx's live poll interval")[1])

describe('/api/live-matches edge cache contract', () => {
  it('pins s-maxage exactly', () => {
    expect(sMaxAge).toBe(EXPECTED_S_MAXAGE)
  })

  it('pins the KV TTL exactly', () => {
    expect(ttlS).toBe(EXPECTED_TTL_S)
  })

  it('keeps s-maxage clear of the client poll interval by a real margin', () => {
    // THE invariant this change turned on, and the one an earlier draft got wrong by setting
    // s-maxage to exactly the poll interval. An entry expiring at exactly the poll interval goes
    // stale just BEFORE the next poll lands — guaranteed, not 50/50, because HTTP `Age` counts from
    // origin generation and timer drift, RTT and origin processing all push arrival later, never
    // earlier. At parity the saving can be zero. If App.jsx's interval changes, this must move too.
    expect(pollMs).toBe(120000)
    expect(sMaxAge * 1000).toBeGreaterThan(pollMs)
    expect(sMaxAge * 1000 - pollMs).toBeGreaterThanOrEqual(20000)
  })

  it('carries a SHORT stale-while-revalidate on the read path', () => {
    // 2026-08-16: this assertion was inverted. It previously required NO swr, on the premise that
    // "swr does not reduce origin invocations in steady state". Measurement falsified that premise:
    //     /api/live-matches      s-maxage=150, no swr  -> 1,097 invocations/hr  (~44.5 per expiry)
    //     /api/upcoming-matches  s-maxage=300, swr=300 ->    15 invocations/hr  (~1.25 per expiry)
    // Both are fetched in the same Promise.all in App.jsx — verified 1:1, since the only other
    // caller (src/components/UpcomingMatches.jsx) is dead code — so traffic cancels out. Foreground
    // revalidation does not coalesce the herd that 120s polling releases at each expiry; swr does.
    //
    // The pin is now an UPPER BOUND rather than a ban, because swr's cost is proportional to its
    // length while its benefit saturates as soon as it outlasts one revalidation (~1-5s here). A
    // large swr is still the mistake the original assertion was reaching for; a small one is what
    // makes the endpoint affordable. Keep it short, and keep the budget assertion below honest.
    // Not routed through must(): its message is written for header-SHAPE drift and would read as an
    // invitation to update the test, when the likely real failure here is someone deleting swr again
    // on the retracted 08-15 reasoning. Fail with that stated outright instead.
    const swrMatch = /stale-while-revalidate=(\d+)/.exec(cacheControlValue)
    expect(swrMatch, `live-matches must carry stale-while-revalidate. Removing it was measured to cost ~44x in origin invocations (1,097/hr vs 15/hr on the upcoming-matches control). Header was: "${cacheControlValue}"`).not.toBeNull()
    const swr = Number(swrMatch[1])
    expect(swr).toBeGreaterThan(0)
    expect(swr).toBeLessThanOrEqual(30)
  })

  it('keeps stale-if-error alongside swr', () => {
    // Added 2026-08-15 when swr was dropped, to buy back the availability property swr had provided
    // incidentally: on an origin failure the stale entry stays in place and the user still sees
    // scores. swr returned on 2026-08-16 and the two now coexist rather than substituting for each
    // other — stale-if-error still earns its place because it fires ONLY on an origin error, so
    // unlike swr it costs nothing against the normal-operation staleness budget asserted below.
    expect(cacheControlValue).toMatch(/stale-if-error=\d+/)
  })

  it('holds worst-case served age within the agreed 300s budget', () => {
    // Worst case = s-maxage + swr + the payload's own KV age (stale-if-error excluded: it applies
    // only when the origin is failing, which is a deliberate availability-over-freshness trade).
    // Derived from the parsed header rather than the pinned constants, so it still means something
    // if a future edit changes the shape instead of the numbers.
    //
    // 2026-08-16: budget widened 270 -> 300. That +30s is the ENTIRE price of restoring swr, which
    // cut this endpoint from ~1,069 to a projected ~24 public invocations/hr. It was paid by adding
    // swr=30 rather than by lowering s-maxage or halving TTL — both of which were considered and
    // rejected: lowering s-maxage raises the revalidation rate (and so the regen count) once the
    // herd is collapsed, and halving TTL silently halves ONE_SIDED_DWELL's wall-clock meaning, which
    // the last test here exists to prevent. Do not widen this again to fund a longer swr; swr's
    // benefit saturates at ~one revalidation and 30s already clears that by 6-30x.
    const swr = Number(/stale-while-revalidate=(\d+)/.exec(cacheControlValue)?.[1] ?? 0)
    expect(sMaxAge + swr + ttlS).toBeLessThanOrEqual(300)
  })

  it('keeps ONE_SIDED_DWELL worth roughly 4 minutes of wall clock', () => {
    // TTL is the regen cadence, and resolveLiveSignals observes once per regen — so TTL is the unit
    // ONE_SIDED_DWELL counts in. liveSignal.js documents the dwell as "~4 min", the R3 "be slow to
    // tell a fan a game is finished" guarantee. Halving TTL to 60s to fund a higher s-maxage was
    // rejected in review precisely because it would silently halve that, with every test still
    // green. This ties the two together so it cannot happen quietly.
    const dwellSeconds = ONE_SIDED_DWELL * ttlS
    expect(dwellSeconds).toBeGreaterThanOrEqual(240)
  })
})

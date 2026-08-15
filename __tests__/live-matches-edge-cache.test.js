/**
 * Pinned cache contract for /api/live-matches (2026-08-15 Fluid Active CPU pass).
 *
 * This endpoint is ~66% of the entire Fluid Active CPU budget, and three of its constants are
 * coupled in ways that are NOT visible from any one of them:
 *   - `s-maxage` must EXCEED App.jsx's live poll interval, with margin.
 *   - `stale-while-revalidate` costs worst-case staleness while saving ZERO invocations.
 *   - `TTL` is the observation cadence that ONE_SIDED_DWELL's wall-clock meaning depends on.
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

  it('carries no stale-while-revalidate on the read path', () => {
    // swr does not reduce origin invocations in steady state — a request past s-maxage costs one
    // invocation whether served stale in the background or blocking. It is otherwise a latency
    // feature, yet it is fully additive to worst-case served age. On a staleness-constrained
    // endpoint that is budget spent for ~nothing, and re-adding it silently lengthens how stale a
    // live score can be. Asserted on the parsed header value so it cannot be satisfied by a
    // reordered or `public,`-prefixed variant.
    expect(cacheControlValue).not.toMatch(/stale-while-revalidate/)
  })

  it('keeps stale-if-error, which is what actually replaced swr', () => {
    // Dropping swr also dropped an incidental availability property: under swr an origin failure
    // left the stale entry in place and the user still saw scores. stale-if-error buys that back
    // and, unlike swr, fires ONLY on an origin error — so it costs nothing against the
    // normal-operation staleness budget asserted below.
    expect(cacheControlValue).toMatch(/stale-if-error=\d+/)
  })

  it('holds worst-case served age within the agreed 270s budget', () => {
    // Worst case = s-maxage + swr + the payload's own KV age (stale-if-error excluded: it applies
    // only when the origin is failing, which is a deliberate availability-over-freshness trade).
    // Derived from the parsed header rather than the pinned constants, so it still means something
    // if a future edit changes the shape instead of the numbers.
    const swr = Number(/stale-while-revalidate=(\d+)/.exec(cacheControlValue)?.[1] ?? 0)
    expect(sMaxAge + swr + ttlS).toBeLessThanOrEqual(270)
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

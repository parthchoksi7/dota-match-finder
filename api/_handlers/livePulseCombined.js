import { createLogger, validateId } from '../_shared.js'
import { getCachedPulse } from './liveGamePulse.js'
import { getCachedValvePulse } from './liveValvePulse.js'

/**
 * `?mode=live-pulse` — resolves BOTH live telemetry sources for a PandaScore series id in one
 * request: the OpenDota pulse (`live-game-pulse`) and the Valve pulse (`live-valve-pulse`).
 *
 * Why (2026-08-09, Fluid Active CPU budget): SeriesLivePulse.jsx ran the two as separate 40s
 * pollers, staggered half a cycle apart — two serverless invocations every 40s per open live
 * sheet, i.e. ~4,320/day for a single fan who leaves one series open. Both resolve off the same
 * `id`, both are `no-store`, and neither depended on the other's result, so the split bought
 * nothing but a doubled invocation count and a doubled cold-start cost.
 *
 * The two sources' INDEPENDENT FAILURE MODES are the property that had to survive this merge, and
 * they do: `Promise.allSettled` means a rejection or a fail-closed flag on either side yields
 * `{ pulse: null }` for that key alone and never takes the other down with it. That is exactly the
 * invariant SeriesLivePulse.jsx relies on to keep rendering the OD-sourced draft and watch links
 * while `valve` is null (see its comments), and the reason the Valve gate is fail-closed at all.
 *
 * The per-source KV caches, TTLs, owner-scoped cache key and od-live-capture nudge are NOT
 * reimplemented here — this delegates to each handler's own `getCached*` so the standalone modes
 * and this one can never drift apart.
 *
 * Response shape: `{ od: { pulse }, valve: { pulse, disabled? } }`.
 * The standalone `live-game-pulse` / `live-valve-pulse` modes are unchanged and still serve their
 * original flat `{ pulse }` shape. Nothing in this repo calls them any more (SeriesLivePulse was
 * their only caller); they are retained as a debugging surface for isolating ONE source when the
 * combined response looks wrong, which is exactly when you don't want them coupled.
 */
export default async function handleLivePulseCombined(req, res) {
  const log = createLogger('/api/tournaments?mode=live-pulse')

  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ od: { pulse: null }, valve: { pulse: null } })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ od: { pulse: null }, valve: { pulse: null } })

  // Edge-cached per series (2026-08-11, Fluid Active CPU). Merging the two pollers above halved the
  // invocations per viewer, but this endpoint was still `no-store`, so what remained scaled LINEARLY
  // WITH VIEWERSHIP: every 40s tick of every concurrent viewer of the same series was its own
  // invocation. That is why CPU stayed over budget after the earlier cold-start work — that reduced
  // per-invocation COST, not invocation COUNT. The per-source KV caches dedup the WORK but not the
  // INVOCATION; the function still boots to reach them. N viewers of one series now collapse to ~2
  // origin hits/min instead of N x 1.5/min, and the saving grows with audience size — the property
  // that actually matters going into TI. Set AFTER validation so the 400s above stay uncacheable.
  //
  // Safe to cache publicly: the body is series-level telemetry (score/gold/draft/objectives), never
  // per-user — `isOwner` comes only from the `owner=1` query param, never from auth/cookies. The CDN
  // keys on the full URL, so `?id=` partitions by series and the `owner=1` variant is a distinct
  // entry. `max-age=0` keeps the BROWSER from holding its own copy: Vercel strips `s-maxage` before
  // the response reaches the client, and without `max-age=0` the leftover directives are honored by
  // the browser HTTP cache, which would hide fresh data from the very poll this exists to serve.
  //
  // TI-2026 UPDATE (2026-08-13): raised 30 -> 60. The original 30 was chosen against a single-series,
  // roughly single-region audience. Under TI the cache key's `?id=` partition multiplied by the
  // global PoP count: several concurrent series x many edge regions, each revalidating independently
  // every 30s, drove /api/tournaments to ~20k invocations/day at ~14-43ms CPU each — the single
  // largest line on the bill. Doubling the TTL halves that, and the saving scales with exactly the
  // two things TI increases (concurrent series and geographic spread).
  //
  // This value does NOT set the OD capture cadence, and an earlier version of this comment claiming
  // a `ceil(L/P)*P` relationship with liveOdCapture's LOCK_TTL_S was wrong (corrected 2026-08-13).
  // That formula assumes a single periodic attempter; in production there is one revalidation stream
  // per (series x edge PoP) plus one per open homepage tab, so attempts on the GLOBAL capture lock
  // are effectively continuous and the cadence follows LOCK_TTL_S alone. The two constants are
  // independent: this one controls how many INVOCATIONS occur, LOCK_TTL_S controls how often a
  // capture actually does work. Tune them separately, and do not "pair" them.
  //
  // Known staleness cost, stated plainly because it is a real product trade and not free: worst-case
  // displayed age is capture (<=LOCK_TTL_S) + pulse KV (PULSE_CACHE_TTL_S) + edge (60 + swr) + the
  // client's own poll gap. At 60s this lands around ~140s, up from ~115s at 30s. SeriesLivePulse's
  // STALE_AFTER_MS was raised alongside this change so a single transient null poll cannot blank the
  // live section while a body that old is being retained — see that constant's comment.
  //
  // Also note the interval is unharmonic with SeriesLivePulse's 40s POLL_MS: a lone viewer now
  // MISSes roughly every other poll (~1 origin hit per 80s rather than per 40s), which is where the
  // solo-viewer saving comes from, at the cost of every other poll returning a byte-identical body.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=10')

  const isOwner = req.query?.owner === '1'

  const [od, valve] = await Promise.allSettled([
    getCachedPulse(pandaId, isOwner, log),
    getCachedValvePulse(pandaId, log),
  ])

  if (od.status === 'rejected') log.warn('od pulse failed', { pandaId, error: od.reason?.message })
  if (valve.status === 'rejected') log.warn('valve pulse failed', { pandaId, error: valve.reason?.message })

  return res.status(200).json({
    od: od.status === 'fulfilled' ? od.value : { pulse: null },
    valve: valve.status === 'fulfilled' ? valve.value : { pulse: null },
  })
}

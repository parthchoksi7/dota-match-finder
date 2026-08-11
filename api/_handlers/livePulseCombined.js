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
  // WHY 30 AND NOT LONGER — this sets the OD capture cadence, so it is not free to tune. Each origin
  // revalidation is what runs captureOdLiveOnce() inside getCachedPulse(), and that capture holds a
  // never-released 60s KV lock (LOCK_TTL_S in liveOdCapture.js). Periodic attempts every P seconds
  // against that lock yield a real capture every ceil(60/P)*P: P=30 gives exactly 60s (unchanged from
  // today), but P=45 would give 90s — silently thinning the live_game_gold timeseries the net-worth
  // graph is built from, and invalidating GOLD_HISTORY_MAX_POINTS, which liveGamePulse.js derives
  // from the ~60s cadence. Any future change here must redo that ceil() calculation, not just check
  // that s-maxage < 60.
  //
  // Known staleness interaction, accepted: worst-case body age is capture (<=60s) + KV
  // (PULSE_CACHE_TTL_S) + edge (30 + swr), which can exceed SeriesLivePulse's STALE_AFTER_MS (90s)
  // retain-last-known-good bound. That bound only applies when a poll returns null, and a null after
  // an already-old pulse is far more likely a real game transition (where clearing is correct) than
  // a transient miss — so the guard degrades toward correct behavior, not toward a stale display.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=10')

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

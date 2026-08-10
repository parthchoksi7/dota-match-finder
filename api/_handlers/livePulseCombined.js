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
  res.setHeader('Cache-Control', 'private, no-store')

  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ od: { pulse: null }, valve: { pulse: null } })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ od: { pulse: null }, valve: { pulse: null } })

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

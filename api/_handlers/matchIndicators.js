import { kv } from '../_kv.js'
import { createLogger } from '../_shared.js'

export default async function handleMatchIndicators(req, res) {
  const log = createLogger('/api/tournaments?mode=match-indicators')
  const { ids } = req.query
  if (!ids) return res.status(400).json({ error: 'ids required' })
  if (ids.length > 300) return res.status(400).json({ error: 'ids param too long' })

  const matchIds = ids.split(',').map(s => s.trim()).filter(s => /^\d{1,15}$/.test(s)).slice(0, 15)
  if (matchIds.length === 0) return res.status(400).json({ error: 'no valid ids' })

  const INDICATORS_TTL = 60 * 60 * 24 * 7 // 7 days - match data is immutable
  const KV_PREFIX = 'indicators:match:v4:' // v4 — added rampage detection
  const result = {}

  // ?bust=1 clears the KV cache for the requested IDs so they recompute from OpenDota.
  // Use when a match was cached before OpenDota fully indexed it (e.g. multi_kills missing).
  if (req.query?.bust === '1') {
    try {
      const keys = matchIds.map(id => `${KV_PREFIX}${id}`)
      await Promise.all(keys.map(k => kv.del(k)))
      log.info('cache busted', { matchIds: matchIds.join(',') })
    } catch (err) {
      log.warn('KV bust failed', { error: err?.message })
    }
  }

  // Batch Redis read
  try {
    const keys = matchIds.map(id => `${KV_PREFIX}${id}`)
    const cached = await kv.mget(...keys)
    matchIds.forEach((id, i) => { if (cached[i] != null) result[id] = cached[i] })
  } catch (err) {
    log.warn('KV read failed', { error: err?.message })
  }

  const uncached = matchIds.filter(id => !result[id])

  if (uncached.length > 0) {
    const computeIndicators = (data) => {
      const RAPIER_ID = 133
      const isRadiant = (p) => (p.player_slot ?? 0) < 128
      const boughtRapier = (p) => {
        const purchase = p.purchase || {}
        if ((purchase['rapier'] || 0) > 0) return true
        const log = p.purchase_log || []
        if (log.some(e => e.key === 'rapier')) return true
        return [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].includes(RAPIER_ID)
      }
      const radiantHasRapier = (data.players || []).some(p => isRadiant(p) && boughtRapier(p))
      const direHasRapier = (data.players || []).some(p => !isRadiant(p) && boughtRapier(p))

      // goldSwingWinner = team that came back from a 20k+ gold deficit
      const goldAdv = data.radiant_gold_adv || []
      let goldSwingWinner = null
      let radiantPeak = 0
      for (const adv of goldAdv) {
        if (adv > radiantPeak) radiantPeak = adv
        if (radiantPeak >= 20000 && adv <= 0) { goldSwingWinner = 'dire'; break }
      }
      if (!goldSwingWinner) {
        let direPeak = 0
        for (const adv of goldAdv) {
          if (-adv > direPeak) direPeak = -adv
          if (direPeak >= 20000 && adv >= 0) { goldSwingWinner = 'radiant'; break }
        }
      }

      // megaComebackWinner = team that won despite all their barracks being destroyed
      let megaComebackWinner = null
      if (data.barracks_status_radiant === 0 && data.radiant_win === true) {
        megaComebackWinner = 'radiant'
      } else if (data.barracks_status_dire === 0 && data.radiant_win === false) {
        megaComebackWinner = 'dire'
      }

      // rampage = team had at least one player achieve a 5-kill streak
      const hadRampage = (p) => {
        const mk = p.multi_kills || {}
        return (mk[5] || mk['5'] || 0) > 0
      }
      const radiantHasRampage = (data.players || []).some(p => isRadiant(p) && hadRampage(p))
      const direHasRampage = (data.players || []).some(p => !isRadiant(p) && hadRampage(p))

      return {
        radiantHasRapier, direHasRapier, goldSwingWinner, megaComebackWinner,
        radiantHasRampage, direHasRampage,
        // legacy booleans — consumed by MatchCard game rows via GameIndicators
        hasRapier: radiantHasRapier || direHasRapier,
        hasGoldSwing: goldSwingWinner !== null,
        hasMegaComeback: megaComebackWinner !== null,
        hasRampage: radiantHasRampage || direHasRampage,
      }
    }

    const settled = await Promise.allSettled(
      uncached.map(async id => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        try {
          const fetchRes = await fetch(`https://api.opendota.com/api/matches/${id}`, { signal: controller.signal })
          if (!fetchRes.ok) throw new Error(`OpenDota ${fetchRes.status}`)
          const data = await fetchRes.json()
          return { id, indicators: computeIndicators(data) }
        } finally {
          clearTimeout(timeout)
        }
      })
    )

    const toCache = []
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        const { id, indicators } = outcome.value
        result[id] = indicators
        toCache.push({ id, indicators })
      }
    }

    if (toCache.length > 0) {
      Promise.all(
        toCache.map(({ id, indicators }) =>
          kv.set(`${KV_PREFIX}${id}`, indicators, { ex: INDICATORS_TTL })
        )
      ).catch(err => log.warn('KV write failed', { error: err?.message }))
    }
  }

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json(result)
}

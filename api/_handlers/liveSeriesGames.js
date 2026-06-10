import { kv } from '../_kv.js'
import { PANDASCORE_BASE, STREAM_TTL, createLogger, validateId } from '../_shared.js'

export default async function handleLiveSeriesGames(req, res) {
  const log = createLogger('/api/tournaments?mode=live-series-games')
  const token = process.env.PANDASCORE_TOKEN
  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ gameIds: [] })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ gameIds: [] })
  try {
    const positions = [1, 2, 3, 4, 5]
    const keys = positions.map(p => `live:game:${pandaId}:${p}`)
    const values = await kv.mget(...keys)
    const fromCache = values
      .map((v, i) => (v ? { pos: positions[i], id: String(v) } : null))
      .filter(Boolean)
      .sort((a, b) => a.pos - b.pos)

    if (fromCache.length > 0) {
      return res.status(200).json({ gameIds: fromCache.map(x => x.id) })
    }

    // Redis miss (e.g. series started before this code was deployed) — fetch
    // the individual match from PandaScore which sets external_identifier on
    // finished games even when the bulk running endpoint does not.
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    const psRes = await fetch(`${PANDASCORE_BASE}/matches/${pandaId}`, { headers })
    if (!psRes.ok) {
      log.warn('PS match fetch failed', { pandaId, status: psRes.status })
      return res.status(200).json({ gameIds: [] })
    }
    const detail = await psRes.json()
    const finished = (detail.games || [])
      .filter(g => g.status === 'finished' && g.external_identifier)
      .sort((a, b) => a.position - b.position)

    // Backfill Redis so the next click is instant.
    if (finished.length > 0) {
      Promise.all(
        finished.map(g =>
          kv.set(`live:game:${pandaId}:${g.position}`, String(g.external_identifier), { ex: STREAM_TTL })
        )
      ).catch(err => log.warn('backfill failed', { error: err?.message }))
    }

    const gameIds = finished.map(g => String(g.external_identifier))
    log.info('PS fallback resolved', { pandaId, gameIds })
    return res.status(200).json({ gameIds })
  } catch (err) {
    log.warn('handler failed', { error: err?.message })
    return res.status(200).json({ gameIds: [] })
  }
}

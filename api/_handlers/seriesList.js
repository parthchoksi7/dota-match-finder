import { kv } from '../_kv.js'
import { trackError } from '../_shared.js'
import { fetchSeriesList, KV_SERIES_KEY } from './_tournamentUtils.js'

export default async function handleSeriesList(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  if (req.query?.bust === '1') {
    await kv.del(KV_SERIES_KEY).catch(() => {})
    console.log('Series list cache cleared')
  }
  try {
    const data = await fetchSeriesList(token)
    return res.status(200).json(data)
  } catch (err) {
    console.error('Series list error:', err?.message || err)
    await trackError('/api/tournaments', 500, err?.message)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

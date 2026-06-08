import { kv } from '../_kv.js'
import { fetchRecentCompleted, KV_RC_KEY } from './_tournamentUtils.js'

export default async function handleRecentCompleted(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const bust = req.query?.bust === '1'
  if (bust) {
    await kv.del(KV_RC_KEY).catch(() => {})
    console.log('recent-completed cache cleared')
  }
  try {
    const data = await fetchRecentCompleted(token, bust)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)
  } catch (err) {
    console.error('recent-completed error:', err?.message)
    return res.status(200).json({ games: [], fetchedAt: new Date().toISOString(), error: err?.message })
  }
}

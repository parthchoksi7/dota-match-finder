import { kv } from '../_kv.js'
import { KV_TIER1_NAMES_KEY } from '../_shared.js'
import { fetchTier1LeagueNames } from './_tournamentUtils.js'

export default async function handleTier1Leagues(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  if (req.query?.bust === '1') {
    try { await kv.del(KV_TIER1_NAMES_KEY) } catch {}
    console.log('tier1-leagues cache cleared')
  }
  const names = await fetchTier1LeagueNames(token)
  return res.status(200).json({ names })
}

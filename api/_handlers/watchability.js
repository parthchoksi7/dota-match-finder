import { kv } from '../_kv.js'
import { rateLimitByIp } from '../_shared.js'

const WATCH_CACHE_TTL = 60 * 60 * 24 * 30 // 30 days

function countGoldFlips(arr, threshold = 5000) {
  if (!Array.isArray(arr) || arr.length < 2) return 0
  let flips = 0, lastSide = arr[0] >= 0 ? 1 : -1, lastFlipValue = arr[0]
  for (let i = 1; i < arr.length; i++) {
    const val = arr[i], side = val >= 0 ? 1 : -1
    if (side !== lastSide && Math.abs(val - lastFlipValue) >= threshold) {
      flips++; lastSide = side; lastFlipValue = val
    }
  }
  return flips
}

function hasGoldComeback(arr, radiantWin, threshold = 15000) {
  if (!Array.isArray(arr) || arr.length < 2) return false
  return radiantWin
    ? Math.max(...arr.map(v => -v)) >= threshold
    : Math.max(...arr) >= threshold
}

function hasMegaComeback(m) {
  return m.radiant_win ? m.barracks_status_radiant === 0 : m.barracks_status_dire === 0
}

function scoreGame(m) {
  const signals = [], durationMin = (m.duration || 0) / 60
  let score = 0
  if (durationMin >= 35 && durationMin <= 65) { score++; signals.push('good_duration') }
  if ((m.radiant_score || 0) + (m.dire_score || 0) >= 50) { score++; signals.push('high_kills') }
  const gold = m.radiant_gold_adv
  if (hasGoldComeback(gold, m.radiant_win)) { score++; signals.push('gold_comeback') }
  if (hasMegaComeback(m)) { score++; signals.push('mega_comeback') }
  if (countGoldFlips(gold) >= 3) { score++; signals.push('back_and_forth') }
  return { score, signals }
}

function getWatchRating(score) {
  if (score >= 4) return 'must_watch'
  if (score === 3) return 'good'
  if (score === 2) return 'average'
  return 'skip'
}

export default async function handleWatchability(req, res) {
  const { seriesId, matchIds } = req.body || {}
  if (!seriesId || !Array.isArray(matchIds) || matchIds.length === 0) {
    return res.status(400).json({ error: 'Missing seriesId or matchIds' })
  }
  const cacheKey = `watchability:series:${seriesId}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return res.status(200).json({ ...cached, cached: true })
  } catch {}

  const allowed = await rateLimitByIp(req, kv, 'watchability', 20)
  if (!allowed) return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' })

  const results = await Promise.allSettled(
    matchIds.map(id => fetch(`https://api.opendota.com/api/matches/${id}`).then(r => {
      if (!r.ok) throw new Error(`OpenDota ${r.status}`)
      return r.json()
    }))
  )
  const gameScores = results
    .filter(r => r.status === 'fulfilled' && r.value?.match_id)
    .map(r => scoreGame(r.value))

  if (gameScores.length === 0) {
    return res.status(200).json({ rating: 'average', label: 'Average', signals: [] })
  }

  const best = gameScores.reduce((b, g) => g.score > b.score ? g : b, gameScores[0])
  const allSignals = [...new Set(gameScores.flatMap(g => g.signals))]
  const rating = getWatchRating(best.score)
  const labelMap = { must_watch: 'Must Watch', good: 'Good', average: 'Average', skip: 'Skip' }
  const payload = { rating, label: labelMap[rating], signals: allSignals, score: best.score }

  kv.set(cacheKey, payload, { ex: WATCH_CACHE_TTL }).catch(() => {})
  return res.status(200).json(payload)
}

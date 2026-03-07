
import { kv } from "@vercel/kv"

const CACHE_TTL = 60 * 60 * 24 * 30 // 30 days

// Parse "HH:MM" or "H:MM" duration string to total seconds
function durationToSeconds(str) {
  if (!str || typeof str !== "string") return 0
  const [h = 0, m = 0] = str.trim().split(":").map(Number)
  return h * 3600 + m * 60
}

// Count how many times the gold lead flips sides by more than threshold
function countGoldFlips(goldAdvArray, threshold = 5000) {
  if (!Array.isArray(goldAdvArray) || goldAdvArray.length < 2) return 0
  let flips = 0
  let lastSide = goldAdvArray[0] >= 0 ? 1 : -1
  let lastFlipValue = goldAdvArray[0]
  for (let i = 1; i < goldAdvArray.length; i++) {
    const val = goldAdvArray[i]
    const side = val >= 0 ? 1 : -1
    if (side !== lastSide && Math.abs(val - lastFlipValue) >= threshold) {
      flips++
      lastSide = side
      lastFlipValue = val
    }
  }
  return flips
}

// Check if gold lead hit threshold in one direction then flipped to opposite winner
function hasGoldComeback(goldAdvArray, radiantWin, threshold = 15000) {
  if (!Array.isArray(goldAdvArray) || goldAdvArray.length < 2) return false
  if (radiantWin) {
    // Radiant won — check if Dire ever led by 15k+
    const direMaxLead = Math.max(...goldAdvArray.map(v => -v))
    return direMaxLead >= threshold
  } else {
    // Dire won — check if Radiant ever led by 15k+
    const radiantMaxLead = Math.max(...goldAdvArray)
    return radiantMaxLead >= threshold
  }
}

// Check if losing team had megas (all barracks destroyed = 0 barracks remaining)
// barracks_status_radiant/dire are bitmasks: 0 means all barracks gone
function hasMegaComeback(matchData) {
  if (matchData.radiant_win) {
    // Radiant won — did Dire have megas? (Radiant barracks = 0)
    return matchData.barracks_status_radiant === 0
  } else {
    // Dire won — did Radiant have megas? (Dire barracks = 0)
    return matchData.barracks_status_dire === 0
  }
}

function scoreGame(matchData) {
  const signals = []
  let score = 0

  const durationSec = matchData.duration || 0
  const durationMin = durationSec / 60
  if (durationMin >= 35 && durationMin <= 65) {
    score++
    signals.push("good_duration")
  }

  const kills = (matchData.radiant_score || 0) + (matchData.dire_score || 0)
  if (kills >= 50) {
    score++
    signals.push("high_kills")
  }

  const goldAdv = matchData.radiant_gold_adv
  if (hasGoldComeback(goldAdv, matchData.radiant_win, 15000)) {
    score++
    signals.push("gold_comeback")
  }

  if (hasMegaComeback(matchData)) {
    score++
    signals.push("mega_comeback")
  }

  const flips = countGoldFlips(goldAdv, 5000)
  if (flips >= 3) {
    score++
    signals.push("back_and_forth")
  }

  return { score, signals }
}

function getRating(score) {
  if (score >= 4) return "must_watch"
  if (score === 3) return "good"
  if (score === 2) return "average"
  return "skip"
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const { seriesId, matchIds } = req.body
  if (!seriesId || !Array.isArray(matchIds) || matchIds.length === 0) {
    return res.status(400).json({ error: "Missing seriesId or matchIds" })
  }

  // Check cache
  const cacheKey = `watchability:series:${seriesId}`
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return res.status(200).json({ ...cached, cached: true })
  } catch {
    // Redis unavailable — continue without cache
  }

  // Fetch full match data for each game
  const results = await Promise.allSettled(
    matchIds.map(id =>
      fetch(`https://api.opendota.com/api/matches/${id}`)
        .then(r => r.json())
    )
  )

  const gameScores = results
    .filter(r => r.status === "fulfilled" && r.value && r.value.match_id)
    .map(r => scoreGame(r.value))

  if (gameScores.length === 0) {
    return res.status(200).json({ rating: "average", label: "Average", signals: [] })
  }

  // Series rating = best single game score (any must-watch game = must-watch series)
  const bestGame = gameScores.reduce((best, g) => g.score > best.score ? g : best, gameScores[0])
  const allSignals = [...new Set(gameScores.flatMap(g => g.signals))]

  // Series drama bonus: if series went to deciding game, bump score by 1
  let finalScore = bestGame.score
  // (series drama is passed in via matchIds length vs seriesType — handle in frontend)

  const rating = getRating(finalScore)
  const labelMap = {
    must_watch: "Must Watch",
    good: "Good",
    average: "Average",
    skip: "Skip",
  }

  const payload = { rating, label: labelMap[rating], signals: allSignals, score: finalScore }

  // Cache it
  try {
    await kv.set(cacheKey, payload, { ex: CACHE_TTL })
  } catch {
    // silently fail
  }

  return res.status(200).json(payload)
}

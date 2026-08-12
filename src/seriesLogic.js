// Pure series-completion logic shared between the client (via src/utils.js re-export) and
// server (api/live-matches.js, the WS3 replay-ready gate). Zero imports on purpose — this
// file must be safe to load in a Vercel serverless function, unlike src/utils.js (which
// pulls in @vercel/analytics, a browser-oriented package). Keep it that way: do not add an
// import here without checking it's Node-safe.

/** Wins required to win the series (BO1=1, BO2=2, BO3=2, BO5=3) */
export function winsRequiredForSeries(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  if (seriesType === 3) return 2 // BO2
  return 2
}

export function isSeriesComplete(series) {
  if (!series || !series.games || !series.games.length) return false
  const teamWins = {}
  for (const g of series.games) {
    const winner = g.radiantWin ? g.radiantTeam : g.direTeam
    teamWins[winner] = (teamWins[winner] || 0) + 1
  }
  const maxWins = Math.max(...Object.values(teamWins))
  if (maxWins >= winsRequiredForSeries(series.seriesType)) return true
  // BO2 draw: both teams have 1 win after 2 games. Only check seriesType 3 (explicit BO2 from
  // PandaScore format cache). seriesType 1 is BO3 — a 1-1 BO3 is NOT complete (G3 still to play).
  const isBO2 = series.seriesType === 3
  if (isBO2 && series.games.length >= 2 && maxWins === 1 && Object.keys(teamWins).length === 2) return true
  return false
}

// Has an OPEN live-series sheet's series stopped running? (2026-08-11, Fluid Active CPU.)
//
// Note this deliberately does NOT reuse isSeriesComplete above: by the time a sheet needs this
// answer, its `series` snapshot is frozen at whatever App.jsx last synced BEFORE the series left
// the live feed, so its games/score never reach a completed state and isSeriesComplete would
// answer false forever. Absence from the live feed is the only signal that actually arrives —
// PandaScore lists a series as running until the series itself ends.
//
// `liveLoaded` must be false until the first live-matches poll has been ATTEMPTED, otherwise the
// initial empty list would conclude every freshly-opened sheet. Callers must also ensure a failed
// poll leaves `liveMatches` at its previous value rather than emptying it (see fetchLiveData's
// r.ok check) — this predicate cannot distinguish "upstream said nothing is live" from "upstream
// failed and someone handed us []", which is why its only consumer BACKS OFF rather than stopping.
export function isLiveSeriesConcluded(selectedSeries, liveMatches, liveLoaded) {
  if (!selectedSeries || !liveLoaded) return false
  if (!Array.isArray(liveMatches)) return false
  return !liveMatches.some(m => String(m?.id) === String(selectedSeries.id))
}

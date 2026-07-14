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

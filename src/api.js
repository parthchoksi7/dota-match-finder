const OPENDOTA_BASE = "https://api.opendota.com/api"

export async function fetchProMatches() {
  const res = await fetch(`${OPENDOTA_BASE}/promatches`)
  const data = await res.json()
  return data.map((m) => ({
    id: String(m.match_id),
    tournament: m.league_name,
    date: new Date(m.start_time * 1000).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    }),
    radiantTeam: m.radiant_name || "Radiant",
    direTeam: m.dire_name || "Dire",
    radiantScore: m.radiant_score,
    direScore: m.dire_score,
    radiantWin: m.radiant_win,
    duration: new Date(m.duration * 1000).toISOString().substr(11, 5),
    startTime: m.start_time,
    twitchVodId: null,
    twitchOffset: null,
  }))
}
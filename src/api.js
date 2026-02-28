const OPENDOTA_BASE = 'https://api.opendota.com/api'

export async function fetchProMatches() {
  const res = await fetch(OPENDOTA_BASE + '/promatches')
  const data = await res.json()
  return data.map((m) => ({
    id: String(m.match_id),
    tournament: m.league_name,
    date: new Date(m.start_time * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }),
    radiantTeam: m.radiant_name || 'Radiant',
    direTeam: m.dire_name || 'Dire',
    radiantScore: m.radiant_score,
    direScore: m.dire_score,
    radiantWin: m.radiant_win,
    duration: new Date(m.duration * 1000).toISOString().substr(11, 5),
    startTime: m.start_time,
    twitchVodId: null,
    twitchOffset: null,
    seriesId: m.series_id,
  }))
}

async function getTwitchToken() {
  const res = await fetch(
    'https://id.twitch.tv/oauth2/token?client_id=' + import.meta.env.VITE_TWITCH_CLIENT_ID + '&client_secret=' + import.meta.env.VITE_TWITCH_CLIENT_SECRET + '&grant_type=client_credentials',
    { method: 'POST' }
  )
  const data = await res.json()
  return data.access_token
}

export async function findTwitchVod(channelName, matchStartTime) {
  const token = await getTwitchToken()
  const headers = {
    'Client-ID': import.meta.env.VITE_TWITCH_CLIENT_ID,
    'Authorization': 'Bearer ' + token
  }
  const userRes = await fetch('https://api.twitch.tv/helix/users?login=' + channelName, { headers })
  const userData = await userRes.json()
  const userId = userData.data[0] && userData.data[0].id
  if (!userId) return null
  const vodRes = await fetch('https://api.twitch.tv/helix/videos?user_id=' + userId + '&type=archive&first=30', { headers })
  const vodData = await vodRes.json()
  console.log('VODs found for', channelName, ':', vodData.data.length)
  for (const vod of vodData.data) {
    const vodStart = new Date(vod.created_at).getTime() / 1000
    const durationSeconds = parseTwitchDuration(vod.duration)
    const vodEnd = vodStart + durationSeconds
    console.log('Checking:', vod.title, '| start:', vodStart, '| end:', vodEnd, '| match:', matchStartTime)
    if (matchStartTime >= vodStart && matchStartTime <= vodEnd) {
      const offset = Math.floor(matchStartTime - vodStart)
      return { vodId: vod.id, offset, url: 'https://www.twitch.tv/videos/' + vod.id + '?t=' + offset + 's' }
    }
  }
  return null
}

function parseTwitchDuration(duration) {
  const match = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  const hours = parseInt(match[1] || 0)
  const minutes = parseInt(match[2] || 0)
  const seconds = parseInt(match[3] || 0)
  return hours * 3600 + minutes * 60 + seconds
}

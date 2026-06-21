// Pure helpers for the internal VOD-URL browser (api/pipeline.js?type=vod-urls).
// No I/O — takes match_stream_history rows, returns the grouped Series → Games →
// main/other URL structure the page renders. Unit-tested in
// __tests__/vod-urls-group.test.js.

export function classifyStreamSource(url) {
  if (!url) return 'other'
  if (url.includes('twitch.tv')) return 'twitch'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  return 'other'
}

export function twitchChannelFromUrl(url) {
  if (!url || !url.includes('twitch.tv')) return null
  return url.replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/\/$/, '') || null
}

// Normalize a streams_json element to the current shape, deriving source/channel
// for legacy rows written before those fields existed.
export function normalizeStreamEl(s) {
  const source = s.source || classifyStreamSource(s.raw_url)
  const channel = s.channel || (source === 'twitch' ? twitchChannelFromUrl(s.raw_url) : null)
  return {
    raw_url: s.raw_url,
    language: s.language || null,
    official: !!s.official,
    main: !!s.main,
    source,
    channel,
  }
}

export function streamToUrlObj(s) {
  return {
    url: s.raw_url,
    channel: s.channel,
    language: s.language,
    source: s.source,
    official: s.official,
    deep_link: false, // raw live/channel page — not a timestamped replay (yet)
    kind: 'stream_page',
  }
}

// Construct the timestamped (or plain) Twitch VOD URL object for a resolved VOD.
function vodUrlObj({ twitch_vod_id, vod_offset_s }, { channel, language, official }) {
  const timestamped = vod_offset_s != null
  return {
    url: `https://www.twitch.tv/videos/${twitch_vod_id}${timestamped ? `?t=${vod_offset_s}s` : ''}`,
    channel: channel ?? null,
    language: language ?? 'en',
    source: 'twitch',
    official: official ?? true,
    deep_link: timestamped, // timestamped → jumps to the game start point
    kind: timestamped ? 'start_point' : 'replay',
  }
}

// Build the main + other URLs for one game row. A Twitch channel with a resolved VOD
// deep-links to the game start; everything else opens the raw stream/channel page.
// `vodByChannel` (from match_stream_vods) supplies per-channel VODs for NON-main
// channels; the row's own twitch_vod_id/vod_offset_s cover the main channel.
export function buildGameUrls(row, vodByChannel = {}) {
  const streams = Array.isArray(row.streams_json)
    ? row.streams_json.map(normalizeStreamEl).filter(s => s.raw_url)
    : []

  const resolvedVodFor = (channel) => {
    if (!channel) return null
    const v = vodByChannel[channel]
    if (v && v.twitch_vod_id) return { twitch_vod_id: v.twitch_vod_id, vod_offset_s: v.vod_offset_s }
    if (channel === row.channel && row.twitch_vod_id) return { twitch_vod_id: row.twitch_vod_id, vod_offset_s: row.vod_offset_s }
    return null
  }

  const urlObjFor = (s) => {
    if (s.source === 'twitch') {
      const rv = resolvedVodFor(s.channel)
      if (rv) return vodUrlObj(rv, s)
    }
    // YouTube URL with ?t= is a manually-set timestamped replay (no Twitch VOD exists).
    if (s.source === 'youtube' && s.raw_url?.includes('?t=')) {
      return { url: s.raw_url, channel: null, language: s.language || null, source: 'youtube', official: !!s.official, deep_link: true, kind: 'start_point' }
    }
    return streamToUrlObj(s)
  }

  const primaryStream =
    (row.channel && streams.find(s => s.channel === row.channel)) ||
    streams.find(s => s.main) ||
    streams[0] ||
    null

  let main = primaryStream ? urlObjFor(primaryStream) : null
  // Edge: main channel resolved but absent from streams_json (legacy / sparse rows).
  if (!main && row.twitch_vod_id) {
    main = vodUrlObj({ twitch_vod_id: row.twitch_vod_id, vod_offset_s: row.vod_offset_s }, { channel: row.channel || null })
  }

  const others = streams.filter(s => s.raw_url !== primaryStream?.raw_url).map(urlObjFor)
  return { main, others }
}

export function dayKey(iso) {
  return (iso || '').slice(0, 10) // YYYY-MM-DD (started_at is UTC ISO)
}

// Shape one match_stream_history row into the public ?type=replay response:
// the Supabase-stored replay link for a single game (no KV, no Helix).
export function buildReplayResponse(row) {
  const { main, others } = buildGameUrls(row)
  return {
    od_match_id: row.od_match_id,
    replay_available: !!row.twitch_vod_id || row.vod_available === true || main?.kind === 'start_point',
    main,
    others,
    vod_available: row.vod_available ?? null,
    checked_at: row.vod_checked_at || null,
  }
}

// Group match_stream_history rows into series (newest first), each with games
// (by position) and a replay-available flag.
export function groupSeriesFromRows(rows, vodsByMatch = {}) {
  const seriesMap = new Map()
  for (const row of rows) {
    const key = row.ps_match_id != null
      ? `ps:${row.ps_match_id}`
      : `t:${row.tournament}|${row.team_a}|${row.team_b}|${dayKey(row.started_at)}`
    let s = seriesMap.get(key)
    if (!s) {
      s = {
        series_key: key,
        ps_match_id: row.ps_match_id ?? null,
        date: dayKey(row.started_at),
        tournament: row.tournament || null,
        team_a: row.team_a || null,
        team_b: row.team_b || null,
        match_type: row.match_type || null,
        bracket_round: row.bracket_round || null,
        replay_available: false,
        games: [],
      }
      seriesMap.set(key, s)
    }
    const { main, others } = buildGameUrls(row, vodsByMatch[row.od_match_id] || {})
    const hasReplay = !!row.twitch_vod_id || row.vod_available === true || main?.kind === 'start_point'
    if (hasReplay) s.replay_available = true
    if (dayKey(row.started_at) < s.date) s.date = dayKey(row.started_at)
    s.games.push({
      od_match_id: row.od_match_id,
      game_position: row.game_position ?? null,
      started_at: row.started_at,
      channel: row.channel || null,
      vod_available: row.vod_available ?? null,
      vod_checked_at: row.vod_checked_at || null,
      replay_available: hasReplay,
      main,
      others,
    })
  }

  const series = [...seriesMap.values()]
  for (const s of series) {
    s.games.sort((a, b) => {
      const pa = a.game_position ?? 99
      const pb = b.game_position ?? 99
      if (pa !== pb) return pa - pb
      return new Date(a.started_at) - new Date(b.started_at)
    })
  }
  series.sort((a, b) => new Date(b.games.at(-1)?.started_at || 0) - new Date(a.games.at(-1)?.started_at || 0))
  return series
}

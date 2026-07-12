/**
 * Pure helpers for scripts/vod-enrich.mjs — no I/O, no Supabase client, so they are
 * unit-testable (the script itself creates a Supabase client at import time).
 */

// Parse "https://www.twitch.tv/videos/2401234567?t=1842s" → { vodId, offset }
export function parseVodUrl(url) {
  if (!url) return null
  const idMatch = url.match(/\/videos\/(\d+)/)
  const tMatch = url.match(/[?&]t=(\d+)s/)
  if (!idMatch) return null
  return { vodId: idMatch[1], offset: tMatch ? Number(tMatch[1]) : 0 }
}

/**
 * Turn a resolver response into a DB update + outcome label, applying the grace/live
 * rules. Shared by the main-channel and per-channel enrichment passes.
 *   data    : { url } on hit | { url:null, live } on miss
 *   ageHours: hours since the game started
 *   opts    : { graceHours, now } (now injectable for tests)
 * Returns { outcome: 'resolved'|'pending'|'unavailable'|'fail', update?, vodId?, offset?, error? }
 */
export function classifyResolution(data, ageHours, { graceHours = 24, now = () => new Date().toISOString() } = {}) {
  if (data && data.url) {
    const parsed = parseVodUrl(data.url)
    if (!parsed) return { outcome: 'fail', error: `unparseable url ${data.url}` }
    const ts = now()
    return {
      outcome: 'resolved',
      vodId: parsed.vodId,
      offset: parsed.offset,
      update: {
        twitch_vod_id: parsed.vodId,
        vod_offset_s: parsed.offset,
        vod_resolved_at: ts,
        vod_checked_at: ts,
        vod_available: true,
      },
    }
  }
  if ((data && data.live) || ageHours < graceHours) {
    // VOD not published yet (broadcast live) or Twitch indexing lag — retry next run.
    return { outcome: 'pending', update: { vod_checked_at: now() } }
  }
  // Checked, no VOD, past grace window — stop retrying.
  return { outcome: 'unavailable', update: { vod_checked_at: now(), vod_available: false } }
}

/**
 * Expand match_stream_history rows into seed rows for match_stream_vods: one per
 * NON-main Twitch channel (the main channel lives in match_stream_history). Dedupes
 * on (od_match_id, channel).
 */
export function buildVodSeedRows(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    const streams = Array.isArray(row.streams_json) ? row.streams_json : []
    for (const s of streams) {
      const channel = s?.channel
      const source = s?.source || (s?.raw_url?.includes('twitch.tv') ? 'twitch' : null)
      if (source !== 'twitch' || !channel) continue
      // Case-insensitive: row.channel is lowercased by getTwitchStreams(), but this
      // streams_json entry's channel keeps PandaScore's original case, so a mixed-case
      // login (e.g. EWC_LegionGauntlet_EN2) would otherwise slip past this guard and get
      // seeded as a duplicate "alt" row for what is actually the main channel.
      if (channel.toLowerCase() === (row.channel || '').toLowerCase()) continue // main channel handled by match_stream_history
      const key = `${row.od_match_id}|${channel}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        od_match_id: row.od_match_id,
        channel,
        language: s.language || null,
        started_at: row.started_at,
      })
    }
  }
  return out
}

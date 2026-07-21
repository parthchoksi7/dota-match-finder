// Pure helpers for combining Supabase-stored stream data with the LOCKED live
// resolver's result in resolveMatchStreams (src/App.jsx). No I/O — unit-tested
// in src/__tests__/vod-streams.test.js.
//
// Invariant (I1 in .claude/supabase-primary-streams-test-matrix.md): allVods
// stays the primary slot ONLY — GoldGraph event links and "Copy VOD link" read
// allVods[0]. Stored other-language streams travel in a separate otherStreams
// field and are never merged into allVods.

// Twitch archive VODs expire around 60 days; past ~55 a stored start point is a
// probable dead link and must not be served as a confident deep link.
export const VOD_MAX_AGE_S = 55 * 24 * 3600

export function isVodExpired(matchStartTime, nowSec = Date.now() / 1000) {
  if (!matchStartTime) return false
  return nowSec - matchStartTime > VOD_MAX_AGE_S
}

const lc = (s) => (s || '').toLowerCase()
const urlKey = (u) => (u || '').replace(/\/+$/, '')

const isTwitchVideoUrl = (u) => /twitch\.tv\/videos\//.test(u || '')

/**
 * Degrade expired Twitch video links to their channel page (the video is gone,
 * the channel still exists). Entries with no channel to fall back to are dropped.
 * Non-Twitch-video entries (stream pages, YouTube) pass through — they don't
 * expire on the Twitch archive schedule.
 */
export function degradeExpiredOthers(others) {
  return (others || [])
    .map(o => {
      if (!isTwitchVideoUrl(o?.url)) return o
      if (o.channel) return { ...o, url: `https://www.twitch.tv/${o.channel}`, deep_link: false, kind: 'stream_page' }
      return null
    })
    .filter(Boolean)
}

/**
 * Decide whether resolveMatchStreams can serve its primary slot directly from
 * the stored Supabase main, without running the Twitch-only live resolver
 * below. Two cases qualify (not source-exclusive — a non-expired YouTube
 * start-point satisfies case 1, same as Twitch):
 *   1. A resolved, non-expired start-point (kind === 'start_point' — the
 *      original Case A hit; in practice almost always Twitch, but a
 *      manually-timestamped YouTube main also qualifies here).
 *   2. Any non-Twitch official main that ISN'T a start-point (Kick, a
 *      timestamp-less YouTube broadcast, etc.) — it has no path through the
 *      Twitch-only chain and would always miss there, so the primary slot
 *      fell back to "No VOD found" even though the real broadcast link was
 *      already stored. These links don't expire on the Twitch archive
 *      schedule (see degradeExpiredOthers), so `expired` doesn't gate this
 *      case.
 * Returns the stored main object to use as the primary, or null to fall
 * through to the live resolver.
 */
export function resolvableStoredMain(stored, expired) {
  const main = stored?.main
  if (!main?.url) return null
  if (!expired && main.kind === 'start_point') return main
  if (main.source !== 'twitch') return main
  return null
}

/**
 * Dedup the stored others[] against whatever occupies the primary slot (the
 * stored start-point main, or the LOCKED chain's result), by URL and by
 * channel, so a freshly chain-resolved channel never appears twice. Returns
 * ONLY the surviving others — the primary list is never modified.
 */
export function dedupOthersAgainstPrimary(primaryVods, storedOthers) {
  const primary = (primaryVods || []).filter(v => v?.url)
  const seenUrls = new Set(primary.map(v => urlKey(v.url)))
  const seenChannels = new Set(primary.map(v => lc(v.channel)).filter(Boolean))
  const out = []
  for (const o of storedOthers || []) {
    if (!o?.url) continue
    const uk = urlKey(o.url)
    const ck = lc(o.channel)
    if (seenUrls.has(uk)) continue
    if (ck && seenChannels.has(ck)) continue
    seenUrls.add(uk)
    if (ck) seenChannels.add(ck)
    out.push(o)
  }
  return out
}

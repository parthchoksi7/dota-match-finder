import { kv } from '../_kv.js'
import { fetchRecentCompleted, KV_RC_KEY } from './_tournamentUtils.js'

export default async function handleRecentCompleted(req, res) {
  const token = process.env.PANDASCORE_TOKEN
  const bust = req.query?.bust === '1'
  if (bust) {
    await kv.del(KV_RC_KEY).catch(() => {})
    console.log('recent-completed cache cleared')
  }
  try {
    const data = await fetchRecentCompleted(token, bust)
    // Was `no-store`, which made the homepage's 5-min `fetchJustEnded` poll a guaranteed full
    // invocation every time (2026-08-09, Fluid Active CPU budget). Nothing here is per-user — it's
    // the same public "just ended" list for everyone — so there was never a reason to withhold it
    // from the edge. 420s is deliberately ABOVE the client's own 300s poll, not below it: past
    // s-maxage, stale-while-revalidate still costs an origin invocation (served stale, revalidated
    // in the background), so only requests landing INSIDE s-maxage actually save anything — an
    // s-maxage under the poll interval saves a solo viewer nothing at all.
    // swr is held at 300 (not 900) to bound total edge age at ~12 min. That matters because
    // `?bust=1` is its own cache key: busting deletes KV but CANNOT purge the normal key's cached
    // response, so this window is exactly how long a bust stays invisible to real users. It used
    // to be `no-store`, where a bust was visible on the very next poll — a deliberate trade.
    // Added staleness is otherwise harmless here: Just Ended entries exist precisely because
    // OpenDota hasn't indexed them yet (30-90+ min lag), so a few extra minutes is invisible.
    res.setHeader('Cache-Control', bust ? 'no-store' : 's-maxage=420, stale-while-revalidate=300')
    return res.status(200).json(data)
  } catch (err) {
    console.error('recent-completed error:', err?.message)
    return res.status(200).json({ games: [], fetchedAt: new Date().toISOString(), error: err?.message })
  }
}

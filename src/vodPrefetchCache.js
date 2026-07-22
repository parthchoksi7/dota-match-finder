// Client-side promise cache in front of resolveMatchStreams (App.jsx) — the entry point to the
// LOCKED VOD Replay System (pending-refactors #5, VOD pre-fetch; see the "VOD Replay System"
// section in .claude/claude_instructions_template.md). Lets a hover/touchstart on a
// game-switcher chip warm the result before the user actually clicks it. This module never
// calls resolveMatchStreams itself — the caller always passes it in as `resolver` — so it
// cannot touch a single cache key, TTL, or lookup order inside the locked chain; it only ever
// caches whatever that chain already returned.
//
// Correctness fixes vs. the 2026-07-20 reverted attempt (see pending-refactors.md):
// 1. resolveMatchStreams's sibling lookup depends on `allMatches` (used to find sibling games
//    for the same series). A cache entry written when `allMatches` was smaller can be a worse
//    result than a fresh call would give once more siblings have loaded (handleLoadMore /
//    handleSearchLoadMore / a feed refresh). Entries are invalidated once `allMatches.length`
//    has grown past what was recorded at write time.
// 2. `clearVodPrefetchCache()` is called on pull-to-refresh — the user's only recovery gesture
//    for a bad cached result — so a stale entry can never outlive a refresh.
// 3. A rejected resolution is evicted immediately rather than cached, so a transient failure
//    doesn't get "stuck" for the rest of the TTL.
export const VOD_PREFETCH_TTL_MS = 5 * 60 * 1000
const vodPrefetchCache = new Map() // matchId -> { promise, allMatchesLength, timestamp }

export function clearVodPrefetchCache() {
  vodPrefetchCache.clear()
}

export function prefetchMatchStreams(match, allMatches, resolver) {
  if (!match?.id || match.unplayed) return Promise.resolve({ url: null, channel: null, allVods: [], otherStreams: [] })
  const cached = vodPrefetchCache.get(match.id)
  const now = Date.now()
  if (cached && now - cached.timestamp < VOD_PREFETCH_TTL_MS && allMatches.length <= cached.allMatchesLength) {
    return cached.promise
  }
  const promise = resolver(match, allMatches).catch(err => {
    vodPrefetchCache.delete(match.id)
    throw err
  })
  vodPrefetchCache.set(match.id, { promise, allMatchesLength: allMatches.length, timestamp: now })
  return promise
}

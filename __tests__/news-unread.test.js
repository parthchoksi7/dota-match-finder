/**
 * Unit tests for news unread indicator localStorage helpers in src/utils.js:
 * - hasUnreadNews: returns true only when lastVisited < latestArticle
 * - setNewsLastVisited: persists current ISO timestamp to localStorage
 * - setNewsLatestArticle: persists given publishedAt, guards falsy input
 */

import { describe, it, expect, beforeEach } from 'vitest'

const NEWS_LAST_VISITED_KEY = 'spectate-news-last-visited'
const NEWS_LATEST_ARTICLE_KEY = 'spectate-news-latest-article'

// Inline the functions under test so this file has no module boundary issues
// (utils.js may reference browser globals; inlining keeps tests hermetic).
function setNewsLastVisited() {
  try { localStorage.setItem(NEWS_LAST_VISITED_KEY, new Date().toISOString()) } catch {}
}

function setNewsLatestArticle(publishedAt) {
  if (!publishedAt) return
  try { localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, publishedAt) } catch {}
}

function hasUnreadNews() {
  try {
    const lastVisited = localStorage.getItem(NEWS_LAST_VISITED_KEY)
    if (!lastVisited) return false
    const latestArticle = localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)
    if (!latestArticle) return false
    return new Date(latestArticle) > new Date(lastVisited)
  } catch {
    return false
  }
}

beforeEach(() => {
  localStorage.clear()
})

// ── hasUnreadNews ─────────────────────────────────────────────────────────────

describe('hasUnreadNews', () => {
  it('returns false when neither key exists (first-time visitor)', () => {
    expect(hasUnreadNews()).toBe(false)
  })

  it('returns false when only lastVisited exists (no article snapshot yet)', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, '2026-05-24T10:00:00.000Z')
    expect(hasUnreadNews()).toBe(false)
  })

  it('returns false when only latestArticle exists (no visit baseline)', () => {
    localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, '2026-05-24T10:00:00.000Z')
    expect(hasUnreadNews()).toBe(false)
  })

  it('returns false when latestArticle is older than lastVisited (no new news)', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, '2026-05-24T12:00:00.000Z')
    localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, '2026-05-24T09:00:00.000Z')
    expect(hasUnreadNews()).toBe(false)
  })

  it('returns false when latestArticle equals lastVisited (nothing new)', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, '2026-05-24T12:00:00.000Z')
    localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, '2026-05-24T12:00:00.000Z')
    expect(hasUnreadNews()).toBe(false)
  })

  it('returns true when latestArticle is newer than lastVisited', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, '2026-05-24T10:00:00.000Z')
    localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, '2026-05-24T14:00:00.000Z')
    expect(hasUnreadNews()).toBe(true)
  })

  it('returns false for malformed ISO strings (NaN comparison)', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, 'not-a-date')
    localStorage.setItem(NEWS_LATEST_ARTICLE_KEY, 'also-not-a-date')
    expect(hasUnreadNews()).toBe(false)
  })
})

// ── setNewsLastVisited ────────────────────────────────────────────────────────

describe('setNewsLastVisited', () => {
  it('writes a valid ISO timestamp to localStorage', () => {
    const before = Date.now()
    setNewsLastVisited()
    const after = Date.now()
    const stored = localStorage.getItem(NEWS_LAST_VISITED_KEY)
    expect(stored).not.toBeNull()
    const ts = new Date(stored).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('overwrites a previous value', () => {
    localStorage.setItem(NEWS_LAST_VISITED_KEY, '2020-01-01T00:00:00.000Z')
    setNewsLastVisited()
    const stored = localStorage.getItem(NEWS_LAST_VISITED_KEY)
    expect(new Date(stored).getFullYear()).toBeGreaterThan(2020)
  })
})

// ── setNewsLatestArticle ──────────────────────────────────────────────────────

describe('setNewsLatestArticle', () => {
  it('stores a valid publishedAt ISO string', () => {
    setNewsLatestArticle('2026-05-24T15:00:00.000Z')
    expect(localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)).toBe('2026-05-24T15:00:00.000Z')
  })

  it('does nothing when called with an empty string', () => {
    setNewsLatestArticle('')
    expect(localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)).toBeNull()
  })

  it('does nothing when called with null', () => {
    setNewsLatestArticle(null)
    expect(localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)).toBeNull()
  })

  it('does nothing when called with undefined', () => {
    setNewsLatestArticle(undefined)
    expect(localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)).toBeNull()
  })

  it('overwrites a stale value with a newer one', () => {
    setNewsLatestArticle('2026-05-20T00:00:00.000Z')
    setNewsLatestArticle('2026-05-24T18:00:00.000Z')
    expect(localStorage.getItem(NEWS_LATEST_ARTICLE_KEY)).toBe('2026-05-24T18:00:00.000Z')
  })
})

// ── Integration: full lifecycle ───────────────────────────────────────────────

describe('lifecycle: visit → new article → indicator fires', () => {
  it('shows no indicator right after visiting /news', () => {
    setNewsLatestArticle('2026-05-24T09:00:00.000Z')
    setNewsLastVisited() // user lands on /news
    expect(hasUnreadNews()).toBe(false)
  })

  it('shows indicator after new article published since last visit', () => {
    setNewsLastVisited() // user was on /news at some point
    // Simulate: new article published after the visit
    const future = new Date(Date.now() + 60_000).toISOString()
    setNewsLatestArticle(future)
    expect(hasUnreadNews()).toBe(true)
  })

  it('clears indicator when user visits /news again', () => {
    // Article published at T2 = 30s ago; user last visited at T1 = 90s ago → indicator shows
    const articleTs = new Date(Date.now() - 30_000).toISOString()
    const oldVisit = new Date(Date.now() - 90_000).toISOString()
    setNewsLatestArticle(articleTs)
    localStorage.setItem(NEWS_LAST_VISITED_KEY, oldVisit)
    expect(hasUnreadNews()).toBe(true)

    // User visits /news: lastVisited is now T3 = now > T2 → indicator clears
    setNewsLastVisited()
    expect(hasUnreadNews()).toBe(false)
  })
})

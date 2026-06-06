import { useState, useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import NewsCard, { NewsCardSkeleton } from '../components/NewsCard'
import { trackEvent, setNewsLastVisited, setNewsLatestArticle } from '../utils'

const PAGE_SIZE = 20

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'match-result', label: 'Results' },
  { id: 'roster', label: 'Rosters' },
  { id: 'tournament', label: 'Tournaments' },
  { id: 'patch', label: 'Patches' },
]

// Module-level session cache so navigating away and back skips the network fetch
let _cachedArticles = null

function getInitialCategory() {
  try {
    return new URLSearchParams(window.location.search).get('category') || 'all'
  } catch {
    return 'all'
  }
}

export default function NewsPage() {
  const [articles, setArticles] = useState(_cachedArticles)
  const [loading, setLoading] = useState(!_cachedArticles)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(getInitialCategory)
  const [shown, setShown] = useState(PAGE_SIZE)

  useEffect(() => {
    setNewsLastVisited()
    trackEvent('news_page_view', { filter_category: category })
  }, [])

  useEffect(() => {
    if (_cachedArticles) return
    fetch('/api/news?game=dota2&limit=60')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        _cachedArticles = data.articles || []
        const latest = _cachedArticles.reduce((max, a) => a.publishedAt > max ? a.publishedAt : max, '')
        setNewsLatestArticle(latest)
        setArticles(_cachedArticles)
        setLoading(false)
      })
      .catch(err => {
        console.error('[news] fetch error:', err)
        setError('News unavailable right now.')
        setLoading(false)
      })
  }, [])

  function retry() {
    _cachedArticles = null
    setError(null)
    setLoading(true)
    fetch('/api/news?game=dota2&limit=60')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        _cachedArticles = data.articles || []
        const latest = _cachedArticles.reduce((max, a) => a.publishedAt > max ? a.publishedAt : max, '')
        setNewsLatestArticle(latest)
        setArticles(_cachedArticles)
        setLoading(false)
      })
      .catch(err => {
        console.error('[news] fetch error:', err)
        setError('News unavailable right now.')
        setLoading(false)
      })
  }

  function handleCategoryChange(next) {
    const prev = category
    setCategory(next)
    setShown(PAGE_SIZE)
    try {
      const params = new URLSearchParams(window.location.search)
      if (next === 'all') {
        params.delete('category')
      } else {
        params.set('category', next)
      }
      const qs = params.toString()
      history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
    } catch {
      // Non-critical
    }
    trackEvent('news_filter_category', { from: prev, to: next })
  }

  function handleLoadMore() {
    const nextShown = shown + PAGE_SIZE
    trackEvent('news_load_more', { current_count: shown, loaded_to: nextShown })
    setShown(nextShown)
  }

  const filtered = (articles || []).filter(a => {
    if (category === 'all') return true
    return a.tags?.categories?.includes(category)
  })

  const visible = filtered.slice(0, shown)
  const hasMore = filtered.length > shown

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-4 flex-1 w-full pb-20 md:pb-8">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-widest text-gray-900 dark:text-white">
            News
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 uppercase tracking-widest">
            Dota 2 pro scene headlines
          </p>
        </div>

        {/* Top-level: News | Articles */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <a
            href="/news"
            aria-current="page"
            className="flex-shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 border-red-500 text-gray-900 dark:text-white -mb-px transition-colors"
          >
            News
          </a>
          <a
            href="/articles"
            className="flex-shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white -mb-px transition-colors"
          >
            Articles
          </a>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-none">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleCategoryChange(c.id)}
              className={`flex-shrink-0 px-3 py-2 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                category === c.id
                  ? 'border-sky-500 text-sky-500'
                  : 'border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <section>
          <div className="flex items-center mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-sky-500">
              Dota 2 News
            </h2>
          </div>

          {loading && (
            <div className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 divide-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <NewsCardSkeleton key={i} />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="py-10 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-4">
                {error}
              </p>
              <button
                onClick={retry}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wide border border-gray-300 dark:border-gray-700 rounded hover:border-gray-500 dark:hover:border-gray-500 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <p className="py-6 text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center">
              Nothing matched
            </p>
          )}

          {!loading && !error && visible.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800 overflow-hidden">
              {visible.map((article, i) => (
                <NewsCard key={article.id} article={article} position={i + 1} />
              ))}
            </div>
          )}

          {!loading && !error && hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wide border border-gray-300 dark:border-gray-700 rounded hover:border-gray-500 dark:hover:border-gray-500 transition-colors"
              >
                Load more
              </button>
            </div>
          )}

          <p className="mt-4 text-[10px] text-gray-400 dark:text-gray-700 uppercase tracking-widest text-center">
            Headlines sourced from Dota 2 Official, PCGamesN, and Dot Esports. We do not generate content.
          </p>
        </section>
      </main>

      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

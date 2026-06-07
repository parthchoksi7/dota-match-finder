import { useState, useEffect, useCallback } from 'react'
import { fetchHeroes, fetchHeroMatches } from '../api'
import { trackEvent } from '../utils'
import SiteHeader from '../components/SiteHeader.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import BottomTabBar from '../components/BottomTabBar.jsx'

const VALVE_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes'

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function matchUrl(row) {
  const parts = [slugify(row.radiant_name), 'vs', slugify(row.dire_name), slugify(row.league_name), row.match_id]
  return `/match/${parts.filter(Boolean).join('-')}`
}

function formatDate(unixSecs) {
  const d = new Date(unixSecs * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function MatchRow({ row }) {
  const winner = row.radiant_win ? row.radiant_name : row.dire_name
  const loser = row.radiant_win ? row.dire_name : row.radiant_name
  return (
    <a
      href={matchUrl(row)}
      onClick={() => trackEvent('hero_match_click', { match_id: row.match_id })}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-900 last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-display font-black text-sm text-gray-900 dark:text-white truncate">{winner}</span>
          <span className="text-xs text-gray-400 dark:text-gray-600 font-medium">def.</span>
          <span className="font-display font-bold text-sm text-gray-400 dark:text-gray-500 truncate">{loser}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] uppercase tracking-widest text-gray-500 dark:text-gray-500 truncate">
            {row.league_name}
          </span>
          <span className="text-gray-300 dark:text-gray-700 text-[11px]">·</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-600 tabular-nums flex-shrink-0">
            {formatDate(row.start_time)}
          </span>
        </div>
      </div>
      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex-shrink-0 whitespace-nowrap">
        Watch Replay →
      </span>
    </a>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-900 last:border-b-0">
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-[58%]" />
        <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-[42%]" />
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-20" />
    </div>
  )
}

export default function HeroPage() {
  const slug = window.location.pathname.replace(/^\/heroes\//, '').replace(/\/$/, '')

  const [hero, setHero] = useState(null)
  const [heroError, setHeroError] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  // Resolve slug → hero metadata from the hero cache.
  useEffect(() => {
    fetchHeroes().then(cache => {
      const entry = Object.entries(cache).find(([, h]) => h.key === slug)
      if (!entry) { setHeroError(true); setLoading(false); return }
      setHero({ id: Number(entry[0]), name: entry[1].name, key: entry[1].key })
    }).catch(() => { setHeroError(true); setLoading(false) })
  }, [slug])

  // Fetch initial page of matches once we have the hero id.
  useEffect(() => {
    if (!hero) return
    setLoading(true)
    fetchHeroMatches(hero.id)
      .then(data => {
        setRows(data.rows || [])
        setExhausted(data.exhausted ?? true)
        setCursor(data.cursor ?? null)
        trackEvent('hero_page_view', { hero_id: hero.id, hero_name: hero.name, result_count: (data.rows || []).length })
      })
      .catch(err => {
        console.error('[HeroPage] fetch error:', err)
        setFetchError('Match data unavailable. Try again in a moment.')
      })
      .finally(() => setLoading(false))
  }, [hero])

  const handleLoadMore = useCallback(async () => {
    if (!hero || loadingMore || exhausted || !cursor) return
    setLoadingMore(true)
    trackEvent('hero_result_load_more', { hero_id: hero.id, cursor })
    try {
      const data = await fetchHeroMatches(hero.id, cursor)
      setRows(prev => [...prev, ...(data.rows || [])])
      setExhausted(data.exhausted ?? true)
      setCursor(data.cursor ?? null)
    } catch (err) {
      console.error('[HeroPage] load more error:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [hero, loadingMore, exhausted, cursor])

  const portraitUrl = hero ? `${VALVE_CDN}/${hero.key}_horizontal.png` : null

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 pb-24 md:pb-8 pt-4">

        {/* Back link */}
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </a>

        {heroError ? (
          <div className="py-16 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">Hero not found</p>
            <a href="/" className="mt-4 inline-block text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 rounded px-3 py-1.5 transition-colors">
              Go home
            </a>
          </div>
        ) : (
          <>
            {/* Hero header */}
            <div className="mb-5 rounded border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-950">
              {portraitUrl && (
                <div className="w-full h-36 sm:h-44 bg-gray-900 overflow-hidden">
                  <img
                    src={portraitUrl}
                    alt={hero?.name || slug}
                    className="w-full h-full object-cover object-center"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                </div>
              )}
              <div className="px-4 py-3 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs font-bold uppercase tracking-[4px] text-red-500 mb-0.5">Hero</p>
                {hero ? (
                  <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-wide text-gray-900 dark:text-white">
                    {hero.name}
                  </h1>
                ) : (
                  <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-32" />
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Tier-1 professional picks · Data via OpenDota
                </p>
              </div>
            </div>

            {/* Match list */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
                Recent Picks
              </h2>
              {!loading && rows.length > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-500 tabular-nums">
                  {rows.length} match{rows.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>

            <div className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-950">
              {loading ? (
                Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              ) : fetchError ? (
                <div className="py-8 text-center px-4">
                  <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">{fetchError}</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-4 text-xs font-semibold border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 rounded px-3 py-1.5 text-gray-500 dark:text-gray-400 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="py-8 text-center px-4">
                  <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                    Not picked in any indexed tier-1 match
                  </p>
                </div>
              ) : (
                rows.map(row => <MatchRow key={row.match_id} row={row} />)
              )}
            </div>

            {/* Load more */}
            {!loading && !fetchError && !exhausted && cursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-red-500 rounded-full animate-spin" aria-hidden="true" />
                      Searching earlier matches...
                    </>
                  ) : 'Load more'}
                </button>
              </div>
            )}

            {!loading && !fetchError && exhausted && rows.length > 0 && (
              <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                All indexed tier-1 picks shown
              </p>
            )}
          </>
        )}
      </main>
      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

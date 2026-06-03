import { useEffect, useState } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { trackEvent } from '../utils'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const TOURNAMENT_LABELS = {
  'blast-slam-vii': 'BLAST Slam VII',
}

export default function ArticlesPage() {
  const params = new URLSearchParams(window.location.search)
  const tournamentFilter = params.get('tournament') || null
  const tournamentLabel = tournamentFilter ? (TOURNAMENT_LABELS[tournamentFilter] || tournamentFilter) : null

  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trackEvent('articles_page_view', { tournament: tournamentFilter || 'all' })
    const url = tournamentFilter
      ? `/api/pipeline?type=articles&tournament=${encodeURIComponent(tournamentFilter)}`
      : '/api/pipeline?type=articles'
    fetch(url)
      .then(r => r.json())
      .then(data => { setArticles(data.articles || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tournamentFilter])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full pb-20 md:pb-8">

        {/* Header */}
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-widest text-gray-900 dark:text-white">
            {tournamentLabel ? tournamentLabel : 'Articles'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 uppercase tracking-widest">
            {tournamentLabel
              ? 'Daily coverage · BLAST Slam VII · May 28 – Jun 7, 2026'
              : 'Tournament analysis and editorial coverage'}
          </p>
        </div>

        {/* Tournament hub context (shown when filtered) */}
        {tournamentFilter === 'blast-slam-vii' && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2">
              About this coverage
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              One article per day covering BLAST Slam VII — from the group stage storylines through the Copenhagen grand final on June 7.
              Teams: Falcons, Yandex, PARIVISION, Liquid, Spirit, LGD, OG, Tundra, BetBoom, HEROIC, Aurora, GLYPH.
              Prize pool: $1,000,000.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/tournament/10551"
                className="text-[11px] font-bold uppercase tracking-widest text-sky-500 hover:text-sky-400 transition-colors"
                onClick={() => trackEvent('articles_hub_tournament_link', { tournament: 'blast-slam-vii' })}
              >
                Tournament hub →
              </a>
            </div>
          </div>
        )}

        {/* Article list */}
        {loading ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-8 animate-pulse">
            Loading…
          </p>
        ) : articles.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest text-center py-8">
            No articles yet
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {articles.map(article => (
              <a
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-4 sm:p-5 hover:border-gray-400 dark:hover:border-gray-600 transition-colors group"
                onClick={() => trackEvent('article_list_click', { slug: article.slug, tournament: article.tournament })}
              >
                {/* Meta */}
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 rounded">
                    {article.category}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                    {formatDate(article.publishedAt)}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                    {article.readingTime} min
                  </span>
                </div>

                {/* Title */}
                <h2 className="font-display font-bold text-lg sm:text-xl text-gray-900 dark:text-white group-hover:text-sky-500 transition-colors leading-tight mb-1">
                  {article.title}
                </h2>

                {/* Subtitle */}
                {article.subtitle && (
                  <p className="text-sm text-gray-500 dark:text-gray-500 leading-snug mb-2">
                    {article.subtitle}
                  </p>
                )}

                {/* Excerpt */}
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
                  {article.excerpt}
                </p>

                {/* Read more */}
                <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-sky-500">
                  Read →
                </p>
              </a>
            ))}
          </div>
        )}

        {/* All-articles view: tournament section headers */}
        {!tournamentFilter && articles.length > 0 && (
          <div className="text-center">
            <a
              href="/articles?tournament=blast-slam-vii"
              className="text-xs font-bold uppercase tracking-widest text-sky-500 hover:text-sky-400 transition-colors"
            >
              All BLAST Slam VII coverage →
            </a>
          </div>
        )}

      </main>

      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

import { useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { ARTICLES_MAP, getArticlesByTournament } from '../data/articles'
import { trackEvent } from '../utils'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function ArticleSection({ section }) {
  if (section.type === 'heading') {
    return (
      <h2 className="font-display font-bold text-xl sm:text-2xl text-gray-900 dark:text-white mt-10 mb-3 leading-tight">
        {section.text}
      </h2>
    )
  }
  if (section.type === 'subheading') {
    return (
      <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white mt-7 mb-2 leading-tight">
        {section.text}
      </h3>
    )
  }
  return (
    <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-5">
      {section.text}
    </p>
  )
}

export default function ArticlePage() {
  const slug = window.location.pathname.replace('/articles/', '').split('/')[0]
  const article = ARTICLES_MAP[slug]

  useEffect(() => {
    if (article) {
      trackEvent('article_view', {
        slug: article.slug,
        tournament: article.tournament,
        category: article.category,
      })
    }
  }, [article?.slug])

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
        <SiteHeader />
        <main className="max-w-3xl mx-auto px-4 py-16 flex-1 w-full text-center">
          <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
            Article not found
          </p>
          <a
            href="/articles"
            className="mt-6 inline-block text-xs font-bold uppercase tracking-widest text-sky-500 hover:text-sky-400"
          >
            Back to articles
          </a>
        </main>
        <SiteFooter />
        <BottomTabBar />
      </div>
    )
  }

  const related = getArticlesByTournament(article.tournament).filter(
    a => a.slug !== article.slug
  )

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10 flex flex-col flex-1 w-full pb-20 md:pb-10">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-6">
          <a href="/articles" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Articles
          </a>
          <span>/</span>
          <a
            href={`/articles?tournament=${article.tournament}`}
            className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
          >
            {article.tournamentLabel}
          </a>
        </nav>

        {/* Article header */}
        <article>
          <header className="mb-8">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 rounded">
                {article.category}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                {formatDate(article.publishedAt)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                {article.readingTime} min read
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display font-black text-3xl sm:text-4xl leading-tight text-gray-900 dark:text-white mb-3">
              {article.title}
            </h1>

            {/* Subtitle */}
            {article.subtitle && (
              <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 leading-snug font-semibold">
                {article.subtitle}
              </p>
            )}

            {/* Divider */}
            <div className="mt-6 border-t border-gray-200 dark:border-gray-800" />
          </header>

          {/* Article body */}
          <div className="mt-6">
            {article.sections.map((section, i) => (
              <ArticleSection key={i} section={section} />
            ))}
          </div>

          {/* Footer CTA */}
          <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-3">
              Watch their matches
            </p>
            <a
              href="/?q=yandex"
              onClick={() => trackEvent('article_watch_cta', { slug: article.slug })}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Find Yandex VODs on Spectate
            </a>
          </div>
        </article>

        {/* Related articles */}
        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-4 pl-2 border-l-2 border-sky-500">
              More from {article.tournamentLabel}
            </h2>
            <div className="flex flex-col gap-3">
              {related.map(a => (
                <a
                  key={a.slug}
                  href={`/articles/${a.slug}`}
                  className="block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-4 hover:border-gray-400 dark:hover:border-gray-600 transition-colors group"
                  onClick={() => trackEvent('article_related_click', { from: article.slug, to: a.slug })}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                      {formatDate(a.publishedAt)}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">
                      {a.category}
                    </span>
                  </div>
                  <p className="font-display font-bold text-base text-gray-900 dark:text-white group-hover:text-sky-500 transition-colors leading-tight">
                    {a.title}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 leading-snug">
                    {a.excerpt}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

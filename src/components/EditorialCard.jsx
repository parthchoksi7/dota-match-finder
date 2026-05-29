import { ARTICLES } from '../data/articles'
import { trackEvent } from '../utils'

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

export default function EditorialCard() {
  const today = new Date().toDateString()

  // Only surface articles published in the last 14 days
  const recent = ARTICLES.filter(
    a => Date.now() - new Date(a.publishedAt).getTime() < TWO_WEEKS_MS
  )
  if (recent.length === 0) return null

  const featured = recent[0] // ARTICLES is newest-first
  const tournamentArticles = recent.filter(a => a.tournament === featured.tournament)
  const extraCount = tournamentArticles.length - 1

  const isToday = new Date(featured.publishedAt).toDateString() === today
  const label = isToday ? 'Today\'s Story' : 'Latest Story'

  const meta = [
    featured.tournamentLabel,
    featured.category,
    `${featured.readingTime} min`,
  ].join(' · ')

  return (
    <a
      href={`/articles/${featured.slug}`}
      aria-label={`Read article: ${featured.title}`}
      onClick={() => trackEvent('article_card_click', { slug: featured.slug, source: 'homepage_editorial_card' })}
      className="block rounded border border-gray-200 dark:border-gray-800 bg-sky-50 dark:bg-sky-950/20 hover:border-sky-300 dark:hover:border-sky-800 transition-colors"
    >
      <div className="px-4 pt-3 pb-1">
        {/* Editorial label */}
        <p className="text-[10px] font-black uppercase tracking-[4px] text-sky-500 mb-2">
          {label}
        </p>
        <div className="border-t border-sky-100 dark:border-sky-900/60 mb-3" />

        {/* Meta */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
          {meta}
        </p>

        {/* Title */}
        <h2 className="font-display font-black text-lg leading-tight text-gray-900 dark:text-white line-clamp-2 mb-1">
          {featured.title}
        </h2>

        {/* Subtitle */}
        {featured.subtitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mb-2">
            {featured.subtitle}
          </p>
        )}

        {/* Read CTA */}
        <p className="text-sm font-semibold text-sky-500 pb-3">
          Read →
        </p>
      </div>

      {/* Footer — only when multiple articles from same tournament */}
      {extraCount > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2 border-t border-sky-100 dark:border-sky-900/60"
          onClick={e => {
            e.preventDefault()
            trackEvent('article_card_view_all_click', { tournament: featured.tournament })
            window.location.href = `/articles?tournament=${featured.tournament}`
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            {extraCount} more {extraCount === 1 ? 'article' : 'articles'} this tournament
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-sky-500">
            View all →
          </span>
        </div>
      )}
    </a>
  )
}

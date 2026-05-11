import { trackEvent } from '../utils'

function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function NewsCard({ article, position }) {
  function handleClick() {
    trackEvent('news_article_click', {
      source_id: article.source.id,
      category: article.tags.categories[0] || 'general',
      has_entity: article.tags.entities.length > 0,
      position,
    })
  }

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={handleClick}
      className="flex flex-col gap-1.5 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-900 transition-colors"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-500">
        {article.source.name} <span aria-hidden="true">·</span> {timeAgo(article.publishedAt)}
      </p>
      <h3 className="font-display font-bold text-sm leading-snug text-gray-900 dark:text-white line-clamp-2">
        {article.title}
      </h3>
      {article.excerpt && (
        <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-2 leading-relaxed">
          {article.excerpt}
        </p>
      )}
      {article.tags.entities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {article.tags.entities.slice(0, 3).map(entity => (
            <span
              key={entity}
              className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500"
            >
              {entity}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}

export function NewsCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-900">
      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-28" />
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-4/5" />
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-3/5" />
      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-2/3" />
    </div>
  )
}

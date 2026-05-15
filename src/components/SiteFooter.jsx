/**
 * Shared site footer. Hosts About and What's New links (moved from header)
 * plus the existing brand line.
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 px-4 py-6 text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 flex flex-col items-center gap-3">
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <a href="/about" className="hover:text-gray-900 dark:hover:text-white transition-colors">About</a>
        <span aria-hidden="true">·</span>
        <a href="/release-notes" className="hover:text-gray-900 dark:hover:text-white transition-colors">What's New</a>
      </div>
      <p className="text-center">Spectate Esports · Data via OpenDota, PandaScore &amp; Twitch · Updates every few minutes</p>
    </footer>
  )
}

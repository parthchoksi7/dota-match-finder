import { useState, useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import TournamentCard from '../components/TournamentCard'
import { track } from '@vercel/analytics'

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, props)
  }
}

function SkeletonCard() {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded p-4 bg-white dark:bg-gray-900 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
        </div>
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>
      <div className="flex gap-3">
        <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded w-24" />
        <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded w-16" />
      </div>
    </div>
  )
}

export default function Tournaments() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    trackEvent('tournament_list_view', {})
    fetch('/api/tournaments?mode=series')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError('Tournament data is temporarily unavailable. Check back shortly.')
        setLoading(false)
        console.error('Tournaments fetch error:', err)
      })
  }, [])

  const live = data?.live || []
  const upcoming = data?.upcoming || []
  const completed = data?.completed || []

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col">
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-widest text-gray-900 dark:text-white">
            Tournaments
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 uppercase tracking-widest">
            Tier 1 Dota 2 events
          </p>
        </div>

        {error && (
          <div className="border border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded px-4 py-4 text-center">
            <p className="text-red-600 dark:text-red-400 text-xs uppercase tracking-widest">
              {error}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && !error && (
          <>
            {live.length > 0 && (
              <section>
                <div className="flex items-center mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-red-500 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Live Now
                  </h2>
                </div>
                <div className="flex flex-col gap-3">
                  {live.map(t => <TournamentCard key={t.id} tournament={t} />)}
                </div>
              </section>
            )}

            {(upcoming.length > 0 || live.length === 0) && (
              <section>
                <div className="flex items-center mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-blue-500">
                    Upcoming
                  </h2>
                </div>
                {upcoming.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {upcoming.map(t => <TournamentCard key={t.id} tournament={t} />)}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest py-3 pl-2">
                    Between events — check back soon
                  </p>
                )}
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <div className="flex items-center mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 pl-2 border-l-2 border-emerald-500">
                    Recently Completed
                  </h2>
                </div>
                <div className="flex flex-col gap-3">
                  {completed.map(t => <TournamentCard key={t.id} tournament={t} />)}
                </div>
              </section>
            )}

            {live.length === 0 && upcoming.length === 0 && completed.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
                  No Tier 1 tournaments found.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-gray-200 dark:border-gray-800/80 px-4 sm:px-6 py-4 text-center">
        <p className="text-gray-500 dark:text-gray-600 text-xs uppercase tracking-widest flex flex-col sm:flex-row sm:justify-center sm:gap-1 items-center">
          <span>Spectate Esports</span>
          <span className="hidden sm:inline"> · </span>
          <a href="/" className="hover:text-gray-300 transition-colors">Home</a>
          <span className="hidden sm:inline"> · </span>
          <a href="/about" className="hover:text-gray-300 transition-colors">About</a>
        </p>
      </footer>
    </div>
  )
}

import { useState, useEffect, useRef } from "react"

const TIER1_KEYWORDS = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters'
]

function cleanTournamentName(name) {
  return name
    .replace(/\s*—\s*.+$/, '')
    .replace(/\s+\d{4}$/, '')
    .trim()
}

function TournamentHub() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [xLoaded, setXLoaded] = useState(false)
  const [xFailed, setXFailed] = useState(false)
  const twitterRef = useRef(null)
  const scriptRef = useRef(null)

  useEffect(() => {
    fetchTournaments()
  }, [])

  async function fetchTournaments() {
    try {
      const res = await fetch('/api/tournaments')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const activeTournament = (() => {
    if (!data) return null
    if (data.ongoing && data.ongoing.length > 0) return { ...data.ongoing[0], mode: 'ongoing' }
    if (data.upcoming && data.upcoming.length > 0) return { ...data.upcoming[0], mode: 'upcoming' }
    return null
  })()

  useEffect(() => {
    if (!activeTournament?.xHandle || !twitterRef.current) return
    setXLoaded(false)
    setXFailed(false)
    if (twitterRef.current) twitterRef.current.innerHTML = ''

    const timeout = setTimeout(() => setXFailed(true), 5000)

    function renderTimeline() {
      window.twttr?.widgets?.createTimeline(
        { sourceType: 'profile', screenName: activeTournament.xHandle },
        twitterRef.current,
        {
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          chrome: 'noheader nofooter noborders',
          tweetLimit: 5,
          width: '100%',
        }
      ).then((el) => {
        clearTimeout(timeout)
        if (el) setXLoaded(true)
        else setXFailed(true)
      }).catch(() => {
        clearTimeout(timeout)
        setXFailed(true)
      })
    }

    if (window.twttr) {
      renderTimeline()
    } else {
      const script = document.createElement('script')
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      script.charset = 'utf-8'
      script.onload = renderTimeline
      script.onerror = () => { clearTimeout(timeout); setXFailed(true) }
      scriptRef.current = script
      document.head.appendChild(script)
    }

    return () => clearTimeout(timeout)
  }, [activeTournament?.xHandle])

  if (loading) return (
    <section className="border border-gray-200 dark:border-gray-800 rounded p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-900/30 animate-pulse">
      <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
      <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
      <div className="h-3 w-36 bg-gray-200 dark:bg-gray-800 rounded" />
    </section>
  )

  if (error || !activeTournament) return null

  const isOngoing = activeTournament.mode === 'ongoing'

  const startDate = activeTournament.startdate
    ? new Date(activeTournament.startdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const endDate = activeTournament.enddate
    ? new Date(activeTournament.enddate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : endDate || startDate || null

  return (
    <section
      className="border border-gray-200 dark:border-gray-800 rounded bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden"
      aria-labelledby="tournament-hub-heading"
    >
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <h2
          id="tournament-hub-heading"
          className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold mb-2"
        >
          {isOngoing ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live Tournament
            </span>
          ) : 'Upcoming Tournament'}
        </h2>

        <p className="font-display text-xl sm:text-2xl font-black uppercase tracking-wide text-gray-900 dark:text-white leading-tight">
          {cleanTournamentName(activeTournament.name)}
        </p>

        {dateRange && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 uppercase tracking-widest">
            {dateRange}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <a
            href={activeTournament.liquipediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            Liquipedia
            <span className="text-gray-400" aria-hidden>↗</span>
          </a>
          {activeTournament.xHandle && activeTournament.xHandle !== 'dota2' && (
            <a
              href={`https://x.com/${activeTournament.xHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            >
              @{activeTournament.xHandle}
              <span className="text-gray-400" aria-hidden>↗</span>
            </a>
          )}
        </div>
      </div>

      {!isOngoing && data?.upcoming?.length > 1 && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 sm:px-5 py-3">
          <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
            Also coming up
          </p>
          <div className="flex flex-col gap-1.5">
            {data.upcoming.slice(1, 4).map((t, i) => {
              const tStart = t.startdate
                ? new Date(t.startdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null
              return (
                <a
                  key={i}
                  href={t.liquipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
                >
                  <span className="truncate group-hover:underline">{cleanTournamentName(t.name)}</span>
                  {tStart && (
                    <span className="text-gray-400 dark:text-gray-600 shrink-0 ml-3 tabular-nums">{tStart}</span>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {activeTournament.xHandle && !xFailed && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          <div className="px-4 sm:px-5 pt-3 pb-1 flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500 font-semibold">
              Latest updates
            </p>
            {!xLoaded && (
              <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest animate-pulse">
                Loading feed...
              </span>
            )}
          </div>
          <div
            ref={twitterRef}
            className={`px-2 pb-2 transition-opacity ${xLoaded ? 'opacity-100' : 'opacity-0 h-0'}`}
            aria-label={`Latest tweets from @${activeTournament.xHandle}`}
          />
        </div>
      )}
    </section>
  )
}

export default TournamentHub

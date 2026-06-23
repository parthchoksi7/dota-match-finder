import { useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { TIER1_PLAYERS, TIER1_PLAYERS_MAP } from '../data/players'
import { trackEvent } from '../utils'

const NATIONALITY_NAMES = {
  AT: 'Austria', AU: 'Australia', BG: 'Bulgaria', CA: 'Canada', DK: 'Denmark',
  DE: 'Germany', EE: 'Estonia', FI: 'Finland', FR: 'France',
  IL: 'Israel', JO: 'Jordan', MK: 'North Macedonia', PK: 'Pakistan',
  RU: 'Russia', SE: 'Sweden', SG: 'Singapore', UA: 'Ukraine', US: 'United States',
}

// TI winners first (by most recent win), then alphabetical by name
const SORTED_PLAYERS = [...TIER1_PLAYERS].sort((a, b) => {
  const aRecent = a.tiWins.length ? Math.max(...a.tiWins) : 0
  const bRecent = b.tiWins.length ? Math.max(...b.tiWins) : 0
  if (aRecent !== bRecent) return bRecent - aRecent
  return a.name.localeCompare(b.name)
})

function PlayersPage() {
  const path = window.location.pathname
  const isDetail = path.startsWith('/players/') && path.length > '/players/'.length
  const playerId = isDetail ? path.replace('/players/', '').split('/')[0] : null
  const player = playerId ? TIER1_PLAYERS_MAP[playerId] : null

  if (isDetail && !player) {
    window.location.replace('/players')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col font-mono">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full pb-20 md:pb-12">
        {isDetail ? <PlayerDetail player={player} /> : <PlayersIndex />}
      </main>
      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

function PlayersIndex() {
  useEffect(() => { trackEvent('players_index_view', {}) }, [])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">Dota 2</p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">Pro Players</h1>
      <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-600 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        Tier 1 professionals · TI champions and legends
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SORTED_PLAYERS.map(p => (
          <a
            key={p.id}
            href={`/players/${p.id}`}
            onClick={() => trackEvent('players_card_click', { player: p.id, role: p.role })}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 rounded hover:border-red-500 dark:hover:border-red-500 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs font-bold uppercase tracking-[3px] text-gray-900 dark:text-white group-hover:text-red-500 transition-colors leading-snug">
                {p.name}
              </p>
              {p.tiWins.length > 0 && (
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  {p.tiWins.length === 1 ? `TI ${p.tiWins[0]}` : `${p.tiWins.length}× TI`}
                </span>
              )}
            </div>
            <p className="text-[10px] uppercase tracking-[2px] text-gray-400 dark:text-gray-600 mb-1.5">
              {p.role} · {NATIONALITY_NAMES[p.nationality] || p.nationality}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed line-clamp-2">{p.knownFor}</p>
          </a>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-12 pt-12 border-t border-gray-200 dark:border-gray-800">
        Current rosters change frequently. For active lineups, see{' '}
        <a
          href="https://liquipedia.net/dota2/Portal:Players"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
        >
          Liquipedia
        </a>.
      </p>
    </>
  )
}

function PlayerDetail({ player }) {
  useEffect(() => { trackEvent('players_detail_view', { player: player.id, role: player.role }) }, [player.id])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">
        <a href="/players" className="hover:text-red-400 transition-colors">Pro Players</a>
      </p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">{player.name}</h1>

      <div className="flex flex-wrap items-center gap-2 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        <span className="text-[10px] font-bold uppercase tracking-[3px] text-gray-400 dark:text-gray-600">
          {player.role}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[3px] text-gray-400 dark:text-gray-600">
          {NATIONALITY_NAMES[player.nationality] || player.nationality}
        </span>
        {player.tiWins.map(year => (
          <span key={year} className="text-[10px] font-bold uppercase tracking-[3px] px-2 py-0.5 border border-amber-300 dark:border-amber-700/50 rounded-sm text-amber-600 dark:text-amber-400">
            TI {year}
          </span>
        ))}
      </div>

      {player.tiWins.length > 0 && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-4">The International</p>
          <div className="flex flex-wrap gap-2">
            {player.tiWins.map(year => (
              <div key={year} className="text-center px-4 py-3 border border-amber-300 dark:border-amber-700/50 rounded">
                <p className="text-xl font-black text-amber-600 dark:text-amber-400">{year}</p>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-500 mt-0.5">Champion</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <p className="text-xs uppercase tracking-[4px] text-red-500 mb-4">Career</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{player.knownFor}</p>
      </section>

      <section className="mb-12 p-4 border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900/40">
        <p className="text-xs font-bold uppercase tracking-[3px] text-gray-500 dark:text-gray-500 mb-2">Current Status</p>
        <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed mb-3">
          Player team affiliations change frequently. This page covers career history only.
        </p>
        <a
          href={player.liquipedia}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('players_liquipedia_click', { player: player.id })}
          className="text-xs font-bold uppercase tracking-[2px] text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-500 transition-colors"
        >
          View on Liquipedia →
        </a>
      </section>
    </>
  )
}

export default PlayersPage

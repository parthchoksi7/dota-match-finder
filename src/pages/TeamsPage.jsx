import { useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { TIER1_TEAMS, TIER1_TEAMS_MAP, REGION_LABELS } from '../data/teams'
import { trackEvent } from '../utils'

const REGION_ORDER = ['WEU', 'EEU', 'CN', 'SEA', 'NA', 'SA']

function TeamsPage() {
  const path = window.location.pathname
  const isDetail = path.startsWith('/teams/') && path.length > '/teams/'.length
  const teamId = isDetail ? path.replace('/teams/', '').split('/')[0] : null
  const team = teamId ? TIER1_TEAMS_MAP[teamId] : null

  if (isDetail && !team) {
    window.location.replace('/teams')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col font-mono">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full pb-20 md:pb-12">
        {isDetail ? <TeamDetail team={team} /> : <TeamsIndex />}
      </main>
      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

function TeamsIndex() {
  useEffect(() => { trackEvent('teams_index_view', {}) }, [])

  const byRegion = REGION_ORDER.reduce((acc, region) => {
    const teams = TIER1_TEAMS.filter(t => t.region === region)
    if (teams.length > 0) acc.push({ region, teams })
    return acc
  }, [])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">Dota 2</p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">Pro Teams</h1>
      <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-600 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        Tier 1 organizations · History, region, and TI record
      </p>

      <div className="space-y-10">
        {byRegion.map(({ region, teams }) => (
          <div key={region}>
            <p className="text-xs font-bold uppercase tracking-[4px] text-gray-500 dark:text-gray-500 mb-3 pl-2 border-l-2 border-gray-400 dark:border-gray-600">
              {REGION_LABELS[region] || region}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teams.map(t => (
                <a
                  key={t.id}
                  href={`/teams/${t.id}`}
                  onClick={() => trackEvent('teams_card_click', { team: t.id, region: t.region })}
                  className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 rounded hover:border-red-500 dark:hover:border-red-500 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs font-bold uppercase tracking-[3px] text-gray-900 dark:text-white group-hover:text-red-500 transition-colors leading-snug">
                      {t.name}
                    </p>
                    {t.tiWins.length > 0 && (
                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        {t.tiWins.length === 1 ? `TI ${t.tiWins[0]}` : `${t.tiWins.length}× TI`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">{t.shortDesc}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-12 pt-12 border-t border-gray-200 dark:border-gray-800">
        Roster data changes frequently. For current player lineups, see{' '}
        <a
          href="https://liquipedia.net/dota2/Portal:Teams"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
        >
          Liquipedia
        </a>
        .
      </p>
    </>
  )
}

function TeamDetail({ team }) {
  useEffect(() => { trackEvent('teams_detail_view', { team: team.id, region: team.region }) }, [team.id])

  return (
    <>
      <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">
        <a href="/teams" className="hover:text-red-400 transition-colors">Pro Teams</a>
      </p>
      <h1 className="text-3xl font-black uppercase tracking-wide mb-2">{team.name}</h1>

      <div className="flex flex-wrap items-center gap-2 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
        <span className="text-[10px] font-bold uppercase tracking-[3px] px-2 py-0.5 border border-gray-300 dark:border-gray-700 rounded-sm text-gray-500 dark:text-gray-400">
          {REGION_LABELS[team.region] || team.region}
        </span>
        {team.basedIn && (
          <span className="text-[10px] font-bold uppercase tracking-[3px] text-gray-400 dark:text-gray-600">
            {team.basedIn}
          </span>
        )}
        {team.tiWins.length > 0 && team.tiWins.map(year => (
          <span key={year} className="text-[10px] font-bold uppercase tracking-[3px] px-2 py-0.5 border border-amber-300 dark:border-amber-700/50 rounded-sm text-amber-600 dark:text-amber-400">
            TI {year}
          </span>
        ))}
      </div>

      {team.tiWins.length > 0 && (
        <section className="mb-10">
          <p className="text-xs uppercase tracking-[4px] text-red-500 mb-4">The International</p>
          <div className="flex flex-wrap gap-2">
            {team.tiWins.map(year => (
              <div key={year} className="text-center px-4 py-3 border border-amber-300 dark:border-amber-700/50 rounded">
                <p className="text-xl font-black text-amber-600 dark:text-amber-400">{year}</p>
                <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-500 mt-0.5">Champion</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <p className="text-xs uppercase tracking-[4px] text-red-500 mb-4">About</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{team.about}</p>
      </section>

      <section className="mb-12 p-4 border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900/40">
        <p className="text-xs font-bold uppercase tracking-[3px] text-gray-500 dark:text-gray-500 mb-2">Current Roster</p>
        <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed mb-3">
          Player rosters change frequently. This page covers organization history only.
        </p>
        <a
          href={team.liquipedia}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('teams_liquipedia_click', { team: team.id })}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[3px] text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
        >
          View on Liquipedia →
        </a>
      </section>

      <div className="pt-12 border-t border-gray-200 dark:border-gray-800">
        <a href="/teams" className="text-xs uppercase tracking-[4px] text-gray-500 hover:text-red-500 transition-colors">
          ← All Teams
        </a>
      </div>
    </>
  )
}

export default TeamsPage

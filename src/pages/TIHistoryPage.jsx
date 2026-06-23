import { useEffect } from 'react'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import BottomTabBar from '../components/BottomTabBar'
import { trackEvent } from '../utils'

// Sources: Liquipedia https://liquipedia.net/dota2/The_International
// ✓ SAFE — immutable historical record. Add new row after each TI concludes.
const TI_EDITIONS = [
  { edition: 1, year: 2011, location: 'Cologne, Germany', champion: 'Natus Vincere', runnerUp: 'EHOME', prizePool: '$1.6M' },
  { edition: 2, year: 2012, location: 'Seattle, USA', champion: 'Invictus Gaming', runnerUp: 'Natus Vincere', prizePool: '$1.6M' },
  { edition: 3, year: 2013, location: 'Seattle, USA', champion: 'Alliance', runnerUp: 'Natus Vincere', prizePool: '$2.87M' },
  { edition: 4, year: 2014, location: 'Seattle, USA', champion: 'Newbee', runnerUp: 'Vici Gaming', prizePool: '$10.93M' },
  { edition: 5, year: 2015, location: 'Seattle, USA', champion: 'Evil Geniuses', runnerUp: 'CDEC Gaming', prizePool: '$18.43M' },
  { edition: 6, year: 2016, location: 'Seattle, USA', champion: 'Wings Gaming', runnerUp: 'Digital Chaos', prizePool: '$20.77M' },
  { edition: 7, year: 2017, location: 'Seattle, USA', champion: 'Team Liquid', runnerUp: 'Newbee', prizePool: '$24.79M' },
  { edition: 8, year: 2018, location: 'Vancouver, Canada', champion: 'OG', runnerUp: 'PSG.LGD', prizePool: '$25.53M' },
  { edition: 9, year: 2019, location: 'Shanghai, China', champion: 'OG', runnerUp: 'Team Liquid', prizePool: '$34.33M' },
  { edition: 10, year: 2021, location: 'Bucharest, Romania', champion: 'Team Spirit', runnerUp: 'PSG.LGD', prizePool: '$40.02M' },
  { edition: 11, year: 2022, location: 'Singapore', champion: 'Tundra Esports', runnerUp: 'Team Secret', prizePool: '$18.86M' },
  { edition: 12, year: 2023, location: 'Seattle, USA', champion: 'Team Spirit', runnerUp: 'Gaimin Gladiators', prizePool: '$3.32M' },
  { edition: 13, year: 2024, location: 'Copenhagen, Denmark', champion: 'Team Liquid', runnerUp: null, prizePool: null },
  { edition: 14, year: 2025, location: null, champion: 'Team Falcons', runnerUp: 'Xtreme Gaming', prizePool: null },
]

function TIHistoryPage() {
  useEffect(() => { trackEvent('ti_history_view', {}) }, [])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col font-mono">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full pb-20 md:pb-12">
        <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">
          <a href="/tournaments" className="hover:text-red-400 transition-colors">Tournaments</a>
        </p>
        <h1 className="text-3xl font-black uppercase tracking-wide mb-2">The International</h1>
        <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-600 mb-4">
          Dota 2 World Championship · 2011–Present
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
          The International (TI) is Valve's annual Dota 2 world championship and the largest prize pool tournament in esports history. First held in 2011 at Gamescom in Cologne, Germany. From TI4 onwards, prize pools are crowd-funded through the Compendium/Battle Pass system, reaching a peak of $40.02M at TI10 in 2021.
        </p>

        <div className="space-y-2">
          {[...TI_EDITIONS].reverse().map(ti => (
            <div
              key={ti.edition}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 rounded"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[3px] text-red-500">TI{ti.edition}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[3px] text-gray-400 dark:text-gray-600">{ti.year}</span>
                    {ti.location && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-600">{ti.location}</span>
                    )}
                  </div>
                  <p className="text-sm font-black uppercase tracking-[2px] text-amber-600 dark:text-amber-400 mb-0.5">
                    {ti.champion}
                  </p>
                  {ti.runnerUp && (
                    <p className="text-xs text-gray-500 dark:text-gray-600">Runner-up: {ti.runnerUp}</p>
                  )}
                </div>
                {ti.prizePool && (
                  <span className="flex-shrink-0 text-xs font-bold text-gray-400 dark:text-gray-600 text-right">
                    {ti.prizePool}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-600 mt-12 pt-12 border-t border-gray-200 dark:border-gray-800">
          Data via{' '}
          <a
            href="https://liquipedia.net/dota2/The_International"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
          >
            Liquipedia
          </a>.
          {' '}TI10 (2021) was held in 2021, delayed from 2020 due to COVID-19. No TI was held in 2020.
        </p>
      </main>
      <SiteFooter />
      <BottomTabBar />
    </div>
  )
}

export default TIHistoryPage

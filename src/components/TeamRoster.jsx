import { useState } from 'react'
import { getRegion, getRegionColor } from '../utils/regions'
import { trackEvent } from '../utils'

function getFlagEmoji(nationality) {
  if (!nationality) return null
  const code = nationality.toUpperCase()
  if (code.length !== 2) return null
  // Convert ISO 3166-1 alpha-2 to regional indicator symbols
  const offset = 0x1F1E6 - 65
  const chars = [...code].map(c => String.fromCodePoint(c.charCodeAt(0) + offset))
  return chars.join('')
}

function TeamLogo({ team }) {
  const [imgError, setImgError] = useState(false)

  if (team.imageUrl && !imgError) {
    return (
      <img
        src={team.imageUrl}
        alt={team.name}
        className="w-8 h-8 object-contain rounded flex-shrink-0"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
        {(team.acronym || team.name || '?').slice(0, 3)}
      </span>
    </div>
  )
}

export default function TeamRoster({ team, tournamentName, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const region = getRegion(team.location)
  const regionColor = getRegionColor(region)

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next) {
      trackEvent('tournament_team_click', {
        team_name: team.name,
        tournament_name: tournamentName,
      })
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left min-h-[44px]"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <TeamLogo team={team} />
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm uppercase tracking-wide text-gray-900 dark:text-white truncate">
            {team.name}
          </p>
          {team.location && (
            <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
              {team.location}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {region !== 'Other' && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${regionColor}`}>
              {region}
            </span>
          )}
          {team.qualified && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500">
              {team.qualified === 'qualified' ? 'Qual' : 'Invited'}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-150 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          {team.players && team.players.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {team.players.map((player, i) => {
                const flag = getFlagEmoji(player.nationality)
                return (
                  <div key={player.id || i} className="flex items-center gap-3 px-4 py-2">
                    {flag && (
                      <span className="text-sm flex-shrink-0" title={player.nationality}>
                        {flag}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {player.name || player.firstName || 'Unknown'}
                      </p>
                      {(player.firstName || player.lastName) && player.name && (
                        <p className="text-xs text-gray-400 dark:text-gray-600 truncate">
                          {[player.firstName, player.lastName].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </div>
                    {player.role && (
                      <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest flex-shrink-0">
                        {player.role}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-600 uppercase tracking-widest">
              Roster unavailable
            </p>
          )}
        </div>
      )}
    </div>
  )
}

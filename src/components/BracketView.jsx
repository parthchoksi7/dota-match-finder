// Shared bracket visualization components used by TournamentHub and TournamentDetail.

export function formatScheduledTime(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = d - now
  const diffH = diffMs / 3600000
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzShort = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: tz })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || ''
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })

  if (diffH < 0) return 'Soon'
  if (diffH < 1) return `In ${Math.round(diffMs / 60000)}m`
  if (diffH < 24) return `${timeStr} ${tzShort}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }) + ` · ${timeStr} ${tzShort}`
}

const CARD_H = 66
const CARD_W = 164
const H_GAP  = 28
const V_GAP  = 10
const LABEL_H = 20

function MatchCard({ match }) {
  const isLive = match.status === 'running'
  const isDone = match.status === 'finished'
  const isTbd  = match.teamA === 'TBD' && match.teamB === 'TBD'
  const hasScore = match.scoreA !== null && match.scoreB !== null
  const winA = isDone && hasScore && match.scoreA > match.scoreB
  const winB = isDone && hasScore && match.scoreB > match.scoreA

  const rows = [
    { name: match.teamA, score: match.scoreA, win: winA, dim: isDone && hasScore && !winA && match.teamA !== 'TBD' },
    { name: match.teamB, score: match.scoreB, win: winB, dim: isDone && hasScore && !winB && match.teamB !== 'TBD' },
  ]

  return (
    <div className={`w-full h-full rounded border flex flex-col overflow-hidden ${
      isLive  ? 'border-red-500/80 bg-red-500/5' :
      isTbd   ? 'border-gray-200 dark:border-gray-800 opacity-60' :
                'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950'
    }`}>
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex-1 flex items-center justify-between px-2 gap-1 min-w-0 ${
            i === 0 ? 'border-b border-gray-100 dark:border-gray-800' : ''
          } ${row.dim ? 'opacity-40' : ''}`}
        >
          {isLive && i === 0 && (
            <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0 mr-0.5" />
          )}
          <span className="flex-1 truncate text-xs font-semibold leading-tight text-gray-900 dark:text-white">
            {row.name === 'TBD' ? '' : row.name}
          </span>
          {hasScore && (
            <span className={`text-xs font-bold tabular-nums flex-shrink-0 ml-1 ${
              row.win ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
            }`}>
              {row.score}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function BracketSection({ label, rounds }) {
  if (!rounds || rounds.length === 0) return null

  const maxMatches = Math.max(...rounds.map(r => r.matches.length))
  if (maxMatches === 0) return null

  const baseSlot = CARD_H + V_GAP
  const totalH   = maxMatches * baseSlot
  const totalW   = rounds.length * (CARD_W + H_GAP) - H_GAP

  return (
    <div>
      {label && (
        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
          {label}
        </p>
      )}
      <div className="relative" style={{ width: totalW, height: totalH + LABEL_H + 4 }}>

        {rounds.map((round, rIdx) => {
          const hasLive = round.matches.some(m => m.status === 'running')
          return (
            <div
              key={rIdx}
              className="absolute text-center overflow-hidden"
              style={{ left: rIdx * (CARD_W + H_GAP), top: 0, width: CARD_W, height: LABEL_H }}
            >
              <span className={`text-xs truncate flex items-center justify-center gap-1 px-1 ${hasLive ? 'text-red-500' : 'text-gray-400 dark:text-gray-600'}`}>
                {hasLive && <span className="inline-block w-1 h-1 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                {round.label}
              </span>
            </div>
          )
        })}

        <svg
          className="absolute pointer-events-none"
          style={{ left: 0, top: LABEL_H + 4 }}
          width={totalW}
          height={totalH}
        >
          {rounds.slice(0, -1).map((round, rIdx) => {
            const nextRound = rounds[rIdx + 1]
            const curSlotH  = totalH / round.matches.length
            const nextSlotH = totalH / nextRound.matches.length
            const x1   = rIdx * (CARD_W + H_GAP) + CARD_W
            const x2   = (rIdx + 1) * (CARD_W + H_GAP)
            const xMid = (x1 + x2) / 2

            return round.matches.map((_, mIdx) => {
              const y1       = mIdx * curSlotH + curSlotH / 2
              const nextMIdx = Math.floor(mIdx * nextRound.matches.length / round.matches.length)
              const y2       = nextMIdx * nextSlotH + nextSlotH / 2
              return (
                <path
                  key={`${rIdx}-${mIdx}`}
                  d={`M ${x1} ${y1} H ${xMid} V ${y2} H ${x2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-gray-200 dark:text-gray-800"
                />
              )
            })
          })}
        </svg>

        {rounds.map((round, rIdx) => {
          const slotH = totalH / round.matches.length
          const x     = rIdx * (CARD_W + H_GAP)
          return round.matches.map((match, mIdx) => {
            const y = mIdx * slotH + (slotH - CARD_H) / 2
            return (
              <div
                key={match.id || `${rIdx}-${mIdx}`}
                className="absolute"
                style={{ left: x, top: LABEL_H + 4 + y, width: CARD_W, height: CARD_H }}
              >
                <MatchCard match={match} />
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

export function HorizontalBracket({ bracket }) {
  if (!bracket || bracket.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No bracket yet.
    </p>
  )

  const sorted = (arr) => arr.slice().sort((a, b) => a.round - b.round)
  const upper      = sorted(bracket.filter(r => r.section === 'upper'))
  const lower      = sorted(bracket.filter(r => r.section === 'lower'))
  const main       = sorted(bracket.filter(r => r.section === 'main'))
  const grandFinal = bracket.filter(r => r.section === 'grand_final')

  const notEmpty = (rounds) => rounds.filter(r => r.matches.length > 0)
  const isDE = upper.length > 0 && lower.length > 0

  if (isDE) {
    return (
      <div className="px-4 sm:px-5 py-4 overflow-x-auto">
        <div className="min-w-max flex flex-col gap-8">
          <BracketSection label="Upper Bracket" rounds={notEmpty(upper)} />
          <BracketSection label="Lower Bracket" rounds={notEmpty(lower)} />
          {grandFinal.length > 0 && (
            <BracketSection label="Grand Final" rounds={notEmpty(grandFinal)} />
          )}
        </div>
      </div>
    )
  }

  const allRounds = notEmpty([...main, ...upper, ...lower, ...grandFinal])
  return (
    <div className="px-4 sm:px-5 py-4 overflow-x-auto">
      <div className="min-w-max">
        <BracketSection rounds={allRounds} />
      </div>
    </div>
  )
}

// Flat round list — used for Swiss / Group Stage formats
export function BracketFlatView({ bracket }) {
  if (!bracket || bracket.length === 0) return (
    <p className="text-xs text-gray-400 dark:text-gray-600 py-4 text-center uppercase tracking-widest">
      No bracket yet.
    </p>
  )

  const relevantRounds = bracket.filter(r =>
    r.matches.some(m => m.teamA !== 'TBD' || m.teamB !== 'TBD')
  )
  const rounds = relevantRounds.length > 0 ? relevantRounds : bracket.slice(0, 1)

  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-900">
      {rounds.map(({ round, label, matches }) => (
        <div key={round} className="py-3 px-4 sm:px-5">
          {label && (
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600 font-semibold mb-2">
              {label}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {matches.map((m, i) => {
              const isLive = m.status === 'running'
              const isDone = m.status === 'finished'
              const isTbd = m.teamA === 'TBD' && m.teamB === 'TBD'
              const scoreA = m.scoreA ?? null
              const scoreB = m.scoreB ?? null
              const hasScore = scoreA !== null && scoreB !== null
              const dimA = isDone && hasScore && scoreA < scoreB
              const dimB = isDone && hasScore && scoreB < scoreA

              return (
                <div key={m.id || i} className="flex items-center gap-2 text-sm">
                  {isLive
                    ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    : <span className="w-1.5 h-1.5 flex-shrink-0" />
                  }
                  <span className={`flex-1 text-right truncate font-semibold ${
                    isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
                    dimA ? 'text-gray-400 dark:text-gray-600' :
                    'text-gray-900 dark:text-white'
                  }`}>{m.teamA}</span>
                  <div className="w-16 flex-shrink-0 text-center">
                    {hasScore ? (
                      <span className="font-black tabular-nums text-gray-900 dark:text-white">
                        <span className={dimA ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreA}</span>
                        <span className="text-gray-300 dark:text-gray-700 font-light mx-1">–</span>
                        <span className={dimB ? 'text-gray-400 dark:text-gray-600' : ''}>{scoreB}</span>
                      </span>
                    ) : m.status === 'not_started' && m.scheduledAt ? (
                      <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                        {formatScheduledTime(m.scheduledAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-600">vs</span>
                    )}
                  </div>
                  <span className={`flex-1 truncate font-semibold ${
                    isTbd ? 'text-gray-400 dark:text-gray-700 italic' :
                    dimB ? 'text-gray-400 dark:text-gray-600' :
                    'text-gray-900 dark:text-white'
                  }`}>{m.teamB}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

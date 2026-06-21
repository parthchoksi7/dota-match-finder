import { useState, useEffect, useCallback } from 'react'

// Internal-only VOD URL browser. Token-gated (CRON_SECRET as Bearer), never linked,
// noindex. Shows every stream URL recorded in match_stream_history, grouped
// Date → Series → Games → main url + other urls, with per-series replay-available.

function useAdminToken() {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') || '')
  const save = useCallback((t) => { localStorage.setItem('admin_token', t); setToken(t) }, [])
  const clear = useCallback(() => { localStorage.removeItem('admin_token'); setToken('') }, [])
  return { token, save, clear }
}

function apiFetch(path, token) {
  return fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async r => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || r.statusText)
    return data
  })
}

const SOURCE_STYLES = {
  twitch:  'bg-purple-900/50 text-purple-300',
  youtube: 'bg-red-900/50 text-red-300',
  other:   'bg-gray-800 text-gray-400',
}

function LoginGate({ onLogin }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setChecking(true)
    setError('')
    try {
      await apiFetch('/api/pipeline?type=vod-urls&days=1', input)
      onLogin(input)
    } catch {
      setError('Invalid token')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm bg-gray-900 rounded-xl border border-gray-800 p-8">
        <h1 className="font-['Barlow_Condensed'] font-black text-2xl text-white uppercase tracking-wide mb-1">
          VOD URLs
        </h1>
        <p className="text-xs text-gray-500 mb-6">Internal stream-URL browser</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Admin token"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={!input || checking}
            className="bg-white text-gray-950 font-semibold text-sm rounded-lg py-2.5 disabled:opacity-40 hover:bg-gray-100 transition-colors"
          >
            {checking ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ReplayPill({ available }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
      available ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
    }`}>
      {available ? 'Replay ✓' : 'No replay'}
    </span>
  )
}

function UrlRow({ u }) {
  if (!u) return <span className="text-xs text-gray-600 italic">—</span>
  const label = u.channel || (u.source === 'youtube' ? 'YouTube' : u.source === 'twitch' ? 'Twitch' : 'Stream')
  return (
    <div className="flex items-center gap-2 flex-wrap py-0.5">
      <a
        href={u.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-300 hover:text-blue-200 hover:underline break-all"
      >
        {label}
      </a>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${SOURCE_STYLES[u.source] || SOURCE_STYLES.other}`}>
        {u.source}
      </span>
      {u.language && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-800 text-gray-400">
          {u.language}
        </span>
      )}
      {!u.official && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-amber-900/40 text-amber-400">
          unofficial
        </span>
      )}
      {u.kind === 'start_point' ? (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-green-900/50 text-green-400">
          ▶ start point
        </span>
      ) : u.kind === 'replay' ? (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-blue-900/40 text-blue-300">
          replay
        </span>
      ) : (
        <span className="text-[10px] text-gray-600 uppercase tracking-wide" title="Opens the channel/stream page — not the match start point">
          stream page · no start point
        </span>
      )}
    </div>
  )
}

function GameRow({ game }) {
  return (
    <div className="border-t border-gray-800/60 py-2.5 pl-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
          {game.game_position ? `Game ${game.game_position}` : 'Game'}
        </span>
        <span className="text-[11px] text-gray-500 font-mono">{game.od_match_id}</span>
        <ReplayPill available={game.replay_available} />
      </div>
      <div className="grid sm:grid-cols-[80px_1fr] gap-x-3 gap-y-1">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 pt-1">Main</div>
        <div><UrlRow u={game.main} /></div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 pt-1">Other</div>
        <div>
          {game.others?.length
            ? game.others.map((u, i) => <UrlRow key={i} u={u} />)
            : <span className="text-xs text-gray-600 italic">none</span>}
        </div>
      </div>
    </div>
  )
}

function SeriesCard({ s }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-850/40 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {s.team_a || 'TBD'} <span className="text-gray-500">vs</span> {s.team_b || 'TBD'}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {s.tournament || 'Unknown tournament'}
            {s.bracket_round ? ` · ${s.bracket_round}` : ''}
            {s.match_type ? ` · ${s.match_type.replace(/_/g, ' ')}` : ''}
            {` · ${s.games.length} game${s.games.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ReplayPill available={s.replay_available} />
          <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-2 pb-2">
          {s.games.map(g => <GameRow key={g.od_match_id} game={g} />)}
        </div>
      )}
    </div>
  )
}

export default function AdminVodUrlsPage() {
  const { token, save, clear } = useAdminToken()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { document.title = 'VOD URLs · Internal' }, [])

  const load = useCallback(async (t, d) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/pipeline?type=vod-urls&days=${d}`, t)
      setData(res)
    } catch (err) {
      if (String(err.message).toLowerCase().includes('unauthor')) { clear(); setData(null) }
      else setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [clear])

  useEffect(() => { if (token) load(token, days) }, [token, days, load])

  if (!token) return <LoginGate onLogin={save} />

  // Group series by date.
  const byDate = {}
  for (const s of data?.series || []) {
    (byDate[s.date] ||= []).push(s)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-['Barlow_Condensed'] font-black text-2xl uppercase tracking-wide">VOD URLs</h1>
            <p className="text-xs text-gray-500">
              {data ? `${data.series_count} series · ${data.row_count} games · last ${data.days}d` : 'Internal stream-URL browser'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value={7}>7d</option>
              <option value={30}>30d</option>
              <option value={90}>90d</option>
            </select>
            <button onClick={() => load(token, days)} className="text-xs bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition-colors">
              Refresh
            </button>
            <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5">Sign out</button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {loading && <p className="text-gray-500 text-sm">Loading…</p>}
        {!loading && data && dates.length === 0 && (
          <p className="text-gray-500 text-sm">No stream history recorded in this window.</p>
        )}

        <div className="flex flex-col gap-6">
          {dates.map(date => (
            <div key={date}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 sticky top-0 bg-gray-950 py-1">
                {date} <span className="text-gray-600">· {byDate[date].length} series</span>
              </h2>
              <div className="flex flex-col gap-2">
                {byDate[date].map(s => <SeriesCard key={s.series_key} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

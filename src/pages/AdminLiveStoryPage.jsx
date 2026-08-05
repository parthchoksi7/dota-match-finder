import { useState, useEffect, useCallback, useRef } from 'react'

// Internal-only Live Story verification page. Token-gated (CRON_SECRET as Bearer, same pattern
// as AdminVodUrlsPage.jsx), never linked. `Disallow: /admin` in robots.txt covers generic
// crawlers, though named AI bots get their own `Allow: /` blocks in that file and aren't bound by
// the wildcard rule — the real protection here is the token gate: a crawler hits the login form,
// never the data. Purpose: validate the Valve GetLiveLeagueGames-sourced event pipeline against real
// tier-1 matches (1win Essence S2, EPL Masters, Games of the Future) before TI 2026 (2026-08-13),
// and close E12's remaining lane-naming question against a real finished match's OpenDota
// objectives — see .claude/specs/live-story-cto-review.md and api/_liveStoryDiff.js.
//
// This page is ALSO the capture trigger during the verification phase: visiting it polls
// ?mode=live-story-capture (unauthenticated, KV-lock-throttled — see liveStoryCapture.js) the
// same way SeriesLivePulse's poll nudges captureOdLiveOnce. No QStash schedule was added for
// this; a human watching this page IS the ambient trigger, same architecture as the existing
// live pulse.

const CAPTURE_POLL_MS = 15000 // under the 30s KV lock TTL — the lock is the real cadence, this just guarantees SOMEONE asks often enough

function useAdminToken() {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') || '')
  const save = useCallback((t) => { localStorage.setItem('admin_token', t); setToken(t) }, [])
  const clear = useCallback(() => { localStorage.removeItem('admin_token'); setToken('') }, [])
  return { token, save, clear }
}

function apiFetch(path, token, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  }).then(async r => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || r.statusText)
    return data
  })
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
      await apiFetch('/api/tournaments?mode=live-story-admin&action=overview', input)
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
        <h1 className="font-black text-2xl text-white uppercase tracking-wide mb-1">
          Live Story
        </h1>
        <p className="text-xs text-gray-500 mb-6">Verification console — internal only</p>
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

function Pill({ children, tone = 'gray' }) {
  const styles = {
    gray: 'bg-gray-800 text-gray-400',
    green: 'bg-green-900/50 text-green-400',
    red: 'bg-red-900/50 text-red-400',
    amber: 'bg-amber-900/40 text-amber-400',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${styles[tone]}`}>
      {children}
    </span>
  )
}

function Json({ value }) {
  return (
    <pre className="text-[11px] font-mono text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 1)}
    </pre>
  )
}

// ── Panel 1: health + tracked tier-1 matches ────────────────────────────────────────────────
function OverviewPanel({ token, onSelectMatch }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    apiFetch('/api/tournaments?mode=live-story-admin&action=overview', token)
      .then(setData)
      .catch(err => setError(err.message))
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, CAPTURE_POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const health = data?.health
  const matches = data?.matches || []
  const events = data?.events || {}

  return (
    <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-white font-bold uppercase tracking-widest text-sm mb-3">
        Capture health
      </h2>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {!health && !error && <p className="text-gray-500 text-xs">Loading…</p>}
      {health && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Pill tone={health.ok ? 'green' : 'red'}>{health.ok ? 'OK' : 'Error'}</Pill>
          {health.games != null && <Pill>{health.games} tier-1 live</Pill>}
          {health.totalLive != null && <Pill>{health.totalLive} valve total</Pill>}
          {health.withScoreboard != null && <Pill>{health.withScoreboard} w/ scoreboard</Pill>}
          {health.events != null && <Pill tone="amber">{health.events} events last tick</Pill>}
          {health.note && <Pill tone="amber">{health.note}</Pill>}
          {health.error && <Pill tone="red">{health.error}</Pill>}
          {health.at && <span className="text-[10px] text-gray-600">{new Date(health.at).toLocaleTimeString()}</span>}
        </div>
      )}

      <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-2">
        Tracked matches ({matches.length})
      </h3>
      {matches.length === 0 && (
        <p className="text-xs text-gray-600 italic">
          No tier-1 series currently correlated. This is correct if nothing tier-1 has a running
          game right now — check the health note above.
        </p>
      )}
      <div className="space-y-2">
        {matches.map(g => {
          const matchEvents = events[String(g.match_id)] || []
          const byType = matchEvents.reduce((acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc }, {})
          return (
            <div key={g.match_id} className="border border-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-white font-semibold text-sm">
                    {g.radiant_team?.team_name || '(unnamed)'} vs {g.dire_team?.team_name || '(unnamed)'}
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono">
                    match_id {g.match_id} · delay {g.stream_delay_s}s
                    {g.scoreboard && <> · {Math.floor(g.scoreboard.duration / 60)}m · {g.scoreboard.radiant.score}-{g.scoreboard.dire.score}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectMatch(String(g.match_id))}
                  className="text-xs font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 border border-gray-700 rounded px-3 py-1.5"
                >
                  Inspect →
                </button>
              </div>
              {matchEvents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(byType).map(([type, n]) => (
                    <Pill key={type} tone={type === 'RoshanKilled' ? 'amber' : 'gray'}>{type} ×{n}</Pill>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Panel 2: raw snapshot pair inspector — the Log-Drains substitute ────────────────────────
function SnapshotPairPanel({ token }) {
  const [pair, setPair] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  function load() {
    setLoading(true)
    setError('')
    apiFetch('/api/tournaments?mode=live-story-admin&action=pair', token)
      .then(d => setPair(d.pair))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  return (
    <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold uppercase tracking-widest text-sm">
          Snapshot pair inspector
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 border border-gray-700 rounded px-3 py-1.5 disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Load last pair'}
        </button>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">
        The exact prev/next snapshot pair the differ last saw, plus every event it derived. Root-cause
        tool: without Vercel Log Drains (unavailable on the free plan), this is the only way to see
        WHY a given event fired.
      </p>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {pair && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Pill>{pair.events?.length || 0} events derived</Pill>
            <Pill>{pair.next?.result?.games?.length || 0} games in pair</Pill>
            <span className="text-[10px] text-gray-600">{pair.at ? new Date(pair.at).toLocaleTimeString() : ''}</span>
          </div>
          <div>
            <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-1.5">Derived events</h3>
            <Json value={pair.events} />
          </div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
          >
            {expanded ? 'Hide raw prev/next snapshots' : 'Show raw prev/next snapshots'}
          </button>
          {expanded && (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-1.5">Prev</h3>
                <Json value={pair.prev} />
              </div>
              <div>
                <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-1.5">Next</h3>
                <Json value={pair.next} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const VERDICT_TONE = { confirmed: 'green', lane_mismatch: 'red', no_match: 'amber', undecodable: 'red' }

// ── Panel 3a: bitmask decode / OD cross-check — closes E12's lane-naming question ───────────
function CrosscheckPanel({ token, matchId, setMatchId }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function run() {
    if (!matchId) return
    setLoading(true)
    setError('')
    apiFetch(`/api/tournaments?mode=live-story-admin&action=crosscheck&matchId=${encodeURIComponent(matchId)}`, token)
      .then(setResult)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  return (
    <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-white font-bold uppercase tracking-widest text-sm mb-2">
        Bitmask decode cross-check (E12)
      </h2>
      <p className="text-[11px] text-gray-500 mb-3">
        Compares this match's derived tower/barracks events against OpenDota's post-game
        objectives[] — the ONLY thing that can close the lane-naming question (the bit-layout
        structure is already proven from invariants alone; see api/_liveStoryDiff.js). Only
        meaningful once the match has finished and OpenDota has parsed it.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          value={matchId}
          onChange={e => setMatchId(e.target.value)}
          placeholder="Valve/OpenDota match_id"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <button
          type="button"
          onClick={run}
          disabled={!matchId || loading}
          className="text-xs font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 border border-gray-700 rounded px-4 disabled:opacity-40"
        >
          {loading ? 'Checking…' : 'Cross-check'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {result && (
        <div className="space-y-2">
          {result.note && <Pill tone="amber">{result.note}</Pill>}
          {result.odFetchError && <Pill tone="amber">OD: {result.odFetchError}</Pill>}
          {result.summary && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(result.summary).map(([verdict, n]) => (
                <Pill key={verdict} tone={VERDICT_TONE[verdict] || 'gray'}>{verdict} ×{n}</Pill>
              ))}
            </div>
          )}
          {result.results?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-widest text-[10px] border-b border-gray-800">
                    <th className="text-left py-1.5 pr-3">Type</th>
                    <th className="text-left py-1.5 pr-3">Team</th>
                    <th className="text-left py-1.5 pr-3">Decoded</th>
                    <th className="text-left py-1.5 pr-3">Game time</th>
                    <th className="text-left py-1.5">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-b border-gray-900">
                      <td className="py-1.5 pr-3 text-gray-300">{r.eventType}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{r.team === 2 ? 'Radiant' : r.team === 3 ? 'Dire' : '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-gray-400">
                        {r.decoded ? `${r.decoded.lane || `t${r.decoded.tier}`}${r.decoded.tier ? ` t${r.decoded.tier}` : ''}${r.decoded.kind ? ` ${r.decoded.kind}` : ''}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-gray-500">{r.gameTime}</td>
                      <td className="py-1.5"><Pill tone={VERDICT_TONE[r.verdict] || 'gray'}>{r.verdict}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Panel 3b: Valve vs OpenDota side-by-side — the two-clocks question, answered with a number ─
function ComparePanel({ token, matchId, setMatchId }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function run() {
    if (!matchId) return
    setLoading(true)
    setError('')
    apiFetch(`/api/tournaments?mode=live-story-admin&action=compare&matchId=${encodeURIComponent(matchId)}`, token)
      .then(setResult)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  const rows = result ? [
    ['Radiant name', result.valve?.radiantName, result.openDota?.radiantName],
    ['Dire name', result.valve?.direName, result.openDota?.direName],
    ['Game time (s)', result.valve?.gameTime, result.openDota?.gameTime],
    ['Score', result.valve ? `${result.valve.radiantScore}-${result.valve.direScore}` : null, result.openDota ? `${result.openDota.radiantScore}-${result.openDota.direScore}` : null],
    ['Net worth lead', result.valve?.netWorthLead, result.openDota?.netWorthLead],
  ] : []

  return (
    <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h2 className="text-white font-bold uppercase tracking-widest text-sm mb-2">
        Valve vs OpenDota — same match, side by side
      </h2>
      <p className="text-[11px] text-gray-500 mb-3">
        Answers the two-clocks question with a number instead of an argument: how far apart is
        Valve's single-source state from what the live site shows today (OpenDota-sourced), for
        the same match, right now.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          value={matchId}
          onChange={e => setMatchId(e.target.value)}
          placeholder="Valve/OpenDota match_id"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <button
          type="button"
          onClick={run}
          disabled={!matchId || loading}
          className="text-xs font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 border border-gray-700 rounded px-4 disabled:opacity-40"
        >
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {result && (
        <div className="space-y-3">
          {result.clockDeltaS != null && (
            <Pill tone={Math.abs(result.clockDeltaS) > 60 ? 'red' : Math.abs(result.clockDeltaS) > 20 ? 'amber' : 'green'}>
              clock delta {result.clockDeltaS > 0 ? '+' : ''}{result.clockDeltaS}s (valve − opendota)
            </Pill>
          )}
          {!result.valve && <Pill tone="amber">no valve data for this match_id</Pill>}
          {!result.openDota && <Pill tone="amber">no live_game_map row for this match_id</Pill>}
          {result.valve && result.openDota && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 uppercase tracking-widest text-[10px] border-b border-gray-800">
                  <th className="text-left py-1.5 pr-3">Field</th>
                  <th className="text-left py-1.5 pr-3">Valve</th>
                  <th className="text-left py-1.5">OpenDota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, a, b]) => (
                  <tr key={label} className="border-b border-gray-900">
                    <td className="py-1.5 pr-3 text-gray-500">{label}</td>
                    <td className="py-1.5 pr-3 text-gray-300 font-mono">{String(a ?? '—')}</td>
                    <td className="py-1.5 text-gray-300 font-mono">{String(b ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}

export default function AdminLiveStoryPage() {
  const { token, save, clear } = useAdminToken()
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const captureIntervalRef = useRef(null)

  // The capture trigger. Unauthenticated (same idempotent/KV-throttled shape as
  // ?mode=od-live-capture) — visiting this page IS the ambient viewer presence that makes the KV
  // lock's cadence the effective poll rate, no QStash schedule needed.
  useEffect(() => {
    if (!token) return
    function poll() {
      fetch('/api/tournaments?mode=live-story-capture').catch(() => {})
    }
    poll()
    captureIntervalRef.current = setInterval(poll, CAPTURE_POLL_MS)
    return () => clearInterval(captureIntervalRef.current)
  }, [token])

  if (!token) return <LoginGate onLogin={save} />

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-black text-2xl text-white uppercase tracking-wide">Live Story</h1>
            <p className="text-xs text-gray-500">
              Verification console · single-sourced from Valve's GetLiveLeagueGames · validating
              against 1win Essence S2 / EPL Masters / Games of the Future ahead of TI 2026
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 shrink-0"
          >
            Sign out
          </button>
        </div>

        <OverviewPanel token={token} onSelectMatch={setSelectedMatchId} />
        <SnapshotPairPanel token={token} />
        <ComparePanel token={token} matchId={selectedMatchId} setMatchId={setSelectedMatchId} />
        <CrosscheckPanel token={token} matchId={selectedMatchId} setMatchId={setSelectedMatchId} />
      </div>
    </div>
  )
}

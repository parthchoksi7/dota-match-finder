import { useState, useEffect, useCallback } from 'react'

const STATUS_STYLES = {
  queued:       'bg-gray-800 text-gray-300',
  processing:   'bg-amber-900/60 text-amber-300',
  generated:    'bg-blue-900/60 text-blue-300',
  under_review: 'bg-purple-900/60 text-purple-300',
  approved:     'bg-green-900/60 text-green-400',
  published:    'bg-green-700/80 text-green-100',
  archived:     'bg-gray-800 text-gray-500',
  suppressed:   'bg-red-900/40 text-red-400',
}

const PRIORITY_STYLES = {
  critical: 'text-red-400',
  high:     'text-amber-400',
  medium:   'text-gray-300',
  low:      'text-gray-500',
}

function useAdminToken() {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') || '')
  const save = useCallback((t) => { localStorage.setItem('admin_token', t); setToken(t) }, [])
  const clear = useCallback(() => { localStorage.removeItem('admin_token'); setToken('') }, [])
  return { token, save, clear }
}

function apiFetch(path, token, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async r => {
    const data = await r.json()
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
      await apiFetch('/api/coverage', input)
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
        <h1 className="font-['Barlow_Condensed'] font-black text-2xl text-white uppercase tracking-wide mb-6">
          Coverage Admin
        </h1>
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

function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-widest ${STATUS_STYLES[status] || 'bg-gray-800 text-gray-400'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function CreateJobModal({ token, onCreated, onClose }) {
  const [matchId, setMatchId] = useState('')
  const [priority, setPriority] = useState('high')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { job } = await apiFetch('/api/coverage', token, {
        method: 'POST',
        body: { matchId: matchId.trim(), priority },
      })
      onCreated(job)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-['Barlow_Condensed'] font-black text-xl text-white uppercase mb-4">Queue Match</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 block mb-1.5">Match ID</label>
            <input
              type="text"
              placeholder="e.g. 8823789680"
              value={matchId}
              onChange={e => setMatchId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-gray-500"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 block mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-500"
            >
              <option value="critical">Critical — TI playoffs, grand finals</option>
              <option value="high">High — Major playoffs, top-8</option>
              <option value="medium">Medium — DPC League, regional finals</option>
              <option value="low">Low — Qualifiers</option>
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matchId.trim() || loading}
              className="flex-1 bg-white text-gray-950 font-semibold text-sm rounded-lg py-2.5 disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              {loading ? 'Queueing…' : 'Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function JobRow({ job, onAction }) {
  const intel = job.intelligence
  const teamLabel = intel
    ? `${intel.radiant.name} vs ${intel.dire.name}`
    : `Match ${job.matchId}`
  const tournament = intel?.tournament?.name || job.tournament || '—'
  const updatedAgo = (() => {
    const diffMs = Date.now() - new Date(job.updatedAt).getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    return `${Math.floor(diffH / 24)}d ago`
  })()

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors">
      <td className="py-3 px-4">
        <div className="font-['Barlow_Condensed'] font-bold text-white text-base leading-tight">{teamLabel}</div>
        <div className="text-xs text-gray-500 mt-0.5 uppercase tracking-widest">{tournament}</div>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs font-bold uppercase tracking-widest ${PRIORITY_STYLES[job.priority] || ''}`}>
          {job.priority}
        </span>
      </td>
      <td className="py-3 px-4">
        <StatusPill status={job.status} />
      </td>
      <td className="py-3 px-4 text-xs text-gray-500 tabular-nums">{updatedAgo}</td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {(job.status === 'generated' || job.status === 'under_review') && (
            <a
              href={`/admin/review/${job.jobId}`}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              Review →
            </a>
          )}
          {job.status === 'published' && (
            <a
              href={`/matches/${job.jobId}`}
              className="text-xs font-semibold text-green-400 hover:text-green-300 transition-colors"
            >
              Live →
            </a>
          )}
          {job.status !== 'suppressed' && job.status !== 'archived' && (
            <button
              onClick={() => onAction(job.jobId, 'suppressed')}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors"
            >
              Suppress
            </button>
          )}
          {job.status === 'suppressed' && (
            <button
              onClick={() => onAction(job.jobId, 'queued')}
              className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
            >
              Unsuppress
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function AdminCoveragePage() {
  const { token, save, clear } = useAdminToken()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async (t = token) => {
    if (!t) return
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/coverage', t)
      setJobs(data)
    } catch (err) {
      if (err.message === 'Unauthorized') clear()
      else setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, clear])

  useEffect(() => { load() }, [load])

  async function handleAction(jobId, newStatus) {
    try {
      await apiFetch('/api/coverage', token, {
        method: 'PATCH',
        body: { jobId, status: newStatus },
      })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  if (!token) return <LoginGate onLogin={save} />

  const STATUS_ORDER = ['queued', 'processing', 'generated', 'under_review', 'approved', 'published', 'archived', 'suppressed']
  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)
  const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc }, {})

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="font-['Barlow_Condensed'] font-black text-2xl uppercase tracking-wide">
          Coverage Queue
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load()}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-white text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            + Queue Match
          </button>
          <button onClick={clear} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-2 overflow-x-auto">
        {['all', ...STATUS_ORDER].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-widest transition-colors ${
              filter === s
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {s === 'all' ? `All (${jobs.length})` : `${s.replace('_', ' ')} ${counts[s] ? `(${counts[s]})` : ''}`}
          </button>
        ))}
      </div>

      {/* Jobs table */}
      <div className="px-6 pb-12">
        {error && <p className="text-red-400 text-sm py-4">{error}</p>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-lg font-semibold">No jobs</p>
            <p className="text-sm mt-1">
              {filter === 'all' ? 'Queue a match to get started.' : `No jobs with status "${filter}".`}
            </p>
          </div>
        )}
        {filtered.length > 0 && (
          <table className="w-full mt-2">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500 font-medium">Match</th>
                <th className="text-left py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500 font-medium">Priority</th>
                <th className="text-left py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500 font-medium">Status</th>
                <th className="text-left py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500 font-medium">Updated</th>
                <th className="py-2.5 px-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <JobRow key={job.jobId} job={job} onAction={handleAction} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateJobModal
          token={token}
          onCreated={job => { setShowCreate(false); setJobs(prev => [job, ...prev]) }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

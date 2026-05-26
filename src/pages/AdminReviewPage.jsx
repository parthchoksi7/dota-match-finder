import { useState, useEffect } from 'react'
import GoldGraph from '../components/GoldGraph'

const REJECTION_REASONS = [
  { value: 'factual_error',         label: 'Factual Error', hint: 'Wrong player, stat, or outcome' },
  { value: 'unsupported_inference', label: 'Unsupported Inference', hint: 'Claim not backed by data' },
  { value: 'bad_dota_logic',        label: 'Bad Dota Logic', hint: 'Tactical misunderstanding' },
  { value: 'patch_mismatch',        label: 'Patch Mismatch', hint: 'Outdated hero/meta assumptions' },
  { value: 'generic_slop',          label: 'Generic Slop', hint: 'AI filler, no real insight' },
  { value: 'missing_context',       label: 'Missing Context', hint: 'Ignored tournament situation' },
]

function apiFetch(path, token, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async r => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || r.statusText)
    return data
  })
}

function useToken() {
  return localStorage.getItem('admin_token') || ''
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MatchHeader({ intel }) {
  const winner = intel.winner === 'radiant' ? intel.radiant : intel.dire
  const loser  = intel.winner === 'radiant' ? intel.dire : intel.radiant

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-6 py-5">
      <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">
        {intel.tournament.name} · {intel.seriesType} · Patch {intel.patch}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-['Barlow_Condensed'] font-black text-3xl text-green-400">{winner.name}</span>
        <span className="font-['Barlow_Condensed'] font-black text-xl text-gray-600">vs</span>
        <span className="font-['Barlow_Condensed'] font-black text-3xl text-gray-500">{loser.name}</span>
        <span className="ml-auto text-xs text-gray-500 tabular-nums">{intel.duration}</span>
      </div>
    </div>
  )
}

function DraftSection({ draft }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Draft</h3>
      <div className="grid grid-cols-2 gap-6">
        {[
          { label: 'Radiant Picks', items: draft.picks.filter(p => p.side === 'radiant') },
          { label: 'Dire Picks',    items: draft.picks.filter(p => p.side === 'dire') },
        ].map(({ label, items }) => (
          <div key={label}>
            <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">{label}</div>
            <div className="flex flex-col gap-1">
              {items.map(p => (
                <div key={p.heroId} className="text-sm text-gray-200">{p.heroName}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">Bans</div>
        <div className="flex flex-wrap gap-2">
          {draft.bans.map(b => (
            <span key={b.heroId} className={`text-xs px-2 py-0.5 rounded bg-gray-800 ${b.side === 'radiant' ? 'text-blue-300' : 'text-red-300'}`}>
              {b.heroName}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const OBJ_ICON = {
  first_blood: '🩸',
  roshan:      '🐉',
  aegis:       '🛡',
  tormentor:   '💀',
  tower:       '🏰',
  barracks:    '⚔️',
  ancient:     '☠️',
  courier:     '📦',
}

function ObjectivesSection({ objectives }) {
  const important = objectives.filter(o =>
    ['roshan', 'aegis', 'tormentor', 'ancient', 'barracks', 'first_blood'].includes(o.type)
  )
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? objectives : important

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-widest text-gray-500">Objectives</h3>
        <button
          onClick={() => setShowAll(s => !s)}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          {showAll ? 'Key only' : `All (${objectives.length})`}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {displayed.map((o, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className="text-gray-600 tabular-nums text-xs w-10 flex-shrink-0 pt-0.5">{o.time}</span>
            <span className="flex-shrink-0 text-base leading-none">{OBJ_ICON[o.type] || '·'}</span>
            <span className={`${
              o.side === 'radiant' ? 'text-blue-200' :
              o.side === 'dire'    ? 'text-red-200'  :
              'text-gray-300'
            }`}>{o.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayersSection({ players, radiantName, direName }) {
  const radiant = players.filter(p => p.side === 'radiant')
  const dire    = players.filter(p => p.side === 'dire')

  function TeamTable({ team, label, accent }) {
    return (
      <div>
        <div className={`text-xs uppercase tracking-widest mb-2 font-semibold ${accent}`}>{label}</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500">
              <th className="text-left py-1.5 pr-3 font-medium">Player</th>
              <th className="text-left py-1.5 pr-3 font-medium">Hero</th>
              <th className="text-right py-1.5 pr-3 font-medium tabular-nums">KDA</th>
              <th className="text-right py-1.5 pr-3 font-medium tabular-nums">GPM</th>
              <th className="text-right py-1.5 pr-3 font-medium tabular-nums">XPM</th>
              <th className="text-right py-1.5 font-medium tabular-nums">NW</th>
            </tr>
          </thead>
          <tbody>
            {team.map(p => (
              <tr key={p.slot} className="border-b border-gray-800/50">
                <td className="py-1.5 pr-3 font-semibold text-gray-200">{p.displayName}</td>
                <td className="py-1.5 pr-3 text-gray-400">{p.heroName}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-300">{p.kda}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{p.gpm}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">{p.xpm}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-400">${p.netWorth.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <TeamTable team={radiant} label={radiantName} accent="text-blue-400" />
      <TeamTable team={dire}    label={direName}    accent="text-red-400" />
    </div>
  )
}

function RejectModal({ onReject, onClose }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-['Barlow_Condensed'] font-black text-xl text-white uppercase mb-4">Reject — Select Reason</h2>
        <div className="flex flex-col gap-2 mb-4">
          {REJECTION_REASONS.map(r => (
            <label key={r.value} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 accent-red-500"
              />
              <div>
                <div className="text-sm font-semibold text-gray-200 group-hover:text-white">{r.label}</div>
                <div className="text-xs text-gray-500">{r.hint}</div>
              </div>
            </label>
          ))}
        </div>
        <textarea
          placeholder="Optional note for prompt improvement…"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-700 text-gray-300 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            disabled={!reason}
            onClick={() => onReject(reason, note)}
            className="flex-1 bg-red-600 text-white font-semibold text-sm rounded-lg py-2.5 disabled:opacity-40 hover:bg-red-500 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminReviewPage() {
  const token  = useToken()
  const jobId  = window.location.pathname.split('/').pop()
  const [job,  setJob]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [activeTab, setActiveTab] = useState('objectives')

  useEffect(() => {
    if (!token) { window.location.href = '/admin/coverage'; return }
    apiFetch(`/api/coverage?jobId=${jobId}`, token)
      .then(setJob)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [jobId, token])

  async function doTransition(status, extra = {}) {
    setActing(true)
    try {
      const updated = await apiFetch('/api/coverage', token, {
        method: 'PATCH',
        body: { jobId, status, ...extra },
      })
      setJob(updated)
    } catch (err) {
      alert(err.message)
    } finally {
      setActing(false)
    }
  }

  async function handleReject(reason, note) {
    setShowReject(false)
    await doTransition('generated', { rejectionReason: reason, rejectionNote: note })
  }

  if (!token)   return null
  if (loading)  return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
  if (error)    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-400 text-sm">{error}</div>
  if (!job)     return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Job not found</div>

  const intel = job.intelligence
  if (!intel) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center flex-col gap-3">
        <p className="text-gray-400 text-sm">Intelligence not yet generated.</p>
        <p className="text-xs text-gray-600">Run the worker: <code className="bg-gray-800 px-2 py-0.5 rounded">node pipeline/worker.mjs --job {jobId}</code></p>
      </div>
    )
  }

  const isEditable   = ['generated', 'under_review'].includes(job.status)
  const isPublished  = job.status === 'published'
  const tabs = ['objectives', 'draft', 'players', 'gold']

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top nav */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-4 text-sm">
        <a href="/admin/coverage" className="text-gray-500 hover:text-gray-300 transition-colors">← Queue</a>
        <span className="text-gray-700">·</span>
        <span className="text-gray-500 font-mono text-xs">{job.jobId}</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          {job.statusHistory.map(h => h.status).join(' → ')}
        </div>
      </div>

      {/* Match header */}
      <MatchHeader intel={intel} />

      {/* Action bar */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        {isEditable && (
          <>
            <button
              disabled={acting}
              onClick={() => doTransition('approved')}
              className="bg-green-600 hover:bg-green-500 text-white font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              ✓ Approve
            </button>
            <button
              disabled={acting}
              onClick={() => setShowReject(true)}
              className="border border-red-800 text-red-400 hover:bg-red-900/30 font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              ✗ Reject
            </button>
            <button
              disabled={acting}
              onClick={() => doTransition('queued')}
              className="border border-gray-700 text-gray-400 hover:bg-gray-800 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-40 transition-colors"
            >
              ↺ Regenerate
            </button>
          </>
        )}
        {job.status === 'approved' && (
          <button
            disabled={acting}
            onClick={() => doTransition('published')}
            className="bg-white text-gray-950 font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors"
          >
            Publish →
          </button>
        )}
        {isPublished && (
          <a href={`/matches/${job.jobId}`} className="text-green-400 text-sm font-semibold hover:text-green-300">
            View live page →
          </a>
        )}
        {job.status !== 'suppressed' && !isPublished && (
          <button
            disabled={acting}
            onClick={() => doTransition('suppressed')}
            className="ml-auto text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Suppress
          </button>
        )}
        {job.rejectionReason && (
          <span className="ml-auto text-xs text-red-400 border border-red-900 rounded px-2 py-1">
            Rejected: {REJECTION_REASONS.find(r => r.value === job.rejectionReason)?.label || job.rejectionReason}
          </span>
        )}
      </div>

      {/* Content tabs */}
      <div className="border-b border-gray-800 px-6 flex gap-1 pt-2">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              activeTab === t
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="px-6 py-6 max-w-4xl">
        {activeTab === 'objectives' && <ObjectivesSection objectives={intel.objectives} />}
        {activeTab === 'draft'      && <DraftSection draft={intel.draft} />}
        {activeTab === 'players'    && (
          <PlayersSection
            players={intel.players}
            radiantName={intel.radiant.name}
            direName={intel.dire.name}
          />
        )}
        {activeTab === 'gold' && (
          <div>
            <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-4">Gold Advantage</h3>
            <GoldGraph
              radiantGoldAdv={intel.goldAdvantage}
              radiantName={intel.radiant.name}
              direName={intel.dire.name}
            />
          </div>
        )}
      </div>

      {showReject && <RejectModal onReject={handleReject} onClose={() => setShowReject(false)} />}
    </div>
  )
}

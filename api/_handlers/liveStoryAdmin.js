import { kv } from '../_kv.js'
import { getSupabaseAdmin } from '../_supabase.js'
import { LIVE_STORY_KEYS } from './liveStoryCapture.js'
import { crossCheckBuildingEvents } from '../_liveStoryDiff.js'

// Read-only data for /admin/live-story (owner-only verification page — see the "Correction"
// section of .claude/specs/live-story-cto-review.md for why this KV-only, no-Supabase-write
// approach was chosen for the verification phase). Every action here is a GET; the write side
// lives entirely in liveStoryCapture.js.
//
// This endpoint is the substitute for Vercel Log Drains, which are unavailable on the free plan
// (project_vercel_plan) — without it, a wrong event during the TI validation window could only be
// debugged by redeploying with ad-hoc logging.

const { SNAPSHOT_KEY, LAST_PAIR_KEY, HEALTH_KEY, EVENTS_KEY, TRACKED_KEY } = LIVE_STORY_KEYS

// ── overview: health + every currently-tracked match's current state + its event ring ─────────
async function actionOverview(res) {
  const [health, tracked, snapshot] = await Promise.all([
    kv.get(HEALTH_KEY).catch(() => null),
    kv.get(TRACKED_KEY).catch(() => null),
    kv.get(SNAPSHOT_KEY).catch(() => null),
  ])
  const matchIds = Array.isArray(tracked) ? tracked : []
  const events = {}
  await Promise.all(matchIds.map(async (id) => {
    events[id] = (await kv.get(EVENTS_KEY(id)).catch(() => null)) || []
  }))
  const allGames = snapshot?.result?.games || []
  const matches = allGames.filter(g => matchIds.includes(String(g.match_id)))
  return res.status(200).json({ health, matches, events })
}

// ── pair: the exact prev/next snapshot + derived events the differ last saw ───────────────────
// The root-cause tool: reproduces exactly what produced any given event, for manual inspection.
async function actionPair(res) {
  const pair = await kv.get(LAST_PAIR_KEY).catch(() => null)
  return res.status(200).json({ pair })
}

// ── compare: Valve's current state vs. the OpenDota-sourced state the live site actually shows,
// for the same match, side by side. Answers the two-clocks question directly instead of by
// argument: how far apart are they right now, for a real match? ─────────────────────────────────
async function actionCompare(req, res) {
  const matchId = req.query?.matchId
  if (!matchId) return res.status(400).json({ error: 'matchId required' })

  const [snapshot, odResult] = await Promise.all([
    kv.get(SNAPSHOT_KEY).catch(() => null),
    getSupabaseAdmin()
      .from('live_game_map')
      .select('od_match_id, radiant_name, dire_name, radiant_lead, radiant_score, dire_score, game_time, building_state, captured_at')
      .eq('od_match_id', matchId)
      .maybeSingle(),
  ])

  const valve = (snapshot?.result?.games || []).find(g => String(g.match_id) === String(matchId)) || null
  const openDota = odResult?.data || null

  let valveNetWorthLead = null
  if (valve?.scoreboard) {
    const sum = (side) => (side?.players || []).reduce((n, p) => n + (p.net_worth || 0), 0)
    valveNetWorthLead = sum(valve.scoreboard.radiant) - sum(valve.scoreboard.dire)
  }

  // The two-clocks question, answered with a number rather than an argument: how far apart is
  // Valve's game_time from what live_game_map last captured for the same match, right now.
  const clockDeltaS = (valve?.scoreboard?.duration != null && openDota?.game_time != null)
    ? Math.round(valve.scoreboard.duration) - openDota.game_time
    : null

  return res.status(200).json({
    matchId,
    valve: valve ? {
      radiantName: valve.radiant_team?.team_name ?? null,
      direName: valve.dire_team?.team_name ?? null,
      gameTime: valve.scoreboard ? Math.round(valve.scoreboard.duration) : null,
      radiantScore: valve.scoreboard?.radiant?.score ?? null,
      direScore: valve.scoreboard?.dire?.score ?? null,
      netWorthLead: valveNetWorthLead,
      streamDelayS: valve.stream_delay_s ?? null,
    } : null,
    openDota: openDota ? {
      radiantName: openDota.radiant_name,
      direName: openDota.dire_name,
      gameTime: openDota.game_time,
      radiantScore: openDota.radiant_score,
      direScore: openDota.dire_score,
      netWorthLead: openDota.radiant_lead,
      capturedAt: openDota.captured_at,
    } : null,
    clockDeltaS,
  })
}

// ── crosscheck: this match's derived building events vs. OpenDota's post-game objectives[] ────
// Only meaningful once the match has finished and OD has parsed it — see the scope note on
// crossCheckBuildingEvents itself for why a match still in progress cannot answer this.
async function actionCrosscheck(req, res) {
  const matchId = req.query?.matchId
  if (!matchId) return res.status(400).json({ error: 'matchId required' })

  const events = (await kv.get(EVENTS_KEY(matchId)).catch(() => null)) || []
  const buildingEvents = events.filter(e => e.eventType === 'TowerDestroyed' || e.eventType === 'BarracksDestroyed')

  if (buildingEvents.length === 0) {
    return res.status(200).json({ matchId, results: [], note: 'no_building_events_captured' })
  }

  let objectives = null
  let odFetchError = null
  try {
    const r = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
    if (r.ok) {
      const data = await r.json()
      objectives = data.objectives || []
      // OpenDota returns an empty/absent objectives array both when a match genuinely has none
      // and when it simply hasn't finished parsing yet — a null duration is the tell for "not
      // ready", so this is surfaced as a distinct case rather than a silent empty-array pass.
      if (data.duration == null) odFetchError = 'not_yet_parsed'
    } else {
      odFetchError = `http_${r.status}`
    }
  } catch (err) {
    odFetchError = err?.message || 'fetch_failed'
  }

  if (!objectives || odFetchError === 'not_yet_parsed') {
    return res.status(200).json({ matchId, results: [], odFetchError: odFetchError || 'no_objectives' })
  }

  const results = crossCheckBuildingEvents(buildingEvents, objectives)
  const summary = results.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] || 0) + 1
    return acc
  }, {})
  return res.status(200).json({ matchId, results, summary })
}

export default async function handleLiveStoryAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const action = req.query?.action || 'overview'
  try {
    if (action === 'overview') return await actionOverview(res)
    if (action === 'pair') return await actionPair(res)
    if (action === 'compare') return await actionCompare(req, res)
    if (action === 'crosscheck') return await actionCrosscheck(req, res)
    return res.status(400).json({ error: 'unknown_action' })
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'admin_read_failed' })
  }
}

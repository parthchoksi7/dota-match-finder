import { getSupabaseAdmin } from '../_supabase.js'
import { createLogger, validateId, findOdMatchByTime } from '../_shared.js'
import { fetchPsMatchDetail, beginAtToUnix, shapeLiveGameMapRows } from './liveSeriesGames.js'

// Phase 2 — live pulse. Given a PandaScore series match id, resolves the CURRENTLY RUNNING
// game to its OpenDota telemetry (gold lead, kill score, live draft) via live_game_map — the
// same fuzzy team+time correlation the finished-game resolver uses, applied to the running
// game instead. Never authoritative, never written anywhere: this is a read-only pulse for
// display, not an id resolution that feeds the locked KV.

const LGM_WINDOW_S = 900 // matches findOdMatchByTime's ±900s window

export default async function handleLiveGamePulse(req, res) {
  const log = createLogger('/api/tournaments?mode=live-game-pulse')
  res.setHeader('Cache-Control', 'private, no-store')
  const pandaId = req.query?.id
  if (!pandaId) return res.status(400).json({ pulse: null })
  const idV = validateId(pandaId, { name: 'id' })
  if (!idV.ok) return res.status(400).json({ pulse: null })

  try {
    const detail = await fetchPsMatchDetail(pandaId, log)
    if (!detail) return res.status(200).json({ pulse: null })

    const opponents = detail.opponents || []
    const running = (detail.games || []).find(g => g.status === 'running')
    if (!running) return res.status(200).json({ pulse: null })

    const beginAtUnix = beginAtToUnix(running.begin_at)
    if (!beginAtUnix) return res.status(200).json({ pulse: null })

    // Same disambiguation guard as the finished-game resolver: without both team names,
    // a live_game_map hit would degrade to pure nearest-time and could bind an unrelated game.
    const names = opponents.map(o => o?.opponent?.name).filter(Boolean)
    if (names.length < 2) return res.status(200).json({ pulse: null })

    const { data, error } = await getSupabaseAdmin()
      .from('live_game_map')
      .select('od_match_id, start_time, radiant_name, dire_name, radiant_lead, radiant_score, dire_score, game_time, radiant_hero_ids, dire_hero_ids, captured_at')
      .gte('start_time', beginAtUnix - LGM_WINDOW_S)
      .lte('start_time', beginAtUnix + LGM_WINDOW_S)
    if (error || !data || data.length === 0) return res.status(200).json({ pulse: null })

    const hit = findOdMatchByTime(shapeLiveGameMapRows(data), beginAtUnix, opponents)
    if (!hit) return res.status(200).json({ pulse: null })
    const row = data.find(r => Number(r.od_match_id) === hit.match_id)
    if (!row) return res.status(200).json({ pulse: null })

    return res.status(200).json({
      pulse: {
        matchId: String(row.od_match_id),
        radiantName: row.radiant_name,
        direName: row.dire_name,
        radiantLead: row.radiant_lead,
        radiantScore: row.radiant_score,
        direScore: row.dire_score,
        gameTime: row.game_time,
        radiantHeroIds: row.radiant_hero_ids || [],
        direHeroIds: row.dire_hero_ids || [],
        capturedAt: row.captured_at,
      },
    })
  } catch (err) {
    log.warn('handler failed', { error: err?.message })
    return res.status(200).json({ pulse: null })
  }
}

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { setCorsHeaders, buildPremiumLeagueIds, trackError, createLogger } from './_shared.js'

import handleWatchability from './_handlers/watchability.js'
import handleMatchStats from './_handlers/matchStats.js'
import handleTournamentPlayers from './_handlers/tournamentPlayers.js'
import handleMonitor from './_handlers/monitor.js'
import handleCalendarTeam from './_handlers/calendarTeam.js'
import handleCalendarAll from './_handlers/calendarAll.js'
import handleCalendarTournament from './_handlers/calendarTournament.js'
import handleSyncTeams from './_handlers/syncTeams.js'
import handleTeamsList from './_handlers/teamsList.js'
import handleTier1Leagues from './_handlers/tier1Leagues.js'
import handleMatchEnrichment, { handleMatchFormats, handleMatchBrackets } from './_handlers/matchEnrichment.js'
import handleHighlights from './_handlers/highlights.js'
import handleLlmsData from './_handlers/llmsData.js'
import handleMatchIndicators from './_handlers/matchIndicators.js'
import handleHeroMatches from './_handlers/heroMatches.js'
import handleSeriesList from './_handlers/seriesList.js'
import handleRecentCompleted from './_handlers/recentCompleted.js'
import handleLiveSeriesGames from './_handlers/liveSeriesGames.js'
import handleLiveOdCapture from './_handlers/liveOdCapture.js'
import handleLiveGamePulse from './_handlers/liveGamePulse.js'

import { kv } from './_kv.js'
import { fetchTournamentList, fetchTournamentStatuses, KV_LIST_KEY, KV_STATUS_KEY } from './_handlers/_tournamentUtils.js'

export default async function handler(req, res) {
  const log = createLogger('/api/tournaments')
  if (setCorsHeaders(req, res, { allowAll: true })) return

  // Watchability scoring (POST, no PANDASCORE_TOKEN needed)
  if (req.method === 'POST' && req.query?.mode === 'watchability') {
    res.setHeader('Cache-Control', 'private, no-store')
    return handleWatchability(req, res)
  }

  // ── match-stats mode ────────────────────────────────────────────────────────
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'match-stats') return handleMatchStats(req, res)

  // ── tournament-players mode ─────────────────────────────────────────────────
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'tournament-players') return handleTournamentPlayers(req, res)

  // ── monitor mode ────────────────────────────────────────────────────────────
  if (req.query?.mode === 'monitor') return handleMonitor(req, res)

  // ── match-indicators mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'match-indicators') return handleMatchIndicators(req, res)

  // ── hero-matches mode ───────────────────────────────────────────────────────
  if (req.query?.mode === 'hero-matches') return handleHeroMatches(req, res)

  // ── premium-league-ids mode ─────────────────────────────────────────────────
  // Proxy for OpenDota /api/leagues — returns premium league IDs to avoid client-side CORS errors.
  if (req.query?.mode === 'premium-league-ids') {
    try {
      const odRes = await fetch('https://api.opendota.com/api/leagues')
      if (!odRes.ok) return res.status(200).json({ ids: [] })
      const leagues = await odRes.json()
      const ids = [...buildPremiumLeagueIds(leagues)]
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json({ ids })
    } catch { return res.status(200).json({ ids: [] }) }
  }

  // ── heroes-proxy mode ────────────────────────────────────────────────────────
  // Proxy for OpenDota /api/heroes — avoids client-side CORS errors. OpenDota's Cloudflare
  // bot protection can 403 direct browser requests (and drop the CORS header on that 403,
  // which the browser then reports as a CORS failure, not a 403) — server-to-server calls
  // aren't subject to that. Heroes change only on major patches, so cache generously.
  if (req.query?.mode === 'heroes-proxy') {
    try {
      const odRes = await fetch('https://api.opendota.com/api/heroes')
      if (!odRes.ok) return res.status(200).json([])
      const heroes = await odRes.json()
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
      return res.status(200).json(Array.isArray(heroes) ? heroes : [])
    } catch { return res.status(200).json([]) }
  }

  // ── od-live-capture mode ────────────────────────────────────────────────────
  // Snapshots OpenDota /live tier-1 games into live_game_map (Phase 0a). OpenDota-only
  // write trigger — no PandaScore token needed, throttled by its own KV lock. Placed
  // before the PANDASCORE_TOKEN check and the shared s-maxage cache header (it sets its
  // own no-store).
  if (req.query?.mode === 'od-live-capture') return handleLiveOdCapture(req, res)

  // ── promatches-proxy mode ───────────────────────────────────────────────────
  // Proxy for OpenDota /api/promatches — avoids client-side CORS restrictions.
  if (req.query?.mode === 'promatches-proxy') {
    const lessThan = req.query?.less_than
    const odUrl = lessThan
      ? `https://api.opendota.com/api/promatches?less_than_match_id=${lessThan}`
      : 'https://api.opendota.com/api/promatches'
    try {
      const odRes = await fetch(odUrl)
      if (!odRes.ok) return res.status(200).json([])
      return res.status(200).json(await odRes.json())
    } catch { return res.status(200).json([]) }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  const token = process.env.PANDASCORE_TOKEN
  if (!token) return res.status(503).json({ error: 'PANDASCORE_TOKEN not configured' })

  // ── calendar-team mode ──────────────────────────────────────────────────────
  if (req.query?.mode === 'calendar-team') return handleCalendarTeam(req, res)

  // ── calendar-all mode ───────────────────────────────────────────────────────
  if (req.query?.mode === 'calendar-all') return handleCalendarAll(req, res)

  // ── calendar-tournament mode ────────────────────────────────────────────────
  if (req.query?.mode === 'calendar-tournament') return handleCalendarTournament(req, res)

  // ── sync-teams mode ─────────────────────────────────────────────────────────
  if (req.query?.mode === 'sync-teams') return handleSyncTeams(req, res)

  // ── teams mode ───────────────────────────────────────────────────────────────
  if (req.query?.mode === 'teams') return handleTeamsList(req, res)

  // ── tier1-leagues mode ──────────────────────────────────────────────────────
  if (req.query?.mode === 'tier1-leagues') return handleTier1Leagues(req, res)

  // ── match-enrichment mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'match-enrichment') return handleMatchEnrichment(req, res)

  // ── match-formats mode ──────────────────────────────────────────────────────
  if (req.query?.mode === 'match-formats') return handleMatchFormats(req, res)

  // ── match-brackets mode ─────────────────────────────────────────────────────
  if (req.query?.mode === 'match-brackets') return handleMatchBrackets(req, res)

  // ── recent-completed mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'recent-completed') return handleRecentCompleted(req, res)

  // ── live-series-games mode ──────────────────────────────────────────────────
  if (req.query?.mode === 'live-series-games') return handleLiveSeriesGames(req, res)

  // ── live-game-pulse mode (Phase 2) ──────────────────────────────────────────
  if (req.query?.mode === 'live-game-pulse') return handleLiveGamePulse(req, res)

  // ── series mode ─────────────────────────────────────────────────────────────
  if (req.query?.mode === 'series') return handleSeriesList(req, res)

  // ── highlights mode ─────────────────────────────────────────────────────────
  if (req.query?.mode === 'highlights') return handleHighlights(req, res)

  // ── llms-data mode ──────────────────────────────────────────────────────────
  if (req.query?.mode === 'llms-data') return handleLlmsData(req, res)

  // Default: TournamentHub sub-stages
  if (req.query?.bust === '1') {
    await kv.del(KV_LIST_KEY)
    await kv.del(KV_STATUS_KEY)
    log.info('KV cache cleared')
  }

  try {
    const list = await fetchTournamentList(token)
    const statuses = await fetchTournamentStatuses(token)

    const allTournaments = [...new Map([...list.ongoing, ...list.upcoming].map(t => [t.id, t])).values()]
    const withFreshStatus = allTournaments.map(t => ({
      ...t,
      status: statuses[t.id] || t.status,
    }))

    const ongoing = withFreshStatus.filter(t => t.status === 'running')
    const upcoming = withFreshStatus.filter(t => t.status === 'upcoming').slice(0, 5)

    return res.status(200).json({
      ongoing,
      upcoming,
      completed: list.completed || [],
      meta: { listFetchedAt: list.fetchedAt, statusesFresh: Object.keys(statuses).length > 0 },
    })
  } catch (err) {
    log.error('fetch failed', { error: err?.message })
    await trackError('/api/tournaments', 500, err?.message)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

// All handler implementations live in api/_handlers/. This file is the router only.

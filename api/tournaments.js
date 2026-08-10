import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { setCorsHeaders, buildPremiumLeagueIds, trackError, createLogger } from './_shared.js'

import { kv } from './_kv.js'
import { fetchTournamentList, fetchTournamentStatuses, KV_LIST_KEY, KV_STATUS_KEY } from './_handlers/_tournamentUtils.js'

// Handler modules below are dynamic-imported per mode, not statically imported at the top of this
// file (2026-08-02, Fluid Active CPU budget fix — see CONTEXT.md / the memory note on the Vercel
// free-plan CPU cap). This file is a single router for ~24 query-param "modes"; before this
// change every one of them (plus their transitive deps — getSupabaseAdmin/@supabase/supabase-js,
// STRATZ/Liquipedia clients, etc.) was imported eagerly on EVERY request regardless of which mode
// was actually hit, so a cheap call like ?mode=hero-matches paid to load the Supabase SDK and
// every other handler's dependencies too. Runtime logs showed this endpoint dominating invocation
// volume in tight concurrent bursts (many modes fetched in parallel on a single page mount, plus
// SeriesLivePulse's 20s poll), with a meaningful fraction of those bursts being literal cold
// starts — so the eager-import cost was being paid disproportionately often.
//
// Each `import('./_handlers/x.js')` below uses a static string literal specifically so Vercel's
// build-time file tracing (`@vercel/nft`) can still discover and bundle these files into the
// deployed function — a computed/templated specifier would NOT be traced and would 404 at
// runtime. Verified locally with `vercel build` (see the git history around this change) that all
// _handlers/*.js files are present in the built function's file list. Node's ESM loader caches a
// module after its first import within a given warm container, so repeat hits to the same mode (or
// to a different mode that happens to share a dependency) on a warm instance don't re-pay the
// import cost — the win is specifically on cold starts and on modes that were never eagerly needed.
//
// kv/_shared/_tournamentUtils stay statically imported above: kv and _shared's createLogger/
// setCorsHeaders are used unconditionally on every request path (including the default
// TournamentHub branch at the bottom), and _tournamentUtils is that default branch's own direct
// dependency — deferring either would only add an import() await to the hottest, always-taken path
// for no benefit.

export default async function handler(req, res) {
  const log = createLogger('/api/tournaments')
  if (setCorsHeaders(req, res, { allowAll: true })) return

  // Watchability scoring (POST, no PANDASCORE_TOKEN needed)
  if (req.method === 'POST' && req.query?.mode === 'watchability') {
    res.setHeader('Cache-Control', 'private, no-store')
    const { default: handleWatchability } = await import('./_handlers/watchability.js')
    return handleWatchability(req, res)
  }

  // ── match-stats mode ────────────────────────────────────────────────────────
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'match-stats') {
    const { default: handleMatchStats } = await import('./_handlers/matchStats.js')
    return handleMatchStats(req, res)
  }

  // ── match-stratz mode ───────────────────────────────────────────────────────
  // Placed before PANDASCORE_TOKEN check — calls STRATZ, not PandaScore. Separate from
  // match-stats above: STRATZ enrichment (position/role/imp/award) is fetched by the
  // client in parallel, never blocking the OD stats path — see matchStratz.js.
  if (req.query?.mode === 'match-stratz') {
    const { default: handleMatchStratz } = await import('./_handlers/matchStratz.js')
    return handleMatchStratz(req, res)
  }

  // ── tournament-players mode ─────────────────────────────────────────────────
  // Placed before PANDASCORE_TOKEN check — only calls OpenDota, not PandaScore.
  if (req.query?.mode === 'tournament-players') {
    const { default: handleTournamentPlayers } = await import('./_handlers/tournamentPlayers.js')
    return handleTournamentPlayers(req, res)
  }

  // ── monitor mode ────────────────────────────────────────────────────────────
  if (req.query?.mode === 'monitor') {
    const { default: handleMonitor } = await import('./_handlers/monitor.js')
    return handleMonitor(req, res)
  }

  // ── match-indicators mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'match-indicators') {
    const { default: handleMatchIndicators } = await import('./_handlers/matchIndicators.js')
    return handleMatchIndicators(req, res)
  }

  // ── hero-matches mode ───────────────────────────────────────────────────────
  if (req.query?.mode === 'hero-matches') {
    const { default: handleHeroMatches } = await import('./_handlers/heroMatches.js')
    return handleHeroMatches(req, res)
  }

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
  //
  // ALSO piggybacks Live Story's Valve capture onto this same QStash-triggered request (the
  // existing `*/15` od-live-capture schedule — see scripts/setup-qstash-schedules.mjs) rather
  // than adding a dedicated schedule for it. Same pattern SeriesLivePulse already uses elsewhere
  // (folding its own od-live-capture nudge into live-game-pulse's resolve, 2026-08-02, to save an
  // invocation) — reuse an existing reliable trigger instead of minting a new one. Zero new
  // QStash messages/schedules.
  if (req.query?.mode === 'od-live-capture') {
    const { default: handleLiveOdCapture } = await import('./_handlers/liveOdCapture.js')

    // Fully isolated, own try/catch around the dynamic import itself (not just the call) — an
    // earlier version of this piggyback awaited both imports before invoking either handler, so a
    // Live Story import failure (a bug, a bad transitive dep) would have silently skipped the OD
    // capture above entirely. This IIFE starts immediately but is never allowed to affect or
    // delay handleLiveOdCapture's own invocation or response; awaited only AFTER that response is
    // sent, so Vercel doesn't freeze the container before it finishes.
    const liveStoryPromise = (async () => {
      try {
        const { captureLiveStoryOnce } = await import('./_handlers/liveStoryCapture.js')
        await captureLiveStoryOnce(createLogger('/api/tournaments?mode=live-story-capture'))
      } catch (err) {
        log.warn('live story piggyback failed', { error: err?.message })
      }
    })()

    await handleLiveOdCapture(req, res)
    await liveStoryPromise
    return
  }

  // ── live-story-capture mode ─────────────────────────────────────────────────
  // Valve GetLiveLeagueGames capture + event derivation (Live Story, admin-verification phase).
  // Unauthenticated (idempotent, KV-throttled, no user input, no sensitive data). Two triggers:
  // (1) AdminLiveStoryPage.jsx's 15s client poll while the admin page is open — the KV lock
  // (30s TTL) floors the real cadence to ~30s in this case; (2) the od-live-capture branch above,
  // piggybacking every ~15 min via the existing QStash schedule, covering unattended windows.
  if (req.query?.mode === 'live-story-capture') {
    const { captureLiveStoryOnce } = await import('./_handlers/liveStoryCapture.js')
    const result = await captureLiveStoryOnce(createLogger('/api/tournaments?mode=live-story-capture'))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(result)
  }

  // ── live-story-admin mode ───────────────────────────────────────────────────
  // Read-only verification surface for /admin/live-story: last captured pair (for the snapshot
  // inspector), health summary, and per-match event rings. Token-gated like api/pipeline.js's
  // admin endpoints (CRON_SECRET as Bearer) — this is not a security boundary against a
  // determined attacker, it's the same "never linked, never indexed, cheap gate" pattern used
  // everywhere else internal-only data is exposed in this codebase.
  if (req.query?.mode === 'live-story-admin') {
    const auth = req.headers.authorization
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    const { default: handleLiveStoryAdmin } = await import('./_handlers/liveStoryAdmin.js')
    return handleLiveStoryAdmin(req, res)
  }

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
  if (req.query?.mode === 'calendar-team') {
    const { default: handleCalendarTeam } = await import('./_handlers/calendarTeam.js')
    return handleCalendarTeam(req, res)
  }

  // ── calendar-all mode ───────────────────────────────────────────────────────
  if (req.query?.mode === 'calendar-all') {
    const { default: handleCalendarAll } = await import('./_handlers/calendarAll.js')
    return handleCalendarAll(req, res)
  }

  // ── calendar-tournament mode ────────────────────────────────────────────────
  if (req.query?.mode === 'calendar-tournament') {
    const { default: handleCalendarTournament } = await import('./_handlers/calendarTournament.js')
    return handleCalendarTournament(req, res)
  }

  // ── sync-teams mode ─────────────────────────────────────────────────────────
  if (req.query?.mode === 'sync-teams') {
    const { default: handleSyncTeams } = await import('./_handlers/syncTeams.js')
    return handleSyncTeams(req, res)
  }

  // ── teams mode ───────────────────────────────────────────────────────────────
  if (req.query?.mode === 'teams') {
    const { default: handleTeamsList } = await import('./_handlers/teamsList.js')
    return handleTeamsList(req, res)
  }

  // ── tier1-leagues mode ──────────────────────────────────────────────────────
  if (req.query?.mode === 'tier1-leagues') {
    const { default: handleTier1Leagues } = await import('./_handlers/tier1Leagues.js')
    return handleTier1Leagues(req, res)
  }

  // ── match-enrichment mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'match-enrichment') {
    const { default: handleMatchEnrichment } = await import('./_handlers/matchEnrichment.js')
    return handleMatchEnrichment(req, res)
  }

  // ── match-formats mode ──────────────────────────────────────────────────────
  if (req.query?.mode === 'match-formats') {
    const { handleMatchFormats } = await import('./_handlers/matchEnrichment.js')
    return handleMatchFormats(req, res)
  }

  // ── match-brackets mode ─────────────────────────────────────────────────────
  if (req.query?.mode === 'match-brackets') {
    const { handleMatchBrackets } = await import('./_handlers/matchEnrichment.js')
    return handleMatchBrackets(req, res)
  }

  // ── recent-completed mode ───────────────────────────────────────────────────
  if (req.query?.mode === 'recent-completed') {
    const { default: handleRecentCompleted } = await import('./_handlers/recentCompleted.js')
    return handleRecentCompleted(req, res)
  }

  // ── live-series-games mode ──────────────────────────────────────────────────
  if (req.query?.mode === 'live-series-games') {
    const { default: handleLiveSeriesGames } = await import('./_handlers/liveSeriesGames.js')
    return handleLiveSeriesGames(req, res)
  }

  // ── live-game-pulse mode (Phase 2) ──────────────────────────────────────────
  if (req.query?.mode === 'live-game-pulse') {
    const { default: handleLiveGamePulse } = await import('./_handlers/liveGamePulse.js')
    return handleLiveGamePulse(req, res)
  }

  // Valve-sourced live telemetry (score, per-player stats, items, ultimates, towers, barracks,
  // Roshan, draft order + bans). Separate from `live-game-pulse` above, which serves the same
  // surface from OpenDota and carries none of those fields. Fail-closed behind
  // `feature:live-valve-pulse:enabled` — see the handler's gate comment.
  if (req.query?.mode === 'live-valve-pulse') {
    const { default: handleLiveValvePulse } = await import('./_handlers/liveValvePulse.js')
    return handleLiveValvePulse(req, res)
  }

  // Both of the above in ONE request/invocation — what SeriesLivePulse.jsx actually polls. The two
  // standalone modes above are kept for the admin console and any external caller. See
  // livePulseCombined.js for why the merge is safe w.r.t. their independent failure modes.
  if (req.query?.mode === 'live-pulse') {
    const { default: handleLivePulseCombined } = await import('./_handlers/livePulseCombined.js')
    return handleLivePulseCombined(req, res)
  }

  // ── series mode ─────────────────────────────────────────────────────────────
  if (req.query?.mode === 'series') {
    const { default: handleSeriesList } = await import('./_handlers/seriesList.js')
    return handleSeriesList(req, res)
  }

  // ── highlights mode ─────────────────────────────────────────────────────────
  if (req.query?.mode === 'highlights') {
    const { default: handleHighlights } = await import('./_handlers/highlights.js')
    return handleHighlights(req, res)
  }

  // ── llms-data mode ──────────────────────────────────────────────────────────
  if (req.query?.mode === 'llms-data') {
    const { default: handleLlmsData } = await import('./_handlers/llmsData.js')
    return handleLlmsData(req, res)
  }

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
    await trackError('/api/tournaments', 500, err?.message, err)
    return res.status(500).json({ error: 'Failed to fetch tournament data', message: err?.message })
  }
}

// All handler implementations live in api/_handlers/. This file is the router only.

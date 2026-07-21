import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import SearchBar from "./components/SearchBar"
import MatchList from "./components/MatchList"
import HomeFeed from "./components/HomeFeed"
import MatchDrawer from "./components/MatchDrawer"
import LiveSeriesSheet from "./components/LiveSeriesSheet"
import XPostsModal from "./components/XPostsModal"
import RedditPostsModal from "./components/RedditPostsModal"
import SearchSuggestions, { addRecentSearch } from "./components/SearchSuggestions"
import ManageTeamsModal, { MANAGE_TEAMS_OPEN_EVENT } from "./components/ManageTeamsModal"
import { fetchProMatches, findTwitchVod, fetchMatchStreams, fetchMatchSummary, fetchStoredReplay, resolveHeroByName } from "./api"
import { isVodExpired, degradeExpiredOthers, dedupOthersAgainstPrimary, resolvableStoredMain } from "./vodStreams"
import SiteHeader from "./components/SiteHeader"
import BottomTabBar from "./components/BottomTabBar"
import SiteFooter from "./components/SiteFooter"
import { formatDuration, getFollowedTeams, setFollowedTeams, trackEvent, getSeriesWins, getSummaryFromCache, setSummaryInCache, STORAGE_KEYS, groupIntoSeries, buildSeriesGroups, isSeriesComplete, hasPriorFootprint, orderSeriesGames } from "./utils"
import { getPushPermission, subscribeToPush } from "./utils/push"

const JUST_ENDED_ENABLED = true

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function getMatchSlug(match) {
  return [
    slugify(match.radiantTeam),
    "vs",
    slugify(match.direTeam),
    slugify(match.tournament),
    match.id,
  ].filter(Boolean).join("-")
}

// Fetch a single match from OpenDota and map it into the app's match shape.
// Shared by the shared-URL loader and handleSelectMatchId (series-game replay nav) —
// both need the same OpenDota match object turned into the same fields.
async function fetchAppMatchFromOpenDota(matchId) {
  const data = await fetch(`https://api.opendota.com/api/matches/${matchId}`).then(r => r.json())
  if (!data || !data.match_id) return null
  return {
    id: String(data.match_id),
    tournament: data.league?.name || "Match " + data.match_id,
    date: new Date(data.start_time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    radiantTeam: data.radiant_name || "Radiant",
    direTeam: data.dire_name || "Dire",
    radiantScore: data.radiant_score,
    direScore: data.dire_score,
    radiantWin: data.radiant_win,
    duration: new Date((data.duration || 0) * 1000).toISOString().slice(11, 16),
    startTime: data.start_time,
    seriesId: data.series_id,
    seriesType: data.series_type,
  }
}

// Extract match ID from /match/<slug-ending-in-matchId> or legacy #match-:id hash
function getMatchIdFromUrl() {
  if (typeof window === "undefined") return null
  const pathMatch = window.location.pathname.match(/^\/match\/.*?(\d+)\/?$/)
  if (pathMatch) return pathMatch[1]
  const hash = window.location.hash
  const hashMatch = hash?.match(/^#match-(\d+)/)
  if (hashMatch) return hashMatch[1]
  return null
}

async function resolveMatchStreams(match, allMatches) {
  // Supabase-first. A persisted start-point VOD (filled by vod-enrich) is the
  // permanent source of truth and avoids the channel-resolution + Helix
  // round-trips; the stored row also carries every other recorded stream (all
  // languages, official + co-streams), returned as the separate otherStreams
  // field in every outcome — never merged into allVods (allVods[0] anchors
  // GoldGraph event links and Copy VOD link, and must stay the primary slot).
  // Only a timestamped start-point main counts as a complete hit; everything
  // else (not yet enriched, live/recent, no record, Supabase down/timeout)
  // falls through to the LOCKED live resolver below, fully unchanged.
  // Stored start points older than the Twitch archive window (~55d) are
  // probable dead links: the main is ignored and others degrade to channel
  // pages rather than advertising a jump that 404s.
  const stored = await fetchStoredReplay(match.id)
  const expired = isVodExpired(match.startTime)
  const storedOthers = expired ? degradeExpiredOthers(stored?.others) : (stored?.others || [])

  const resolvedMain = resolvableStoredMain(stored, expired)
  if (resolvedMain) {
    trackEvent('replay_source', {
      source: resolvedMain.source === 'twitch' ? 'supabase' : 'supabase_stream_page',
      matchId: match.id,
    })
    return {
      url: resolvedMain.url,
      channel: resolvedMain.channel,
      allVods: [resolvedMain],
      otherStreams: dedupOthersAgainstPrimary([resolvedMain], storedOthers),
    }
  }

  const siblingMatches = match.seriesId
    ? allMatches.filter(m => String(m.seriesId) === String(match.seriesId) && !m.unplayed)
    : [match]
  const siblingIds = siblingMatches.map(m => m.id)
  const idsToFetch = siblingIds.length > 0 ? siblingIds : [match.id]
  // Each sibling's OWN start time, so the resolver persists per-game started_at
  // instead of stamping every sibling with this clicked game's ts.
  const startTimes = {}
  for (const m of siblingMatches) { if (m.startTime != null) startTimes[m.id] = m.startTime }
  const streamMap = await fetchMatchStreams(idsToFetch, match.startTime, match.radiantTeam, match.direTeam, startTimes)

  const resolvedChannels = idsToFetch.map(id => streamMap[id]).filter(Boolean)
  const uniqueChannels = [...new Set(resolvedChannels)]
  // Fall back to ts-bucket candidates when no definitive channel was found.
  // Only use the candidate if exactly one channel was live in that window —
  // multiple candidates means we can't reliably assign one to this match.
  let preferredChannel = uniqueChannels.length === 1 ? uniqueChannels[0] : null
  if (!preferredChannel && Array.isArray(streamMap._candidates) && streamMap._candidates.length === 1) {
    preferredChannel = streamMap._candidates[0]
  }

  const vod = await findTwitchVod(match.startTime, match.tournament, preferredChannel)
  trackEvent('replay_source', { source: vod?.url ? 'kv_fallback' : 'none', matchId: match.id })
  // The chain's result keeps the primary slot untouched; stored others travel
  // separately so a co-stream can never become allVods[0] (GoldGraph anchor).
  return {
    url: vod?.url || null,
    channel: vod?.channel || null,
    allVods: vod?.allVods || [],
    otherStreams: dedupOthersAgainstPrimary(vod?.allVods || [], storedOthers),
  }
}

function usePullToRefresh(onRefresh) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)
  const pullingRef = useRef(0)
  const isRefreshing = useRef(false)
  const THRESHOLD = 72

  const isStandalone = useMemo(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true),
  [])

  // In standalone PWA mode, keep overscroll-behavior disabled for the entire session.
  // Without this, iOS Safari claims pull-down gestures for its elastic bounce animation
  // and our touchmove events stop firing — breaking PTR after any modal closes.
  useEffect(() => {
    if (!isStandalone) return
    document.body.style.overscrollBehavior = 'none'
    return () => { document.body.style.overscrollBehavior = '' }
  }, [isStandalone])

  useEffect(() => {
    if (!isStandalone) return

    function onTouchStart(e) {
      // Don't initiate PTR when a modal/drawer is open — touches inside the dialog
      // would otherwise race with initialLoading and blank the drawer
      if (e.target.closest('[role="dialog"]')) return
      // Use <= 0 to handle iOS Safari sub-pixel scroll positions
      if (window.scrollY <= 0) startY.current = e.touches[0].clientY
    }

    function onTouchMove(e) {
      if (startY.current === null || window.scrollY > 0) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0) {
        pullingRef.current = Math.min(delta, THRESHOLD * 1.5)
        setPullDistance(pullingRef.current)
      }
    }

    function onTouchEnd() {
      if (pullingRef.current >= THRESHOLD && !isRefreshing.current) {
        isRefreshing.current = true
        setRefreshing(true)
        setPullDistance(0)
        pullingRef.current = 0
        Promise.resolve(onRefresh()).finally(() => {
          isRefreshing.current = false
          setRefreshing(false)
        })
      } else {
        pullingRef.current = 0
        setPullDistance(0)
      }
      startY.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isStandalone, onRefresh])

  return { pullDistance, refreshing, THRESHOLD }
}

function App() {
  const [allMatches, setAllMatches] = useState([])
  const [nextMatchId, setNextMatchId] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [initialLoading, setInitialLoading] = useState(true)
  const [matchUrlNotFound, setMatchUrlNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [drawerSource, setDrawerSource] = useState('unknown')
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [summaryMatchId, setSummaryMatchId] = useState(null)
  const [summaryError, setSummaryError] = useState(null)
  const [summaryErrorMatchId, setSummaryErrorMatchId] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [cachedSummaryForSelected, setCachedSummaryForSelected] = useState(null)
  const [seriesFilter, setSeriesFilter] = useState("all")
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [expandedSeriesId, setExpandedSeriesId] = useState(null)
  const isOwner = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEYS.OWNER) === "true"

  // Live + upcoming data
  const [liveMatches, setLiveMatches] = useState([])
  const [upcomingMatches, setUpcomingMatches] = useState([])
  const [liveLoading, setLiveLoading] = useState(true)
  const [justEndedSeries, setJustEndedSeries] = useState([])
  const allMatchesRef = useRef([])
  const lastPsGamesRef = useRef([])

  // Mid-series side sheet (PS data while series is running)
  const [selectedLiveSeries, setSelectedLiveSeries] = useState(null)
  // OD match id currently being fetched for a tap-through from the live sheet to a finished
  // game's MatchDrawer (e.g. clicking "G1" while G2 is live) — keeps the sheet open with an
  // inline loading state instead of closing to a bare homepage while the fetch is in flight.
  const [liveReplayLoadingId, setLiveReplayLoadingId] = useState(null)
  // Bumped whenever the live sheet is dismissed or swapped to a different series, so a replay
  // fetch that resolves afterward can tell it's stale and skip opening MatchDrawer.
  const liveReplayTokenRef = useRef(0)
  // ?live=<psSeriesId> restore-on-refresh target. Captured ONCE at mount (see the effect below)
  // — NOT re-derived from window.location.search on every poll, because handleSelectLiveMatch
  // itself writes ?live= on every open (including a plain click), and re-reading the live URL
  // from an ambient-poll-driven effect would misread that write as a restore request on the next
  // poll tick, double-firing the open. Capturing once at mount, before any click can occur, is
  // what actually prevents that.
  const [liveRestoreId, setLiveRestoreId] = useState(null)

  // Push-notification landing (WS4): ?m=<psSeriesId> from a tapped starting-soon/now-live
  // notification. pushTargetId holds the target until live data arrives; highlightMatchId
  // drives the transient amber pulse on the My Teams feed row.
  const [pushTargetId, setPushTargetId] = useState(null)
  const [highlightMatchId, setHighlightMatchId] = useState(null)

  // Tournament name → PandaScore ID map (for inline TournamentHub expand)
  const [tournamentIdMap, setTournamentIdMap] = useState(new Map())

  // Search overlay
  const [searchOpen, setSearchOpen] = useState(false)

  const [xPostsOpen, setXPostsOpen] = useState(false)
  const [xPostsSeries, setXPostsSeries] = useState(null)
  const [xPosts, setXPosts] = useState(null)
  const [xPostsSummaryPost, setXPostsSummaryPost] = useState(null)
  const [xPostsSeriesImageUrl, setXPostsSeriesImageUrl] = useState(null)
  const [xPostsLoading, setXPostsLoading] = useState(false)
  const [xPostsError, setXPostsError] = useState(null)

  const [redditPostsOpen, setRedditPostsOpen] = useState(false)
  const [redditPostsSeries, setRedditPostsSeries] = useState(null)
  const [redditMatchPost, setRedditMatchPost] = useState(null)
  const [redditDayComment, setRedditDayComment] = useState(null)
  const [redditPostsLoading, setRedditPostsLoading] = useState(false)
  const [redditPostsError, setRedditPostsError] = useState(null)

  // Captures which branch the spoiler-free initializer took, for analytics.
  const spoilerVariantRef = useRef("first_run")
  const [spoilerFree, setSpoilerFree] = useState(() => {
    if (typeof window === "undefined") return false
    const set = v => { try { localStorage.setItem(STORAGE_KEYS.SPOILER_FREE, String(v)) } catch {} }
    const params = new URLSearchParams(window.location.search)
    if (params.get('spoilers') === 'off') { spoilerVariantRef.current = "url"; set(true);  return true }   // existing behavior — keep
    if (params.get('spoilers') === 'on')  { spoilerVariantRef.current = "url"; set(false); return false }  // NEW symmetric force-show
    let stored = null
    try { stored = localStorage.getItem(STORAGE_KEYS.SPOILER_FREE) } catch {}  // localStorage can throw in private-browsing modes
    if (stored !== null) { spoilerVariantRef.current = "explicit"; return stored === "true" }          // explicit choice → honor
    if (hasPriorFootprint()) { spoilerVariantRef.current = "legacy_returning"; return false }           // returning user, never chose → legacy scores-shown
    spoilerVariantRef.current = "first_run"
    return true                                             // brand-new → spoiler-free ON
  })

  // First-run spoiler nudge: only for the brand-new path, and only once ever.
  const [showSpoilerNudge, setShowSpoilerNudge] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('spoilers') === 'off' || params.get('spoilers') === 'on') return false
      if (localStorage.getItem(STORAGE_KEYS.SPOILER_FREE) !== null) return false
      if (hasPriorFootprint()) return false
      if (localStorage.getItem(STORAGE_KEYS.SPOILER_NUDGE_DISMISSED) === "1") return false
      return true
    } catch {
      return false
    }
  })

  const [followedTeams, setFollowedTeamsState] = useState(() => getFollowedTeams())
  const [manageTeamsOpen, setManageTeamsOpen] = useState(false)
  const [showCalendarNudge, setShowCalendarNudge] = useState(false)

  function handleToggleFollow(teamName) {
    setFollowedTeamsState(prev => {
      const isFollowed = prev.includes(teamName)
      const next = isFollowed ? prev.filter(t => t !== teamName) : [...prev, teamName]
      setFollowedTeams(next)
      if (!isFollowed && (next.length === 1 || next.length === 2)) {
        try {
          if (!localStorage.getItem(STORAGE_KEYS.CALENDAR_NUDGE_DISMISSED)) {
            setShowCalendarNudge(true)
          }
        } catch {}
      }
      if (getPushPermission() === 'granted') {
        try {
          if (localStorage.getItem(STORAGE_KEYS.PUSH_DISABLED) !== '1') {
            subscribeToPush(next).catch(() => {})
          }
        } catch {
          // localStorage unavailable; skip push update to avoid re-enabling when disabled
        }
      }
      return next
    })
  }

  function dismissCalendarNudge() {
    setShowCalendarNudge(false)
    try { localStorage.setItem(STORAGE_KEYS.CALENDAR_NUDGE_DISMISSED, '1') } catch {}
  }

  function dismissSpoilerNudge() {
    setShowSpoilerNudge(false)
    try { localStorage.setItem(STORAGE_KEYS.SPOILER_NUDGE_DISMISSED, '1') } catch {}
  }

  // Spoiler default analytics + visit stamp + multi-tab sync (runs once on mount).
  useEffect(() => {
    trackEvent("spoiler_default_applied", { variant: spoilerVariantRef.current })
    try { localStorage.setItem(STORAGE_KEYS.HAS_VISITED, "true") } catch {}
    const onStorage = e => {
      if (e.key === STORAGE_KEYS.SPOILER_FREE) {
        setSpoilerFree(e.newValue === "true")
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // Fire shown event once when the first-run nudge first renders.
  useEffect(() => {
    if (showSpoilerNudge) trackEvent("spoiler_nudge_shown")
  }, [showSpoilerNudge])
  const searchInputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const [liveQuery, setLiveQuery] = useState('')

  const loadMatches = useCallback(() => {
    setError(null)
    setInitialLoading(true)
    return fetchProMatches()
      .then(({ matches, nextMatchId }) => {
        setAllMatches(matches)
        setNextMatchId(nextMatchId)
        setInitialLoading(false)
      })
      .catch(() => {
        setError("Could not load matches - OpenDota may be temporarily down. Try again in a moment.")
        setInitialLoading(false)
      })
  }, [])

  function groupPsGamesIntoSeries(games) {
    const byId = {}
    for (const g of games) {
      if (!g.seriesId) continue
      if (!byId[g.seriesId]) byId[g.seriesId] = []
      byId[g.seriesId].push(g)
    }
    return Object.values(byId).map(gs => ({
      id: `ps-${gs[0].seriesId}`,
      games: gs,
      tournament: gs[0].tournament,
      seriesType: gs[0].seriesType,
      _pandaMatchId: gs[0]._pandaMatchId,
      _fromPandaScore: true,
    }))
  }

  function buildVisibleJustEnded(psGames, currentAllMatches) {
    const psSeries = groupPsGamesIntoSeries(psGames)
    // Use complete OD series (not raw allMatches) so that games OD indexes with mismatched
    // series_ids — present in allMatches but never forming a displayable complete series —
    // don't falsely suppress the PS Just Ended entry.
    const completedOdSeries = groupIntoSeries(currentAllMatches).filter(isSeriesComplete)
    const completedOdIds = new Set(completedOdSeries.flatMap(s => s.games.map(g => String(g.id))))
    return psSeries.filter(entry => {
      const resolved = entry.games.map(g => g.id).filter(id => !id.startsWith('_ps-'))
      if (resolved.length > 0 && resolved.some(id => completedOdIds.has(id))) return false
      // Resolved IDs exist but none in a complete OD series (stale/wrong IDs from time
      // collision, or OD split the series across different series_ids) — fall through to
      // team-name check against complete OD series only.
      const psTeams = [entry.games[0]?.radiantTeam, entry.games[0]?.direTeam]
        .map(t => (t || '').toLowerCase()).filter(Boolean)
      if (psTeams.length < 2) return true
      const psTime = entry.games[0]?.startTime || 0
      const sub = (x, y) => x.includes(y) || y.includes(x)
      return !completedOdSeries.some(s => {
        if (Math.abs((s.games[0]?.startTime || s.startTime || 0) - psTime) > 3600) return false
        const r = (s.games[0]?.radiantTeam || '').toLowerCase()
        const d = (s.games[0]?.direTeam || '').toLowerCase()
        return (sub(psTeams[0], r) || sub(psTeams[0], d)) && (sub(psTeams[1], r) || sub(psTeams[1], d))
      })
    })
  }

  const fetchJustEnded = useCallback(async () => {
    if (!JUST_ENDED_ENABLED) return
    try {
      const res = await fetch('/api/tournaments?mode=recent-completed')
      if (!res.ok) return
      const { games } = await res.json()
      if (!Array.isArray(games)) return
      lastPsGamesRef.current = games
      setJustEndedSeries(buildVisibleJustEnded(games, allMatchesRef.current))
    } catch {}
  }, [])

  const fetchLiveData = useCallback(async () => {
    try {
      const [liveRes, upcomingRes] = await Promise.all([
        fetch("/api/live-matches").then(r => r.json()),
        fetch("/api/upcoming-matches").then(r => r.json()),
      ])
      setLiveMatches(liveRes.matches || [])
      setUpcomingMatches(upcomingRes.matches || [])
      // Phase 0b: while a game is actually running, nudge the OpenDota /live capture so
      // finished games in a live series reliably get their OD match_id mid-series. This is
      // the primary (0-QStash-cost) trigger; a server-side KV lock throttles the real
      // /live fetch to ~once per 2 min regardless of how many clients ping. Fire-and-forget.
      const hasRunningGame = (liveRes.matches || []).some(m =>
        (m.games || []).some(g => g.status === 'running')
      )
      if (hasRunningGame) {
        fetch('/api/tournaments?mode=od-live-capture').catch(() => {})
      }
    } catch {}
    setLiveLoading(false)
  }, [])

  const refreshAll = useCallback(() => {
    return Promise.all([loadMatches(), fetchLiveData(), fetchJustEnded()])
  }, [loadMatches, fetchLiveData, fetchJustEnded])

  const { pullDistance, refreshing, THRESHOLD } = usePullToRefresh(refreshAll)

  // Read ?q= param from URL so "Find VODs" links from tournament detail pages work
  const initialSearchQuery = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("q") || ""
    : ""
  // ?search=1 is set by HeroPage when the user clicks the search icon — open overlay with no pre-filled query
  const openSearchOnLoad = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("search")

  useEffect(() => {
    allMatchesRef.current = allMatches
    if (JUST_ENDED_ENABLED && lastPsGamesRef.current.length > 0) {
      setJustEndedSeries(buildVisibleJustEnded(lastPsGamesRef.current, allMatches))
    }
  }, [allMatches])

  useEffect(() => {
    loadMatches()
    fetchLiveData()
    fetchJustEnded()
    const liveInterval = setInterval(fetchLiveData, 2 * 60 * 1000)
    const justEndedInterval = setInterval(fetchJustEnded, 5 * 60 * 1000)
    return () => { clearInterval(liveInterval); clearInterval(justEndedInterval) }
  }, [loadMatches, fetchLiveData, fetchJustEnded])

  // Build tournament name → ID map for inline TournamentHub expand.
  // Store both the raw PandaScore name AND the display-transformed name so that
  // upcoming-matches.js's buildTournamentName output ("DreamLeague S29") matches
  // the raw PandaScore key ("DreamLeague Season 29").
  useEffect(() => {
    fetch("/api/tournaments")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const transformName = name => name
          .replace(/\bseason\s+(\d+)\b/gi, 'S$1')
          .replace(/\s+\d{4}$/, '')
          .trim()
        const map = new Map()
        ;[...(d.ongoing || []), ...(d.upcoming || []), ...(d.completed || [])].forEach(t => {
          if (t.name && t.id) {
            map.set(t.name, t.id)
            map.set(transformName(t.name), t.id)
          }
        })
        setTournamentIdMap(map)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!initialLoading && initialSearchQuery) {
      setSearchOpen(true)
      handleSearch(initialSearchQuery)
    } else if (!initialLoading && openSearchOnLoad) {
      setSearchOpen(true)
    }
    // Only run once after initial load completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading])

  // Open Manage Teams from anywhere: the window event covers same-page opens
  // (SettingsSheet, follow callout); the ?manage-teams=1 param covers cross-page
  // navigation (e.g. Settings on /news links to /?manage-teams=1).
  useEffect(() => {
    const onOpen = () => setManageTeamsOpen(true)
    window.addEventListener(MANAGE_TEAMS_OPEN_EVENT, onOpen)
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('manage-teams') === '1') {
        setManageTeamsOpen(true)
        params.delete('manage-teams')
        const qs = params.toString()
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
      }
    } catch {}
    return () => window.removeEventListener(MANAGE_TEAMS_OPEN_EVENT, onOpen)
  }, [])

  // Refresh the push subscription once per visit. All push:* KV keys carry a 90-day TTL;
  // without this, a subscriber who visits often but never touches follows/settings would
  // silently expire. Same guards as the follow-toggle re-subscribe (granted + not disabled).
  useEffect(() => {
    if (getPushPermission() !== 'granted') return
    try {
      if (localStorage.getItem(STORAGE_KEYS.PUSH_DISABLED) === '1') return
    } catch { return } // localStorage unavailable: can't verify the disabled flag, so don't re-enable
    subscribeToPush(getFollowedTeams()).catch(() => {})
  }, [])

  // Push-open attribution + landing target (WS4/WS6). Notifications deep-link with
  // ?m=<psSeriesId>&from=push&pt=<type> (see buildPushPayload in api/live-matches.js).
  // Track the open, capture the target, then strip the params so a refresh or share of
  // the landed URL doesn't re-fire the event (spoilers= and q= are preserved).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromPush = params.get('from') === 'push'
    const m = params.get('m')
    if (!fromPush && !m) return
    if (fromPush) {
      trackEvent('push_opened', { type: params.get('pt') || 'unknown', matchId: m || getMatchIdFromUrl() || null })
    }
    if (m) setPushTargetId(m)
    params.delete('m'); params.delete('from'); params.delete('pt')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
  }, [])

  // Land the push target once live/upcoming data arrives: open the mid-series sheet when
  // the series has a finished game (stream + catch-up VODs in one tap), else pulse the
  // My Teams feed row. Consumed exactly once — a match that's in neither list (ended,
  // canceled, tier drift) degrades to the plain homepage.
  useEffect(() => {
    if (!pushTargetId || liveLoading) return
    const live = liveMatches.find(mm => String(mm.id) === pushTargetId)
    const upcoming = upcomingMatches.find(mm => String(mm.id) === pushTargetId)
    setPushTargetId(null)
    if (live && (live.games || []).some(g => g.status === 'finished')) {
      handleSelectLiveMatch(live.id)
    } else if (live || upcoming) {
      setHighlightMatchId(pushTargetId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushTargetId, liveLoading, liveMatches, upcomingMatches])

  // Keep an open live-series sheet fresh: re-sync `selectedLiveSeries` from each ambient
  // liveMatches poll (fetchLiveData, every 2 min) so game-status transitions (a game finishing,
  // a new one starting) and newly-resolved matchIds reach the open sheet without the user having
  // to close and reopen it. Deliberately does nothing if the series disappears from liveMatches
  // (fully concluded) — keeps showing its last-known state rather than yanking the sheet away
  // mid-read; the user closes it explicitly.
  useEffect(() => {
    if (!selectedLiveSeries) return
    const fresh = liveMatches.find(m => String(m.id) === String(selectedLiveSeries.id))
    if (fresh) setSelectedLiveSeries(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatches])

  // Capture ?live=<psSeriesId> from the URL exactly ONCE, at mount — mirrors the ?m= push-landing
  // capture above ([] deps, read-then-strip-nothing). This must NOT be re-read from
  // window.location.search on every liveMatches poll: handleSelectLiveMatch itself writes ?live=
  // on every open (including a plain click), so an effect that re-checks the live URL each poll
  // would misread that write as a fresh restore request on the very next tick and double-fire the
  // open (and its trackEvent). Capturing once here, before any click can happen, prevents that.
  useEffect(() => {
    const liveId = new URLSearchParams(window.location.search).get('live')
    if (liveId) setLiveRestoreId(liveId)
  }, [])

  // Consume the captured restore target once live data has arrived. Mirrors pushTargetId's
  // consumption pattern exactly: nulled after one attempt regardless of outcome (accepting the
  // same one-shot-on-first-try tradeoff already established for push landings elsewhere in this
  // file) — handleSelectLiveMatch itself no-ops silently if the series isn't found yet or has no
  // finished game.
  useEffect(() => {
    if (!liveRestoreId || liveLoading) return
    setLiveRestoreId(null)
    handleSelectLiveMatch(liveRestoreId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRestoreId, liveLoading, liveMatches])

  // Fade the highlight ring after 4s. Separate effect: the consumption effect above
  // nulls pushTargetId (its own dep), so a timer owned there would be torn down by its
  // cleanup on the very next render and the ring would never clear.
  useEffect(() => {
    if (!highlightMatchId) return
    const t = setTimeout(() => setHighlightMatchId(null), 4000)
    return () => clearTimeout(t)
  }, [highlightMatchId])

  // Handle share URL on load — supports both /match/:id and legacy #match-:id
  useEffect(() => {
    if (initialLoading) return
    const matchId = getMatchIdFromUrl()
    if (!matchId) return

    trackEvent("shared_match_open", { matchId, source: window.location.pathname.startsWith("/match/") ? "path" : "hash" })

    const found = allMatches.find(m => m.id === matchId)
    if (found) {
      handleSelectMatch(found, 'shared_url')
      return
    }

    fetchAppMatchFromOpenDota(matchId)
      .then(match => {
        if (!match) {
          setMatchUrlNotFound(true)
          return
        }
        handleSelectMatch(match, 'shared_url')
      })
      .catch(() => { setMatchUrlNotFound(true) })
  }, [initialLoading])

  useEffect(() => {
    if (!matchUrlNotFound) return
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'noindex, nofollow')
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [matchUrlNotFound])

  async function handleLoadMore() {
    if (loadingMore || !nextMatchId) return
    setLoadingMore(true)
    trackEvent("load_more", { searchQuery: searchQuery || "homepage" })
    try {
      const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(nextMatchId)
      setAllMatches(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const dedupedNew = newMatches.filter(m => !existingIds.has(m.id))
          return [...prev, ...dedupedNew]
        })
      setNextMatchId(newNextId)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleSearchLoadMore() {
    if (loadingMore || !nextMatchId) return
    setLoadingMore(true)
    trackEvent("search_load_more", { searchQuery })
    const q = searchQuery
    let currentNextId = nextMatchId
    let iterations = 0
    try {
      while (currentNextId && iterations < 20) {
        iterations++
        const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(currentNextId)
        setAllMatches(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const dedupedNew = newMatches.filter(m => !existingIds.has(m.id))
          return [...prev, ...dedupedNew]
        })
        setNextMatchId(newNextId)
        currentNextId = newNextId
        const hasNewMatch = newMatches.some(m =>
          m.radiantTeam?.toLowerCase().includes(q) ||
          m.direTeam?.toLowerCase().includes(q) ||
          m.tournament?.toLowerCase().includes(q)
        )
        if (hasNewMatch || !newNextId) break
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleSearch(query) {
    setLoading(true)
    setSelectedMatch(null)
    const trimmed = query.trim()
    const q = trimmed.toLowerCase()
    addRecentSearch(trimmed)

    // Check if the query resolves to a hero name — if so, navigate to the hero page
    // instead of doing a team/tournament search. resolveHeroByName uses the cached
    // hero list so this is instant on repeat calls.
    const hero = await resolveHeroByName(q).catch(() => null)
    if (hero) {
      trackEvent('hero_search', { hero_id: hero.id, hero_name: hero.name, query: q })
      window.location.href = `/heroes/${hero.key}`
      return
    }

    setSearchQuery(q)
    trackEvent("search", { query: q })
    setTimeout(() => {
      setLoading(false)
      setSearched(true)
    }, 300)
  }

  function handleSuggestionSelect(query) {
    searchInputRef.current?.setValue(query)
    handleSearch(query)
  }

  function handleClearSearch() {
    setSearched(false)
    setSearchQuery("")
    setSelectedMatch(null)
    setError(null)
    setLiveQuery('')
    setTimeout(() => { if (window.matchMedia('(hover: hover)').matches) searchInputRef.current?.focus() }, 0)
  }

  function handleSearchKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      suggestionsRef.current?.moveDown()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      suggestionsRef.current?.moveUp()
    } else if (e.key === 'Enter') {
      if (suggestionsRef.current?.selectHighlighted()) {
        e.preventDefault() // suggestion handled it — don't also submit the form
      }
    }
  }

  async function handleSelectMatch(match, source = 'homepage_feed') {
    setDrawerSource(source)
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(false)

    if (match.unplayed) {
      setSelectedMatch(match)
      return
    }

    window.history.replaceState(null, "", "/match/" + getMatchSlug(match))

    trackEvent("match_click", {
      matchId: match.id,
      radiantTeam: match.radiantTeam,
      direTeam: match.direTeam,
      tournament: match.tournament,
      source,
    })

    if (match.seriesId && !match._skipExpand) setExpandedSeriesId(String(match.seriesId))
    setSelectedMatch({ ...match, loadingVod: true })

    const { url, channel, allVods, otherStreams } = await resolveMatchStreams(match, allMatches)
    setSelectedMatch({ ...match, loadingVod: false, url, channel, allVods, otherStreams })
  }

  function handleOpenSeries(series) {
    handleSelectMatch(series.games[0])
  }

  async function handleSummarize(match) {
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setSummaryLoading(true)
    trackEvent("summary_click", {
      matchId: match.id,
      radiantTeam: match.radiantTeam,
      direTeam: match.direTeam,
      tournament: match.tournament,
    })
    try {
      const result = await fetchMatchSummary(match.id)
      setSummaryMatchId(match.id)
      setSummary(result)
      setSummaryInCache(match.id, result)
      if (selectedMatch?.id === match.id) setCachedSummaryForSelected(result)
    } catch (err) {
      setSummaryErrorMatchId(match.id)
      setSummaryError(err?.message || "Failed to generate summary")
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleSelectMatchId(matchId, source = 'replay') {
    try {
      const match = await fetchAppMatchFromOpenDota(matchId)
      if (!match) return
      handleSelectMatch(match, source)
    } catch {
      // silently fail
    }
  }

  function handleSelectLiveMatch(pandaScoreMatchId) {
    // String comparison (not ===) so this also works when called with a raw string id from the
    // ?live= URL restore below — mirrors the existing push-landing lookup (`String(mm.id) === pushTargetId`).
    const match = liveMatches.find(m => String(m.id) === String(pandaScoreMatchId))
    if (!match) return
    trackEvent('live_series_sheet_open', { teamA: match.teamA, teamB: match.teamB, tournament: match.tournament })
    // Opening a (possibly different) series' sheet invalidates any replay fetch still in flight
    // from whatever sheet was open before, so its result can't land in the wrong sheet and so
    // this sheet doesn't inherit a stale "all rows disabled" loading state that belongs to it.
    liveReplayTokenRef.current++
    setLiveReplayLoadingId(null)
    setSelectedLiveSeries(match)
    // Persist so a refresh (or a shared link) restores the same sheet — live series have no
    // dedicated URL like completed matches do (/match/:id).
    const params = new URLSearchParams(window.location.search)
    params.set('live', String(match.id))
    window.history.replaceState(null, '', window.location.pathname + '?' + params.toString() + window.location.hash)
  }

  function closeLiveSeriesSheet() {
    // Invalidate any replay fetch still in flight so it can't reopen MatchDrawer after the user
    // has already dismissed the sheet (see handleLiveSeriesReplay's token check).
    liveReplayTokenRef.current++
    setLiveReplayLoadingId(null)
    setSelectedLiveSeries(null)
    const params = new URLSearchParams(window.location.search)
    if (!params.has('live')) return
    params.delete('live')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)
  }

  async function handleLiveSeriesReplay(odMatchId) {
    if (liveReplayLoadingId) return // a replay fetch is already in flight — ignore extra clicks
    trackEvent('live_series_replay', { odMatchId })
    const token = ++liveReplayTokenRef.current
    setLiveReplayLoadingId(odMatchId)
    try {
      const match = await fetchAppMatchFromOpenDota(odMatchId)
      if (!match) return // silently fail, same as handleSelectMatchId — sheet stays open
      // If the sheet was dismissed or swapped to a different series while this fetch was in
      // flight, closeLiveSeriesSheet/handleSelectLiveMatch already bumped the token — bail out
      // instead of forcing MatchDrawer open on top of whatever the user is doing now.
      if (liveReplayTokenRef.current !== token) return
      // Close the live sheet and open the MatchDrawer in the same tick so React batches them
      // into one render: no frame where neither is mounted (which used to flash the bare
      // homepage while the fetch above was in flight).
      closeLiveSeriesSheet()
      handleSelectMatch(match, 'live_series_replay')
    } catch {
      // silently fail — sheet stays open
    } finally {
      if (liveReplayTokenRef.current === token) setLiveReplayLoadingId(null)
    }
  }

  async function handleDraftPosts(series) {
    setXPostsSeries(series)
    setXPosts(null)
    setXPostsSummaryPost(null)
    setXPostsSeriesImageUrl(null)
    setXPostsError(null)
    setXPostsLoading(true)
    setXPostsOpen(true)

    try {
      const gameIds = series.games.map(g => g.id)
      const streamMap = await fetchMatchStreams(gameIds)

      const vodResults = await Promise.all(
        series.games.map(game =>
          findTwitchVod(game.startTime, game.tournament, streamMap[game.id] || null).catch(() => null)
        )
      )

      const radiantTeam = series.games[0].radiantTeam
      const direTeam = series.games[0].direTeam
      const { radiantWins, direWins } = getSeriesWins(series)
      const seriesWinner = radiantWins >= direWins ? radiantTeam : direTeam

      const games = series.games.map((game, i) => ({
        gameNumber: i + 1,
        winner: game.radiantWin ? game.radiantTeam : game.direTeam,
        loser: game.radiantWin ? game.direTeam : game.radiantTeam,
        duration: formatDuration(game.duration),
        spectateUrl: window.location.origin + "/match/" + getMatchSlug(game) +
          `?utm_source=twitter&utm_medium=social&utm_campaign=game-recap&utm_content=game-${i + 1}`,
      }))

      const seriesLink = window.location.origin + "/match/" + getMatchSlug(series.games[0]) +
        "?utm_source=twitter&utm_medium=social&utm_campaign=series-recap"

      const seriesImageUrl = "/api/og?mode=series&" + new URLSearchParams({
        team1: radiantTeam,
        team2: direTeam,
        winner: seriesWinner,
        score: `${Math.max(radiantWins, direWins)}-${Math.min(radiantWins, direWins)}`,
        tournament: series.tournament || '',
        seriesType: String(series.seriesType),
      })

      const res = await fetch('/api/draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team1: radiantTeam,
          team2: direTeam,
          tournament: series.tournament,
          seriesType: series.seriesType,
          seriesScore: `${radiantWins}-${direWins}`,
          seriesWinner,
          games,
          seriesLink,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to generate posts')
      }

      const data = await res.json()
      setXPosts(data.posts)
      setXPostsSummaryPost(data.summaryPost || null)
      setXPostsSeriesImageUrl(seriesImageUrl)
    } catch (err) {
      setXPostsError(err?.message || 'Failed to generate posts')
    } finally {
      setXPostsLoading(false)
    }
  }

  async function handleDraftRedditPosts(series) {
    setRedditPostsSeries(series)
    setRedditMatchPost(null)
    setRedditDayComment(null)
    setRedditPostsError(null)
    setRedditPostsLoading(true)
    setRedditPostsOpen(true)

    try {
      const radiantTeam = series.games[0].radiantTeam
      const direTeam = series.games[0].direTeam
      const { radiantWins, direWins } = getSeriesWins(series)
      const seriesWinner = radiantWins >= direWins ? radiantTeam : direTeam

      const games = [{
        gameNumber: 1,
        spectateUrl: window.location.origin + "/match/" + getMatchSlug(series.games[0]) + "?spoilers=off",
      }]

      const seriesLink = window.location.origin + "/match/" + getMatchSlug(series.games[0]) + "?spoilers=off"

      const date = series.games[0]?.startTime
        ? new Date(series.games[0].startTime * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : undefined

      const res = await fetch('/api/draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reddit',
          team1: radiantTeam,
          team2: direTeam,
          tournament: series.tournament,
          seriesType: series.seriesType,
          seriesScore: `${radiantWins}-${direWins}`,
          seriesWinner,
          games,
          seriesLink,
          date,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to generate posts')
      }

      const data = await res.json()
      setRedditMatchPost(data.matchPost || null)
      setRedditDayComment(data.dayComment || null)
    } catch (err) {
      setRedditPostsError(err?.message || 'Failed to generate posts')
    } finally {
      setRedditPostsLoading(false)
    }
  }

  function dismissPanel() {
    const scrollY = window.scrollY
    const targetSeriesId = expandedSeriesId
    setSelectedMatch(null)
    setSummary(null)
    setSummaryMatchId(null)
    setSummaryError(null)
    setSummaryErrorMatchId(null)
    setCachedSummaryForSelected(null)
    setCopyFeedback(null)
    window.history.replaceState(null, "", "/")
    setTimeout(() => {
      if (targetSeriesId) {
        const el = document.querySelector(`[data-series-id="${targetSeriesId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
      }
      window.scrollTo(0, scrollY)
    }, 0)
  }

  useEffect(() => {
    if (selectedMatch?.id) {
      setCachedSummaryForSelected(getSummaryFromCache(selectedMatch.id))
    } else {
      setCachedSummaryForSelected(null)
    }
  }, [selectedMatch?.id])

  const searchResults =
    searched && searchQuery
      ? allMatches.filter(
          m =>
            m.radiantTeam.toLowerCase().includes(searchQuery) ||
            m.direTeam.toLowerCase().includes(searchQuery) ||
            m.tournament.toLowerCase().includes(searchQuery)
        )
      : allMatches

  const filteredMatches =
    seriesFilter === "all"
      ? searchResults
      : searchResults.filter(m => String(m.seriesType) === seriesFilter)

  const matchGameNumbers = {}
  // Built from buildSeriesGroups (not a naive raw-seriesId groupBy) so that games OD
  // splits across different series_ids (same teams + tournament + within 4h — see
  // groupIntoSeries) still resolve to the same sibling-game list here. Keyed by each
  // game's own raw seriesId (not the merged group's id) so the selectedMatch.seriesId
  // lookup below still hits.
  const seriesMatchMap = {}
  Object.values(buildSeriesGroups(allMatches)).forEach(group => {
    const ids = group.games.map(g => g.id)
    group.games.forEach(g => { seriesMatchMap[g.seriesId] = ids })
  })
  Object.values(seriesMatchMap).forEach(ids => {
    orderSeriesGames(ids, allMatches).forEach((m, i) => {
      matchGameNumbers[m.id] = i + 1
    })
  })

  const twitchSearchHref = "https://www.twitch.tv/search?term=dota%202"

  const seriesGames = selectedMatch?.seriesId
    ? orderSeriesGames(seriesMatchMap[selectedMatch.seriesId], allMatches)
    : []

  const gameSwitcher = seriesGames.length > 1 ? (
    <div className="inline-flex rounded bg-gray-100 dark:bg-gray-900 p-0.5 gap-0.5">
      {seriesGames.map((game, idx) => {
        const winner = !spoilerFree
          ? (game.radiantWin ? game.radiantTeam : game.direTeam)
          : null
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => handleSelectMatch(game, 'game_switcher')}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded transition-colors ${
              game.id === selectedMatch?.id
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            G{idx + 1}
            {winner && (
              <span className="font-normal text-gray-500 dark:text-gray-500 min-w-0 max-w-[80px] truncate">
                {winner}
              </span>
            )}
          </button>
        )
      })}
    </div>
  ) : null

  function getShareUrl(match) {
    if (typeof window === "undefined") return ""
    return window.location.origin + "/match/" + getMatchSlug(match)
  }

  // Live banner data

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col overflow-x-hidden">
      {(pullDistance > 0 || refreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
          style={{ transform: `translateY(${refreshing ? 56 : Math.min(pullDistance * 0.6, 56)}px)` }}
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full p-2 shadow-md">
            <svg
              className={`w-5 h-5 text-gray-500 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`}
              style={!refreshing ? { transform: `rotate(${(pullDistance / THRESHOLD) * 360}deg)` } : undefined}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
        </div>
      )}

      <SiteHeader
        onSearchOpen={() => setSearchOpen(true)}
        spoilerFree={spoilerFree}
        onSpoilerToggle={(source = "header") => {
          const next = !spoilerFree
          setSpoilerFree(next)
          if (typeof window !== "undefined" && window.localStorage) {
            try { localStorage.setItem(STORAGE_KEYS.SPOILER_FREE, String(next)) } catch {}
          }
          trackEvent("spoiler_free_toggle", { enabled: next, source })
        }}
      />


      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6 flex-1 w-full pb-20 md:pb-8">
        {initialLoading && (
          <div
            className="border border-gray-200 dark:border-gray-800 px-6 py-12 text-center rounded"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-red-500 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-500 text-sm uppercase tracking-widest mt-4">
              Loading matches...
            </p>
          </div>
        )}

        {!initialLoading && (
          <div className="flex flex-col gap-6">
            {/* First-run spoiler-free nudge */}
            {showSpoilerNudge && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      Spoiler-free is on
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      Scores and winners are hidden so VODs stay unspoiled, including live scores. Reveal any match from its card.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSpoilerFree(false)
                          try { localStorage.setItem(STORAGE_KEYS.SPOILER_FREE, "false") } catch {}
                          dismissSpoilerNudge()
                          trackEvent("spoiler_nudge_action", { action: "show_scores" })
                        }}
                        className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded px-3 py-1.5"
                      >
                        Show all scores
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dismissSpoilerNudge()
                          trackEvent("spoiler_nudge_action", { action: "keep_hidden" })
                        }}
                        className="border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-xs rounded px-3 py-1.5"
                      >
                        Keep hidden
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dismissSpoilerNudge()
                    trackEvent("spoiler_nudge_action", { action: "dismiss" })
                  }}
                  aria-label="Dismiss"
                  className="flex-shrink-0 p-2 -m-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Calendar nudge */}
            {showCalendarNudge && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                      Add your teams to your calendar
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      Get match schedules for {followedTeams.join(', ')} in Google Calendar, Apple Calendar, or Outlook — auto-updates as new matches are scheduled.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent('calendar_nudge_click', { followed_count: followedTeams.length })
                        dismissCalendarNudge()
                        window.location.href = '/calendar'
                      }}
                      className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Set up calendar sync →
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissCalendarNudge}
                  aria-label="Dismiss"
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* Main unified feed */}
            <HomeFeed
              liveMatches={liveMatches}
              upcomingMatches={upcomingMatches}
              allMatches={allMatches}
              justEndedSeries={JUST_ENDED_ENABLED ? justEndedSeries : []}
              onSelectMatch={handleSelectMatch}
              onSelectSeries={handleOpenSeries}
              spoilerFree={spoilerFree}
              followedTeams={followedTeams}
              onToggleFollow={handleToggleFollow}
              error={error}
              onRetry={loadMatches}
              onSelectMatchId={handleSelectMatchId}
              onSelectLiveMatch={handleSelectLiveMatch}
              tournamentIdMap={tournamentIdMap}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              hasMore={!!nextMatchId}
              onManageTeams={() => setManageTeamsOpen(true)}
              highlightMatchId={highlightMatchId}
            />
          </div>
        )}

      </main>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-950 flex flex-col overflow-hidden">

          {/* Compact search bar — single row, no big button */}
          <div className="flex-shrink-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 h-12">
              {/* Search icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 w-4 h-4 text-gray-400 dark:text-gray-600" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {/* Compact input (Enter to search, × to clear) */}
              <SearchBar
                ref={searchInputRef}
                onSearch={handleSearch}
                loading={loading}
                initialLoadComplete={true}
                onClearSearch={handleClearSearch}
                initialQuery=""
                compact
                onQueryChange={setLiveQuery}
                onKeyDown={handleSearchKeyDown}
              />
              {/* Cancel */}
              <button
                type="button"
                onClick={() => { handleClearSearch(); setSearchOpen(false) }}
                className="flex-shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Suggestions — pinned directly below search bar */}
          {!searched && (
            <div className="flex-shrink-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
              <div className="max-w-3xl mx-auto">
                <SearchSuggestions
                  ref={suggestionsRef}
                  allMatches={allMatches}
                  onSearch={handleSuggestionSelect}
                  query={liveQuery}
                />
              </div>
            </div>
          )}

          {/* Results — scrollable */}
          {searched && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-3 pt-3 pb-20 flex flex-col gap-3 w-full">
                {filteredMatches.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-600 uppercase tracking-widest">
                      Filter:
                    </span>
                    {["all", "0", "1", "2"].map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setSeriesFilter(value)
                          trackEvent("series_filter", { filter: value })
                        }}
                        className={
                          "focus-ring px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border rounded transition-colors " +
                          (seriesFilter === value
                            ? "bg-red-600 border-red-600 text-white"
                            : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500")
                        }
                      >
                        {value === "all" ? "All" : value === "0" ? "BO1" : value === "1" ? "BO3" : "BO5"}
                      </button>
                    ))}
                  </div>
                )}
                <MatchList
                  matches={filteredMatches}
                  onSelect={match => { handleSelectMatch(match, 'search'); setSearchOpen(false) }}
                  onDraftPosts={isOwner ? handleDraftPosts : undefined}
                  onDraftRedditPosts={isOwner ? handleDraftRedditPosts : undefined}
                  loading={loading}
                  onClearSearch={handleClearSearch}
                  spoilerFree={spoilerFree}
                  followedTeams={followedTeams}
                  onToggleFollow={handleToggleFollow}
                  expandedSeriesId={expandedSeriesId}
                />
                {!loading && nextMatchId && (
                  <button
                    type="button"
                    onClick={handleSearchLoadMore}
                    disabled={loadingMore}
                    className="w-full py-3 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded hover:border-gray-400 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-3 h-3 border border-gray-400 dark:border-gray-600 border-t-gray-700 dark:border-t-gray-300 rounded-full animate-spin" />
                        Loading…
                      </span>
                    ) : "Load more matches"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <SiteFooter />
      <BottomTabBar />

      <ManageTeamsModal
        open={manageTeamsOpen}
        followedTeams={followedTeams}
        onToggleFollow={handleToggleFollow}
        onClose={() => setManageTeamsOpen(false)}
      />

      <XPostsModal
        open={xPostsOpen}
        onClose={() => setXPostsOpen(false)}
        series={xPostsSeries}
        posts={xPosts}
        summaryPost={xPostsSummaryPost}
        seriesImageUrl={xPostsSeriesImageUrl}
        loading={xPostsLoading}
        error={xPostsError}
      />

      <RedditPostsModal
        open={redditPostsOpen}
        onClose={() => setRedditPostsOpen(false)}
        series={redditPostsSeries}
        matchPost={redditMatchPost}
        dayComment={redditDayComment}
        loading={redditPostsLoading}
        error={redditPostsError}
      />

      {selectedLiveSeries && !selectedMatch && (
        <LiveSeriesSheet
          match={selectedLiveSeries}
          onDismiss={closeLiveSeriesSheet}
          onReplay={handleLiveSeriesReplay}
          loadingGameId={liveReplayLoadingId}
          spoilerFree={spoilerFree}
        />
      )}

      {selectedMatch && (
        <MatchDrawer
          match={selectedMatch}
          openSource={drawerSource}
          onDismiss={dismissPanel}
          followedTeams={followedTeams}
          onToggleFollow={handleToggleFollow}
          summary={summaryMatchId === selectedMatch?.id ? summary : null}
          summaryLoading={summaryLoading}
          summaryError={summaryErrorMatchId === selectedMatch?.id ? summaryError : null}
          cachedSummary={cachedSummaryForSelected}
          onSummarize={handleSummarize}
          copyFeedback={copyFeedback}
          twitchSearchHref={twitchSearchHref}
          gameNumber={matchGameNumbers[selectedMatch?.id]}
          seriesMatches={seriesMatchMap[selectedMatch?.seriesId]?.length}
          shareUrl={getShareUrl(selectedMatch)}
          spoilerFree={spoilerFree}
          gameSwitcher={gameSwitcher}
          onCopyVod={() => {
            navigator.clipboard?.writeText(selectedMatch.url)
            trackEvent("copy_vod", {
              matchId: selectedMatch.id,
              radiantTeam: selectedMatch.radiantTeam,
              direTeam: selectedMatch.direTeam,
            })
            setCopyFeedback("vod")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
          onCopyLink={() => {
            const url = getShareUrl(selectedMatch)
            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "/match/" + getMatchSlug(selectedMatch))
            trackEvent("share_match", {
              matchId: selectedMatch.id,
              radiantTeam: selectedMatch.radiantTeam,
              direTeam: selectedMatch.direTeam,
              tournament: selectedMatch.tournament,
            })
            setCopyFeedback("link")
            setTimeout(() => setCopyFeedback(null), 2000)
          }}
        />
      )}
    </div>
  )
}

export default App

import { track } from '@vercel/analytics'

export const STORAGE_KEYS = {
  SUMMARY_CACHE:            "dota-match-finder-summaries",
  FOLLOWED_TEAMS:           "followedTeams",
  NEWS_LAST_VISITED:        "spectate-news-last-visited",
  NEWS_LATEST_ARTICLE:      "spectate-news-latest-article",
  CALENDAR_NUDGE_DISMISSED: "calendar-nudge-dismissed",
  OWNER:                    "spectate-owner",
  SPOILER_FREE:             "spoilerFree",
  PUSH_DISABLED:            "spectate-push-disabled",
  THEME:                    "theme",
  MY_TEAMS:                 "my-teams",
  RECENT_SEARCHES:          "dota-recent-searches",
  HEROES:                   "spectate-heroes-v1",
}

export function toTitleCase(str) {
  if (!str) return ''
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

export function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, props)
  }
}

export function formatDateRange(beginAt, endAt) {
  if (!beginAt) return null
  const opts = { month: 'short', day: 'numeric' }
  const start = new Date(beginAt).toLocaleDateString('en-US', opts)
  if (!endAt) return start
  const end = new Date(endAt).toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${start} - ${end}`
}

/** Returns { radiantWins, direWins } for a series object. */
export function getSeriesWins(series) {
  const radiantTeam = series.games[0].radiantTeam
  const direTeam = series.games[0].direTeam
  const radiantWins = series.games.filter(
    g => (g.radiantWin && g.radiantTeam === radiantTeam) || (!g.radiantWin && g.direTeam === radiantTeam)
  ).length
  const direWins = series.games.filter(
    g => (g.radiantWin && g.radiantTeam === direTeam) || (!g.radiantWin && g.direTeam === direTeam)
  ).length
  return { radiantWins, direWins }
}

/**
 * Format "HH:MM" or "H:MM" duration string to human-readable "1h 23m" or "45m"
 */
export function formatDuration(isoTimeStr) {
  if (!isoTimeStr || typeof isoTimeStr !== "string") return isoTimeStr || "-"
  const [h = 0, m = 0] = isoTimeStr.trim().split(":").map(Number)
  const totalMinutes = h * 60 + m
  return totalMinutes > 0 ? `${totalMinutes}m` : "0m"
}

const SERIES_LABELS = { 0: "BO1", 1: "BO3", 2: "BO5", 3: "BO2" }
export function getSeriesLabel(seriesType) {
  return SERIES_LABELS[seriesType] ?? ""
}

/**
 * Format a scheduledAt ISO string as countdown: "In 2h 30m · 3:00 AM PDT", "Starting soon", etc.
 */
export function formatMatchTime(scheduledAt) {
  if (!scheduledAt) return null
  const date = new Date(scheduledAt)
  const now = new Date()
  const diffMs = date - now
  const diffHours = diffMs / (1000 * 60 * 60)
  const tzShort = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(date).find(p => p.type === 'timeZoneName')?.value || ''
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffHours < 0) return 'Starting soon'
  if (diffHours < 1) return `In ${Math.round(diffMs / 60000)}m`
  if (diffHours < 24) {
    const hrs = Math.floor(diffHours)
    const mins = Math.round((diffHours - hrs) * 60)
    return mins > 0 ? `In ${hrs}h ${mins}m · ${timeStr} ${tzShort}` : `In ${hrs}h · ${timeStr} ${tzShort}`
  }
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dateStr} · ${timeStr} ${tzShort}`
}

/**
 * Format Unix timestamp (seconds) as relative time: "5m ago", "2h ago", "Yesterday", "3 days ago", or ""
 */
export function formatRelativeTime(unixSeconds) {
  if (unixSeconds == null || typeof unixSeconds !== "number") return ""
  const now = Date.now() / 1000
  const diff = now - unixSeconds
  const abs = Math.abs(diff)
  if (abs < 60) return "Just now"
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`
  if (abs < 172800) return "Yesterday"
  if (abs < 604800) return `${Math.floor(abs / 86400)} days ago`
  return ""
}

/**
 * Group flat match list into series (same teams + tournament + date). Drops the oldest incomplete series.
 */
export function groupIntoSeries(matches) {
  const seriesMap = {}
  for (const match of matches) {
    const teams = [match.radiantTeam, match.direTeam].sort().join("|")
    // Use seriesId as primary key when available so games in a series that
    // spans midnight aren't split into separate date-keyed buckets.
    const key = match.seriesId != null && match.seriesId !== 0
      ? String(match.seriesId)
      : teams + "__" + match.tournament + "__" + match.date
    if (!seriesMap[key]) {
      seriesMap[key] = {
        id: key,
        tournament: match.tournament,
        date: match.date,
        seriesType: match.seriesType,
        startTime: match.startTime,
        games: [],
      }
    }
    seriesMap[key].games.push(match)
    if (match.startTime > seriesMap[key].startTime) {
      seriesMap[key].startTime = match.startTime
    }
  }

  // Second pass: orphaned games (series_id null/0) that share teams + tournament
  // with an existing numbered series and started within 12h of it belong to that
  // series. OpenDota occasionally returns the final game of a BO3 with null
  // series_id, which would otherwise split it into a separate bucket.
  const TWELVE_HOURS = 12 * 3600
  const numberedKeys = new Set(
    Object.keys(seriesMap).filter(k => /^\d+$/.test(k))
  )
  for (const [fallbackKey, orphanSeries] of Object.entries(seriesMap)) {
    if (/^\d+$/.test(fallbackKey)) continue // already a numbered series
    for (const numberedKey of numberedKeys) {
      const numbered = seriesMap[numberedKey]
      const teamsMatch = [orphanSeries.games[0].radiantTeam, orphanSeries.games[0].direTeam].sort().join('|') ===
        [numbered.games[0].radiantTeam, numbered.games[0].direTeam].sort().join('|')
      if (!teamsMatch || orphanSeries.games[0].tournament !== numbered.games[0].tournament) continue
      const timeDiff = Math.abs(orphanSeries.games[0].startTime - numbered.startTime)
      if (timeDiff > TWELVE_HOURS) continue
      // Merge orphan games into the numbered series
      for (const g of orphanSeries.games) numbered.games.push(g)
      if (orphanSeries.startTime > numbered.startTime) numbered.startTime = orphanSeries.startTime
      delete seriesMap[fallbackKey]
      break
    }
  }

  // Third pass: merge numbered stubs that OD split across different series_ids.
  // OD occasionally assigns a fresh series_id to each game of the same real series.
  // Merge criteria: same teams + same tournament + all game start times within 4h
  // + neither stub already complete + combined games within the series-type max.
  const FOUR_HOURS = 4 * 3600
  let mergedAny = true
  while (mergedAny) {
    mergedAny = false
    const numericEntries = Object.entries(seriesMap).filter(([k]) => /^\d+$/.test(k))
    outer: for (let i = 0; i < numericEntries.length; i++) {
      const [keyA, sA] = numericEntries[i]
      if (!seriesMap[keyA]) continue
      if (isSeriesComplete(sA)) continue
      for (let j = i + 1; j < numericEntries.length; j++) {
        const [keyB, sB] = numericEntries[j]
        if (!seriesMap[keyB]) continue
        if (isSeriesComplete(sB)) continue
        if (sA.games[0]?.tournament !== sB.games[0]?.tournament) continue
        const teamsA = [sA.games[0].radiantTeam, sA.games[0].direTeam].sort().join('|')
        const teamsB = [sB.games[0].radiantTeam, sB.games[0].direTeam].sort().join('|')
        if (teamsA !== teamsB) continue
        if (sA.games.length + sB.games.length > maxGamesForSeries(sA.seriesType)) continue
        const allTimes = [...sA.games, ...sB.games].map(g => g.startTime)
        if (Math.max(...allTimes) - Math.min(...allTimes) > FOUR_HOURS) continue
        for (const g of sB.games) sA.games.push(g)
        if (sB.startTime > sA.startTime) sA.startTime = sB.startTime
        delete seriesMap[keyB]
        mergedAny = true
        break outer
      }
    }
  }

  let series = Object.values(seriesMap)
  series.forEach((s) => s.games.sort((a, b) => a.startTime - b.startTime))
  series.sort((a, b) => b.startTime - a.startTime)

  const reversed = [...series].reverse()
  const oldestIncompleteIndex = reversed.findIndex((s) => !isSeriesComplete(s))
  if (oldestIncompleteIndex !== -1) {
    series.splice(series.length - 1 - oldestIncompleteIndex, 1)
  }

  return series
}

/** Wins required to win the series (BO1=1, BO2=2, BO3=2, BO5=3) */
export function winsRequiredForSeries(seriesType) {
  if (seriesType === 0) return 1
  if (seriesType === 2) return 3
  if (seriesType === 3) return 2 // BO2
  return 2
}

/** Maximum games possible in a series (BO1=1, BO2=2, BO3=3, BO5=5) */
function maxGamesForSeries(seriesType) {
  if (seriesType === 0) return 1  // BO1
  if (seriesType === 2) return 5  // BO5
  if (seriesType === 3) return 2  // BO2
  return 3                        // BO3 (type 1) or unknown
}

// ── Summary localStorage cache helpers ────────────────────────────────────

export function getSummaryFromCache(matchId) {
  if (typeof window === "undefined" || !matchId) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUMMARY_CACHE)
    if (!raw) return null
    const map = JSON.parse(raw)
    return map[matchId] ?? null
  } catch {
    return null
  }
}

export function setSummaryInCache(matchId, text) {
  if (typeof window === "undefined" || !matchId || typeof text !== "string") return
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUMMARY_CACHE) || "{}"
    const map = JSON.parse(raw)
    map[matchId] = text
    localStorage.setItem(STORAGE_KEYS.SUMMARY_CACHE, JSON.stringify(map))
  } catch {}
}

// ── My Teams localStorage helpers ─────────────────────────────────────────

export function getFollowedTeams() {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FOLLOWED_TEAMS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function setFollowedTeams(teams) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEYS.FOLLOWED_TEAMS, JSON.stringify(teams))
  } catch {}
}

// ── News unread indicator helpers ─────────────────────────────────────────

export function setNewsLastVisited() {
  try { localStorage.setItem(STORAGE_KEYS.NEWS_LAST_VISITED, new Date().toISOString()) } catch {}
}

export function setNewsLatestArticle(publishedAt) {
  if (!publishedAt) return
  try { localStorage.setItem(STORAGE_KEYS.NEWS_LATEST_ARTICLE, publishedAt) } catch {}
}

export function hasUnreadNews() {
  try {
    const lastVisited = localStorage.getItem(STORAGE_KEYS.NEWS_LAST_VISITED)
    if (!lastVisited) return false
    const latestArticle = localStorage.getItem(STORAGE_KEYS.NEWS_LATEST_ARTICLE)
    if (!latestArticle) return false
    return new Date(latestArticle) > new Date(lastVisited)
  } catch {
    return false
  }
}

/** True if the series has a winner or ended in a BO2 draw. */
/**
 * Returns true if leagueName contains any of the tier1Names substrings.
 * Returns null (not false) when tier1Names is empty — callers should fall back
 * to their own filter instead of treating it as a definitive "not tier 1".
 * Enforces a minimum name length of 3 to avoid accidental broad matches.
 */
export function matchesTier1Names(leagueName, tier1Names) {
  if (!tier1Names || tier1Names.length === 0) return null
  const validNames = tier1Names.filter(n => n.length >= 3)
  if (validNames.length === 0) return null  // all names too short — use fallback
  const lower = (leagueName || '').toLowerCase()
  return validNames.some(n => lower.includes(n))
}

/** Extracts the league organizer short-label from a tournament name. Returns null if unrecognised. */
export function getLeagueLabel(name) {
  if (!name) return null
  if (/dreamleague/i.test(name)) return 'DreamLeague'
  if (/\besl\b/i.test(name)) return 'ESL'
  if (/\bpgl\b/i.test(name)) return 'PGL'
  if (/blast/i.test(name)) return 'BLAST'
  if (/weplay/i.test(name)) return 'WePlay'
  if (/riyadh/i.test(name)) return 'Riyadh Masters'
  if (/the international/i.test(name)) return 'The International'
  if (/beyond the summit|bts/i.test(name)) return 'Beyond The Summit'
  return null
}

// Combines a PandaScore league name and serie name into a full display name.
// PandaScore sometimes omits the org prefix from serie.full_name (e.g. "Season 29 2026"
// instead of "DreamLeague Season 29 2026"), so we prepend league when it's missing.
export function buildTournamentName(league, serie) {
  if (league && serie) {
    return serie.toLowerCase().includes(league.toLowerCase()) ? serie : `${league} ${serie}`
  }
  return league || serie || ''
}

/**
 * Normalizes a tournament name to a grouping key so PandaScore and OpenDota names
 * for the same event collapse to one card (e.g. "DreamLeague S29" == "DreamLeague Season 29").
 * Deliberately expands "SN" -> "season N", the inverse of buildTournamentName's contraction,
 * so both sources produce the same base string for comparison.
 */
const _ROMAN = { xx:20, xix:19, xviii:18, xvii:17, xvi:16, xv:15, xiv:14, xiii:13, xii:12, xi:11, x:10, ix:9, viii:8, vii:7, vi:6, v:5, iv:4, iii:3, ii:2, i:1 }
const _ROMAN_RE = new RegExp('\\b(' + Object.keys(_ROMAN).join('|') + ')\\b', 'gi')

export function normalizeTournamentKey(name) {
  return (name || 'Other')
    .toLowerCase()
    .replace(/\bs(\d+)\b/gi, 'season $1')                           // S7 → season 7
    .replace(_ROMAN_RE, m => 'season ' + _ROMAN[m.toLowerCase()])   // VII → season 7
    .replace(/\bseason\s+season\b/g, 'season')                      // dedup if "Season VII" → "season season 7"
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds the sorted tournament card list for the homepage feed.
 * Pure function — accepts the three active data slices and followed teams, returns
 * an array of card objects ready for rendering.
 *
 * Sort order: live > upcoming > followed-team > most-recent.
 * Within each card, followed-team rows float to the top.
 *
 * @param {object[]} live        - active live matches from PandaScore
 * @param {object[]} upcoming    - upcoming matches from PandaScore
 * @param {object[]} completed   - completed series from OpenDota (already filtered to active date)
 * @param {string[]} followedTeams - team names the user follows
 * @param {number}  [now]        - current unix timestamp in seconds (default: Date.now()/1000).
 *                                 Accepted as a param so tests can pass a fixed value.
 */
export function buildTournamentCards(live, upcoming, completed, followedTeams, now = Date.now() / 1000) {
  const isFollowedSeries = s =>
    !!followedTeams?.length &&
    (followedTeams.includes(s.games?.[0]?.radiantTeam) || followedTeams.includes(s.games?.[0]?.direTeam))
  const isFollowedLive = m =>
    !!followedTeams?.length &&
    (followedTeams.includes(m.teamA) || followedTeams.includes(m.teamB))

  // Build canonical key -> display name; live/upcoming names (PandaScore) preferred.
  const keyToDisplay = new Map()
  for (const name of [
    ...live.map(m => m.tournament || 'Other'),
    ...upcoming.map(m => m.tournament || 'Other'),
    ...completed.map(s => s.tournament || 'Other'),
  ]) {
    const key = normalizeTournamentKey(name)
    if (!keyToDisplay.has(key)) keyToDisplay.set(key, name)
  }

  const cards = []
  for (const [key, t] of keyToDisplay) {
    const liveCard = live.filter(m => normalizeTournamentKey(m.tournament || 'Other') === key)
    const upcomingCard = upcoming.filter(m => normalizeTournamentKey(m.tournament || 'Other') === key)
    const completedCard = completed.filter(s => normalizeTournamentKey(s.tournament || 'Other') === key)

    const liveSorted = [...liveCard].sort((a, b) => (isFollowedLive(a) ? 0 : 1) - (isFollowedLive(b) ? 0 : 1))
    const completedSorted = [...completedCard].sort((a, b) => (isFollowedSeries(a) ? 0 : 1) - (isFollowedSeries(b) ? 0 : 1))

    const hasFollowed =
      liveSorted.some(isFollowedLive) ||
      upcomingCard.some(isFollowedLive) ||
      completedSorted.some(isFollowedSeries)

    const latestTime = Math.max(
      ...liveCard.map(() => now),
      ...upcomingCard.map(m => new Date(m.scheduledAt).getTime() / 1000),
      ...completedCard.map(s => s.startTime || 0),
      0
    )

    cards.push({
      tournament: t,
      org: getLeagueLabel(t),
      liveMatches: liveSorted,
      upcomingMatches: upcomingCard,
      completedSeries: completedSorted,
      hasLive: liveCard.length > 0,
      hasUpcoming: upcomingCard.length > 0,
      hasFollowed,
      latestTime,
    })
  }

  cards.sort((a, b) => {
    if (a.hasLive !== b.hasLive) return a.hasLive ? -1 : 1
    if (a.hasUpcoming !== b.hasUpcoming) return a.hasUpcoming ? -1 : 1
    if (a.hasFollowed !== b.hasFollowed) return a.hasFollowed ? -1 : 1
    return b.latestTime - a.latestTime
  })

  return cards
}

// Tournament format configs keyed by slug. Add entries for future tournaments.
export const TOURNAMENT_FORMAT_CONFIGS = {
  'blast-slam': {
    stages: [
      {
        match: name => /group/i.test(name),
        format: 'Round Robin',
        matchFormat: 'BO1',
        teamCount: 12,
        advancement: [
          { label: 'Top 2',     dest: 'UB Semifinals',    type: 'up' },
          { label: '3rd–4th',   dest: 'UB Quarterfinals', type: 'up' },
          { label: '5th–6th',   dest: 'Last Chance R2',   type: 'conditional' },
          { label: '7th–10th',  dest: 'Last Chance R1',   type: 'conditional' },
          { label: '11th–12th', dest: 'Eliminated',       type: 'out' },
        ],
      },
      {
        match: name => /last.?chance|lcq/i.test(name),
        format: 'Single Elim',
        matchFormat: 'BO3',
        teamCount: 8,
        advancement: [
          { label: 'Top 2', dest: 'UB Quarterfinals', type: 'up' },
          { label: 'Rest',  dest: 'Eliminated',       type: 'out' },
        ],
      },
      {
        match: name => /playoff|main.?event/i.test(name),
        format: 'Double Elim',
        matchFormat: 'BO3',
        grandFinalFormat: 'BO5',
        advancement: [
          { label: 'Winner', dest: 'Champion', type: 'up' },
        ],
      },
    ],
  },
}

// Returns the advancement type ('up'|'conditional'|'out') for a given rank (1-based).
export function getAdvancementType(advancement, rank) {
  if (!advancement?.length || rank == null) return null
  for (const rule of advancement) {
    const label = rule.label.toLowerCase().trim()
    const topMatch = label.match(/^top\s+(\d+)/)
    if (topMatch && rank <= parseInt(topMatch[1])) return rule.type
    const rangeMatch = label.match(/^(\d+)[^\d]+(\d+)/)
    if (rangeMatch && rank >= parseInt(rangeMatch[1]) && rank <= parseInt(rangeMatch[2])) return rule.type
    if (label === 'rest') return rule.type
  }
  return null
}

export function getTournamentFormatKey(leagueName, tournamentName) {
  const league = (leagueName || '').toLowerCase()
  const name = (tournamentName || '').toLowerCase()
  if (league.includes('blast') && (league.includes('slam') || name.includes('slam'))) return 'blast-slam'
  return null
}

export function getStageFormatConfig(formatKey, stageName) {
  if (!formatKey) return null
  const config = TOURNAMENT_FORMAT_CONFIGS[formatKey]
  if (!config) return null
  return config.stages.find(s => s.match(stageName || '')) ?? null
}

export function isSeriesComplete(series) {
  if (!series || !series.games || !series.games.length) return false
  const teamWins = {}
  for (const g of series.games) {
    const winner = g.radiantWin ? g.radiantTeam : g.direTeam
    teamWins[winner] = (teamWins[winner] || 0) + 1
  }
  const maxWins = Math.max(...Object.values(teamWins))
  if (maxWins >= winsRequiredForSeries(series.seriesType)) return true
  // BO2 draw: both teams have 1 win after 2 games. Only check seriesType 3 (explicit BO2 from
  // PandaScore format cache). seriesType 1 is BO3 — a 1-1 BO3 is NOT complete (G3 still to play).
  const isBO2 = series.seriesType === 3
  if (isBO2 && series.games.length >= 2 && maxWins === 1 && Object.keys(teamWins).length === 2) return true
  return false
}

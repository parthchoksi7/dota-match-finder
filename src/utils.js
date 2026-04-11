import { track } from '@vercel/analytics'

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
  if (!isoTimeStr || typeof isoTimeStr !== "string") return isoTimeStr || "—"
  const [h = 0, m = 0] = isoTimeStr.trim().split(":").map(Number)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return "0m"
}

const SERIES_LABELS = { 0: "BO1", 1: "BO3", 2: "BO5", 3: "BO2" }
export function getSeriesLabel(seriesType) {
  return SERIES_LABELS[seriesType] ?? ""
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

// ── My Teams localStorage helpers ─────────────────────────────────────────

const FOLLOWED_TEAMS_KEY = "followedTeams"

/**
 * Read followed team names from localStorage.
 * Returns an empty array if localStorage is unavailable or data is malformed.
 */
export function getFollowedTeams() {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(FOLLOWED_TEAMS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Persist an array of followed team names to localStorage.
 * Fails silently if localStorage is unavailable (e.g. incognito).
 */
export function setFollowedTeams(teams) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(FOLLOWED_TEAMS_KEY, JSON.stringify(teams))
  } catch {}
}

/** True if the series has a winner or ended in a BO2 draw. */
/**
 * Returns true if leagueName contains any of the tier1Names substrings.
 * Returns null (not false) when tier1Names is empty — callers should fall back
 * to their own filter instead of treating it as a definitive "not tier 1".
 * Enforces a minimum name length of 4 to avoid accidental broad matches.
 */
export function matchesTier1Names(leagueName, tier1Names) {
  if (!tier1Names || tier1Names.length === 0) return null
  const validNames = tier1Names.filter(n => n.length >= 4)
  if (validNames.length === 0) return null  // all names too short — use fallback
  const lower = (leagueName || '').toLowerCase()
  return validNames.some(n => lower.includes(n))
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
  // BO2 draw: both teams have 1 win after 2 games (seriesType 3 = BO2, or seriesType 1 fallback)
  const isBO2 = series.seriesType === 3 || series.seriesType === 1
  if (isBO2 && series.games.length >= 2 && maxWins === 1 && Object.keys(teamWins).length === 2) return true
  return false
}

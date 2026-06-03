/**
 * Fetches news context for Claude topic/draft generation.
 * Uses the site's own /api/news and /api/live-matches endpoints.
 */

const BASE_URL = 'https://spectateesports.live'

export async function fetchNewsContext() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const [newsResult, matchesResult] = await Promise.allSettled([
      fetch(`${BASE_URL}/api/news?limit=20`, { signal: controller.signal }),
      fetch(`${BASE_URL}/api/live-matches`, { signal: controller.signal }),
    ])
    clearTimeout(timer)

    let newsText = ''
    if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
      const data = await newsResult.value.json().catch(() => null)
      const items = (data?.articles || []).slice(0, 15)
      if (items.length > 0) {
        newsText = 'RECENT NEWS HEADLINES:\n' + items.map(a =>
          `- ${a.title}${a.source?.name ? ` (${a.source.name})` : ''}`
        ).join('\n')
      }
    }

    let matchText = ''
    if (matchesResult.status === 'fulfilled' && matchesResult.value.ok) {
      const data = await matchesResult.value.json().catch(() => null)
      const completed = (data?.recentlyCompleted || data?.completed || []).slice(0, 5)
      const upcoming = (data?.upcoming || data?.upcomingToday || []).slice(0, 5)

      if (completed.length > 0) {
        matchText += '\n\nRECENT MATCH RESULTS:\n' + completed.map(m => {
          const t1 = m.team1 || m.opponents?.[0]?.opponent?.name || 'Team A'
          const t2 = m.team2 || m.opponents?.[1]?.opponent?.name || 'Team B'
          const league = m.tournamentName || m.league?.name || m.tournament || ''
          return `- ${t1} vs ${t2}${league ? ` (${league})` : ''}`
        }).join('\n')
      }

      if (upcoming.length > 0) {
        matchText += '\n\nUPCOMING MATCHES:\n' + upcoming.map(m => {
          const t1 = m.opponents?.[0]?.opponent?.name || m.team1 || 'TBD'
          const t2 = m.opponents?.[1]?.opponent?.name || m.team2 || 'TBD'
          const league = m.league?.name || m.tournament || ''
          const time = m.scheduledAt || m.scheduled_at || ''
          return `- ${t1} vs ${t2}${league ? ` | ${league}` : ''}${time ? ` at ${time}` : ''}`
        }).join('\n')
      }
    }

    const combined = [newsText, matchText].filter(Boolean).join('\n')
    return combined || 'No recent news available. Focus on ongoing tier-1 tournaments and meta analysis.'
  } catch (_) {
    clearTimeout(timer)
    return 'News fetch unavailable. Focus on current tier-1 tournament storylines.'
  }
}

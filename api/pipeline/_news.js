/**
 * Fetches news context for Claude topic/draft generation.
 * Pulls from: own published articles (best factual ground), external news headlines,
 * and live match scores/results.
 */
import { getSupabaseAnon } from '../_supabase.js'

const BASE_URL = 'https://spectateesports.live'

export async function fetchNewsContext() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const [newsResult, recentResult, upcomingResult, articlesResult] = await Promise.allSettled([
      fetch(`${BASE_URL}/api/news?limit=20`, { signal: controller.signal }),
      fetch(`${BASE_URL}/api/tournaments?mode=recent-completed`, { signal: controller.signal }),
      fetch(`${BASE_URL}/api/upcoming-matches`, { signal: controller.signal }),
      getSupabaseAnon()
        .from('articles')
        .select('title, published_at, excerpt')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(5),
    ])
    clearTimeout(timer)

    // Own published articles are the most reliable factual source
    let articlesText = ''
    if (articlesResult.status === 'fulfilled' && !articlesResult.value.error) {
      const recent = articlesResult.value.data || []
      if (recent.length > 0) {
        articlesText = 'OUR RECENT PUBLISHED ARTICLES (verified facts):\n' + recent.map(a =>
          `- "${a.title}" (${a.published_at}): ${a.excerpt}`
        ).join('\n')
      }
    }

    // External news headlines
    let newsText = ''
    if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
      const data = await newsResult.value.json().catch(() => null)
      const items = (data?.articles || []).slice(0, 15)
      if (items.length > 0) {
        newsText = 'EXTERNAL NEWS HEADLINES:\n' + items.map(a =>
          `- ${a.title}${a.source?.name ? ` (${a.source.name})` : ''}`
        ).join('\n')
      }
    }

    // Recent completed series from PandaScore — returns individual games, group into series
    let matchText = ''
    if (recentResult.status === 'fulfilled' && recentResult.value.ok) {
      const data = await recentResult.value.json().catch(() => null)
      const games = data?.games || []
      if (games.length > 0) {
        const seriesMap = new Map()
        for (const game of games) {
          if (!seriesMap.has(game.seriesId)) {
            seriesMap.set(game.seriesId, { tournament: game.tournament, wins: new Map() })
          }
          const s = seriesMap.get(game.seriesId)
          const winner = game.radiantWin ? game.radiantTeam : game.direTeam
          s.wins.set(winner, (s.wins.get(winner) || 0) + 1)
        }
        const seriesList = [...seriesMap.values()].slice(0, 10)
        matchText += 'RECENT COMPLETED SERIES (authoritative scores):\n' + seriesList.map(s => {
          const sorted = [...s.wins.entries()].sort((a, b) => b[1] - a[1])
          const [winner, wWins] = sorted[0] || ['?', 0]
          const [loser, lWins] = sorted[1] || ['?', 0]
          return `- ${winner} def. ${loser} (${wWins}-${lWins}) | ${s.tournament}`
        }).join('\n')
      }
    }

    // Upcoming matches for preview angles
    if (upcomingResult.status === 'fulfilled' && upcomingResult.value.ok) {
      const data = await upcomingResult.value.json().catch(() => null)
      const upcoming = (data?.matches || data?.upcoming || []).slice(0, 6)
      if (upcoming.length > 0) {
        matchText += (matchText ? '\n\n' : '') + 'UPCOMING MATCHES:\n' + upcoming.map(m => {
          const t1 = m.opponents?.[0]?.opponent?.name || m.team1 || 'TBD'
          const t2 = m.opponents?.[1]?.opponent?.name || m.team2 || 'TBD'
          const league = m.league?.name || m.tournament || ''
          const time = m.scheduledAt || m.scheduled_at || m.begin_at || ''
          return `- ${t1} vs ${t2}${league ? ` | ${league}` : ''}${time ? ` at ${time}` : ''}`
        }).join('\n')
      }
    }

    const combined = [articlesText, newsText, matchText].filter(Boolean).join('\n\n')
    return combined || 'No recent news available. Focus on ongoing tier-1 tournaments and meta analysis.'
  } catch (_) {
    clearTimeout(timer)
    return 'News fetch unavailable. Focus on current tier-1 tournament storylines.'
  }
}

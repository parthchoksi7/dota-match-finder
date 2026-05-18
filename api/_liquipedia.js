/**
 * Pure helpers for fetching and parsing Liquipedia transfer data.
 * Extracted so they can be unit-tested without importing the full news.js
 * module (which initialises Redis and other server-only deps).
 */

// Local copy intentional - avoids pulling in news.js server-only deps
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns the Liquipedia wiki page path for the current quarter's transfers.
 * e.g. "Transfers/2026/2nd_Quarter"
 */
export function getCurrentTransferPage() {
  const now = new Date()
  const year = now.getFullYear()
  const quarter = Math.ceil((now.getMonth() + 1) / 3)
  const suffix = ['1st', '2nd', '3rd', '4th'][quarter - 1]
  return `Transfers/${year}/${suffix}_Quarter`
}

/**
 * Parses the rendered HTML from a Liquipedia quarterly transfers page.
 *
 * Liquipedia uses CSS div-tables (divRow/divCell), not <table> elements.
 * Row structure: Date | Name | Team OldTeam | Icon | Team NewTeam | Ref
 *
 * Returns articles from the last 14 days only.
 */
export function parseLiquipediaTransfers(html) {
  const articles = []
  const fourteenDaysAgo = Date.now() - 14 * 86400_000

  // Split at each divRow boundary to isolate row chunks
  const rowSections = html.split('<div class="divRow mainpage-transfer')

  for (let i = 1; i < rowSections.length; i++) {
    const chunk = rowSections[i]

    // Split at divCell boundaries to isolate each cell's content
    const cellParts = chunk.split('<div class="divCell ')
    const cells = {}
    for (const part of cellParts.slice(1)) {
      const gtIdx = part.indexOf('>')
      const cellKey = part.slice(0, gtIdx).replace(/"/g, '').trim()
      cells[cellKey] = part.slice(gtIdx + 1)
    }

    const dateText = stripHtml(cells['Date'] || '').trim()
    const dateMatch = dateText.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue

    const date = new Date(dateMatch[1])
    if (isNaN(date.getTime()) || date.getTime() < fourteenDaysAgo) continue
    const transferDate = dateMatch[1]

    // Extract player links; skip red-links (index.php = page doesn't exist yet)
    const nameHtml = cells['Name'] || ''
    const playerLinks = [...nameHtml.matchAll(/href="(\/dota2\/(?!index\.php)[^"#?]+)"[^>]*>([^<]+)<\/a>/g)]
    if (!playerLinks.length) continue

    // Team names via data-highlighting-class (most reliable - avoids img alt ambiguity)
    const fromTeamMatch = (cells['Team OldTeam'] || '').match(/data-highlighting-class="([^"]+)"/)
    const toTeamMatch = (cells['Team NewTeam'] || '').match(/data-highlighting-class="([^"]+)"/)
    const fromTeam = fromTeamMatch?.[1] || ''
    const toTeam = toTeamMatch?.[1] || ''

    if (!toTeam || /^(TBD|None)$/i.test(toTeam)) continue
    if (fromTeam && fromTeam === toTeam) continue // skip renewals/extensions

    if (playerLinks.length === 1) {
      const [, playerPath, playerName] = playerLinks[0]
      const title = fromTeam
        ? `${playerName} moves to ${toTeam}`
        : `${playerName} signs with ${toTeam}`
      const excerpt = fromTeam ? `${fromTeam} → ${toTeam}` : toTeam
      articles.push({
        title,
        link: `https://liquipedia.net${playerPath}#${transferDate}`,
        description: excerpt,
        pubDate: date.toISOString(),
        categories: ['roster'],
        enclosureUrl: null,
      })
    } else {
      // Multiple players = roster signing; one article for the whole group
      const playerNames = playerLinks.map(([, , n]) => n).join(', ')
      const title = fromTeam
        ? `${toTeam} acquires players from ${fromTeam}`
        : `${toTeam} signs new roster`
      const teamSlug = toTeam.replace(/ /g, '_')
      articles.push({
        title,
        link: `https://liquipedia.net/dota2/${encodeURIComponent(teamSlug)}#${transferDate}`,
        description: playerNames,
        pubDate: date.toISOString(),
        categories: ['roster'],
        enclosureUrl: null,
      })
    }
  }

  return articles
}

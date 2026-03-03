code = open('src/components/MatchDrawer.jsx').read()

# Add track import
code = code.replace(
    'import { useEffect, useRef } from "react"',
    'import { useEffect, useRef } from "react"\nimport { track } from "@vercel/analytics"'
)

# Add tracking to VOD click anchor tag
code = code.replace(
    '''                      <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors">''',
    '''                      <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                        onClick={() => track("vod_click", { matchId: match.id, channel: vod.channel, radiantTeam: match.radiantTeam, direTeam: match.direTeam, tournament: match.tournament })}
                        className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded transition-colors">'''
)

# Add tracking to Search Twitch link
code = code.replace(
    '''                  <a href={twitchHref} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider">
                    Search Twitch
                  </a>''',
    '''                  <a href={twitchHref} target="_blank" rel="noopener noreferrer"
                    onClick={() => track("twitch_search_click", { matchId: match.id })}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline uppercase tracking-wider">
                    Search Twitch
                  </a>'''
)

with open('src/components/MatchDrawer.jsx', 'w') as f:
    f.write(code)

print('Done! MatchDrawer.jsx updated.')

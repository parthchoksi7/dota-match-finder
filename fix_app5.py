code = open('src/App.jsx').read()

# Add track to search
code = code.replace(
    '''    setSearchQuery(q)
    setTimeout(() => {''',
    '''    setSearchQuery(q)
    track("search", { query: q })
    setTimeout(() => {'''
)

# Add track to load more
code = code.replace(
    '''    setLoadingMore(true)
    try {
      const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(nextMatchId)''',
    '''    setLoadingMore(true)
    track("load_more", { searchQuery: searchQuery || "homepage" })
    try {
      const { matches: newMatches, nextMatchId: newNextId } = await fetchProMatches(nextMatchId)'''
)

# Add track to copy vod
code = code.replace(
    '''            navigator.clipboard?.writeText(selectedMatch.url)
            setCopyFeedback("vod")''',
    '''            navigator.clipboard?.writeText(selectedMatch.url)
            track("copy_vod", { matchId: selectedMatch.id })
            setCopyFeedback("vod")'''
)

# Add track to share match
code = code.replace(
    '''            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "#match-" + selectedMatch.id)
            setCopyFeedback("link")''',
    '''            navigator.clipboard?.writeText(url)
            window.history.replaceState(null, "", "#match-" + selectedMatch.id)
            track("share_match", { matchId: selectedMatch.id })
            setCopyFeedback("link")'''
)

# Add track to summarize
code = code.replace(
    '''    setSummaryLoading(true)
    try {
      const result = await fetchMatchSummary(match.id)''',
    '''    setSummaryLoading(true)
    track("summary_click", { matchId: match.id, radiantTeam: match.radiantTeam, direTeam: match.direTeam, tournament: match.tournament })
    try {
      const result = await fetchMatchSummary(match.id)'''
)

with open('src/App.jsx', 'w') as f:
    f.write(code)

print('Done! App.jsx updated.')

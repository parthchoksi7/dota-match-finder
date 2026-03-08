export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Service unavailable' })
  }

  const { team1, team2, tournament, seriesType, seriesScore, seriesWinner, games } = req.body || {}
  if (!team1 || !team2 || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : 'BO3'

  const gamesText = games.map(g =>
    `Game ${g.gameNumber}: ${g.winner} won (${g.duration})${g.vodUrl ? ` — VOD: ${g.vodUrl}` : ' — no VOD available'}`
  ).join('\n')

  const prompt = `You write X/Twitter posts for Dota 2 esports results. Generate one post per game for this series.

Series: ${team1} vs ${team2} — ${tournament} (${seriesLabel})
Final result: ${seriesWinner} won ${seriesScore}
Games:
${gamesText}

Rules:
- Write exactly ${games.length} post${games.length > 1 ? 's' : ''}, one per game
- Each post must sound noticeably different from the others — vary the structure, tone, angle, and opening
- Natural and human — like someone who follows the Dota 2 pro scene, not a press release
- Under 220 characters each (the VOD link will be appended separately and counts toward the limit)
- Mention which team won Game N and include a brief natural observation about the result
- End each post with the VOD link if one is available, or omit the link if not
- No hashtags. No forced enthusiasm. Vary whether or not you use emojis across posts
- ${games.length > 1 ? 'Think about the narrative arc: opener, momentum shift, decider — each game has a different weight' : 'Keep it punchy since it\'s a single game'}
- Never start two posts the same way

Return ONLY a valid JSON array, no explanation, no markdown:
[{"game": 1, "post": "..."}, ...]`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || response.statusText
      return res.status(502).json({ error: 'Failed to generate posts', message: msg })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      return res.status(502).json({ error: 'Invalid response from AI service' })
    }

    // Parse JSON from response (strip any accidental markdown fences)
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const posts = JSON.parse(jsonStr)

    return res.status(200).json({ posts })
  } catch (err) {
    console.error('draft-posts error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to generate posts', message: err?.message })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Service unavailable' })
  }

  const { team1, team2, tournament, seriesType, seriesScore, seriesWinner, games, seriesLink, date } = req.body || {}
  if (!team1 || !team2 || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const seriesLabel = seriesType === 0 ? 'BO1' : seriesType === 2 ? 'BO5' : 'BO3'
  const dateStr = date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const gamesList = games.map(g =>
    `- ${team1} vs ${team2} - Game ${g.gameNumber} | Link: ${g.spectateUrl}`
  ).join('\n')

  const prompt = `Generate two Reddit posts about a Dota 2 pro series. Return ONLY a valid JSON object. No explanation, no markdown fences.

=== POST 1: VOD ROUNDUP (for r/DotaVods or r/Dota2) ===

You are a Dota 2 esports fan who watches pro matches regularly. You help other fans catch up on matches they missed by posting spoiler-free VOD roundups on Reddit.

STRICT RULES:
- NEVER reveal who won any match or game
- NEVER reveal the series score (e.g. 2-1, 2-0)
- NEVER hint at results through language like "you won't believe what happened" or "this one was insane" - that implies excitement which is itself a spoiler
- NEVER use em dashes anywhere. Use hyphens or rewrite the sentence.
- Keep the tone casual and helpful, like a fan posting for other fans
- Do NOT sound like you are marketing or promoting a product

FORMAT:
- Title: "[${tournament}] ${seriesLabel} - VOD Replay Links"
- Body: Brief 1-2 sentence intro, then list each game link as: **${team1} vs ${team2} - Game N** - [Watch](url)
- End with a short note that links jump to the match start on Twitch and that spoiler-free mode on the site hides results
- Keep the whole post under 150 words

MATCH DATA:
Tournament: ${tournament}
Format: ${seriesLabel}
Date: ${dateStr}
Games:
${gamesList}

=== POST 2: MATCH THREAD COMMENT (for r/Dota2 post-match discussion) ===

You are a Dota 2 esports fan. This series just finished. Write a short Reddit comment for the post-match discussion thread that lets people know they can watch the VODs with timestamped links.

STRICT RULES:
- You CAN reference the result since the thread itself is a spoiler zone, but keep it minimal. Focus on the VOD links, not a recap.
- NEVER use em dashes anywhere. Use hyphens or rewrite.
- Sound like a regular fan dropping a helpful link, not an ad
- Keep it to 2-4 sentences max
- Do NOT say "I built this" or "check out my site." Just share the link naturally.

MATCH DATA:
Teams: ${team1} vs ${team2}
Tournament: ${tournament} (${seriesLabel})
Result: ${seriesWinner} won ${seriesScore}
Link: ${seriesLink}

Return ONLY a valid JSON object with this exact shape:
{"matchPost": {"title": "...", "body": "..."}, "dayComment": "..."}`

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
        max_tokens: 1200,
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

    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    return res.status(200).json({
      matchPost: parsed.matchPost || null,
      dayComment: parsed.dayComment || null,
    })
  } catch (err) {
    console.error('reddit-posts error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to generate posts', message: err?.message })
  }
}

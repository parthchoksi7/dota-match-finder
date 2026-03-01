export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Summarize API: ANTHROPIC_API_KEY is not set')
    return res.status(503).json({
      error: 'Summary service unavailable',
      message: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.'
    })
  }

  const { matchData } = req.body || {}
  if (!matchData) {
    return res.status(400).json({ error: 'Missing matchData in request body' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a Dota 2 expert analyst. Give a concise match summary in 3 short sections only:
1. Strategy: One sentence on each team's draft and game plan.
2. MVP: Identify the standout player and why based on the stats.
3. Highlight: One exceptional moment or callout from the match.

Be specific with hero names and player names. Keep the whole summary under 150 words. Match data: ${JSON.stringify(matchData)}`
          }
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || data.message || response.statusText
      console.error('Anthropic API error:', response.status, msg)
      return res.status(response.status >= 500 ? 502 : 400).json({
        error: 'Failed to generate summary',
        message: msg
      })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      console.error('Unexpected Anthropic response shape:', JSON.stringify(data).slice(0, 200))
      return res.status(502).json({ error: 'Invalid response from summary service' })
    }

    return res.status(200).json({ summary: text })
  } catch (error) {
    console.error('Summarize API error:', error?.message || error)
    return res.status(500).json({
      error: 'Failed to generate summary',
      message: error?.message || 'Internal server error'
    })
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { matchData } = req.body

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
    const summary = data.content[0].text
    res.status(200).json({ summary })
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate summary' })
  }
}
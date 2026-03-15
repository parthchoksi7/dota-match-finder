import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'Summary service unavailable' })
  }

  const { seriesId, name, leagueName, status, beginAt, endAt, prizePool, teams, stages } = req.body || {}

  if (!seriesId || !name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const isCompleted = status === 'completed'
  const TTL = isCompleted ? 60 * 60 * 24 * 30 : 60 * 60 * 24
  const cacheKey = `tournament:summary:${seriesId}`

  try {
    const cached = await kv.get(cacheKey)
    if (cached) {
      console.log(`Tournament summary: serving from KV cache for ${seriesId}`)
      return res.status(200).json({ summary: cached })
    }
  } catch (err) {
    console.warn('KV cache read failed:', err?.message)
  }

  const teamNames = (teams || []).slice(0, 16).map(t => t.name).join(', ')
  const stageNames = (stages || []).map(s => s.name).join(', ')

  let dateRange = ''
  if (beginAt && endAt) {
    const start = new Date(beginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const end = new Date(endAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    dateRange = `${start} - ${end}`
  }

  const prompt = `You are a professional Dota 2 esports analyst. Write a short summary paragraph about this tournament for fans visiting the tournament page.

Tournament: ${name}
Organizer: ${leagueName || 'Unknown'}
Status: ${status}
Dates: ${dateRange || 'Unknown'}
Prize Pool: ${prizePool || 'Unknown'}
Stages: ${stageNames || 'Unknown'}
Teams: ${teamNames || 'Unknown'}

Write 3-5 sentences covering:
- What this tournament is and why it matters to Dota 2 fans
- Notable aspects (prize pool significance, format, prestige, defending champions if known)
- What fans should watch for (or the result if completed)
- Where this fits in the broader Dota 2 pro scene

Rules:
- Never use em dashes. Use hyphens or rewrite sentences instead.
- Plain text only. No markdown, no asterisks, no hashtags.
- Keep it concise and focused on what makes this tournament interesting.
- Do not speculate about visa issues or controversies unless they are well-known facts.
- If the tournament is completed, try to mention the winner if known from the teams list.
- Tone: confident and informative, like a knowledgeable analyst talking to a fan.
- Maximum 100 words.`

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || data.message || response.statusText
      console.error('Anthropic API error:', response.status, msg)
      return res.status(502).json({ error: 'Failed to generate summary', message: msg })
    }

    const text = data.content?.[0]?.text
    if (typeof text !== 'string') {
      return res.status(502).json({ error: 'Invalid response from summary service' })
    }

    try {
      await kv.set(cacheKey, text, { ex: TTL })
    } catch (err) {
      console.warn('KV cache write failed:', err?.message)
    }

    return res.status(200).json({ summary: text })

  } catch (err) {
    console.error('Tournament summary error:', err?.message || err)
    return res.status(500).json({ error: 'Failed to generate summary', message: err?.message })
  }
}

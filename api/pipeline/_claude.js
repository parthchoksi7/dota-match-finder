/**
 * Claude API calls for the editorial pipeline:
 * - generateTopics()  → 3 topic proposals from news context
 * - generateDraft()   → full article draft (with optional revision instructions)
 * - generateXPost()   → X post text for the published article
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

async function callClaude(system, userContent, maxTokens) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Claude API ${res.status}`)
  return data.content?.[0]?.text || ''
}

function parseJson(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  return JSON.parse(cleaned)
}

const EDITORIAL_SYSTEM = `You are the editorial voice of Spectate Esports — a Dota 2 esports intelligence platform covering Tier 1 professional Dota 2.

Writing style:
- Confident and direct. No hedging ("seems", "might", "could").
- Fan-first, analytically sharp. You watch the matches and understand the meta.
- Headlines carry narrative weight: "The Old Guard Is Gone. Copenhagen Belongs to Someone New."
- Every sentence earns its place. No filler, no throat-clearing.
- Never corporate, never press-release. Write like a knowledgeable fan, not a journalist.
- Categories: News (factual, structured), Preview (forward-looking narrative), Analysis (opinionated, evidence-based)`

export async function generateTopics(newsContext, recentTitles = []) {
  const avoidNote = recentTitles.length > 0
    ? `\n\nAvoid topics similar to these recently covered articles:\n${recentTitles.map(t => `- ${t}`).join('\n')}`
    : ''

  const prompt = `Based on the following Dota 2 esports news, propose exactly 3 article topics for today. Ensure variety: one News, one Analysis, one Preview (or adjust based on what's newsworthy).

${newsContext}
${avoidNote}

For each topic return:
- id: 1, 2, or 3
- title: the actual headline (strong, specific, 55-70 chars)
- angle: one sentence — what the article argues, reveals, or previews
- shortLabel: 2-4 words for a button (e.g. "Liquid roster")
- category: News | Preview | Analysis
- tournament: kebab-case slug (e.g. "blast-slam-vii") — most relevant current tournament
- tournamentLabel: display name (e.g. "BLAST Slam VII")

Return ONLY a valid JSON array, no explanation or markdown:
[{"id":1,"title":"...","angle":"...","shortLabel":"...","category":"News","tournament":"...","tournamentLabel":"..."},...]`

  const raw = await callClaude(EDITORIAL_SYSTEM, prompt, 900)
  return parseJson(raw)
}

export async function generateDraft(topic, newsContext, revisionInstructions = null) {
  const revisionNote = revisionInstructions
    ? `\n\nEDITOR REVISION INSTRUCTIONS — apply these to the draft:\n${revisionInstructions}`
    : ''

  const watchQueryHint = topic.tournament.replace(/-/g, ' ').replace(/\s+v?i{1,3}$/i, '').trim()

  const prompt = `Write a ${topic.category} article for Spectate Esports.

TOPIC: ${topic.title}
ANGLE: ${topic.angle}
TOURNAMENT: ${topic.tournamentLabel}
TARGET LENGTH: 300-400 words
${revisionNote}

STRICT FACTUAL RULES:
- Only state facts that are explicitly present in the CONTEXT below.
- Do NOT invent scores, player names, match results, roster moves, or dates not in the context.
- If the context lacks a specific detail, write around it — use framing and analysis rather than fabricated specifics.
- When in doubt about a fact, omit it rather than guess.

CONTEXT:
${newsContext}

Return ONLY valid JSON (no markdown fences):
{
  "slug": "tournament-keyword-keyword",
  "title": "Full Headline",
  "subtitle": "Supporting context sentence (120-150 chars).",
  "category": "${topic.category}",
  "excerpt": "1-2 sentence summary under 160 chars. Include team names and tournament name.",
  "readingTime": 2,
  "watchQuery": "${watchQueryHint}",
  "watchLabel": "Watch ${topic.tournamentLabel} on Spectate",
  "sections": [
    {"type": "paragraph", "text": "Opening paragraph. No heading before this."},
    {"type": "heading", "text": "Section Heading"},
    {"type": "paragraph", "text": "..."},
    {"type": "heading", "text": "Another Section"},
    {"type": "paragraph", "text": "..."},
    {"type": "heading", "text": "What's Next"},
    {"type": "paragraph", "text": "Closing paragraph."}
  ]
}

Slug rules: start with "${topic.tournament}-", add 2-3 keywords, kebab-case, max 60 chars, no stop words.
Each paragraph: 60-100 words. 4-7 sections total. First section is always a paragraph.`

  const raw = await callClaude(EDITORIAL_SYSTEM, prompt, 2000)
  return parseJson(raw)
}

export async function generateXPost(article) {
  const prompt = `Write an X post for this Spectate Esports article.

Title: ${article.title}
Tournament: ${article.tournamentLabel}
Excerpt: ${article.excerpt}
URL: https://spectateesports.live/articles/${article.slug}

Rules:
- Hook line first: punchy, specific, max 120 chars
- 1 short sentence of context or angle
- URL on its own line
- Last line: hashtags — always #Dota2, plus a tournament tag if the name is short enough
- Total under 280 chars
- No em dashes, no quotes around the hook

Return ONLY the tweet text, nothing else.`

  const raw = await callClaude(
    'You are @SpectateDota2 on X. Sharp, knowledgeable Dota 2 fan. Direct, never corporate.',
    prompt,
    300
  )
  return raw.trim()
}

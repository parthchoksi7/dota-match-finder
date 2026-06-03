/**
 * POST/GET /api/pipeline/trigger
 *
 * Called by Vercel Cron at 14:00 UTC (6:00 AM PST / 7:00 AM PDT) daily.
 * Also callable manually via Telegram /trigger command or direct HTTP.
 *
 * Flow: fetch news → generate 3 topics → send Telegram message → save session.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { todayKey, getSession, saveSession, getRecentTopicTitles, addRecentTopics } from './_session.js'
import { fetchNewsContext } from './_news.js'
import { generateTopics } from './_claude.js'
import { sendMessage, topicsKeyboard } from './_telegram.js'

export default async function handler(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const key = todayKey()
  const existing = await getSession(key)
  if (existing && !['DISMISSED', 'REJECTED', 'PUBLISHED', 'EXPIRED'].includes(existing.state)) {
    return res.status(200).json({ skipped: true, reason: 'Session already active', state: existing.state })
  }

  let newsContext, topics
  try {
    newsContext = await fetchNewsContext()
    const recentTitles = await getRecentTopicTitles()
    topics = await generateTopics(newsContext, recentTitles)
  } catch (err) {
    console.error('[pipeline/trigger] generation error:', err.message)
    await sendMessage(`⚠️ <b>Daily topic generation failed</b>\n\nError: ${err.message}\n\nReply /trigger to retry.`).catch(() => {})
    return res.status(500).json({ error: err.message })
  }

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })

  const topicLines = topics.map((t, i) =>
    `${i + 1}. <b>${t.title}</b>\n   <i>${t.angle}</i>`
  ).join('\n\n')

  const msgResult = await sendMessage(
    `🎯 <b>SpectateEsports — ${date}</b>\n\nChoose a topic to write:\n\n${topicLines}`,
    { reply_markup: topicsKeyboard(topics) }
  )

  const session = {
    key,
    date: new Date().toISOString().slice(0, 10),
    state: 'TOPICS_SENT',
    topics,
    newsContext,
    selectedTopicId: null,
    drafts: [],
    topicsMessageId: msgResult.result?.message_id ?? null,
    publishedSlug: null,
    xPostId: null,
    createdAt: new Date().toISOString(),
  }

  await saveSession(key, session)
  await addRecentTopics(topics.map(t => t.title))

  return res.status(200).json({ ok: true, date: session.date, topicsGenerated: topics.length })
}

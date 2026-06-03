/**
 * POST /api/pipeline/telegram-webhook
 *
 * Handles all Telegram updates for the editorial pipeline bot.
 *
 * State machine transitions:
 *   TOPICS_SENT      + select:N        → DRAFT_GENERATING → DRAFT_SENT
 *   TOPICS_SENT      + skip            → DISMISSED
 *   DRAFT_SENT       + approve         → PUBLISHING → PUBLISHED
 *   DRAFT_SENT       + reject          → REJECTED
 *   DRAFT_SENT       + request_changes → WAITING_REVISION
 *   WAITING_REVISION + text message    → DRAFT_GENERATING → DRAFT_SENT
 *   PUBLISH_FAILED   + retry_publish   → PUBLISHING → PUBLISHED
 *   PUBLISH_FAILED   + save_draft_only → DRAFT_SAVED
 *
 * Commands: /status, /trigger, /reset
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { kv } from '../_kv.js'
import { todayKey, getSession, saveSession, deleteSession, getRecentTopicTitles, addRecentTopics } from './_session.js'
import { fetchNewsContext } from './_news.js'
import { generateTopics, generateDraft, generateXPost } from './_claude.js'
import { sendMessage, answerCallback, topicsKeyboard, draftKeyboard, retryKeyboard, chunkText } from './_telegram.js'
import { publishToDb, postXTweet, updateMetadataFiles } from './_publisher.js'

const MAX_REVISIONS = 3

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Validate webhook secret header
  const secret = req.headers['x-telegram-bot-api-secret-token']
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(200).end() // Return 200 so Telegram stops retrying
  }

  const update = req.body
  if (!update?.update_id) return res.status(200).end()

  // Idempotency: skip already-processed updates
  const dedupKey = `pipeline:tg-upd:${update.update_id}`
  const seen = await kv.get(dedupKey).catch(() => null)
  if (seen) return res.status(200).end()
  await kv.set(dedupKey, 1, { ex: 3600 }).catch(() => {})

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query)
    } else if (update.message?.text) {
      await handleMessage(update.message)
    }
  } catch (err) {
    console.error('[telegram-webhook] error:', err.message)
    await sendMessage(`⚠️ Pipeline error: ${err.message}`).catch(() => {})
  }

  return res.status(200).end()
}

// ── Callback query handler (button presses) ───────────────────────────────────

async function handleCallback(cb) {
  const data = cb.data
  await answerCallback(cb.id) // Always answer immediately to stop the Telegram spinner

  if (data === 'noop') return

  const key = todayKey()
  const session = await getSession(key)

  if (!session) {
    await sendMessage('No active session for today. Send /trigger to start.')
    return
  }

  if (data === 'skip') {
    await saveSession(key, { ...session, state: 'DISMISSED' })
    await sendMessage('⏭ Skipped today. See you tomorrow at 6am.')
    return
  }

  if (data.startsWith('select:')) {
    if (session.state !== 'TOPICS_SENT') return
    const topicId = parseInt(data.split(':')[1], 10)
    const topic = session.topics?.find(t => t.id === topicId)
    if (!topic) return
    await saveSession(key, { ...session, state: 'DRAFT_GENERATING', selectedTopicId: topicId })
    await sendMessage(`✍️ Generating draft for: <b>${topic.title}</b>...`)
    await runDraftGeneration(key, session, topic)
    return
  }

  if (data === 'approve') {
    if (session.state !== 'DRAFT_SENT') return
    await runPublish(key, session)
    return
  }

  if (data === 'reject') {
    if (session.state !== 'DRAFT_SENT') return
    await saveSession(key, { ...session, state: 'REJECTED' })
    await sendMessage('✗ Draft rejected. No article published today.')
    return
  }

  if (data === 'request_changes') {
    if (session.state !== 'DRAFT_SENT') return
    await saveSession(key, { ...session, state: 'WAITING_REVISION' })
    await sendMessage('✏️ Send your revision instructions as a reply:')
    return
  }

  if (data === 'retry_publish') {
    if (session.state !== 'PUBLISH_FAILED') return
    await runPublish(key, session)
    return
  }

  if (data === 'save_draft_only') {
    await saveSession(key, { ...session, state: 'DRAFT_SAVED' })
    await sendMessage('💾 Draft saved. Publish manually when ready.')
    return
  }
}

// ── Message handler (text, commands, revision instructions) ───────────────────

async function handleMessage(message) {
  const text = message.text?.trim() || ''
  const key = todayKey()
  const session = await getSession(key)

  if (text === '/status' || text.startsWith('/status@')) {
    if (!session) {
      await sendMessage(`📊 No session today (${new Date().toISOString().slice(0, 10)}).`)
      return
    }
    const topicTitle = session.selectedTopicId
      ? session.topics?.find(t => t.id === session.selectedTopicId)?.title
      : null
    const lines = [
      `📊 <b>Pipeline — ${session.date}</b>`,
      `State: <code>${session.state}</code>`,
      topicTitle ? `Topic: ${topicTitle}` : null,
      session.drafts?.length > 0 ? `Drafts: ${session.drafts.length}` : null,
      session.publishedSlug ? `Published: /articles/${session.publishedSlug}` : null,
    ].filter(Boolean)
    await sendMessage(lines.join('\n'))
    return
  }

  if (text === '/reset' || text.startsWith('/reset@')) {
    if (session) await deleteSession(key)
    await sendMessage('🔄 Session cleared. Send /trigger to start fresh.')
    return
  }

  if (text === '/trigger' || text.startsWith('/trigger@')) {
    if (session && !['DISMISSED', 'REJECTED', 'PUBLISHED', 'EXPIRED'].includes(session.state)) {
      await sendMessage(`⚠️ Session already active (${session.state}). Send /reset first.`)
      return
    }
    if (session) await deleteSession(key)
    await sendMessage('⚡ Generating topics...')
    let newsContext, topics
    try {
      newsContext = await fetchNewsContext()
      const recentTitles = await getRecentTopicTitles()
      topics = await generateTopics(newsContext, recentTitles)
    } catch (err) {
      await sendMessage(`⚠️ Topic generation failed: ${err.message}`)
      return
    }
    const topicLines = topics.map((t, i) =>
      `${i + 1}. <b>${t.title}</b>\n   <i>${t.angle}</i>`
    ).join('\n\n')
    const msgResult = await sendMessage(
      `🎯 <b>Choose a topic to write:</b>\n\n${topicLines}`,
      { reply_markup: topicsKeyboard(topics) }
    )
    const newSession = {
      key, date: new Date().toISOString().slice(0, 10),
      state: 'TOPICS_SENT', topics, newsContext,
      selectedTopicId: null, drafts: [],
      topicsMessageId: msgResult.result?.message_id ?? null,
      publishedSlug: null, xPostId: null,
      createdAt: new Date().toISOString(),
    }
    await saveSession(key, newSession)
    await addRecentTopics(topics.map(t => t.title))
    return
  }

  // Revision instructions
  if (session?.state === 'WAITING_REVISION') {
    const version = (session.drafts?.length || 0) + 1
    if (version > MAX_REVISIONS) {
      await sendMessage(`⚠️ Max ${MAX_REVISIONS} revisions reached. Approve or reject the current draft.`)
      return
    }
    const topic = session.topics?.find(t => t.id === session.selectedTopicId)
    if (!topic) return
    await saveSession(key, { ...session, state: 'DRAFT_GENERATING' })
    await sendMessage(`🔄 Generating revision ${version}...`)
    await runDraftGeneration(key, session, topic, text)
  }
}

// ── Draft generation (shared between topic select and revision) ───────────────

async function runDraftGeneration(key, session, topic, revisionInstructions = null) {
  let draft
  try {
    const rawDraft = await generateDraft(topic, session.newsContext, revisionInstructions)
    draft = {
      ...rawDraft,
      tournament: topic.tournament,
      tournamentLabel: topic.tournamentLabel,
      publishedAt: new Date().toISOString().slice(0, 10),
    }
    draft.xPostText = await generateXPost(draft)
  } catch (err) {
    const prevState = revisionInstructions ? 'DRAFT_SENT' : 'TOPICS_SENT'
    await saveSession(key, { ...session, state: prevState })
    await sendMessage(`⚠️ Draft generation failed: ${err.message}. Try again.`)
    return
  }

  const version = (session.drafts?.length || 0) + 1
  await sendDraft(key, { ...session, drafts: session.drafts || [] }, draft, version)
}

// ── Publish flow ──────────────────────────────────────────────────────────────

async function runPublish(key, session) {
  const draft = session.drafts?.[session.drafts.length - 1]
  if (!draft) {
    await sendMessage('⚠️ No draft found. Restart with /trigger.')
    return
  }

  await saveSession(key, { ...session, state: 'PUBLISHING' })
  await sendMessage('🚀 Publishing...')

  let articleUrl = null
  let xPost = null
  const errors = []

  try {
    articleUrl = await publishToDb(draft)
  } catch (err) {
    errors.push(`DB: ${err.message}`)
  }

  if (!articleUrl) {
    await saveSession(key, { ...session, state: 'PUBLISH_FAILED' })
    await sendMessage(
      `⚠️ <b>Publish failed</b>\n\n${errors.join('\n')}`,
      { reply_markup: retryKeyboard() }
    )
    return
  }

  // X post and metadata are non-blocking: failures are logged but don't block publish
  try {
    xPost = await postXTweet(draft.xPostText)
  } catch (err) {
    errors.push(`X: ${err.message}`)
  }

  try {
    await updateMetadataFiles(draft)
  } catch (err) {
    errors.push(`Metadata: ${err.message}`)
  }

  await saveSession(key, {
    ...session,
    state: 'PUBLISHED',
    publishedSlug: draft.slug,
    xPostId: xPost?.id ?? null,
  })

  let msg = `✅ <b>Published!</b>\n\n📰 <a href="${articleUrl}">${draft.title}</a>`
  if (xPost?.url) msg += `\n\n🐦 <a href="${xPost.url}">X post live</a>`
  if (errors.length > 0) msg += `\n\n⚠️ Minor issues (article still live): ${errors.join(' | ')}`
  await sendMessage(msg)
}

// ── Draft formatting and send ─────────────────────────────────────────────────

function formatDraft(draft, version) {
  const header = `📝 <b>Draft v${version} — ${draft.category}</b>\n\n`
  const title = `<b>${draft.title}</b>\n`
  const subtitle = draft.subtitle ? `<i>${draft.subtitle}</i>\n` : ''

  const body = draft.sections.map(s => {
    if (s.type === 'heading') return `\n<b>${s.text}</b>`
    if (s.type === 'subheading') return `\n<i>${s.text}</i>`
    return s.text
  }).join('\n')

  const wordCount = draft.sections
    .filter(s => s.type === 'paragraph')
    .reduce((n, s) => n + s.text.split(/\s+/).length, 0)

  const footer = `\n\n📊 ~${wordCount} words\n\n🐦 <b>X preview:</b>\n<code>${draft.xPostText || ''}</code>`

  return header + title + subtitle + body + footer
}

async function sendDraft(key, session, draft, version) {
  const text = formatDraft(draft, version)
  const chunks = chunkText(text)

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    await sendMessage(chunks[i], isLast ? { reply_markup: draftKeyboard(version, MAX_REVISIONS) } : {})
  }

  const updatedDrafts = [...(session.drafts || []), draft]
  await saveSession(key, { ...session, state: 'DRAFT_SENT', drafts: updatedDrafts })
}

/**
 * Consolidated pipeline endpoint — routes all pipeline + articles traffic
 * through a single serverless function to stay within Vercel's 12-function limit.
 *
 * GET  /api/pipeline?type=articles               → all published articles
 * GET  /api/pipeline?type=articles&slug=xxx      → single article
 * GET  /api/pipeline?type=articles&tournament=x  → filtered list
 * GET  /api/pipeline?type=articles&mode=meta     → metadata only (no sections)
 * GET  /api/pipeline?type=articles&mode=slugs    → slugs + tournaments for sitemap
 * GET  /api/pipeline?type=trigger                → cron: generate topics + send to Telegram
 * POST /api/pipeline                             → Telegram webhook handler
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getSupabaseAnon, getSupabaseAdmin } from './_supabase.js'
import { kv } from './_kv.js'
import { todayKey, getSession, saveSession, deleteSession, getRecentTopicTitles, addRecentTopics } from './pipeline/_session.js'
import { fetchNewsContext } from './pipeline/_news.js'
import { generateTopics, generateDraft, generateXPost } from './pipeline/_claude.js'
import { sendMessage, answerCallback, topicsKeyboard, draftKeyboard, retryKeyboard, chunkText } from './pipeline/_telegram.js'
import { publishToDb, postXTweet, updateMetadataFiles } from './pipeline/_publisher.js'
import { setCorsHeaders, createLogger } from './_shared.js'

const MAX_REVISIONS = 3

// ── Articles ──────────────────────────────────────────────────────────────────

function mapRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: row.published_at,
    tournament: row.tournament,
    tournamentLabel: row.tournament_label,
    category: row.category,
    readingTime: row.reading_time,
    watchQuery: row.watch_query,
    watchLabel: row.watch_label,
    excerpt: row.excerpt,
    sections: row.sections,
  }
}

function mapMetaRow(row) {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: row.published_at,
    tournament: row.tournament,
    tournamentLabel: row.tournament_label,
    category: row.category,
    excerpt: row.excerpt,
  }
}

async function handleArticles(req, res) {
  const db = getSupabaseAnon()
  const { slug, tournament, mode } = req.query || {}

  try {
    if (slug) {
      const cols = mode === 'meta'
        ? 'slug,title,subtitle,published_at,tournament,tournament_label,category,excerpt'
        : '*'
      const { data, error } = await db
        .from('articles').select(cols)
        .eq('slug', slug).eq('status', 'published').single()
      if (error || !data) return res.status(404).json({ error: 'Article not found' })
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json({ article: mode === 'meta' ? mapMetaRow(data) : mapRow(data) })
    }

    const notExpired = `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`

    if (mode === 'slugs') {
      const { data, error } = await db
        .from('articles').select('slug,tournament')
        .eq('status', 'published').or(notExpired).order('published_at', { ascending: false })
      if (error) throw error
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
      return res.status(200).json({
        slugs: (data || []).map(r => r.slug),
        tournaments: [...new Set((data || []).map(r => r.tournament))],
      })
    }

    if (mode === 'meta') {
      let q = db.from('articles')
        .select('slug,title,subtitle,published_at,tournament,tournament_label,category,excerpt')
        .eq('status', 'published').or(notExpired).order('published_at', { ascending: false }).limit(50)
      if (tournament) q = q.eq('tournament', tournament)
      const { data, error } = await q
      if (error) throw error
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json({ articles: (data || []).map(mapMetaRow) })
    }

    let q = db.from('articles').select('*')
      .eq('status', 'published').or(notExpired).order('published_at', { ascending: false }).limit(100)
    if (tournament) q = q.eq('tournament', tournament)
    const { data, error } = await q
    if (error) throw error
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ articles: (data || []).map(mapRow) })
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', endpoint: '/api/pipeline', msg: 'articles error', error: err.message, ts: Date.now() }))
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ── Cron trigger ──────────────────────────────────────────────────────────────

async function handleTrigger(req, res) {
  const auth = req.headers.authorization || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const key = todayKey()
  const existing = await getSession(key)
  if (existing && !['DISMISSED', 'REJECTED', 'PUBLISHED', 'EXPIRED'].includes(existing.state)) {
    return res.status(200).json({ skipped: true, state: existing.state })
  }

  let newsContext, topics
  try {
    newsContext = await fetchNewsContext()
    const recentTitles = await getRecentTopicTitles()
    topics = await generateTopics(newsContext, recentTitles)
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', endpoint: '/api/pipeline', msg: 'trigger error', error: err.message, ts: Date.now() }))
    await sendMessage(`⚠️ <b>Topic generation failed</b>\n\n${err.message}\n\nSend /trigger to retry.`).catch(() => {})
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
    key, date: new Date().toISOString().slice(0, 10),
    state: 'TOPICS_SENT', topics, newsContext,
    selectedTopicId: null, drafts: [],
    topicsMessageId: msgResult.result?.message_id ?? null,
    publishedSlug: null, xPostId: null,
    createdAt: new Date().toISOString(),
  }
  await saveSession(key, session)
  await addRecentTopics(topics.map(t => t.title))
  reconcileStreamHistory().catch(() => {})
  return res.status(200).json({ ok: true, topicsGenerated: topics.length })
}

// ── Telegram webhook ──────────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const secret = req.headers['x-telegram-bot-api-secret-token']
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(200).end()
  }

  const update = req.body
  if (!update?.update_id) return res.status(200).end()

  const dedupKey = `pipeline:tg-upd:${update.update_id}`
  const seen = await kv.get(dedupKey).catch(() => null)
  if (seen) return res.status(200).end()
  await kv.set(dedupKey, 1, { ex: 3600 }).catch(() => {})

  try {
    if (update.callback_query) await onCallback(update.callback_query)
    else if (update.message?.text) await onMessage(update.message)
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', endpoint: '/api/pipeline', msg: 'webhook error', error: err.message, ts: Date.now() }))
    await sendMessage(`⚠️ Pipeline error: ${err.message}`).catch(() => {})
  }

  res.status(200).end()
}

async function onCallback(cb) {
  const data = cb.data
  await answerCallback(cb.id)
  if (data === 'noop') return

  const key = todayKey()
  const session = await getSession(key)
  if (!session) { await sendMessage('No active session. Send /trigger to start.'); return }

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
    const updatedSession = { ...session, state: 'DRAFT_GENERATING', selectedTopicId: topicId }
    await saveSession(key, updatedSession)
    await sendMessage(`✍️ Generating draft for: <b>${topic.title}</b>...`)
    await runDraftGeneration(key, updatedSession, topic)
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
    await sendMessage('✏️ Send your revision instructions:')
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

async function onMessage(message) {
  const text = message.text?.trim() || ''
  const key = todayKey()
  const session = await getSession(key)

  if (text === '/status' || text.startsWith('/status@')) {
    if (!session) { await sendMessage(`📊 No session today.`); return }
    const topicTitle = session.selectedTopicId
      ? session.topics?.find(t => t.id === session.selectedTopicId)?.title : null
    await sendMessage([
      `📊 <b>Pipeline — ${session.date}</b>`,
      `State: <code>${session.state}</code>`,
      topicTitle ? `Topic: ${topicTitle}` : null,
      session.drafts?.length > 0 ? `Drafts: ${session.drafts.length}` : null,
      session.publishedSlug ? `Published: /articles/${session.publishedSlug}` : null,
    ].filter(Boolean).join('\n'))
    return
  }

  if (text === '/reset' || text.startsWith('/reset@')) {
    await sendMessage('🔄 Session cleared. Send /trigger to start fresh.')
    if (session) await deleteSession(key)
    return
  }

  if (text === '/trigger' || text.startsWith('/trigger@')) {
    await sendMessage('⚡ Received. Generating topics...')
    if (session && !['DISMISSED', 'REJECTED', 'PUBLISHED', 'EXPIRED'].includes(session.state)) {
      await sendMessage(`⚠️ Session already active (${session.state}). Send /reset first.`)
      return
    }
    if (session) await deleteSession(key)
    let newsContext, topics
    try {
      newsContext = await fetchNewsContext()
      topics = await generateTopics(newsContext, await getRecentTopicTitles())
    } catch (err) {
      await sendMessage(`⚠️ Failed: ${err.message}`)
      return
    }
    const topicLines = topics.map((t, i) =>
      `${i + 1}. <b>${t.title}</b>\n   <i>${t.angle}</i>`
    ).join('\n\n')
    const msgResult = await sendMessage(
      `🎯 <b>Choose a topic:</b>\n\n${topicLines}`,
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

  if (session?.state === 'WAITING_REVISION') {
    const version = (session.drafts?.length || 0) + 1
    if (version > MAX_REVISIONS) {
      await sendMessage(`⚠️ Max ${MAX_REVISIONS} revisions reached. Approve or reject.`)
      return
    }
    const topic = session.topics?.find(t => t.id === session.selectedTopicId)
    if (!topic) return
    await saveSession(key, { ...session, state: 'DRAFT_GENERATING' })
    await sendMessage(`🔄 Generating revision ${version}...`)
    await runDraftGeneration(key, session, topic, text)
  }
}

async function runDraftGeneration(key, session, topic, revisionInstructions = null) {
  let draft
  try {
    const rawDraft = await generateDraft(topic, session.newsContext, revisionInstructions)
    draft = { ...rawDraft, tournament: topic.tournament, tournamentLabel: topic.tournamentLabel, publishedAt: new Date().toISOString().slice(0, 10) }
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

async function runPublish(key, session) {
  const draft = session.drafts?.[session.drafts.length - 1]
  if (!draft) { await sendMessage('⚠️ No draft found. Use /trigger.'); return }

  await saveSession(key, { ...session, state: 'PUBLISHING' })
  await sendMessage('🚀 Publishing...')

  let articleUrl = null
  let xPost = null
  const errors = []

  try { articleUrl = await publishToDb(draft) }
  catch (err) { errors.push(`DB: ${err.message}`) }

  if (!articleUrl) {
    await saveSession(key, { ...session, state: 'PUBLISH_FAILED' })
    await sendMessage(`⚠️ <b>Publish failed</b>\n\n${errors.join('\n')}`, { reply_markup: retryKeyboard() })
    return
  }

  try { xPost = await postXTweet(draft.xPostText) } catch (err) { errors.push(`X: ${err.message}`) }
  try { await updateMetadataFiles(draft) } catch (err) { errors.push(`Metadata: ${err.message}`) }

  await saveSession(key, { ...session, state: 'PUBLISHED', publishedSlug: draft.slug, xPostId: xPost?.id ?? null })

  let msg = `✅ <b>Published!</b>\n\n📰 <a href="${articleUrl}">${draft.title}</a>`
  if (xPost?.url) msg += `\n\n🐦 <a href="${xPost.url}">X post live</a>`
  if (errors.length) msg += `\n\n⚠️ Minor issues: ${errors.join(' | ')}`
  await sendMessage(msg)
}

function formatDraft(draft, version) {
  const header = `📝 <b>Draft v${version} — ${draft.category}</b>\n\n`
  const body = draft.sections.map(s => {
    if (s.type === 'heading') return `\n<b>${s.text}</b>`
    if (s.type === 'subheading') return `\n<i>${s.text}</i>`
    return s.text
  }).join('\n')
  const wordCount = draft.sections.filter(s => s.type === 'paragraph').reduce((n, s) => n + s.text.split(/\s+/).length, 0)
  return header + `<b>${draft.title}</b>\n` + (draft.subtitle ? `<i>${draft.subtitle}</i>\n` : '') + body + `\n\n📊 ~${wordCount} words\n\n🐦 <b>X preview:</b>\n<code>${draft.xPostText || ''}</code>`
}

async function sendDraft(key, session, draft, version) {
  const chunks = chunkText(formatDraft(draft, version))
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    await sendMessage(chunks[i], isLast ? { reply_markup: draftKeyboard(version, MAX_REVISIONS) } : {})
  }
  await saveSession(key, { ...session, state: 'DRAFT_SENT', drafts: [...(session.drafts || []), draft] })
}

// ── Stream history reconciliation ─────────────────────────────────────────────
// Called fire-and-forget from handleTrigger. Compares match count and English
// stream channels between Supabase (permanent) and KV cache (14-day TTL).
// Logs one structured JSON line — check Vercel logs daily for channel_mismatch > 0.

async function reconcileStreamHistory() {
  try {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
    const { data, error } = await getSupabaseAdmin()
      .from('match_stream_history')
      .select('od_match_id, channel')
      .gt('started_at', since)
      .order('started_at', { ascending: false })

    if (error) {
      console.error(JSON.stringify({ level: 'warn', endpoint: '/api/pipeline', msg: 'reconcile: supabase query failed', error: error.message, ts: Date.now() }))
      return
    }
    if (!data || data.length === 0) {
      console.log(JSON.stringify({ level: 'info', endpoint: '/api/pipeline', msg: 'reconcile: no rows in db (14d window)', ts: Date.now() }))
      return
    }

    const keys = data.map(r => `stream:match:${r.od_match_id}`)
    const kvValues = await kv.mget(...keys)

    let kvPresent = 0
    let channelMatch = 0
    let channelMismatch = 0
    const mismatches = []

    data.forEach((row, i) => {
      const kvChannel = kvValues[i]
      if (!kvChannel) return
      kvPresent++
      if (kvChannel === row.channel) {
        channelMatch++
      } else {
        channelMismatch++
        if (mismatches.length < 5) mismatches.push({ od_match_id: row.od_match_id, db: row.channel, kv: kvChannel })
      }
    })

    const result = {
      db_rows: data.length,
      kv_present: kvPresent,
      kv_expired_or_missing: data.length - kvPresent,
      channel_match: channelMatch,
      channel_mismatch: channelMismatch,
      ...(mismatches.length > 0 && { sample_mismatches: mismatches }),
      ran_at: new Date().toISOString(),
    }
    await kv.set('reconcile:stream-history:latest', result, { ex: 8 * 24 * 3600 })
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', endpoint: '/api/pipeline', msg: 'reconcile: error', error: err?.message, ts: Date.now() }))
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (setCorsHeaders(req, res)) return
  const type = req.query?.type

  if (req.method === 'GET' && type === 'articles') return handleArticles(req, res)
  if (req.method === 'GET' && type === 'trigger') return handleTrigger(req, res)
  if (req.method === 'GET' && type === 'stream-status') {
    const result = await kv.get('reconcile:stream-history:latest').catch(() => null)
    if (!result) return res.status(404).json({ error: 'No reconciliation run yet' })
    return res.status(200).json(result)
  }
  if (req.method === 'POST') return handleWebhook(req, res)

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Telegram Bot API utilities for the editorial pipeline.
 * All messages go to TELEGRAM_CHAT_ID (Parth's personal chat).
 */

function apiUrl(method) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`
}

function post(method, body) {
  return fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())
}

export async function sendMessage(text, extra = {}) {
  return post('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  })
}

export async function editMessage(messageId, text, extra = {}) {
  return post('editMessageText', {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  })
}

export async function answerCallback(callbackQueryId, text = '') {
  return post('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

export function topicsKeyboard(topics) {
  const emojis = ['1️⃣', '2️⃣', '3️⃣']
  return {
    inline_keyboard: [
      topics.map((t, i) => ({
        text: `${emojis[i]} ${t.shortLabel}`,
        callback_data: `select:${t.id}`,
      })),
      [{ text: '⏭ Skip today', callback_data: 'skip' }],
    ],
  }
}

export function draftKeyboard(version, maxRevisions = 3) {
  const revisionsLeft = maxRevisions - version
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve & Publish', callback_data: 'approve' },
        { text: '✗ Reject', callback_data: 'reject' },
      ],
      revisionsLeft > 0
        ? [{ text: `✏️ Request Changes${revisionsLeft === 1 ? ' (last)' : ''}`, callback_data: 'request_changes' }]
        : [{ text: '✏️ Max revisions reached', callback_data: 'noop' }],
    ],
  }
}

export function retryKeyboard() {
  return {
    inline_keyboard: [[
      { text: '🔄 Retry publish', callback_data: 'retry_publish' },
      { text: '💾 Save draft only', callback_data: 'save_draft_only' },
    ]],
  }
}

// Telegram max message length is 4096. Use 3900 to leave room for formatting.
export function chunkText(text, maxLen = 3900) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen))
    i += maxLen
  }
  return chunks
}

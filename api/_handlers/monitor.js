import { kv } from '../_kv.js'
import { checkServices } from '../_shared.js'

async function analyzeWithClaude(recentErrors, services, byEndpoint) {
  if (!process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY not configured.'
  const serviceLines = Object.entries(services)
    .map(([name, info]) => `${name}: ${info.status}${info.error ? ` (${info.error})` : ''} — ${info.latency_ms}ms`)
    .join('\n')
  const prompt = `You are reviewing production error telemetry for Spectate Esports (Dota 2 esports tracker on Vercel).\n\nErrors in the last 2h by endpoint:\n${JSON.stringify(byEndpoint, null, 2)}\n\nSample errors (up to 10):\n${JSON.stringify(recentErrors.slice(0, 10), null, 2)}\n\nService health:\n${serviceLines}\n\nIn 2-3 sentences: what happened, is it user-impacting, and what (if anything) should be done right now? Be specific and direct. No fluff.`
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await response.json()
    return data.content?.[0]?.text || 'Analysis unavailable.'
  } catch (err) {
    return `Analysis failed: ${err.message}`
  }
}

export default async function handleMonitor(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const reportMode = req.query?.report === '1'
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const [todayRaw, yesterdayRaw, services] = await Promise.all([
    kv.lrange(`monitor:errors:${today}`, 0, -1).catch(() => []),
    kv.lrange(`monitor:errors:${yesterday}`, 0, -1).catch(() => []),
    checkServices(),
  ])
  const parse = (raw) => {
    if (raw && typeof raw === 'object' && raw.ts) return raw
    try { return JSON.parse(raw) } catch { return null }
  }
  const allErrors = [...todayRaw, ...yesterdayRaw].map(parse).filter(Boolean)
  const twoHoursAgo = Date.now() - 2 * 3600 * 1000
  const twentyFourHoursAgo = Date.now() - 24 * 3600 * 1000
  const recentErrors = allErrors.filter(e => e.ts > twoHoursAgo)
  const dailyErrors = allErrors.filter(e => e.ts > twentyFourHoursAgo)
  const byEndpoint = {}
  for (const e of recentErrors) {
    byEndpoint[e.endpoint] = (byEndpoint[e.endpoint] || 0) + 1
  }
  const serviceDown = Object.values(services).some(s => s.status === 'error')
  const criticalEndpoint = Object.entries(byEndpoint).find(([, count]) => count >= 3)
  const critical = !!(criticalEndpoint || serviceDown)
  let summary = null
  if (reportMode) {
    summary = (recentErrors.length > 0 || serviceDown)
      ? await analyzeWithClaude(recentErrors, services, byEndpoint)
      : 'No errors in the last 2 hours. All services healthy.'
  }
  return res.status(200).json({
    period_2h: `${new Date(twoHoursAgo).toISOString()} to ${now.toISOString()}`,
    error_count: recentErrors.length,
    error_count_24h: dailyErrors.length,
    errors_by_endpoint: byEndpoint,
    recent_errors: recentErrors.slice(0, 10),
    services,
    critical,
    summary,
    action_required: critical,
    checked_at: now.toISOString(),
  })
}

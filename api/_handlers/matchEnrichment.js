import { kv } from '../_kv.js'
import { parseBracketRound, PANDASCORE_BASE } from '../_shared.js'

// ── match-enrichment mode ────────────────────────────────────────────────────
// Combines match-formats and match-brackets in a single KV round-trip.
// Returns { formats, brackets } keyed by OpenDota match ID.
export default async function handleMatchEnrichment(req, res) {
  const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
  if (ids.length === 0) return res.status(200).json({ formats: {}, brackets: {} })
  const formats = {}
  const brackets = {}
  try {
    const fmtKeys = ids.map(id => `format:match:${id}`)
    const bktKeys = ids.map(id => `bracket:match:${id}`)
    const allVals = await kv.mget(...fmtKeys, ...bktKeys)
    const fmtVals = allVals.slice(0, ids.length)
    const bktVals = allVals.slice(ids.length)
    ids.forEach((id, i) => {
      if (fmtVals[i]) formats[id] = fmtVals[i]
      if (bktVals[i]) brackets[id] = bktVals[i]
    })
  } catch (err) {
    console.warn('match-enrichment KV read failed:', err?.message)
  }
  const missing = ids.filter(id => !brackets[id])
  const psToken = process.env.PANDASCORE_TOKEN
  if (missing.length > 0 && psToken) {
    try {
      const ago7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const now = new Date().toISOString()
      const psUrl = `${PANDASCORE_BASE}/matches/past?sort=-end_at&page[size]=100&range[end_at]=${ago7d},${now}`
      const psRes = await fetch(psUrl, { headers: { 'Authorization': `Bearer ${psToken}`, 'Accept': 'application/json' } })
      if (psRes.ok) {
        const psMatches = await psRes.json()
        const missingSet = new Set(missing.map(String))
        const writes = []
        for (const m of (Array.isArray(psMatches) ? psMatches : [])) {
          const br = parseBracketRound(m.name)
          if (!br) continue
          for (const g of (m.games || [])) {
            const extId = String(g.external_identifier || '')
            if (!extId || !missingSet.has(extId)) continue
            brackets[extId] = br
            writes.push(kv.set(`bracket:match:${extId}`, br, { ex: 14 * 24 * 3600 }).catch(() => {}))
          }
        }
        if (writes.length) await Promise.allSettled(writes)
      }
    } catch (err) {
      console.warn('match-enrichment PS fallback failed:', err?.message)
    }
  }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json({ formats, brackets })
}

// ── match-formats mode ───────────────────────────────────────────────────────
// Returns PandaScore-sourced format ('best_of_2' etc.) keyed by OpenDota match ID.
export async function handleMatchFormats(req, res) {
  const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
  if (ids.length === 0) return res.status(200).json({ formats: {} })
  try {
    const values = await kv.mget(...ids.map(id => `format:match:${id}`))
    const formats = {}
    ids.forEach((id, i) => { if (values[i]) formats[id] = values[i] })
    return res.status(200).json({ formats })
  } catch (err) {
    console.warn('match-formats KV read failed:', err?.message)
    return res.status(200).json({ formats: {} })
  }
}

// ── match-brackets mode ──────────────────────────────────────────────────────
// Returns bracket round (e.g. "Grand Final") keyed by OpenDota match ID.
// First checks KV, falls back to a 7-day PS past-matches lookup.
export async function handleMatchBrackets(req, res) {
  const ids = (req.query?.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
  if (ids.length === 0) return res.status(200).json({ brackets: {} })
  const brackets = {}
  try {
    const values = await kv.mget(...ids.map(id => `bracket:match:${id}`))
    ids.forEach((id, i) => { if (values[i]) brackets[id] = values[i] })
  } catch {}
  const missing = ids.filter(id => !brackets[id])
  const psToken = process.env.PANDASCORE_TOKEN
  if (missing.length > 0 && psToken) {
    try {
      const ago7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const now = new Date().toISOString()
      const psUrl = `${PANDASCORE_BASE}/matches/past?sort=-end_at&page[size]=100&range[end_at]=${ago7d},${now}`
      const psRes = await fetch(psUrl, { headers: { 'Authorization': `Bearer ${psToken}`, 'Accept': 'application/json' } })
      if (psRes.ok) {
        const psMatches = await psRes.json()
        const missingSet = new Set(missing.map(String))
        const writes = []
        for (const m of (Array.isArray(psMatches) ? psMatches : [])) {
          const br = parseBracketRound(m.name)
          if (!br) continue
          for (const g of (m.games || [])) {
            const extId = String(g.external_identifier || '')
            if (!extId || !missingSet.has(extId)) continue
            brackets[extId] = br
            writes.push(kv.set(`bracket:match:${extId}`, br, { ex: 14 * 24 * 3600 }).catch(() => {}))
          }
        }
        if (writes.length) await Promise.allSettled(writes)
      }
    } catch (err) {
      console.warn('match-brackets PS fallback failed:', err?.message)
    }
  }
  return res.status(200).json({ brackets })
}

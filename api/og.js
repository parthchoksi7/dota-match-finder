import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const config = { runtime: 'nodejs' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fontData = fs.readFileSync(path.join(__dirname, 'fonts/inter-700.woff'))

const SATORI_OPTS = {
  width: 1200,
  height: 630,
  fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
}

// Rasterising one 1200x630 card costs ~600-860ms of ACTIVE CPU (measured 2026-08-12 with
// process.cpuUsage around the real handler: satori layout + resvg rasterisation, no I/O in the
// param-only modes). That is 75-100x a typical JSON handler here — /api/live-matches serves in
// ~8ms — so this endpoint dominates the Fluid Active CPU bill despite being one of the LOWEST
// endpoints by invocation count. Invocation count and CPU are not the same axis, and this file is
// where they diverge hardest.
//
// The series and article cards are PURE FUNCTIONS OF THEIR URL — every input is a query param —
// so the old 1h/24h TTLs were re-rendering byte-identical PNGs on a timer, forever. `immutable` is
// the honest description of those two.
//
// `max-age` (browser) is deliberately MUCH shorter than `s-maxage` (CDN). The CPU saving is
// entirely a CDN-side property, while a browser copy is the one layer no purge or redeploy can
// reach — and the owner-facing "Draft X posts" preview renders these in an <img>, so a year-long
// local copy would outlive a redesign precisely where it is most likely to be noticed and least
// likely to be blamed on caching.
//
// TRADEOFF of `immutable`: a redesign cannot invalidate existing URLs, so changing the artwork
// means changing the URL. FOUR generators must be version-bumped together, not three — the
// non-obvious one is api/draft-posts.js's auto-tweet path, which builds `mode: 'series'` as an
// object key and so does not turn up in a grep for "mode=series":
//   middleware.js  (bare /api/og, and ?matchId=)   middleware.js  (?mode=article)
//   src/App.jsx    (?mode=series)                   api/draft-posts.js (?mode=series, cron)
const IMMUTABLE_CACHE = 'public, max-age=86400, s-maxage=31536000, immutable'

// Resolved match cards get a long-but-FINITE TTL and no `immutable`, unlike the two above. They are
// not pure functions of their URL: the URL carries only matchId, while the rendered team and league
// names are echoes of OpenDota's `radiant_name`/`dire_name`/`league.name`, which come from joins
// against OpenDota's own mutable teams/leagues tables. This repo has already observed those change
// under a stable match id (CONTEXT.md's note that OD still reported "Tundra Esports" after the Iron
// Wing rebrand). Scores and duration really are immutable history; the names are not. 30 days still
// removes ~99.9% of the re-renders a 1h TTL caused, while leaving a self-healing path for a rename
// or a late-populated field instead of pinning a wrong card forever.
const MATCH_RESOLVED_CACHE = 'public, max-age=86400, s-maxage=2592000'

// For a match OpenDota cannot fully describe yet. Short, so the card re-renders once the data
// lands. Reached by: no matches row, a row whose display fields have not been joined yet, a
// non-OK response (OpenDota rate-limits, which is realistic mid-TI), or a thrown fetch.
const UNRESOLVED_CACHE = 'public, max-age=300, s-maxage=300'

function renderPng(res, svgPromise, cacheControl = IMMUTABLE_CACHE) {
  return svgPromise.then(svg => {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } })
    const png = resvg.render().asPng()
    res.setHeader("Content-Type", "image/png")
    res.setHeader('Cache-Control', cacheControl)
    res.end(png)
  })
}

// ── Mode: series (og-series) ─────────────────────────────────────────────────
async function handleSeries(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const team1 = url.searchParams.get('team1') || 'Team A'
  const team2 = url.searchParams.get('team2') || 'Team B'
  const winner = url.searchParams.get('winner') || team1
  const score = url.searchParams.get('score') || '2-0'
  const tournament = url.searchParams.get('tournament') || ''
  const seriesType = url.searchParams.get('seriesType')
  const seriesLabel = seriesType === '0' ? 'BO1' : seriesType === '2' ? 'BO5' : 'BO3'

  const loser = winner === team1 ? team2 : team1
  const [winnerGames, loserGames] = score.split('-').map(Number)

  const winnerFontSize = winner.length > 14 ? 44 : 56
  const loserFontSize = loser.length > 14 ? 44 : 56

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px', height: '630px',
          background: '#080c14',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'Inter',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: '-120px', left: '-80px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 70%)', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: '-100px', right: '-60px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(220,38,38,0.10) 0%, transparent 70%)', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: '0', left: '0', right: '0', height: '3px', background: 'linear-gradient(90deg, #ef4444 0%, rgba(239,68,68,0.2) 60%, transparent 100%)', display: 'flex' } } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 52px 0' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '10px' },
                    children: [
                      { type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' } } },
                      { type: 'div', props: { style: { display: 'flex', gap: '6px', fontSize: '15px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase' }, children: [{ type: 'span', props: { style: { color: '#ffffff' }, children: 'SPECTATE' } }, { type: 'span', props: { style: { color: '#ef4444' }, children: 'ESPORTS' } }] } }
                    ]
                  }
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
                    children: [
                      tournament ? { type: 'span', props: { style: { fontSize: '13px', color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }, children: tournament } } : null,
                      { type: 'div', props: { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [{ type: 'span', props: { style: { fontSize: '11px', color: '#ef4444', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)', padding: '2px 8px', borderRadius: '3px' }, children: seriesLabel } }, { type: 'span', props: { style: { fontSize: '11px', color: '#6b7280', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }, children: 'SERIES RESULT' } }] } }
                    ].filter(Boolean)
                  }
                }
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 52px', gap: '20px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: '28px', width: '100%', justifyContent: 'center' },
                    children: [
                      { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', flex: 1 }, children: [{ type: 'span', props: { style: { fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#ef4444' }, children: 'WINNER' } }, { type: 'span', props: { style: { fontSize: `${winnerFontSize}px`, fontWeight: 900, textTransform: 'uppercase', color: '#ffffff', lineHeight: 1 }, children: winner } }] } },
                      { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }, children: [{ type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [{ type: 'span', props: { style: { fontSize: '88px', fontWeight: 900, color: '#ffffff', lineHeight: 1 }, children: String(isNaN(winnerGames) ? score.split('-')[0] : winnerGames) } }, { type: 'span', props: { style: { fontSize: '40px', fontWeight: 300, color: '#374151', lineHeight: 1 }, children: '-' } }, { type: 'span', props: { style: { fontSize: '88px', fontWeight: 900, color: '#374151', lineHeight: 1 }, children: String(isNaN(loserGames) ? score.split('-')[1] : loserGames) } }] } }] } },
                      { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flex: 1 }, children: [{ type: 'span', props: { style: { fontSize: '11px', color: 'transparent' }, children: '.' } }, { type: 'span', props: { style: { fontSize: `${loserFontSize}px`, fontWeight: 900, textTransform: 'uppercase', color: '#4b5563', lineHeight: 1, textAlign: 'right' }, children: loser } }] } },
                    ]
                  }
                },
              ]
            }
          },
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 52px 32px' }, children: [{ type: 'span', props: { style: { fontSize: '12px', color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase' }, children: 'spectateesports.live' } }, { type: 'span', props: { style: { fontSize: '13px', color: '#ef4444', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }, children: 'Watch VODs + Drafts →' } }] } },
        ].filter(Boolean)
      }
    },
    SATORI_OPTS
  )

  return renderPng(res, Promise.resolve(svg))
}

// ── Mode: match (default og) ─────────────────────────────────────────────────
async function handleMatch(req, res) {
  const matchId = new URL(req.url, 'http://localhost').searchParams.get('matchId')

  let radiantTeam = 'Spectate Esports'
  let direTeam = 'Pro Dota 2 Matches'
  let radiantWin = true
  let radiantScore = null
  let direScore = null
  let tournament = 'spectateesports.live'
  let date = ''
  let duration = ''
  let seriesLabel = ''

  // Is this render complete enough to cache for a long time? Defaults FALSE for any matchId and is
  // only raised on the one good path, so every failure mode (throw, non-OK, missing row, partial
  // row) falls through to the short TTL rather than having to be enumerated.
  //
  // `!matchId` is the fixed branding card — no fetch, same artwork every time, genuinely immutable.
  let renderIsComplete = !matchId

  if (matchId) {
    try {
      const r = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
      // `r.ok` matters here: OpenDota rate-limits, and a 429 answers with a JSON error body that
      // parses fine. Without this the body just lacks match_id and we'd fall through correctly by
      // accident — stating it makes the safety explicit instead of emergent.
      const data = r.ok ? await r.json() : null
      if (data && data.match_id) {
        // A matches row EXISTING is not the same as it being renderable. OpenDota fills
        // radiant_name/dire_name by joining its separately-populated teams table, so for the first
        // minutes after a game ends the row can come back with the teams unresolved — which is
        // exactly when a fan pastes the link into Discord and a crawler renders the card. Gate the
        // long TTL on the fields this card actually draws, not on row existence, or a
        // "WINNER: RADIANT / DIRE" card with a blank tournament gets pinned for the cache lifetime.
        // radiant_win is checked against null (not truthiness) because false is a valid result and
        // an absent value would silently render the wrong team as the winner.
        renderIsComplete = Boolean(data.radiant_name) && Boolean(data.dire_name) && data.radiant_win != null

        radiantTeam = data.radiant_name || 'Radiant'
        direTeam = data.dire_name || 'Dire'
        radiantWin = data.radiant_win
        radiantScore = data.radiant_score ?? null
        direScore = data.dire_score ?? null
        tournament = data.league?.name || ''
        // timeZone pinned so the pixels do not depend on the runtime's TZ — matches how
        // middleware.js formats this same start_time for the page's meta description, which would
        // otherwise disagree with the card for matches near UTC midnight.
        date = data.start_time
          ? new Date(data.start_time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
          : ''
        const totalSecs = data.duration || 0
        duration = `${Math.floor(totalSecs / 60)}:${String(totalSecs % 60).padStart(2, '0')}`
        const st = data.series_type
        seriesLabel = st === 0 ? 'BO1' : st === 1 ? 'BO3' : st === 2 ? 'BO5' : ''
      }
    } catch (_) {}
  }

  const winner = radiantWin ? radiantTeam : direTeam
  const loser = radiantWin ? direTeam : radiantTeam
  const winnerScore = radiantWin ? radiantScore : direScore
  const loserScore = radiantWin ? direScore : radiantScore
  const hasScore = winnerScore !== null && loserScore !== null
  const winnerFontSize = winner.length > 14 ? 44 : 56
  const loserFontSize = loser.length > 14 ? 44 : 56

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px', height: '630px',
          background: '#080c14',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'Inter',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: '-120px', left: '-80px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 70%)', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: '0', left: '0', right: '0', height: '3px', background: 'linear-gradient(90deg, #ef4444 0%, rgba(239,68,68,0.2) 60%, transparent 100%)', display: 'flex' } } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 52px 0' },
              children: [
                { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [{ type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' } } }, { type: 'div', props: { style: { display: 'flex', gap: '6px', fontSize: '15px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase' }, children: [{ type: 'span', props: { style: { color: '#ffffff' }, children: 'SPECTATE' } }, { type: 'span', props: { style: { color: '#ef4444' }, children: 'ESPORTS' } }] } }] } },
                { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }, children: [tournament ? { type: 'span', props: { style: { fontSize: '13px', color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }, children: tournament } } : null, { type: 'div', props: { style: { display: 'flex', gap: '12px' }, children: [seriesLabel ? { type: 'span', props: { style: { fontSize: '11px', color: '#ef4444', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)', padding: '2px 8px', borderRadius: '3px' }, children: seriesLabel } } : null, date ? { type: 'span', props: { style: { fontSize: '11px', color: '#4b5563', letterSpacing: '0.15em', textTransform: 'uppercase' }, children: date } } : null].filter(Boolean) } }].filter(Boolean) } }
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { flex: 1, display: 'flex', alignItems: 'center', padding: '0 52px' },
              children: [
                { type: 'div', props: { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }, children: [{ type: 'span', props: { style: { fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#ef4444' }, children: 'WINNER' } }, { type: 'span', props: { style: { fontSize: `${winnerFontSize}px`, fontWeight: 900, textTransform: 'uppercase', color: '#ffffff', lineHeight: 1 }, children: winner } }] } },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '0 32px' },
                    children: [
                      hasScore ? { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '16px' }, children: [{ type: 'span', props: { style: { fontSize: '88px', fontWeight: 900, color: '#ffffff', lineHeight: 1 }, children: String(winnerScore) } }, { type: 'span', props: { style: { fontSize: '40px', fontWeight: 300, color: '#374151', lineHeight: 1 }, children: '-' } }, { type: 'span', props: { style: { fontSize: '88px', fontWeight: 900, color: '#374151', lineHeight: 1 }, children: String(loserScore) } }] } } : { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '20px' }, children: [{ type: 'span', props: { style: { fontSize: '72px', fontWeight: 900, color: '#ffffff', lineHeight: 1 }, children: 'W' } }, { type: 'span', props: { style: { fontSize: '40px', fontWeight: 300, color: '#374151', lineHeight: 1 }, children: '-' } }, { type: 'span', props: { style: { fontSize: '72px', fontWeight: 900, color: '#374151', lineHeight: 1 }, children: 'L' } }] } },
                      duration ? { type: 'span', props: { style: { fontSize: '12px', color: '#4b5563', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }, children: duration } } : null,
                    ].filter(Boolean)
                  }
                },
                { type: 'div', props: { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }, children: [{ type: 'span', props: { style: { fontSize: '11px', color: 'transparent' }, children: '.' } }, { type: 'span', props: { style: { fontSize: `${loserFontSize}px`, fontWeight: 900, textTransform: 'uppercase', color: '#4b5563', lineHeight: 1, textAlign: 'right' }, children: loser } }] } },
              ]
            }
          },
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 52px 32px' }, children: [{ type: 'span', props: { style: { fontSize: '12px', color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase' }, children: 'spectateesports.live' } }, { type: 'span', props: { style: { fontSize: '13px', color: '#ef4444', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }, children: 'Watch VOD + Draft →' } }] } },
        ].filter(Boolean)
      }
    },
    SATORI_OPTS
  )

  return renderPng(res, Promise.resolve(svg), !renderIsComplete ? UNRESOLVED_CACHE : matchId ? MATCH_RESOLVED_CACHE : IMMUTABLE_CACHE)
}

// ── Mode: article ─────────────────────────────────────────────────────────────
async function handleArticle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const title = url.searchParams.get('title') || 'Spectate Esports'
  const category = url.searchParams.get('category') || 'ARTICLE'
  const date = url.searchParams.get('date') || ''

  const titleFontSize = title.length > 80 ? 34 : title.length > 55 ? 40 : title.length > 35 ? 46 : 52

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px', height: '630px',
          background: '#080c14',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'Inter',
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: '-100px', right: '-60px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)', display: 'flex' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: '0', left: '0', right: '0', height: '3px', background: 'linear-gradient(90deg, #ef4444 0%, rgba(239,68,68,0.2) 60%, transparent 100%)', display: 'flex' } } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 52px 0' },
              children: [
                { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [{ type: 'div', props: { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' } } }, { type: 'div', props: { style: { display: 'flex', gap: '6px', fontSize: '15px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase' }, children: [{ type: 'span', props: { style: { color: '#ffffff' }, children: 'SPECTATE' } }, { type: 'span', props: { style: { color: '#ef4444' }, children: 'ESPORTS' } }] } }] } },
                { type: 'div', props: { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [{ type: 'span', props: { style: { fontSize: '11px', color: '#0ea5e9', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, border: '1px solid rgba(14,165,233,0.4)', padding: '2px 8px', borderRadius: '3px' }, children: (category || '').toUpperCase() } }] } },
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 52px 0' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { fontSize: `${titleFontSize}px`, fontWeight: 900, color: '#ffffff', lineHeight: 1.15, maxHeight: '320px', overflow: 'hidden' },
                    children: title,
                  }
                },
              ]
            }
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 52px 32px' },
              children: [
                date ? { type: 'span', props: { style: { fontSize: '13px', color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }, children: date } } : { type: 'span', props: { style: { fontSize: '12px', color: '#374151' }, children: '' } },
                { type: 'span', props: { style: { fontSize: '12px', color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase' }, children: 'spectateesports.live' } },
              ].filter(Boolean)
            }
          },
        ]
      }
    },
    SATORI_OPTS
  )

  // Title/category/date are read straight off the query string, so this card is as deterministic
  // as the series one — the previous 24h TTL re-rendered identical bytes once a day per URL.
  return renderPng(res, Promise.resolve(svg), IMMUTABLE_CACHE)
}

// ── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const mode = new URL(req.url, 'http://localhost').searchParams.get('mode')
  if (mode === 'series') return handleSeries(req, res)
  if (mode === 'article') return handleArticle(req, res)
  return handleMatch(req, res)
}

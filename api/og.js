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

function renderPng(res, svgPromise) {
  return svgPromise.then(svg => {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } })
    const png = resvg.render().asPng()
    res.setHeader("Content-Type", "image/png")
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')
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

  if (matchId) {
    try {
      const r = await fetch(`https://api.opendota.com/api/matches/${matchId}`)
      const data = await r.json()
      if (data && data.match_id) {
        radiantTeam = data.radiant_name || 'Radiant'
        direTeam = data.dire_name || 'Dire'
        radiantWin = data.radiant_win
        radiantScore = data.radiant_score ?? null
        direScore = data.dire_score ?? null
        tournament = data.league?.name || ''
        date = data.start_time
          ? new Date(data.start_time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

  return renderPng(res, Promise.resolve(svg))
}

// ── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const mode = new URL(req.url, 'http://localhost').searchParams.get('mode')
  if (mode === 'series') return handleSeries(req, res)
  return handleMatch(req, res)
}

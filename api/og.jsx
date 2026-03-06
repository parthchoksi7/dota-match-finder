import { ImageResponse } from '@vercel/og'

// Use Node.js runtime — edge doesn't work with JSX in vercel dev locally
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
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

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1200px', height: '630px',
          background: '#080c14',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px', display: 'flex',
        }} />

        {/* Red glow */}
        <div style={{
          position: 'absolute', top: '-120px', left: '-80px',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 52px 0', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 12px #ef4444' }} />
            <span style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#ffffff' }}>
              SPECTATE <span style={{ color: '#ef4444' }}>ESPORTS</span>
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            {tournament ? (
              <span style={{ fontSize: '13px', color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
                {tournament}
              </span>
            ) : null}
            <div style={{ display: 'flex', gap: '12px' }}>
              {seriesLabel ? (
                <span style={{ fontSize: '11px', color: '#ef4444', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, border: '1px solid rgba(239,68,68,0.4)', padding: '2px 8px', borderRadius: '3px' }}>
                  {seriesLabel}
                </span>
              ) : null}
              {date ? (
                <span style={{ fontSize: '11px', color: '#4b5563', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {date}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Teams + score */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 52px' }}>
          {/* Winner */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#ef4444' }}>
              WINNER
            </span>
            <span style={{ fontSize: winner.length > 14 ? '44px' : '56px', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#ffffff', lineHeight: 1 }}>
              {winner}
            </span>
          </div>

          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '0 40px' }}>
            {hasScore ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '88px', fontWeight: 900, color: '#ffffff', lineHeight: 1, letterSpacing: '-0.04em' }}>{winnerScore}</span>
                <span style={{ fontSize: '40px', fontWeight: 300, color: '#374151', lineHeight: 1 }}>—</span>
                <span style={{ fontSize: '88px', fontWeight: 900, color: '#374151', lineHeight: 1, letterSpacing: '-0.04em' }}>{loserScore}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <span style={{ fontSize: '72px', fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>W</span>
                <span style={{ fontSize: '40px', fontWeight: 300, color: '#374151', lineHeight: 1 }}>—</span>
                <span style={{ fontSize: '72px', fontWeight: 900, color: '#374151', lineHeight: 1 }}>L</span>
              </div>
            )}
            {duration ? (
              <span style={{ fontSize: '12px', color: '#4b5563', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginTop: '4px' }}>
                {duration}
              </span>
            ) : null}
          </div>

          {/* Loser */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#374151' }}>&nbsp;</span>
            <span style={{ fontSize: loser.length > 14 ? '44px' : '56px', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#4b5563', lineHeight: 1, textAlign: 'right' }}>
              {loser}
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 52px 32px' }}>
          <span style={{ fontSize: '12px', color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            spectateesports.live
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
            <span style={{ fontSize: '12px', color: '#374151', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              PRO DOTA 2 MATCHES + VOD LINKS
            </span>
          </div>
        </div>

        {/* Bottom red line */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, #ef4444 0%, rgba(239,68,68,0.2) 60%, transparent 100%)',
          display: 'flex',
        }} />
      </div>
    ),
    { width: 1200, height: 630 }
  )

  // Convert the Response to a Buffer and send via Node res object
  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.end(buffer)
}

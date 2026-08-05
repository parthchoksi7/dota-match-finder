import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { trimSnapshot, selectTier1MatchIds } from '../api/_handlers/liveStoryCapture.js'
import { diffSnapshots, indexGamesById, resolveMarqueeItemIds } from '../api/_liveStoryDiff.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIX = join(here, 'fixtures', 'get-live-league-games')
const r0 = JSON.parse(readFileSync(join(FIX, 'roshan-and-towers-t0.json'), 'utf8'))
const r1 = JSON.parse(readFileSync(join(FIX, 'roshan-and-towers-t1.json'), 'utf8'))

const MARQUEE = resolveMarqueeItemIds({
  1: { key: 'blink', dname: 'Blink Dagger' },
  116: { key: 'black_king_bar', dname: 'Black King Bar' },
  108: { key: 'ultimate_scepter', dname: "Aghanim's Scepter" },
  939: { key: 'harpoon', dname: 'Harpoon' },
  119: { key: 'shivas_guard', dname: "Shiva's Guard" },
})

describe('trimSnapshot', () => {
  it('is lossless for the differ', () => {
    // The whole point of trimming is to cut KV bandwidth without changing behavior. If a trimmed
    // pair ever derives different events from the raw pair, the trim dropped a field the differ
    // reads — which is a silent correctness bug, not a performance one.
    const fromRaw = diffSnapshots(r0, r1, { marqueeItemIds: MARQUEE })
    const fromTrimmed = diffSnapshots(trimSnapshot(r0), trimSnapshot(r1), { marqueeItemIds: MARQUEE })
    expect(fromTrimmed).toEqual(fromRaw)
    expect(fromRaw.length).toBeGreaterThan(0)
  })

  it('materially shrinks the payload', () => {
    // Measured ~242 KB raw -> ~143 KB trimmed for 43 games. Asserted loosely so a schema change
    // does not fail the build, but tightly enough that a regression to "trim does nothing" does.
    const raw = JSON.stringify(r0).length
    const trimmed = JSON.stringify(trimSnapshot(r0)).length
    expect(trimmed).toBeLessThan(raw * 0.75)
  })

  it('drops the heavy per-player fields the differ never reads', () => {
    const p = trimSnapshot(r0).result.games.find(g => g.scoreboard)?.scoreboard.radiant.players[0]
    expect(p.position_x).toBeUndefined()
    expect(p.position_y).toBeUndefined()
    expect(p.ultimate_state).toBeUndefined()
    // ...while keeping everything the single-source live surface renders.
    expect(p.net_worth).toEqual(expect.any(Number))
    expect(p.level).toEqual(expect.any(Number))
    expect(p.item0).toBeDefined()
  })

  it('keeps live IGNs, which exist only on the top-level players array', () => {
    const g = trimSnapshot(r0).result.games.find(x => x.players?.length)
    expect(g.players.every(p => p.team === 0 || p.team === 1)).toBe(true)
    expect(g.players.some(p => typeof p.name === 'string' && p.name.length > 0)).toBe(true)
  })

  it('filters to the given match ids', () => {
    const all = indexGamesById(r0)
    const keep = new Set([...all.keys()].slice(0, 2))
    const out = trimSnapshot(r0, keep)
    expect(out.result.games).toHaveLength(2)
    expect(out.result.games.every(g => keep.has(String(g.match_id)))).toBe(true)
  })

  it('shrinks by roughly 40x when filtered to a couple of tier-1 games', () => {
    // This ratio is what keeps Upstash traffic inside the free tier: ~800 MB/day unfiltered at a
    // 30s poll versus tens of MB/day filtered.
    const keep = new Set([...indexGamesById(r0).keys()].slice(0, 2))
    const full = JSON.stringify(trimSnapshot(r0)).length
    const tier1 = JSON.stringify(trimSnapshot(r0, keep)).length
    expect(tier1 * 20).toBeLessThan(full)
  })
})

describe('selectTier1MatchIds', () => {
  // A real Valve game from the fixture, used to build matching PandaScore rows.
  const sample = [...indexGamesById(r0).values()].find(g => g.radiant_team?.team_name && g.dire_team?.team_name)
  const running = [{ status: 'running' }]

  // dota2:live_matches_v5 (the real KV key this reads, api/live-matches.js:17) is NEVER a bare
  // array on disk — the write site (api/live-matches.js:1089: `const payload = { matches,
  // fetchedAt: ... }`) always wraps it. Every fixture below uses that real wrapped shape so a
  // regression to "expects a bare array" (caught in code review 2026-08-05 — the bug made
  // selectTier1MatchIds return empty on every real tick, silently, because Array.isArray on the
  // wrapper object is always false) cannot silently return.
  function psPayload(matches) {
    return { matches, fetchedAt: new Date().toISOString() }
  }

  it('correlates a PandaScore series to its Valve game', () => {
    const ps = psPayload([{ teamA: sample.radiant_team.team_name, teamB: sample.dire_team.team_name, games: running }])
    expect(selectTier1MatchIds(r0, ps).has(String(sample.match_id))).toBe(true)
  })

  it('matches regardless of which side is radiant', () => {
    const ps = psPayload([{ teamA: sample.dire_team.team_name, teamB: sample.radiant_team.team_name, games: running }])
    expect(selectTier1MatchIds(r0, ps).has(String(sample.match_id))).toBe(true)
  })

  it('ignores a series with no running game', () => {
    // PandaScore keeps reporting a series as live through between-game gaps — verified live
    // 2026-08-05, Team Liquid vs 1win sat at currentGame=null with G1 finished and G2 not
    // started, and Valve correctly listed no game. Correlating on series status instead of on a
    // running game would strand those series in a permanent "no events" state.
    const ps = psPayload([{
      teamA: sample.radiant_team.team_name,
      teamB: sample.dire_team.team_name,
      games: [{ status: 'finished' }, { status: 'not_started' }],
    }])
    expect(selectTier1MatchIds(r0, ps).size).toBe(0)
  })

  it('resolves org aliases rather than requiring an exact string match', () => {
    // Verified live 2026-08-05: Valve reports "1w" where PandaScore reports "1win". Exact
    // matching drops that series entirely; the shared teamMatching alias table catches it.
    const ps = psPayload([{ teamA: 'Team Liquid', teamB: '1win', games: running }])
    const valve = { result: { games: [{
      match_id: 999,
      radiant_team: { team_name: 'Team Liquid' },
      dire_team: { team_name: '1w' },
      scoreboard: { duration: 100, radiant: {}, dire: {} },
    }] } }
    expect(selectTier1MatchIds(valve, ps).has('999')).toBe(true)
  })

  it('accepts a bare array too, for callers that already unwrapped it', () => {
    const ps = [{ teamA: sample.radiant_team.team_name, teamB: sample.dire_team.team_name, games: running }]
    expect(selectTier1MatchIds(r0, ps).has(String(sample.match_id))).toBe(true)
  })

  it('returns empty rather than falling back to every live league game', () => {
    // A cold PandaScore cache must capture NOTHING. Falling back to all ~43 live league games
    // would silently restore the ~800 MB/day KV traffic the filter exists to prevent.
    expect(selectTier1MatchIds(r0, null).size).toBe(0)
    expect(selectTier1MatchIds(r0, psPayload([])).size).toBe(0)
    // The real cache shape with no matches key at all (a payload from before `matches` existed,
    // or a malformed write) must also degrade to empty, not throw.
    expect(selectTier1MatchIds(r0, { fetchedAt: new Date().toISOString() }).size).toBe(0)
  })

  it('skips Valve games with no team names', () => {
    // ~half of live league games carry no team block at all; they can never correlate.
    const unnamed = [...indexGamesById(r0).values()].filter(g => !g.radiant_team?.team_name)
    expect(unnamed.length).toBeGreaterThan(0)
    const ps = psPayload([{ teamA: 'Whoever', teamB: 'Whomever', games: running }])
    for (const id of selectTier1MatchIds(r0, ps)) {
      expect(unnamed.some(g => String(g.match_id) === id)).toBe(false)
    }
  })
})

// Live Story — event differ over consecutive GetLiveLeagueGames snapshots.
//
// Pure functions, zero I/O, so the whole event model is unit-testable against the recorded
// fixtures in __tests__/fixtures/get-live-league-games/ before any live match is available.
// Underscore-prefixed so Vercel does not deploy it as a function (same convention as
// api/_buildingState.js and api/_watchability.js) — it is imported by the poll handler.
//
// Source shape (verified against real fixtures 2026-08-05):
//   { result: { games: [ { match_id, radiant_team, dire_team, players[], scoreboard, ... } ] } }
//
// THREE ENCODING TRAPS THIS FILE DELIBERATELY NORMALIZES — all three are live in one response:
//
//   1. `game.players[].team` is 0=Radiant, 1=Dire, 2=broadcaster. That array carries 12 entries
//      for a 10-player game (the casters). It is NOT the same encoding as Valve's canonical
//      2=Radiant/3=Dire used by the `live_events.team` column and by OpenDota. Every event this
//      file emits uses the CANONICAL 2/3 form; the 0/1/2 form never escapes `indexPlayerNames`.
//   2. `scoreboard.duration` is a FLOAT (observed 1263.36669921875), not an int. Always floored
//      before it becomes a `game_time`, or the natural key `(od_match_id, game_time, ...)` will
//      not dedupe across two polls that land inside the same in-game second.
//   3. Item slots are positional and items MOVE BETWEEN SLOTS WITHOUT BEING BOUGHT. Observed in
//      the fixtures: hero 18 went [1,172,63,116,252,36] -> [1,172,36,116,252,63] — ids 63 and 36
//      simply swapped places. A slot-wise diff emits two phantom purchases here. All item
//      comparison below is therefore SET-based, never index-based.
//
// Known, accepted blindness (documented in the investigation doc §6.4, restated because it
// shapes the code): the API exposes item0..item5 only. There is no backpack (slots 6-8) and no
// neutral-item slot. An item moved to the backpack is indistinguishable from an item sold, and a
// purchase routed straight to a backpack slot is never observed at all. `ItemPurchased` is
// therefore "a marquee item became visible in the main inventory", which is a strict subset of
// "was purchased". Do not present it to a user as a complete purchase log.

// Empty inventory slots come back as -1 (observed in fixtures, e.g. [178,226,36,50,244,-1]).
const EMPTY_ITEM_SLOT = -1

// Valve's canonical side encoding, matching the `live_events.team` column's check constraint and
// OpenDota's own convention. Deliberately NOT the 0/1/2 form used by `game.players[].team`.
export const TEAM_RADIANT = 2
export const TEAM_DIRE = 3

// Marquee items, by OpenDota constants key rather than by id. Ids are resolved at call time from
// the item map api/_handlers/matchStats.js already fetches and caches in KV
// (`https://api.opendota.com/api/constants/items` -> { id: { key, dname } }), so this file never
// hardcodes a numeric id that a patch could re-map underneath it. Scoped to items that genuinely
// change what a viewer should expect from the next fight — the spec's "something is about to
// happen" signal — not every completed item.
export const MARQUEE_ITEM_KEYS = [
  'black_king_bar', 'blink', 'overwhelming_blink', 'swift_blink', 'arcane_blink',
  'radiance', 'rapier', 'refresher', 'octarine_core', 'shivas_guard',
  'ultimate_scepter', 'aghanims_shard', 'heart', 'satanic', 'butterfly',
  'assault', 'skadi', 'abyssal_blade', 'sheepstick', 'bloodthorn',
  'silver_edge', 'desolator', 'manta', 'mjollnir', 'aeon_disk',
  'lotus_orb', 'pipe', 'crimson_guard', 'gem', 'aegis', 'sphere',
  'greater_crit', 'hurricane_pike', 'harpoon', 'disperser', 'revenants_brooch',
  'wind_waker', 'travel_boots',
]

// Turns matchStats' cached item map ({ [id]: { key, dname } }) into the Set of marquee ids this
// differ wants. Kept here (not in the handler) so the mapping rule lives next to the key list it
// depends on. Returns an empty Set on a missing/!malformed map rather than throwing — a failed
// item-map fetch must degrade to "no ItemPurchased events", never to a broken poll.
export function resolveMarqueeItemIds(itemNames) {
  const want = new Set(MARQUEE_ITEM_KEYS)
  const ids = new Set()
  if (!itemNames || typeof itemNames !== 'object') return ids
  for (const [id, meta] of Object.entries(itemNames)) {
    if (meta && want.has(meta.key)) ids.add(Number(id))
  }
  return ids
}

// Unwraps the `{ result: { games: [...] } }` envelope into a Map keyed by match_id, which is the
// join key everything downstream uses (it is Valve's real match id — the same id space OpenDota
// indexes, so it doubles as the od_match_id). Tolerates a bare `{ games: [] }` too, since the
// envelope is undocumented and could plausibly change shape.
export function indexGamesById(response) {
  const games = response?.result?.games || response?.games || []
  const byId = new Map()
  for (const g of games) {
    if (g?.match_id == null) continue
    byId.set(String(g.match_id), g)
  }
  return byId
}

// Player IGNs live on the TOP-LEVEL game.players[] array, not on scoreboard.*.players[] (which
// carries the telemetry but no names). Returns { [`${team}:${heroId}`]: name }, keyed by hero
// because hero_id is unique within a match and is the only field present on BOTH arrays.
// Broadcasters (team 2, hero_id 0) are dropped — they are not players and would otherwise
// collide on the hero_id 0 key during the draft phase.
export function indexPlayerNames(game) {
  const out = {}
  for (const p of game?.players || []) {
    // 0/1 here are Valve's OTHER side encoding (see trap 1 at the top) — normalized to 2/3.
    if (p?.team !== 0 && p?.team !== 1) continue
    if (!p.hero_id) continue
    const team = p.team === 0 ? TEAM_RADIANT : TEAM_DIRE
    out[`${team}:${p.hero_id}`] = p.name || null
  }
  return out
}

// In-game seconds. Floors the float duration (trap 2) and clamps a negative/absent value to null
// so a draft-phase snapshot never produces a bogus game_time.
export function toGameTime(duration) {
  if (!Number.isFinite(duration)) return null
  return Math.floor(duration)
}

// The set of real (non-empty) item ids a player currently holds in their six visible slots.
function itemSetOf(player) {
  const s = new Set()
  for (let i = 0; i < 6; i++) {
    const id = player?.[`item${i}`]
    if (Number.isFinite(id) && id !== EMPTY_ITEM_SLOT) s.add(id)
  }
  return s
}

// Pairs players across two snapshots of the same side. Keyed by player_slot, falling back to
// hero_id — a mid-game hero swap is impossible, so hero_id is a safe secondary key, and having a
// fallback means a snapshot that omits player_slot degrades to hero matching instead of dropping
// every event for that side.
function pairPlayers(prevPlayers, nextPlayers) {
  const byKey = new Map()
  for (const p of prevPlayers || []) {
    if (p?.player_slot != null) byKey.set(`s${p.player_slot}`, p)
    if (p?.hero_id) byKey.set(`h${p.hero_id}`, p)
  }
  const pairs = []
  for (const next of nextPlayers || []) {
    const prev = (next?.player_slot != null ? byKey.get(`s${next.player_slot}`) : null)
      || (next?.hero_id ? byKey.get(`h${next.hero_id}`) : null)
    if (prev) pairs.push({ prev, next })
  }
  return pairs
}

// Bit indices that went 1 -> 0 between two bitmask readings. Valve's tower/barracks masks use 1
// for "standing", so a set bit clearing is a destruction. Returns raw bit indices ONLY — this
// file deliberately does NOT map them to lane/tier, because that layout is unverified (E12 in the
// investigation doc). The admin verification page decodes and cross-checks; until it does, every
// building event this produces carries confidence 'uncertain' and must not be shown to a user.
export function clearedBits(prevMask, nextMask) {
  const out = []
  if (!Number.isFinite(prevMask) || !Number.isFinite(nextMask)) return out
  const cleared = prevMask & ~nextMask
  for (let bit = 0; bit < 32; bit++) {
    if (cleared & (1 << bit)) out.push(bit)
  }
  return out
}

// ---- E12: tower/barracks bit layout --------------------------------------------------------
//
// STATUS: structure PROVEN from the fixtures. Lane NAMING has its first real, independently-
// sourced confirmation (2026-08-06, match 8931981851, RE.Arise vs No Hoodwink — EPL Masters S1):
// a live-captured TowerDestroyed (team=Radiant, bit 3 -> decoded lane='mid', tier=1) matched
// OpenDota's own post-game objectives[] for the SAME match — team=Radiant, lane='mid', tier=1, at
// real game-time 779s (our event was stamped 810s, a 31s "discovery lag" from a wide poll gap,
// well inside the 45s crosscheck tolerance). This is n=1 — one building event, one match — real
// evidence, not yet enough to flip `laneVerified` or promote building events out of 'uncertain'.
// The investigation doc's public-graduation bar is 3+ independently-validated matches; see
// .claude/specs/live-ingestion-investigation.md's E12 section for the running count.
//
// The layout is lane-major — bit = laneIndex*3 + tierIndex for towers, laneIndex*2 + kind for
// barracks. Established by testing every observed bitmask against constraints the game itself
// physically enforces:
//
//   * a tier-2 tower cannot be destroyed while its tier-1 still stands
//   * a tier-3 cannot be destroyed while its tier-2 still stands
//   * barracks cannot be destroyed while their lane's tier-3 still stands
//
// Across 146 real observed states (37 games x 2 sides x 2 snapshots) this layout produced
// **0 violations out of 1,314 constraints**. The competing tier-major layout
// (bit = tier*3 + lane) produced 36. Corroborating: max tower_state observed is 2047 = 11 bits
// (9 towers + 2 tier-4), max barracks_state is 63 = 6 bits (3 lanes x melee/ranged) — both exact.
// Worked example, match 8930406789 dire, one 80s window:
//   tower 11100100100 -> 11000100100  (bit 8 clears)
//   rax      111111   ->    001111    (bits 4,5 clear)
// i.e. bot tier-3 falls and both bot barracks fall immediately after — precisely the causal order
// the game requires, which a wrong layout could not reproduce.
//
// WHAT REMAINS: the invariant test is symmetric under a top/bot swap, so it proves the STRUCTURE
// but cannot distinguish which lane triple is "top" and which is "bot", nor which tier-4 is
// which. That needs one cross-check against OpenDota's post-game objectives[] (`building_kill`).
// Until that lands, decoded lane names are advisory — which is why the differ keeps building
// events at 'uncertain' confidence and puts only the RAW bit in the payload. This decoder exists
// for the admin verification page, not for the event stream.
const TOWER_LANES = ['top', 'mid', 'bot']

export function decodeTowerBit(bit) {
  if (!Number.isInteger(bit) || bit < 0 || bit > 10) return null
  if (bit >= 9) return { lane: null, tier: 4, ordinal: bit - 9, laneVerified: false }
  return { lane: TOWER_LANES[Math.floor(bit / 3)], tier: (bit % 3) + 1, laneVerified: false }
}

export function decodeBarracksBit(bit) {
  if (!Number.isInteger(bit) || bit < 0 || bit > 5) return null
  return { lane: TOWER_LANES[Math.floor(bit / 2)], kind: bit % 2 === 0 ? 'melee' : 'ranged', laneVerified: false }
}

// Parses ONE entry of OpenDota's post-game `objectives[]` (a finished, fully-parsed match) into
// the same {team, lane, tier} shape `decodeTowerBit`/`decodeBarracksBit` produce. This is the
// ground truth E12's lane-naming question gets checked against: OD's `key` field spells out the
// side and lane in plain text (`npc_dota_badguys_tower1_bot`), because it comes from the replay's
// combat log, not a bitmask. `goodguys` = Radiant, `badguys` = Dire — OpenDota's own convention,
// matching the codebase's existing `isRadiant`-style usage elsewhere.
//
// Returns null for every non-building objective (first blood, courier, Roshan/miniboss chat
// messages, etc.) and for the Ancient (`_fort`) itself, which has no lane. Verified against real
// finished matches' raw objectives (__tests__/fixtures/opendota-objectives/8930545836.json and a
// second real match, 8930594356, that surfaced the tier-4 case below).
//
// TIER-4 CAVEAT, found 2026-08-06: OD's key for a tier-4 (base/"ancient-guardian") tower kill is
// the BARE `npc_dota_badguys_tower4` — no `_top`/`_mid`/`_bot` suffix, unlike tier 1-3. Confirmed
// against a real match with two real tier-4 kills: both produced the IDENTICAL string
// `npc_dota_badguys_tower4` (times 2316 and 2322 — 6s apart, same team), so **OD's own combat log
// does not distinguish which of the two tier-4 towers fell, only that one did**. `lane` is
// returned `null` for this case (there is no lane) — a caller must never expect or request lane
// agreement for tier 4, and can only ever confirm "a tier-4 tower fell for this team around this
// time," never which specific one. This is a hard ceiling on what E12 can verify for tier 4, not
// a gap in this parser — the ground truth itself doesn't carry that distinction. Before this fix,
// the tower(\d)_(top|mid|bot) regex REQUIRED a lane suffix and silently dropped every tier-4 kill
// entirely — a real tier-4 TowerDestroyed derived from Valve's feed could never show as
// 'confirmed' even when genuine matching ground truth existed, because this parser skipped it.
export function parseOdBuildingObjective(o) {
  if (o?.type !== 'building_kill' || typeof o.key !== 'string') return null
  const sideMatch = o.key.match(/npc_dota_(goodguys|badguys)_/)
  if (!sideMatch) return null
  const team = sideMatch[1] === 'goodguys' ? TEAM_RADIANT : TEAM_DIRE

  const laneTower = o.key.match(/tower(\d)_(top|mid|bot)/)
  if (laneTower) return { team, time: o.time, kind: 'tower', tier: Number(laneTower[1]), lane: laneTower[2] }

  const tier4Tower = o.key.match(/tower(\d)$/)
  if (tier4Tower) return { team, time: o.time, kind: 'tower', tier: Number(tier4Tower[1]), lane: null }

  const rax = o.key.match(/(melee|range)_rax_(top|mid|bot)/)
  if (rax) return { team, time: o.time, kind: 'barracks', raxKind: rax[1] === 'melee' ? 'melee' : 'ranged', lane: rax[2] }

  return null // fort (Ancient) or an unrecognized key — not lane-attributable
}

// Cross-checks this differ's decoded building events (uncertain, from a live Valve capture)
// against OpenDota's post-game objectives (ground truth, from the parsed replay) for the SAME
// match. This is the TOOL that closes E12's remaining open question (which lane triple is "top"
// vs "bot" — the bit-layout STRUCTURE is already proven from invariants alone, see
// decodeTowerBit's comment). Running it is only meaningful against a real pair: a match this
// system captured LIVE (so the bit transitions have real timestamps) that has since FINISHED and
// been parsed by OpenDota (so `odObjectives` is real, independently-sourced ground truth, not a
// re-encoding of this file's own lane assumption). The admin verification page's crosscheck
// action is where that real pair gets run through this function.
//
// Matching is by (team, kind, tier-or-raxKind) with a time window, because the two sources are on
// different clocks: OD's objective time is precise (from the replay), while a live-derived
// event's game_time is only as fresh as the poll interval that observed the transition — a tower
// event derived from a 30s-apart snapshot pair could be stamped up to ~30s later than OD's exact
// moment. `toleranceS` defaults accordingly.
//
// Returns one verdict per derived event: 'confirmed' (a matching OD objective exists at the
// decoded lane), 'lane_mismatch' (OD found a same-team/tier/kind event but at a DIFFERENT lane —
// the actual signal that would falsify the current lane-major hypothesis), or 'no_match' (nothing
// comparable in the OD data at all, e.g. the match hasn't finished/parsed yet).
export function crossCheckBuildingEvents(derivedEvents, odObjectives, toleranceS = 45) {
  const odBuildings = (odObjectives || []).map(parseOdBuildingObjective).filter(Boolean)
  return derivedEvents.map(e => {
    const decoded = e.eventType === 'TowerDestroyed' ? decodeTowerBit(e.payload.bit) : decodeBarracksBit(e.payload.bit)
    if (!decoded) return { ...e, decoded, verdict: 'undecodable' }
    const kind = e.eventType === 'TowerDestroyed' ? 'tower' : 'barracks'
    const candidates = odBuildings.filter(o =>
      o.kind === kind &&
      o.team === e.team &&
      Math.abs(o.time - e.gameTime) <= toleranceS &&
      (kind === 'tower' ? o.tier === decoded.tier : o.raxKind === decoded.kind)
    )
    if (candidates.length === 0) return { ...e, decoded, verdict: 'no_match' }
    const laneOk = candidates.some(o => o.lane === decoded.lane)
    return { ...e, decoded, verdict: laneOk ? 'confirmed' : 'lane_mismatch', odCandidates: candidates }
  })
}

// Diffs one game's two consecutive scoreboards into events.
//
// `opts.marqueeItemIds` — Set of item ids worth emitting (see resolveMarqueeItemIds). Omitted or
// empty means no ItemPurchased events at all, which is the correct degrade for a failed item-map
// fetch rather than emitting every boot and clarity.
//
// Returns [] (never throws, never partially emits) whenever the pair is not safely diffable:
// a missing scoreboard on either side, or a duration that did not advance. That second guard is
// load-bearing — `scoreboard.duration` freezes on pause and can read backwards, and an event
// emitted against a stale or rewound clock would violate the natural key's monotonicity and, far
// worse, could re-emit a kill that already happened.
export function diffGame(prevGame, nextGame, opts = {}) {
  const prevSb = prevGame?.scoreboard
  const nextSb = nextGame?.scoreboard
  if (!prevSb || !nextSb) return []

  const gameTime = toGameTime(nextSb.duration)
  const prevTime = toGameTime(prevSb.duration)
  if (gameTime == null || prevTime == null) return []
  if (gameTime <= prevTime) return []

  const odMatchId = String(nextGame.match_id)
  const marquee = opts.marqueeItemIds instanceof Set ? opts.marqueeItemIds : new Set()
  const names = indexPlayerNames(nextGame)
  const events = []
  // `seq` disambiguates same-type events landing on the same game_time, which is required by the
  // natural key (od_match_id, game_time, event_type, player_slot, seq). It counts per event_type
  // so two different types never fight over the same ordinal.
  const seqByType = {}
  const push = (e) => {
    seqByType[e.eventType] = (seqByType[e.eventType] ?? -1) + 1
    events.push({ odMatchId, gameTime, seq: seqByType[e.eventType], ...e })
  }

  // ---- Deaths, and the kill attribution that may or may not follow ----------------------------
  //
  // A death increment on the victim is an OBSERVED fact -> confidence 'exact'.
  // A killer is an INFERENCE, and only a safe one when the tick is unambiguous. Verified against
  // the fixtures: over an 80s gap the score went 10-7 -> 12-10, i.e. three Radiant deaths against
  // three separate Dire heroes each gaining exactly one kill. There is no way to pair those from
  // this data. Per the spec, a wrong killer is worse than an unattributed kill, so attribution is
  // attempted ONLY when exactly one player died on one side and exactly one enemy gained exactly
  // one kill in the same tick.
  const sides = [
    { key: 'radiant', team: TEAM_RADIANT, enemy: 'dire', enemyTeam: TEAM_DIRE },
    { key: 'dire', team: TEAM_DIRE, enemy: 'radiant', enemyTeam: TEAM_RADIANT },
  ]

  const killGains = {}
  for (const s of sides) {
    killGains[s.key] = pairPlayers(prevSb[s.key]?.players, nextSb[s.key]?.players)
      .map(({ prev, next }) => ({ player: next, gained: (next.kills ?? 0) - (prev.kills ?? 0) }))
      .filter(x => x.gained > 0)
  }

  for (const s of sides) {
    const deaths = pairPlayers(prevSb[s.key]?.players, nextSb[s.key]?.players)
      .map(({ prev, next }) => ({ player: next, died: (next.death ?? 0) - (prev.death ?? 0) }))
      .filter(x => x.died > 0)

    const enemyGains = killGains[s.enemy] || []
    const totalDeaths = deaths.reduce((n, d) => n + d.died, 0)
    const soleKiller = (totalDeaths === 1 && enemyGains.length === 1 && enemyGains[0].gained === 1)
      ? enemyGains[0].player
      : null

    for (const d of deaths) {
      // A player can die more than once inside one poll window; emit one event per death so the
      // count stays truthful even though the individual timings are unrecoverable at this cadence.
      for (let i = 0; i < d.died; i++) {
        push({
          eventType: 'HeroKilled',
          team: s.team,
          playerSlot: d.player.player_slot ?? null,
          heroId: d.player.hero_id ?? null,
          // Attribution is all-or-nothing: a killer is named only in the unambiguous case, and the
          // event's confidence downgrades to 'inferred' the moment it carries one.
          confidence: soleKiller ? 'inferred' : 'exact',
          payload: {
            victimName: names[`${s.team}:${d.player.hero_id}`] ?? null,
            killerHeroId: soleKiller?.hero_id ?? null,
            killerName: soleKiller ? (names[`${s.enemyTeam}:${soleKiller.hero_id}`] ?? null) : null,
            killerTeam: soleKiller ? s.enemyTeam : null,
            // Surfaced so the admin page can show WHY attribution was declined without re-deriving it.
            ambiguous: !soleKiller,
          },
        })
      }
    }
  }

  // ---- Marquee item first-appearance ---------------------------------------------------------
  //
  // Set-based, never slot-based (trap 3). Emits on an id present in `next` and absent from `prev`.
  // Note this is per-POLL-PAIR novelty, not per-MATCH novelty: an item sold and rebought, or
  // shuffled out to the backpack and back into the visible six, will emit again. Match-level
  // "first ever" suppression needs state the differ does not (and should not) hold — the caller
  // owns that, using the natural key's uniqueness constraint as the backstop.
  for (const s of sides) {
    for (const { prev, next } of pairPlayers(prevSb[s.key]?.players, nextSb[s.key]?.players)) {
      const before = itemSetOf(prev)
      for (const id of itemSetOf(next)) {
        if (before.has(id)) continue
        if (!marquee.has(id)) continue
        push({
          eventType: 'ItemPurchased',
          team: s.team,
          playerSlot: next.player_slot ?? null,
          heroId: next.hero_id ?? null,
          confidence: 'exact',
          payload: { itemId: id, playerName: names[`${s.team}:${next.hero_id}`] ?? null },
        })
      }
    }
  }

  // ---- Roshan ---------------------------------------------------------------------------------
  //
  // A direct signal, not an aegis inference: the respawn timer goes 0 -> nonzero at the moment
  // Roshan dies. The KILL is therefore 'exact'. WHICH TEAM killed it is not in the payload at
  // all, so team attribution stays null here rather than being guessed from a same-tick net-worth
  // swing — at this poll cadence a teamfight and a Roshan attempt routinely share one window, and
  // a confidently wrong "Team X took Roshan" is exactly the trust failure the spec warns about.
  const prevRosh = prevSb.roshan_respawn_timer
  const nextRosh = nextSb.roshan_respawn_timer
  if (Number.isFinite(prevRosh) && Number.isFinite(nextRosh) && prevRosh === 0 && nextRosh > 0) {
    push({
      eventType: 'RoshanKilled',
      team: null,
      playerSlot: null,
      heroId: null,
      confidence: 'exact',
      payload: { respawnTimer: nextRosh, teamAttribution: null },
    })
  }

  // ---- Buildings (E12: UNVERIFIED, never user-visible) ----------------------------------------
  //
  // Emitted so the admin verification page has something to cross-check against OpenDota's
  // post-game objectives[], which is the only way E12 gets closed. Confidence is hardcoded
  // 'uncertain' and the payload carries the RAW bit index rather than a lane/tier guess. Per the
  // investigation doc's risk T3, 'uncertain' events are never rendered to a user — so shipping
  // these is safe precisely because the read path filters them out.
  for (const s of sides) {
    for (const bit of clearedBits(prevSb[s.key]?.tower_state, nextSb[s.key]?.tower_state)) {
      push({
        eventType: 'TowerDestroyed',
        team: s.team,
        playerSlot: null,
        heroId: null,
        confidence: 'uncertain',
        payload: { bit, prevMask: prevSb[s.key]?.tower_state, nextMask: nextSb[s.key]?.tower_state },
      })
    }
    for (const bit of clearedBits(prevSb[s.key]?.barracks_state, nextSb[s.key]?.barracks_state)) {
      push({
        eventType: 'BarracksDestroyed',
        team: s.team,
        playerSlot: null,
        heroId: null,
        confidence: 'uncertain',
        payload: { bit, prevMask: prevSb[s.key]?.barracks_state, nextMask: nextSb[s.key]?.barracks_state },
      })
    }
  }

  return events
}

// Diffs two whole-response snapshots, returning events for every game present in BOTH. A game
// that appeared only in `next` has no baseline to diff against (its first observation is not an
// event); one present only in `prev` has ended, which the caller detects the same way.
export function diffSnapshots(prevResponse, nextResponse, opts = {}) {
  const prev = indexGamesById(prevResponse)
  const next = indexGamesById(nextResponse)
  const events = []
  for (const [matchId, nextGame] of next) {
    const prevGame = prev.get(matchId)
    if (!prevGame) continue
    events.push(...diffGame(prevGame, nextGame, opts))
  }
  return events
}

// =================================================================================================
// E13 — ability -> player attribution. VERIFIED 2026-08-06, not yet wired into diffGame's output.
// =================================================================================================
//
// `scoreboard.{side}.abilities[]` is a flat, TEAM-level array of `{ability_id, ability_level}` —
// not nested per player like items are. The original investigation doc flagged this as needing a
// "decode pass" of unknown difficulty. Measured against a real live poll (44 games, 64 side-
// instances, 2026-08-06): naive attribution (does exactly one of the side's 5 heroes' own kit
// contain this ability_id?) resolves only 29.9% of entries — the array also carries UNIVERSAL
// abilities every hero effectively has (Glyph/Scan/Roshan-capture/Dota-Plus-cosmetic slots) and
// hero TALENTS (the special_bonus_* tree), neither of which live in a hero's base "abilities" list
// in OpenDota's constants.
//
// Excluding the 10 confirmed-universal ids (each appeared EXACTLY once per side-instance
// regardless of hero composition — the tell that they're not hero-specific) and adding each
// hero's talent names to their owned-ability set: **344/347 relevant entries (99.1%) uniquely
// attributed, 1 collision (0.3%), 2 unattributed (0.6%)**. Genuinely tractable — much more so than
// the original spec worried about.
//
// NOT wired into diffGame/diffSnapshots: this changes what event types ship, which is a product
// scope decision (AbilityLearned was explicitly out of the original MVP), not just a data-
// availability question. These are tested, working primitives ready for that decision.

// Ability ids observed to appear exactly once per side-instance regardless of hero composition —
// i.e., not owned by any specific hero. Derived empirically (2026-08-06); NOT sourced from any
// Valve/OpenDota documentation, since none exists for this distinction. Re-verify if a patch adds
// or removes universal ability slots — the "exactly one per instance" test in the verification
// script that produced this list is the way to regenerate it, not guesswork.
export const UNIVERSAL_ABILITY_IDS = new Set([
  5669, // ability_capture (Roshan/outpost capture point)
  842,  // abyssal_underlord_portal_warp (a generic teleport-class slot)
  8873, // twin_gate_portal_warp
  2610, // ability_lamp_use
  8034, // plus_high_five (Dota Plus cosmetic)
  8035, // plus_guild_banner (Dota Plus cosmetic)
  1877, 1878, 1879, // unresolved names (not in OpenDota's ability_ids constants at all), but
                    // confirmed universal by the same one-per-instance test
  730,  // special_bonus_attributes — the generic "+stats" talent every hero can pick
])

// Builds { hero_id: Set<ability_id> } for one side's 5 heroes, from OpenDota's
// `/api/constants/hero_abilities` (keyed by npc name, `{abilities: [name,...], talents:
// [{name,level},...]}` — note some entries nest a list, e.g. Monkey King's form-swap slot,
// hence the flatten) and `/api/constants/heroes` (hero_id -> npc name) and
// `/api/constants/ability_ids` (ability_id -> name; ONE observed key is a comma-joined compound
// like "3060,1617" mapping several ids to one name — split on comma, not assumed 1:1).
//
// Callers should fetch and cache these three constants maps the same way `loadMarqueeIds` in
// liveStoryCapture.js already caches item constants — never re-fetched per poll.
export function buildAbilityOwnerSets(teamHeroIds, { abilityIdToName, heroIdToNpcName, heroAbilities }) {
  // name -> Set<id>, NOT name -> id: a compound key ("3060,1617" -> one name) means a single
  // ability name can legitimately map to multiple ids, and collapsing to one silently drops the
  // other (caught by a real test — see the "compound-key" case in __tests__/live-story-diff.test.js).
  const nameToIds = new Map()
  for (const [key, name] of Object.entries(abilityIdToName || {})) {
    if (!nameToIds.has(name)) nameToIds.set(name, new Set())
    for (const part of key.split(',')) nameToIds.get(name).add(Number(part))
  }
  const flatten = (arr) => (arr || []).flatMap((x) => (Array.isArray(x) ? x : [x]))

  const owners = new Map()
  for (const heroId of teamHeroIds) {
    const npc = heroIdToNpcName?.[heroId]
    const data = npc ? heroAbilities?.[npc] : null
    const names = [...flatten(data?.abilities), ...(data?.talents || []).map((t) => t.name)]
    const ids = new Set()
    for (const n of names) {
      for (const id of nameToIds.get(n) || []) ids.add(id)
    }
    owners.set(heroId, ids)
  }
  return owners
}

// Attributes one ability_id to at most one hero from the pre-built owner-set map. Returns null
// for a universal ability, an id owned by zero heroes (rare — 0.6% in verification), or an id
// owned by more than one (rarer still — 0.3%; a wrong attribution is worse than none, same rule
// this file applies to kill attribution).
export function attributeAbility(abilityId, ownerSets) {
  if (UNIVERSAL_ABILITY_IDS.has(abilityId)) return null
  const owners = [...ownerSets.entries()].filter(([, ids]) => ids.has(abilityId)).map(([heroId]) => heroId)
  return owners.length === 1 ? owners[0] : null
}

// =================================================================================================
// Buyback detection. VERIFIED 2026-08-06 against real OpenDota buyback_log ground truth — genuinely
// usable signal, NOT reliable enough for 'exact'. Matches the original spec's own caution.
// =================================================================================================
//
// Heuristic: a player's respawn_timer resets from a positive value to 0 (available again) with a
// large gold drop in the same window, while their death count is UNCHANGED (already dead, not a
// fresh death this tick). Tested against 6 real candidates surfaced from this exact heuristic
// applied to the two live-captured fixture pairs, cross-checked against the SAME matches' real
// OpenDota `buyback_log` once parsed: **3 of 4 checked confirmed as real buybacks (75% precision)**,
// 1 confirmed false positive, 2 still unparsed by OpenDota as of this writing.
//
// The false positive's root cause, structurally unfixable at this data source: a natural respawn
// (timer simply runs out) ALSO resets respawn_timer from positive to 0 with unchanged death count
// — indistinguishable from a buyback if the player also happens to complete an expensive purchase
// in that same poll window. At sparse poll cadence (the false-positive case came from a multi-
// minute gap) this collision is common enough to matter; at the tighter ~30-40s cadence this
// pipeline runs at when a viewer has the admin/live page open, the window for a coincidental
// purchase lines up with a natural respawn shrinks, but has NOT been separately measured — do not
// upgrade this past 'uncertain' without re-running the precision check at that cadence specifically.
// `minGoldDrop` (500) is an asserted starting threshold, NOT measured — unlike the 45s crosscheck
// tolerance and the universal-ability-id list above, no data established this specific number.
// The 6 real candidates from verification had gold deltas from -614 to -1667, all comfortably
// past 500, so it hasn't been stress-tested near the boundary. Revisit with real data before
// relying on it to filter anything.
export function detectBuybackCandidate(prevPlayer, nextPlayer, { minGoldDrop = 500 } = {}) {
  if (!prevPlayer || !nextPlayer) return null
  if (prevPlayer.death !== nextPlayer.death) return null // a fresh death this tick, not this signal
  if (!(prevPlayer.respawn_timer > 0) || nextPlayer.respawn_timer !== 0) return null
  const goldDelta = nextPlayer.gold - prevPlayer.gold
  if (goldDelta > -minGoldDrop) return null
  return { goldDelta, respawnTimerWas: prevPlayer.respawn_timer, confidence: 'uncertain' }
}

// =================================================================================================
// Teamfight clustering. Display-layer grouping over ALREADY-DERIVED HeroKilled events — no new
// Valve data point, this only groups events diffGame already emits. VERIFIED 2026-08-06 as a pure
// function against real derived event sequences from both fixture pairs.
// =================================================================================================
//
// Groups HeroKilled events whose `gameTime` falls within `windowS` of each other into clusters.
// A cluster of 1 is just an isolated kill, not rendered as a "teamfight" by a caller — that
// filtering is the caller's call, this function only groups, it doesn't judge significance.
//
// Honesty note carried over from the differ's own kill-attribution logic: at a poll cadence wide
// enough that multiple real kills get discovered in one diff tick, they will ALREADY share one
// `gameTime` (the discovery time, not each kill's real moment) — clustering on that value in that
// regime just re-groups what a single wide diff already batched together, not true sub-second
// simultaneity. This function is honest about grouping game_time proximity, not fight causality.
export function clusterTeamfights(heroKilledEvents, windowS = 20) {
  const sorted = [...heroKilledEvents].sort((a, b) => a.gameTime - b.gameTime)
  const clusters = []
  for (const e of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && e.gameTime - last[last.length - 1].gameTime <= windowS) {
      last.push(e)
    } else {
      clusters.push([e])
    }
  }
  return clusters
}

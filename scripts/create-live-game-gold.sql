-- live_game_gold — append-only net-worth timeseries for the Live Story live gold graph.
-- Run once in the Supabase SQL editor.
--
-- Written every ~110s per live game by api/_handlers/liveOdCapture.js (?mode=od-live-capture),
-- alongside the existing live_game_map upsert. Unlike live_game_map (one LATEST row per game),
-- this table KEEPS every snapshot so the running game's net-worth trajectory can be graphed live.
-- Read by ?mode=live-game-pulse (returns `history`) for the currently running game, resolved via
-- the same od_match_id the pulse already correlates with findOdMatchByTime(). Display-only, never
-- authoritative, and fully independent of the LOCKED VOD stream cache.

create table if not exists live_game_gold (
  id            bigserial primary key,

  od_match_id   bigint  not null,   -- OpenDota match_id (the same id the pulse resolves)
  game_time     integer not null,   -- /live game_time (seconds) — the graph x-axis

  radiant_lead  integer,            -- net-worth diff (radiant positive) — the graph y-value
  radiant_score integer,            -- radiant kills (slope / context)
  dire_score    integer,            -- dire kills

  captured_at   timestamptz not null default now(),

  -- One row per (game, in-game second). This (a) dedups duplicate captures if the ~110s KV lock
  -- ever blips and two runs fire in a window, and (b) makes a real-world PAUSE a no-op: game_time
  -- is frozen during a pause, so insert-ignore adds no new x-point. The reader plots by game_time,
  -- so a wall-clock pause correctly adds zero game-time width to the graph.
  constraint live_game_gold_uniq unique (od_match_id, game_time)
);

-- No separate index needed: the unique constraint above already indexes (od_match_id, game_time),
-- which serves the only read query —
--   select radiant_lead, radiant_score, dire_score, game_time
--   from live_game_gold where od_match_id = $1 order by game_time asc

-- Grants: the capture (write) and the pulse (read) use the service_role key. Supabase does NOT
-- reliably auto-grant privileges on a SQL-editor-created table, and the bigserial `id` needs a
-- SEPARATE grant on its sequence (INSERT calls nextval()). Both are the silent-42501 trap that
-- bit live_game_map at the companion launch — explicit + idempotent here.
grant select, insert, update, delete on public.live_game_gold to service_role;
grant usage, select on sequence live_game_gold_id_seq to service_role;

-- Retention: the net-worth data is only useful during a live game and briefly after — the COMPLETE
-- per-minute graph comes from OpenDota radiant_gold_adv once the game indexes (30–90 min later).
-- Prune aggressively (much shorter than live_game_map's 30d), e.g. alongside its prune job:
--   delete from live_game_gold where captured_at < now() - interval '48 hours';
-- NOTE (2026-07-21): no prune job is actually implemented yet — this is still just a recommendation,
-- so the table currently grows unbounded. That is deliberate for now: the building_state column
-- below needs history to accumulate for the R4.0 decode analysis. Growth is negligible at present
-- (~400 rows over the first 3 days, a few hundred KB/year), but if a prune IS added later, make
-- sure the R4 decode work is finished first or it will delete the dataset it depends on.

-- ---------------------------------------------------------------------------
-- Migration 2026-07-21 (Live Story R4 — building_state timeseries): existing tables only.
-- Idempotent. Adds the raw OD /live building_state bitmask to each per-capture snapshot.
--
-- Why here: live_game_map stores building_state too, but it UPSERTS (latest snapshot only), so it
-- keeps no history. Decoding the bitmask requires correlating *bit changes over time* against the
-- exact building_kill events in OpenDota's post-game `objectives` array — i.e. a dense per-game
-- timeseries, which is precisely what this append-only table already provides for net worth.
-- Piggybacking on it means the decode dataset accumulates passively from normal traffic instead of
-- requiring someone to babysit a live game with scripts/verify-building-state.mjs --watch.
--
-- Naming nuance: this makes the table a general per-capture live-telemetry timeseries rather than
-- strictly "gold". Accepted over creating a second near-identical table (same key, same cadence,
-- same writer) — the (od_match_id, game_time) key and insert-ignore semantics already fit exactly.
-- Stored RAW/undecoded, same store-raw-filter-at-read convention as everywhere else; nothing reads
-- it yet. NULL on rows written before this migration.
-- ---------------------------------------------------------------------------
alter table live_game_gold add column if not exists building_state bigint;

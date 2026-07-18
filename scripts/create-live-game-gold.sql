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

-- Retention: this data is only useful during a live game and briefly after — the COMPLETE
-- per-minute graph comes from OpenDota radiant_gold_adv once the game indexes (30–90 min later).
-- Prune aggressively (much shorter than live_game_map's 30d), e.g. alongside its prune job:
--   delete from live_game_gold where captured_at < now() - interval '48 hours';

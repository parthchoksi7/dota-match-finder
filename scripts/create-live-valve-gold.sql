-- live_valve_gold — append-only net-worth timeseries for the VALVE-sourced live surface.
-- Run once in the Supabase SQL editor.
--
-- Deliberately a SEPARATE table from live_game_gold, not a shared/renamed one, even though the two
-- have near-identical shape and Valve's match_id occupies the same numeric ID space as OpenDota's
-- (confirmed in .claude/specs/live-story-valve-data-audit.md — cross-checked live against OD's own
-- independent /api/live feed reporting the identical id for a real match). A brand-new table means
-- this feature ships with ZERO risk to the shipped OD-sourced live pulse: no existing writer, no
-- existing reader, no existing row is touched by anything in this file.
--
-- Written on every successful ?mode=live-valve-pulse resolve (api/_handlers/liveValvePulse.js),
-- piggybacked the same way live_game_gold rides od-live-capture — no separate cron/schedule.
-- Read back by the same endpoint to build the net-worth-over-time graph, replacing OD's
-- live_game_gold as LiveGoldGraph's data source ONLY on the Valve-sourced path
-- (feature:live-valve-pulse:enabled). The OD pulse and live_game_gold are untouched.

create table if not exists live_valve_gold (
  id              bigserial primary key,

  valve_match_id  bigint  not null,   -- Valve GetLiveLeagueGames match_id (the id the pulse resolves)
  game_time       integer not null,   -- scoreboard.duration, floored — the graph x-axis

  radiant_lead    integer,            -- sum(radiant net_worth) - sum(dire net_worth) — the graph y-value
  radiant_score   integer,            -- radiant kills (slope / context)
  dire_score      integer,            -- dire kills

  captured_at     timestamptz not null default now(),

  -- One row per (game, in-game second) — same dedup/pause-safety rationale as live_game_gold's
  -- identical constraint: insert-ignore means a duplicate poll within the same second is a no-op,
  -- and a real in-game pause (duration frozen) correctly adds zero graph width.
  constraint live_valve_gold_uniq unique (valve_match_id, game_time)
);

-- No separate index needed: the unique constraint above already indexes (valve_match_id, game_time),
-- which serves the only read query —
--   select radiant_lead, radiant_score, dire_score, game_time
--   from live_valve_gold where valve_match_id = $1 order by game_time asc

-- Grants: same silent-42501 trap noted in create-live-game-map.sql and create-live-game-gold.sql —
-- Supabase does not reliably auto-grant privileges on a SQL-editor-created table, and the
-- bigserial `id` needs a SEPARATE grant on its sequence (INSERT calls nextval()).
grant select, insert, update, delete on public.live_valve_gold to service_role;
grant usage, select on sequence live_valve_gold_id_seq to service_role;

-- Retention: same posture as live_game_gold — useful only during a live game and briefly after.
-- No prune job implemented yet; growth is bounded by the same tier-1-only correlation the Valve
-- capture already applies (typically 1-8 concurrently tracked games, not all ~43 live).
--   delete from live_valve_gold where captured_at < now() - interval '48 hours';

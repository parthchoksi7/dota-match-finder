-- live_game_map — fresh snapshot of OpenDota /api/live professional-league games.
-- Run once in the Supabase SQL editor.
--
-- Captured every ~2 min while a game is live by api/_handlers/liveOdCapture.js
-- (?mode=od-live-capture). Purpose: give the resolver a source of each game's
-- OpenDota match_id DURING the running window — before OpenDota's /promatches feed
-- indexes the finished game (30–90 min lag) and after PandaScore clears
-- external_identifier at game end. The resolver (?mode=live-series-games) team-matches
-- a PandaScore series game (team names + begin_at) against these rows via
-- findOdMatchByTime(). Fully independent of the LOCKED VOD stream cache.

create table if not exists live_game_map (
  id              bigserial primary key,

  -- Identity (OpenDota side — the reason this table exists)
  od_match_id     bigint not null,      -- OpenDota match_id, exposed by /live while running
  od_series_id    bigint,               -- OpenDota series_id (null for non-series lobbies)

  -- Correlation keys (a PandaScore game is matched against these by findOdMatchByTime)
  radiant_name    text,                 -- /live team_name_radiant
  dire_name       text,                 -- /live team_name_dire
  start_time      bigint,               -- /live activate_time (unix s) — the field findOdMatchByTime compares
  league_id       bigint,               -- /live league_id

  -- Live telemetry (Phase 2 fodder — refreshed each capture, all nullable)
  radiant_lead    integer,              -- gold lead (radiant positive)
  radiant_score   integer,              -- radiant kills
  dire_score      integer,              -- dire kills
  server_steam_id text,                 -- for Steam GetRealtimeStats (Phase 2b) — TEXT: exceeds bigint range
  game_time       integer,              -- /live game_time (seconds; negative during draft)

  captured_at     timestamptz not null default now(), -- last refresh from /live (updated every capture)
  first_seen_at   timestamptz default now(),           -- set on insert, never updated

  constraint live_game_map_od_match_id_key unique (od_match_id)
);

-- Grants: the capture (write) and both resolvers (read) use the service_role key. Supabase does
-- NOT always auto-grant table privileges on a SQL-editor-created table, and the failure is silent
-- until a row is actually written (error 42501 "permission denied"). Explicit + idempotent.
-- The bigserial `id` needs a SEPARATE grant on its sequence — INSERT calls nextval() on it, and a
-- table grant alone still fails with "permission denied for sequence live_game_map_id_seq".
grant select, insert, update, delete on public.live_game_map to service_role;
grant usage, select on sequence live_game_map_id_seq to service_role;

-- Resolver query: recent rows within a ±15 min window of a PandaScore game's begin_at,
-- team-matched in app code. start_time index keeps that window scan fast as the table grows.
create index if not exists idx_lgm_start_time on live_game_map (start_time desc);

-- Optional series rollup: map an entire series once any one of its games matches.
create index if not exists idx_lgm_series on live_game_map (od_series_id);

-- Retention (optional, run periodically or as a scheduled job): the resolver only ever
-- queries recent rows, so old snapshots can be pruned without affecting behavior.
--   delete from live_game_map where captured_at < now() - interval '30 days';

-- ---------------------------------------------------------------------------
-- Migration 2026-07-16 (live-draft): existing tables only. Idempotent — safe to re-run.
-- Adds each side's live hero picks (Phase 2 "live pulse": gold lead/score/draft for the
-- CURRENTLY RUNNING game, read alongside the radiant_lead/scores columns above). NULL on
-- existing rows until their next capture cycle; a fresh run of this whole script also
-- leaves existing rows untouched (ADD COLUMN IF NOT EXISTS is a no-op on rerun).
-- ---------------------------------------------------------------------------
alter table live_game_map add column if not exists radiant_hero_ids integer[];
alter table live_game_map add column if not exists dire_hero_ids integer[];

-- ---------------------------------------------------------------------------
-- Migration 2026-07-19 (live-draft player IGNs): existing tables only. Idempotent.
-- Adds each side's live player names (OD /live players[].name), parallel-indexed to
-- radiant_hero_ids/dire_hero_ids above (same order, same team split, same length per
-- side) so the frontend can zip hero + player together per pick. NULL on existing rows
-- until their next capture cycle. Lets the live draft show "Clinkz — shiro" instead of
-- hero-only, matching the finished-game DraftDisplay's hero + pro-name row.
-- ---------------------------------------------------------------------------
alter table live_game_map add column if not exists radiant_player_names text[];
alter table live_game_map add column if not exists dire_player_names text[];

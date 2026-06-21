-- match_stream_history — persistent record of every live game SpectateEsports observed.
-- Run once in the Supabase SQL editor.
--
-- Phase 0 columns: written immediately when a game goes live (live-matches.js).
-- Phase 1 columns (vod_*): null at write time, populated by the vod-enrich job.

create table if not exists match_stream_history (
  id              bigserial primary key,

  -- Identity
  od_match_id     bigint not null,     -- OpenDota match ID (unique per game)
  ps_match_id     bigint,              -- PandaScore series match ID

  -- Stream
  channel         text,                -- Primary Twitch channel login (e.g. 'esl_dota2'); null for YouTube-only series

  -- Timing
  started_at      timestamptz not null, -- game begin_at from PandaScore

  -- Teams
  team_a          text,                -- PandaScore opponent[0] name
  team_b          text,                -- PandaScore opponent[1] name

  -- Context (replaces KV format:match / bracket:match — those expire after 14 days)
  tournament      text,                -- built tournament name (league + serie)
  match_type      text,                -- 'best_of_1', 'best_of_3', 'best_of_5'
  game_position   smallint,            -- 1, 2, 3 within the series
  bracket_round   text,                -- 'Grand Final', 'Upper Bracket Final', etc.

  -- Every stream URL PandaScore provides: all languages, all sources, official AND unofficial.
  -- Each element: { raw_url, language, official, main, source, channel }
  --   source  = 'twitch' | 'youtube' | 'other'
  --   channel = twitch login when source='twitch', else null
  streams_json    jsonb,               -- e.g. [{"raw_url":"...","language":"ru","official":true,"main":false,"source":"twitch","channel":"dota2_winline_ru"}]

  -- VOD enrichment (Phase 1 — all null at initial write)
  twitch_vod_id   text,                -- Twitch VOD ID once resolved
  vod_offset_s    integer,             -- seconds from stream start to game start
  vod_resolved_at timestamptz,         -- when twitch_vod_id was successfully written
  vod_checked_at  timestamptz,         -- last enrichment attempt (even on miss)
  vod_available   boolean,             -- null=unknown, true=vod live, false=deleted/muted

  created_at      timestamptz default now(),

  constraint match_stream_history_od_match_id_key unique (od_match_id)
);

-- Phase 1 enrichment query: unresolved rows from the last 60 days
create index if not exists idx_msh_enrich
  on match_stream_history (started_at desc)
  where twitch_vod_id is null and vod_available is not false;

-- Channel-level lookups (enrichment fetches VODs per channel)
create index if not exists idx_msh_channel_started
  on match_stream_history (channel, started_at desc);

-- ---------------------------------------------------------------------------
-- Migration 2026-06-20 (all-stream-urls): existing tables only.
-- Run these once if the table predates the all-streams change. Idempotent.
-- ---------------------------------------------------------------------------
alter table match_stream_history alter column channel drop not null;
-- Group games into series for the internal VOD-URL browser.
create index if not exists idx_msh_series on match_stream_history (ps_match_id, game_position);

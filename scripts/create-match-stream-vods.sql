-- match_stream_vods — per-(game, channel) VOD resolution for NON-main Twitch channels
-- (alt channels / other languages). The main channel's VOD stays in
-- match_stream_history (twitch_vod_id / vod_offset_s). This table extends deep-linking
-- coverage to every recorded Twitch channel, so the internal VOD-URL browser can jump
-- to the game start on alt/language streams too (P3.3 of .claude/all-stream-urls-spec.md).
--
-- Seeded + resolved by scripts/vod-enrich.mjs, which calls the LOCKED resolver
-- (/api/match-streams?mode=twitch-vod) per channel and parses the returned URL — it does
-- NOT reimplement the Helix lookup. Run once in the Supabase SQL editor.

create table if not exists match_stream_vods (
  od_match_id     bigint not null,      -- OpenDota match ID (one game)
  channel         text not null,        -- Twitch channel login (non-main)
  language        text,                 -- stream language from streams_json
  started_at      timestamptz not null, -- game begin_at (for the 60d lookback + offset calc)

  twitch_vod_id   text,                 -- resolved Twitch VOD ID
  vod_offset_s    integer,              -- seconds into the VOD for game start (incl. +600 buffer)
  vod_available   boolean,              -- null=unknown, true=resolved, false=deleted/muted/no-VOD
  vod_checked_at  timestamptz,          -- last enrichment attempt (even on miss)
  vod_resolved_at timestamptz,          -- when twitch_vod_id was successfully written

  created_at      timestamptz default now(),

  primary key (od_match_id, channel)
);

-- Enrichment query: unresolved rows from the last 60 days (Twitch archive VODs expire ~60d).
create index if not exists idx_msv_enrich
  on match_stream_vods (started_at desc)
  where twitch_vod_id is null and vod_available is not false;

-- Read-side join: fetch all channels for a set of games.
create index if not exists idx_msv_match on match_stream_vods (od_match_id);

-- Grant access to the service_role used by vod-enrich.mjs (writes) and the
-- ?type=vod-urls read endpoint (getSupabaseAdmin). New tables created in the SQL
-- editor don't always inherit default privileges, so grant explicitly.
grant select, insert, update, delete on table match_stream_vods to service_role;

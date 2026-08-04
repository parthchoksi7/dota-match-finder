-- push_subscriptions — replaces the KV push:sub / push:teams / push:prefs / push:team:{name}
-- keyspace (pending-refactors #16). Run once in the Supabase SQL editor.
--
-- user_id is the existing HMAC-SHA256(VAPID_PRIVATE_KEY, endpoint).slice(0,32) derived in
-- live-matches.js — NOT a Supabase-generated id. Dedup keys in KV (push:sent:*, push:sent:soon:*,
-- push:sent:replay:*, push:score:sig:*) are keyed by this same userId and are NOT migrated by this
-- table; keeping user_id identical across the cutover means an already-notified subscriber's dedup
-- history stays valid (no duplicate sends the day of cutover).
--
-- `teams` is stored lowercased (not the client's original casing) so the notification send path
-- can match on it directly via the `overlaps` operator without a separate reverse index — this
-- replaces push:team:{name} entirely. Any code populating this table (the push-subscribe handler,
-- the one-time KV backfill script) MUST lowercase team names before writing.
--
-- `prefs` intentionally is NOT in the pending-refactors #16 schema sketch — it was omitted there,
-- but dropping it would silently break per-type toggles and quiet hours for every migrated
-- subscriber, which is a regression, not a simplification. Kept as jsonb, same shape normalizePrefs()
-- already produces: { tz, types: {soon,live,replay,score}, quietStart, quietEnd }.
--
-- No RLS / no anon grant, matching match_stream_history and live_game_map: this table is written
-- and read exclusively via getSupabaseAdmin() (service role bypasses RLS regardless). Push
-- endpoints are semi-sensitive device identifiers plus a fan's followed-team list — never expose
-- this table to the anon key the way articles/ is intentionally public.
--
-- Grant is NOT optional: Supabase does not always auto-grant table privileges on a
-- SQL-editor-created table, and the failure is silent until a row is actually written (error
-- 42501 "permission denied") — this exact trap broke live_game_map in production once (fixed
-- 2026-07-16, see create-live-game-map.sql). No sequence grant needed here — the PK default is
-- gen_random_uuid(), not a bigserial.

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),

  user_id      text        not null unique, -- HMAC(VAPID_PRIVATE_KEY, endpoint).slice(0,32)
  endpoint     text        not null,
  p256dh       text,
  auth         text,

  teams        text[]      not null default '{}', -- lowercased team names; matched via `overlaps`
  prefs        jsonb       not null default '{}'::jsonb, -- normalizePrefs() shape

  updated_at   timestamptz not null default now()
);

-- Notification send path: "which subscribers follow either team in this match" via
-- `.overlaps('teams', [teamA.toLowerCase(), teamB.toLowerCase()])`.
create index if not exists idx_push_subs_teams on push_subscriptions using gin (teams);

grant select, insert, update, delete on public.push_subscriptions to service_role;

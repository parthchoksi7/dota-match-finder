-- stratz_match_enrichment — permanent store for successful STRATZ post-game
-- enrichment (position/role/imp/award per player), one row per match.
--
-- Why this exists alongside the KV cache in api/_handlers/matchStratz.js: STRATZ's
-- API token is IP-locked (confirmed live 2026-08-12 — some requests get a 403
-- "You cannot use different IP Addresses" depending on which Vercel serverless
-- egress IP happens to serve them), so a live fetch succeeding is a coin flip even
-- for a fully-processed match. STRATZ match results are immutable once posted —
-- once a fetch DOES succeed, there is no reason to ever ask again. The KV entry
-- (stratz:match:v1:{matchId}) still exists as the fast 7-day-TTL path; this table
-- is the layer beneath it so a KV TTL expiry never forces another gamble against
-- the IP lock for a match already resolved once. Run once in the Supabase SQL editor.

create table if not exists stratz_match_enrichment (
  od_match_id bigint not null primary key,   -- OpenDota/Valve match ID (same ID space as STRATZ)
  players     jsonb  not null,               -- raw STRATZ players array: [{heroId, position, role, imp, award}]
  created_at  timestamptz default now()
);

-- Grant access to the service_role used by matchStratz.js (reads + writes).
-- New tables created in the SQL editor don't always inherit default privileges,
-- so grant explicitly (same requirement documented in create-live-game-map.sql).
grant select, insert, update, delete on table stratz_match_enrichment to service_role;

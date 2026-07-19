import { kv } from '../_kv.js'
import { TIER1_TEAMS_SERVER, TIER1_TEAMS_SERVER_SLUGS, TEAM_NICKNAMES, KV_TIER1_TEAMS_FULL_KEY } from '../_shared.js'

// Public read endpoint for the dynamic tier-1 team list — powers the Follow Teams
// search (ManageTeamsModal.jsx) and the Calendar team picker (Calendar.jsx). The list
// itself is written by ?mode=sync-teams (api/_handlers/syncTeams.js), run daily via
// .github/workflows/sync-teams.yml. This handler never calls PandaScore directly —
// KV miss/error falls back to the static TIER1_TEAMS_SERVER, with slugs backfilled from
// TIER1_TEAMS_SERVER_SLUGS (Calendar.jsx requires a real slug per team; see that
// constant's comment for why a null-slug fallback is unsafe).

function enrichTeam(team) {
  return {
    name: team.name,
    slug: team.slug || null,
    acronym: team.acronym || null,
    aliases: TEAM_NICKNAMES[team.name] || [],
  }
}

export default async function handleTeamsList(req, res) {
  let teams = []
  try {
    const cached = await kv.get(KV_TIER1_TEAMS_FULL_KEY)
    if (Array.isArray(cached) && cached.length > 0) teams = cached
  } catch (err) {
    console.warn('[teams-list] KV read failed:', err?.message)
  }

  if (teams.length === 0) {
    teams = TIER1_TEAMS_SERVER.map(name => ({ name, slug: TIER1_TEAMS_SERVER_SLUGS[name] || null, acronym: null }))
  }

  const payload = {
    teams: teams.map(enrichTeam).sort((a, b) => a.name.localeCompare(b.name)),
    fetchedAt: new Date().toISOString(),
  }

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json(payload)
}

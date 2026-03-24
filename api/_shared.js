/**
 * Shared utilities for API serverless functions.
 * This file is prefixed with _ so Vercel does NOT deploy it as a serverless function.
 * It does NOT count toward the 12-function limit.
 */

export const TIER1_KEYWORDS = [
  'dreamleague', 'esl one', 'esl challenger', 'pgl wallachia', 'pgl',
  'beyond the summit', 'weplay', 'starladder', 'the international',
  'blast slam', 'blast', 'fissure', 'ewc', 'esports world cup', 'riyadh masters',
]

/**
 * Returns true if any of the given name strings contain a Tier 1 keyword.
 * Accepts one or two arguments: isTier1(leagueName) or isTier1(leagueName, serieName)
 */
export const isTier1 = (...names) => {
  const lower = names.filter(Boolean).join(' ').toLowerCase()
  return TIER1_KEYWORDS.some(k => lower.includes(k))
}

export const PANDASCORE_BASE = 'https://api.pandascore.co/dota2'

export const STREAM_TTL = 60 * 60 * 24 * 14 // 14 days

export const CHANNEL_LABELS = {
  pgl_dota2: 'PGL',
  pgl_dota2en2: 'PGL EN2',
  esl_dota2: 'ESL',
  esl_dota2ember: 'ESL Ember',
  esl_dota2storm: 'ESL Storm',
  esl_dota2earth: 'ESL Earth',
  beyond_the_summit: 'BTS',
  dota2ti: 'TI',
  blast_dota2: 'BLAST',
  weplaydota: 'WePlay',
}

/**
 * Maps a PandaScore streams_list + tournament name to Twitch stream objects.
 * Returns an array of { label, url } for display and channel-detection purposes.
 */
export function getTwitchStreams(streamsList, leagueName, serieName) {
  const lower = ((leagueName || '') + ' ' + (serieName || '')).toLowerCase()

  // Use PandaScore streams_list if available — filters to official English streams only.
  // Exception: for ESL One tournaments, PandaScore consistently returns only esl_dota2 (main hub)
  // even when the actual broadcast is on a sub-channel (esl_dota2earth/storm/ember).
  // In that case, fall through to the static mapping so all sub-channels are shown.
  const official = (streamsList || []).filter(s => s.official && s.language === 'en' && s.raw_url)
  if (official.length > 0) {
    const streams = official.map(s => {
      const channel = s.raw_url.replace('https://www.twitch.tv/', '')
      return { label: CHANNEL_LABELS[channel] || channel, url: s.raw_url }
    })
    const isEslOneMainOnly = lower.includes('esl one')
      && streams.length === 1
      && streams[0].url === 'https://www.twitch.tv/esl_dota2'
    if (!isEslOneMainOnly) return streams
    // Fall through to static mapping below
  }

  // Fallback: static mapping by tournament name
  if (lower.includes('pgl')) return [
    { label: 'PGL', url: 'https://twitch.tv/pgl_dota2' },
    { label: 'PGL EN2', url: 'https://twitch.tv/pgl_dota2en2' },
  ]
  if (lower.includes('esl one')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
    { label: 'ESL Storm', url: 'https://twitch.tv/esl_dota2storm' },
    { label: 'ESL Earth', url: 'https://twitch.tv/esl_dota2earth' },
  ]
  if (lower.includes('dreamleague')) return [
    { label: 'ESL', url: 'https://twitch.tv/esl_dota2' },
    { label: 'ESL Ember', url: 'https://twitch.tv/esl_dota2ember' },
  ]
  if (lower.includes('beyond the summit') || lower.includes('bts')) return [
    { label: 'BTS', url: 'https://twitch.tv/beyond_the_summit' },
  ]
  if (lower.includes('blast')) return [
    { label: 'BLAST', url: 'https://twitch.tv/blast_dota2' },
  ]
  if (lower.includes('weplay')) return [
    { label: 'WePlay', url: 'https://twitch.tv/weplaydota' },
  ]
  if (lower.includes('the international') || lower.includes(' ti ')) return [
    { label: 'TI', url: 'https://twitch.tv/dota2ti' },
  ]
  return []
}

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

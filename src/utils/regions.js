// Country code to Dota 2 pro scene region mapping
const COUNTRY_TO_REGION = {
  // Western Europe
  DE: 'WEU', FR: 'WEU', SE: 'WEU', DK: 'WEU', FI: 'WEU', NO: 'WEU',
  NL: 'WEU', BE: 'WEU', AT: 'WEU', ES: 'WEU', PT: 'WEU', IT: 'WEU',
  GB: 'WEU', UK: 'WEU', IE: 'WEU', CH: 'WEU', PL: 'WEU',
  EU: 'WEU', // PandaScore uses "EU" for pan-European orgs (e.g. OG)

  // Eastern Europe / CIS
  RU: 'EEU', UA: 'EEU', BY: 'EEU', KZ: 'EEU', RS: 'EEU',
  RO: 'EEU', BG: 'EEU', LT: 'EEU', LV: 'EEU', EE: 'EEU',
  GE: 'EEU', AM: 'EEU', AZ: 'EEU', MD: 'EEU', MK: 'EEU',
  HR: 'EEU', SK: 'EEU', SI: 'EEU', HU: 'EEU', CZ: 'EEU',

  // China
  CN: 'CN',

  // Southeast Asia
  PH: 'SEA', MY: 'SEA', SG: 'SEA', ID: 'SEA', TH: 'SEA',
  VN: 'SEA', KH: 'SEA', MM: 'SEA', LA: 'SEA', BN: 'SEA',

  // North America
  US: 'NA', CA: 'NA',

  // South America
  BR: 'SA', PE: 'SA', AR: 'SA', CL: 'SA', BO: 'SA',
  CO: 'SA', EC: 'SA', UY: 'SA', VE: 'SA', PY: 'SA',

  // Middle East / ANZ (less common)
  AU: 'ANZ', NZ: 'ANZ',
  SA: 'ME', AE: 'ME', QA: 'ME', KW: 'ME', BH: 'ME', OM: 'ME', JO: 'ME',

  // South Asia
  IN: 'SA-South', PK: 'SA-South',
}

const REGION_COLORS = {
  WEU: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  EEU: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  CN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  SEA: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  NA: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  SA: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ANZ: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  ME: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

export function getRegion(locationCode) {
  if (!locationCode) return 'Other'
  // Some PandaScore locations are country names not codes - handle common cases
  const code = locationCode.toUpperCase().trim()
  return COUNTRY_TO_REGION[code] || 'Other'
}

export function getRegionColor(region) {
  return REGION_COLORS[region] || REGION_COLORS.Other
}

export function groupTeamsByRegion(teams) {
  const groups = {}
  for (const team of teams) {
    const region = getRegion(team.location)
    if (!groups[region]) groups[region] = []
    groups[region].push(team)
  }
  return groups
}

export function getRegionSummary(teams) {
  const groups = groupTeamsByRegion(teams)
  // Region display order
  const order = ['WEU', 'EEU', 'CN', 'SEA', 'NA', 'SA', 'ANZ', 'ME', 'Other']
  return order
    .filter(r => groups[r]?.length > 0)
    .map(r => ({ region: r, count: groups[r].length }))
}

/**
 * Format "HH:MM" or "H:MM" duration string to human-readable "1h 23m" or "45m"
 */
export function formatDuration(isoTimeStr) {
  if (!isoTimeStr || typeof isoTimeStr !== "string") return isoTimeStr || "—"
  const [h = 0, m = 0] = isoTimeStr.trim().split(":").map(Number)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return "0m"
}

const SERIES_LABELS = { 0: "BO1", 1: "BO3", 2: "BO5" }
export function getSeriesLabel(seriesType) {
  return SERIES_LABELS[seriesType] ?? ""
}

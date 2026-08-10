import { useEffect, useRef } from 'react'

/**
 * A `setInterval` replacement for data polling that never polls a tab the fan can't see.
 *
 * Why this exists (2026-08-09, Fluid Active CPU budget): every poller in the app used a bare
 * `setInterval`, so a backgrounded or simply forgotten tab kept hitting the API forever. Measured
 * cost of one always-open homepage tab was ~2,400 serverless invocations/day (live-matches +
 * upcoming-matches at 2 min, recent-completed at 5 min, od-live-capture at 2 min while live), and
 * ~6,700/day with a live series sheet open on top of that — several times the entire cron load.
 * None of those requests could be seen by anyone, since the tab wasn't on screen.
 *
 * Behaviour:
 *  - Ticks only while `document.visibilityState === 'visible'`; the interval is torn down on hide
 *    and rebuilt on show, so a hidden tab issues exactly zero requests.
 *  - On becoming visible again, fires immediately IF at least `intervalMs` has elapsed since the
 *    last run. This is what keeps the UX strictly better than the old behaviour: a fan returning
 *    to the tab gets fresh data on the spot rather than waiting out the remainder of a tick that
 *    was scheduled before they left. Returning within the interval does nothing, so rapid tab
 *    flicking can never poll faster than the configured rate.
 *  - The caller still owns the initial fetch on mount (this hook deliberately does not fire one),
 *    matching the `useEffect(() => { fetch(); setInterval(...) })` shape it replaces.
 *
 * @param {() => void} callback  polling function; re-reads on every render, so it does not need
 *                               to be referentially stable and does not restart the interval
 * @param {number} intervalMs    tick interval; pass 0/null to disable
 * @param {{ enabled?: boolean }} [options]  set `enabled: false` to suspend polling entirely
 */
export function useVisiblePolling(callback, intervalMs, { enabled = true } = {}) {
  const savedCallback = useRef(callback)
  useEffect(() => { savedCallback.current = callback }, [callback])

  useEffect(() => {
    if (!enabled || !intervalMs) return
    if (typeof document === 'undefined') return

    let intervalId = null
    let resumeId = null
    // Seeded to mount time, not 0 — the caller's own initial fetch counts as the first run, so a
    // fan who tabs away and back within one interval doesn't trigger a redundant immediate refetch.
    let lastRunAt = Date.now()

    const run = () => {
      lastRunAt = Date.now()
      savedCallback.current()
    }

    const startInterval = () => {
      if (intervalId !== null) return
      intervalId = setInterval(run, intervalMs)
    }

    const stop = () => {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null }
      if (resumeId !== null) { clearTimeout(resumeId); resumeId = null }
    }

    const onVisibilityChange = () => {
      if (document.hidden) { stop(); return }
      if (intervalId !== null || resumeId !== null) return // already running

      const elapsed = Date.now() - lastRunAt
      if (elapsed >= intervalMs) {
        run()
        startInterval()
        return
      }
      // A tick is due partway through — resume on the ORIGINAL phase rather than restarting the
      // full interval from now. Restarting here would nearly double the effective gap (glance away
      // at t=5s of a 40s cycle, return at t=39s, next poll at t=79s instead of t=40s), which would
      // make a short tab-switch SLOWER than the plain setInterval this replaced. The whole point is
      // that returning is never slower, so the remainder is honoured, then the steady cadence.
      resumeId = setTimeout(() => {
        resumeId = null
        run()
        startInterval()
      }, intervalMs - elapsed)
    }

    if (!document.hidden) startInterval()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs, enabled])
}

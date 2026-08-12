/**
 * isLiveSeriesConcluded — the "has this open sheet's series stopped running" predicate that drives
 * SeriesLivePulse's poll backoff (2026-08-11, Fluid Active CPU).
 *
 * Tested in isolation because its two failure directions are wildly asymmetric:
 *   false negative -> a finished series keeps polling at 40s. Costs invocations. Recoverable.
 *   false positive -> a LIVE series drops to a 5-min cadence mid-game. User-visible, and the whole
 *                     reason its consumer backs off instead of stopping.
 * Every case below is aimed at the second kind.
 */

import { describe, it, expect } from 'vitest'
import { isLiveSeriesConcluded } from '../seriesLogic.js'

const series = { id: 123 }

describe('isLiveSeriesConcluded', () => {
  it('is false while the series is still listed as live', () => {
    expect(isLiveSeriesConcluded(series, [{ id: 123 }], true)).toBe(false)
  })

  it('is true once the series is absent from a loaded live feed', () => {
    expect(isLiveSeriesConcluded(series, [{ id: 999 }], true)).toBe(true)
  })

  it('matches ids across string/number types, so a type change upstream cannot falsely conclude a live series', () => {
    expect(isLiveSeriesConcluded({ id: '123' }, [{ id: 123 }], true)).toBe(false)
    expect(isLiveSeriesConcluded({ id: 123 }, [{ id: '123' }], true)).toBe(false)
  })

  it('is false before the first live poll has been attempted, even though the list is empty', () => {
    // The dangerous initial-paint case: liveMatches is [] only because nothing has loaded yet.
    // Without this guard every freshly-opened sheet would be born "concluded".
    expect(isLiveSeriesConcluded(series, [], false)).toBe(false)
  })

  it('is true for an empty feed only once loading has completed', () => {
    expect(isLiveSeriesConcluded(series, [], true)).toBe(true)
  })

  it('is false when no sheet is open', () => {
    expect(isLiveSeriesConcluded(null, [], true)).toBe(false)
    expect(isLiveSeriesConcluded(undefined, [], true)).toBe(false)
  })

  it('is false when liveMatches is not an array, rather than treating a malformed value as "nothing is live"', () => {
    expect(isLiveSeriesConcluded(series, null, true)).toBe(false)
    expect(isLiveSeriesConcluded(series, undefined, true)).toBe(false)
  })

  it('tolerates null entries in the feed without throwing or short-circuiting the match', () => {
    expect(isLiveSeriesConcluded(series, [null, { id: 123 }], true)).toBe(false)
    expect(isLiveSeriesConcluded(series, [null], true)).toBe(true)
  })
})

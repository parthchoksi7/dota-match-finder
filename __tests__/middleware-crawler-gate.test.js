/**
 * Regression test for the homepage-flash bug (2026-07-31).
 *
 * Root cause: middleware.js unconditionally injected the crawler-oriented
 * server-rendered fallback (plain <h1>/<ul> markup meant for bare-HTML bots)
 * into <div id="root"> for every request — including real browsers. Real
 * users briefly saw this unstyled content on every page load/refresh before
 * React mounted and replaced it.
 *
 * Fix: only requests whose User-Agent matches a known crawler (search engine,
 * social preview, or LLM bot) get the injected SSR content. Everything else
 * gets `next()` (from `@vercel/functions`), which passes the request straight
 * through to the normal static index.html/SPA — <div id="root"> stays empty
 * until React mounts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const nextMock = vi.fn(() => new Response('PASS_THROUGH_SENTINEL', { status: 200 }))
vi.mock('@vercel/functions', () => ({ next: (...args) => nextMock(...args) }))

const { default: middleware } = await import('../middleware.js')

const INDEX_HTML_FIXTURE = '<!doctype html><html><head><title>old</title></head><body><div id="root"></div></body></html>'

function mockResponse({ ok = true, body = null } = {}) {
  return {
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

function installFetchMock(routes) {
  global.fetch = vi.fn((input) => {
    const url = typeof input === 'string' ? input : input?.url || String(input)
    for (const [match, respond] of routes) {
      if (url.includes(match)) return Promise.resolve(respond(url))
    }
    return Promise.resolve(mockResponse({ ok: false }))
  })
}

function req(path, ua) {
  return new Request(`https://spectateesports.live${path}`, { headers: { 'user-agent': ua } })
}

beforeEach(() => {
  nextMock.mockClear()
  installFetchMock([
    ['/index.html', () => mockResponse({ body: INDEX_HTML_FIXTURE })],
    ['mode=series', () => mockResponse({ body: { live: [], upcoming: [], completed: [] } })],
    ['/api/news', () => mockResponse({ body: { articles: [] } })],
  ])
})

describe('middleware crawler gate', () => {
  it('passes a real Chrome browser straight through (empty root, no SSR fallback)', async () => {
    const res = await middleware(req('/', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'))
    expect(nextMock).toHaveBeenCalledTimes(1)
    expect(await res.text()).toBe('PASS_THROUGH_SENTINEL')
  })

  it('passes a real Safari/mobile browser straight through on a non-home matched route', async () => {
    const res = await middleware(req('/tournaments', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'))
    expect(nextMock).toHaveBeenCalledTimes(1)
    expect(await res.text()).toBe('PASS_THROUGH_SENTINEL')
  })

  it('serves the SSR fallback content to Googlebot', async () => {
    const res = await middleware(req('/', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
    expect(nextMock).not.toHaveBeenCalled()
    const html = await res.text()
    expect(html).toContain('Pro Dota 2 Replays, Timestamped to the Draft')
  })

  it('serves the SSR fallback content to known LLM bots (GPTBot)', async () => {
    const res = await middleware(req('/', 'GPTBot/1.0 (+https://openai.com/gptbot)'))
    expect(nextMock).not.toHaveBeenCalled()
    const html = await res.text()
    expect(html).toContain('Pro Dota 2 Replays, Timestamped to the Draft')
  })

  it('serves the SSR fallback content to social preview crawlers (Twitterbot)', async () => {
    const res = await middleware(req('/', 'Twitterbot/1.0'))
    expect(nextMock).not.toHaveBeenCalled()
    const html = await res.text()
    expect(html).toContain('Pro Dota 2 Replays, Timestamped to the Draft')
  })

  it('treats a missing User-Agent header as a real browser (pass-through, not a crawler)', async () => {
    const res = await middleware(new Request('https://spectateesports.live/'))
    expect(nextMock).toHaveBeenCalledTimes(1)
    expect(await res.text()).toBe('PASS_THROUGH_SENTINEL')
  })
})

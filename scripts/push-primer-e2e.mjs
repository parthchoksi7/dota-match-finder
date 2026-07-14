// Real-browser E2E for the push permission primer + iOS install guide.
//
// Drives the built app in headless Chromium (Playwright). Proves the properties jsdom
// cannot exercise:
//   Scenario A (desktop / Android-like, permission=default): the PRIMER renders for a
//     follower, and clicking "Not now" NEVER calls Notification.requestPermission (the
//     core one-shot-prompt safety guarantee), collapses the primer, and persists the flag.
//   Scenario B (iPhone user-agent, in-tab): the "Add to Home Screen" card renders instead
//     of the primer, the "notifications blocked" card is NOT stacked with it, and no
//     permission prompt is attempted.
//
// It CANNOT prove the OS dialog appears or that a push is delivered — those require a human
// on a real device (see the Push Notifications scenarios in QA_PROCESS.md).
//
// Usage:
//   npm run build && npm run preview &      # serves dist on http://localhost:4173
//   node scripts/push-primer-e2e.mjs        # (or set E2E_BASE to another origin)
//
// Requires Playwright + chromium available (repo uses the globally-installed Playwright;
// run `npx playwright install chromium` once). Resolves the module from NODE_PATH if it is
// not installed locally.

// CJS resolution honors NODE_PATH, so this finds a globally/npx-cached Playwright when the
// package isn't a local dependency (ESM `import` would not). Run e.g.:
//   NODE_PATH="$(npm root -g)" node scripts/push-primer-e2e.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.env.E2E_BASE || 'http://localhost:4173'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// Headless Chromium hardwires Notification.permission to 'denied' (no UI to grant), so we
// stub it to the state each scenario needs — 'default' to reach the primer, 'denied' to
// reach the iOS+denied blocker case. The requestPermission spy is the real assertion: it
// records whether the app ever invoked the OS permission API.
function makeInitScript(permission) {
  return `
    try { localStorage.setItem('followedTeams', JSON.stringify(['Team Liquid'])) } catch (e) {}
    window.__permissionAsked = false;
    if (window.Notification) {
      try { Object.defineProperty(Notification, 'permission', { configurable: true, get: () => ${JSON.stringify(permission)} }); } catch (e) {}
      if (Notification.requestPermission) {
        var orig = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = function () { window.__permissionAsked = true; return orig.apply(null, arguments); };
      }
    }
  `
}

let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

async function openManageTeams(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('#root')?.children.length, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  await page.evaluate(() => window.dispatchEvent(new Event('manage-teams:open')))
  await page.getByRole('dialog', { name: /my teams/i }).waitFor({ timeout: 8000 })
}

async function run() {
  const browser = await chromium.launch()
  try {
    // ---- Scenario A: desktop/Android-like, permission=default — primer + "Not now" safety ----
    {
      const ctx = await browser.newContext()
      await ctx.addInitScript(makeInitScript('default'))
      const page = await ctx.newPage()
      await openManageTeams(page)

      const pushSupported = await page.evaluate(
        () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      )
      check('A0 browser reports push-supported (secure-context APIs present)', pushSupported)

      const primer = page.getByRole('button', { name: /^Turn on$/ })
      const notNow = page.getByRole('button', { name: /^Not now$/ })
      check('A1 primer "Turn on" button visible', await primer.isVisible().catch(() => false))
      check('A2 primer "Not now" button visible', await notNow.isVisible().catch(() => false))

      await notNow.click()

      const askedAfterNotNow = await page.evaluate(() => window.__permissionAsked)
      check('A3 "Not now" did NOT call Notification.requestPermission', askedAfterNotNow === false)
      check('A4 primer collapsed after "Not now"', !(await primer.isVisible().catch(() => false)))
      check('A5 compact "Live match alerts" row shown after dismiss',
        await page.getByText('Live match alerts', { exact: true }).isVisible().catch(() => false))
      check('A6 dismissed flag persisted to localStorage',
        (await page.evaluate(() => localStorage.getItem('spectate-push-primer-dismissed'))) === '1')

      await ctx.close()
    }

    // ---- Scenario B: iPhone in-tab, permission=denied — install card wins over denied ----
    // This is the exact blocker the review caught: without the iOS-priority guard, the
    // "notifications blocked" card would stack under the install card. Explicitly denied.
    {
      const ctx = await browser.newContext({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 } })
      await ctx.addInitScript(makeInitScript('denied'))
      const page = await ctx.newPage()
      await openManageTeams(page)

      check('B1 iOS "Add to Home Screen" card visible',
        await page.getByRole('button', { name: /Add to Home Screen/i }).isVisible().catch(() => false))
      check('B2 primer NOT shown on iOS in-tab',
        (await page.getByRole('button', { name: /^Turn on$/ }).isVisible().catch(() => false)) === false)
      check('B3 "Notifications are blocked" card NOT stacked with install card (the fixed blocker)',
        (await page.getByText(/Notifications are blocked/i).isVisible().catch(() => false)) === false)
      check('B4 no permission prompt attempted on iOS in-tab',
        (await page.evaluate(() => window.__permissionAsked)) === false)

      await ctx.close()
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${failures === 0 ? 'ALL E2E CHECKS PASSED' : failures + ' E2E CHECK(S) FAILED'}`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch(e => { console.error(e); process.exit(1) })

# Fix App.jsx - add trackEvent helper and replace all track() calls
app = open('src/App.jsx').read()

# Replace vercel-only import with helper function after the import
app = app.replace(
    'import { track } from "@vercel/analytics"',
    '''import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}'''
)

# Replace all track( calls with trackEvent(
app = app.replace('track("search"', 'trackEvent("search"')
app = app.replace('track("load_more"', 'trackEvent("load_more"')
app = app.replace('track("game_click"', 'trackEvent("game_click"')
app = app.replace('track("summary_click"', 'trackEvent("summary_click"')
app = app.replace('track("copy_vod"', 'trackEvent("copy_vod"')
app = app.replace('track("share_match"', 'trackEvent("share_match"')

with open('src/App.jsx', 'w') as f:
    f.write(app)

print('App.jsx done!')

# Fix MatchDrawer.jsx - replace import and all track() calls
drawer = open('src/components/MatchDrawer.jsx').read()

# Replace import with helper
drawer = drawer.replace(
    'import { track } from "@vercel/analytics"',
    '''import { track } from "@vercel/analytics"

function trackEvent(name, props) {
  track(name, props)
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name, props)
  }
}'''
)

# Replace all track( calls with trackEvent(
drawer = drawer.replace('track("vod_click"', 'trackEvent("vod_click"')
drawer = drawer.replace('track("twitch_search_click"', 'trackEvent("twitch_search_click"')

with open('src/components/MatchDrawer.jsx', 'w') as f:
    f.write(drawer)

print('MatchDrawer.jsx done!')

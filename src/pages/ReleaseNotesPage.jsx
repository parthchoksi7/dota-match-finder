import SiteHeader from "../components/SiteHeader"

const RELEASES = [
  {
    date: "Mar 12, 2026",
    tag: "new",
    title: "Tournament Hub — Hero Pick/Ban Stats",
    desc: "A new Heroes tab in the Tournament Hub shows which heroes are being picked and banned across all completed games of the active tournament.",
    items: [
      "Table shows each hero's pick count, win percentage, ban count, and total contested (picks + bans).",
      "Sorted by most contested — the heroes dominating the draft are at the top.",
      "Win% is color-coded: green for 60%+ win rate, red for 40% or below.",
      "Shows game count so you know how large the sample is.",
      "Loads lazily when you click the tab. Respects stage switching (Group Stage vs Playoffs).",
    ],
  },
  {
    date: "Mar 12, 2026",
    tag: "fix",
    title: "Tournament Bracket — Round Labels Always Visible",
    desc: "Bracket column headers now always show their round label (Round 1, Quarterfinal, Semifinal, Final) even when all matches in that round are still TBD. Previously, future rounds showed blank headers.",
  },
  {
    date: "Mar 12, 2026",
    tag: "improvement",
    title: "Tournament Bracket — Cleaner Round Names",
    desc: "Bracket column headers now use clean, canonical names regardless of how PandaScore labels the stage internally. Names like 'Semifinal 2' or 'Upper Bracket Quarterfinal 1' are now shown as just 'Semifinal' or 'Quarterfinal'.",
  },
  {
    date: "Mar 8, 2026",
    tag: "improvement",
    title: "Latest Results — date dividers",
    desc: "Matches in the Latest Results section are now grouped by date with dividers showing Today, Yesterday, or the date (e.g. Mar 7). Replaces the previous tournament-change dividers.",
  },
  {
    date: "Mar 8, 2026",
    tag: "improvement",
    title: "Upcoming Matches — collapsed by default",
    desc: "Upcoming matches now show 2 matches by default with a 'Show N more' button to expand. Removes visual clutter on the homepage. The 'Next 72 hours' label has also been removed.",
  },
  {
    date: "Mar 7, 2026",
    tag: "improvement",
    title: "Match Drawer — Watch CTA moved above draft",
    desc: "The Watch section (Twitch VOD buttons, Copy VOD, Share match) now appears above the draft breakdown instead of below it. Makes it easier to find on mobile without scrolling past the full draft.",
  },
  {
    date: "Mar 7, 2026",
    tag: "improvement",
    title: "Header & UI Cleanup",
    desc: "Simplified the site header and removed low-value UI elements.",
    items: [
      "Spoiler toggle and theme toggle now show as icons instead of text labels.",
      "About, What's New, and X links are now visible on mobile in the header.",
      "All pages (About, What's New, homepage) share the same header component.",
      "Removed Popular team shortcuts from the search bar.",
      "Removed Liquipedia and X account links from the Tournament Hub.",
      "Upcoming matches on mobile now stack team names above stream buttons to prevent layout overflow.",
    ],
  },
  {
    date: "Mar 7, 2026",
    tag: "improvement",
    title: "About & Release Notes — React Pages",
    desc: "The About and Release Notes pages are now React components served at clean URLs (/about and /release-notes) instead of static HTML files. Theme toggle, navigation, and all content are identical to before.",
  },
  {
    date: "Mar 7, 2026",
    tag: "new",
    title: "Tournament Hub — Standings, Schedule & Format",
    desc: "The tournament section on the homepage now has three tabs: Overview, Standings, and Schedule.",
    items: [
      "Standings tab shows the live group stage W-L table with advancing/eliminated zone indicators.",
      "Schedule tab shows match results by round — live matches pulse in red, finished matches show scores, upcoming matches show kickoff time.",
      "Format badge shows the tournament format (Swiss, Double Elimination) with round count next to the tournament name.",
      "Event Format section in Overview shows the full event pipeline — e.g. Group Stage → Playoffs — with the current stage highlighted.",
      "Info tooltips on each format term explain what Swiss, Double Elimination, and other formats mean in plain language.",
      "If multiple stages of the same event are running simultaneously, a stage switcher appears at the top.",
    ],
  },
  {
    date: "Mar 7, 2026",
    tag: "new",
    title: "SEO Match URLs & Sitemap",
    desc: "Match pages now have keyword-rich URLs instead of numeric IDs.",
    items: [
      "URLs now follow the pattern /match/team-spirit-vs-gaimin-gladiators-dreamleague-s23-{id}.",
      "Server-side meta tags (title, description, OG) are injected per match so search engines index the correct content.",
      "/sitemap.xml is now live — generates a full list of recent Tier 1 match URLs for Google to crawl.",
      "Old numeric URLs (/match/123456) and hash links (#match-123456) still work — fully backwards-compatible.",
    ],
  },
  {
    date: "Mar 7, 2026",
    tag: "improvement",
    title: "Latest Results — Tournament Dividers",
    desc: "When the Latest Results section contains matches from more than one tournament, a centered divider with the tournament name now appears between them. No divider is shown if all results are from the same event.",
  },
  {
    date: "Mar 6, 2026",
    tag: "new",
    title: "Live Match Scores & Game Chips",
    desc: "The Live Now section now shows full series context while a match is in progress.",
    items: [
      "Scoreboard layout: teams on left and right, live series score in the center (e.g. 1–1).",
      "Current game indicator (G2, G3…) pulses in red below the score.",
      "Completed games appear as clickable chips — click any chip to open the full match details drawer for that game.",
      "Spoiler-free mode hides the score and winner names in chips, but still shows which game is live.",
      "Leading team is bright; trailing team is dimmed. Dimming is disabled in spoiler-free mode.",
    ],
  },
  {
    date: "Mar 6, 2026",
    tag: "new",
    title: "Spoiler-Free Mode",
    desc: 'Toggle "Spoilers: Off" in the header to hide all scores and match outcomes across the entire site — live matches, latest results, and match cards. Your preference is saved across sessions.',
  },
  {
    date: "Mar 6, 2026",
    tag: "new",
    title: "Shareable Match Cards with OG Previews",
    desc: "Every match now has a unique shareable URL. Sharing a link on Twitter/X, Discord, or iMessage shows a rich preview card with teams, score, and tournament — generated server-side as a PNG.",
  },
  {
    date: "Mar 6, 2026",
    tag: "new",
    title: "Upcoming Matches Search",
    desc: "The search bar now filters upcoming and live matches too. Search for a team or tournament to see their next scheduled matches alongside historical results.",
  },
  {
    date: "Mar 5, 2026",
    tag: "new",
    title: "Live Now & Upcoming Matches",
    desc: "The homepage now shows what's happening right now and what's coming up in the next 72 hours.",
    items: [
      "Live Now section shows currently running Tier 1 matches with Twitch stream buttons.",
      "Upcoming Matches shows the next 72 hours of scheduled matches with local kickoff times.",
      "Both sections auto-refresh every 2 minutes.",
      "Stream buttons link directly to the official English broadcast channel.",
    ],
  },
  {
    date: "Mar 5, 2026",
    tag: "new",
    title: "Tournament Hub",
    desc: "A new section at the top of the homepage highlights the active Tier 1 tournament — name, dates, and quick links to Liquipedia and the official X account. Shows upcoming tournaments when nothing is live.",
  },
  {
    date: "Mar 4, 2026",
    tag: "new",
    title: "Analytics",
    desc: "Added Vercel Analytics and Google Analytics (GA4) to track usage across the site — searches, match clicks, VOD clicks, share events, AI summary requests, and more. No personal data is collected.",
  },
  {
    date: "Mar 3, 2026",
    tag: "new",
    title: "About Page",
    desc: "Added a public About page at /about with an overview of what Spectate Esports does, the full tournament list, and an FAQ covering common questions.",
  },
  {
    date: "Mar 2, 2026",
    tag: "improvement",
    title: "AI Summary Improvements",
    desc: "The AI match summary was significantly improved.",
    items: [
      "Hero IDs are now resolved to names before sending to Claude — eliminates hero name hallucinations.",
      "Pro player names are used instead of Steam display names.",
      "Output now includes a clear Draft Winner label in the DRAFT ANALYSIS section.",
      "Draft analysis focuses only on picks and bans — match outcome is intentionally excluded to avoid bias.",
    ],
  },
  {
    date: "Mar 1, 2026",
    tag: "new",
    title: "Match Drawer — Draft Display",
    desc: "Clicking a match opens a slide-in drawer with the full draft breakdown — hero picks and bans per team, pro player names, and KDA stats for every player in every game.",
  },
  {
    date: "Mar 1, 2026",
    tag: "improvement",
    title: "Tier 1 Filter & Series Grouping",
    desc: "Match results are now filtered to Tier 1 tournaments only — no regional or amateur leagues. Individual games are automatically grouped into BO1, BO3, or BO5 series with a series score.",
  },
  {
    date: "Feb 28, 2026",
    tag: "new",
    title: "AI Match Summary",
    desc: "Added an AI-generated match summary for every game, powered by Claude. Covers draft analysis with a draft winner, team strategy, MVP of the match, and a highlight moment. Generated on demand and cached per match.",
  },
  {
    date: "Feb 28, 2026",
    tag: "new",
    title: "Multi-Channel VOD Search",
    desc: "VOD search now checks all major Tier 1 broadcast channels in parallel — ESL Main, ESL Ember, ESL Storm, ESL Earth, PGL, BTS, WePlay, DreamLeague, and more. All matching channels are shown so you can pick the one that had your match.",
  },
  {
    date: "Feb 28, 2026",
    tag: "new",
    title: "Homepage — Latest Results & Relative Time",
    desc: 'The homepage now shows the most recent Tier 1 series results by default, with relative timestamps ("2h ago", "Yesterday"). No search needed to see what just happened.',
  },
  {
    date: "Feb 27, 2026",
    tag: "new",
    title: "Launch — Timestamped Dota 2 VOD Finder",
    desc: "Spectate Esports launched. Search for any pro Dota 2 team or tournament and get a direct Twitch link that jumps to the exact start of that match — no scrubbing through 8 hours of tournament stream.",
  },
]

const TAG_STYLES = {
  new: "text-green-500 border-green-500/30 bg-green-500/5",
  improvement: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  fix: "text-gray-500 border-gray-700 bg-transparent",
}

const TAG_LABELS = { new: "New", improvement: "Improvement", fix: "Fix" }

function ReleaseNotesPage() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col font-mono">
      <SiteHeader />

      <main className="max-w-2xl mx-auto px-4 py-12 flex-1 w-full">
        <p className="text-xs uppercase tracking-[5px] text-red-500 mb-3">Changelog</p>
        <h1 className="text-3xl font-black uppercase tracking-wide mb-2">Release Notes</h1>
        <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-600 mb-12 pb-12 border-b border-gray-200 dark:border-gray-800">
          What's shipped — updated as features go live
        </p>

        <div className="flex flex-col">
          {RELEASES.map((r, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr] sm:grid-cols-[120px_1fr] gap-x-8 pb-10 max-sm:grid-cols-1 max-sm:gap-y-2">
              <div className="pt-0.5">
                <p className="text-[10px] uppercase tracking-[3px] text-gray-500 dark:text-gray-600 whitespace-nowrap">{r.date}</p>
                <span className={`inline-block mt-2 text-[9px] font-bold uppercase tracking-[2px] px-1.5 py-0.5 rounded-sm border ${TAG_STYLES[r.tag]}`}>
                  {TAG_LABELS[r.tag]}
                </span>
              </div>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-8 pb-2 max-sm:border-l-0 max-sm:pl-0 max-sm:border-t max-sm:border-gray-200 max-sm:dark:border-gray-800 max-sm:pt-3">
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-white mb-2">{r.title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-500 leading-relaxed">{r.desc}</p>
                {r.items && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {r.items.map((item, j) => (
                      <li key={j} className="text-xs text-gray-500 dark:text-gray-600 leading-relaxed pl-3.5 relative before:content-['—'] before:absolute before:left-0 before:text-gray-500 dark:before:text-gray-600">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 px-4 py-4 text-center text-xs uppercase tracking-widest text-gray-500 dark:text-gray-600">
        Spectate Esports · spectateesports.live
      </footer>
    </div>
  )
}

export default ReleaseNotesPage

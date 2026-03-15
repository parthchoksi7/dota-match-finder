import SiteHeader from "../components/SiteHeader"

const RELEASES = [
  {
    date: "Mar 15, 2026",
    tag: "improvement",
    title: "Stronger Spoiler-Free Mode",
    desc: "Spoiler-free mode now hides all information that could reveal the outcome or length of a series.",
    items: [
      "Series type label (BO3, BO5) is now hidden - knowing the format can hint at how many games were played.",
      "Game count ('3 games') in collapsed cards is now hidden - replaced with 'Click to expand'.",
      "Game label in the match drawer now shows 'Game 1' instead of 'Game 1 of 3' so the series length stays hidden.",
      "KDA stats in the draft breakdown remain hidden (existing behavior).",
      "Reddit VOD post drafts no longer reference game numbers beyond Game 1, keeping the post spoiler-free.",
    ],
  },
  {
    date: "Mar 14, 2026",
    tag: "improvement",
    title: "Clearer Section Layout on the Homepage",
    desc: "Each homepage section now has a floating label above its card, with a colored left-border accent for faster at-a-glance navigation.",
    items: [
      "Section labels (Live Tournament, Live Now, Upcoming Matches, My Teams, Latest Results) now appear above their cards instead of inside a gray header bar.",
      "Each section has a distinct left-border accent stripe: red for live content, blue for upcoming, amber for My Teams, gray for Latest Results.",
      "The Manage button (My Teams) and match count (search results) remain visible in the label row.",
      "Loading skeleton updated to match the new layout.",
    ],
  },
  {
    date: "Mar 14, 2026",
    tag: "new",
    title: "My Teams - Follow Your Favorite Teams",
    desc: "Follow teams with one click and see their matches prioritized at the top of the homepage. No account required.",
    items: [
      "Star icon on every match card lets you follow or unfollow a team instantly.",
      "My Teams section appears above Latest Results when you have followed teams, showing only their completed series.",
      "If your followed teams have no recent matches, a short message is shown instead.",
      "Manage button opens a modal to review and remove followed teams.",
      "Works with Spoiler-Free mode - My Teams matches hide scores and results just like the main list.",
      "Followed teams are saved in your browser. They will not appear in incognito mode, other browsers, or on other devices.",
    ],
  },
  {
    date: "Mar 14, 2026",
    tag: "fix",
    title: "Consistent Standings Tab Across Tournament Stages",
    desc: "The Standings tab no longer disappears and reappears when switching between group stage and playoffs.",
    items: [
      "Previously, the Standings tab was hidden entirely for bracket/elimination formats, causing it to abruptly appear when switching back to group stage.",
      "The tab bar now always shows all four tabs (Overview, Standings, Schedule, Heroes) regardless of the active stage format.",
      "When viewing a bracket stage, the Standings tab shows a clear message: 'No standings for bracket stages.' with an optional shortcut to switch to the group stage standings.",
    ],
  },
  {
    date: "Mar 13, 2026",
    tag: "improvement",
    title: "Tournament Identity and Bracket Live States",
    desc: "The Tournament Hub now shows which league is running the event, and the bracket makes live rounds easier to spot.",
    items: [
      "League organizer label (DreamLeague, ESL, PGL, BLAST, etc.) now appears above the tournament name in red small caps - the same eyebrow label style used elsewhere in the app.",
      "Bracket: round column labels turn red with a pulsing dot when any match in that round is currently live.",
      "Bracket: live match card border increased to 80% opacity for clearer contrast against finished and upcoming matches.",
    ],
  },
  {
    date: "Mar 13, 2026",
    tag: "improvement",
    title: "Header and Tournament Hub Navigation",
    desc: "Cleaner header and a proper segmented control for the Tournament Hub tabs.",
    items: [
      "Header: removed the X social icon and decorative divider - both were noise, not navigation.",
      "Header: tagline is now hidden on mobile where space is tight.",
      "Tournament Hub tabs (Overview, Standings, Schedule, Heroes) are now a segmented control - a contained pill with a filled background for the active tab, instead of a full-width underline bar.",
    ],
  },
  {
    date: "Mar 13, 2026",
    tag: "improvement",
    title: "Empty States and Loading Skeletons",
    desc: "Empty states are more direct, and loading tabs in the Tournament Hub show content-shaped skeletons instead of a spinner.",
    items: [
      "Search empty state: removed the bordered box and softened copy to 'Nothing matched.' - one line, no apology.",
      "Tournament Hub - Standings tab: loading now shows a table skeleton mirroring the rank, team, W, L layout.",
      "Tournament Hub - Schedule tab: loading shows a row-list skeleton matching the match row shape.",
      "Tournament Hub - Heroes tab: loading shows a table skeleton with hero icon placeholder and stat column bars.",
      "Empty state copy tightened across Tournament Hub: 'No standings yet.', 'No bracket yet.', 'No picks yet.'",
    ],
  },
  {
    date: "Mar 13, 2026",
    tag: "improvement",
    title: "Match Card - Cleaner Visual Hierarchy",
    desc: "Match cards now make it faster to scan results at a glance.",
    items: [
      "Winner team name is now bold-black, matching the visual weight of the winning score - name and result read as a unified pair.",
      "Team names are slightly larger (text-base/text-xl) so they don't feel secondary to the score.",
      "Losing team name uses a lighter gray so the contrast between winner and loser is clearer without color alone carrying all the weight.",
      "Score separator reduced in size and weight - it is structural spacing, not content.",
      "Game duration in expanded rows uses tabular-nums to prevent layout shift as numbers change.",
      "Secondary text in light mode bumped from gray-500 to gray-600 for better readability.",
    ],
  },
  {
    date: "Mar 12, 2026",
    tag: "improvement",
    title: "Tournament Hub - Cleaner Tab Navigation",
    desc: "Removed visual clutter from the Overview and Heroes tabs.",
    items: [
      "Stage switcher (Group Stage / Playoffs) is now hidden on the Overview and Heroes tabs, where switching stages has no effect on the content shown.",
      "Up Next and Standings snapshot removed from Overview - these live on their dedicated tabs.",
      "Overview now focuses on what matters most: the Live Now section showing currently running matches.",
      "Heroes tab: shows top 25 heroes by default with a 'Show all N heroes' button to expand. The API no longer caps at 25 - all drafted heroes are available.",
    ],
  },
  {
    date: "Mar 12, 2026",
    tag: "fix",
    title: "Tournament Hub - Heroes Table and Overview Polish",
    desc: "Two visual fixes to the Tournament Hub.",
    items: [
      "Heroes table: text no longer gets clipped on mobile. Switched to a fixed-width column layout so the table always fits without needing to scroll.",
      "Overview tab: format badge (e.g. Swiss - 5R) and tournament dates now appear at the top of the Overview tab, so there is always something useful to read even between rounds.",
      "Heroes tab: fixed \"No draft data yet\" showing for all stages. PandaScore does not expose picks_bans on any accessible endpoint. The Heroes tab now fetches draft data from the OpenDota API instead, using league name matching to find the right league and then fetching full match records with picks_bans included.",
    ],
  },
  {
    date: "Mar 12, 2026",
    tag: "improvement",
    title: "Tournament Hub - Improved Overview Tab",
    desc: "The Overview tab for ongoing tournaments now shows genuinely useful at-a-glance info instead of duplicating the stage picker.",
    items: [
      "Progress row shows the tournament format, current round (e.g. Round 3 of 5 for Swiss), and team count.",
      "Live Now section lists all currently running matches with a pulsing red dot indicator.",
      "Up Next section shows the next 3 scheduled non-TBD matches with times.",
      "Standings snapshot shows the top 6 teams with green/red zone bars indicating advancing vs eliminated positions.",
      "All sections update automatically when switching stages via the stage picker.",
    ],
  },
  {
    date: "Mar 12, 2026",
    tag: "new",
    title: "Tournament Hub - Hero Pick/Ban Stats",
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
    date: "Mar 11, 2026",
    tag: "new",
    title: "Tournament Hub — Visual Bracket Tree",
    desc: "Playoff brackets now render as a left-to-right bracket tree instead of a flat match list.",
    items: [
      "Rounds are shown as columns with SVG connector lines flowing between matches.",
      "Double Elimination shows Upper Bracket and Lower Bracket as separate horizontal sections, with Grand Final below.",
      "Swiss and Group Stage formats still use the flat round-by-round view.",
      "Match cards show team names, scores, live pulse indicators, and TBD slots for upcoming matches.",
    ],
  },
  {
    date: "Mar 11, 2026",
    tag: "new",
    title: "Tournament Hub — Stage Switcher",
    desc: "When an event has multiple stages (e.g. Group Stage and Playoffs), a stage switcher now appears in the Tournament Hub so you can browse each stage independently.",
    items: [
      "Defaults to whichever stage is currently live, or the latest finished stage.",
      "Standings and bracket update to reflect the selected stage.",
      "Format badge (Swiss, Double Elimination) also updates per stage.",
      "A red dot on inactive stage pills marks the live stage.",
      "Each stage's data is fetched once and cached — switching between stages is instant.",
    ],
  },
  {
    date: "Mar 9, 2026",
    tag: "improvement",
    title: "VOD Linking — smarter stream resolution",
    desc: "The match drawer now shows only the correct VOD channel for matches that were live on a single stream, instead of showing multiple options and asking you to guess.",
    items: [
      "While a match is live, the streaming channel is recorded in a fast key-value store keyed by game start time.",
      "When you open a completed match, the drawer looks up the recorded channel and searches only that one.",
      "Falls back to showing all available channels when a match was simulcast on multiple streams.",
    ],
  },
  {
    date: "Mar 9, 2026",
    tag: "fix",
    title: "AI Summary — Cleaner Draft Analysis",
    desc: "Fixed an issue where the AI summary would mix up draft data with game outcome data. Picks and bans are now isolated from game results before being sent to Claude, preventing hallucinated hero attributions.",
  },
  {
    date: "Mar 9, 2026",
    tag: "fix",
    title: "Series Grouping — Reliability Fixes",
    desc: "Fixed three edge cases that caused series to split incorrectly or show phantom results.",
    items: [
      "Series that span midnight no longer split into two separate series.",
      "Matches with no series ID (series_id=0) are now grouped individually instead of being merged.",
      "The last series is only dropped from display if it is genuinely incomplete — not just because it loaded last.",
    ],
  },
  {
    date: "Mar 8, 2026",
    tag: "improvement",
    title: "VOD Links — Exact Channel Matching",
    desc: "VOD links now resolve to the correct stream channel instead of showing multiple options when possible.",
    items: [
      "While a match is live, the broadcast channel is stored against each game's OpenDota match ID.",
      "When you open a completed match, the stored channel is looked up first and Twitch is searched on that channel only.",
      "Falls back to the existing multi-channel search when no mapping is found (e.g. for older matches).",
    ],
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
